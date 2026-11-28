import { and, inArray, sql, type SQL } from 'drizzle-orm';
import {
  auditStatement,
  goals,
  newId,
  projectGoals,
  projectMilestones,
  projects,
  tasks,
  type Database,
} from '@personal-os/db';
import {
  calculateMilestoneProgress,
  calculateProjectProgress,
  conflict,
  notFound,
  validationError,
  type MilestoneLike,
  type ProjectStatus,
  type TaskStatus,
} from '@personal-os/domain';
import type {
  CreateProjectBody,
  CreateProjectMilestoneBody,
  ListProjectsQuery,
  ProjectDetailDto,
  ProjectMilestoneDto,
  ProjectStatus as SharedProjectStatus,
  ProjectSummaryDto,
  SetProjectGoalsBody,
  UpdateProjectBody,
  UpdateProjectMilestoneBody,
} from '@personal-os/shared';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';

const MANUAL_SOURCE_ID = 'src_manual';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const ASSOCIATION_LIMIT = 2_000;

export interface ProjectsContext {
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

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface MilestoneRow {
  id: string;
  projectId: string;
  title: string;
  dueDate: string | null;
  status: string;
  position: number;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface StatusRow {
  id: string;
  projectId: string | null;
  status: string;
}

const PROJECT_FIELDS = {
  id: projects.id,
  title: projects.title,
  description: projects.description,
  status: projects.status,
  priority: projects.priority,
  startDate: projects.startDate,
  targetDate: projects.targetDate,
  completedAt: projects.completedAt,
  version: projects.version,
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
  version: projectMilestones.version,
  createdAt: projectMilestones.createdAt,
  updatedAt: projectMilestones.updatedAt,
} as const;

const STATUS_FIELDS = {
  id: tasks.id,
  projectId: tasks.projectId,
  status: tasks.status,
} as const;

function envelope<T>(requestId: string, data: T): string {
  return JSON.stringify({ data, meta: { requestId } });
}

function mutationContext(ctx: ProjectsContext, request: MutatingRequest) {
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

function isProjectStatus(value: string): value is ProjectStatus {
  return (
    value === 'planned' ||
    value === 'active' ||
    value === 'paused' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'archived'
  );
}

function isPriority(value: string): value is 'low' | 'medium' | 'high' | 'critical' {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isMilestoneStatus(
  value: string,
): value is 'pending' | 'in_progress' | 'completed' | 'cancelled' {
  return (
    value === 'pending' || value === 'in_progress' || value === 'completed' || value === 'cancelled'
  );
}

function isTaskStatus(value: string): value is TaskStatus {
  return (
    value === 'todo' ||
    value === 'in_progress' ||
    value === 'blocked' ||
    value === 'completed' ||
    value === 'cancelled'
  );
}

/** Auditoria guarda apenas identificadores e estado; títulos/descrições ficam fora. */
function projectSnapshot(row: ProjectRow) {
  return {
    id: row.id,
    status: row.status,
    priority: row.priority,
    startDate: row.startDate,
    targetDate: row.targetDate,
    completedAt: row.completedAt,
    version: row.version,
  };
}

function goalsSnapshot(goalIds: readonly string[]) {
  return { goalIds: [...goalIds] };
}

function milestoneSnapshot(row: MilestoneRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    dueDate: row.dueDate,
    status: row.status,
    position: row.position,
    completedAt: row.completedAt,
    version: row.version,
  };
}

function milestoneToDto(row: MilestoneRow): ProjectMilestoneDto {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    dueDate: row.dueDate,
    status: isMilestoneStatus(row.status) ? row.status : 'pending',
    position: row.position,
    completedAt: row.completedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface Associations {
  statuses: StatusRow[];
  milestones: MilestoneRow[];
  goalIdsByProject: Map<string, string[]>;
}

function emptyAssociations(): Associations {
  return { statuses: [], milestones: [], goalIdsByProject: new Map() };
}

async function loadAssociations(
  ctx: ProjectsContext,
  rows: readonly ProjectRow[],
): Promise<Associations> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return emptyAssociations();
  const [statuses, milestones, links] = await Promise.all([
    ctx.db
      .select(STATUS_FIELDS)
      .from(tasks)
      .where(sql`${inArray(tasks.projectId, ids)} AND ${tasks.deletedAt} IS NULL`)
      .orderBy(sql`${tasks.id} ASC`)
      .limit(ASSOCIATION_LIMIT) as Promise<StatusRow[]>,
    ctx.db
      .select(MILESTONE_FIELDS)
      .from(projectMilestones)
      .where(
        sql`${inArray(projectMilestones.projectId, ids)} AND ${projectMilestones.deletedAt} IS NULL`,
      )
      .orderBy(sql`${projectMilestones.position} ASC, ${projectMilestones.id} ASC`)
      .limit(ASSOCIATION_LIMIT) as Promise<MilestoneRow[]>,
    ctx.db
      .select({ projectId: projectGoals.projectId, goalId: projectGoals.goalId })
      .from(projectGoals)
      .where(inArray(projectGoals.projectId, ids))
      .orderBy(sql`${projectGoals.goalId} ASC`)
      .limit(ASSOCIATION_LIMIT),
  ]);
  const goalIdsByProject = new Map<string, string[]>();
  for (const link of links) {
    const list = goalIdsByProject.get(link.projectId) ?? [];
    list.push(link.goalId);
    goalIdsByProject.set(link.projectId, list);
  }
  return { statuses, milestones, goalIdsByProject };
}

function projectToDto(
  row: ProjectRow,
  associations: Associations,
  goalIds?: readonly string[],
): ProjectSummaryDto {
  const status: ProjectStatus = isProjectStatus(row.status) ? row.status : 'planned';
  const statuses = associations.statuses
    .filter((task) => task.projectId === row.id)
    .map((task): Pick<TaskStatusRow, 'status'> => ({
      status: isTaskStatus(task.status) ? task.status : 'todo',
    }));
  const milestones = associations.milestones
    .filter((milestone) => milestone.projectId === row.id)
    .map((milestone): Pick<MilestoneLike, 'status'> => ({
      status: isMilestoneStatus(milestone.status) ? milestone.status : 'pending',
    }));
  const progress = calculateProjectProgress(status, statuses, milestones);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status,
    priority: isPriority(row.priority) ? row.priority : 'medium',
    startDate: row.startDate,
    targetDate: row.targetDate,
    completedAt: row.completedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    progress,
    goalIds: [...(goalIds ?? associations.goalIdsByProject.get(row.id) ?? [])],
  };
}

interface TaskStatusRow {
  status: TaskStatus;
}

function timestampAsCursorPart(instant: string): string {
  const ms = Date.parse(instant);
  if (!Number.isFinite(ms)) throw validationError('Data de criação inválida no cursor.');
  // Formato UUIDv7-shaped exigido pelo contrato; os 12 hex finais carregam o timestamp.
  return `00000000-0000-7000-8000-${ms.toString(16).padStart(12, '0')}`;
}

function cursorPartAsTimestamp(part: string): string {
  const match = /^00000000-0000-7000-8000-([0-9a-f]{12})$/.exec(part);
  const hex = match?.[1];
  if (hex === undefined) throw validationError('Cursor de projeto inválido.');
  return new Date(Number.parseInt(hex, 16)).toISOString();
}

function parseProjectCursor(cursor: string, status?: SharedProjectStatus) {
  const parts = cursor.split(':');
  const [cursorStatus, stamp, id] = parts;
  if (
    parts.length !== 3 ||
    cursorStatus === undefined ||
    stamp === undefined ||
    id === undefined ||
    !isProjectStatus(cursorStatus) ||
    !/^[0-9a-f-]{36}$/.test(id)
  ) {
    throw validationError('Cursor de projeto inválido.');
  }
  if (status !== undefined && status !== cursorStatus) {
    throw validationError('Cursor pertence a outro filtro de situação.');
  }
  return { status: cursorStatus, createdAt: cursorPartAsTimestamp(stamp), id };
}

export interface ProjectPage {
  items: ProjectSummaryDto[];
  nextCursor?: string;
  hasMore: boolean;
}

async function listProjectRows(
  ctx: ProjectsContext,
  query: ListProjectsQuery,
  limit: number,
): Promise<ProjectRow[]> {
  const conditions: SQL[] = [sql`${projects.deletedAt} IS NULL`];
  if (query.status !== undefined) conditions.push(sql`${projects.status} = ${query.status}`);
  if (query.priority !== undefined) conditions.push(sql`${projects.priority} = ${query.priority}`);
  if (query.goalId !== undefined) {
    conditions.push(
      sql`${projects.id} IN (SELECT ${projectGoals.projectId} FROM ${projectGoals} WHERE ${projectGoals.goalId} = ${query.goalId})`,
    );
  }
  if (query.search !== undefined) {
    conditions.push(
      sql`lower(${projects.title}) LIKE ${`%${query.search.toLocaleLowerCase('pt-BR')}%`}`,
    );
  }
  if (query.cursor !== undefined) {
    const cursor = parseProjectCursor(query.cursor, query.status);
    conditions.push(
      sql`${projects.createdAt} < ${cursor.createdAt}
        OR (${projects.createdAt} = ${cursor.createdAt} AND ${projects.id} < ${cursor.id})`,
    );
  }
  return ctx.db
    .select(PROJECT_FIELDS)
    .from(projects)
    .where(and(...conditions))
    .orderBy(sql`${projects.createdAt} DESC, ${projects.id} DESC`)
    .limit(limit + 1) // limit é validado pelo schema; o teto extra detecta hasMore sem COUNT.
    .then((rows) => rows as ProjectRow[]);
}

export async function listProjects(
  ctx: ProjectsContext,
  query: ListProjectsQuery,
): Promise<ProjectPage> {
  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const rows = await listProjectRows(ctx, query, limit);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const associations = await loadAssociations(ctx, page);
  const items = page.map((row) => projectToDto(row, associations));
  const last = page.at(-1);
  return {
    items,
    ...(hasMore && last !== undefined
      ? { nextCursor: `${last.status}:${timestampAsCursorPart(last.createdAt)}:${last.id}` }
      : {}),
    hasMore,
  };
}

async function projectOr404(ctx: ProjectsContext, id: string): Promise<ProjectRow> {
  const row = await ctx.db
    .select(PROJECT_FIELDS)
    .from(projects)
    .where(sql`${projects.id} = ${id} AND ${projects.deletedAt} IS NULL`)
    .limit(1)
    .then((rows) => rows[0] as ProjectRow | undefined);
  if (row === undefined) throw notFound('Projeto não encontrado.');
  return row;
}

function mergedProject(row: ProjectRow, input: UpdateProjectBody) {
  return {
    title: input.title ?? row.title,
    description: input.description === undefined ? row.description : input.description,
    status: input.status ?? row.status,
    priority: input.priority ?? row.priority,
    startDate: input.startDate === undefined ? row.startDate : input.startDate,
    targetDate: input.targetDate === undefined ? row.targetDate : input.targetDate,
  };
}

async function assertGoalsExist(ctx: ProjectsContext, ids: readonly string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = await ctx.db
    .select({ id: goals.id })
    .from(goals)
    .where(sql`${inArray(goals.id, unique)} AND ${goals.deletedAt} IS NULL`)
    .limit(unique.length);
  if (rows.length !== unique.length) throw notFound('Objetivo vinculado não encontrado.');
}

async function assertMilestoneBelongs(
  ctx: ProjectsContext,
  projectId: string,
  milestoneId: string,
): Promise<MilestoneRow> {
  const row = await ctx.db
    .select(MILESTONE_FIELDS)
    .from(projectMilestones)
    .where(sql`${projectMilestones.id} = ${milestoneId} AND ${projectMilestones.deletedAt} IS NULL`)
    .limit(1)
    .then((rows) => rows[0] as MilestoneRow | undefined);
  if (row === undefined || row.projectId !== projectId)
    throw notFound('Marco do projeto não encontrado.');
  return row;
}

async function requireVersion(
  ctx: ProjectsContext,
  row: ProjectRow,
  expectedVersion: number | undefined,
  bodyVersion?: number,
): Promise<void> {
  if (expectedVersion === undefined || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw validationError('Cabeçalho If-Match obrigatório com a versão atual.');
  }
  if (bodyVersion !== undefined && bodyVersion !== expectedVersion) {
    throw validationError('Versão do corpo divergente de If-Match.');
  }
  if (row.version !== expectedVersion) throw conflict('Projeto foi alterado por outra operação.');
}

function projectStatusMeta(status: string, now: string): { completedAt: string | null } {
  return { completedAt: status === 'completed' ? now : null };
}

/** Reabrir um projeto concluído limpa o campo; atualizações posteriores preservam a data original. */
function nextProjectCompletedAt(
  status: string,
  previous: string | null,
  now: string,
): string | null {
  return status === 'completed' ? (previous ?? now) : null;
}

function insertProjectStatement(input: {
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
}): SQL {
  return sql`INSERT INTO projects
    (id, title, description, status, priority, start_date, target_date, completed_at,
     source_id, version, created_operation_id, created_at, updated_at)
    VALUES (
      ${input.id}, ${input.title}, ${input.description}, ${input.status}, ${input.priority},
      ${input.startDate}, ${input.targetDate}, ${input.completedAt}, ${input.sourceId},
      1, ${input.opId}, ${input.now}, ${input.now}
    )`;
}

function insertProjectGoalStatement(projectId: string, goalId: string, now: string): SQL {
  return sql`INSERT INTO project_goals (project_id, goal_id, created_at) VALUES (${projectId}, ${goalId}, ${now})`;
}

function insertMilestoneStatement(input: {
  id: string;
  projectId: string;
  title: string;
  dueDate: string | null;
  status: string;
  position: number;
  completedAt: string | null;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO project_milestones
    (id, project_id, title, due_date, status, position, completed_at, source_id,
     version, created_operation_id, created_at, updated_at)
    VALUES (
      ${input.id}, ${input.projectId}, ${input.title}, ${input.dueDate}, ${input.status},
      ${input.position}, ${input.completedAt}, ${MANUAL_SOURCE_ID}, 1, ${input.opId}, ${input.now}, ${input.now}
    )`;
}

/**
 * Marco criado por atualização de projeto: a inserção só acontece se o bump
 * otimista do projeto tiver vencido, evitando marco órfão em corrida.
 */
function insertGuardedMilestoneStatement(input: {
  id: string;
  projectId: string;
  title: string;
  dueDate: string | null;
  status: string;
  position: number;
  completedAt: string | null;
  expectedVersion: number;
  opId: string;
  now: string;
}): SQL {
  const nextVersion = input.expectedVersion + 1;
  return sql`INSERT INTO project_milestones
    (id, project_id, title, due_date, status, position, completed_at, source_id,
     version, created_operation_id, created_at, updated_at)
    SELECT ${input.id}, ${input.projectId}, ${input.title}, ${input.dueDate}, ${input.status},
      ${input.position}, ${input.completedAt}, ${MANUAL_SOURCE_ID}, 1, ${input.opId}, ${input.now}, ${input.now}
    WHERE EXISTS (
      SELECT 1 FROM projects
      WHERE id = ${input.projectId} AND version = ${nextVersion}
        AND updated_operation_id = ${input.opId} AND deleted_at IS NULL
    )`;
}

function updateProjectStatement(input: {
  id: string;
  expectedVersion: number;
  changes: ReturnType<typeof mergedProject>;
  completedAt: string | null;
  opId: string;
  now: string;
}): SQL {
  const c = input.changes;
  return sql`UPDATE projects SET
    title = ${c.title}, description = ${c.description}, status = ${c.status}, priority = ${c.priority},
    start_date = ${c.startDate}, target_date = ${c.targetDate}, completed_at = ${input.completedAt},
    version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

function softDeleteProjectStatement(input: {
  id: string;
  expectedVersion: number;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE projects SET
    deleted_at = ${input.now}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

function bumpProjectVersionStatement(input: {
  id: string;
  expectedVersion: number;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE projects SET
    version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

function deleteProjectGoalsStatement(input: { projectId: string; expectedVersion: number }): SQL {
  return sql`DELETE FROM project_goals
    WHERE project_id = ${input.projectId}
      AND EXISTS (SELECT 1 FROM projects WHERE id = ${input.projectId} AND version = ${input.expectedVersion})`;
}

function insertGuardedProjectGoalStatement(input: {
  projectId: string;
  goalId: string;
  expectedVersion: number;
  now: string;
}): SQL {
  return sql`INSERT INTO project_goals (project_id, goal_id, created_at)
    SELECT ${input.projectId}, ${input.goalId}, ${input.now}
    WHERE EXISTS (SELECT 1 FROM projects WHERE id = ${input.projectId} AND version = ${input.expectedVersion})`;
}

function updateMilestoneStatement(input: {
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
    title = ${input.title}, due_date = ${input.dueDate}, status = ${input.status}, position = ${input.position},
    completed_at = ${input.completedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export async function createProject(
  ctx: ProjectsContext,
  request: MutatingRequest,
  input: CreateProjectBody,
): Promise<IdempotentResult> {
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await assertGoalsExist(ctx, input.goalIds);
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const status = input.status ?? 'planned';
      const row: ProjectRow = {
        id,
        title: input.title,
        description: input.description ?? null,
        status,
        priority: input.priority ?? 'medium',
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        completedAt: projectStatusMeta(status, now).completedAt,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const dto = projectToDto(row, emptyAssociations(), input.goalIds);
      const milestoneRows = input.milestones.map((milestone) => ({
        id: newId(),
        projectId: id,
        title: milestone.title,
        dueDate: milestone.dueDate ?? null,
        status: milestone.status ?? 'pending',
        position: milestone.position ?? 0,
        completedAt: milestone.status === 'completed' ? now : null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }));
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, dto),
        statements: [
          insertProjectStatement({
            id,
            title: row.title,
            description: row.description,
            status: row.status,
            priority: row.priority,
            startDate: row.startDate,
            targetDate: row.targetDate,
            completedAt: row.completedAt,
            sourceId: MANUAL_SOURCE_ID,
            opId,
            now,
          }),
          ...input.goalIds.map((goalId) => insertProjectGoalStatement(id, goalId, now)),
          ...milestoneRows.map((milestone) =>
            insertMilestoneStatement({
              id: milestone.id,
              projectId: id,
              title: milestone.title,
              dueDate: milestone.dueDate,
              status: milestone.status,
              position: milestone.position,
              completedAt: milestone.completedAt,
              opId,
              now,
            }),
          ),
          auditStatement({
            entityType: 'project',
            entityId: id,
            action: 'create',
            actorType: 'user',
            actorId: ctx.subject,
            afterJson: JSON.stringify(projectSnapshot(row)),
            requestId: ctx.requestId,
            ipHash: ctx.ipHash,
          }),
        ],
      };
    },
  );
}

export async function getProjectDetail(
  ctx: ProjectsContext,
  id: string,
): Promise<ProjectDetailDto> {
  const row = await projectOr404(ctx, id);
  const associations = await loadAssociations(ctx, [row]);
  const dto = projectToDto(row, associations);
  const milestones = associations.milestones.filter((milestone) => milestone.projectId === id);
  const status: ProjectStatus = isProjectStatus(row.status) ? row.status : 'planned';
  const milestoneProgress = calculateMilestoneProgress(
    milestones.map((milestone): Pick<MilestoneLike, 'status'> => ({
      status: isMilestoneStatus(milestone.status) ? milestone.status : 'pending',
    })),
    status,
  );
  return { ...dto, milestones: milestones.map(milestoneToDto), milestoneProgress };
}

export async function updateProject(
  ctx: ProjectsContext,
  request: MutatingRequest,
  id: string,
  input: UpdateProjectBody,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await projectOr404(ctx, id);
  const associations = await loadAssociations(ctx, [snapshot]);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const row = await projectOr404(ctx, id);
        await requireVersion(ctx, row, expectedVersion, input.version);
      },
    },
    ({ opId, now }) => {
      const changes = mergedProject(snapshot, input);
      const after: ProjectRow = {
        ...snapshot,
        ...changes,
        completedAt: nextProjectCompletedAt(changes.status, snapshot.completedAt, now),
        version: snapshot.version + 1,
        updatedAt: now,
      };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, projectToDto(after, associations)),
        statements: [
          updateProjectStatement({
            id,
            expectedVersion: snapshot.version,
            changes,
            completedAt: after.completedAt,
            opId,
            now,
          }),
          auditStatement(
            {
              entityType: 'project',
              entityId: id,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(projectSnapshot(snapshot)),
              afterJson: JSON.stringify(projectSnapshot(after)),
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

export async function deleteProject(
  ctx: ProjectsContext,
  request: MutatingRequest,
  id: string,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await projectOr404(ctx, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await requireVersion(ctx, await projectOr404(ctx, id), expectedVersion);
      },
    },
    ({ opId, now }) => {
      const after: ProjectRow = { ...snapshot, version: snapshot.version + 1, updatedAt: now };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, { deleted: true }),
        statements: [
          softDeleteProjectStatement({ id, expectedVersion: snapshot.version, opId, now }),
          auditStatement(
            {
              entityType: 'project',
              entityId: id,
              action: 'delete',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(projectSnapshot(snapshot)),
              afterJson: JSON.stringify(projectSnapshot(after)),
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

export async function setProjectGoals(
  ctx: ProjectsContext,
  request: MutatingRequest,
  id: string,
  input: SetProjectGoalsBody,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await projectOr404(ctx, id);
  const associations = await loadAssociations(ctx, [snapshot]);
  const currentGoalIds = associations.goalIdsByProject.get(id) ?? [];
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await requireVersion(ctx, await projectOr404(ctx, id), expectedVersion, input.version);
        await assertGoalsExist(ctx, input.goalIds);
      },
    },
    ({ opId, now }) => {
      const goalIds = [...new Set(input.goalIds)];
      const after: ProjectRow = { ...snapshot, version: snapshot.version + 1, updatedAt: now };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, projectToDto(after, associations, goalIds)),
        statements: [
          deleteProjectGoalsStatement({ projectId: id, expectedVersion: snapshot.version }),
          ...goalIds.map((goalId) =>
            insertGuardedProjectGoalStatement({
              projectId: id,
              goalId,
              expectedVersion: snapshot.version,
              now,
            }),
          ),
          bumpProjectVersionStatement({ id, expectedVersion: snapshot.version, opId, now }),
          auditStatement(
            {
              entityType: 'project',
              entityId: id,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify({
                ...projectSnapshot(snapshot),
                ...goalsSnapshot(currentGoalIds),
              }),
              afterJson: JSON.stringify({ ...projectSnapshot(after), ...goalsSnapshot(goalIds) }),
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

export async function createProjectMilestone(
  ctx: ProjectsContext,
  request: MutatingRequest,
  id: string,
  input: CreateProjectMilestoneBody,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await projectOr404(ctx, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await requireVersion(ctx, await projectOr404(ctx, id), expectedVersion, input.version);
      },
    },
    ({ opId, now }) => {
      const milestoneId = newId();
      const status = input.status ?? 'pending';
      const row: MilestoneRow = {
        id: milestoneId,
        projectId: id,
        title: input.title,
        dueDate: input.dueDate ?? null,
        status,
        position: input.position ?? 0,
        completedAt: status === 'completed' ? now : null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, milestoneToDto(row)),
        statements: [
          bumpProjectVersionStatement({ id, expectedVersion: snapshot.version, opId, now }),
          insertGuardedMilestoneStatement({
            id: milestoneId,
            projectId: id,
            title: row.title,
            dueDate: row.dueDate,
            status: row.status,
            position: row.position,
            completedAt: row.completedAt,
            expectedVersion: snapshot.version,
            opId,
            now,
          }),
          auditStatement(
            {
              entityType: 'project_milestone',
              entityId: milestoneId,
              action: 'create',
              actorType: 'user',
              actorId: ctx.subject,
              afterJson: JSON.stringify(milestoneSnapshot(row)),
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

export async function updateProjectMilestone(
  ctx: ProjectsContext,
  request: MutatingRequest,
  id: string,
  milestoneId: string,
  input: UpdateProjectMilestoneBody,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await assertMilestoneBelongs(ctx, id, milestoneId);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const row = await assertMilestoneBelongs(ctx, id, milestoneId);
        if (
          expectedVersion === undefined ||
          !Number.isInteger(expectedVersion) ||
          expectedVersion < 1
        ) {
          throw validationError('Cabeçalho If-Match obrigatório com a versão atual.');
        }
        if (expectedVersion !== input.version)
          throw validationError('Versão do corpo divergente de If-Match.');
        if (row.version !== expectedVersion)
          throw conflict('Marco foi alterado por outra operação.');
      },
    },
    ({ opId, now }) => {
      const status = input.status ?? snapshot.status;
      const after: MilestoneRow = {
        ...snapshot,
        title: input.title ?? snapshot.title,
        dueDate: input.dueDate === undefined ? snapshot.dueDate : input.dueDate,
        status,
        position: input.position ?? snapshot.position,
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
            dueDate: after.dueDate,
            status: after.status,
            position: after.position,
            completedAt: after.completedAt,
            opId,
            now,
          }),
          auditStatement(
            {
              entityType: 'project_milestone',
              entityId: milestoneId,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(milestoneSnapshot(snapshot)),
              afterJson: JSON.stringify(milestoneSnapshot(after)),
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
