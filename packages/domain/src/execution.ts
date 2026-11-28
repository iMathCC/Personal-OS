import { businessRule, validationError } from './errors';
import { dayCount, localDateFor } from './studies';

/** Regras versionadas da camada de execução. Nenhuma delas toma decisão pelo usuário. */
export const TASK_PROGRESS_ALGORITHM = 'task-progress-v1';
export const MILESTONE_PROGRESS_ALGORITHM = 'milestone-progress-v1';
export const PROJECT_PROGRESS_ALGORITHM = 'project-progress-v1';
export const PROJECT_ACTIVITY_ALGORITHM = 'project-activity-v1';
export const TASK_BLOCKING_ALGORITHM = 'task-blocking-v1';
export const NEXT_ACTION_ALGORITHM = 'next-action-v1';
export const EXECUTION_RISK_ALGORITHM = 'execution-risk-v1';
export const PROJECT_STALL_DAYS = 14;
export const PROJECT_RECENT_DAYS = 7;
export const DUE_SOON_DAYS = 3;
export const MAX_RISKS = 50;

export type ProjectStatus =
  'planned' | 'active' | 'paused' | 'completed' | 'cancelled' | 'archived';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ProgressBasis = 'tasks' | 'status' | 'none';
export type ActivityState = 'active' | 'stalled' | 'paused' | 'unknown' | 'completed';
export type DependencyState = 'none' | 'ready' | 'blocked';

export interface Progress {
  readonly percent: number | null;
  readonly basis: ProgressBasis;
  readonly algorithmVersion: string;
  readonly completedTasks: number;
  readonly eligibleTasks: number;
  readonly totalTasks: number;
}

export interface TaskLike {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly priority: Priority;
  readonly projectId: string | null;
  readonly dueDate: string | null;
  readonly createdAt: string;
  readonly dependencyIds?: readonly string[];
}

export interface MilestoneLike {
  readonly id: string;
  readonly title: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  readonly dueDate: string | null;
}

export interface ProjectLike {
  readonly id: string;
  readonly title: string;
  readonly status: ProjectStatus;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface Activity {
  readonly state: ActivityState;
  readonly lastActivityAt: string | null;
  readonly daysSinceActivity: number | null;
  readonly windowDays: number;
  readonly algorithmVersion: string;
}

export interface TaskExecution {
  readonly dependencyState: DependencyState;
  readonly blockerIds: readonly string[];
  readonly executable: boolean;
  readonly overdue: boolean;
  readonly reason: string;
}

export interface NextActionInput {
  readonly task: TaskLike;
  readonly project: ProjectLike | null;
  readonly dependencyState: DependencyState;
  readonly overdue: boolean;
}

export interface NextAction {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly taskStatus: TaskStatus;
  readonly projectId: string | null;
  readonly projectTitle: string | null;
  readonly dueDate: string | null;
  readonly priority: Priority;
  readonly score: number;
  readonly reasonCodes: readonly (
    | 'OVERDUE'
    | 'DUE_TODAY'
    | 'DUE_SOON'
    | 'HIGH_PRIORITY'
    | 'UNBLOCKED'
    | 'STALLED_PROJECT'
    | 'NO_DEADLINE'
  )[];
  readonly explanation: string;
  readonly algorithmVersion: string;
}

export interface Risk {
  readonly kind:
    'OVERDUE_TASK' | 'BLOCKED_TASK' | 'STALLED_PROJECT' | 'OVERDUE_MILESTONE' | 'OVERDUE_PROJECT';
  readonly entityId: string;
  readonly title: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly dueDate: string | null;
  readonly reasons: readonly string[];
  readonly algorithmVersion: string;
}

export interface ExecutionDashboardInput {
  readonly date: string;
  readonly projects: readonly ProjectLike[];
  readonly tasks: readonly TaskLike[];
  readonly milestones: readonly MilestoneLike[];
  readonly dependencyIdsByTask: Readonly<Record<string, readonly string[]>>;
  readonly statusByTaskId: Readonly<Record<string, TaskStatus>>;
  readonly activityByProjectId?: Readonly<Record<string, Activity>>;
  readonly completedAtByTaskId?: Readonly<Record<string, string | null>>;
  /** Fuso do usuário; converte instantes UTC em `local_date` antes de comparar datas. */
  readonly timezone?: string;
  readonly truncated?: boolean;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { low: 5, medium: 10, high: 20, critical: 30 };
const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function percent(completed: number, eligible: number): number {
  return Math.round((completed / eligible) * 100);
}

function finishedProgress(total: number, algorithmVersion: string): Progress {
  return {
    percent: 100,
    basis: 'status',
    algorithmVersion,
    completedTasks: 0,
    eligibleTasks: 0,
    totalTasks: total,
  };
}

function unknownProgress(total: number, algorithmVersion: string): Progress {
  return {
    percent: null,
    basis: 'none',
    algorithmVersion,
    completedTasks: 0,
    eligibleTasks: 0,
    totalTasks: total,
  };
}

/** Canceladas não entram no denominador; concluídas explícitas valem 100%. */
export function calculateTaskProgress(
  tasks: readonly Pick<TaskLike, 'status'>[],
  status?: ProjectStatus,
): Progress {
  const total = tasks.length;
  if (status === 'completed') return finishedProgress(total, TASK_PROGRESS_ALGORITHM);
  const eligible = tasks.filter((task) => task.status !== 'cancelled');
  if (eligible.length === 0) return unknownProgress(total, TASK_PROGRESS_ALGORITHM);
  const completed = eligible.filter((task) => task.status === 'completed').length;
  return {
    percent: percent(completed, eligible.length),
    basis: 'tasks',
    algorithmVersion: TASK_PROGRESS_ALGORITHM,
    completedTasks: completed,
    eligibleTasks: eligible.length,
    totalTasks: total,
  };
}

export function calculateMilestoneProgress(
  milestones: readonly Pick<MilestoneLike, 'status'>[],
  status?: ProjectStatus,
): Progress {
  const total = milestones.length;
  if (status === 'completed') return finishedProgress(total, MILESTONE_PROGRESS_ALGORITHM);
  const eligible = milestones.filter((milestone) => milestone.status !== 'cancelled');
  if (eligible.length === 0) return unknownProgress(total, MILESTONE_PROGRESS_ALGORITHM);
  const completed = eligible.filter((milestone) => milestone.status === 'completed').length;
  return {
    percent: percent(completed, eligible.length),
    basis: 'tasks',
    algorithmVersion: MILESTONE_PROGRESS_ALGORITHM,
    completedTasks: completed,
    eligibleTasks: eligible.length,
    totalTasks: total,
  };
}

/**
 * Usa uma única base (tarefas, marcos ou status) para não contar o mesmo trabalho duas vezes.
 * Sem trabalho elegível o progresso é desconhecido, nunca zero.
 */
export function calculateProjectProgress(
  status: ProjectStatus,
  tasks: readonly Pick<TaskLike, 'status'>[],
  milestones: readonly Pick<MilestoneLike, 'status'>[],
): Progress {
  const taskProgress = calculateTaskProgress(tasks, status);
  if (taskProgress.basis !== 'none')
    return { ...taskProgress, algorithmVersion: PROJECT_PROGRESS_ALGORITHM };
  const milestoneProgress = calculateMilestoneProgress(milestones, status);
  if (milestoneProgress.basis !== 'none') {
    return { ...milestoneProgress, algorithmVersion: PROJECT_PROGRESS_ALGORITHM };
  }
  const base = status === 'completed' ? 100 : null;
  return {
    percent: base,
    basis: base === null ? 'none' : 'status',
    algorithmVersion: PROJECT_PROGRESS_ALGORITHM,
    completedTasks: 0,
    eligibleTasks: 0,
    totalTasks: tasks.length + milestones.length,
  };
}

export function isOverdue(dueDate: string | null, today: string): boolean {
  return dueDate !== null && dueDate < today;
}

export function daysUntil(dueDate: string | null, today: string): number | null {
  return dueDate === null ? null : dayCount(today, dueDate);
}

function localDateFromInstant(instant: string, timezone: string): string | null {
  const instantMs = Date.parse(instant);
  return Number.isFinite(instantMs) ? localDateFor(instantMs, timezone) : null;
}

export function calculateProjectActivity(
  project: Pick<ProjectLike, 'status' | 'updatedAt' | 'completedAt'>,
  timestamps: readonly (string | null | undefined)[],
  today: string,
  timezone = 'UTC',
): Activity {
  const all = [project.updatedAt, project.completedAt, ...timestamps]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((instant) => ({ instant, localDate: localDateFromInstant(instant, timezone) }));
  let lastActivity: { instant: string; localDate: string | null } | null = null;
  for (const value of all) {
    if (lastActivity === null || value.instant > lastActivity.instant) lastActivity = value;
  }
  const days =
    lastActivity?.localDate === null || lastActivity?.localDate === undefined
      ? null
      : Math.max(0, dayCount(lastActivity.localDate, today));
  let state: ActivityState;
  if (project.status === 'paused') state = 'paused';
  else if (
    project.status === 'completed' ||
    project.status === 'cancelled' ||
    project.status === 'archived'
  ) {
    state = 'completed';
  } else if (days === null) state = 'unknown';
  else if (days > PROJECT_STALL_DAYS) state = 'stalled';
  else state = 'active';
  return {
    state,
    lastActivityAt: lastActivity?.instant ?? null,
    daysSinceActivity: days,
    windowDays: PROJECT_STALL_DAYS,
    algorithmVersion: PROJECT_ACTIVITY_ALGORITHM,
  };
}

/** Aceita arestas [(tarefa, dependência)]; valida referências, self-loop e ciclos. */
export function assertDependencyGraph(
  edges: readonly (readonly [string, string])[],
  knownTaskIds: readonly string[],
): void {
  const known = new Set(knownTaskIds);
  const adjacency = new Map<string, string[]>();
  for (const [taskId, dependencyId] of edges) {
    if (taskId === dependencyId) throw businessRule('Uma tarefa não pode depender de si mesma.');
    if (!known.has(taskId) || !known.has(dependencyId)) {
      throw validationError('Dependência referencia uma tarefa inexistente.');
    }
    const list = adjacency.get(taskId) ?? [];
    list.push(dependencyId);
    adjacency.set(taskId, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw businessRule('Dependências formam um ciclo.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of known) visit(id);
}

/** Verifica a mudança proposta sem precisar gravar primeiro. */
export function assertDependencyChange(
  taskId: string,
  dependencyIds: readonly string[],
  currentEdges: readonly (readonly [string, string])[],
  knownTaskIds: readonly string[],
): void {
  if (dependencyIds.includes(taskId))
    throw businessRule('Uma tarefa não pode depender de si mesma.');
  for (const dependencyId of dependencyIds) {
    if (!knownTaskIds.includes(dependencyId))
      throw validationError('Dependência referencia uma tarefa inexistente.');
  }
  const next = currentEdges.filter(([from]) => from !== taskId).map((edge) => edge);
  for (const dependencyId of dependencyIds) next.push([taskId, dependencyId]);
  assertDependencyGraph(next, knownTaskIds);
}

export function deriveTaskExecution(
  status: TaskStatus,
  dependencyIds: readonly string[],
  statusByTaskId: Readonly<Record<string, TaskStatus>>,
  today: string,
  dueDate: string | null = null,
): TaskExecution {
  const overdue = isOverdue(dueDate, today);
  if (status === 'completed') {
    return {
      dependencyState: 'none',
      blockerIds: [],
      executable: false,
      overdue,
      reason: 'Tarefa concluída.',
    };
  }
  if (status === 'cancelled') {
    return {
      dependencyState: 'none',
      blockerIds: [],
      executable: false,
      overdue,
      reason: 'Tarefa cancelada.',
    };
  }
  if (status === 'blocked') {
    return {
      dependencyState: 'none',
      blockerIds: [],
      executable: false,
      overdue,
      reason: 'Tarefa bloqueada manualmente.',
    };
  }
  // Status ausente é tratado como pendente: se a leitura foi truncada, uma
  // dependência fora da janela nunca deve liberar a tarefa por engano.
  const blockerIds = dependencyIds.filter((id) => {
    const dependencyStatus = statusByTaskId[id];
    return dependencyStatus !== 'completed' && dependencyStatus !== 'cancelled';
  });
  if (blockerIds.length > 0) {
    return {
      dependencyState: 'blocked',
      blockerIds,
      executable: false,
      overdue,
      reason: `Aguarda ${blockerIds.length} dependência${blockerIds.length === 1 ? '' : 's'}.`,
    };
  }
  return {
    dependencyState: dependencyIds.length > 0 ? 'ready' : 'none',
    blockerIds: [],
    executable: true,
    overdue,
    reason:
      dependencyIds.length > 0
        ? 'Dependências concluídas ou canceladas.'
        : 'Sem dependências pendentes.',
  };
}

export function chooseNextAction(
  inputs: readonly NextActionInput[],
  today: string,
  activityByProjectId: Readonly<Record<string, Activity>> = {},
): NextAction | null {
  const ranked = inputs
    .filter((input) => input.task.status === 'todo' || input.task.status === 'in_progress')
    .filter((input) => input.dependencyState !== 'blocked')
    .map((input) => {
      const days = daysUntil(input.task.dueDate, today);
      const reasonCodes: Array<NextAction['reasonCodes'][number]> = [];
      let score = PRIORITY_WEIGHT[input.task.priority];
      if (input.overdue) {
        score += 60;
        reasonCodes.push('OVERDUE');
      } else if (days === 0) {
        score += 40;
        reasonCodes.push('DUE_TODAY');
      } else if (days !== null && days <= DUE_SOON_DAYS) {
        score += 20;
        reasonCodes.push('DUE_SOON');
      }
      if (input.task.priority === 'high' || input.task.priority === 'critical')
        reasonCodes.push('HIGH_PRIORITY');
      if (input.dependencyState === 'ready') {
        score += 5;
        reasonCodes.push('UNBLOCKED');
      }
      if (input.project !== null && activityByProjectId[input.project.id]?.state === 'stalled') {
        score += 15;
        reasonCodes.push('STALLED_PROJECT');
      }
      if (days === null) {
        score -= 5;
        reasonCodes.push('NO_DEADLINE');
      }
      const label =
        reasonCodes[0] === 'OVERDUE'
          ? 'atrasada'
          : reasonCodes[0] === 'DUE_TODAY'
            ? 'vence hoje'
            : 'disponível';
      return {
        taskId: input.task.id,
        taskTitle: input.task.title,
        taskStatus: input.task.status,
        projectId: input.project?.id ?? null,
        projectTitle: input.project?.title ?? null,
        dueDate: input.task.dueDate,
        priority: input.task.priority,
        score: Math.max(0, score),
        reasonCodes,
        explanation: `Próxima ação: tarefa ${label}, prioridade ${input.task.priority}${
          input.dependencyState === 'ready' ? ' e dependências liberadas' : ''
        }.`,
        algorithmVersion: NEXT_ACTION_ALGORITHM,
      } satisfies NextAction;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const dueA = a.dueDate ?? '9999-12-31';
      const dueB = b.dueDate ?? '9999-12-31';
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      if (PRIORITY_RANK[b.priority] !== PRIORITY_RANK[a.priority]) {
        return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      }
      return a.taskId.localeCompare(b.taskId);
    });
  return ranked[0] ?? null;
}

function severityFor(daysOverdue: number, priority: Priority): Risk['severity'] {
  if (daysOverdue > 14 || priority === 'critical') return 'high';
  if (daysOverdue > 3 || priority === 'high') return 'medium';
  return 'low';
}

export function buildExecutionRisks(input: ExecutionDashboardInput): Risk[] {
  const risks: Risk[] = [];
  const activityByProjectId = input.activityByProjectId ?? {};
  for (const task of input.tasks) {
    if (task.status === 'completed' || task.status === 'cancelled') continue;
    const execution = deriveTaskExecution(
      task.status,
      input.dependencyIdsByTask[task.id] ?? [],
      input.statusByTaskId,
      input.date,
      task.dueDate,
    );
    if (execution.overdue && task.dueDate !== null) {
      risks.push({
        kind: 'OVERDUE_TASK',
        entityId: task.id,
        title: task.title,
        severity: severityFor(Math.abs(dayCount(task.dueDate, input.date)), task.priority),
        dueDate: task.dueDate,
        reasons: [`Vencida em ${task.dueDate}.`],
        algorithmVersion: EXECUTION_RISK_ALGORITHM,
      });
    }
    if (execution.dependencyState === 'blocked' || task.status === 'blocked') {
      risks.push({
        kind: 'BLOCKED_TASK',
        entityId: task.id,
        title: task.title,
        severity: task.priority === 'critical' ? 'high' : 'medium',
        dueDate: task.dueDate,
        reasons: [execution.reason],
        algorithmVersion: EXECUTION_RISK_ALGORITHM,
      });
    }
  }
  for (const milestone of input.milestones) {
    if (milestone.status === 'completed' || milestone.status === 'cancelled') continue;
    if (milestone.dueDate !== null && milestone.dueDate < input.date) {
      risks.push({
        kind: 'OVERDUE_MILESTONE',
        entityId: milestone.id,
        title: milestone.title,
        severity: 'medium',
        dueDate: milestone.dueDate,
        reasons: [`Marco vencido em ${milestone.dueDate}.`],
        algorithmVersion: EXECUTION_RISK_ALGORITHM,
      });
    }
  }
  for (const project of input.projects) {
    if (project.status !== 'active' && project.status !== 'planned') continue;
    if (activityByProjectId[project.id]?.state === 'stalled') {
      risks.push({
        kind: 'STALLED_PROJECT',
        entityId: project.id,
        title: project.title,
        severity: 'medium',
        dueDate: null,
        reasons: [
          `Sem atividade há ${activityByProjectId[project.id]?.daysSinceActivity ?? 0} dias.`,
        ],
        algorithmVersion: EXECUTION_RISK_ALGORITHM,
      });
    }
  }
  return risks.slice(0, MAX_RISKS);
}

export function buildExecutionDashboard(input: ExecutionDashboardInput): {
  signals: {
    activeProjects: number;
    stalledProjects: number;
    overdueTasks: number;
    blockedTasks: number;
    executableTasks: number;
    completedTasksToday: number;
    dueToday: number;
    overdueMilestones: number;
    projectsWithoutTasks: number;
  };
  nextAction: NextAction | null;
  risks: Risk[];
  projects: readonly {
    id: string;
    title: string;
    status: ProjectStatus;
    progress: { percent: number | null; basis: ProgressBasis };
    activityState: ActivityState;
    daysSinceActivity: number | null;
  }[];
  truncated: boolean;
} {
  const activityByProjectId = input.activityByProjectId ?? {};
  const completedAtByTaskId = input.completedAtByTaskId ?? {};
  const executions = new Map(
    input.tasks.map((task) => [
      task.id,
      deriveTaskExecution(
        task.status,
        input.dependencyIdsByTask[task.id] ?? [],
        input.statusByTaskId,
        input.date,
        task.dueDate,
      ),
    ]),
  );
  const openTasks = input.tasks.filter(
    (task) => task.status !== 'completed' && task.status !== 'cancelled',
  );
  const risks = buildExecutionRisks(input);
  const candidates = input.tasks
    .filter((task) => executions.get(task.id)?.executable === true)
    .map((task) => ({
      task,
      project: input.projects.find((project) => project.id === task.projectId) ?? null,
      dependencyState: executions.get(task.id)?.dependencyState ?? 'none',
      overdue: executions.get(task.id)?.overdue ?? false,
    }));
  const projectIdsWithTasks = new Set(
    input.tasks.map((task) => task.projectId).filter((id): id is string => id !== null),
  );
  return {
    signals: {
      activeProjects: input.projects.filter((project) => project.status === 'active').length,
      stalledProjects: input.projects.filter(
        (project) => activityByProjectId[project.id]?.state === 'stalled',
      ).length,
      overdueTasks: openTasks.filter((task) => executions.get(task.id)?.overdue === true).length,
      blockedTasks: openTasks.filter(
        (task) =>
          executions.get(task.id)?.dependencyState === 'blocked' || task.status === 'blocked',
      ).length,
      executableTasks: candidates.length,
      completedTasksToday: input.tasks.filter((task) => {
        const completedAt = completedAtByTaskId[task.id];
        return (
          task.status === 'completed' &&
          completedAt !== null &&
          completedAt !== undefined &&
          localDateFromInstant(completedAt, input.timezone ?? 'UTC') === input.date
        );
      }).length,
      dueToday: openTasks.filter((task) => task.dueDate === input.date).length,
      overdueMilestones: input.milestones.filter(
        (milestone) =>
          milestone.status !== 'completed' &&
          milestone.status !== 'cancelled' &&
          isOverdue(milestone.dueDate, input.date),
      ).length,
      projectsWithoutTasks: input.projects.filter(
        (project) => project.status !== 'archived' && !projectIdsWithTasks.has(project.id),
      ).length,
    },
    nextAction: chooseNextAction(candidates, input.date, activityByProjectId),
    risks,
    projects: input.projects.map((project) => {
      const progress = calculateProjectProgress(
        project.status,
        input.tasks.filter((task) => task.projectId === project.id),
        [],
      );
      return {
        id: project.id,
        title: project.title,
        status: project.status,
        progress: { percent: progress.percent, basis: progress.basis },
        activityState: activityByProjectId[project.id]?.state ?? 'unknown',
        daysSinceActivity: activityByProjectId[project.id]?.daysSinceActivity ?? null,
      };
    }),
    truncated:
      input.truncated === true ||
      input.tasks.length >= 200 ||
      input.projects.length >= 200 ||
      risks.length >= MAX_RISKS,
  };
}
