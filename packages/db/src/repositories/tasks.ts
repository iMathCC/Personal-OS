import { inArray, sql, type SQL } from 'drizzle-orm';
import { batchSql, type Database } from '../client';
import { projectMilestones } from '../schema/project-milestones';
import { projects } from '../schema/projects';
import { taskDependencies, tasks } from '../schema/tasks';

/** Dependências vêm na mesma consulta; um `group_concat` evita N+1 no dashboard. */
const DEPENDENCY_IDS_EXPR = sql<string | null>`(
  SELECT group_concat(task_dependencies.depends_on_task_id)
  FROM task_dependencies
  WHERE task_dependencies.task_id = tasks.id
)`;

const TASK_FIELDS = {
  id: tasks.id,
  title: tasks.title,
  description: tasks.description,
  projectId: tasks.projectId,
  milestoneId: tasks.milestoneId,
  goalId: tasks.goalId,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  estimateMinutes: tasks.estimateMinutes,
  completedAt: tasks.completedAt,
  sourceId: tasks.sourceId,
  version: tasks.version,
  createdOperationId: tasks.createdOperationId,
  updatedOperationId: tasks.updatedOperationId,
  deletedAt: tasks.deletedAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
} as const;

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  projectTitle: string | null;
  milestoneId: string | null;
  milestoneTitle: string | null;
  goalId: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  estimateMinutes: number | null;
  completedAt: string | null;
  sourceId: string;
  version: number;
  createdOperationId: string | null;
  updatedOperationId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  dependencyIds: string[];
}

export interface TaskForExecutionRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  milestoneId: string | null;
  goalId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  dependencyIds: string[];
}

export interface TaskDependencyRow {
  /** Id determinístico da aresta: o id da tarefa dependente (a tabela tem PK composta). */
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  dependsOnTitle: string;
  dependsOnStatus: string;
  createdAt: string;
}

export interface DependentTaskRow {
  id: string;
  title: string;
  status: string;
}

interface TaskWithRelationsRow extends Omit<TaskRow, 'dependencyIds'> {
  dependencyIds: string | null;
}

function splitIds(value: string | null): string[] {
  return value === null || value === '' ? [] : value.split(',');
}

function toTaskRow(row: TaskWithRelationsRow): TaskRow {
  return { ...row, dependencyIds: splitIds(row.dependencyIds) };
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export interface ListTasksFilters {
  projectId?: string;
  goalId?: string;
  milestoneId?: string;
  status?: string;
  priority?: string;
  search?: string;
  dueBefore?: string;
  dueAfter?: string;
  /** O cursor é o id da última tarefa (UUIDv7, ordenado por id DESC). */
  cursorId?: string;
  limit: number;
}

/** Títulos relacionados e dependências são resolvidos na mesma consulta. */
export async function listTasks(db: Database, filters: ListTasksFilters): Promise<TaskRow[]> {
  const conditions = [sql`${tasks.deletedAt} IS NULL`];
  if (filters.projectId !== undefined)
    conditions.push(sql`${tasks.projectId} = ${filters.projectId}`);
  if (filters.goalId !== undefined) conditions.push(sql`${tasks.goalId} = ${filters.goalId}`);
  if (filters.milestoneId !== undefined)
    conditions.push(sql`${tasks.milestoneId} = ${filters.milestoneId}`);
  if (filters.status !== undefined) conditions.push(sql`${tasks.status} = ${filters.status}`);
  if (filters.priority !== undefined) conditions.push(sql`${tasks.priority} = ${filters.priority}`);
  if (filters.search !== undefined) {
    const pattern = likePattern(filters.search);
    conditions.push(sql`(
      ${tasks.title} LIKE ${pattern} ESCAPE ${'\\'}
      OR ${tasks.description} LIKE ${pattern} ESCAPE ${'\\'}
    )`);
  }
  if (filters.dueBefore !== undefined)
    conditions.push(sql`${tasks.dueDate} <= ${filters.dueBefore}`);
  if (filters.dueAfter !== undefined) conditions.push(sql`${tasks.dueDate} >= ${filters.dueAfter}`);
  if (filters.cursorId !== undefined) conditions.push(sql`${tasks.id} < ${filters.cursorId}`);

  const rows = await db
    .select({
      ...TASK_FIELDS,
      projectTitle: projects.title,
      milestoneTitle: projectMilestones.title,
      dependencyIds: DEPENDENCY_IDS_EXPR,
    })
    .from(tasks)
    .leftJoin(projects, sql`${projects.id} = ${tasks.projectId} AND ${projects.deletedAt} IS NULL`)
    .leftJoin(
      projectMilestones,
      sql`${projectMilestones.id} = ${tasks.milestoneId} AND ${projectMilestones.deletedAt} IS NULL`,
    )
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`${tasks.id} DESC`)
    .limit(filters.limit + 1);
  return (rows as TaskWithRelationsRow[]).map(toTaskRow);
}

export async function findTaskById(db: Database, id: string): Promise<TaskRow | undefined> {
  const rows = await db
    .select({
      ...TASK_FIELDS,
      projectTitle: projects.title,
      milestoneTitle: projectMilestones.title,
      dependencyIds: DEPENDENCY_IDS_EXPR,
    })
    .from(tasks)
    .leftJoin(projects, sql`${projects.id} = ${tasks.projectId} AND ${projects.deletedAt} IS NULL`)
    .leftJoin(
      projectMilestones,
      sql`${projectMilestones.id} = ${tasks.milestoneId} AND ${projectMilestones.deletedAt} IS NULL`,
    )
    .where(sql`${tasks.id} = ${id} AND ${tasks.deletedAt} IS NULL`)
    .limit(1);
  return (
    (rows[0] as TaskWithRelationsRow | undefined) && toTaskRow(rows[0] as TaskWithRelationsRow)
  );
}

interface RawTaskDependencyRow {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  depends_on_title: string;
  depends_on_status: string;
  created_at: string;
}

export async function listTaskDependenciesWithTitles(
  db: Database,
  taskId: string,
  limit = 100,
): Promise<TaskDependencyRow[]> {
  const rows = await db.all<RawTaskDependencyRow>(sql`
    SELECT d.depends_on_task_id AS id, d.task_id AS task_id,
           d.depends_on_task_id AS depends_on_task_id,
           t.title AS depends_on_title, t.status AS depends_on_status,
           d.created_at AS created_at
    FROM task_dependencies d
    INNER JOIN tasks t ON t.id = d.depends_on_task_id
    WHERE d.task_id = ${taskId}
    ORDER BY d.created_at ASC, d.depends_on_task_id ASC
    LIMIT ${limit}
  `);
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    dependsOnTaskId: row.depends_on_task_id,
    dependsOnTitle: row.depends_on_title,
    dependsOnStatus: row.depends_on_status,
    createdAt: row.created_at,
  }));
}

export interface RawDependentTaskRow {
  id: string;
  title: string;
  status: string;
}

export async function listDependentTasks(
  db: Database,
  dependsOnTaskId: string,
  limit = 200,
): Promise<DependentTaskRow[]> {
  const rows = await db.all<RawDependentTaskRow>(sql`
    SELECT t.id AS id, t.title AS title, t.status AS status
    FROM task_dependencies d
    INNER JOIN tasks t ON t.id = d.task_id
    WHERE d.depends_on_task_id = ${dependsOnTaskId} AND t.deleted_at IS NULL
    ORDER BY t.id ASC
    LIMIT ${limit}
  `);
  return rows.map((row) => ({ id: row.id, title: row.title, status: row.status }));
}

/** Consulta única do dashboard: dependências e `completed_at` vêm na mesma linha. */
export async function listTasksForExecution(
  db: Database,
  limit = 200,
): Promise<TaskForExecutionRow[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      projectId: tasks.projectId,
      milestoneId: tasks.milestoneId,
      goalId: tasks.goalId,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
      dependencyIds: DEPENDENCY_IDS_EXPR,
    })
    .from(tasks)
    .where(sql`${tasks.deletedAt} IS NULL`)
    .orderBy(sql`${tasks.id} ASC`)
    .limit(limit);
  return (
    rows as Array<Omit<TaskForExecutionRow, 'dependencyIds'> & { dependencyIds: string | null }>
  ).map((row) => ({ ...row, dependencyIds: splitIds(row.dependencyIds) }));
}

export interface InsertTaskInput {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  milestoneId: string | null;
  goalId: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  estimateMinutes: number | null;
  completedAt: string | null;
  sourceId: string;
  opId: string;
  now: string;
  dependencyIds?: readonly string[];
}

export function insertTaskStatement(input: InsertTaskInput): SQL {
  return sql`INSERT INTO tasks
    (id, title, description, project_id, milestone_id, goal_id, status, priority,
     due_date, estimate_minutes, completed_at, source_id, version,
     created_operation_id, created_at, updated_at)
    VALUES (
      ${input.id}, ${input.title}, ${input.description}, ${input.projectId}, ${input.milestoneId},
      ${input.goalId}, ${input.status}, ${input.priority}, ${input.dueDate}, ${input.estimateMinutes},
      ${input.completedAt}, ${input.sourceId}, 1, ${input.opId}, ${input.now}, ${input.now}
    )`;
}

export function insertTaskDependencyStatement(input: {
  taskId: string;
  dependsOnTaskId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO task_dependencies (task_id, depends_on_task_id, created_at)
    VALUES (${input.taskId}, ${input.dependsOnTaskId}, ${input.now})`;
}

export function insertTaskStatements(input: InsertTaskInput): SQL[] {
  const statements: SQL[] = [insertTaskStatement(input)];
  for (const dependsOnTaskId of input.dependencyIds ?? []) {
    statements.push(
      insertTaskDependencyStatement({ taskId: input.id, dependsOnTaskId, now: input.now }),
    );
  }
  return statements;
}

export function insertTask(
  db: Database,
  input: InsertTaskInput,
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [...insertTaskStatements(input), ...extraStatements]);
}

export interface TaskChanges {
  title: string;
  description: string | null;
  projectId: string | null;
  milestoneId: string | null;
  goalId: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  estimateMinutes: number | null;
  completedAt: string | null;
}

export function updateTaskStatement(input: {
  id: string;
  expectedVersion: number;
  changes: TaskChanges;
  opId: string;
  now: string;
}): SQL {
  const c = input.changes;
  return sql`UPDATE tasks SET
    title = ${c.title}, description = ${c.description}, project_id = ${c.projectId},
    milestone_id = ${c.milestoneId}, goal_id = ${c.goalId}, status = ${c.status},
    priority = ${c.priority}, due_date = ${c.dueDate}, estimate_minutes = ${c.estimateMinutes},
    completed_at = ${c.completedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export function updateTask(
  db: Database,
  input: Parameters<typeof updateTaskStatement>[0],
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [updateTaskStatement(input), ...extraStatements]);
}

/** Conclusão explícita; o CHECK de consistência exige `completed_at` preenchido. */
export function completeTaskStatement(input: {
  id: string;
  expectedVersion: number;
  completedAt: string;
  opId: string;
}): SQL {
  return sql`UPDATE tasks SET
    status = 'completed', completed_at = ${input.completedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.completedAt}
    WHERE id = ${input.id} AND version = ${input.expectedVersion}
      AND status IN ('todo','in_progress','blocked') AND deleted_at IS NULL`;
}

export function completeTask(
  db: Database,
  input: Parameters<typeof completeTaskStatement>[0],
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [completeTaskStatement(input), ...extraStatements]);
}

/** Substitui arestas; o guarda pós-update previne mutação se a versão divergir. */
export function setTaskDependenciesStatements(input: {
  taskId: string;
  expectedVersion: number;
  dependencyIds: readonly string[];
  opId: string;
  now: string;
}): SQL[] {
  const nextVersion = input.expectedVersion + 1;
  const guard = sql`EXISTS (
    SELECT 1 FROM tasks
    WHERE id = ${input.taskId} AND version = ${nextVersion} AND updated_operation_id = ${input.opId}
  )`;
  return [
    sql`UPDATE tasks SET
      version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
      WHERE id = ${input.taskId} AND version = ${input.expectedVersion} AND deleted_at IS NULL`,
    sql`DELETE FROM task_dependencies WHERE task_id = ${input.taskId} AND ${guard}`,
    ...input.dependencyIds.map(
      (dependsOnTaskId) => sql`INSERT INTO task_dependencies
      (task_id, depends_on_task_id, created_at) SELECT ${input.taskId}, ${dependsOnTaskId}, ${input.now}
      WHERE ${guard}`,
    ),
  ];
}

export function setTaskDependencies(
  db: Database,
  input: Parameters<typeof setTaskDependenciesStatements>[0],
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [...setTaskDependenciesStatements(input), ...extraStatements]);
}

export function softDeleteTaskStatement(input: {
  id: string;
  expectedVersion: number;
  deletedAt: string;
  opId: string;
}): SQL {
  return sql`UPDATE tasks SET
    deleted_at = ${input.deletedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.deletedAt}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export function softDeleteTask(
  db: Database,
  input: Parameters<typeof softDeleteTaskStatement>[0],
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [softDeleteTaskStatement(input), ...extraStatements]);
}

/** Referências válidas para validação de dependências antes da gravação. */
export function findTaskIdsByIds(db: Database, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .select({ id: tasks.id })
    .from(tasks)
    .where(sql`${inArray(tasks.id, [...ids])} AND ${tasks.deletedAt} IS NULL`)
    .then((rows) => rows.map((row) => row.id));
}

/** Todas as arestas ativas, usadas para detecção de ciclos no domínio. */
export function listTaskDependencyEdges(
  db: Database,
  limit = 5_000,
): Promise<Array<{ taskId: string; dependsOnTaskId: string }>> {
  return db
    .select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .limit(limit);
}
