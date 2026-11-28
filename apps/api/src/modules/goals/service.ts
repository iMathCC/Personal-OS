import {
  buildGoalOverview,
  buildMilestoneTimeline,
  countPendingMilestones,
  daysBetweenLocal,
  decodeCursor,
  GOAL_PRIORITIZATION_ALGORITHM,
  GOAL_PROGRESS_ALGORITHM,
  GOAL_STALE_DAYS,
  calculateGoalProgress,
  conflict,
  localDateFor,
  makeCursor,
  notFound,
  scoreGoalAttention,
  shiftLocalDate,
  STUDY_MINUTES_ALGORITHM,
  STUDY_MINUTES_METRIC_KEY,
  summarizeStudySignal,
  validationError,
  type AttentionClock,
  type GoalForOverview,
  type GoalProgressInput,
  type MilestoneForTimeline,
} from '@personal-os/domain';
import {
  auditStatement,
  findGoalAreaById,
  findGoalAreaByKey,
  findGoalByAreaAndTitle,
  findGoalById,
  findMilestoneById,
  findMetricByKey,
  insertLifeGoalStatement,
  insertMilestoneStatement,
  listAllGoals,
  listGoalAreas,
  listGoalHistory,
  listGoalStudyObservations,
  listMilestonesForGoals,
  listStudyGoalLinks,
  newId,
  setGoalArchivedStatement,
  setGoalStatusStatement,
  updateGoalStatement,
  updateMilestoneStatement,
  type Database,
  type GoalAreaRow,
  type GoalMilestoneRow,
  type GoalRow,
  type StudyGoalLinkRow,
} from '@personal-os/db';
import type {
  CreateLifeGoalRequest,
  CreateMilestoneRequest,
  GoalAreaDto,
  GoalDetailDto,
  GoalHistoryEntryDto,
  GoalListQuery,
  GoalMilestoneDto,
  LifeGoalDto,
  UpdateGoalRequest,
  UpdateMilestoneRequest,
} from '@personal-os/shared';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';

const MANUAL_SOURCE_ID = 'src_manual';
const STUDY_SAMPLE_LIMIT = 10_000;
const DEFAULT_LIMIT = 50;
const HISTORY_LIMIT = 50;
const MAX_GOALS = 200;

export interface GoalsContext {
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

interface Window {
  from: string;
  to: string;
}

interface GoalBundle {
  milestones: GoalMilestoneRow[];
  links: StudyGoalLinkRow[];
  samples: { localDate: string; valueNum: number }[];
  truncated: boolean;
  window: Window;
}

type GoalValues = Parameters<typeof updateGoalStatement>[0]['changes'];

const HISTORY_FIELDS = [
  'areaId',
  'parentGoalId',
  'status',
  'priority',
  'startDate',
  'targetDate',
  'progressMode',
  'manualProgress',
  'achievedAt',
  'archivedAt',
  'version',
] as const;

export function envelope<T>(requestId: string, data: T): string {
  return JSON.stringify({ data, meta: { requestId } });
}

function mutationContext(ctx: GoalsContext, request: MutatingRequest) {
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

function clockFor(ctx: GoalsContext): AttentionClock {
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(nowMs)) throw validationError('Instante da requisição inválido.');
  return { nowMs, today: localDateFor(nowMs, ctx.timezone) };
}

function defaultWindow(today: string): Window {
  return { from: shiftLocalDate(today, -29), to: today };
}

function emptyBundle(window: Window): GoalBundle {
  return { milestones: [], links: [], samples: [], truncated: false, window };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeSnapshot(json: string | null): Record<string, unknown> {
  if (json === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  return isRecord(parsed) ? parsed : {};
}

function printable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function historyChanges(beforeJson: string | null, afterJson: string | null) {
  const before = safeSnapshot(beforeJson);
  const after = safeSnapshot(afterJson);
  return HISTORY_FIELDS.flatMap((field) => {
    const from = printable(before[field]);
    const to = printable(after[field]);
    return from === to ? [] : [{ field, from, to }];
  });
}

/** Texto livre (descrição e critério) fica fora da auditoria por política. */
export function goalAuditSnapshot(row: {
  id: string;
  areaId: string;
  parentGoalId: string | null;
  status: string;
  priority: number;
  startDate: string | null;
  targetDate: string | null;
  progressMode: string;
  manualProgress: number | null;
  achievedAt: string | null;
  archivedAt: string | null;
  version: number;
}) {
  return {
    id: row.id,
    areaId: row.areaId,
    parentGoalId: row.parentGoalId,
    status: row.status,
    priority: row.priority,
    startDate: row.startDate,
    targetDate: row.targetDate,
    progressMode: row.progressMode,
    manualProgress: row.manualProgress,
    achievedAt: row.achievedAt,
    archivedAt: row.archivedAt,
    version: row.version,
  };
}

function milestoneAuditSnapshot(row: {
  id: string;
  goalId: string;
  dueDate: string | null;
  status: string;
  version: number;
}) {
  return {
    id: row.id,
    goalId: row.goalId,
    dueDate: row.dueDate,
    status: row.status,
    version: row.version,
  };
}

function isGoalStatus(value: string): value is LifeGoalDto['status'] {
  return (
    value === 'draft' ||
    value === 'active' ||
    value === 'paused' ||
    value === 'achieved' ||
    value === 'cancelled'
  );
}

function isGoalHorizon(value: string): value is LifeGoalDto['horizon'] {
  return value === 'short' || value === 'medium' || value === 'long';
}

function isProgressMode(value: string): value is LifeGoalDto['progressMode'] {
  return value === 'manual' || value === 'metrics' || value === 'tasks' || value === 'hybrid';
}

function toMilestoneInput(row: GoalMilestoneRow): MilestoneForTimeline {
  return {
    id: row.id,
    goalId: row.goalId,
    title: row.title,
    dueDate: row.dueDate,
    status: isMilestoneStatus(row.status) ? row.status : 'pending',
  };
}

function isMilestoneStatus(value: string): value is GoalMilestoneDto['status'] {
  return (
    value === 'pending' || value === 'in_progress' || value === 'completed' || value === 'cancelled'
  );
}

export function milestoneToDto(row: GoalMilestoneRow): GoalMilestoneDto {
  return {
    id: row.id,
    goalId: row.goalId,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    status: isMilestoneStatus(row.status) ? row.status : 'pending',
    completedAt: row.completedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAreas(ctx: GoalsContext): Promise<GoalAreaDto[]> {
  return (await listGoalAreas(ctx.db)).map((area) => ({
    id: area.id,
    key: area.key,
    name: area.name,
  }));
}

async function loadBundle(
  ctx: GoalsContext,
  rows: readonly GoalRow[],
  window: Window,
): Promise<GoalBundle> {
  const milestones = await listMilestonesForGoals(
    ctx.db,
    rows.map((row) => row.id),
  );
  const links = await listStudyGoalLinks(
    ctx.db,
    rows.map((row) => row.id),
  );
  let samples: GoalBundle['samples'] = [];
  let truncated = false;
  if (links.length > 0) {
    const metric = await findMetricByKey(ctx.db, STUDY_MINUTES_METRIC_KEY);
    if (metric !== undefined) {
      const linkedIds = new Set(links.map((link) => link.goalId));
      const linkedRows = rows.filter((row) => linkedIds.has(row.id));
      const from = linkedRows.reduce(
        (value, row) => (row.startDate !== null && row.startDate < value ? row.startDate : value),
        window.from,
      );
      const to = linkedRows.reduce(
        (value, row) =>
          row.targetDate !== null && row.targetDate > value ? row.targetDate : value,
        window.to,
      );
      const effectiveFrom = from <= to ? from : window.from;
      const effectiveTo = from <= to ? to : window.to;
      const result = await listGoalStudyObservations(
        ctx.db,
        metric.id,
        effectiveFrom,
        effectiveTo,
        STUDY_SAMPLE_LIMIT + 1,
      );
      truncated = result.length > STUDY_SAMPLE_LIMIT;
      samples = truncated ? result.slice(0, STUDY_SAMPLE_LIMIT) : result;
    }
  }
  return { milestones, links, samples, truncated, window };
}

function goalWindow(row: GoalRow, bundle: GoalBundle): Window {
  const from = row.startDate ?? bundle.window.from;
  const to = row.targetDate ?? bundle.window.to;
  return from <= to ? { from, to } : bundle.window;
}

function goalToDto(row: GoalRow, bundle: GoalBundle, clock: AttentionClock): LifeGoalDto {
  const status = isGoalStatus(row.status) ? row.status : 'draft';
  const area: GoalAreaRow = { id: row.areaId, key: row.areaKey, name: row.areaName };
  const window = goalWindow(row, bundle);
  const link = bundle.links.find((item) => item.goalId === row.id);
  const signal = summarizeStudySignal(bundle.samples, window);
  const progressInput: GoalProgressInput = {
    progressMode: isProgressMode(row.progressMode) ? row.progressMode : 'manual',
    manualProgress: row.manualProgress,
    status,
    metrics:
      link === undefined
        ? []
        : [
            {
              baselineValue: 0,
              targetValue: link.targetMinutes,
              direction: 'increase',
              currentValue: signal.sessionCount === 0 ? null : signal.minutes,
            },
          ],
  };
  const progress = { ...calculateGoalProgress(progressInput), truncated: bundle.truncated };
  const milestones = bundle.milestones.filter((milestone) => milestone.goalId === row.id);
  const pendingMilestones =
    countPendingMilestones(milestones.map(toMilestoneInput)).get(row.id) ?? 0;
  const attention = scoreGoalAttention(
    {
      id: row.id,
      title: row.title,
      priority: row.priority,
      status,
      targetDate: row.targetDate,
      lastUpdatedAt: row.updatedAt,
      progressPercent: progress.percent,
      pendingMilestones,
    },
    clock,
  );

  return {
    id: row.id,
    areaId: area.id,
    areaKey: area.key,
    areaName: area.name,
    parentGoalId: row.parentGoalId,
    title: row.title,
    description: row.description,
    horizon: isGoalHorizon(row.horizon) ? row.horizon : 'medium',
    status,
    priority: row.priority,
    startDate: row.startDate,
    targetDate: row.targetDate,
    successCriteria: row.successCriteria,
    progressMode: progressInput.progressMode,
    manualProgress: row.manualProgress,
    progress,
    milestoneCount: milestones.length,
    pendingMilestoneCount: pendingMilestones,
    attention: {
      ...attention,
      reasons: attention.reasons.map((reason) => ({ code: reason.code, message: reason.message })),
    },
    studyLink: {
      linked: link !== undefined,
      areaKey: link === undefined ? null : area.key,
      metricKey: link === undefined ? null : STUDY_MINUTES_METRIC_KEY,
      window,
      minutes: link === undefined ? 0 : signal.minutes,
      sessionCount: link === undefined ? 0 : signal.sessionCount,
      lastActivityDate: link === undefined ? null : signal.lastActivityDate,
      targetMinutes: link?.targetMinutes ?? null,
      truncated: link === undefined ? false : bundle.truncated,
    },
    achievedAt: row.achievedAt,
    archivedAt: row.archivedAt,
    sourceId: row.sourceId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sortValue(dto: LifeGoalDto, sort: GoalListQuery['sort']): string {
  switch (sort) {
    case 'target':
      return dto.targetDate ?? '9999-12-31';
    case 'progress':
      return String(100 - (dto.progress.percent ?? -1));
    case 'updated':
      return dto.updatedAt;
    default:
      return String(6 - dto.priority);
  }
}

function compare(a: LifeGoalDto, b: LifeGoalDto, sort: GoalListQuery['sort']): number {
  return sortValue(a, sort).localeCompare(sortValue(b, sort)) || a.id.localeCompare(b.id);
}

export interface GoalPage {
  items: LifeGoalDto[];
  nextCursor?: string;
  hasMore: boolean;
  truncated: boolean;
}

export async function listGoals(ctx: GoalsContext, query: GoalListQuery): Promise<GoalPage> {
  const clock = clockFor(ctx);
  const all = await listAllGoals(ctx.db, MAX_GOALS);
  const truncatedAll = all.length > MAX_GOALS;
  const rows = all.slice(0, MAX_GOALS);
  const bundle = await loadBundle(ctx, rows, defaultWindow(clock.today));
  const search = query.q?.toLocaleLowerCase('pt-BR');
  const items = rows
    .filter((row) => query.includeArchived === 'true' || row.archivedAt === null)
    .filter((row) => query.area === undefined || row.areaKey === query.area)
    .filter((row) => query.status === undefined || row.status === query.status)
    .filter((row) => search === undefined || row.title.toLocaleLowerCase('pt-BR').includes(search))
    .map((row) => goalToDto(row, bundle, clock));
  const sort = query.sort ?? 'priority';
  items.sort((a, b) => compare(a, b, sort));

  let start = 0;
  if (query.cursor !== undefined) {
    const decoded = decodeCursor(query.cursor);
    const separator = decoded.indexOf('\u0000');
    if (separator < 0) throw validationError('Cursor inválido.');
    const value = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    const index = items.findIndex((item) => sortValue(item, sort) === value && item.id === id);
    if (index < 0) throw validationError('Cursor inválido.');
    start = index + 1;
  }
  const limit = query.limit ?? DEFAULT_LIMIT;
  const page = items.slice(start, start + limit);
  const hasMore = start + limit < items.length;
  const last = page.at(-1);
  return {
    items: page,
    ...(hasMore && last !== undefined
      ? { nextCursor: makeCursor(sortValue(last, sort), last.id) }
      : {}),
    hasMore,
    truncated: bundle.truncated || truncatedAll,
  };
}

async function goalOr404(ctx: GoalsContext, id: string): Promise<GoalRow> {
  const row = await findGoalById(ctx.db, id);
  if (row === undefined) throw notFound('Objetivo não encontrado.');
  return row;
}

function isHistoryAction(value: string): value is GoalHistoryEntryDto['action'] {
  return value === 'create' || value === 'update' || value === 'delete' || value === 'restore';
}

export async function getGoalDetail(ctx: GoalsContext, id: string): Promise<GoalDetailDto> {
  const row = await goalOr404(ctx, id);
  const clock = clockFor(ctx);
  const bundle = await loadBundle(ctx, [row], defaultWindow(clock.today));
  const historyRows = await listGoalHistory(ctx.db, id, HISTORY_LIMIT);
  const dto = goalToDto(row, bundle, clock);
  return {
    goal: dto,
    milestones: bundle.milestones.map(milestoneToDto),
    history: historyRows.map((entry) => ({
      id: entry.id,
      action: isHistoryAction(entry.action) ? entry.action : 'update',
      createdAt: entry.createdAt,
      changes: historyChanges(entry.beforeJson, entry.afterJson),
    })),
  };
}

export async function getGoalsDashboard(ctx: GoalsContext, query: { from?: string; to?: string }) {
  const clock = clockFor(ctx);
  const window: Window = {
    from: query.from ?? shiftLocalDate(clock.today, -29),
    to: query.to ?? clock.today,
  };
  if (window.from > window.to) throw validationError('Intervalo inválido.');
  const all = await listAllGoals(ctx.db, MAX_GOALS);
  const truncatedAll = all.length > MAX_GOALS;
  const rows = all.slice(0, MAX_GOALS).filter((row) => row.archivedAt === null);
  const bundle = await loadBundle(ctx, rows, window);
  const dtos = rows.map((row) => goalToDto(row, bundle, clock));
  const overview = buildGoalOverview(
    dtos.map((dto): GoalForOverview => ({
      id: dto.id,
      title: dto.title,
      priority: dto.priority,
      status: dto.status,
      targetDate: dto.targetDate,
      lastUpdatedAt: dto.updatedAt,
      progressPercent: dto.progress.percent,
      pendingMilestones: dto.pendingMilestoneCount,
      areaKey: dto.areaKey,
      areaName: dto.areaName,
    })),
    clock,
    bundle.truncated || truncatedAll,
  );
  const timeline = buildMilestoneTimeline(bundle.milestones.map(toMilestoneInput), clock.today);
  const linked = dtos.filter((dto) => dto.studyLink.linked);
  const linkedIds = new Set(linked.map((dto) => dto.id));
  const linkedRows = rows.filter((row) => linkedIds.has(row.id));
  const globalWindow = unionWindow(linkedRows, window);
  const globalSignal = summarizeStudySignal(bundle.samples, globalWindow);
  const withoutActivity = linked.filter((dto) => {
    const last = dto.studyLink.lastActivityDate;
    return last === null || daysBetweenLocal(last, clock.today) > GOAL_STALE_DAYS;
  }).length;

  return {
    date: clock.today,
    timezone: ctx.timezone,
    summary: overview.counts,
    progress: overview.progress,
    byArea: overview.byArea,
    deadlines: overview.deadlines.map((dto) => ({
      id: dto.id,
      title: dto.title,
      targetDate: dto.targetDate,
      areaKey: dto.areaKey,
    })),
    attention: overview.attention.map((dto) => ({
      id: dto.id,
      title: dto.title,
      areaKey: dto.areaKey,
      score: dto.score,
      level: dto.level,
      reasons: dto.reasons,
    })),
    milestones: timeline.map((milestone) => ({
      id: milestone.id,
      goalId: milestone.goalId,
      title: milestone.title,
      dueDate: milestone.dueDate,
      status: milestone.status,
    })),
    studies: {
      linkedGoals: linked.length,
      totalMinutes: globalSignal.minutes,
      sessionCount: globalSignal.sessionCount,
      goalsWithoutRecentActivity: withoutActivity,
      truncated: bundle.truncated,
    },
    algorithms: {
      goalProgress: GOAL_PROGRESS_ALGORITHM,
      attention: GOAL_PRIORITIZATION_ALGORITHM,
      studyMinutes: STUDY_MINUTES_ALGORITHM,
    },
    generatedAt: ctx.now,
    truncated: overview.truncated,
  };
}

function unionWindow(rows: readonly GoalRow[], fallback: Window): Window {
  let from = fallback.from;
  let to = fallback.to;
  for (const row of rows) {
    if (row.startDate !== null && row.startDate < from) from = row.startDate;
    if (row.targetDate !== null && row.targetDate > to) to = row.targetDate;
  }
  return from <= to ? { from, to } : fallback;
}

async function requireVersion(
  ctx: GoalsContext,
  id: string,
  expectedVersion: number | undefined,
): Promise<GoalRow> {
  if (expectedVersion === undefined || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw validationError('Cabeçalho If-Match obrigatório com a versão atual.');
  }
  const row = await goalOr404(ctx, id);
  if (row.version !== expectedVersion) {
    throw conflict('Objetivo foi alterado por outra operação.');
  }
  return row;
}

function assertDateOrder(input: { startDate: string | null; targetDate: string | null }): void {
  if (input.startDate !== null && input.targetDate !== null && input.targetDate < input.startDate) {
    throw validationError('A data-alvo não pode anteceder o início.');
  }
}

async function assertParent(
  ctx: GoalsContext,
  parentGoalId: string | null,
  goalId?: string,
): Promise<void> {
  if (parentGoalId === null) return;
  if (goalId !== undefined && parentGoalId === goalId) {
    throw validationError('Objetivo não pode ser pai de si mesmo.');
  }
  if ((await findGoalById(ctx.db, parentGoalId)) === undefined) {
    throw notFound('Objetivo pai não encontrado.');
  }
}

async function resolveArea(ctx: GoalsContext, input: { areaId?: string; areaKey?: string }) {
  const area =
    input.areaId !== undefined
      ? await findGoalAreaById(ctx.db, input.areaId)
      : await findGoalAreaByKey(ctx.db, input.areaKey ?? '');
  if (area === undefined) throw notFound('Área da vida não encontrada.');
  return area;
}

export async function createGoal(
  ctx: GoalsContext,
  request: MutatingRequest,
  input: CreateLifeGoalRequest,
): Promise<IdempotentResult> {
  const area = await resolveArea(ctx, input);
  await assertParent(ctx, input.parentGoalId ?? null);
  assertDateOrder({ startDate: input.startDate ?? null, targetDate: input.targetDate ?? null });

  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if ((await findGoalByAreaAndTitle(ctx.db, area.id, input.title)) !== undefined) {
          throw conflict('Já existe objetivo com este título na área.');
        }
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const row: GoalRow = {
        id,
        areaId: area.id,
        areaKey: area.key,
        areaName: area.name,
        parentGoalId: input.parentGoalId ?? null,
        title: input.title,
        description: input.description ?? null,
        horizon: input.horizon ?? 'medium',
        status: input.status ?? 'active',
        priority: input.priority ?? 3,
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        successCriteria: input.successCriteria ?? null,
        progressMode: input.progressMode ?? 'manual',
        manualProgress: input.manualProgress ?? null,
        achievedAt: null,
        archivedAt: null,
        sourceId: MANUAL_SOURCE_ID,
        version: 1,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const dto = goalToDto(row, emptyBundle(defaultWindow(clockFor(ctx).today)), clockFor(ctx));
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, dto),
        statements: [
          insertLifeGoalStatement({
            id,
            areaId: area.id,
            parentGoalId: row.parentGoalId,
            title: row.title,
            description: row.description,
            horizon: row.horizon,
            status: row.status,
            priority: row.priority,
            startDate: row.startDate,
            targetDate: row.targetDate,
            successCriteria: row.successCriteria,
            progressMode: row.progressMode,
            manualProgress: row.manualProgress,
            sourceId: MANUAL_SOURCE_ID,
            opId,
            now,
          }),
          auditStatement({
            entityType: 'goal',
            entityId: id,
            action: 'create',
            actorType: 'user',
            actorId: ctx.subject,
            afterJson: JSON.stringify(goalAuditSnapshot(row)),
            requestId: ctx.requestId,
            ipHash: ctx.ipHash,
          }),
        ],
      };
    },
  );
}

function mergedGoal(row: GoalRow, input: UpdateGoalRequest): GoalValues {
  return {
    title: input.title ?? row.title,
    description: input.description === undefined ? row.description : input.description,
    horizon: input.horizon ?? row.horizon,
    priority: input.priority ?? row.priority,
    startDate: input.startDate === undefined ? row.startDate : input.startDate,
    targetDate: input.targetDate === undefined ? row.targetDate : input.targetDate,
    successCriteria:
      input.successCriteria === undefined ? row.successCriteria : input.successCriteria,
    progressMode: input.progressMode ?? row.progressMode,
    manualProgress: input.manualProgress === undefined ? row.manualProgress : input.manualProgress,
    parentGoalId: input.parentGoalId === undefined ? row.parentGoalId : input.parentGoalId,
  };
}

export async function updateGoal(
  ctx: GoalsContext,
  request: MutatingRequest,
  id: string,
  input: UpdateGoalRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await findGoalById(ctx.db, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const row = await requireVersion(ctx, id, expectedVersion);
        const next = mergedGoal(row, input);
        assertDateOrder(next);
        await assertParent(ctx, next.parentGoalId, id);
        if (
          input.title !== undefined &&
          input.title !== row.title &&
          (await findGoalByAreaAndTitle(ctx.db, row.areaId, input.title)) !== undefined
        ) {
          throw conflict('Já existe objetivo com este título na área.');
        }
      },
    },
    ({ opId, now }) => {
      if (snapshot === undefined) throw notFound('Objetivo não encontrado.');
      const values = mergedGoal(snapshot, input);
      const after: GoalRow = {
        ...snapshot,
        ...values,
        version: snapshot.version + 1,
        updatedAt: now,
      };
      const clock = clockFor(ctx);
      const dto = goalToDto(after, emptyBundle(defaultWindow(clock.today)), clock);
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, dto),
        statements: [
          updateGoalStatement({
            id,
            expectedVersion: snapshot.version,
            changes: values,
            opId,
            now,
          }),
          auditStatement(
            {
              entityType: 'goal',
              entityId: id,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(goalAuditSnapshot(snapshot)),
              afterJson: JSON.stringify(goalAuditSnapshot(after)),
              requestId: ctx.requestId,
              ipHash: ctx.ipHash,
            },
            true,
          ),
        ],
      };
    },
  );
}

type StatusKind = 'complete' | 'reopen' | 'archive';

function assertStatusTransition(row: GoalRow, kind: StatusKind): void {
  if (kind === 'complete' && row.status === 'achieved') {
    throw conflict('Objetivo já está concluído.');
  }
  if (
    kind === 'reopen' &&
    row.status !== 'achieved' &&
    row.status !== 'cancelled' &&
    row.archivedAt === null
  ) {
    throw conflict('Objetivo não pode ser reaberto no estado atual.');
  }
  if (kind === 'archive' && row.archivedAt !== null) {
    throw conflict('Objetivo já está arquivado.');
  }
}

async function mutateGoalStatus(
  ctx: GoalsContext,
  request: MutatingRequest,
  id: string,
  expectedVersion: number | undefined,
  kind: StatusKind,
): Promise<IdempotentResult> {
  const snapshot = await findGoalById(ctx.db, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        assertStatusTransition(await requireVersion(ctx, id, expectedVersion), kind);
      },
    },
    ({ opId, now }) => {
      if (snapshot === undefined) throw notFound('Objetivo não encontrado.');
      const after: GoalRow = {
        ...snapshot,
        status: kind === 'complete' ? 'achieved' : 'active',
        achievedAt: kind === 'complete' ? now : null,
        archivedAt: kind === 'archive' ? now : null,
        version: snapshot.version + 1,
        updatedAt: now,
      };
      const clock = clockFor(ctx);
      const dto = goalToDto(after, emptyBundle(defaultWindow(clock.today)), clock);
      const statement =
        kind === 'archive'
          ? setGoalArchivedStatement({
              id,
              expectedVersion: snapshot.version,
              archivedAt: now,
              opId,
              now,
            })
          : setGoalStatusStatement({
              id,
              expectedVersion: snapshot.version,
              status: after.status,
              achievedAt: after.achievedAt,
              opId,
              now,
            });
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, dto),
        statements: [
          statement,
          auditStatement(
            {
              entityType: 'goal',
              entityId: id,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(goalAuditSnapshot(snapshot)),
              afterJson: JSON.stringify(goalAuditSnapshot(after)),
              requestId: ctx.requestId,
              ipHash: ctx.ipHash,
            },
            true,
          ),
        ],
      };
    },
  );
}

export function completeGoal(
  ctx: GoalsContext,
  request: MutatingRequest,
  id: string,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  return mutateGoalStatus(ctx, request, id, expectedVersion, 'complete');
}

export function reopenGoal(
  ctx: GoalsContext,
  request: MutatingRequest,
  id: string,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  return mutateGoalStatus(ctx, request, id, expectedVersion, 'reopen');
}

export function archiveGoal(
  ctx: GoalsContext,
  request: MutatingRequest,
  id: string,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  return mutateGoalStatus(ctx, request, id, expectedVersion, 'archive');
}

export async function updateGoalProgress(
  ctx: GoalsContext,
  request: MutatingRequest,
  id: string,
  input: { manualProgress: number },
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await findGoalById(ctx.db, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await requireVersion(ctx, id, expectedVersion);
      },
    },
    ({ opId, now }) => {
      if (snapshot === undefined) throw notFound('Objetivo não encontrado.');
      const values = mergedGoal(snapshot, {
        progressMode: 'manual',
        manualProgress: input.manualProgress,
      });
      const after: GoalRow = {
        ...snapshot,
        ...values,
        version: snapshot.version + 1,
        updatedAt: now,
      };
      const clock = clockFor(ctx);
      const dto = goalToDto(after, emptyBundle(defaultWindow(clock.today)), clock);
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, dto),
        statements: [
          updateGoalStatement({
            id,
            expectedVersion: snapshot.version,
            changes: values,
            opId,
            now,
          }),
          auditStatement(
            {
              entityType: 'goal',
              entityId: id,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(goalAuditSnapshot(snapshot)),
              afterJson: JSON.stringify(goalAuditSnapshot(after)),
              requestId: ctx.requestId,
              ipHash: ctx.ipHash,
            },
            true,
          ),
        ],
      };
    },
  );
}

export async function createMilestone(
  ctx: GoalsContext,
  request: MutatingRequest,
  goalId: string,
  input: CreateMilestoneRequest,
): Promise<IdempotentResult> {
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await goalOr404(ctx, goalId);
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const status = input.status ?? 'pending';
      const row: GoalMilestoneRow = {
        id,
        goalId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        status,
        completedAt: status === 'completed' ? now : null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, milestoneToDto(row)),
        statements: [
          insertMilestoneStatement({
            id,
            goalId,
            title: row.title,
            description: row.description,
            dueDate: row.dueDate,
            status: row.status,
            completedAt: row.completedAt,
            sourceId: MANUAL_SOURCE_ID,
            opId,
            now,
          }),
          auditStatement({
            entityType: 'goal_milestone',
            entityId: id,
            action: 'create',
            actorType: 'user',
            actorId: ctx.subject,
            afterJson: JSON.stringify(milestoneAuditSnapshot(row)),
            requestId: ctx.requestId,
            ipHash: ctx.ipHash,
          }),
        ],
      };
    },
  );
}

export async function updateMilestone(
  ctx: GoalsContext,
  request: MutatingRequest,
  goalId: string,
  milestoneId: string,
  input: UpdateMilestoneRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await findMilestoneById(ctx.db, milestoneId);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await goalOr404(ctx, goalId);
        const row = await findMilestoneById(ctx.db, milestoneId);
        if (row === undefined || row.goalId !== goalId) throw notFound('Marco não encontrado.');
        if (expectedVersion === undefined || row.version !== expectedVersion) {
          throw conflict('Marco foi alterado por outra operação.');
        }
      },
    },
    ({ opId, now }) => {
      if (snapshot === undefined || snapshot.goalId !== goalId) {
        throw notFound('Marco não encontrado.');
      }
      const status = input.status ?? snapshot.status;
      const after: GoalMilestoneRow = {
        ...snapshot,
        title: input.title ?? snapshot.title,
        description: input.description === undefined ? snapshot.description : input.description,
        dueDate: input.dueDate === undefined ? snapshot.dueDate : input.dueDate,
        status,
        completedAt: status === 'completed' ? (snapshot.completedAt ?? now) : null,
        version: snapshot.version + 1,
        updatedAt: now,
      };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, milestoneToDto(after)),
        statements: [
          updateMilestoneStatement({
            id: milestoneId,
            expectedVersion: snapshot.version,
            title: after.title,
            description: after.description,
            dueDate: after.dueDate,
            status: after.status,
            completedAt: after.completedAt,
            opId,
            now,
          }),
          auditStatement(
            {
              entityType: 'goal_milestone',
              entityId: milestoneId,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(milestoneAuditSnapshot(snapshot)),
              afterJson: JSON.stringify(milestoneAuditSnapshot(after)),
              requestId: ctx.requestId,
              ipHash: ctx.ipHash,
            },
            true,
          ),
        ],
      };
    },
  );
}
