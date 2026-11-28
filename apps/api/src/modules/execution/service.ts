import { and, inArray, sql, type SQL } from 'drizzle-orm';
import {
  auditLog,
  projectMilestones,
  projects,
  taskDependencies,
  tasks,
  type Database,
} from '@personal-os/db';
import {
  buildExecutionDashboard,
  calculateProjectActivity,
  EXECUTION_RISK_ALGORITHM,
  NEXT_ACTION_ALGORITHM,
  PROJECT_ACTIVITY_ALGORITHM,
  PROJECT_PROGRESS_ALGORITHM,
  shiftLocalDate,
  TASK_BLOCKING_ALGORITHM,
  localDateFor,
  validationError,
  type Activity,
  type MilestoneLike,
  type Priority,
  type ProjectLike,
  type ProjectStatus,
  type TaskLike,
  type TaskStatus,
} from '@personal-os/domain';
import type {
  ExecutionDashboardData,
  ExecutionQuery,
  TimelineEventDto,
  TimelineQuery,
} from '@personal-os/shared';

const READ_LIMIT = 200;
const TASK_JOIN_LIMIT = 1_000;

export interface ExecutionContext {
  db: Database;
  requestId: string;
  now: string;
  timezone: string;
}

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  completedAt: string | null;
}

interface TaskJoinRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  dependencyId: string | null;
}

interface MilestoneRow {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectId: string;
  completedAt: string | null;
  updatedAt: string;
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

function isMilestoneStatus(
  value: string,
): value is 'pending' | 'in_progress' | 'completed' | 'cancelled' {
  return (
    value === 'pending' || value === 'in_progress' || value === 'completed' || value === 'cancelled'
  );
}

function todayFor(ctx: ExecutionContext): string {
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(nowMs)) throw validationError('Instante da requisição inválido.');
  return localDateFor(nowMs, ctx.timezone);
}

/**
 * O painel usa exatamente três consultas de domínio (projetos, tarefas com
 * arestas, marcos); as duas consultas de contexto (sessão/fuso) já vêm do
 * middleware. Nenhum resultado derivado é persistido.
 */
export async function getExecutionDashboard(
  ctx: ExecutionContext,
  query: ExecutionQuery,
): Promise<ExecutionDashboardData> {
  // `date` explícita já é um local_date validado; `today` só é o padrão.
  const date = query.date ?? todayFor(ctx);
  const projectConditions: SQL[] = [sql`${projects.deletedAt} IS NULL`];
  const taskConditions: SQL[] = [sql`${tasks.deletedAt} IS NULL`];
  const milestoneConditions: SQL[] = [sql`${projectMilestones.deletedAt} IS NULL`];
  if (query.projectId !== undefined) {
    projectConditions.push(sql`${projects.id} = ${query.projectId}`);
    taskConditions.push(sql`${tasks.projectId} = ${query.projectId}`);
    milestoneConditions.push(sql`${projectMilestones.projectId} = ${query.projectId}`);
  }

  const [projectRows, taskRows, milestoneRows] = await Promise.all([
    ctx.db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        updatedAt: projects.updatedAt,
        completedAt: projects.completedAt,
      })
      .from(projects)
      .where(and(...projectConditions))
      .orderBy(sql`${projects.id} ASC`)
      .limit(READ_LIMIT + 1),
    ctx.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        projectId: tasks.projectId,
        dueDate: tasks.dueDate,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        completedAt: tasks.completedAt,
        dependencyId: taskDependencies.dependsOnTaskId,
      })
      .from(tasks)
      .leftJoin(taskDependencies, sql`${taskDependencies.taskId} = ${tasks.id}`)
      .where(and(...taskConditions))
      .orderBy(sql`${tasks.id} ASC, ${taskDependencies.dependsOnTaskId} ASC`)
      .limit(TASK_JOIN_LIMIT + 1),
    ctx.db
      .select({
        id: projectMilestones.id,
        title: projectMilestones.title,
        status: projectMilestones.status,
        dueDate: projectMilestones.dueDate,
        projectId: projectMilestones.projectId,
        completedAt: projectMilestones.completedAt,
        updatedAt: projectMilestones.updatedAt,
      })
      .from(projectMilestones)
      .where(and(...milestoneConditions))
      .orderBy(sql`${projectMilestones.id} ASC`)
      .limit(READ_LIMIT + 1),
  ]);

  const truncated =
    projectRows.length > READ_LIMIT ||
    milestoneRows.length > READ_LIMIT ||
    taskRows.length > TASK_JOIN_LIMIT;

  const projectList = projectRows.slice(0, READ_LIMIT) as ProjectRow[];
  const milestoneList = milestoneRows.slice(0, READ_LIMIT) as MilestoneRow[];
  const joinedTasks = taskRows.slice(0, TASK_JOIN_LIMIT) as TaskJoinRow[];

  const taskMap = new Map<string, TaskJoinRow>();
  const dependencyIdsByTask: Record<string, string[]> = {};
  const statusByTaskId: Record<string, TaskStatus> = {};
  const completedAtByTaskId: Record<string, string | null> = {};
  for (const row of joinedTasks) {
    const existing = taskMap.get(row.id);
    if (existing === undefined) {
      taskMap.set(row.id, row);
      dependencyIdsByTask[row.id] = [];
      completedAtByTaskId[row.id] = row.completedAt;
    }
    if (row.dependencyId !== null) {
      const list = dependencyIdsByTask[row.id] ?? [];
      if (!list.includes(row.dependencyId)) list.push(row.dependencyId);
      dependencyIdsByTask[row.id] = list;
    }
    if (isTaskStatus(row.status)) statusByTaskId[row.id] = row.status;
  }

  const projectsInput: ProjectLike[] = projectList.map((row) => ({
    id: row.id,
    title: row.title,
    status: isProjectStatus(row.status) ? row.status : 'planned',
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  }));
  const tasksInput: TaskLike[] = [...taskMap.values()].map((row) => ({
    id: row.id,
    title: row.title,
    status: isTaskStatus(row.status) ? row.status : 'todo',
    priority: isPriority(row.priority) ? row.priority : 'medium',
    projectId: row.projectId,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    dependencyIds: dependencyIdsByTask[row.id] ?? [],
  }));
  const milestonesInput: MilestoneLike[] = milestoneList.map((row) => ({
    id: row.id,
    title: row.title,
    status: isMilestoneStatus(row.status) ? row.status : 'pending',
    dueDate: row.dueDate,
  }));

  const timestampsByProject = new Map<string, (string | null)[]>();
  for (const task of tasksInput) {
    if (task.projectId === null) continue;
    const timestamps = timestampsByProject.get(task.projectId) ?? [];
    timestamps.push(task.createdAt, completedAtByTaskId[task.id] ?? null);
    timestampsByProject.set(task.projectId, timestamps);
  }
  for (const milestone of milestoneList) {
    const timestamps = timestampsByProject.get(milestone.projectId) ?? [];
    timestamps.push(milestone.completedAt, milestone.updatedAt);
    timestampsByProject.set(milestone.projectId, timestamps);
  }
  const activityByProjectId: Record<string, Activity> = {};
  for (const project of projectsInput) {
    activityByProjectId[project.id] = calculateProjectActivity(
      project,
      timestampsByProject.get(project.id) ?? [],
      date,
      ctx.timezone,
    );
  }

  const result = buildExecutionDashboard({
    date,
    projects: projectsInput,
    tasks: tasksInput,
    milestones: milestonesInput,
    dependencyIdsByTask,
    statusByTaskId,
    activityByProjectId,
    completedAtByTaskId,
    timezone: ctx.timezone,
    truncated,
  });

  return {
    date,
    timezone: ctx.timezone,
    generatedAt: ctx.now,
    signals: result.signals,
    nextAction:
      result.nextAction === null
        ? null
        : { ...result.nextAction, reasonCodes: [...result.nextAction.reasonCodes] },
    risks: result.risks.map((risk) => ({ ...risk, reasons: [...risk.reasons] })),
    projects: result.projects.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      progress: { percent: project.progress.percent, basis: project.progress.basis },
      activityState: project.activityState,
      daysSinceActivity: project.daysSinceActivity,
    })),
    algorithms: {
      progress: PROJECT_PROGRESS_ALGORITHM,
      activity: PROJECT_ACTIVITY_ALGORITHM,
      blocking: TASK_BLOCKING_ALGORITHM,
      nextAction: NEXT_ACTION_ALGORITHM,
      risk: EXECUTION_RISK_ALGORITHM,
    },
    truncated: result.truncated,
  };
}

interface AuditRow {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  afterJson: string | null;
  createdAt: string;
}

interface EntityRow {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
}

/** ID opaco do evento derivado do ID sequencial de auditoria (UUIDv7-shaped). */
function auditEventId(id: number): string {
  return `00000000-0000-7000-8000-${id.toString(16).padStart(12, '0')}`;
}

function parseEventCursor(cursor: string): number {
  const match = /^event:00000000-0000-7000-8000-([0-9a-f]{12})$/.exec(cursor);
  const hex = match?.[1];
  if (hex === undefined) throw validationError('Cursor de linha do tempo inválido.');
  const id = Number.parseInt(hex, 16);
  if (!Number.isSafeInteger(id) || id < 1)
    throw validationError('Cursor de linha do tempo inválido.');
  return id;
}

/** Início do dia local em UTC, calculado no fuso da conta, não no do servidor. */
function localDayStartMs(localDate: string, timezone: string): number {
  const noon = Date.parse(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(noon)) throw validationError('Data local inválida.');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(noon));
  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((item) => item.type === type)?.value;
    return value === undefined ? 0 : Number(value);
  };
  const elapsed =
    (part('hour') % 24) * 3_600_000 + part('minute') * 60_000 + part('second') * 1_000;
  return noon - elapsed;
}

function snapshotStatus(json: string | null): string | null {
  if (json === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>).status;
  return typeof status === 'string' ? status : null;
}

function eventKind(row: AuditRow): TimelineEventDto['kind'] {
  if (row.entityType === 'project') return 'project';
  if (row.entityType === 'project_milestone') return 'milestone';
  if (row.action === 'update' && snapshotStatus(row.afterJson) === 'completed') return 'completion';
  return 'task';
}

async function entityRows(
  ctx: ExecutionContext,
  rows: readonly AuditRow[],
): Promise<Map<string, EntityRow>> {
  const projectIds = rows.filter((row) => row.entityType === 'project').map((row) => row.entityId);
  const taskIds = rows.filter((row) => row.entityType === 'task').map((row) => row.entityId);
  const milestoneIds = rows
    .filter((row) => row.entityType === 'project_milestone')
    .map((row) => row.entityId);
  const [projectRows, taskRows, milestoneRows] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve([])
      : ctx.db
          .select({
            id: projects.id,
            title: projects.title,
            status: projects.status,
            projectId: sql<string | null>`NULL`,
          })
          .from(projects)
          .where(inArray(projects.id, projectIds))
          .limit(projectIds.length),
    taskIds.length === 0
      ? Promise.resolve([])
      : ctx.db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            projectId: tasks.projectId,
          })
          .from(tasks)
          .where(inArray(tasks.id, taskIds))
          .limit(taskIds.length),
    milestoneIds.length === 0
      ? Promise.resolve([])
      : ctx.db
          .select({
            id: projectMilestones.id,
            title: projectMilestones.title,
            status: projectMilestones.status,
            projectId: projectMilestones.projectId,
          })
          .from(projectMilestones)
          .where(inArray(projectMilestones.id, milestoneIds))
          .limit(milestoneIds.length),
  ]);
  const map = new Map<string, EntityRow>();
  for (const row of [...projectRows, ...taskRows, ...milestoneRows] as EntityRow[]) {
    map.set(row.id, row);
  }
  return map;
}

export interface TimelinePage {
  items: TimelineEventDto[];
  nextCursor?: string;
  hasMore: boolean;
}

export async function getTimeline(
  ctx: ExecutionContext,
  query: TimelineQuery,
): Promise<TimelinePage> {
  const limit = Math.min(query.limit ?? 50, READ_LIMIT);
  if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
    throw validationError('Intervalo inválido.');
  }
  const conditions: SQL[] = [
    sql`${auditLog.entityType} IN ('project', 'task', 'project_milestone')`,
    sql`${auditLog.action} IN ('create', 'update', 'delete')`,
  ];
  if (query.projectId !== undefined) {
    conditions.push(sql`(
      (${auditLog.entityType} = 'project' AND ${auditLog.entityId} = ${query.projectId})
      OR (${auditLog.entityType} = 'task' AND ${auditLog.entityId} IN (
        SELECT ${tasks.id} FROM ${tasks} WHERE ${tasks.projectId} = ${query.projectId}
      ))
      OR (${auditLog.entityType} = 'project_milestone' AND ${auditLog.entityId} IN (
        SELECT ${projectMilestones.id} FROM ${projectMilestones} WHERE ${projectMilestones.projectId} = ${query.projectId}
      ))
    )`);
  }
  if (query.from !== undefined) {
    conditions.push(
      sql`${auditLog.createdAt} >= ${new Date(localDayStartMs(query.from, ctx.timezone)).toISOString()}`,
    );
  }
  if (query.to !== undefined) {
    conditions.push(
      sql`${auditLog.createdAt} < ${new Date(localDayStartMs(shiftLocalDate(query.to, 1), ctx.timezone)).toISOString()}`,
    );
  }
  if (query.cursor !== undefined)
    conditions.push(sql`${auditLog.id} < ${parseEventCursor(query.cursor)}`);

  const rows = (await ctx.db
    .select({
      id: auditLog.id,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      action: auditLog.action,
      afterJson: auditLog.afterJson,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(sql`${auditLog.createdAt} DESC, ${auditLog.id} DESC`)
    .limit(limit + 1)) as AuditRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const entities = await entityRows(ctx, page);
  const items = page.map((row): TimelineEventDto => {
    const entity = entities.get(row.entityId);
    return {
      id: auditEventId(row.id),
      kind: eventKind(row),
      occurredAt: row.createdAt,
      projectId: row.entityType === 'project' ? row.entityId : (entity?.projectId ?? null),
      entityId: row.entityId,
      title: entity?.title ?? 'Registro removido',
      detail: row.action,
      status: snapshotStatus(row.afterJson) ?? entity?.status ?? null,
    };
  });
  const last = page.at(-1);
  return {
    items,
    ...(hasMore && last !== undefined ? { nextCursor: `event:${auditEventId(last.id)}` } : {}),
    hasMore,
  };
}
