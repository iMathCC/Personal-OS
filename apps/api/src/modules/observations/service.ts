import {
  assertObservationKind,
  assertObservationRange,
  assertObservationSemantics,
  buildObservationSummary,
  decodeCursor,
  encodeEvidenceJson,
  makeCursor,
  notFound,
  observationLocalDate,
  parseEvidenceJson,
  validationError,
  conflict,
  DEFAULT_OBSERVATION_PAGE_SIZE,
  MAX_OBSERVATION_PAGE_SIZE,
  OBSERVATION_SUMMARY_ALGORITHM,
  type PersonalObservationKind,
  type PersonalObservationStatus,
} from '@personal-os/domain';
import {
  auditStatement,
  findPersonalObservationById,
  insertPersonalObservationStatement,
  listObservationSummaryRows,
  listPersonalObservationRows,
  newId,
  supersedePersonalObservationStatement,
  type Database,
  type PersonalObservationRow,
} from '@personal-os/db';
import type {
  CorrectPersonalObservationRequest,
  CreatePersonalObservationRequest,
  ListPersonalObservationsQuery,
  ObservationSummaryDto,
  ObservationSummaryQuery,
  PersonalObservationDto,
} from '@personal-os/shared';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';

const MANUAL_SOURCE_ID = 'src_manual';

export interface ObservationsContext {
  db: Database;
  requestId: string;
  ipHash: string | null;
  subject: string;
  now: string;
  timezone: string;
}

export interface MutatingRequest {
  clientKey: string;
  method: string;
  path: string;
  query: string;
  rawBody: string;
}

function envelope<T>(requestId: string, data: T): string {
  return JSON.stringify({ data, meta: { requestId } });
}

function mutationContext(ctx: ObservationsContext, request: MutatingRequest) {
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

function parseCursor(cursor: string | undefined): { sortValue: string; id: string } | undefined {
  if (cursor === undefined) return undefined;
  const decoded = decodeCursor(cursor);
  const separator = decoded.indexOf('\u0000');
  if (separator < 0) throw validationError('Cursor inválido.');
  return { sortValue: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
}

function toDto(row: PersonalObservationRow): PersonalObservationDto {
  return {
    id: row.id,
    areaId: row.areaId,
    kind: row.kind as PersonalObservationKind,
    title: row.title,
    content: row.content,
    observedAt: row.observedAt,
    localDate: row.localDate,
    timezone: row.timezone,
    valueNum: row.valueNum,
    valueText: row.valueText,
    unit: row.unit,
    sourceId: row.sourceId,
    confidence: row.confidence,
    algorithmVersion: row.algorithmVersion,
    evidence: parseEvidenceJson(row.evidenceJson),
    relatedTaskId: row.relatedTaskId,
    relatedProjectId: row.relatedProjectId,
    relatedGoalId: row.relatedGoalId,
    relatedStudySessionId: row.relatedStudySessionId,
    relatedCourseId: row.relatedCourseId,
    status: row.status as PersonalObservationStatus,
    supersededBy: row.supersededBy,
    correctsId: row.correctsId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function snapshot(row: PersonalObservationRow | PersonalObservationDto) {
  const dto =
    'evidenceJson' in row ? toDto(row as PersonalObservationRow) : (row as PersonalObservationDto);
  return dto;
}

export async function createObservation(
  ctx: ObservationsContext,
  request: MutatingRequest,
  input: CreatePersonalObservationRequest,
): Promise<IdempotentResult> {
  const kind = assertObservationKind(input.kind);
  const localDate = observationLocalDate(input.observedAt, input.timezone);
  assertObservationSemantics({
    kind,
    confidence: input.confidence ?? null,
    sourceId: MANUAL_SOURCE_ID,
    algorithmVersion: null,
  });
  const evidenceJson = encodeEvidenceJson(input.evidence);

  return executeIdempotent(mutationContext(ctx, request), ({ opId, now }) => {
    const id = newId();
    const dto: PersonalObservationDto = {
      id,
      areaId: input.areaId ?? null,
      kind,
      title: input.title.trim(),
      content: input.content ?? null,
      observedAt: input.observedAt,
      localDate,
      timezone: input.timezone,
      valueNum: input.valueNum ?? null,
      valueText: input.valueText ?? null,
      unit: input.unit ?? null,
      sourceId: MANUAL_SOURCE_ID,
      confidence: input.confidence ?? null,
      algorithmVersion: null,
      evidence: input.evidence ?? [],
      relatedTaskId: input.relatedTaskId ?? null,
      relatedProjectId: input.relatedProjectId ?? null,
      relatedGoalId: input.relatedGoalId ?? null,
      relatedStudySessionId: input.relatedStudySessionId ?? null,
      relatedCourseId: input.relatedCourseId ?? null,
      status: 'active',
      supersededBy: null,
      correctsId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    return {
      status: 201,
      bodyJson: envelope(ctx.requestId, dto),
      statements: [
        insertPersonalObservationStatement({
          id,
          areaId: dto.areaId,
          kind: dto.kind,
          title: dto.title,
          content: dto.content,
          observedAt: dto.observedAt,
          localDate: dto.localDate,
          timezone: dto.timezone,
          valueNum: dto.valueNum,
          valueText: dto.valueText,
          unit: dto.unit,
          sourceId: dto.sourceId,
          confidence: dto.confidence,
          algorithmVersion: dto.algorithmVersion,
          evidenceJson,
          relatedTaskId: dto.relatedTaskId,
          relatedProjectId: dto.relatedProjectId,
          relatedGoalId: dto.relatedGoalId,
          relatedStudySessionId: dto.relatedStudySessionId,
          relatedCourseId: dto.relatedCourseId,
          status: 'active',
          correctsId: null,
          opId,
          now,
        }),
        auditStatement({
          entityType: 'personal_observation',
          entityId: id,
          action: 'create',
          actorType: 'user',
          actorId: ctx.subject,
          afterJson: JSON.stringify(dto),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
      ],
    };
  });
}

export async function listObservations(
  ctx: ObservationsContext,
  query: ListPersonalObservationsQuery,
) {
  const limit = Math.min(query.limit ?? DEFAULT_OBSERVATION_PAGE_SIZE, MAX_OBSERVATION_PAGE_SIZE);
  const cursor = parseCursor(query.cursor);
  const rows = await listPersonalObservationRows(ctx.db, {
    from: query.from,
    to: query.to,
    kind: query.kind,
    areaId: query.areaId,
    status: query.status,
    relatedTaskId: query.relatedTaskId,
    relatedProjectId: query.relatedProjectId,
    relatedGoalId: query.relatedGoalId,
    relatedStudySessionId: query.relatedStudySessionId,
    cursor,
    limit,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor = hasMore && last ? makeCursor(last.observedAt, last.id) : undefined;
  return {
    items: page.map(toDto),
    nextCursor,
    hasMore,
    truncated: false,
  };
}

export async function getObservation(
  ctx: ObservationsContext,
  id: string,
): Promise<PersonalObservationDto> {
  const row = await findPersonalObservationById(ctx.db, id);
  if (row === undefined || row.deletedAt !== null) throw notFound('Observação não encontrada.');
  return toDto(row);
}

export async function correctObservation(
  ctx: ObservationsContext,
  request: MutatingRequest,
  id: string,
  input: CorrectPersonalObservationRequest,
  ifMatchVersion: number | undefined,
): Promise<IdempotentResult> {
  const original = await findPersonalObservationById(ctx.db, id);
  if (original === undefined || original.deletedAt !== null)
    throw notFound('Observação não encontrada.');
  if (original.supersededBy !== null) throw conflict('Observação já foi corrigida.');
  if (original.status !== 'active')
    throw conflict('Apenas observações ativas podem ser corrigidas.');
  const expectedVersion = ifMatchVersion ?? original.version;
  if (original.version !== expectedVersion)
    throw conflict('Versão da observação divergente; recarregue e tente novamente.');

  const nextKind = assertObservationKind(input.kind ?? original.kind);
  const nextObservedAt = input.observedAt ?? original.observedAt;
  const nextTimezone = input.timezone ?? original.timezone;
  const nextLocalDate = observationLocalDate(nextObservedAt, nextTimezone);
  const nextConfidence = input.confidence !== undefined ? input.confidence : original.confidence;
  assertObservationSemantics({
    kind: nextKind,
    confidence: nextConfidence,
    sourceId: MANUAL_SOURCE_ID,
    algorithmVersion: null,
  });
  const nextEvidence =
    input.evidence !== undefined ? input.evidence : parseEvidenceJson(original.evidenceJson);
  const evidenceJson = encodeEvidenceJson(nextEvidence);

  return executeIdempotent(mutationContext(ctx, request), ({ opId, now }) => {
    const replacementId = newId();
    const replacement: PersonalObservationDto = {
      id: replacementId,
      areaId: input.areaId !== undefined ? input.areaId : original.areaId,
      kind: nextKind,
      title: (input.title ?? original.title).trim(),
      content: input.content !== undefined ? input.content : original.content,
      observedAt: nextObservedAt,
      localDate: nextLocalDate,
      timezone: nextTimezone,
      valueNum: input.valueNum !== undefined ? input.valueNum : original.valueNum,
      valueText: input.valueText !== undefined ? input.valueText : original.valueText,
      unit: input.unit !== undefined ? input.unit : original.unit,
      sourceId: MANUAL_SOURCE_ID,
      confidence: nextConfidence,
      algorithmVersion: null,
      evidence: nextEvidence,
      relatedTaskId:
        input.relatedTaskId !== undefined ? input.relatedTaskId : original.relatedTaskId,
      relatedProjectId:
        input.relatedProjectId !== undefined ? input.relatedProjectId : original.relatedProjectId,
      relatedGoalId:
        input.relatedGoalId !== undefined ? input.relatedGoalId : original.relatedGoalId,
      relatedStudySessionId:
        input.relatedStudySessionId !== undefined
          ? input.relatedStudySessionId
          : original.relatedStudySessionId,
      relatedCourseId:
        input.relatedCourseId !== undefined ? input.relatedCourseId : original.relatedCourseId,
      status: 'active',
      supersededBy: null,
      correctsId: original.id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const before = snapshot(original);

    return {
      status: 200,
      bodyJson: envelope(ctx.requestId, replacement),
      statements: [
        insertPersonalObservationStatement({
          id: replacementId,
          areaId: replacement.areaId,
          kind: replacement.kind,
          title: replacement.title,
          content: replacement.content,
          observedAt: replacement.observedAt,
          localDate: replacement.localDate,
          timezone: replacement.timezone,
          valueNum: replacement.valueNum,
          valueText: replacement.valueText,
          unit: replacement.unit,
          sourceId: replacement.sourceId,
          confidence: replacement.confidence,
          algorithmVersion: replacement.algorithmVersion,
          evidenceJson,
          relatedTaskId: replacement.relatedTaskId,
          relatedProjectId: replacement.relatedProjectId,
          relatedGoalId: replacement.relatedGoalId,
          relatedStudySessionId: replacement.relatedStudySessionId,
          relatedCourseId: replacement.relatedCourseId,
          status: 'active',
          correctsId: original.id,
          opId,
          now,
        }),
        supersedePersonalObservationStatement({
          id: original.id,
          replacementId,
          expectedVersion,
          opId,
          now,
        }),
        auditStatement({
          entityType: 'personal_observation',
          entityId: original.id,
          action: 'update',
          actorType: 'user',
          actorId: ctx.subject,
          beforeJson: JSON.stringify(before),
          afterJson: JSON.stringify({
            ...before,
            status: 'superseded',
            supersededBy: replacementId,
          }),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
        auditStatement({
          entityType: 'personal_observation',
          entityId: replacementId,
          action: 'create',
          actorType: 'user',
          actorId: ctx.subject,
          afterJson: JSON.stringify(replacement),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
      ],
    };
  });
}

export async function getObservationSummary(
  ctx: ObservationsContext,
  query: ObservationSummaryQuery,
): Promise<ObservationSummaryDto> {
  const range = assertObservationRange(query.from, query.to);
  const rows = await listObservationSummaryRows(ctx.db, range.from, range.to, query.areaId);
  const summary = buildObservationSummary(
    rows.map((r) => ({
      id: r.id,
      localDate: r.localDate,
      kind: r.kind as PersonalObservationKind,
      areaId: r.areaId,
      areaKey: r.areaKey,
      areaName: r.areaName,
    })),
    range,
  );
  // Ensure algorithm version is explicit in output
  return { ...summary, algorithmVersion: OBSERVATION_SUMMARY_ALGORITHM };
}
