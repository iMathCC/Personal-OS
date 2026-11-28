import { inArray, sql, type SQL } from 'drizzle-orm';
import { batchSql, type Database } from '../client';
import { auditLog } from '../schema/operations';
import { projectMilestones } from '../schema/project-milestones';
import { projects } from '../schema/projects';

/**
 * `goal_ids` é agregado na mesma consulta (subconsulta correlacionada) para que
 * listagens não precisem de uma segunda query por projeto.
 */
const GOAL_IDS_EXPR = sql<string | null>`(
  SELECT group_concat(project_goals.goal_id)
  FROM project_goals
  WHERE project_goals.project_id = projects.id
)`;

const PROJECT_FIELDS = {
  id: projects.id,
  title: projects.title,
  description: projects.description,
  status: projects.status,
  priority: projects.priority,
  startDate: projects.startDate,
  targetDate: projects.targetDate,
  completedAt: projects.completedAt,
  sourceId: projects.sourceId,
  version: projects.version,
  createdOperationId: projects.createdOperationId,
  updatedOperationId: projects.updatedOperationId,
  deletedAt: projects.deletedAt,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
} as const;

const MILESTONE_FIELDS = {
  id: projectMilestones.id,
  projectId: projectMilestones.projectId,
  title: projectMilestones.title,
  dueDate: projectMilestones.dueDate,
  status: projectMilestones.status,
  position: projectMilestones.position,
  completedAt: projectMilestones.completedAt,
  sourceId: projectMilestones.sourceId,
  version: projectMilestones.version,
  createdAt: projectMilestones.createdAt,
  updatedAt: projectMilestones.updatedAt,
} as const;

export interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  sourceId: string;
  version: number;
  createdOperationId: string | null;
  updatedOperationId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  goalIds: string[];
}

export interface ProjectMilestoneRow {
  id: string;
  projectId: string;
  title: string;
  dueDate: string | null;
  status: string;
  position: number;
  completedAt: string | null;
  sourceId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectActivityRow {
  id: string;
  projectId: string;
  kind: string;
  summary: string;
  /** JSON serializado; a API converte para `Record<string, unknown>`. */
  detail: string | null;
  occurredAt: string;
}

export interface ProjectForExecutionRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  goalIds: string[];
}

interface ProjectWithGoalsRow extends Omit<ProjectRow, 'goalIds'> {
  goalIds: string | null;
}

function splitIds(value: string | null): string[] {
  return value === null || value === '' ? [] : value.split(',');
}

function toProjectRow(row: ProjectWithGoalsRow): ProjectRow {
  return { ...row, goalIds: splitIds(row.goalIds) };
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export interface ListProjectsFilters {
  status?: string;
  priority?: string;
  goalId?: string;
  search?: string;
  cursor?: { status: string; id: string };
  limit: number;
}

/** Uma consulta; filtros de estado e vínculos são resolvidos no SQL. */
export async function listProjects(
  db: Database,
  filters: ListProjectsFilters,
): Promise<ProjectRow[]> {
  const conditions = [sql`${projects.deletedAt} IS NULL`];
  if (filters.status !== undefined) conditions.push(sql`${projects.status} = ${filters.status}`);
  if (filters.priority !== undefined)
    conditions.push(sql`${projects.priority} = ${filters.priority}`);
  if (filters.goalId !== undefined) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM project_goals
      WHERE project_goals.project_id = ${projects.id} AND project_goals.goal_id = ${filters.goalId}
    )`);
  }
  if (filters.search !== undefined) {
    const pattern = likePattern(filters.search);
    conditions.push(sql`(
      ${projects.title} LIKE ${pattern} ESCAPE ${'\\'}
      OR ${projects.description} LIKE ${pattern} ESCAPE ${'\\'}
    )`);
  }
  if (filters.cursor !== undefined) {
    const { status, id } = filters.cursor;
    conditions.push(
      sql`(${projects.status} > ${status} OR (${projects.status} = ${status} AND ${projects.id} < ${id}))`,
    );
  }
  const rows = await db
    .select({ ...PROJECT_FIELDS, goalIds: GOAL_IDS_EXPR })
    .from(projects)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`${projects.status} ASC, ${projects.id} DESC`)
    .limit(filters.limit + 1);
  return (rows as ProjectWithGoalsRow[]).map(toProjectRow);
}

export async function findProjectById(db: Database, id: string): Promise<ProjectRow | undefined> {
  const rows = await db
    .select({ ...PROJECT_FIELDS, goalIds: GOAL_IDS_EXPR })
    .from(projects)
    .where(sql`${projects.id} = ${id} AND ${projects.deletedAt} IS NULL`)
    .limit(1);
  return (
    (rows[0] as ProjectWithGoalsRow | undefined) && toProjectRow(rows[0] as ProjectWithGoalsRow)
  );
}

export function listProjectMilestones(
  db: Database,
  projectId: string,
  limit = 200,
): Promise<ProjectMilestoneRow[]> {
  return db
    .select(MILESTONE_FIELDS)
    .from(projectMilestones)
    .where(
      sql`${projectMilestones.projectId} = ${projectId} AND ${projectMilestones.deletedAt} IS NULL`,
    )
    .orderBy(sql`${projectMilestones.position} ASC, ${projectMilestones.id} ASC`)
    .limit(limit);
}

interface RawProjectActivityRow {
  id: string;
  project_id: string;
  kind: string;
  summary: string;
  detail: string | null;
  occurred_at: string;
}

/**
 * Atividade é derivada do estado atual das entidades do projeto (sem event
 * sourcing, conforme ADR-0007). Cada entidade gera no máximo uma linha.
 */
export async function listProjectActivity(
  db: Database,
  projectId: string,
  limit = 50,
): Promise<ProjectActivityRow[]> {
  const rows = await db.all<RawProjectActivityRow>(sql`
    SELECT p.id AS id, p.id AS project_id, 'project' AS kind, p.title AS summary,
           json_object('status', p.status) AS detail, p.created_at AS occurred_at
    FROM projects p
    WHERE p.deleted_at IS NULL AND p.id = ${projectId}

    UNION ALL

    SELECT t.id, t.project_id, 'task' AS kind, t.title AS summary,
           json_object('status', t.status, 'dueDate', t.due_date) AS detail,
           COALESCE(t.completed_at, t.created_at) AS occurred_at
    FROM tasks t
    WHERE t.deleted_at IS NULL AND t.project_id = ${projectId}

    UNION ALL

    SELECT m.id, m.project_id, 'milestone' AS kind, m.title AS summary,
           json_object('status', m.status, 'dueDate', m.due_date) AS detail,
           COALESCE(m.completed_at, m.created_at) AS occurred_at
    FROM project_milestones m
    WHERE m.deleted_at IS NULL AND m.project_id = ${projectId}

    ORDER BY occurred_at DESC, id DESC
    LIMIT ${limit}
  `);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    summary: row.summary,
    detail: row.detail,
    occurredAt: row.occurred_at,
  }));
}

/** Consulta única do dashboard; nenhuma dependência é buscada à parte. */
export async function listProjectsForExecution(
  db: Database,
  limit = 200,
): Promise<ProjectForExecutionRow[]> {
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      priority: projects.priority,
      startDate: projects.startDate,
      targetDate: projects.targetDate,
      completedAt: projects.completedAt,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      goalIds: GOAL_IDS_EXPR,
    })
    .from(projects)
    .where(sql`${projects.deletedAt} IS NULL`)
    .orderBy(sql`${projects.id} ASC`)
    .limit(limit);
  return (rows as Array<Omit<ProjectForExecutionRow, 'goalIds'> & { goalIds: string | null }>).map(
    (row) => ({ ...row, goalIds: splitIds(row.goalIds) }),
  );
}

export interface InsertProjectMilestoneInput {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  position: number;
  completedAt: string | null;
  sourceId?: string;
}

export interface InsertProjectInput {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  sourceId: string;
  opId: string;
  now: string;
  goalIds?: readonly string[];
  milestones?: readonly InsertProjectMilestoneInput[];
}

export function insertProjectStatement(input: InsertProjectInput): SQL {
  return sql`INSERT INTO projects
    (id, title, description, status, priority, start_date, target_date, completed_at,
     source_id, version, created_operation_id, created_at, updated_at)
    VALUES (
      ${input.id}, ${input.title}, ${input.description}, ${input.status}, ${input.priority},
      ${input.startDate}, ${input.targetDate}, ${input.completedAt}, ${input.sourceId},
      1, ${input.opId}, ${input.now}, ${input.now}
    )`;
}

export function insertProjectGoalStatement(input: {
  projectId: string;
  goalId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO project_goals (project_id, goal_id, created_at)
    VALUES (${input.projectId}, ${input.goalId}, ${input.now})`;
}

export function insertProjectMilestoneStatement(
  input: InsertProjectMilestoneInput & { projectId: string; opId: string; now: string },
): SQL {
  return sql`INSERT INTO project_milestones
    (id, project_id, title, due_date, status, position, completed_at, source_id,
     version, created_operation_id, created_at, updated_at)
    VALUES (
      ${input.id}, ${input.projectId}, ${input.title}, ${input.dueDate}, ${input.status},
      ${input.position}, ${input.completedAt}, ${input.sourceId ?? 'src_manual'},
      1, ${input.opId}, ${input.now}, ${input.now}
    )`;
}

/** Projeto + vínculos + marcos em uma única lista de statements para `batchSql`. */
export function insertProjectStatements(input: InsertProjectInput): SQL[] {
  const statements: SQL[] = [insertProjectStatement(input)];
  for (const goalId of input.goalIds ?? []) {
    statements.push(insertProjectGoalStatement({ projectId: input.id, goalId, now: input.now }));
  }
  for (const milestone of input.milestones ?? []) {
    statements.push(
      insertProjectMilestoneStatement({
        ...milestone,
        projectId: input.id,
        opId: input.opId,
        now: input.now,
      }),
    );
  }
  return statements;
}

export function insertProject(
  db: Database,
  input: InsertProjectInput,
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [...insertProjectStatements(input), ...extraStatements]);
}

export interface ProjectChanges {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
}

/** Atualização otimista: nenhuma linha é tocada se a versão divergir. */
export function updateProjectStatement(input: {
  id: string;
  expectedVersion: number;
  changes: ProjectChanges;
  opId: string;
  now: string;
}): SQL {
  const c = input.changes;
  return sql`UPDATE projects SET
    title = ${c.title}, description = ${c.description}, status = ${c.status},
    priority = ${c.priority}, start_date = ${c.startDate}, target_date = ${c.targetDate},
    completed_at = ${c.completedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export function updateProject(
  db: Database,
  input: Parameters<typeof updateProjectStatement>[0],
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [updateProjectStatement(input), ...extraStatements]);
}

/**
 * Substitui os vínculos com objetivos. O guarda pós-update impede que
 * DELETE/INSERT alterem os vínculos se a versão otimista não casar.
 */
export function setProjectGoalsStatements(input: {
  projectId: string;
  expectedVersion: number;
  goalIds: readonly string[];
  opId: string;
  now: string;
}): SQL[] {
  const nextVersion = input.expectedVersion + 1;
  const guard = sql`EXISTS (
    SELECT 1 FROM projects
    WHERE id = ${input.projectId} AND version = ${nextVersion} AND updated_operation_id = ${input.opId}
  )`;
  return [
    sql`UPDATE projects SET
      version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
      WHERE id = ${input.projectId} AND version = ${input.expectedVersion} AND deleted_at IS NULL`,
    sql`DELETE FROM project_goals WHERE project_id = ${input.projectId} AND ${guard}`,
    ...input.goalIds.map(
      (goalId) => sql`INSERT INTO project_goals
      (project_id, goal_id, created_at) SELECT ${input.projectId}, ${goalId}, ${input.now}
      WHERE ${guard}`,
    ),
  ];
}

export function setProjectGoals(
  db: Database,
  input: Parameters<typeof setProjectGoalsStatements>[0],
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [...setProjectGoalsStatements(input), ...extraStatements]);
}

export function updateProjectMilestoneStatement(input: {
  id: string;
  expectedVersion: number;
  title: string;
  dueDate: string | null;
  status: string;
  position: number;
  completedAt: string | null;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE project_milestones SET
    title = ${input.title}, due_date = ${input.dueDate}, status = ${input.status},
    position = ${input.position}, completed_at = ${input.completedAt},
    version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export function updateProjectMilestone(
  db: Database,
  input: Parameters<typeof updateProjectMilestoneStatement>[0],
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [updateProjectMilestoneStatement(input), ...extraStatements]);
}

export function softDeleteProjectStatement(input: {
  id: string;
  expectedVersion: number;
  deletedAt: string;
  opId: string;
}): SQL {
  return sql`UPDATE projects SET
    deleted_at = ${input.deletedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.deletedAt}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export function softDeleteProject(
  db: Database,
  input: Parameters<typeof softDeleteProjectStatement>[0],
  extraStatements: readonly SQL[] = [],
): Promise<unknown[]> {
  return batchSql(db, [softDeleteProjectStatement(input), ...extraStatements]);
}

/** Usado para validar referências de vínculos sem consultar tabelas de outros módulos. */
export function findProjectIdsByIds(db: Database, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .select({ id: projects.id })
    .from(projects)
    .where(sql`${inArray(projects.id, [...ids])} AND ${projects.deletedAt} IS NULL`)
    .then((rows) => rows.map((row) => row.id));
}

/** Auditória de projetos; filtro por entidade usa o índice `idx_audit_entity`. */
export function listProjectAuditRows(
  db: Database,
  projectId: string,
  limit = 50,
): Promise<
  Array<{ action: string; createdAt: string; beforeJson: string | null; afterJson: string | null }>
> {
  return db
    .select({
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      beforeJson: auditLog.beforeJson,
      afterJson: auditLog.afterJson,
    })
    .from(auditLog)
    .where(sql`${auditLog.entityType} = 'project' AND ${auditLog.entityId} = ${projectId}`)
    .orderBy(sql`${auditLog.createdAt} DESC, ${auditLog.id} DESC`)
    .limit(limit);
}
