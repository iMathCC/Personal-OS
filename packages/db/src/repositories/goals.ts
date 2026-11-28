import { inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import { areas } from '../schema/core';
import { goalMilestones } from '../schema/goal-milestones';
import { goalMetrics, goals, metrics } from '../schema/domain';
import { auditLog } from '../schema/operations';
import { listActiveObservationsForMetric } from './studies';

export const GOAL_FIELDS = {
  id: goals.id,
  areaId: goals.areaId,
  areaKey: areas.key,
  areaName: areas.name,
  parentGoalId: goals.parentGoalId,
  title: goals.title,
  description: goals.description,
  horizon: goals.horizon,
  status: goals.status,
  priority: goals.priority,
  startDate: goals.startDate,
  targetDate: goals.targetDate,
  successCriteria: goals.successCriteria,
  progressMode: goals.progressMode,
  manualProgress: goals.manualProgress,
  achievedAt: goals.achievedAt,
  archivedAt: goals.archivedAt,
  sourceId: goals.sourceId,
  version: goals.version,
  deletedAt: goals.deletedAt,
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
} as const;

export interface GoalRow {
  id: string;
  areaId: string;
  areaKey: string;
  areaName: string;
  parentGoalId: string | null;
  title: string;
  description: string | null;
  horizon: string;
  status: string;
  priority: number;
  startDate: string | null;
  targetDate: string | null;
  successCriteria: string | null;
  progressMode: string;
  manualProgress: number | null;
  achievedAt: string | null;
  archivedAt: string | null;
  sourceId: string;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalMilestoneRow {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalHistoryRow {
  id: number;
  action: string;
  createdAt: string;
  beforeJson: string | null;
  afterJson: string | null;
}

export interface GoalAreaRow {
  id: string;
  key: string;
  name: string;
}

export interface StudyGoalLinkRow {
  goalId: string;
  targetMinutes: number;
}

export interface GoalStudyObservation {
  localDate: string;
  valueNum: number;
}

const MILESTONE_FIELDS = {
  id: goalMilestones.id,
  goalId: goalMilestones.goalId,
  title: goalMilestones.title,
  description: goalMilestones.description,
  dueDate: goalMilestones.dueDate,
  status: goalMilestones.status,
  completedAt: goalMilestones.completedAt,
  version: goalMilestones.version,
  createdAt: goalMilestones.createdAt,
  updatedAt: goalMilestones.updatedAt,
} as const;

export function listGoalAreas(db: Database): Promise<GoalAreaRow[]> {
  return db
    .select({ id: areas.id, key: areas.key, name: areas.name })
    .from(areas)
    .where(sql`${areas.isActive} = 1`)
    .orderBy(sql`${areas.sortOrder} ASC, ${areas.name} ASC`)
    .limit(50);
}

export function findGoalAreaById(db: Database, id: string): Promise<GoalAreaRow | undefined> {
  return db
    .select({ id: areas.id, key: areas.key, name: areas.name })
    .from(areas)
    .where(sql`${areas.id} = ${id} AND ${areas.isActive} = 1`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function findGoalAreaByKey(db: Database, key: string): Promise<GoalAreaRow | undefined> {
  return db
    .select({ id: areas.id, key: areas.key, name: areas.name })
    .from(areas)
    .where(sql`${areas.key} = ${key} AND ${areas.isActive} = 1`)
    .limit(1)
    .then((rows) => rows[0]);
}

/** Uma única consulta de objetivos; filtros de estado são aplicados no serviço. */
export function listAllGoals(db: Database, limit = 200): Promise<GoalRow[]> {
  return db
    .select(GOAL_FIELDS)
    .from(goals)
    .innerJoin(areas, sql`${areas.id} = ${goals.areaId}`)
    .where(sql`${goals.deletedAt} IS NULL`)
    .orderBy(sql`${goals.createdAt} DESC, ${goals.id} DESC`)
    .limit(limit + 1)
    .then((rows) => rows as GoalRow[]);
}

export function findGoalByAreaAndTitle(
  db: Database,
  areaId: string,
  title: string,
): Promise<{ id: string } | undefined> {
  return db
    .select({ id: goals.id })
    .from(goals)
    .where(
      sql`${goals.areaId} = ${areaId} AND ${goals.title} = ${title} AND ${goals.deletedAt} IS NULL`,
    )
    .limit(1)
    .then((rows) => rows[0]);
}

export function findGoalById(db: Database, id: string): Promise<GoalRow | undefined> {
  return db
    .select(GOAL_FIELDS)
    .from(goals)
    .innerJoin(areas, sql`${areas.id} = ${goals.areaId}`)
    .where(sql`${goals.id} = ${id} AND ${goals.deletedAt} IS NULL`)
    .limit(1)
    .then((rows) => rows[0] as GoalRow | undefined);
}

export function listMilestonesForGoals(
  db: Database,
  goalIds: readonly string[],
  limit = 500,
): Promise<GoalMilestoneRow[]> {
  if (goalIds.length === 0) return Promise.resolve([]);
  return db
    .select(MILESTONE_FIELDS)
    .from(goalMilestones)
    .where(
      sql`${inArray(goalMilestones.goalId, [...goalIds])}
        AND ${goalMilestones.deletedAt} IS NULL`,
    )
    .orderBy(sql`${goalMilestones.dueDate} ASC, ${goalMilestones.id} ASC`)
    .limit(limit)
    .then((rows) => rows as GoalMilestoneRow[]);
}

export function findMilestoneById(db: Database, id: string): Promise<GoalMilestoneRow | undefined> {
  return db
    .select(MILESTONE_FIELDS)
    .from(goalMilestones)
    .where(sql`${goalMilestones.id} = ${id} AND ${goalMilestones.deletedAt} IS NULL`)
    .limit(1)
    .then((rows) => rows[0] as GoalMilestoneRow | undefined);
}

/** Auditoria é append-only; a allowlist de campos é aplicada no serviço. */
export function listGoalHistory(
  db: Database,
  goalId: string,
  limit = 50,
): Promise<GoalHistoryRow[]> {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      beforeJson: auditLog.beforeJson,
      afterJson: auditLog.afterJson,
    })
    .from(auditLog)
    .where(sql`${auditLog.entityType} = 'goal' AND ${auditLog.entityId} = ${goalId}`)
    .orderBy(sql`${auditLog.createdAt} DESC, ${auditLog.id} DESC`)
    .limit(limit)
    .then((rows) => rows as GoalHistoryRow[]);
}

/** Vínculo real com a métrica canônica de minutos de estudo, quando existir. */
export function listStudyGoalLinks(
  db: Database,
  goalIds: readonly string[],
): Promise<StudyGoalLinkRow[]> {
  if (goalIds.length === 0) return Promise.resolve([]);
  return db
    .select({
      goalId: goalMetrics.goalId,
      targetMinutes: sql<number>`${goalMetrics.targetValue}`,
    })
    .from(goalMetrics)
    .innerJoin(metrics, sql`${metrics.id} = ${goalMetrics.metricId}`)
    .where(
      sql`${inArray(goalMetrics.goalId, [...goalIds])}
        AND ${metrics.key} = 'study_minutes'`,
    )
    .limit(200)
    .then((rows) => rows as StudyGoalLinkRow[]);
}

export function listGoalStudyObservations(
  db: Database,
  metricId: string,
  from: string,
  to: string,
  limit: number,
): Promise<GoalStudyObservation[]> {
  return listActiveObservationsForMetric(db, metricId, from, to, limit).then((rows) =>
    rows.map((row) => ({ localDate: row.localDate, valueNum: row.valueNum })),
  );
}

export function insertLifeGoalStatement(input: {
  id: string;
  areaId: string;
  parentGoalId: string | null;
  title: string;
  description: string | null;
  horizon: string;
  status: string;
  priority: number;
  startDate: string | null;
  targetDate: string | null;
  successCriteria: string | null;
  progressMode: string;
  manualProgress: number | null;
  sourceId: string;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO goals
    (id, area_id, parent_goal_id, title, description, horizon, status, priority,
     start_date, target_date, success_criteria, progress_mode, manual_progress,
     source_id, version, created_operation_id, created_at, updated_at)
    VALUES (
      ${input.id}, ${input.areaId}, ${input.parentGoalId}, ${input.title}, ${input.description},
      ${input.horizon}, ${input.status}, ${input.priority}, ${input.startDate}, ${input.targetDate},
      ${input.successCriteria}, ${input.progressMode}, ${input.manualProgress}, ${input.sourceId},
      1, ${input.opId}, ${input.now}, ${input.now}
    )`;
}

export interface GoalChanges {
  title: string;
  description: string | null;
  horizon: string;
  priority: number;
  startDate: string | null;
  targetDate: string | null;
  successCriteria: string | null;
  progressMode: string;
  manualProgress: number | null;
  parentGoalId: string | null;
}

/** Atualização otimista: nenhuma linha é tocada se a versão divergir. */
export function updateGoalStatement(input: {
  id: string;
  expectedVersion: number;
  changes: GoalChanges;
  opId: string;
  now: string;
}): SQL {
  const c = input.changes;
  return sql`UPDATE goals SET
    title = ${c.title}, description = ${c.description}, horizon = ${c.horizon},
    priority = ${c.priority}, start_date = ${c.startDate}, target_date = ${c.targetDate},
    success_criteria = ${c.successCriteria}, progress_mode = ${c.progressMode},
    manual_progress = ${c.manualProgress}, parent_goal_id = ${c.parentGoalId},
    version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export function setGoalStatusStatement(input: {
  id: string;
  expectedVersion: number;
  status: string;
  achievedAt: string | null;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE goals SET
    status = ${input.status}, achieved_at = ${input.achievedAt},
    version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export function setGoalArchivedStatement(input: {
  id: string;
  expectedVersion: number;
  archivedAt: string | null;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE goals SET
    archived_at = ${input.archivedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export function insertMilestoneStatement(input: {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  sourceId: string;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO goal_milestones
    (id, goal_id, title, description, due_date, status, completed_at, source_id,
     version, created_operation_id, created_at, updated_at)
    VALUES (
      ${input.id}, ${input.goalId}, ${input.title}, ${input.description}, ${input.dueDate},
      ${input.status}, ${input.completedAt}, ${input.sourceId}, 1, ${input.opId}, ${input.now}, ${input.now}
    )`;
}

export function updateMilestoneStatement(input: {
  id: string;
  expectedVersion: number;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  completedAt: string | null;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE goal_milestones SET
    title = ${input.title}, description = ${input.description}, due_date = ${input.dueDate},
    status = ${input.status}, completed_at = ${input.completedAt},
    version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}
