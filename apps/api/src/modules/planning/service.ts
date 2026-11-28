import { eq, sql, type SQL } from 'drizzle-orm';
import {
  auditStatement,
  lifeVisionVersions,
  newId,
  planningCycleReviews,
  planningCycles,
  planningScenarios,
  strategicAreaProfiles,
  strategicGoals,
  type Database,
} from '@personal-os/db';
import {
  analyzeTradeoffs,
  assertCyclePeriod,
  assertCycleTransition,
  buildQuarterlyReviewSnapshot,
  calculateCapacity,
  compareScenarios,
  cyclesOverlap,
  DEFAULT_PLANNING_WEIGHTS,
  localDateFor,
  notFound,
  PLANNING_ALGORITHMS,
  prioritizeItems,
  SCENARIO_LIMITATIONS,
  shiftLocalDate,
  simulateScenario,
  validationError,
  conflict,
  weekStartFor,
  type CapacityCommitment,
  type CapacityInput,
  type CycleStatus,
  type PrioritizationItem,
  type ScenarioBase,
  type ScenarioChange,
  type ScenarioComparison,
  type SimulationResult,
} from '@personal-os/domain';
import {
  capacityProfileDtoSchema,
  capacityResultDtoSchema,
  lifeVisionDtoSchema,
  planningCycleDtoSchema,
  prioritizationDtoSchema,
  quarterlyReviewDtoSchema,
  scenarioDtoSchema,
  simulationResultDtoSchema,
  strategicAreaDtoSchema,
  strategicGoalDtoSchema,
  strategyDashboardDtoSchema,
  type CapacityProfileDto,
  type CapacityQuery,
  type CreateCycleRequest,
  type CreateQuarterlyReviewRequest,
  type CreateScenarioRequest,
  type CreateStrategicAreaRequest,
  type CreateStrategicGoalRequest,
  type CreateVisionRequest,
  type CycleTransitionRequest,
  type LifeVisionDto,
  type PlanningCycleDto,
  type PrioritizationDto,
  type PrioritizationQuery,
  type QuarterlyReflectionDto,
  type QuarterlyReviewDto,
  type SaveCapacityProfileRequest,
  type ScenarioChangeDto,
  type ScenarioDto,
  type SimulateRequest,
  type StrategicAreaDto,
  type StrategicGoalDto,
  type StrategyDashboardDto,
  type UpdateCycleRequest,
  type UpdateQuarterlyReviewRequest,
  type UpdateStrategicAreaRequest,
  type UpdateStrategicGoalRequest,
  type UpdateVisionRequest,
} from '@personal-os/shared';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';
import { envelope, type MutatingRequest } from '../goals/service';
import { dashboardFromDataset } from '../intelligence/service';
import { loadPlanningDashboardSnapshot } from './dashboard-snapshot';

const MANUAL_SOURCE_ID = 'src_manual';
const READ_LIMIT = 200;
const TASK_LIMIT = 2_000;
const MAX_SNAPSHOT_CHARS = 200_000;

export interface PlanningContext {
  db: Database;
  requestId: string;
  subject: string;
  ipHash: string | null;
  now: string;
  timezone: string;
}

function todayFor(ctx: PlanningContext): string {
  const ms = Date.parse(ctx.now);
  if (Number.isNaN(ms)) throw validationError('Instante da requisição inválido.');
  return localDateFor(ms, ctx.timezone);
}

function parseArray(value: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Conteúdo inválido no banco é tratado como vazio, sem expor o erro cru.
  }
  return {};
}

function stringList(value: string): string[] {
  return parseArray(value).filter((item): item is string => typeof item === 'string');
}

function reflectionList(value: string): QuarterlyReflectionDto {
  const object = parseObject(value);
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(object)) {
    if (typeof entry === 'string') output[key] = entry;
  }
  return output as QuarterlyReflectionDto;
}

function mutationContext(ctx: PlanningContext, request: MutatingRequest) {
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

function assertVersion(expected: number | undefined, actual: number, message: string): void {
  if (expected === undefined || expected !== actual) throw conflict(message);
}

type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'setup'
  | 'recovery'
  | 'passkey_add'
  | 'session_revoke';

function audit(
  entityType: string,
  entityId: string,
  action: AuditAction,
  ctx: PlanningContext,
  after: unknown,
  before?: unknown,
) {
  return auditStatement(
    {
      entityType,
      entityId,
      action,
      actorType: 'user',
      actorId: ctx.subject,
      ...(before === undefined ? {} : { beforeJson: JSON.stringify(before) }),
      afterJson: JSON.stringify(after),
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    },
    before !== undefined,
  );
}

/* ------------------------------------------------------------------ Visão */

interface VisionRow {
  id: string;
  version: number;
  statement: string | null;
  horizonYears: number | null;
  principlesJson: string;
  outcomesJson: string;
  status: 'draft' | 'active' | 'superseded';
  changeNote: string | null;
  supersededBy: string | null;
  versionRow: number;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
}

const VISION_FIELDS = {
  id: lifeVisionVersions.id,
  version: lifeVisionVersions.version,
  statement: lifeVisionVersions.statement,
  horizonYears: lifeVisionVersions.horizonYears,
  principlesJson: lifeVisionVersions.principlesJson,
  outcomesJson: lifeVisionVersions.outcomesJson,
  status: lifeVisionVersions.status,
  changeNote: lifeVisionVersions.changeNote,
  supersededBy: lifeVisionVersions.supersededBy,
  versionRow: lifeVisionVersions.versionRow,
  sourceId: lifeVisionVersions.sourceId,
  createdAt: lifeVisionVersions.createdAt,
  updatedAt: lifeVisionVersions.updatedAt,
} as const;

function visionToDto(row: VisionRow): LifeVisionDto {
  return lifeVisionDtoSchema.parse({
    id: row.id,
    version: row.version,
    statement: row.statement,
    horizonYears: row.horizonYears,
    principles: stringList(row.principlesJson),
    desiredOutcomes: stringList(row.outcomesJson),
    status: row.status,
    sourceId: row.sourceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

async function findVisionById(db: Database, id: string): Promise<VisionRow | undefined> {
  const rows = await db
    .select(VISION_FIELDS)
    .from(lifeVisionVersions)
    .where(eq(lifeVisionVersions.id, id))
    .limit(1);
  return rows[0] as VisionRow | undefined;
}

async function activeVision(db: Database): Promise<VisionRow | undefined> {
  const rows = await db
    .select(VISION_FIELDS)
    .from(lifeVisionVersions)
    .where(eq(lifeVisionVersions.status, 'active'))
    .limit(1);
  return rows[0] as VisionRow | undefined;
}

export async function getVision(ctx: PlanningContext): Promise<LifeVisionDto | null> {
  const row = await activeVision(ctx.db);
  return row === undefined ? null : visionToDto(row);
}

export async function listVisionHistory(
  ctx: PlanningContext,
  limit: number,
): Promise<{ items: LifeVisionDto[]; truncated: boolean }> {
  const rows = (await ctx.db
    .select(VISION_FIELDS)
    .from(lifeVisionVersions)
    .orderBy(sql`${lifeVisionVersions.version} DESC, ${lifeVisionVersions.createdAt} DESC`)
    .limit(limit + 1)) as VisionRow[];
  return { items: rows.slice(0, limit).map(visionToDto), truncated: rows.length > limit };
}

function visionValues(input: CreateVisionRequest | UpdateVisionRequest) {
  return {
    statement: input.statement ?? null,
    horizonYears: input.horizonYears ?? null,
    principlesJson: JSON.stringify(input.principles ?? []),
    outcomesJson: JSON.stringify(input.desiredOutcomes ?? []),
  };
}

export async function createVision(
  ctx: PlanningContext,
  request: MutatingRequest,
  input: CreateVisionRequest,
): Promise<IdempotentResult> {
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if ((input.status ?? 'active') === 'active' && (await activeVision(ctx.db)) !== undefined) {
          throw conflict('Já existe visão ativa; atualize a visão para criar nova versão.');
        }
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const values = visionValues(input);
      const row: VisionRow = {
        id,
        version: 1,
        ...values,
        status: input.status ?? 'active',
        changeNote: null,
        supersededBy: null,
        versionRow: 1,
        sourceId: MANUAL_SOURCE_ID,
        createdAt: now,
        updatedAt: now,
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, visionToDto(row)),
        statements: [
          sql`INSERT INTO life_vision_versions
            (id, version, statement, horizon_years, principles_json, outcomes_json, status, source_id, version_row, created_operation_id, created_at, updated_at)
            VALUES (${id}, 1, ${row.statement}, ${row.horizonYears}, ${row.principlesJson}, ${row.outcomesJson},
              ${row.status}, ${MANUAL_SOURCE_ID}, 1, ${opId}, ${now}, ${now})`,
          audit('life_vision', id, 'create', ctx, { version: 1, status: row.status }),
        ],
      };
    },
  );
}

export async function updateVision(
  ctx: PlanningContext,
  request: MutatingRequest,
  id: string,
  input: UpdateVisionRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const current = await findVisionById(ctx.db, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const row = await findVisionById(ctx.db, id);
        if (row === undefined) throw notFound('Visão não encontrada.');
        assertVersion(expectedVersion, row.versionRow, 'Visão foi alterada por outra operação.');
        if (row.status === 'superseded') throw conflict('Versão da visão já foi substituída.');
        if (input.status === 'active') {
          const active = await activeVision(ctx.db);
          if (active !== undefined && active.id !== id) {
            throw conflict('Já existe outra visão ativa.');
          }
        }
      },
    },
    ({ opId, now }) => {
      if (current === undefined) throw notFound('Visão não encontrada.');
      const nextId = newId();
      const finalStatus = input.status ?? 'active';
      const values = visionValues({
        statement: input.statement === undefined ? current.statement : input.statement,
        horizonYears: input.horizonYears === undefined ? current.horizonYears : input.horizonYears,
        principles: input.principles ?? stringList(current.principlesJson),
        desiredOutcomes: input.desiredOutcomes ?? stringList(current.outcomesJson),
      });
      const next: VisionRow = {
        ...current,
        ...values,
        id: nextId,
        version: current.version + 1,
        status: finalStatus,
        changeNote: input.changeNote ?? null,
        supersededBy: null,
        versionRow: 1,
        sourceId: MANUAL_SOURCE_ID,
        createdAt: now,
        updatedAt: now,
      };
      // A ordem importa: a FK `superseded_by` exige a nova linha antes do UPDATE,
      // e o índice único de visão ativa exige que a antiga saia do estado ativo
      // antes da nova entrar. O batch mantém as duas etapas atômicas.
      const statements: SQL[] = [
        sql`INSERT INTO life_vision_versions
          (id, version, statement, horizon_years, principles_json, outcomes_json, status, change_note, source_id, version_row, created_operation_id, created_at, updated_at)
          VALUES (${nextId}, ${next.version}, ${next.statement}, ${next.horizonYears}, ${next.principlesJson},
            ${next.outcomesJson}, 'draft', ${next.changeNote}, ${MANUAL_SOURCE_ID}, 1, ${opId}, ${now}, ${now})`,
        sql`UPDATE life_vision_versions SET status = 'superseded', superseded_by = ${nextId}, updated_operation_id = ${opId}, updated_at = ${now} WHERE id = ${id} AND version_row = ${current.versionRow}`,
      ];
      if (finalStatus !== 'draft') {
        statements.push(
          sql`UPDATE life_vision_versions SET status = ${finalStatus}, updated_operation_id = ${opId}, updated_at = ${now} WHERE id = ${nextId}`,
        );
      }
      statements.push(
        audit(
          'life_vision',
          id,
          'update',
          ctx,
          { version: next.version, status: next.status },
          { version: current.version, status: current.status },
        ),
        audit('life_vision', nextId, 'create', ctx, {
          version: next.version,
          status: next.status,
        }),
      );
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, visionToDto(next)),
        statements,
      };
    },
  );
}

/* ------------------------------------------------------------ Áreas/objetivos */

interface AreaAggregateRow {
  areaId: string;
  key: string;
  name: string;
  description: string | null;
  importance: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  goalCount: number;
  activeGoalCount: number;
}

export async function listStrategicAreas(ctx: PlanningContext): Promise<StrategicAreaDto[]> {
  // Consulta explícita com aliases para manter colunas selecionadas e allowlist.
  const result = (await ctx.db.all(sql`
    SELECT p.area_id AS "areaId", a.key AS "key", a.name AS "name",
      p.description AS "description", p.importance AS "importance", p.status AS "status",
      p.version AS "version", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
      (SELECT COUNT(*) FROM goals g WHERE g.area_id = p.area_id AND g.deleted_at IS NULL) AS "goalCount",
      (SELECT COUNT(*) FROM goals g WHERE g.area_id = p.area_id AND g.deleted_at IS NULL AND g.status = 'active') AS "activeGoalCount"
    FROM strategic_area_profiles p
    INNER JOIN areas a ON a.id = p.area_id
    ORDER BY p.importance DESC, a.name ASC
    LIMIT ${READ_LIMIT}
  `)) as AreaAggregateRow[];
  return result.map((row) => strategicAreaDtoSchema.parse(row));
}

interface StrategicGoalJoinRow {
  id: string;
  goalId: string;
  visionId: string | null;
  horizon: 'short' | 'medium' | 'long';
  importance: number;
  reviewCadenceDays: number;
  title: string;
  status: string;
  priority: number;
  progressPercent: number | null;
  targetDate: string | null;
  areaId: string;
  resultsJson: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function strategicGoalToDto(row: StrategicGoalJoinRow): StrategicGoalDto {
  return strategicGoalDtoSchema.parse({
    goalId: row.goalId,
    visionId: row.visionId,
    areaId: row.areaId,
    horizon: row.horizon,
    importance: row.importance,
    reviewCadenceDays: row.reviewCadenceDays,
    results: stringList(row.resultsJson),
    title: row.title,
    declaredPriority: row.priority,
    goalStatus: row.status,
    progressPercent: row.progressPercent,
    targetDate: row.targetDate,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function listStrategicGoals(ctx: PlanningContext): Promise<StrategicGoalDto[]> {
  const rows = (await ctx.db.all(sql`
    SELECT s.id AS "id", s.goal_id AS "goalId", s.vision_id AS "visionId", s.horizon AS "horizon",
      s.importance AS "importance", s.review_cadence_days AS "reviewCadenceDays",
      s.results_json AS "resultsJson", s.version AS "version", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
      g.title AS "title", g.status AS "status", g.priority AS "priority",
      g.manual_progress AS "progressPercent", g.target_date AS "targetDate", g.area_id AS "areaId"
    FROM strategic_goals s
    INNER JOIN goals g ON g.id = s.goal_id
    WHERE g.deleted_at IS NULL
    ORDER BY s.importance DESC, g.priority DESC, g.title ASC
    LIMIT ${READ_LIMIT}
  `)) as StrategicGoalJoinRow[];
  return rows.map(strategicGoalToDto);
}

export async function createStrategicArea(
  ctx: PlanningContext,
  request: MutatingRequest,
  input: CreateStrategicAreaRequest,
): Promise<IdempotentResult> {
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const exists = await ctx.db
          .select({ id: strategicAreaProfiles.areaId })
          .from(strategicAreaProfiles)
          .where(eq(strategicAreaProfiles.areaId, input.areaId))
          .limit(1);
        if (exists.length > 0) throw conflict('Área estratégica já configurada.');
        const area = await ctx.db.all(
          sql`SELECT id FROM areas WHERE id = ${input.areaId} AND deleted_at IS NULL LIMIT 1`,
        );
        if (area.length === 0) throw notFound('Área da vida não encontrada.');
      },
    },
    ({ opId, now }) => {
      const values = {
        areaId: input.areaId,
        description: input.description ?? null,
        importance: input.importance ?? 3,
        status: 'active',
        sourceId: MANUAL_SOURCE_ID,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, {
          areaId: values.areaId,
          description: values.description,
          importance: values.importance,
          status: values.status,
          version: values.version,
        }),
        statements: [
          sql`INSERT INTO strategic_area_profiles
            (area_id, description, importance, status, source_id, version, created_operation_id, created_at, updated_at)
            VALUES (${values.areaId}, ${values.description}, ${values.importance}, 'active', ${MANUAL_SOURCE_ID}, 1, ${opId}, ${now}, ${now})`,
          audit('strategic_area', values.areaId, 'create', ctx, {
            importance: values.importance,
            status: 'active',
          }),
        ],
      };
    },
  );
}

export async function updateStrategicArea(
  ctx: PlanningContext,
  request: MutatingRequest,
  areaId: string,
  input: UpdateStrategicAreaRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const current = (
    await ctx.db
      .select()
      .from(strategicAreaProfiles)
      .where(eq(strategicAreaProfiles.areaId, areaId))
      .limit(1)
  )[0];
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if (current === undefined) throw notFound('Área estratégica não encontrada.');
        assertVersion(expectedVersion, current.version, 'Área foi alterada por outra operação.');
      },
    },
    ({ opId, now }) => {
      if (current === undefined) throw notFound('Área estratégica não encontrada.');
      const after = {
        description: input.description === undefined ? current.description : input.description,
        importance: input.importance ?? current.importance,
        status: input.status ?? current.status,
        version: current.version + 1,
      };
      const dto = {
        areaId,
        description: after.description,
        importance: after.importance,
        status: after.status,
        version: after.version,
      };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, dto),
        statements: [
          sql`UPDATE strategic_area_profiles SET description = ${after.description}, importance = ${after.importance},
            status = ${after.status}, version = ${after.version}, updated_operation_id = ${opId}, updated_at = ${now}
            WHERE area_id = ${areaId} AND version = ${current.version}`,
          audit(
            'strategic_area',
            areaId,
            'update',
            ctx,
            {
              areaId,
              importance: after.importance,
              status: after.status,
              version: after.version,
            },
            {
              importance: current.importance,
              status: current.status,
            },
          ),
        ],
      };
    },
  );
}

interface GoalBaseRow {
  id: string;
  title: string;
  areaId: string;
  status: string;
  priority: number;
  targetDate: string | null;
  progressPercent: number | null;
}

async function findGoalBase(ctx: PlanningContext, id: string): Promise<GoalBaseRow | undefined> {
  const rows = (await ctx.db.all(sql`
    SELECT id, title, area_id AS "areaId", status, priority,
      target_date AS "targetDate", manual_progress AS "progressPercent"
    FROM goals WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
  `)) as GoalBaseRow[];
  return rows[0];
}

export async function createStrategicGoal(
  ctx: PlanningContext,
  request: MutatingRequest,
  input: CreateStrategicGoalRequest,
): Promise<IdempotentResult> {
  const goalBase = await findGoalBase(ctx, input.goalId);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if (goalBase === undefined) throw notFound('Objetivo não encontrado.');
        const existing = await ctx.db
          .select({ id: strategicGoals.id })
          .from(strategicGoals)
          .where(eq(strategicGoals.goalId, input.goalId))
          .limit(1);
        if (existing.length > 0) throw conflict('Objetivo já possui camada estratégica.');
        if (input.visionId !== undefined && input.visionId !== null) {
          await findVisionOr404(ctx, input.visionId);
        }
      },
    },
    ({ opId, now }) => {
      if (goalBase === undefined) throw notFound('Objetivo não encontrado.');
      const id = newId();
      const resultsJson = JSON.stringify(input.results ?? []);
      const row: StrategicGoalJoinRow = {
        id,
        goalId: input.goalId,
        visionId: input.visionId ?? null,
        horizon: input.horizon ?? 'medium',
        importance: input.importance ?? 3,
        reviewCadenceDays: input.reviewCadenceDays ?? 90,
        resultsJson,
        title: goalBase.title,
        status: goalBase.status,
        priority: goalBase.priority,
        progressPercent: goalBase.progressPercent,
        targetDate: goalBase.targetDate,
        areaId: goalBase.areaId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, strategicGoalToDto(row)),
        statements: [
          sql`INSERT INTO strategic_goals
            (id, goal_id, vision_id, horizon, importance, review_cadence_days, results_json, source_id, version, created_operation_id, created_at, updated_at)
            VALUES (${id}, ${input.goalId}, ${row.visionId}, ${row.horizon}, ${row.importance}, ${row.reviewCadenceDays},
              ${resultsJson}, ${MANUAL_SOURCE_ID}, 1, ${opId}, ${now}, ${now})`,
          audit('strategic_goal', id, 'create', ctx, {
            goalId: input.goalId,
            importance: row.importance,
          }),
        ],
      };
    },
  );
}

async function findVisionOr404(ctx: PlanningContext, id: string): Promise<void> {
  if ((await findVisionById(ctx.db, id)) === undefined) throw notFound('Visão não encontrada.');
}

export async function updateStrategicGoal(
  ctx: PlanningContext,
  request: MutatingRequest,
  id: string,
  input: UpdateStrategicGoalRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const current = (
    await ctx.db.select().from(strategicGoals).where(eq(strategicGoals.id, id)).limit(1)
  )[0];
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if (current === undefined) throw notFound('Objetivo estratégico não encontrado.');
        assertVersion(expectedVersion, current.version, 'Objetivo estratégico foi alterado.');
        if (input.visionId !== undefined && input.visionId !== null) {
          await findVisionOr404(ctx, input.visionId);
        }
      },
    },
    ({ opId, now }) => {
      if (current === undefined) throw notFound('Objetivo estratégico não encontrado.');
      const after = {
        visionId: input.visionId === undefined ? current.visionId : input.visionId,
        horizon: input.horizon ?? current.horizon,
        importance: input.importance ?? current.importance,
        reviewCadenceDays: input.reviewCadenceDays ?? current.reviewCadenceDays,
        resultsJson:
          input.results === undefined ? current.resultsJson : JSON.stringify(input.results),
        version: current.version + 1,
      };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, { id, ...after }),
        statements: [
          sql`UPDATE strategic_goals SET vision_id = ${after.visionId}, horizon = ${after.horizon}, importance = ${after.importance},
            review_cadence_days = ${after.reviewCadenceDays}, results_json = ${after.resultsJson},
            version = ${after.version}, updated_operation_id = ${opId}, updated_at = ${now}
            WHERE id = ${id} AND version = ${current.version}`,
          audit(
            'strategic_goal',
            id,
            'update',
            ctx,
            { importance: after.importance },
            { importance: current.importance },
          ),
        ],
      };
    },
  );
}

/* ------------------------------------------------------------------ Ciclos */

interface CycleJoinRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  theme: string | null;
  expectedResultsJson: string;
  priorityProjectsJson: string;
  successCriteriaJson: string;
  status: CycleStatus;
  sourceId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function cycleToDto(
  row: CycleJoinRow,
  objectives: PlanningCycleDto['objectives'],
  hasReview: boolean,
): PlanningCycleDto {
  return planningCycleDtoSchema.parse({
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    theme: row.theme,
    expectedResults: stringList(row.expectedResultsJson),
    priorityProjects: stringList(row.priorityProjectsJson),
    successCriteria: stringList(row.successCriteriaJson),
    status: row.status,
    objectives,
    hasReview,
    sourceId: row.sourceId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

const CYCLE_FIELDS = {
  id: planningCycles.id,
  name: planningCycles.name,
  startDate: planningCycles.startDate,
  endDate: planningCycles.endDate,
  theme: planningCycles.theme,
  expectedResultsJson: planningCycles.expectedResultsJson,
  priorityProjectsJson: planningCycles.priorityProjectsJson,
  successCriteriaJson: planningCycles.successCriteriaJson,
  status: planningCycles.status,
  sourceId: planningCycles.sourceId,
  version: planningCycles.version,
  createdAt: planningCycles.createdAt,
  updatedAt: planningCycles.updatedAt,
} as const;

async function findCycle(ctx: PlanningContext, id: string): Promise<CycleJoinRow | undefined> {
  const rows = await ctx.db
    .select(CYCLE_FIELDS)
    .from(planningCycles)
    .where(eq(planningCycles.id, id))
    .limit(1);
  return rows[0] as CycleJoinRow | undefined;
}

async function cycleOr404(ctx: PlanningContext, id: string): Promise<CycleJoinRow> {
  const row = await findCycle(ctx, id);
  if (row === undefined) throw notFound('Ciclo não encontrado.');
  return row;
}

async function objectivesFor(
  ctx: PlanningContext,
  cycleId: string,
): Promise<PlanningCycleDto['objectives']> {
  const rows = (await ctx.db.all(sql`
    SELECT o.goal_id AS "goalId", o.is_priority AS "isPriority", g.title AS "title",
      g.area_id AS "areaId", g.priority AS "declaredPriority"
    FROM planning_cycle_objectives o
    INNER JOIN goals g ON g.id = o.goal_id
    WHERE o.cycle_id = ${cycleId}
    ORDER BY o.is_priority DESC, g.title ASC
    LIMIT ${READ_LIMIT}
  `)) as PlanningCycleDto['objectives'];
  return rows;
}

async function cycleDto(ctx: PlanningContext, row: CycleJoinRow): Promise<PlanningCycleDto> {
  const [objectives, reviews] = await Promise.all([
    objectivesFor(ctx, row.id),
    ctx.db
      .select({ id: planningCycleReviews.id })
      .from(planningCycleReviews)
      .where(eq(planningCycleReviews.cycleId, row.id))
      .limit(1),
  ]);
  return cycleToDto(row, objectives, reviews.length > 0);
}

async function assertNoIncompatibleOverlap(
  ctx: PlanningContext,
  start: string,
  end: string,
  ignoreId?: string,
): Promise<void> {
  const rows = (await ctx.db
    .select(CYCLE_FIELDS)
    .from(planningCycles)
    .where(sql`${planningCycles.status} IN ('planned','active','paused')`)
    .limit(READ_LIMIT)) as CycleJoinRow[];
  for (const row of rows) {
    if (row.id === ignoreId) continue;
    if (
      cyclesOverlap(
        { startDate: row.startDate, endDate: row.endDate },
        { startDate: start, endDate: end },
      )
    ) {
      throw conflict(`O período sobrepõe o ciclo ativo "${row.name}".`);
    }
  }
}

async function assertGoalsExist(ctx: PlanningContext, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = (await ctx.db.all(sql`
    SELECT id FROM goals
    WHERE id IN (${sql.join(
      unique.map((id) => sql`${id}`),
      sql`, `,
    )}) AND deleted_at IS NULL
    LIMIT ${unique.length}
  `)) as { id: string }[];
  if (rows.length !== unique.length) throw notFound('Um dos objetivos selecionados não existe.');
}

/** Carrega os objetivos selecionados para devolver o DTO completo já na criação. */
async function objectivesForGoals(
  ctx: PlanningContext,
  goalIds: readonly string[],
  priorityGoalIds: readonly string[],
): Promise<PlanningCycleDto['objectives']> {
  const unique = [...new Set(goalIds)];
  if (unique.length === 0) return [];
  const rows = (await ctx.db.all(sql`
    SELECT id AS "goalId", title, area_id AS "areaId", priority AS "declaredPriority"
    FROM goals
    WHERE id IN (${sql.join(
      unique.map((id) => sql`${id}`),
      sql`, `,
    )}) AND deleted_at IS NULL
    ORDER BY title ASC
    LIMIT ${unique.length}
  `)) as Omit<PlanningCycleDto['objectives'][number], 'isPriority'>[];
  if (rows.length !== unique.length) throw notFound('Um dos objetivos selecionados não existe.');
  const priorityIds = new Set(priorityGoalIds);
  return rows
    .map((row) => ({ ...row, isPriority: priorityIds.has(row.goalId) }))
    .sort((a, b) => Number(b.isPriority) - Number(a.isPriority) || a.title.localeCompare(b.title));
}

function assertPrioritySubset(
  goalIds: readonly string[],
  priorityGoalIds: readonly string[],
): void {
  const selected = new Set(goalIds);
  if (priorityGoalIds.some((id) => !selected.has(id))) {
    throw validationError('Metas prioritárias devem estar entre os objetivos do ciclo.');
  }
}

async function assertProjectsExist(ctx: PlanningContext, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = (await ctx.db.all(sql`
    SELECT id FROM projects
    WHERE id IN (${sql.join(
      unique.map((id) => sql`${id}`),
      sql`, `,
    )}) AND deleted_at IS NULL
    LIMIT ${unique.length}
  `)) as { id: string }[];
  if (rows.length !== unique.length) throw notFound('Um dos projetos prioritários não existe.');
}

export async function listCycles(
  ctx: PlanningContext,
  status?: CycleStatus,
): Promise<PlanningCycleDto[]> {
  const rows = (await ctx.db
    .select(CYCLE_FIELDS)
    .from(planningCycles)
    .where(status === undefined ? undefined : eq(planningCycles.status, status))
    .orderBy(sql`${planningCycles.startDate} DESC`)
    .limit(READ_LIMIT)) as CycleJoinRow[];
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const idList = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const objectiveRows = (await ctx.db.all(sql`
    SELECT o.cycle_id AS "cycleId", o.goal_id AS "goalId", o.is_priority AS "isPriority",
      g.title AS "title", g.area_id AS "areaId", g.priority AS "declaredPriority"
    FROM planning_cycle_objectives o
    INNER JOIN goals g ON g.id = o.goal_id
    WHERE o.cycle_id IN (${idList})
    ORDER BY o.cycle_id ASC, o.is_priority DESC, g.title ASC
    LIMIT ${READ_LIMIT * ids.length}
  `)) as (Omit<PlanningCycleDto['objectives'][number], 'isPriority'> & {
    cycleId: string;
    isPriority: number;
  })[];
  const reviewRows = (await ctx.db
    .select({ cycleId: planningCycleReviews.cycleId })
    .from(planningCycleReviews)
    .where(sql`${planningCycleReviews.cycleId} IN (${idList})`)) as { cycleId: string }[];
  const objectivesByCycle = new Map<string, PlanningCycleDto['objectives']>();
  for (const row of objectiveRows) {
    const objectives = objectivesByCycle.get(row.cycleId) ?? [];
    objectives.push({
      goalId: row.goalId,
      isPriority: row.isPriority === 1,
      title: row.title,
      areaId: row.areaId,
      declaredPriority: row.declaredPriority,
    });
    objectivesByCycle.set(row.cycleId, objectives);
  }
  const reviewedCycleIds = new Set(reviewRows.map((row) => row.cycleId));
  return rows.map((row) =>
    cycleToDto(row, objectivesByCycle.get(row.id) ?? [], reviewedCycleIds.has(row.id)),
  );
}

export async function getCycle(ctx: PlanningContext, id: string): Promise<PlanningCycleDto> {
  return cycleDto(ctx, await cycleOr404(ctx, id));
}

export async function createCycle(
  ctx: PlanningContext,
  request: MutatingRequest,
  input: CreateCycleRequest,
): Promise<IdempotentResult> {
  assertCyclePeriod(input.startDate, input.endDate);
  let objectives: PlanningCycleDto['objectives'] = [];
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await assertNoIncompatibleOverlap(ctx, input.startDate, input.endDate);
        objectives = await objectivesForGoals(
          ctx,
          input.goalIds ?? [],
          input.priorityGoalIds ?? [],
        );
        assertPrioritySubset(input.goalIds ?? [], input.priorityGoalIds ?? []);
        await assertProjectsExist(ctx, input.priorityProjects ?? []);
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const dto = cycleToDto(
        {
          id,
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          theme: input.theme ?? null,
          expectedResultsJson: JSON.stringify(input.expectedResults ?? []),
          priorityProjectsJson: JSON.stringify(input.priorityProjects ?? []),
          successCriteriaJson: JSON.stringify(input.successCriteria ?? []),
          status: 'planned',
          sourceId: MANUAL_SOURCE_ID,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        objectives,
        false,
      );
      const priorityIds = new Set(input.priorityGoalIds ?? []);
      const statements: SQL[] = [
        sql`INSERT INTO planning_cycles
          (id, name, start_date, end_date, theme, expected_results_json, priority_projects_json, success_criteria_json, status, source_id, version, created_operation_id, created_at, updated_at)
          VALUES (${id}, ${input.name}, ${input.startDate}, ${input.endDate}, ${input.theme ?? null},
            ${JSON.stringify(input.expectedResults ?? [])}, ${JSON.stringify(input.priorityProjects ?? [])},
            ${JSON.stringify(input.successCriteria ?? [])}, 'planned', ${MANUAL_SOURCE_ID}, 1, ${opId}, ${now}, ${now})`,
        audit('planning_cycle', id, 'create', ctx, {
          status: 'planned',
          version: 1,
          startDate: input.startDate,
          endDate: input.endDate,
        }),
      ];
      for (const goalId of new Set(input.goalIds ?? [])) {
        statements.push(
          sql`INSERT INTO planning_cycle_objectives (cycle_id, goal_id, is_priority) VALUES (${id}, ${goalId}, ${priorityIds.has(goalId) ? 1 : 0})`,
        );
      }
      return { status: 201 as const, bodyJson: envelope(ctx.requestId, dto), statements };
    },
  );
}

export async function updateCycle(
  ctx: PlanningContext,
  request: MutatingRequest,
  id: string,
  input: UpdateCycleRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const current = await cycleOr404(ctx, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if (current.status === 'completed' || current.status === 'cancelled') {
          throw conflict('Ciclo encerrado não pode ser editado.');
        }
        assertVersion(expectedVersion, current.version, 'Ciclo foi alterado por outra operação.');
        const start = input.startDate ?? current.startDate;
        const end = input.endDate ?? current.endDate;
        assertCyclePeriod(start, end);
        await assertNoIncompatibleOverlap(ctx, start, end, id);
        await assertGoalsExist(ctx, input.goalIds ?? []);
        await assertGoalsExist(ctx, input.priorityGoalIds ?? []);
        assertPrioritySubset(input.goalIds ?? [], input.priorityGoalIds ?? []);
        await assertProjectsExist(ctx, input.priorityProjects ?? []);
      },
    },
    ({ opId, now }) => {
      const after: CycleJoinRow = {
        ...current,
        name: input.name ?? current.name,
        startDate: input.startDate ?? current.startDate,
        endDate: input.endDate ?? current.endDate,
        theme: input.theme === undefined ? current.theme : input.theme,
        expectedResultsJson:
          input.expectedResults === undefined
            ? current.expectedResultsJson
            : JSON.stringify(input.expectedResults),
        priorityProjectsJson:
          input.priorityProjects === undefined
            ? current.priorityProjectsJson
            : JSON.stringify(input.priorityProjects),
        successCriteriaJson:
          input.successCriteria === undefined
            ? current.successCriteriaJson
            : JSON.stringify(input.successCriteria),
        version: current.version + 1,
        updatedAt: now,
      };
      const statements: SQL[] = [
        sql`UPDATE planning_cycles SET name = ${after.name}, start_date = ${after.startDate}, end_date = ${after.endDate},
          theme = ${after.theme}, expected_results_json = ${after.expectedResultsJson},
          priority_projects_json = ${after.priorityProjectsJson}, success_criteria_json = ${after.successCriteriaJson},
          version = ${after.version}, updated_operation_id = ${opId}, updated_at = ${now}
          WHERE id = ${id} AND version = ${current.version}`,
        audit(
          'planning_cycle',
          id,
          'update',
          ctx,
          {
            status: after.status,
            version: after.version,
            startDate: after.startDate,
            endDate: after.endDate,
          },
          { status: current.status, version: current.version },
        ),
      ];
      if (input.goalIds !== undefined) {
        statements.push(sql`DELETE FROM planning_cycle_objectives WHERE cycle_id = ${id}`);
        const priorityIds = new Set(input.priorityGoalIds ?? []);
        for (const goalId of new Set(input.goalIds)) {
          statements.push(
            sql`INSERT INTO planning_cycle_objectives (cycle_id, goal_id, is_priority) VALUES (${id}, ${goalId}, ${priorityIds.has(goalId) ? 1 : 0})`,
          );
        }
      }
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, {
          id,
          name: after.name,
          startDate: after.startDate,
          endDate: after.endDate,
          version: after.version,
          status: after.status,
        }),
        statements,
      };
    },
  );
}

export async function transitionCycle(
  ctx: PlanningContext,
  request: MutatingRequest,
  id: string,
  input: CycleTransitionRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const current = await cycleOr404(ctx, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        assertVersion(expectedVersion, current.version, 'Ciclo foi alterado por outra operação.');
        assertCycleTransition(current.status, input.status);
        if (input.status === 'active')
          await assertNoIncompatibleOverlap(ctx, current.startDate, current.endDate, id);
      },
    },
    ({ opId, now }) => {
      const after = {
        ...current,
        status: input.status,
        version: current.version + 1,
        updatedAt: now,
      };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, { id, status: after.status, version: after.version }),
        statements: [
          sql`UPDATE planning_cycles SET status = ${after.status}, version = ${after.version},
            updated_operation_id = ${opId}, updated_at = ${now} WHERE id = ${id} AND version = ${current.version}`,
          audit(
            'planning_cycle',
            id,
            'update',
            ctx,
            { status: after.status },
            { status: current.status },
          ),
        ],
      };
    },
  );
}

/* -------------------------------------------------------------- Capacidade */

interface ProfileRow {
  id: string;
  weeklyMinutes: number;
  contingencyPercent: number;
  allocationsJson: string;
  preferencesJson: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface UnavailabilityRow {
  id: string;
  from: string;
  to: string;
  reason: string | null;
  minutesPerDay: number | null;
}

function allocationsFrom(value: string): { areaId: string; percent: number }[] {
  return parseArray(value)
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .flatMap((item) => {
      if (typeof item.areaId !== 'string' || typeof item.percent !== 'number') return [];
      return [{ areaId: item.areaId, percent: item.percent }];
    });
}

function preferencesFrom(value: string): string[] {
  return parseArray(value).filter((item): item is string => typeof item === 'string');
}

async function loadProfile(ctx: PlanningContext): Promise<ProfileRow | undefined> {
  const rows = (await ctx.db.all(sql`
    SELECT id, weekly_minutes AS "weeklyMinutes", contingency_percent AS "contingencyPercent",
      allocations_json AS "allocationsJson", preferences_json AS "preferencesJson",
      version, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM capacity_profiles WHERE is_active = 1 LIMIT 1
  `)) as ProfileRow[];
  return rows[0];
}

async function loadUnavailability(
  ctx: PlanningContext,
  profileId: string,
): Promise<UnavailabilityRow[]> {
  return (await ctx.db.all(sql`
    SELECT id, from_date AS "from", to_date AS "to", reason, minutes_per_day AS "minutesPerDay"
    FROM capacity_unavailability WHERE profile_id = ${profileId}
    ORDER BY from_date ASC LIMIT ${READ_LIMIT}
  `)) as UnavailabilityRow[];
}

export async function getCapacityProfile(ctx: PlanningContext): Promise<CapacityProfileDto | null> {
  const profile = await loadProfile(ctx);
  if (profile === undefined) return null;
  return capacityProfileDtoSchema.parse({
    id: profile.id,
    weeklyMinutes: profile.weeklyMinutes,
    contingencyPercent: profile.contingencyPercent,
    allocations: allocationsFrom(profile.allocationsJson),
    preferences: preferencesFrom(profile.preferencesJson),
    unavailability: (await loadUnavailability(ctx, profile.id)).map((row) => ({
      id: row.id,
      from: row.from,
      to: row.to,
      reason: row.reason,
      minutesPerDay: row.minutesPerDay,
    })),
    version: profile.version,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
}

interface CommitmentRow {
  id: string;
  title: string;
  areaId: string;
  projectId: string | null;
  goalId: string | null;
  estimateMinutes: number | null;
  status: string;
  dueDate: string | null;
  blocked: number;
}

async function loadCommitments(
  ctx: PlanningContext,
  weekEnd: string,
): Promise<CapacityCommitment[]> {
  const rows = (await ctx.db.all(sql`
    SELECT t.id AS "id", t.title AS "title", t.project_id AS "projectId", t.goal_id AS "goalId",
      t.estimate_minutes AS "estimateMinutes", t.status AS "status", t.due_date AS "dueDate",
      COALESCE(g.area_id, pg.area_id, (SELECT id FROM areas WHERE key = 'life' LIMIT 1)) AS "areaId",
      CASE WHEN EXISTS (
        SELECT 1 FROM task_dependencies td INNER JOIN tasks dep ON dep.id = td.depends_on_task_id
        WHERE td.task_id = t.id AND dep.status NOT IN ('completed','cancelled') AND dep.deleted_at IS NULL
      ) THEN 1 ELSE 0 END AS "blocked"
    FROM tasks t
    LEFT JOIN goals g ON g.id = t.goal_id
    LEFT JOIN project_goals pgl ON pgl.project_id = t.project_id
    LEFT JOIN goals pg ON pg.id = pgl.goal_id
    WHERE t.deleted_at IS NULL AND (t.due_date IS NULL OR t.due_date <= ${weekEnd})
    ORDER BY t.due_date ASC, t.id ASC
    LIMIT ${TASK_LIMIT}
  `)) as CommitmentRow[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    areaId: row.areaId,
    projectId: row.projectId,
    goalId: row.goalId,
    estimateMinutes: row.estimateMinutes,
    status: row.status,
    blocked: row.blocked === 1,
  }));
}

export async function computeCapacity(
  ctx: PlanningContext,
  query: CapacityQuery,
): Promise<ReturnType<typeof capacityResultDtoSchema.parse>> {
  const profile = await loadProfile(ctx);
  const weekStart = query.weekStart ?? weekStartFor(todayFor(ctx));
  const unavailability = profile === undefined ? [] : await loadUnavailability(ctx, profile.id);
  const input: CapacityInput = {
    weekStart,
    configuredMinutes: profile?.weeklyMinutes ?? 0,
    contingencyPercent: profile?.contingencyPercent ?? 0,
    allocations: profile === undefined ? [] : allocationsFrom(profile.allocationsJson),
    unavailability: unavailability.map((row) => ({
      from: row.from,
      to: row.to,
      minutesPerDay: row.minutesPerDay,
    })),
    commitments: await loadCommitments(ctx, shiftLocalDate(weekStart, 6)),
  };
  return capacityResultDtoSchema.parse(calculateCapacity(input));
}

export async function saveCapacityProfile(
  ctx: PlanningContext,
  request: MutatingRequest,
  input: SaveCapacityProfileRequest,
  expectedVersion?: number,
): Promise<IdempotentResult> {
  const current = await loadProfile(ctx);
  const unique = [...new Set(input.allocations.map((item) => item.areaId))];
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if (expectedVersion !== undefined) {
          if (current === undefined)
            throw conflict('Perfil de capacidade não existe para versão informada.');
          assertVersion(
            expectedVersion,
            current.version,
            'Perfil de capacidade foi alterado por outra operação.',
          );
        }
        if (unique.length > 0) {
          const rows = (await ctx.db.all(sql`
            SELECT id FROM areas WHERE id IN (${sql.join(
              unique.map((id) => sql`${id}`),
              sql`, `,
            )})
              AND deleted_at IS NULL LIMIT ${unique.length}
          `)) as { id: string }[];
          if (rows.length !== unique.length) throw notFound('Área de alocação não encontrada.');
        }
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const after = {
        id,
        weeklyMinutes: input.weeklyMinutes,
        contingencyPercent: input.contingencyPercent,
        allocationsJson: JSON.stringify(input.allocations),
        preferencesJson: JSON.stringify(input.preferences ?? []),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      return {
        status: 201 as const,
        bodyJson: envelope(
          ctx.requestId,
          capacityProfileDtoSchema.parse({
            ...after,
            allocations: input.allocations,
            preferences: input.preferences ?? [],
            unavailability: input.unavailability.map((row, index) => ({
              id: `${id}-${index}`,
              from: row.from,
              to: row.to,
              reason: row.reason ?? null,
              minutesPerDay: row.minutesPerDay ?? null,
            })),
          }),
        ),
        statements: [
          sql`UPDATE capacity_profiles SET is_active = 0, updated_operation_id = ${opId}, updated_at = ${now} WHERE is_active = 1`,
          sql`INSERT INTO capacity_profiles
            (id, weekly_minutes, contingency_percent, allocations_json, preferences_json, is_active, source_id, version, created_operation_id, created_at, updated_at)
            VALUES (${id}, ${after.weeklyMinutes}, ${after.contingencyPercent}, ${after.allocationsJson}, ${after.preferencesJson}, 1, ${MANUAL_SOURCE_ID}, 1, ${opId}, ${now}, ${now})`,
          ...input.unavailability.map(
            (row, index) => sql`INSERT INTO capacity_unavailability
            (id, profile_id, from_date, to_date, reason, minutes_per_day, created_at)
            VALUES (${`${id}-${index}`}, ${id}, ${row.from}, ${row.to}, ${row.reason ?? null}, ${row.minutesPerDay ?? null}, ${now})`,
          ),
          audit('capacity_profile', id, 'create', ctx, {
            weeklyMinutes: after.weeklyMinutes,
            version: 1,
          }),
        ],
      };
    },
  );
}

/* ------------------------------------------------------------ Priorização */

interface PrioritizationRow {
  id: string;
  title: string;
  kind: 'goal' | 'project';
  declaredPriority: number | string;
  importance: number;
  dueDate: string | null;
  progressPercent: number | null;
  pendingDependencies: number;
  minutes: number | null;
  risk: number;
  contribution: number;
}

async function loadPrioritizationRows(
  ctx: PlanningContext,
  weekEnd: string,
): Promise<PrioritizationRow[]> {
  const goals = (await ctx.db.all(sql`
    SELECT s.goal_id AS "id", g.title AS "title", g.priority AS "declaredPriority",
      s.importance AS "importance", g.target_date AS "dueDate", g.manual_progress AS "progressPercent",
      (SELECT COUNT(*) FROM goal_milestones m WHERE m.goal_id = g.id AND m.status IN ('pending','in_progress')) AS "pendingDependencies",
      (SELECT SUM(t.estimate_minutes) FROM tasks t WHERE t.goal_id = g.id AND t.deleted_at IS NULL AND t.status NOT IN ('completed','cancelled')) AS "minutes",
      (SELECT COUNT(*) FROM goal_milestones m WHERE m.goal_id = g.id AND m.status = 'pending') AS "risk",
      s.importance AS "contribution", 'goal' AS "kind"
    FROM strategic_goals s INNER JOIN goals g ON g.id = s.goal_id
    WHERE g.deleted_at IS NULL ORDER BY s.goal_id ASC LIMIT ${READ_LIMIT}
  `)) as Array<
    Omit<PrioritizationRow, 'risk' | 'contribution'> & {
      risk: number | null;
      contribution: number | null;
    }
  >;
  const projects = (await ctx.db.all(sql`
    SELECT p.id AS "id", p.title AS "title", p.priority AS "declaredPriority",
      (SELECT MAX(s.importance) FROM project_goals pg JOIN strategic_goals s ON s.goal_id = pg.goal_id WHERE pg.project_id = p.id) AS "importance",
      p.target_date AS "dueDate", NULL AS "progressPercent",
      (SELECT COUNT(*) FROM task_dependencies td JOIN tasks t ON t.id = td.task_id WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS "pendingDependencies",
      (SELECT SUM(t.estimate_minutes) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status NOT IN ('completed','cancelled')) AS "minutes",
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'blocked' AND t.deleted_at IS NULL) AS "risk",
      COALESCE((SELECT MAX(s.importance) FROM project_goals pg JOIN strategic_goals s ON s.goal_id = pg.goal_id WHERE pg.project_id = p.id), 1) AS "contribution",
      'project' AS "kind"
    FROM projects p
    WHERE p.deleted_at IS NULL AND p.status IN ('planned','active','paused')
    ORDER BY p.id ASC LIMIT ${READ_LIMIT}
  `)) as Array<
    Omit<PrioritizationRow, 'importance' | 'contribution'> & {
      importance: number | null;
      contribution: number | null;
    }
  >;
  void weekEnd;
  return [...goals, ...projects].map((row) => ({
    ...row,
    importance: row.importance ?? 1,
    risk: row.risk ?? 0,
    contribution: row.contribution ?? 1,
  }));
}

function declaredPriority(value: string | number): number {
  if (typeof value === 'number') return value;
  return ({ low: 1, medium: 3, high: 4, critical: 5 } as Record<string, number>)[value] ?? 3;
}

type CapacityResult = Awaited<ReturnType<typeof computeCapacity>>;

async function buildPrioritization(
  ctx: PlanningContext,
  query: PrioritizationQuery,
  capacity: CapacityResult,
  areas: readonly StrategicAreaDto[],
): Promise<PrioritizationDto> {
  const today = query.asOf ?? todayFor(ctx);
  const weekStart = query.weekStart ?? weekStartFor(today);
  const rows = await loadPrioritizationRows(ctx, shiftLocalDate(weekStart, 6));
  const items: PrioritizationItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    declaredPriority: declaredPriority(row.declaredPriority),
    importance: row.importance ?? 1,
    dueDate: row.dueDate,
    today,
    progressPercent: row.progressPercent ?? null,
    pendingDependencies: row.pendingDependencies ?? 0,
    minutes: row.minutes ?? null,
    availableMinutes:
      capacity.remainingMinutes > 0 ? capacity.remainingMinutes : capacity.availableMinutes,
    risk: row.risk ?? 0,
    contribution: row.contribution ?? 1,
  }));
  const priorities = prioritizeItems(items, DEFAULT_PLANNING_WEIGHTS);
  const tradeoffs = analyzeTradeoffs({
    items: priorities,
    capacity,
    areas: areas.map((area) => ({
      areaId: area.areaId,
      name: area.name,
    })),
  });
  return prioritizationDtoSchema.parse({
    items: priorities,
    tradeoffs,
    capacity,
    weights: DEFAULT_PLANNING_WEIGHTS,
    formula:
      'score = Σ(peso_i × fator_i) / Σ(pesos); fatores normalizados em [0,1]. Prioridade declarada nunca é sobrescrita.',
    limitations: [
      'Sugestão determinística, não decisão automática.',
      'Progresso sem registro não é tratado como zero.',
      'Dados insuficientes reduzem a cobertura; não criam precisão.',
    ],
    generatedAt: ctx.now,
  });
}

export async function getPrioritization(
  ctx: PlanningContext,
  query: PrioritizationQuery,
): Promise<PrioritizationDto> {
  const today = query.asOf ?? todayFor(ctx);
  const weekStart = query.weekStart ?? weekStartFor(today);
  const [capacity, areas] = await Promise.all([
    computeCapacity(ctx, { weekStart }),
    listStrategicAreas(ctx),
  ]);
  return buildPrioritization(ctx, query, capacity, areas);
}

/* --------------------------------------------------------------- Cenários */

async function loadScenarioBase(ctx: PlanningContext, weekStart: string): Promise<ScenarioBase> {
  const profile = await loadProfile(ctx);
  const [unavailability, commitments, items] = await Promise.all([
    profile === undefined ? Promise.resolve([]) : loadUnavailability(ctx, profile.id),
    loadCommitments(ctx, shiftLocalDate(weekStart, 6)),
    loadPrioritizationRows(ctx, shiftLocalDate(weekStart, 6)),
  ]);
  const today = todayFor(ctx);
  return {
    today: weekStart > today ? weekStart : today,
    weekStart,
    weeklyMinutes: profile?.weeklyMinutes ?? 0,
    contingencyPercent: profile?.contingencyPercent ?? 0,
    commitments,
    allocations: profile === undefined ? [] : allocationsFrom(profile.allocationsJson),
    unavailability: unavailability.map((row) => ({
      from: row.from,
      to: row.to,
      minutesPerDay: row.minutesPerDay,
    })),
    items: items.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      declaredPriority: declaredPriority(row.declaredPriority),
      importance: row.importance ?? 1,
      dueDate: row.dueDate,
      today,
      progressPercent: row.progressPercent ?? null,
      pendingDependencies: row.pendingDependencies ?? 0,
      minutes: row.minutes ?? null,
      availableMinutes: profile?.weeklyMinutes ?? 0,
      risk: row.risk ?? 0,
      contribution: row.contribution ?? 1,
    })),
  };
}

function assertChanges(changes: readonly ScenarioChangeDto[]): ScenarioChange[] {
  return changes.map((change) => ({
    type: change.type,
    ...(change.goalId === undefined ? {} : { goalId: change.goalId }),
    ...(change.projectId === undefined ? {} : { projectId: change.projectId }),
    ...(change.taskId === undefined ? {} : { taskId: change.taskId }),
    ...(change.areaId === undefined ? {} : { areaId: change.areaId }),
    ...(change.value === undefined ? {} : { value: change.value }),
  }));
}

function simulationDto(result: SimulationResult) {
  return simulationResultDtoSchema.parse(result);
}

export async function simulate(
  ctx: PlanningContext,
  input: SimulateRequest,
): Promise<ReturnType<typeof simulationResultDtoSchema.parse>> {
  const weekStart = input.weekStart ?? weekStartFor(todayFor(ctx));
  const base = await loadScenarioBase(ctx, weekStart);
  return simulationDto(
    simulateScenario(base, assertChanges(input.changes), DEFAULT_PLANNING_WEIGHTS),
  );
}

export async function compare(
  ctx: PlanningContext,
  input: SimulateRequest,
): Promise<ScenarioComparison> {
  const weekStart = input.weekStart ?? weekStartFor(todayFor(ctx));
  const baseState = await loadScenarioBase(ctx, weekStart);
  const base = simulateScenario(baseState, [], DEFAULT_PLANNING_WEIGHTS);
  const scenario = simulateScenario(
    baseState,
    assertChanges(input.changes),
    DEFAULT_PLANNING_WEIGHTS,
  );
  return compareScenarios(base, scenario);
}

interface ScenarioRow {
  id: string;
  name: string;
  hypotheses: string | null;
  changesJson: string;
  weekStart: string;
  resultJson: string;
  limitationsJson: string;
  algorithmVersion: string;
  sourceId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const SCENARIO_FIELDS = {
  id: planningScenarios.id,
  name: planningScenarios.name,
  hypotheses: planningScenarios.hypotheses,
  changesJson: planningScenarios.changesJson,
  weekStart: planningScenarios.weekStart,
  resultJson: planningScenarios.resultJson,
  limitationsJson: planningScenarios.limitationsJson,
  algorithmVersion: planningScenarios.algorithmVersion,
  sourceId: planningScenarios.sourceId,
  version: planningScenarios.version,
  createdAt: planningScenarios.createdAt,
  updatedAt: planningScenarios.updatedAt,
} as const;

function scenarioToDto(row: ScenarioRow): ScenarioDto {
  return scenarioDtoSchema.parse({
    id: row.id,
    name: row.name,
    hypotheses: row.hypotheses,
    changes: parseArray(row.changesJson),
    weekStart: row.weekStart,
    result: parseObject(row.resultJson),
    limitations: stringList(row.limitationsJson),
    algorithmVersion: row.algorithmVersion,
    sourceId: row.sourceId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function listScenarios(ctx: PlanningContext, limit: number): Promise<ScenarioDto[]> {
  const rows = (await ctx.db
    .select(SCENARIO_FIELDS)
    .from(planningScenarios)
    .orderBy(sql`${planningScenarios.createdAt} DESC`)
    .limit(limit + 1)) as ScenarioRow[];
  return rows.slice(0, limit).map(scenarioToDto);
}

export async function getScenario(ctx: PlanningContext, id: string): Promise<ScenarioDto> {
  const rows = await ctx.db
    .select(SCENARIO_FIELDS)
    .from(planningScenarios)
    .where(eq(planningScenarios.id, id))
    .limit(1);
  if (rows.length === 0) throw notFound('Cenário não encontrado.');
  return scenarioToDto(rows[0] as ScenarioRow);
}

export async function createScenario(
  ctx: PlanningContext,
  request: MutatingRequest,
  input: CreateScenarioRequest,
): Promise<IdempotentResult> {
  const weekStart = input.weekStart ?? weekStartFor(todayFor(ctx));
  const base = await loadScenarioBase(ctx, weekStart);
  const result = simulateScenario(base, assertChanges(input.changes), DEFAULT_PLANNING_WEIGHTS);
  const resultJson = JSON.stringify(simulationDto(result));
  if (resultJson.length > MAX_SNAPSHOT_CHARS)
    throw validationError('Resultado do cenário excede o limite.');
  return executeIdempotent({ ...mutationContext(ctx, request) }, ({ opId, now }) => {
    const id = newId();
    const row: ScenarioRow = {
      id,
      name: input.name,
      hypotheses: input.hypotheses ?? null,
      changesJson: JSON.stringify(input.changes),
      weekStart,
      resultJson,
      limitationsJson: JSON.stringify(SCENARIO_LIMITATIONS),
      algorithmVersion: PLANNING_ALGORITHMS.scenario,
      sourceId: MANUAL_SOURCE_ID,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    return {
      status: 201 as const,
      bodyJson: envelope(ctx.requestId, scenarioToDto(row)),
      statements: [
        sql`INSERT INTO planning_scenarios
            (id, name, hypotheses, changes_json, week_start, result_json, limitations_json, algorithm_version, source_id, version, created_operation_id, created_at, updated_at)
            VALUES (${id}, ${row.name}, ${row.hypotheses}, ${row.changesJson}, ${row.weekStart}, ${row.resultJson},
              ${row.limitationsJson}, ${row.algorithmVersion}, ${MANUAL_SOURCE_ID}, 1, ${opId}, ${now}, ${now})`,
        audit('planning_scenario', id, 'create', ctx, {
          weekStart: row.weekStart,
          algorithmVersion: row.algorithmVersion,
          version: 1,
        }),
      ],
    };
  });
}

/* --------------------------------------------------------------- Revisões */

interface ReviewRow {
  id: string;
  cycleId: string;
  snapshotJson: string;
  reflectionsJson: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function reviewToDto(row: ReviewRow, cycleName: string): QuarterlyReviewDto {
  return quarterlyReviewDtoSchema.parse({
    id: row.id,
    cycleId: row.cycleId,
    cycleName,
    snapshot: parseObject(row.snapshotJson),
    reflections: reflectionList(row.reflectionsJson),
    status: row.version > 1 ? 'updated' : 'saved',
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function listReviews(ctx: PlanningContext): Promise<QuarterlyReviewDto[]> {
  const rows = (await ctx.db.all(sql`
    SELECT r.id AS "id", r.cycle_id AS "cycleId", r.snapshot_json AS "snapshotJson",
      r.reflections_json AS "reflectionsJson", r.version AS "version",
      r.created_at AS "createdAt", r.updated_at AS "updatedAt",
      c.name AS "cycleName"
    FROM planning_cycle_reviews r INNER JOIN planning_cycles c ON c.id = r.cycle_id
    ORDER BY r.updated_at DESC LIMIT ${READ_LIMIT}
  `)) as (ReviewRow & { cycleName: string })[];
  return rows.map((row) => reviewToDto(row, row.cycleName));
}

export async function getReview(
  ctx: PlanningContext,
  cycleId: string,
): Promise<QuarterlyReviewDto | null> {
  const rows = (await ctx.db.all(sql`
    SELECT id, cycle_id AS "cycleId", snapshot_json AS "snapshotJson", reflections_json AS "reflectionsJson",
      version, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM planning_cycle_reviews WHERE cycle_id = ${cycleId} LIMIT 1
  `)) as ReviewRow[];
  const row = rows[0];
  if (row === undefined) return null;
  return reviewToDto(row, (await cycleOr404(ctx, cycleId)).name);
}

export async function saveReview(
  ctx: PlanningContext,
  request: MutatingRequest,
  cycleId: string,
  input: CreateQuarterlyReviewRequest,
): Promise<IdempotentResult> {
  const cycle = await cycleOr404(ctx, cycleId);
  if (cycle.status !== 'completed') {
    throw conflict('Só é possível revisar um ciclo concluído.');
  }
  const [prioritization, capacity] = await Promise.all([
    getPrioritization(ctx, { weekStart: cycle.startDate, asOf: cycle.endDate }),
    computeCapacity(ctx, { weekStart: cycle.startDate }),
  ]);
  const reflections: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.reflections ?? {})) {
    if (typeof value === 'string') reflections[key] = value;
  }
  const snapshot = buildQuarterlyReviewSnapshot({
    cycle: {
      name: cycle.name,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      theme: cycle.theme,
    },
    items: prioritization.items,
    capacity,
    tradeoffs: prioritization.tradeoffs,
    completedGoalIds: prioritization.items
      .filter((item) => item.progressPercent === 100)
      .map((item) => item.id),
    pendingGoalIds: prioritization.items
      .filter((item) => item.progressPercent !== 100)
      .map((item) => item.id),
    changedGoalIds: [],
    intelligence: await reviewIntelligence(ctx),
    reflections,
    generatedAt: ctx.now,
  });
  const snapshotJson = JSON.stringify(snapshot);
  if (snapshotJson.length > MAX_SNAPSHOT_CHARS)
    throw validationError('Snapshot da revisão excede o limite.');
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const existing = await ctx.db
          .select({ id: planningCycleReviews.id })
          .from(planningCycleReviews)
          .where(eq(planningCycleReviews.cycleId, cycleId))
          .limit(1);
        if (existing.length > 0) throw conflict('Este ciclo já possui revisão salva.');
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const row: ReviewRow = {
        id,
        cycleId,
        snapshotJson,
        reflectionsJson: JSON.stringify(reflections),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, reviewToDto(row, cycle.name)),
        statements: [
          sql`INSERT INTO planning_cycle_reviews
            (id, cycle_id, snapshot_json, reflections_json, source_id, version, created_operation_id, created_at, updated_at)
            VALUES (${id}, ${cycleId}, ${snapshotJson}, ${row.reflectionsJson}, ${MANUAL_SOURCE_ID}, 1, ${opId}, ${now}, ${now})`,
          audit('planning_cycle_review', id, 'create', ctx, { cycleId, version: 1 }),
        ],
      };
    },
  );
}

export async function updateReview(
  ctx: PlanningContext,
  request: MutatingRequest,
  cycleId: string,
  input: UpdateQuarterlyReviewRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const existing = (
    await ctx.db
      .select()
      .from(planningCycleReviews)
      .where(eq(planningCycleReviews.cycleId, cycleId))
      .limit(1)
  )[0];
  const cycle = await cycleOr404(ctx, cycleId);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if (existing === undefined) throw notFound('Revisão do ciclo não encontrada.');
        assertVersion(
          expectedVersion,
          existing.version,
          'Revisão foi alterada por outra operação.',
        );
      },
    },
    ({ opId, now }) => {
      if (existing === undefined) throw notFound('Revisão do ciclo não encontrada.');
      const reflections: Record<string, string> = {};
      for (const [key, value] of Object.entries(input.reflections)) {
        if (typeof value === 'string') reflections[key] = value;
      }
      const after = {
        ...existing,
        reflectionsJson: JSON.stringify(reflections),
        version: existing.version + 1,
        updatedAt: now,
      };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, reviewToDto(after, cycle.name)),
        statements: [
          sql`UPDATE planning_cycle_reviews SET reflections_json = ${after.reflectionsJson}, version = ${after.version},
            updated_operation_id = ${opId}, updated_at = ${now} WHERE id = ${existing.id} AND version = ${existing.version}`,
          audit(
            'planning_cycle_review',
            existing.id,
            'update',
            ctx,
            { version: after.version },
            { version: existing.version },
          ),
        ],
      };
    },
  );
}

/* ------------------------------------------------------------ Integração */

/**
 * Usa o mesmo motor da Inteligência — nunca contagens aproximadas de auditoria —
 * para que visão, capacidade e revisão compartilhem os sinais reais do sistema.
 */
async function intelligenceSignals(ctx: PlanningContext) {
  const integration = await getIntelligenceIntegration(ctx);
  return {
    alerts: integration.alerts,
    recommendations: integration.recommendations,
    sourcesWithData: integration.sourcesWithData,
    truncated: integration.truncated,
    coverage: integration.coverage,
  };
}

async function reviewIntelligence(ctx: PlanningContext) {
  const { alerts, recommendations, sourcesWithData, truncated } = await intelligenceSignals(ctx);
  return { alerts, recommendations, sourcesWithData, truncated };
}

export async function getIntelligenceIntegration(ctx: PlanningContext) {
  const { getDashboard } = await import('../intelligence/service');
  const dashboard = await getDashboard(ctx, { weeks: 4 });
  return {
    alerts: dashboard.alerts.length,
    recommendations: dashboard.recommendations.length,
    coverage: dashboard.coverage.sources.map((source) => source.key),
    sourcesWithData: dashboard.sourcesWithData,
    truncated: dashboard.truncated,
    weeklyReviewWeeks: (await ctx.db.all(
      sql`SELECT week_start AS "weekStart" FROM weekly_reviews ORDER BY week_start DESC LIMIT 10`,
    )) as {
      weekStart: string;
    }[],
    algorithms: dashboard.algorithms,
  };
}

/* ---------------------------------------------------------------- Dashboard */

export async function getDashboard(ctx: PlanningContext): Promise<StrategyDashboardDto> {
  const today = todayFor(ctx);
  const weekStart = weekStartFor(today);
  const window = { from: shiftLocalDate(today, -27), to: today };
  const snapshot = await loadPlanningDashboardSnapshot(ctx, window, shiftLocalDate(weekStart, 6));

  const profile = snapshot.profile[0];
  const capacity = capacityResultDtoSchema.parse(
    calculateCapacity({
      weekStart,
      configuredMinutes: profile?.weeklyMinutes ?? 0,
      contingencyPercent: profile?.contingencyPercent ?? 0,
      allocations: profile === undefined ? [] : allocationsFrom(profile.allocationsJson),
      unavailability: snapshot.unavailability.map((row) => ({
        from: row.from,
        to: row.to,
        minutesPerDay: row.minutesPerDay,
      })),
      commitments: snapshot.commitments.map<CapacityCommitment>((row) => ({
        id: row.id,
        title: row.title,
        areaId: row.areaId,
        projectId: row.projectId,
        goalId: row.goalId,
        estimateMinutes: row.estimateMinutes,
        status: row.status,
        blocked: row.blocked === 1,
      })),
    }),
  );

  const areas = snapshot.areas.map((row) => strategicAreaDtoSchema.parse(row));
  const reviewed = new Set(snapshot.cycleReviews.map((row) => row.cycleId));
  const objectivesByCycle = new Map<string, PlanningCycleDto['objectives']>();
  for (const row of snapshot.cycleObjectives) {
    const objectives = objectivesByCycle.get(row.cycleId) ?? [];
    objectives.push({
      goalId: row.goalId,
      isPriority: row.isPriority === 1,
      title: row.title,
      areaId: row.areaId,
      declaredPriority: row.declaredPriority,
    });
    objectivesByCycle.set(row.cycleId, objectives);
  }
  const cycles = snapshot.cycles.map((row) =>
    cycleToDto(row, objectivesByCycle.get(row.id) ?? [], reviewed.has(row.id)),
  );

  const items = snapshot.prioritization.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    declaredPriority: declaredPriority(row.declaredPriority),
    importance: row.importance ?? 1,
    dueDate: row.dueDate,
    today,
    progressPercent: row.progressPercent,
    pendingDependencies: row.pendingDependencies,
    minutes: row.minutes,
    availableMinutes:
      capacity.remainingMinutes > 0 ? capacity.remainingMinutes : capacity.availableMinutes,
    risk: row.risk ?? 0,
    contribution: row.contribution ?? 1,
  }));
  const priorities = prioritizeItems(items, DEFAULT_PLANNING_WEIGHTS);
  const prioritization = prioritizationDtoSchema.parse({
    items: priorities,
    tradeoffs: analyzeTradeoffs({
      items: priorities,
      capacity,
      areas: areas.map((area) => ({ areaId: area.areaId, name: area.name })),
    }),
    capacity,
    weights: DEFAULT_PLANNING_WEIGHTS,
    formula:
      'score = Σ(peso_i × fator_i) / Σ(pesos); fatores normalizados em [0,1]. Prioridade declarada nunca é sobrescrita.',
    limitations: [
      'Sugestão determinística, não decisão automática.',
      'Progresso sem registro não é tratado como zero.',
      'Dados insuficientes reduzem a cobertura; não criam precisão.',
    ],
    generatedAt: ctx.now,
  });

  const firstVision = snapshot.vision[0];
  const intelligence = dashboardFromDataset(ctx, { weeks: 4 }, snapshot.intelligence);
  const signals = {
    alerts: intelligence.alerts.length,
    recommendations: intelligence.recommendations.length,
    coverage: intelligence.coverage.sources.map((source) => source.key),
    sourcesWithData: intelligence.sourcesWithData,
    truncated: intelligence.truncated,
  };

  return strategyDashboardDtoSchema.parse({
    date: today,
    timezone: ctx.timezone,
    vision: firstVision === undefined ? null : visionToDto(firstVision),
    areas,
    availableAreas: snapshot.availableAreas,
    availableGoals: snapshot.availableGoals,
    strategicGoals: snapshot.strategicGoals.map(strategicGoalToDto),
    currentCycle: cycles.find((cycle) => cycle.status === 'active') ?? null,
    cycles,
    capacity,
    prioritization,
    scenarios: snapshot.scenarios.map(scenarioToDto),
    reviews: snapshot.reviews.map((row) => reviewToDto(row, row.cycleName)),
    intelligence: signals,
    truncated:
      areas.length >= READ_LIMIT ||
      cycles.length >= READ_LIMIT ||
      snapshot.scenariosTruncated ||
      intelligence.truncated,
    generatedAt: ctx.now,
  });
}
