import { sql } from 'drizzle-orm';
import { auditStatement, newId } from '@personal-os/db';
import {
  buildAdaptationDashboard,
  buildPerformancePeriods,
  compareAdaptationOutcome,
  expectedPeriodEnd,
  expectedPreviousPeriodEnd,
  localDateFor,
  validationError,
  conflict,
  notFound,
  type AdaptationDecisionAction,
  type AdaptationProposal,
} from '@personal-os/domain';
import {
  adaptationDashboardDtoSchema,
  adaptationDecisionRecordDtoSchema,
  adaptationHistoryItemDtoSchema,
  adaptationOutcomeDtoSchema,
  adaptationProposalDtoSchema,
  type AdaptationDashboardQuery,
  type AdaptationDecisionRequest,
  type AdaptationHistoryItemDto,
  type AdaptationHistoryQuery,
} from '@personal-os/shared';
import { compute, type DecisionContext } from '../decision/service';
import { envelope, type MutatingRequest } from '../goals/service';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';

export type AdaptationContext = DecisionContext;

interface AdaptationDecisionRow {
  id: string;
  proposal_id: string;
  action: 'accept' | 'reject' | 'defer';
  status: 'accepted' | 'rejected' | 'deferred';
  note: string | null;
  proposal_kind: string;
  proposal_title: string;
  severity: 'info' | 'attention' | 'risk' | 'critical';
  confidence: 'low' | 'medium' | 'high';
  period_from: string;
  period_to: string;
  algorithm_version: string;
  proposal_snapshot_json: string;
  version: number;
  created_at: string;
  updated_at: string;
}

function parseSnapshot(raw: string): ReturnType<typeof adaptationProposalDtoSchema.parse> | null {
  try {
    return adaptationProposalDtoSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function decisionRecord(row: AdaptationDecisionRow) {
  return adaptationDecisionRecordDtoSchema.parse({
    proposalId: row.proposal_id,
    action: row.action,
    note: row.note,
    decidedAt: row.updated_at,
    actor: 'user',
    version: row.version,
  });
}

async function buildDashboard(ctx: AdaptationContext, query: AdaptationDashboardQuery) {
  const comparison = query.comparison ?? 'month';
  const computation = await compute(ctx, {
    comparison,
    ...(query.from === undefined || query.to === undefined
      ? {}
      : { from: query.from, to: query.to }),
  });
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(nowMs)) throw validationError('Instante da requisição inválido.');
  const today = localDateFor(nowMs, ctx.timezone);
  const explicit = query.from && query.to ? { from: query.from, to: query.to } : undefined;
  const naturalComparison = comparison === 'custom' ? 'month' : comparison;
  const periods = buildPerformancePeriods({
    today,
    comparison,
    explicit,
    ...(explicit === undefined
      ? {
          currentExpectedEnd: expectedPeriodEnd(today, naturalComparison),
          previousExpectedEnd: expectedPreviousPeriodEnd(today, naturalComparison),
        }
      : {}),
  });

  const dashboard = buildAdaptationDashboard({
    today,
    comparison,
    explicitPeriod: explicit,
    periods,
    alerts: computation.alerts,
    recommendations: computation.recommendations,
    nextAction: computation.nextAction,
    review: null,
    sufficiency: computation.sufficiency,
    comparisons: computation.comparisons,
    facts: computation.facts,
  });

  const ids = dashboard.proposals.map((p) => p.id);
  const rows = ids.length
    ? ((await ctx.db.all(sql`
        SELECT proposal_id, action, status, version
        FROM adaptation_decisions
        WHERE proposal_id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})
      `)) as Array<{ proposal_id: string; action: string; status: string; version: number }>)
    : [];
  const byId = new Map(rows.map((r) => [r.proposal_id, r]));
  const proposals = dashboard.proposals.map((p) => {
    const row = byId.get(p.id);
    if (!row) return p;
    return { ...p, status: row.status as AdaptationProposal['status'] };
  });
  return adaptationDashboardDtoSchema.parse({ ...dashboard, proposals });
}

export async function getAdaptationDashboard(
  ctx: AdaptationContext,
  query: AdaptationDashboardQuery,
) {
  return buildDashboard(ctx, query);
}

export async function getAdaptationProposals(
  ctx: AdaptationContext,
  query: AdaptationDashboardQuery,
) {
  const dashboard = await buildDashboard(ctx, query);
  return dashboard.proposals.map((p) => adaptationProposalDtoSchema.parse(p));
}

export async function getAdaptationScenarios(
  ctx: AdaptationContext,
  query: AdaptationDashboardQuery,
) {
  const dashboard = await buildDashboard(ctx, query);
  return dashboard.proposals.flatMap((p) =>
    p.simulations.map((s) => ({
      proposalId: p.id,
      proposalTitle: p.title,
      ...s,
    })),
  );
}

function mutationContext(ctx: AdaptationContext, request: MutatingRequest) {
  return {
    db: ctx.db,
    subject: ctx.subject,
    method: request.method,
    path: request.path,
    query: request.query,
    clientKey: request.clientKey,
    rawBody: request.rawBody,
    now: ctx.now,
  };
}

function auditDecision(
  ctx: AdaptationContext,
  opId: string,
  id: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
) {
  return auditStatement({
    entityType: 'adaptation_decision',
    entityId: id,
    action: before === null ? 'create' : 'update',
    actorType: 'user',
    actorId: ctx.subject,
    beforeJson: before === null ? null : JSON.stringify(before),
    afterJson: JSON.stringify(after),
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
  });
}

export async function recordAdaptationDecision(
  ctx: AdaptationContext,
  request: MutatingRequest,
  input: AdaptationDecisionRequest,
): Promise<IdempotentResult> {
  const query: AdaptationDashboardQuery = {
    comparison: input.comparison ?? 'month',
    ...(input.from && input.to ? { from: input.from, to: input.to } : {}),
  };
  let proposal = (await buildDashboard(ctx, query)).proposals.find(
    (p) => p.id === input.proposalId,
  );
  if (!proposal) {
    for (const comparison of ['week', 'month', 'quarter'] as const) {
      const found = (await buildDashboard(ctx, { comparison })).proposals.find(
        (p) => p.id === input.proposalId,
      );
      if (found) {
        proposal = found;
        break;
      }
    }
  }
  if (!proposal) throw notFound('Proposta de adaptação não encontrada.');

  const currentRows = (await ctx.db.all(sql`
    SELECT id, proposal_id, action, status, note, proposal_kind, proposal_title, severity,
           confidence, period_from, period_to, algorithm_version, proposal_snapshot_json,
           version, created_at, updated_at
    FROM adaptation_decisions
    WHERE proposal_id = ${input.proposalId}
    LIMIT 1
  `)) as AdaptationDecisionRow[];
  const current = currentRows[0];

  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: () => {
        if (current !== undefined && current.version !== input.version) {
          throw conflict('A decisão de adaptação foi alterada desde a última leitura.');
        }
        if (current === undefined && input.version !== 1) {
          throw conflict('Versão informada não corresponde a um registro novo.');
        }
      },
    },
    ({ opId, now }) => {
      const action = input.action as AdaptationDecisionAction;
      const status =
        action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'deferred';
      const note = input.note?.trim() ? input.note.trim().slice(0, 1000) : null;
      const snapshotJson = JSON.stringify(adaptationProposalDtoSchema.parse(proposal));
      if (current === undefined) {
        const id = newId();
        const version = 1;
        const record = adaptationDecisionRecordDtoSchema.parse({
          proposalId: input.proposalId,
          action,
          note,
          decidedAt: now,
          actor: 'user',
          version,
        });
        const after = { proposalId: input.proposalId, action, status, version };
        return {
          status: 201 as const,
          bodyJson: envelope(ctx.requestId, record),
          statements: [
            sql`INSERT INTO adaptation_decisions
              (id, proposal_id, action, status, note, proposal_kind, proposal_title, severity, confidence,
               period_from, period_to, algorithm_version, proposal_snapshot_json, version, source_id,
               created_operation_id, created_at, updated_at)
              VALUES (${id}, ${input.proposalId}, ${action}, ${status}, ${note}, ${proposal.kind},
                ${proposal.title.slice(0, 160)}, ${proposal.severity}, ${proposal.confidence},
                ${proposal.period.from}, ${proposal.period.to}, ${proposal.algorithmVersion},
                ${snapshotJson}, ${version}, 'src_manual', ${opId}, ${now}, ${now})`,
            auditDecision(ctx, opId, id, null, after),
          ],
        };
      }

      const version = current.version + 1;
      const record = adaptationDecisionRecordDtoSchema.parse({
        proposalId: input.proposalId,
        action,
        note,
        decidedAt: now,
        actor: 'user',
        version,
      });
      const before = {
        proposalId: current.proposal_id,
        action: current.action,
        status: current.status,
        version: current.version,
      };
      const after = { proposalId: input.proposalId, action, status, version };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, record),
        statements: [
          sql`UPDATE adaptation_decisions SET
            action = ${action}, status = ${status}, note = ${note}, proposal_kind = ${proposal.kind},
            proposal_title = ${proposal.title.slice(0, 160)}, severity = ${proposal.severity},
            confidence = ${proposal.confidence}, period_from = ${proposal.period.from},
            period_to = ${proposal.period.to}, algorithm_version = ${proposal.algorithmVersion},
            proposal_snapshot_json = ${snapshotJson}, version = ${version},
            updated_operation_id = ${opId}, updated_at = ${now}
            WHERE id = ${current.id} AND version = ${current.version}`,
          auditDecision(ctx, opId, current.id, before, after),
        ],
      };
    },
  );
}

function encodeCursor(updatedAt: string, id: string): string {
  const json = JSON.stringify({ updatedAt, id });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(cursor: string | undefined): { updatedAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.updatedAt !== 'string' || typeof parsed.id !== 'string') return null;
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    return null;
  }
}

function outcomeFor(
  row: AdaptationDecisionRow,
  dashboard: ReturnType<typeof adaptationDashboardDtoSchema.parse>,
): AdaptationHistoryItemDto['outcome'] {
  const baselinePeriod = { from: row.period_from, to: row.period_to };
  const followUpPeriod = dashboard.periods.current;
  // Use a conservative, explainable metric by proposal kind.
  const metric =
    row.proposal_kind === 'execution'
      ? {
          label: 'Tarefas atrasadas',
          value:
            dashboard.proposals.length >= 0
              ? Number(
                  dashboard.deviations
                    .find((d) => d.kind === 'execution_pressure')
                    ?.observed.match(/Atrasadas: (\d+)/)?.[1] ?? NaN,
                )
              : NaN,
          source: 'execution.facts',
          higherIsBetter: false,
        }
      : null;
  // We don't have stored baseline metric; report insufficient_data honestly.
  const comparison = compareAdaptationOutcome({
    proposalId: row.proposal_id,
    decisionAction: row.action,
    decidedAt: row.updated_at,
    baselinePeriod,
    followUpPeriod,
    baselineMetric: null,
    followUpMetric: Number.isFinite(metric?.value ?? NaN) ? (metric?.value as number) : null,
    metricLabel: metric?.label ?? 'Métrica de acompanhamento',
    source: metric?.source ?? 'adaptation.history',
    higherIsBetter: metric?.higherIsBetter ?? true,
  });
  return adaptationOutcomeDtoSchema.parse(comparison);
}

export async function getAdaptationHistory(
  ctx: AdaptationContext,
  query: AdaptationHistoryQuery,
): Promise<{ items: AdaptationHistoryItemDto[]; nextCursor?: string; hasMore: boolean }> {
  const limit = Math.min(200, Math.max(1, query.limit ?? 20));
  const cursor = decodeCursor(query.cursor);
  if (query.cursor && !cursor) throw validationError('Cursor inválido.');

  const rows = cursor
    ? ((await ctx.db.all(sql`
        SELECT id, proposal_id, action, status, note, proposal_kind, proposal_title, severity,
               confidence, period_from, period_to, algorithm_version, proposal_snapshot_json,
               version, created_at, updated_at
        FROM adaptation_decisions
        WHERE (updated_at < ${cursor.updatedAt} OR (updated_at = ${cursor.updatedAt} AND id < ${cursor.id}))
        ORDER BY updated_at DESC, id DESC
        LIMIT ${limit + 1}
      `)) as AdaptationDecisionRow[])
    : ((await ctx.db.all(sql`
        SELECT id, proposal_id, action, status, note, proposal_kind, proposal_title, severity,
               confidence, period_from, period_to, algorithm_version, proposal_snapshot_json,
               version, created_at, updated_at
        FROM adaptation_decisions
        ORDER BY updated_at DESC, id DESC
        LIMIT ${limit + 1}
      `)) as AdaptationDecisionRow[]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const dashboard = await buildDashboard(ctx, {});
  const items = page.map((row) => {
    const proposal = parseSnapshot(row.proposal_snapshot_json);
    return adaptationHistoryItemDtoSchema.parse({
      decision: decisionRecord(row),
      proposal,
      outcome: proposal ? outcomeFor(row, dashboard) : null,
    });
  });
  const last = page[page.length - 1];
  return {
    items,
    ...(hasMore && last ? { nextCursor: encodeCursor(last.updated_at, last.id) } : {}),
    hasMore,
  };
}
