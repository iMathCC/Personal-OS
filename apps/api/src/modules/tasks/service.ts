import { and, inArray, sql, type SQL } from 'drizzle-orm';
import {
  auditStatement,
  goals,
  newId,
  projectMilestones,
  projects,
  taskDependencies,
  tasks,
  type Database,
} from '@personal-os/db';
import {
  assertDependencyChange,
  assertDependencyGraph,
  conflict,
  deriveTaskExecution,
  localDateFor,
  notFound,
  validationError,
  type Priority,
  type TaskStatus,
} from '@personal-os/domain';
import type {
  CompleteTaskBody,
  CreateTaskBody,
  ListTasksQuery,
  SetTaskDependenciesBody,
  TaskDetailDto,
  TaskDto,
  UpdateTaskBody,
} from '@personal-os/shared';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';

const MANUAL_SOURCE_ID = 'src_manual';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const GRAPH_LIMIT = 10_000;
const ASSOCIATION_LIMIT = 2_000;

export interface TasksContext {
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

interface TaskRow {
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
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface DependencyRow {
  taskId: string;
  dependsOnTaskId: string;
  dependsOnTitle: string;
  dependsOnStatus: string;
  createdAt: string;
}

interface TaskTitleRow {
  id: string;
  title: string;
  status: string;
}

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
  version: tasks.version,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
} as const;

const DEPENDENCY_FIELDS = {
  taskId: taskDependencies.taskId,
  dependsOnTaskId: taskDependencies.dependsOnTaskId,
  dependsOnTitle: tasks.title,
  dependsOnStatus: tasks.status,
  createdAt: taskDependencies.createdAt,
} as const;

function envelope<T>(requestId: string, data: T): string {
  return JSON.stringify({ data, meta: { requestId } });
}

function mutationContext(ctx: TasksContext, request: MutatingRequest) {
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

function todayFor(ctx: TasksContext): string {
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(nowMs)) throw validationError('Instante da requisição inválido.');
  return localDateFor(nowMs, ctx.timezone);
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

function isPriority(value: string): value is Priority {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

/** Auditoria não recebe título, descrição nem qualquer outro texto livre. */
function taskSnapshot(row: TaskRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    milestoneId: row.milestoneId,
    goalId: row.goalId,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    estimateMinutes: row.estimateMinutes,
    completedAt: row.completedAt,
    version: row.version,
  };
}

function dependenciesSnapshot(ids: readonly string[]) {
  return { dependencyIds: [...ids] };
}

/** A tabela de arestas não tem ID próprio; o ID do DTO é determinístico e UUIDv7-shaped. */
function dependencyRowId(taskId: string, dependsOnTaskId: string): string {
  const task = taskId.replace(/-/g, '');
  const dependency = dependsOnTaskId.replace(/-/g, '');
  const base = `${task.slice(0, 16)}${dependency.slice(0, 16)}`;
  const hex = `${base.slice(0, 12)}7${base.slice(13, 16)}8${base.slice(17)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface Enrichment {
  dependencies: DependencyRow[];
  projectTitles: Map<string, string>;
  milestoneTitles: Map<string, string>;
  today: string;
}

function taskToDto(row: TaskRow, enrichment: Enrichment): TaskDto {
  const status: TaskStatus = isTaskStatus(row.status) ? row.status : 'todo';
  const dependencies = enrichment.dependencies.filter((edge) => edge.taskId === row.id);
  const dependencyIds = dependencies.map((edge) => edge.dependsOnTaskId);
  const statusByTaskId: Record<string, TaskStatus> = {};
  for (const edge of dependencies) {
    if (isTaskStatus(edge.dependsOnStatus))
      statusByTaskId[edge.dependsOnTaskId] = edge.dependsOnStatus;
  }
  const execution = deriveTaskExecution(
    status,
    dependencyIds,
    statusByTaskId,
    enrichment.today,
    row.dueDate,
  );
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.projectId,
    projectTitle:
      row.projectId === null ? null : (enrichment.projectTitles.get(row.projectId) ?? null),
    milestoneId: row.milestoneId,
    milestoneTitle:
      row.milestoneId === null ? null : (enrichment.milestoneTitles.get(row.milestoneId) ?? null),
    goalId: row.goalId,
    status,
    priority: isPriority(row.priority) ? row.priority : 'medium',
    dueDate: row.dueDate,
    estimateMinutes: row.estimateMinutes,
    completedAt: row.completedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    overdue: execution.overdue,
    dependencyState: execution.dependencyState,
    blockerIds: [...execution.blockerIds],
    executable: execution.executable,
    reason: execution.reason,
  };
}

async function loadDependencyRows(
  ctx: TasksContext,
  taskIds: readonly string[],
): Promise<DependencyRow[]> {
  if (taskIds.length === 0) return [];
  return ctx.db
    .select(DEPENDENCY_FIELDS)
    .from(taskDependencies)
    .innerJoin(tasks, sql`${tasks.id} = ${taskDependencies.dependsOnTaskId}`)
    .where(sql`${inArray(taskDependencies.taskId, [...taskIds])} AND ${tasks.deletedAt} IS NULL`)
    .orderBy(sql`${taskDependencies.taskId} ASC, ${taskDependencies.dependsOnTaskId} ASC`)
    .limit(ASSOCIATION_LIMIT) as Promise<DependencyRow[]>;
}

async function loadProjectTitles(
  ctx: TasksContext,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await ctx.db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(inArray(projects.id, unique))
    .limit(unique.length);
  return new Map(rows.map((row) => [row.id, row.title]));
}

async function loadMilestoneTitles(
  ctx: TasksContext,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await ctx.db
    .select({ id: projectMilestones.id, title: projectMilestones.title })
    .from(projectMilestones)
    .where(inArray(projectMilestones.id, unique))
    .limit(unique.length);
  return new Map(rows.map((row) => [row.id, row.title]));
}

async function enrichmentFor(ctx: TasksContext, rows: readonly TaskRow[]): Promise<Enrichment> {
  const dependencies = await loadDependencyRows(
    ctx,
    rows.map((row) => row.id),
  );
  const [projectTitles, milestoneTitles] = await Promise.all([
    loadProjectTitles(
      ctx,
      rows.map((row) => row.projectId).filter((id): id is string => id !== null),
    ),
    loadMilestoneTitles(
      ctx,
      rows.map((row) => row.milestoneId).filter((id): id is string => id !== null),
    ),
  ]);
  return { dependencies, projectTitles, milestoneTitles, today: todayFor(ctx) };
}

async function listTaskRows(
  ctx: TasksContext,
  query: ListTasksQuery,
  limit: number,
): Promise<TaskRow[]> {
  const conditions: SQL[] = [sql`${tasks.deletedAt} IS NULL`];
  if (query.projectId !== undefined) conditions.push(sql`${tasks.projectId} = ${query.projectId}`);
  if (query.goalId !== undefined) conditions.push(sql`${tasks.goalId} = ${query.goalId}`);
  if (query.milestoneId !== undefined)
    conditions.push(sql`${tasks.milestoneId} = ${query.milestoneId}`);
  if (query.status !== undefined) conditions.push(sql`${tasks.status} = ${query.status}`);
  if (query.priority !== undefined) conditions.push(sql`${tasks.priority} = ${query.priority}`);
  if (query.dueBefore !== undefined) conditions.push(sql`${tasks.dueDate} <= ${query.dueBefore}`);
  if (query.dueAfter !== undefined) conditions.push(sql`${tasks.dueDate} >= ${query.dueAfter}`);
  if (query.search !== undefined) {
    conditions.push(
      sql`lower(${tasks.title}) LIKE ${`%${query.search.toLocaleLowerCase('pt-BR')}%`}`,
    );
  }
  if (query.cursor !== undefined) {
    const cursorId = query.cursor.slice('task:'.length);
    // A ordenação é created_at DESC, id DESC; o cursor guarda apenas o ID,
    // então a data é lida na mesma consulta por subconsulta (sem query extra).
    conditions.push(sql`${tasks.createdAt} < (SELECT ${tasks.createdAt} FROM ${tasks} AS cursor_task WHERE cursor_task.id = ${cursorId})
      OR (${tasks.createdAt} = (SELECT ${tasks.createdAt} FROM ${tasks} AS cursor_task WHERE cursor_task.id = ${cursorId})
        AND ${tasks.id} < ${cursorId})`);
  }
  return ctx.db
    .select(TASK_FIELDS)
    .from(tasks)
    .where(and(...conditions))
    .orderBy(sql`${tasks.createdAt} DESC, ${tasks.id} DESC`)
    .limit(limit + 1)
    .then((rows) => rows as TaskRow[]);
}

export interface TaskPage {
  items: TaskDto[];
  nextCursor?: string;
  hasMore: boolean;
}

export async function listTasks(ctx: TasksContext, query: ListTasksQuery): Promise<TaskPage> {
  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const rows = (await listTaskRows(ctx, query, limit)).slice(0, limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const enrichment = await enrichmentFor(ctx, page);
  const items = page.map((row) => taskToDto(row, enrichment));
  const last = page.at(-1);
  return {
    items,
    ...(hasMore && last !== undefined ? { nextCursor: `task:${last.id}` } : {}),
    hasMore,
  };
}

async function taskOr404(ctx: TasksContext, id: string): Promise<TaskRow> {
  const row = await ctx.db
    .select(TASK_FIELDS)
    .from(tasks)
    .where(sql`${tasks.id} = ${id} AND ${tasks.deletedAt} IS NULL`)
    .limit(1)
    .then((rows) => rows[0] as TaskRow | undefined);
  if (row === undefined) throw notFound('Tarefa não encontrada.');
  return row;
}

async function dependentsFor(ctx: TasksContext, id: string): Promise<TaskTitleRow[]> {
  return ctx.db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(taskDependencies)
    .innerJoin(tasks, sql`${tasks.id} = ${taskDependencies.taskId}`)
    .where(sql`${taskDependencies.dependsOnTaskId} = ${id} AND ${tasks.deletedAt} IS NULL`)
    .orderBy(sql`${tasks.id} ASC`)
    .limit(ASSOCIATION_LIMIT) as Promise<TaskTitleRow[]>;
}

function dependencyDtos(edges: readonly DependencyRow[]): TaskDetailDto['dependencies'] {
  return edges.map((edge) => ({
    id: dependencyRowId(edge.taskId, edge.dependsOnTaskId),
    taskId: edge.taskId,
    dependsOnTaskId: edge.dependsOnTaskId,
    dependsOnTitle: edge.dependsOnTitle,
    dependsOnStatus: isTaskStatus(edge.dependsOnStatus) ? edge.dependsOnStatus : 'todo',
    createdAt: edge.createdAt,
  }));
}

export async function getTaskDetail(ctx: TasksContext, id: string): Promise<TaskDetailDto> {
  const row = await taskOr404(ctx, id);
  const [edges, dependents] = await Promise.all([
    loadDependencyRows(ctx, [id]),
    dependentsFor(ctx, id),
  ]);
  // O título do projeto/marco é resolvido apenas no detalhe: a listagem já faz
  // duas consultas agregadas próprias e um join por linha estouraria o orçamento.
  const enrichment = await enrichmentFor(ctx, [row]);
  return {
    ...taskToDto(row, enrichment),
    dependencies: dependencyDtos(edges),
    dependents: dependents.map((dependent) => ({
      id: dependent.id,
      title: dependent.title,
      status: isTaskStatus(dependent.status) ? dependent.status : 'todo',
    })),
  };
}

interface Graph {
  edges: (readonly [string, string])[];
  knownIds: string[];
  statusById: Map<string, TaskStatus>;
  titleById: Map<string, string>;
}

async function loadGraph(ctx: TasksContext): Promise<Graph> {
  const [taskRows, edgeRows] = await Promise.all([
    ctx.db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(tasks)
      .where(sql`${tasks.deletedAt} IS NULL`)
      .orderBy(sql`${tasks.id} ASC`)
      .limit(GRAPH_LIMIT + 1) as Promise<TaskTitleRow[]>,
    ctx.db
      .select({
        taskId: taskDependencies.taskId,
        dependsOnTaskId: taskDependencies.dependsOnTaskId,
      })
      .from(taskDependencies)
      .orderBy(sql`${taskDependencies.taskId} ASC, ${taskDependencies.dependsOnTaskId} ASC`)
      .limit(GRAPH_LIMIT + 1),
  ]);
  if (taskRows.length > GRAPH_LIMIT || edgeRows.length > GRAPH_LIMIT) {
    throw validationError('Grafo de dependências excede o limite suportado.');
  }
  return {
    edges: edgeRows.map((edge): readonly [string, string] => [edge.taskId, edge.dependsOnTaskId]),
    knownIds: taskRows.map((row) => row.id),
    statusById: new Map(
      taskRows.flatMap((row) => (isTaskStatus(row.status) ? [[row.id, row.status] as const] : [])),
    ),
    titleById: new Map(taskRows.map((row) => [row.id, row.title])),
  };
}

async function assertProjectExists(ctx: TasksContext, id: string): Promise<void> {
  const row = await ctx.db
    .select({ id: projects.id })
    .from(projects)
    .where(sql`${projects.id} = ${id} AND ${projects.deletedAt} IS NULL`)
    .limit(1);
  if (row.length === 0) throw notFound('Projeto não encontrado.');
}

async function assertGoalExists(ctx: TasksContext, id: string): Promise<void> {
  const row = await ctx.db
    .select({ id: goals.id })
    .from(goals)
    .where(sql`${goals.id} = ${id} AND ${goals.deletedAt} IS NULL`)
    .limit(1);
  if (row.length === 0) throw notFound('Objetivo não encontrado.');
}

async function assertMilestone(
  ctx: TasksContext,
  projectId: string | null,
  milestoneId: string | null,
) {
  if (milestoneId === null) return;
  if (projectId === null) throw validationError('Marco exige um projeto.');
  const row = await ctx.db
    .select({ id: projectMilestones.id, projectId: projectMilestones.projectId })
    .from(projectMilestones)
    .where(sql`${projectMilestones.id} = ${milestoneId} AND ${projectMilestones.deletedAt} IS NULL`)
    .limit(1)
    .then((rows) => rows[0]);
  if (row === undefined || row.projectId !== projectId)
    throw notFound('Marco do projeto não encontrado.');
}

async function requireVersion(
  ctx: TasksContext,
  row: TaskRow,
  expectedVersion: number | undefined,
  bodyVersion?: number,
): Promise<void> {
  if (expectedVersion === undefined || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw validationError('Cabeçalho If-Match obrigatório com a versão atual.');
  }
  if (bodyVersion !== undefined && bodyVersion !== expectedVersion) {
    throw validationError('Versão do corpo divergente de If-Match.');
  }
  if (row.version !== expectedVersion) throw conflict('Tarefa foi alterada por outra operação.');
}

function insertTaskStatement(input: {
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
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO tasks
    (id, title, description, project_id, milestone_id, goal_id, status, priority,
     due_date, estimate_minutes, completed_at, source_id, version, created_operation_id, created_at, updated_at)
    VALUES (
      ${input.id}, ${input.title}, ${input.description}, ${input.projectId}, ${input.milestoneId},
      ${input.goalId}, ${input.status}, ${input.priority}, ${input.dueDate}, ${input.estimateMinutes},
      ${input.completedAt}, ${MANUAL_SOURCE_ID}, 1, ${input.opId}, ${input.now}, ${input.now}
    )`;
}

function insertDependencyStatement(
  taskId: string,
  dependsOnTaskId: string,
  opId: string,
  now: string,
): SQL {
  return sql`INSERT INTO task_dependencies (task_id, depends_on_task_id, created_at)
    VALUES (${taskId}, ${dependsOnTaskId}, ${now})`;
}

type TaskChanges = ReturnType<typeof mergedTask>;

function updateTaskStatement(input: {
  id: string;
  expectedVersion: number;
  changes: TaskChanges;
  completedAt: string | null;
  opId: string;
  now: string;
}): SQL {
  const c = input.changes;
  return sql`UPDATE tasks SET
    title = ${c.title}, description = ${c.description}, project_id = ${c.projectId},
    milestone_id = ${c.milestoneId}, goal_id = ${c.goalId}, status = ${c.status},
    priority = ${c.priority}, due_date = ${c.dueDate}, estimate_minutes = ${c.estimateMinutes},
    completed_at = ${input.completedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

function completeTaskStatement(input: {
  id: string;
  expectedVersion: number;
  completedAt: string;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE tasks SET
    status = 'completed', completed_at = ${input.completedAt}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

function softDeleteTaskStatement(input: {
  id: string;
  expectedVersion: number;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE tasks SET
    deleted_at = ${input.now}, version = version + 1,
    updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

function deleteDependenciesStatement(input: { taskId: string; expectedVersion: number }): SQL {
  return sql`DELETE FROM task_dependencies
    WHERE task_id = ${input.taskId}
      AND EXISTS (SELECT 1 FROM tasks WHERE id = ${input.taskId} AND version = ${input.expectedVersion})`;
}

function insertGuardedDependencyStatement(input: {
  taskId: string;
  dependsOnTaskId: string;
  expectedVersion: number;
  opId: string;
  now: string;
}): SQL {
  return sql`INSERT INTO task_dependencies (task_id, depends_on_task_id, created_at)
    SELECT ${input.taskId}, ${input.dependsOnTaskId}, ${input.now}
    WHERE EXISTS (SELECT 1 FROM tasks WHERE id = ${input.taskId} AND version = ${input.expectedVersion})`;
}

function bumpTaskVersionStatement(input: {
  id: string;
  expectedVersion: number;
  opId: string;
  now: string;
}): SQL {
  return sql`UPDATE tasks SET
    version = version + 1, updated_operation_id = ${input.opId}, updated_at = ${input.now}
    WHERE id = ${input.id} AND version = ${input.expectedVersion} AND deleted_at IS NULL`;
}

export async function createTask(
  ctx: TasksContext,
  request: MutatingRequest,
  input: CreateTaskBody,
): Promise<IdempotentResult> {
  let validatedGraph: Graph | undefined;
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const graph = await loadGraph(ctx);
        validatedGraph = graph;
        if (input.projectId !== null && input.projectId !== undefined) {
          await assertProjectExists(ctx, input.projectId);
        }
        await assertMilestone(ctx, input.projectId ?? null, input.milestoneId ?? null);
        if (input.goalId !== null && input.goalId !== undefined)
          await assertGoalExists(ctx, input.goalId);
        // A tarefa ainda não tem ID: um sentinela impossível representa a nova
        // aresta na validação de self-loop, referências e ciclos.
        const placeholder = 'pending-new-task';
        assertDependencyGraph(
          [
            ...graph.edges,
            ...input.dependencyIds.map((id): readonly [string, string] => [placeholder, id]),
          ],
          [...graph.knownIds, placeholder],
        );
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const status = input.status ?? 'todo';
      const row: TaskRow = {
        id,
        title: input.title,
        description: input.description ?? null,
        projectId: input.projectId ?? null,
        milestoneId: input.milestoneId ?? null,
        goalId: input.goalId ?? null,
        status,
        priority: input.priority ?? 'medium',
        dueDate: input.dueDate ?? null,
        estimateMinutes: input.estimateMinutes ?? null,
        completedAt: status === 'completed' ? now : null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const edges = input.dependencyIds.map((dependencyId): readonly [string, string] => [
        id,
        dependencyId,
      ]);
      const graph = validatedGraph;
      const dependencies: DependencyRow[] = input.dependencyIds.map((dependsOnTaskId) => ({
        taskId: id,
        dependsOnTaskId,
        dependsOnTitle: graph?.titleById.get(dependsOnTaskId) ?? '',
        dependsOnStatus: graph?.statusById.get(dependsOnTaskId) ?? 'todo',
        createdAt: now,
      }));
      return {
        status: 201 as const,
        bodyJson: envelope(
          ctx.requestId,
          taskToDto(row, {
            dependencies,
            projectTitles: new Map(),
            milestoneTitles: new Map(),
            today: todayFor(ctx),
          }),
        ),
        statements: [
          insertTaskStatement({
            id,
            title: row.title,
            description: row.description,
            projectId: row.projectId,
            milestoneId: row.milestoneId,
            goalId: row.goalId,
            status: row.status,
            priority: row.priority,
            dueDate: row.dueDate,
            estimateMinutes: row.estimateMinutes,
            completedAt: row.completedAt,
            opId,
            now,
          }),
          ...edges.map(([, dependencyId]) =>
            insertDependencyStatement(id, dependencyId, opId, now),
          ),
          auditStatement({
            entityType: 'task',
            entityId: id,
            action: 'create',
            actorType: 'user',
            actorId: ctx.subject,
            afterJson: JSON.stringify({
              ...taskSnapshot(row),
              ...dependenciesSnapshot(input.dependencyIds),
            }),
            requestId: ctx.requestId,
            ipHash: ctx.ipHash,
          }),
        ],
      };
    },
  );
}

function mergedTask(row: TaskRow, input: UpdateTaskBody) {
  return {
    title: input.title ?? row.title,
    description: input.description === undefined ? row.description : input.description,
    projectId: input.projectId === undefined ? row.projectId : input.projectId,
    milestoneId: input.milestoneId === undefined ? row.milestoneId : input.milestoneId,
    goalId: input.goalId === undefined ? row.goalId : input.goalId,
    status: input.status ?? row.status,
    priority: input.priority ?? row.priority,
    dueDate: input.dueDate === undefined ? row.dueDate : input.dueDate,
    estimateMinutes:
      input.estimateMinutes === undefined ? row.estimateMinutes : input.estimateMinutes,
  };
}

export async function updateTask(
  ctx: TasksContext,
  request: MutatingRequest,
  id: string,
  input: UpdateTaskBody,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await taskOr404(ctx, id);
  let validatedDependencies: DependencyRow[] = [];
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const row = await taskOr404(ctx, id);
        await requireVersion(ctx, row, expectedVersion, input.version);
        const changes = mergedTask(row, input);
        if (changes.projectId !== null) await assertProjectExists(ctx, changes.projectId);
        await assertMilestone(ctx, changes.projectId, changes.milestoneId);
        if (changes.goalId !== null) await assertGoalExists(ctx, changes.goalId);
        // Nenhuma aresta muda aqui, mas o grafo atual precisa ser válido.
        const graph = await loadGraph(ctx);
        const currentDependencies = graph.edges.filter(([from]) => from === id).map(([, to]) => to);
        assertDependencyChange(id, currentDependencies, graph.edges, graph.knownIds);
        validatedDependencies = currentDependencies.map((dependsOnTaskId) => ({
          taskId: id,
          dependsOnTaskId,
          dependsOnTitle: graph.titleById.get(dependsOnTaskId) ?? '',
          dependsOnStatus: graph.statusById.get(dependsOnTaskId) ?? 'todo',
          createdAt: row.createdAt,
        }));
      },
    },
    ({ opId, now }) => {
      const changes = mergedTask(snapshot, input);
      const completedAt = changes.status === 'completed' ? (snapshot.completedAt ?? now) : null;
      const after: TaskRow = {
        ...snapshot,
        ...changes,
        completedAt,
        version: snapshot.version + 1,
        updatedAt: now,
      };
      return {
        status: 200 as const,
        bodyJson: envelope(
          ctx.requestId,
          taskToDto(after, {
            dependencies: validatedDependencies,
            projectTitles: new Map(),
            milestoneTitles: new Map(),
            today: todayFor(ctx),
          }),
        ),
        statements: [
          updateTaskStatement({
            id,
            expectedVersion: snapshot.version,
            changes,
            completedAt,
            opId,
            now,
          }),
          auditStatement(
            {
              entityType: 'task',
              entityId: id,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(taskSnapshot(snapshot)),
              afterJson: JSON.stringify(taskSnapshot(after)),
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

export async function completeTask(
  ctx: TasksContext,
  request: MutatingRequest,
  id: string,
  input: CompleteTaskBody,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await taskOr404(ctx, id);
  let validatedDependencies: DependencyRow[] = [];
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const row = await taskOr404(ctx, id);
        await requireVersion(ctx, row, expectedVersion, input.version);
        if (row.status === 'completed') throw conflict('Tarefa já está concluída.');
        if (row.status === 'cancelled') throw conflict('Tarefa cancelada não pode ser concluída.');
        validatedDependencies = await loadDependencyRows(ctx, [id]);
      },
    },
    ({ opId, now }) => {
      const after: TaskRow = {
        ...snapshot,
        status: 'completed',
        completedAt: now,
        version: snapshot.version + 1,
        updatedAt: now,
      };
      return {
        status: 200 as const,
        bodyJson: envelope(
          ctx.requestId,
          taskToDto(after, {
            dependencies: validatedDependencies,
            projectTitles: new Map(),
            milestoneTitles: new Map(),
            today: todayFor(ctx),
          }),
        ),
        statements: [
          completeTaskStatement({
            id,
            expectedVersion: snapshot.version,
            completedAt: now,
            opId,
            now,
          }),
          auditStatement(
            {
              entityType: 'task',
              entityId: id,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(taskSnapshot(snapshot)),
              afterJson: JSON.stringify(taskSnapshot(after)),
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

export async function setTaskDependencies(
  ctx: TasksContext,
  request: MutatingRequest,
  id: string,
  input: SetTaskDependenciesBody,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await taskOr404(ctx, id);
  let validatedGraph: Graph | undefined;
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const row = await taskOr404(ctx, id);
        await requireVersion(ctx, row, expectedVersion, input.version);
        const graph = await loadGraph(ctx);
        assertDependencyChange(id, input.dependencyIds, graph.edges, graph.knownIds);
        validatedGraph = graph;
      },
    },
    ({ opId, now }) => {
      const graph = validatedGraph;
      if (graph === undefined) throw validationError('Grafo de dependências não validado.');
      const after: TaskRow = { ...snapshot, version: snapshot.version + 1, updatedAt: now };
      const edges = input.dependencyIds.map((to): readonly [string, string] => [id, to]);
      const currentDependencies = graph.edges.filter(([from]) => from === id).map(([, to]) => to);
      const dependencies: DependencyRow[] = input.dependencyIds.map((dependsOnTaskId) => ({
        taskId: id,
        dependsOnTaskId,
        dependsOnTitle: graph.titleById.get(dependsOnTaskId) ?? '',
        dependsOnStatus: graph.statusById.get(dependsOnTaskId) ?? 'todo',
        createdAt: now,
      }));
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, {
          ...taskToDto(after, {
            dependencies,
            projectTitles: new Map(),
            milestoneTitles: new Map(),
            today: todayFor(ctx),
          }),
          dependencies: dependencyDtos(dependencies),
          dependents: graph.edges
            .filter(([, to]) => to === id)
            .map(([from]) => ({
              id: from,
              title: graph.titleById.get(from) ?? '',
              status: graph.statusById.get(from) ?? 'todo',
            })),
        } satisfies TaskDetailDto),
        statements: [
          deleteDependenciesStatement({ taskId: id, expectedVersion: snapshot.version }),
          ...edges.map(([, dependsOnTaskId]) =>
            insertGuardedDependencyStatement({
              taskId: id,
              dependsOnTaskId,
              expectedVersion: snapshot.version,
              opId,
              now,
            }),
          ),
          bumpTaskVersionStatement({ id, expectedVersion: snapshot.version, opId, now }),
          auditStatement(
            {
              entityType: 'task',
              entityId: id,
              action: 'update',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify({
                ...taskSnapshot(snapshot),
                ...dependenciesSnapshot(currentDependencies),
              }),
              afterJson: JSON.stringify({
                ...taskSnapshot(after),
                ...dependenciesSnapshot(input.dependencyIds),
              }),
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

export async function deleteTask(
  ctx: TasksContext,
  request: MutatingRequest,
  id: string,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const snapshot = await taskOr404(ctx, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        await requireVersion(ctx, await taskOr404(ctx, id), expectedVersion);
      },
    },
    ({ opId, now }) => {
      const after: TaskRow = { ...snapshot, version: snapshot.version + 1, updatedAt: now };
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, { deleted: true }),
        statements: [
          softDeleteTaskStatement({ id, expectedVersion: snapshot.version, opId, now }),
          auditStatement(
            {
              entityType: 'task',
              entityId: id,
              action: 'delete',
              actorType: 'user',
              actorId: ctx.subject,
              beforeJson: JSON.stringify(taskSnapshot(snapshot)),
              afterJson: JSON.stringify(taskSnapshot(after)),
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
