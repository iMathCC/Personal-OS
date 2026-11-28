import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import {
  courses,
  goalMetrics,
  goals,
  idempotencyKeys,
  idempotencyKeyReservations,
  metricObservations,
  metrics,
  operationResults,
  studySessions,
} from '../schema';

export interface MetricRow {
  id: string;
  key: string;
  name: string;
  unit: string;
  valueType: string;
  aggregation: string;
  sourceId: string;
  version: number;
}

export interface CourseRow {
  id: string;
  title: string;
  provider: string | null;
  status: string;
  startDate: string | null;
  targetEndDate: string | null;
  plannedMinutes: number | null;
  version: number;
  createdAt: string;
}

export interface StudySessionRow {
  id: string;
  courseId: string | null;
  topic: string;
  startedAt: string;
  localDate: string;
  timezone: string;
  durationMinutes: number;
  unitsCompleted: number | null;
  sourceId: string;
  version: number;
  deletedAt: string | null;
  createdAt: string;
}

export interface ObservationRow {
  id: string;
  metricId: string;
  observedAt: string;
  localDate: string;
  timezone: string;
  valueNum: number | null;
  valueText: string | null;
  sampleMarker: string | null;
  sourceId: string;
  algorithmVersion: string | null;
  supersededBy: string | null;
  studySessionId: string | null;
  courseId: string | null;
  createdOperationId: string | null;
}

/** Meta de Estudos já vinculada à métrica `study_minutes`. */
export interface StudyGoalRow {
  id: string;
  title: string;
  horizon: string;
  status: string;
  priority: number;
  startDate: string | null;
  targetDate: string | null;
  targetMinutes: number;
  progressMode: string;
  manualProgress: number | null;
  sourceId: string;
  version: number;
  createdAt: string;
}

export interface ReservationRow {
  key: string;
  operationId: string;
  requestHash: string;
  createdAt: string;
}

export interface OperationResultRow {
  key: string;
  operationId: string;
  requestHash: string;
  statusCode: number;
  bodyJson: string;
  createdAt: string;
}

export interface IdempotencyStateRow {
  key: string;
  opId: string | null;
  state: string;
  attempt: number;
  requestHash: string;
  responseJson: string | null;
  errorJson: string | null;
  statusCode: number;
  expiresAt: string;
}

const COURSE_FIELDS = {
  id: courses.id,
  title: courses.title,
  provider: courses.provider,
  status: courses.status,
  startDate: courses.startDate,
  targetEndDate: courses.targetEndDate,
  plannedMinutes: courses.plannedMinutes,
  version: courses.version,
  createdAt: courses.createdAt,
} as const;

const SESSION_FIELDS = {
  id: studySessions.id,
  courseId: studySessions.courseId,
  topic: studySessions.topic,
  startedAt: studySessions.startedAt,
  localDate: studySessions.localDate,
  timezone: studySessions.timezone,
  durationMinutes: studySessions.durationMinutes,
  unitsCompleted: studySessions.unitsCompleted,
  sourceId: studySessions.sourceId,
  version: studySessions.version,
  deletedAt: studySessions.deletedAt,
  createdAt: studySessions.createdAt,
} as const;

const OBSERVATION_FIELDS = {
  id: metricObservations.id,
  metricId: metricObservations.metricId,
  observedAt: metricObservations.observedAt,
  localDate: metricObservations.localDate,
  timezone: metricObservations.timezone,
  valueNum: metricObservations.valueNum,
  valueText: metricObservations.valueText,
  sampleMarker: metricObservations.sampleMarker,
  sourceId: metricObservations.sourceId,
  algorithmVersion: metricObservations.algorithmVersion,
  supersededBy: metricObservations.supersededBy,
  studySessionId: metricObservations.studySessionId,
  courseId: metricObservations.courseId,
  createdOperationId: metricObservations.createdOperationId,
} as const;

export function findMetricByKey(db: Database, key: string): Promise<MetricRow | undefined> {
  return db
    .select({
      id: metrics.id,
      key: metrics.key,
      name: metrics.name,
      unit: metrics.unit,
      valueType: metrics.valueType,
      aggregation: metrics.aggregation,
      sourceId: metrics.sourceId,
      version: metrics.version,
    })
    .from(metrics)
    .where(sql`${metrics.key} = ${key} AND ${metrics.deletedAt} IS NULL`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function findCourseById(db: Database, id: string): Promise<CourseRow | undefined> {
  return db
    .select(COURSE_FIELDS)
    .from(courses)
    .where(sql`${courses.id} = ${id} AND ${courses.deletedAt} IS NULL`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function listCourses(db: Database): Promise<CourseRow[]> {
  return db
    .select(COURSE_FIELDS)
    .from(courses)
    .where(sql`${courses.deletedAt} IS NULL`)
    .orderBy(sql`${courses.title} ASC`)
    .limit(200);
}

export function findStudySessionById(
  db: Database,
  id: string,
): Promise<StudySessionRow | undefined> {
  return db
    .select(SESSION_FIELDS)
    .from(studySessions)
    .where(sql`${studySessions.id} = ${id}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export interface SessionFilters {
  from?: string;
  to?: string;
  courseId?: string;
  cursor?: { sortValue: string; id: string };
  limit: number;
}

export async function listStudySessions(
  db: Database,
  filters: SessionFilters,
): Promise<StudySessionRow[]> {
  const conditions = [sql`${studySessions.deletedAt} IS NULL`];
  if (filters.from !== undefined)
    conditions.push(sql`${studySessions.localDate} >= ${filters.from}`);
  if (filters.to !== undefined) conditions.push(sql`${studySessions.localDate} <= ${filters.to}`);
  if (filters.courseId !== undefined)
    conditions.push(sql`${studySessions.courseId} = ${filters.courseId}`);
  if (filters.cursor !== undefined) {
    const { sortValue, id } = filters.cursor;
    conditions.push(
      sql`(${studySessions.startedAt} < ${sortValue} OR (${studySessions.startedAt} = ${sortValue} AND ${studySessions.id} < ${id}))`,
    );
  }
  return db
    .select(SESSION_FIELDS)
    .from(studySessions)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`${studySessions.startedAt} DESC, ${studySessions.id} DESC`)
    .limit(filters.limit + 1);
}

export function findObservationById(db: Database, id: string): Promise<ObservationRow | undefined> {
  return db
    .select(OBSERVATION_FIELDS)
    .from(metricObservations)
    .where(sql`${metricObservations.id} = ${id}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function listObservationsForSession(
  db: Database,
  sessionId: string,
): Promise<ObservationRow[]> {
  return db
    .select(OBSERVATION_FIELDS)
    .from(metricObservations)
    .where(sql`${metricObservations.studySessionId} = ${sessionId}`)
    .orderBy(sql`${metricObservations.observedAt} ASC, ${metricObservations.id} ASC`)
    .limit(100);
}

export interface ObservationSampleRow {
  id: string;
  localDate: string;
  /** O filtro SQL garante NOT NULL; o cast tipado evita checagem redundante. */
  valueNum: number;
  courseId: string | null;
}

export function listActiveObservationsForMetric(
  db: Database,
  metricId: string,
  from: string,
  to: string,
  limit = 10_000,
  courseId?: string,
): Promise<ObservationSampleRow[]> {
  const conditions = [
    sql`${metricObservations.metricId} = ${metricId}`,
    sql`${metricObservations.localDate} BETWEEN ${from} AND ${to}`,
    sql`${metricObservations.supersededBy} IS NULL`,
    sql`${metricObservations.valueNum} IS NOT NULL`,
  ];
  if (courseId !== undefined) {
    conditions.push(sql`${metricObservations.courseId} = ${courseId}`);
  }
  return db
    .select({
      id: metricObservations.id,
      localDate: metricObservations.localDate,
      valueNum: sql<number>`${metricObservations.valueNum}`,
      courseId: metricObservations.courseId,
    })
    .from(metricObservations)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`${metricObservations.localDate} ASC, ${metricObservations.id} ASC`)
    .limit(limit);
}

/** Usa o índice único parcial `goals_area_title_unique` para evitar erro 500. */
export async function findStudyGoalByTitle(
  db: Database,
  areaId: string,
  title: string,
): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: goals.id })
    .from(goals)
    .where(
      sql`${goals.areaId} = ${areaId} AND ${goals.title} = ${title} AND ${goals.deletedAt} IS NULL`,
    )
    .limit(1);
  return rows[0];
}

/** Metas de estudo com alvo em minutos, usando os índices já existentes. */
export function listStudyGoals(db: Database, areaId: string, limit = 100): Promise<StudyGoalRow[]> {
  return db
    .select({
      id: goals.id,
      title: goals.title,
      horizon: goals.horizon,
      status: goals.status,
      priority: goals.priority,
      startDate: goals.startDate,
      targetDate: goals.targetDate,
      targetMinutes: sql<number>`${goalMetrics.targetValue}`,
      progressMode: goals.progressMode,
      manualProgress: goals.manualProgress,
      sourceId: goals.sourceId,
      version: goals.version,
      createdAt: goals.createdAt,
    })
    .from(goals)
    .innerJoin(goalMetrics, sql`${goalMetrics.goalId} = ${goals.id}`)
    .innerJoin(metrics, sql`${metrics.id} = ${goalMetrics.metricId}`)
    .where(
      sql`${goals.areaId} = ${areaId}
        AND ${goals.deletedAt} IS NULL
        AND ${metrics.key} = 'study_minutes'
        AND ${goalMetrics.direction} = 'increase'`,
    )
    .orderBy(sql`${goals.targetDate} ASC, ${goals.createdAt} DESC`)
    .limit(limit);
}

export function findReservation(db: Database, key: string): Promise<ReservationRow | undefined> {
  return db
    .select({
      key: idempotencyKeyReservations.key,
      operationId: idempotencyKeyReservations.operationId,
      requestHash: idempotencyKeyReservations.requestHash,
      createdAt: idempotencyKeyReservations.createdAt,
    })
    .from(idempotencyKeyReservations)
    .where(sql`${idempotencyKeyReservations.key} = ${key}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function findOperationResult(
  db: Database,
  key: string,
): Promise<OperationResultRow | undefined> {
  return db
    .select({
      key: operationResults.key,
      operationId: operationResults.operationId,
      requestHash: operationResults.requestHash,
      statusCode: operationResults.statusCode,
      bodyJson: operationResults.bodyJson,
      createdAt: operationResults.createdAt,
    })
    .from(operationResults)
    .where(sql`${operationResults.key} = ${key}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function findIdempotencyState(
  db: Database,
  key: string,
): Promise<IdempotencyStateRow | undefined> {
  return db
    .select({
      key: idempotencyKeys.key,
      opId: idempotencyKeys.opId,
      state: idempotencyKeys.state,
      attempt: idempotencyKeys.attempt,
      requestHash: idempotencyKeys.requestHash,
      responseJson: idempotencyKeys.responseJson,
      errorJson: idempotencyKeys.errorJson,
      statusCode: idempotencyKeys.statusCode,
      expiresAt: idempotencyKeys.expiresAt,
    })
    .from(idempotencyKeys)
    .where(sql`${idempotencyKeys.key} = ${key}`)
    .limit(1)
    .then((rows) => rows[0]);
}

/** Guard de claim: conflito de PK aborta o batch e impede segunda mutação. */
export function claimIdempotencyStatement(input: {
  key: string;
  method: string;
  path: string;
  requestHash: string;
  subject: string;
  opId: string;
  expiresAt: string;
  createdAt: string;
}): SQL {
  return sql`INSERT INTO idempotency_keys
    (key, method, path, request_hash, status_code, created_at, expires_at, subject, op_id, state, attempt)
    VALUES (${input.key}, ${input.method}, ${input.path}, ${input.requestHash}, 202, ${input.createdAt}, ${input.expiresAt}, ${input.subject}, ${input.opId}, 'pending', 1)`;
}

/**
 * Identidade permanente da chave. O `WHERE NOT EXISTS` preserva a primeira
 * gravação sem disparar a guarda anti-REPLACE (que também cobre `DO NOTHING`).
 */
export function reserveIdempotencyStatement(input: {
  key: string;
  opId: string;
  requestHash: string;
  createdAt: string;
}): SQL {
  return sql`INSERT INTO idempotency_key_reservations (key, operation_id, request_hash, created_at)
    SELECT ${input.key}, ${input.opId}, ${input.requestHash}, ${input.createdAt}
    WHERE NOT EXISTS (SELECT 1 FROM idempotency_key_reservations WHERE key = ${input.key})`;
}

/** Resultado imutável: repetição legítima não altera a resposta original. */
export function insertOperationResultStatement(input: {
  key: string;
  opId: string;
  requestHash: string;
  statusCode: number;
  bodyJson: string;
}): SQL {
  return sql`INSERT INTO operation_results (key, operation_id, request_hash, status_code, body_json)
    SELECT ${input.key}, ${input.opId}, ${input.requestHash}, ${input.statusCode}, ${input.bodyJson}
    WHERE NOT EXISTS (SELECT 1 FROM operation_results WHERE key = ${input.key})`;
}

export function completeIdempotencyStatement(input: {
  key: string;
  opId: string;
  statusCode: number;
  mirrorJson: string | null;
  expiresAt: string;
}): SQL {
  return sql`UPDATE idempotency_keys
    SET state = 'done', status_code = ${input.statusCode},
        response_json = ${input.mirrorJson}, expires_at = ${input.expiresAt}
    WHERE key = ${input.key} AND op_id = ${input.opId} AND state = 'pending'`;
}

export function insertCourseStatement(input: {
  id: string;
  title: string;
  provider: string | null;
  status: string;
  startDate: string | null;
  targetEndDate: string | null;
  plannedMinutes: number | null;
  sourceId: string;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO courses
    (id, area_id, title, provider, status, start_date, target_end_date, planned_minutes, source_id, version, created_operation_id, created_at, updated_at)
    VALUES (${input.id}, '01a1fb52-074d-7043-a390-78a0731bdb52', ${input.title}, ${input.provider}, ${input.status}, ${input.startDate}, ${input.targetEndDate}, ${input.plannedMinutes}, ${input.sourceId}, 1, ${input.opId}, ${input.now}, ${input.now})`;
}

export function insertGoalStatement(input: {
  id: string;
  title: string;
  horizon: string;
  status: string;
  priority: number;
  startDate: string | null;
  targetDate: string | null;
  sourceId: string;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO goals
    (id, area_id, title, horizon, status, priority, start_date, target_date, progress_mode, source_id, version, created_operation_id, created_at, updated_at)
    VALUES (${input.id}, '01a1fb52-074d-7043-a390-78a0731bdb52', ${input.title}, ${input.horizon}, ${input.status}, ${input.priority}, ${input.startDate}, ${input.targetDate}, 'metrics', ${input.sourceId}, 1, ${input.opId}, ${input.now}, ${input.now})`;
}

export function insertGoalMetricStatement(input: {
  goalId: string;
  metricId: string;
  targetMinutes: number;
  now: string;
}): SQL {
  return sql`INSERT INTO goal_metrics
    (goal_id, metric_id, baseline_value, target_value, direction, weight, created_at)
    VALUES (${input.goalId}, ${input.metricId}, 0, ${input.targetMinutes}, 'increase', 1, ${input.now})`;
}

export function insertStudySessionStatement(input: {
  id: string;
  courseId: string | null;
  topic: string;
  startedAt: string;
  localDate: string;
  timezone: string;
  durationMinutes: number;
  unitsCompleted: number | null;
  notes: string | null;
  sourceId: string;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO study_sessions
    (id, course_id, topic, started_at, local_date, timezone, duration_minutes, units_completed, notes, source_id, version, created_operation_id, created_at, updated_at)
    VALUES (${input.id}, ${input.courseId}, ${input.topic}, ${input.startedAt}, ${input.localDate}, ${input.timezone}, ${input.durationMinutes}, ${input.unitsCompleted}, ${input.notes}, ${input.sourceId}, 1, ${input.opId}, ${input.now}, ${input.now})`;
}

export function insertObservationStatement(input: {
  id: string;
  metricId: string;
  observedAt: string;
  localDate: string;
  timezone: string;
  valueNum: number;
  sampleMarker: string | null;
  sourceId: string;
  algorithmVersion: string | null;
  studySessionId: string;
  courseId: string | null;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO metric_observations
    (id, metric_id, observed_at, local_date, timezone, value_num, sample_marker, source_id, algorithm_version, study_session_id, course_id, created_operation_id, created_at)
    VALUES (${input.id}, ${input.metricId}, ${input.observedAt}, ${input.localDate}, ${input.timezone}, ${input.valueNum}, ${input.sampleMarker}, ${input.sourceId}, ${input.algorithmVersion}, ${input.studySessionId}, ${input.courseId}, ${input.opId}, ${input.now})`;
}

export function insertEventStatement(input: {
  id: string;
  areaId: string;
  courseId: string | null;
  studySessionId: string;
  title: string;
  occurredAt: string;
  localDate: string;
  timezone: string;
  durationMinutes: number;
  sourceId: string;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO events
    (id, area_id, course_id, study_session_id, title, occurred_at, local_date, timezone, duration_minutes, source_id, version, created_operation_id, created_at, updated_at)
    VALUES (${input.id}, ${input.areaId}, ${input.courseId}, ${input.studySessionId}, ${input.title}, ${input.occurredAt}, ${input.localDate}, ${input.timezone}, ${input.durationMinutes}, ${input.sourceId}, 1, ${input.opId}, ${input.now}, ${input.now})`;
}

/** Liga a observação original à correção; falha se já foi corrigida (fault tolerance). */
export function supersedeObservationStatement(input: {
  id: string;
  replacementId: string;
  expectedMarker: string | null;
}): SQL {
  return sql`UPDATE metric_observations
    SET superseded_by = ${input.replacementId}
    WHERE id = ${input.id}
      AND superseded_by IS NULL
      AND sample_marker IS ${input.expectedMarker}`;
}

export function softDeleteSessionStatement(input: {
  id: string;
  expectedVersion: number;
  deletedAt: string;
  opId: string;
}): SQL {
  return sql`UPDATE study_sessions
    SET deleted_at = ${input.deletedAt}, version = version + 1,
        delete_operation_id = ${input.opId}, updated_at = ${input.deletedAt}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}
