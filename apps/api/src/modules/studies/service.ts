import { sql } from 'drizzle-orm';
import {
  areas,
  auditStatement,
  findCourseById,
  findMetricByKey,
  findStudyGoalByTitle,
  findObservationById,
  findStudySessionById,
  insertCourseStatement,
  insertEventStatement,
  insertGoalMetricStatement,
  insertGoalStatement,
  insertObservationStatement,
  insertStudySessionStatement,
  listActiveObservationsForMetric,
  listCourses,
  listObservationsForSession,
  listStudyGoals,
  listStudySessions,
  newId,
  softDeleteSessionStatement,
  supersedeObservationStatement,
  type CourseRow,
  type Database,
  type ObservationRow,
  type StudyGoalRow,
  type StudySessionRow,
} from '@personal-os/db';
import {
  assertDateRange,
  assertIanaTimezone,
  buildCourseBreakdown,
  buildDailySeries,
  buildWeeklySeries,
  businessRule,
  calculateGoalProgress,
  compareStudyPeriods,
  conflict,
  dayCount,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  GOAL_PROGRESS_ALGORITHM,
  localDateFor,
  makeCursor,
  MAX_PAGE_SIZE,
  notFound,
  shiftLocalDate,
  STUDY_MINUTES_ALGORITHM,
  STUDY_MINUTES_METRIC_KEY,
  STUDY_MINUTES_SOURCE_ID,
  summarizeStudyMinutes,
  validationError,
  type DateRange,
  type GoalProgressInput,
} from '@personal-os/domain';
import { studyEventTitle } from '@personal-os/shared';
import type {
  CourseDto,
  CreateCourseRequest,
  CreateGoalRequest,
  CreateStudySessionRequest,
  GoalDto,
  ListSessionsQuery,
  ObservationDto,
  SeriesQuery,
  StudySessionDto,
  SupersedeObservationRequest,
} from '@personal-os/shared';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';

/** Área de Estudos criada pelo seed; ID fixo documentado no DATA_MODEL. */
const STUDIES_AREA_ID = '01a1fb52-074d-7043-a390-78a0731bdb52';
const MANUAL_SOURCE_ID = 'src_manual';
/** Teto de observações processadas por consulta; compatível com D1 Free. */
const STUDY_SAMPLE_LIMIT = 10_000;

export interface StudiesContext {
  db: Database;
  requestId: string;
  ipHash: string | null;
  subject: string;
  /** Instante UTC ISO-8601 com ms, injetado pelo chamador. */
  now: string;
  /** Fuso do usuário; `local_date` é sempre calculado aqui, nunca no servidor. */
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

/**
 * Snapshot de auditoria: campos estruturados e um `title` limitado, usado pela
 * linha do tempo. Notas, descrição e motivo ficam fora do `audit_log`.
 * Chaves nullable aparecem explicitamente: `null` ≠ ausente.
 */
function sessionSnapshot(row: StudySessionRow | StudySessionDto) {
  return {
    id: row.id,
    courseId: row.courseId ?? null,
    title: row.topic,
    startedAt: row.startedAt,
    localDate: row.localDate,
    timezone: row.timezone,
    durationMinutes: row.durationMinutes,
    unitsCompleted: row.unitsCompleted ?? null,
    sourceId: row.sourceId,
    version: row.version,
    deletedAt: 'deletedAt' in row ? (row.deletedAt ?? null) : null,
  };
}

function observationSnapshot(row: ObservationRow | ObservationDto) {
  return {
    id: row.id,
    metricId: row.metricId,
    observedAt: row.observedAt,
    localDate: row.localDate,
    timezone: row.timezone,
    valueNum: row.valueNum ?? null,
    sourceId: row.sourceId,
    algorithmVersion: row.algorithmVersion ?? null,
    supersededBy: row.supersededBy ?? null,
    studySessionId: row.studySessionId ?? null,
    courseId: row.courseId ?? null,
  };
}

export async function listAllCourses(ctx: StudiesContext) {
  return (await listCourses(ctx.db)).map(courseToDto);
}

export function courseToDto(row: CourseRow): CourseDto {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider ?? null,
    status: row.status as CourseDto['status'],
    startDate: row.startDate ?? null,
    targetEndDate: row.targetEndDate ?? null,
    plannedMinutes: row.plannedMinutes ?? null,
    version: row.version,
    createdAt: row.createdAt,
  };
}

export function sessionToDto(row: StudySessionRow): StudySessionDto {
  return {
    id: row.id,
    courseId: row.courseId ?? null,
    topic: row.topic,
    startedAt: row.startedAt,
    localDate: row.localDate,
    timezone: row.timezone,
    durationMinutes: row.durationMinutes,
    unitsCompleted: row.unitsCompleted ?? null,
    sourceId: row.sourceId,
    version: row.version,
    createdAt: row.createdAt,
  };
}

export function observationToDto(row: ObservationRow): ObservationDto {
  return {
    id: row.id,
    metricId: row.metricId,
    observedAt: row.observedAt,
    localDate: row.localDate,
    timezone: row.timezone,
    valueNum: row.valueNum ?? null,
    valueText: row.valueText ?? null,
    sampleMarker: row.sampleMarker ?? null,
    sourceId: row.sourceId,
    algorithmVersion: row.algorithmVersion ?? null,
    supersededBy: row.supersededBy ?? null,
    studySessionId: row.studySessionId ?? null,
    courseId: row.courseId ?? null,
    createdOperationId: row.createdOperationId ?? null,
  };
}

function mutationContext(ctx: StudiesContext, request: MutatingRequest) {
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

export async function createCourse(
  ctx: StudiesContext,
  request: MutatingRequest,
  input: CreateCourseRequest,
): Promise<IdempotentResult> {
  return executeIdempotent(mutationContext(ctx, request), ({ opId, now }) => {
    const id = newId();
    const dto: CourseDto = {
      id,
      title: input.title,
      provider: input.provider ?? null,
      status: input.status ?? 'planned',
      startDate: input.startDate ?? null,
      targetEndDate: input.targetEndDate ?? null,
      plannedMinutes: input.plannedMinutes ?? null,
      version: 1,
      createdAt: now,
    };
    return {
      status: 201,
      bodyJson: envelope(ctx.requestId, dto),
      statements: [
        insertCourseStatement({
          id,
          title: input.title,
          provider: input.provider ?? null,
          status: dto.status,
          startDate: dto.startDate,
          targetEndDate: dto.targetEndDate,
          plannedMinutes: dto.plannedMinutes,
          sourceId: MANUAL_SOURCE_ID,
          opId,
          now,
        }),
        auditStatement({
          entityType: 'course',
          entityId: id,
          action: 'create',
          actorType: 'user',
          actorId: ctx.subject,
          afterJson: JSON.stringify({
            id,
            areaId: STUDIES_AREA_ID,
            title: input.title,
            status: dto.status,
            startDate: dto.startDate,
            targetEndDate: dto.targetEndDate,
            plannedMinutes: dto.plannedMinutes,
            version: 1,
          }),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
      ],
    };
  });
}

export async function createGoal(
  ctx: StudiesContext,
  request: MutatingRequest,
  input: CreateGoalRequest,
): Promise<IdempotentResult> {
  if (input.startDate == null || input.targetDate == null) {
    throw validationError('Meta exige data de início e data-alvo.');
  }
  if (input.targetDate < input.startDate) {
    throw validationError('A data-alvo não pode anteceder o início.');
  }
  const metric = await findMetricByKey(ctx.db, STUDY_MINUTES_METRIC_KEY);
  if (metric === undefined) throw notFound('Métrica study_minutes não encontrada.');

  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const existing = await findStudyGoalByTitle(ctx.db, STUDIES_AREA_ID, input.title);
        if (existing !== undefined) throw conflict('Já existe uma meta com este título.');
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const dto: GoalDto = {
        id,
        title: input.title,
        horizon: input.horizon,
        status: input.status,
        priority: input.priority,
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        targetMinutes: input.targetMinutes,
        progress: {
          percent: null,
          basis: 'unavailable',
          algorithmVersion: null,
          achieved: false,
          truncated: false,
        },
        progressSeries: [],
        sourceId: MANUAL_SOURCE_ID,
        version: 1,
        createdAt: now,
      };
      return {
        status: 201,
        bodyJson: envelope(ctx.requestId, dto),
        statements: [
          insertGoalStatement({
            id,
            title: input.title,
            horizon: input.horizon,
            status: input.status,
            priority: input.priority,
            startDate: dto.startDate,
            targetDate: dto.targetDate,
            sourceId: MANUAL_SOURCE_ID,
            opId,
            now,
          }),
          insertGoalMetricStatement({
            goalId: id,
            metricId: metric.id,
            targetMinutes: input.targetMinutes,
            now,
          }),
          auditStatement({
            entityType: 'goal',
            entityId: id,
            action: 'create',
            actorType: 'user',
            actorId: ctx.subject,
            afterJson: JSON.stringify({
              id,
              title: input.title,
              horizon: input.horizon,
              status: input.status,
              priority: input.priority,
              startDate: dto.startDate,
              targetDate: dto.targetDate,
              targetMinutes: input.targetMinutes,
              version: 1,
            }),
            requestId: ctx.requestId,
            ipHash: ctx.ipHash,
          }),
        ],
      };
    },
  );
}

export async function createStudySession(
  ctx: StudiesContext,
  request: MutatingRequest,
  input: CreateStudySessionRequest,
): Promise<IdempotentResult> {
  const timezone = assertIanaTimezone(input.timezone);
  const startedAtMs = Date.parse(input.startedAt);
  if (Number.isNaN(startedAtMs)) throw businessRule('startedAt inválido.');
  if (input.courseId !== undefined && input.courseId !== null) {
    const course = await findCourseById(ctx.db, input.courseId);
    if (course === undefined) throw notFound('Curso não encontrado.');
  }
  const metric = await findMetricByKey(ctx.db, STUDY_MINUTES_METRIC_KEY);
  if (metric === undefined) {
    throw businessRule('Métrica canônica study_minutes não está disponível.');
  }
  const localDate = localDateFor(startedAtMs, timezone);

  return executeIdempotent(mutationContext(ctx, request), ({ opId, now }) => {
    const sessionId = newId();
    const observationId = newId();
    const eventId = newId();
    const dto: StudySessionDto = {
      id: sessionId,
      courseId: input.courseId ?? null,
      topic: input.topic,
      startedAt: input.startedAt,
      localDate,
      timezone,
      durationMinutes: input.durationMinutes,
      unitsCompleted: input.unitsCompleted ?? null,
      sourceId: MANUAL_SOURCE_ID,
      version: 1,
      createdAt: now,
    };
    const sessionState = sessionSnapshot(dto);
    const observationState = {
      id: observationId,
      metricId: metric.id,
      observedAt: input.startedAt,
      localDate,
      timezone,
      valueNum: input.durationMinutes,
      sourceId: STUDY_MINUTES_SOURCE_ID,
      algorithmVersion: STUDY_MINUTES_ALGORITHM,
      supersededBy: null,
      studySessionId: sessionId,
      courseId: dto.courseId,
    };

    return {
      status: 201,
      bodyJson: envelope(ctx.requestId, dto),
      statements: [
        insertStudySessionStatement({
          id: sessionId,
          courseId: dto.courseId,
          topic: input.topic,
          startedAt: input.startedAt,
          localDate,
          timezone,
          durationMinutes: input.durationMinutes,
          unitsCompleted: dto.unitsCompleted,
          notes: input.notes ?? null,
          sourceId: MANUAL_SOURCE_ID,
          opId,
          now,
        }),
        insertObservationStatement({
          id: observationId,
          metricId: metric.id,
          observedAt: input.startedAt,
          localDate,
          timezone,
          valueNum: input.durationMinutes,
          sampleMarker: `session:${sessionId}`,
          sourceId: STUDY_MINUTES_SOURCE_ID,
          algorithmVersion: STUDY_MINUTES_ALGORITHM,
          studySessionId: sessionId,
          courseId: dto.courseId,
          opId,
          now,
        }),
        insertEventStatement({
          id: eventId,
          areaId: STUDIES_AREA_ID,
          courseId: dto.courseId,
          studySessionId: sessionId,
          title: studyEventTitle(input.topic),
          occurredAt: input.startedAt,
          localDate,
          timezone,
          durationMinutes: input.durationMinutes,
          sourceId: MANUAL_SOURCE_ID,
          opId,
          now,
        }),
        auditStatement({
          entityType: 'study_session',
          entityId: sessionId,
          action: 'create',
          actorType: 'user',
          actorId: ctx.subject,
          afterJson: JSON.stringify(sessionState),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
        auditStatement({
          entityType: 'metric_observation',
          entityId: observationId,
          action: 'create',
          actorType: 'user',
          actorId: ctx.subject,
          afterJson: JSON.stringify(observationState),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
        auditStatement({
          entityType: 'event',
          entityId: eventId,
          action: 'create',
          actorType: 'user',
          actorId: ctx.subject,
          afterJson: JSON.stringify({
            id: eventId,
            areaId: STUDIES_AREA_ID,
            courseId: dto.courseId,
            studySessionId: sessionId,
            eventType: 'study_session',
            occurredAt: input.startedAt,
            localDate,
            timezone,
            durationMinutes: input.durationMinutes,
            version: 1,
          }),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
      ],
    };
  });
}

export async function supersedeObservation(
  ctx: StudiesContext,
  request: MutatingRequest,
  observationId: string,
  input: SupersedeObservationRequest,
): Promise<IdempotentResult> {
  const original = await findObservationById(ctx.db, observationId);
  if (original === undefined) throw notFound('Observação não encontrada.');
  if (original.supersededBy !== null) {
    throw conflict('Observação já foi corrigida.');
  }
  if (original.valueNum === null) {
    throw businessRule('Somente observações numéricas podem ser corrigidas.');
  }

  return executeIdempotent(mutationContext(ctx, request), ({ opId, now }) => {
    const replacementId = newId();
    const replacement = {
      id: replacementId,
      metricId: original.metricId,
      observedAt: original.observedAt,
      localDate: original.localDate,
      timezone: original.timezone,
      valueNum: input.valueNum,
      valueText: null,
      sampleMarker: `correction:${original.id}`,
      sourceId: MANUAL_SOURCE_ID,
      algorithmVersion: null,
      supersededBy: null,
      studySessionId: original.studySessionId,
      courseId: original.courseId,
      createdOperationId: opId,
    };
    const before = observationSnapshot(original);
    const after = { ...before, supersededBy: replacementId };

    return {
      status: 200,
      bodyJson: envelope(ctx.requestId, replacement),
      statements: [
        // A FK `superseded_by` é imediata: a substituição precisa existir antes
        // do vínculo. O trigger `metric_observations_supersede_once` aborta uma
        // segunda correção concorrente, e o batch desfaz a inserção órfã.
        insertObservationStatement({
          id: replacementId,
          metricId: original.metricId,
          observedAt: original.observedAt,
          localDate: original.localDate,
          timezone: original.timezone,
          valueNum: input.valueNum,
          sampleMarker: replacement.sampleMarker,
          sourceId: replacement.sourceId,
          algorithmVersion: replacement.algorithmVersion,
          studySessionId: original.studySessionId ?? '',
          courseId: original.courseId,
          opId,
          now,
        }),
        supersedeObservationStatement({
          id: original.id,
          replacementId,
          expectedMarker: original.sampleMarker,
        }),
        auditStatement({
          entityType: 'metric_observation',
          entityId: original.id,
          action: 'update',
          actorType: 'user',
          actorId: ctx.subject,
          beforeJson: JSON.stringify(before),
          afterJson: JSON.stringify(after),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
        auditStatement({
          entityType: 'metric_observation',
          entityId: replacementId,
          action: 'create',
          actorType: 'user',
          actorId: ctx.subject,
          afterJson: JSON.stringify(observationSnapshot(replacement)),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
      ],
    };
  });
}

export async function softDeleteSession(
  ctx: StudiesContext,
  request: MutatingRequest,
  sessionId: string,
  ifMatchVersion: number | undefined,
): Promise<IdempotentResult> {
  const session = await findStudySessionById(ctx.db, sessionId);
  if (session === undefined) throw notFound('Sessão não encontrada.');
  if (session.deletedAt !== null) throw conflict('Sessão já foi excluída.');
  const expectedVersion = ifMatchVersion ?? session.version;
  if (session.version !== expectedVersion) {
    throw conflict('Versão da sessão divergente; recarregue e tente novamente.');
  }

  return executeIdempotent(mutationContext(ctx, request), ({ opId, now }) => {
    return {
      status: 200,
      bodyJson: envelope(ctx.requestId, {
        id: sessionId,
        deleted: true,
        version: expectedVersion + 1,
      }),
      statements: [
        softDeleteSessionStatement({
          id: sessionId,
          expectedVersion,
          deletedAt: now,
          opId,
        }),
        auditStatement({
          entityType: 'study_session',
          entityId: sessionId,
          action: 'delete',
          actorType: 'user',
          actorId: ctx.subject,
          beforeJson: JSON.stringify(sessionSnapshot(session)),
          afterJson: JSON.stringify({
            ...sessionSnapshot(session),
            deletedAt: now,
            version: expectedVersion + 1,
          }),
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
        }),
      ],
    };
  });
}

export function listAreas(ctx: StudiesContext) {
  return ctx.db
    .select({
      id: areas.id,
      key: areas.key,
      name: areas.name,
      isActive: sql<boolean>`CASE WHEN ${areas.isActive} = 1 THEN 1 ELSE 0 END`,
      version: areas.version,
    })
    .from(areas)
    .where(sql`${areas.deletedAt} IS NULL`)
    .orderBy(sql`${areas.sortOrder} ASC`)
    .limit(20);
}

export async function listSessions(ctx: StudiesContext, query: ListSessionsQuery) {
  const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const parsedCursor = parseCursor(query.cursor);
  const rows = await listStudySessions(ctx.db, {
    from: query.from,
    to: query.to,
    courseId: query.courseId,
    cursor: parsedCursor,
    limit,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last !== undefined ? makeCursor(last.startedAt, last.id) : undefined;
  return { items: page.map(sessionToDto), nextCursor, hasMore };
}

function parseCursor(cursor: string | undefined): { sortValue: string; id: string } | undefined {
  if (cursor === undefined) return undefined;
  // Decodificação e validação vivem no domínio; aqui apenas separamos o par.
  const decoded = decodeCursor(cursor);
  const separator = decoded.indexOf('\u0000');
  if (separator < 0) throw businessRule('Cursor inválido.');
  return { sortValue: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
}

export async function getSessionDetail(ctx: StudiesContext, id: string) {
  const session = await findStudySessionById(ctx.db, id);
  if (session === undefined || session.deletedAt !== null) throw notFound('Sessão não encontrada.');
  const observations = await listObservationsForSession(ctx.db, id);
  return { session: sessionToDto(session), observations: observations.map(observationToDto) };
}

export async function getObservationsForSession(ctx: StudiesContext, id: string) {
  const session = await findStudySessionById(ctx.db, id);
  if (session === undefined) throw notFound('Sessão não encontrada.');
  const observations = await listObservationsForSession(ctx.db, id);
  return observations.map(observationToDto);
}

interface StudySample {
  localDate: string;
  valueNum: number;
  courseId: string | null;
}

/**
 * Busca `limit + 1` linhas para detectar corte sem uma `COUNT(*)` adicional
 * (o dashboard já opera no limite de 8 queries). A linha extra nunca é
 * processada: o orçamento de cpu continua sobre 10.000 amostras.
 */
export function splitTruncatedRows(
  rows: readonly { localDate: string; valueNum: number; courseId: string | null }[],
  limit = STUDY_SAMPLE_LIMIT,
): { samples: StudySample[]; truncated: boolean } {
  return {
    samples: rows.slice(0, limit).map((row) => ({
      localDate: row.localDate,
      valueNum: row.valueNum,
      courseId: row.courseId,
    })),
    truncated: rows.length > limit,
  };
}

async function loadSamples(
  ctx: StudiesContext,
  metricId: string,
  from: string,
  to: string,
  courseId?: string,
): Promise<{ samples: StudySample[]; truncated: boolean }> {
  const rows = await listActiveObservationsForMetric(
    ctx.db,
    metricId,
    from,
    to,
    STUDY_SAMPLE_LIMIT + 1,
    courseId,
  );
  return splitTruncatedRows(rows);
}

async function samplesFor(
  ctx: StudiesContext,
  range: DateRange,
  courseId?: string,
): Promise<{
  metricId: string;
  metricKey: string;
  unit: string;
  samples: StudySample[];
  truncated: boolean;
}> {
  const metric = await findMetricByKey(ctx.db, STUDY_MINUTES_METRIC_KEY);
  if (metric === undefined) throw notFound('Métrica study_minutes não encontrada.');
  const { samples, truncated } = await loadSamples(ctx, metric.id, range.from, range.to, courseId);
  return {
    metricId: metric.id,
    metricKey: metric.key,
    unit: metric.unit,
    samples,
    truncated,
  };
}

function samplesInRange(samples: readonly StudySample[], range: DateRange): StudySample[] {
  return samples.filter((sample) => sample.localDate >= range.from && sample.localDate <= range.to);
}

function goalRange(goal: StudyGoalRow): DateRange {
  if (goal.startDate === null || goal.targetDate === null) {
    throw businessRule('Meta sem período definido.');
  }
  return assertDateRange({ from: goal.startDate, to: goal.targetDate });
}

/** Busca o maior intervalo necessário para cobrir o painel e todas as metas. */
function fetchRangeFor(range: DateRange, goals: readonly StudyGoalRow[]): DateRange {
  let from = range.from;
  let to = range.to;
  for (const goal of goals) {
    if (goal.startDate === null || goal.targetDate === null) continue;
    if (goal.startDate < from) from = goal.startDate;
    if (goal.targetDate > to) to = goal.targetDate;
  }
  return { from, to };
}

function isGoalHorizon(value: string): value is GoalDto['horizon'] {
  return value === 'short' || value === 'medium' || value === 'long';
}

function isGoalStatus(value: string): value is GoalDto['status'] {
  return (
    value === 'draft' ||
    value === 'active' ||
    value === 'paused' ||
    value === 'achieved' ||
    value === 'cancelled'
  );
}

function goalToDto(
  goal: StudyGoalRow,
  samples: readonly StudySample[],
  window: DateRange,
  truncated: boolean,
): GoalDto {
  const range = goalRange(goal);
  const goalSamples = samplesInRange(samples, range);
  // Ausência de observação é "sem dados", não zero minutos acumulados.
  const currentValue =
    goalSamples.length === 0 ? null : goalSamples.reduce((sum, sample) => sum + sample.valueNum, 0);
  const status = isGoalStatus(goal.status) ? goal.status : 'draft';
  const progressInput: GoalProgressInput = {
    progressMode:
      goal.progressMode === 'manual' ||
      goal.progressMode === 'metrics' ||
      goal.progressMode === 'hybrid' ||
      goal.progressMode === 'tasks'
        ? goal.progressMode
        : 'metrics',
    manualProgress: goal.manualProgress,
    status,
    metrics: [
      {
        baselineValue: 0,
        targetValue: goal.targetMinutes,
        direction: 'increase',
        currentValue,
      },
    ],
  };
  const progress = { ...calculateGoalProgress(progressInput), truncated };
  const seriesFrom = range.from > window.from ? range.from : window.from;
  const seriesTo = range.to < window.to ? range.to : window.to;
  const progressSeries =
    seriesFrom <= seriesTo ? buildDailySeries(goalSamples, { from: seriesFrom, to: seriesTo }) : [];
  return {
    id: goal.id,
    title: goal.title,
    horizon: isGoalHorizon(goal.horizon) ? goal.horizon : 'medium',
    status,
    priority: goal.priority,
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    targetMinutes: goal.targetMinutes,
    progress,
    progressSeries,
    sourceId: goal.sourceId,
    version: goal.version,
    createdAt: goal.createdAt,
  };
}

export async function getSeries(ctx: StudiesContext, query: SeriesQuery) {
  const range = assertDateRange({ from: query.from, to: query.to });
  if (
    query.courseId !== undefined &&
    (await findCourseById(ctx.db, query.courseId)) === undefined
  ) {
    throw notFound('Curso não encontrado.');
  }
  const granularity = query.granularity ?? 'day';
  const { metricKey, unit, samples, truncated } = await samplesFor(ctx, range, query.courseId);
  const points =
    granularity === 'week' ? buildWeeklySeries(samples, range) : buildDailySeries(samples, range);
  return {
    metricKey,
    unit,
    granularity,
    points,
    algorithmVersion: STUDY_MINUTES_ALGORITHM,
    timezone: ctx.timezone,
    truncated,
  };
}

export async function listGoals(
  ctx: StudiesContext,
  query: { from: string; to: string },
): Promise<GoalDto[]> {
  const range = assertDateRange(query);
  const metric = await findMetricByKey(ctx.db, STUDY_MINUTES_METRIC_KEY);
  if (metric === undefined) throw notFound('Métrica study_minutes não encontrada.');
  const goals = await listStudyGoals(ctx.db, STUDIES_AREA_ID);
  const fetchRange = fetchRangeFor(range, goals);
  const { samples, truncated } = await loadSamples(ctx, metric.id, fetchRange.from, fetchRange.to);
  return goals.map((goal) => goalToDto(goal, samples, range, truncated));
}

export async function getDashboard(
  ctx: StudiesContext,
  query: { from: string; to: string; courseId?: string },
) {
  const range = assertDateRange({ from: query.from, to: query.to });
  if (
    query.courseId !== undefined &&
    (await findCourseById(ctx.db, query.courseId)) === undefined
  ) {
    throw notFound('Curso não encontrado.');
  }
  const metric = await findMetricByKey(ctx.db, STUDY_MINUTES_METRIC_KEY);
  if (metric === undefined) throw notFound('Métrica study_minutes não encontrada.');
  const goals = await listStudyGoals(ctx.db, STUDIES_AREA_ID);
  const previousTo = shiftLocalDate(range.from, -1);
  const previousFrom = shiftLocalDate(previousTo, -(dayCount(range.from, range.to) - 1));
  const fetchRange = fetchRangeFor({ from: previousFrom, to: range.to }, goals);
  const { samples, truncated } = await loadSamples(
    ctx,
    metric.id,
    fetchRange.from,
    fetchRange.to,
    query.courseId,
  );
  const currentSamples = samplesInRange(samples, range);
  const previousSamples = samplesInRange(samples, { from: previousFrom, to: previousTo });
  // Metas pertencem à área, não ao curso: o filtro do painel não pode alterar
  // o progresso exibido. Só consulta novamente quando há filtro ativo.
  const goalResult =
    query.courseId === undefined
      ? { samples, truncated }
      : await loadSamples(ctx, metric.id, fetchRange.from, fetchRange.to);
  const courses = await listCourses(ctx.db);
  const titles = new Map(courses.map((course) => [course.id, course.title]));
  const byCourse = buildCourseBreakdown(
    currentSamples.map((sample) => ({
      courseId: sample.courseId,
      minutes: sample.valueNum,
      sessionCount: 1,
    })),
  ).map((row) => ({
    ...row,
    title: row.courseId === null ? null : (titles.get(row.courseId) ?? null),
  }));
  const currentSummary = summarizeStudyMinutes(currentSamples);
  const comparison = compareStudyPeriods(currentSummary, summarizeStudyMinutes(previousSamples));

  return {
    period: {
      from: range.from,
      to: range.to,
      previousFrom,
      previousTo,
      timezone: ctx.timezone,
    },
    summary: currentSummary,
    series: buildDailySeries(currentSamples, range),
    byCourse,
    // DTO allowlist: o domínio também devolve os resumos completos, que não
    // fazem parte do contrato público do dashboard.
    comparison: {
      totalMinutes: comparison.totalMinutes,
      sessionCount: comparison.sessionCount,
      daysStudied: comparison.daysStudied,
    },
    goals: goals.map((goal) => goalToDto(goal, goalResult.samples, range, goalResult.truncated)),
    algorithms: {
      studyMinutes: STUDY_MINUTES_ALGORITHM,
      goalProgress: GOAL_PROGRESS_ALGORITHM,
    },
    generatedAt: ctx.now,
    truncated: truncated || goalResult.truncated,
  };
}
