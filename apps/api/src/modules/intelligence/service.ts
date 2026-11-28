import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  batchSql,
  auditLog,
  auditStatement,
  newId,
  weeklyReviews,
  type Database,
} from '@personal-os/db';
import {
  analyzeConsistency,
  analyzeTrend,
  buildAlerts,
  buildCoverageReport,
  buildProjection,
  buildRecommendations,
  buildWeeklyReview,
  dayCount,
  daysBetweenLocal,
  INTELLIGENCE_ALGORITHMS,
  isOverdue,
  localDateFor,
  makeMetric,
  notFound,
  shiftLocalDate,
  summarizeWindow,
  validationError,
  weekStartFor,
  conflict,
  type AlertProject,
  type AlertTask,
  type ConsistencyAnalysis,
  type DatePeriod,
  type IntelligenceAlert,
  type IntelligenceArea,
  type IntelligenceMetric,
  type Projection,
  type Recommendation,
  type ReviewFacts,
  type TrendAnalysis,
  type TrendPoint,
} from '@personal-os/domain';
import {
  computedWeeklyReviewDtoSchema,
  intelligenceDashboardDtoSchema,
  weeklyReviewDtoSchema,
  weeklyReviewSnapshotDtoSchema,
  type ComputedWeeklyReviewDto,
  type CreateWeeklyReviewRequest,
  type IntelligenceDashboardData,
  type IntelligenceQuery,
  type IntelligenceTimelineEventDto,
  type IntelligenceTimelineQuery,
  type UpdateWeeklyReviewRequest,
  type WeeklyReviewDto,
  type WeeklyReflections,
} from '@personal-os/shared';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';
import { envelope, type MutatingRequest } from '../goals/service';

const READ_LIMIT = 200;
const SESSION_LIMIT = 2_000;
const TASK_JOIN_LIMIT = 2_000;
const MILESTONE_LIMIT = 500;
export const INTELLIGENCE_LIMITS = {
  read: READ_LIMIT,
  studies: SESSION_LIMIT,
  tasks: TASK_JOIN_LIMIT,
  milestones: MILESTONE_LIMIT,
} as const;
const MAX_SNAPSHOT_CHARS = 200_000;
const UNCONNECTED_AREAS = ['finance', 'health', 'training', 'reading'];

export interface IntelligenceContext {
  db: Database;
  requestId: string;
  subject: string;
  ipHash: string | null;
  now: string;
  timezone: string;
}

interface StudyRow {
  localDate: string;
  startedAt: string;
  durationMinutes: number;
  courseId: string | null;
  timezone: string;
}

interface GoalRow {
  id: string;
  title: string;
  status: string;
  priority: number;
  targetDate: string | null;
  manualProgress: number | null;
  progressMode: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  createdAt: string;
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
  goalId: string | null;
  dependencyId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface MilestoneRow {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
  projectId: string | null;
  goalId: string | null;
}

export interface Dataset {
  studies: StudyRow[];
  goals: GoalRow[];
  projects: ProjectRow[];
  tasks: TaskJoinRow[];
  milestones: MilestoneRow[];
  truncated: boolean;
}

const studyRowSchema: z.ZodType<StudyRow> = z.object({
  localDate: z.string(),
  startedAt: z.string(),
  durationMinutes: z.number(),
  courseId: z.string().nullable(),
  timezone: z.string(),
});
const goalRowSchema: z.ZodType<GoalRow> = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.number(),
  targetDate: z.string().nullable(),
  manualProgress: z.number().nullable(),
  progressMode: z.string(),
  updatedAt: z.string(),
});
const projectRowSchema: z.ZodType<ProjectRow> = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  targetDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});
const taskJoinRowSchema: z.ZodType<TaskJoinRow> = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
  projectId: z.string().nullable(),
  dueDate: z.string().nullable(),
  goalId: z.string().nullable(),
  dependencyId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});
const milestoneRowSchema: z.ZodType<MilestoneRow> = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  dueDate: z.string().nullable(),
  completedAt: z.string().nullable(),
  updatedAt: z.string(),
  projectId: z.string().nullable(),
  goalId: z.string().nullable(),
});
const datasetRowSchema = z.object({ dataset: z.string(), payload: z.string() });

function todayFor(ctx: IntelligenceContext): string {
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(nowMs)) throw validationError('Instante da requisição inválido.');
  return localDateFor(nowMs, ctx.timezone);
}

function windowFor(today: string, weeks: number): DatePeriod {
  const length = weeks * 7;
  return { from: shiftLocalDate(today, -(length - 1)), to: today };
}

const batchEntrySchema = z.object({ results: z.array(z.unknown()) });

function batchRows(results: readonly unknown[]): unknown[] {
  return batchEntrySchema.parse(results[0]).results;
}

/**
 * Uma única instrução SQL devolve os cinco conjuntos de domínio como payloads
 * JSON. O chamador pode incluí-la em um `batch()` maior (painel de estratégia)
 * sem pagar cinco idas adicionais ao D1.
 */
export function datasetStatement(window: DatePeriod): SQL {
  return sql`
    WITH study_rows AS (
      SELECT local_date, started_at, duration_minutes, course_id, timezone
      FROM study_sessions
      WHERE deleted_at IS NULL AND local_date >= ${window.from} AND local_date <= ${window.to}
      ORDER BY local_date ASC, id ASC
      LIMIT ${SESSION_LIMIT + 1}
    ),
    goal_rows AS (
      SELECT id, title, status, priority, target_date, manual_progress, progress_mode, updated_at
      FROM goals
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      LIMIT ${READ_LIMIT + 1}
    ),
    project_rows AS (
      SELECT id, title, status, target_date, created_at, updated_at, completed_at
      FROM projects
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      LIMIT ${READ_LIMIT + 1}
    ),
    task_rows AS (
      SELECT t.id, t.title, t.status, t.priority, t.project_id, t.due_date, t.goal_id,
        td.depends_on_task_id, t.created_at, t.updated_at, t.completed_at
      FROM tasks t
      LEFT JOIN task_dependencies td ON td.task_id = t.id
      WHERE t.deleted_at IS NULL
      ORDER BY t.id ASC, td.depends_on_task_id ASC
      LIMIT ${TASK_JOIN_LIMIT + 1}
    ),
    milestone_rows AS (
      SELECT id, title, status, due_date, completed_at, updated_at, project_id, NULL AS goal_id
      FROM project_milestones
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      LIMIT ${MILESTONE_LIMIT + 1}
    )
    SELECT 'studies' AS "dataset", json_group_array(json_object(
      'localDate', local_date, 'startedAt', started_at,
      'durationMinutes', duration_minutes, 'courseId', course_id, 'timezone', timezone
    )) AS "payload" FROM study_rows
    UNION ALL
    SELECT 'goals', json_group_array(json_object(
      'id', id, 'title', title, 'status', status, 'priority', priority,
      'targetDate', target_date, 'manualProgress', manual_progress,
      'progressMode', progress_mode, 'updatedAt', updated_at
    )) FROM goal_rows
    UNION ALL
    SELECT 'projects', json_group_array(json_object(
      'id', id, 'title', title, 'status', status, 'targetDate', target_date,
      'createdAt', created_at, 'updatedAt', updated_at, 'completedAt', completed_at
    )) FROM project_rows
    UNION ALL
    SELECT 'tasks', json_group_array(json_object(
      'id', id, 'title', title, 'status', status, 'priority', priority,
      'projectId', project_id, 'dueDate', due_date, 'goalId', goal_id,
      'dependencyId', depends_on_task_id, 'createdAt', created_at,
      'updatedAt', updated_at, 'completedAt', completed_at
    )) FROM task_rows
    UNION ALL
    SELECT 'milestones', json_group_array(json_object(
      'id', id, 'title', title, 'status', status, 'dueDate', due_date,
      'completedAt', completed_at, 'updatedAt', updated_at,
      'projectId', project_id, 'goalId', goal_id
    )) FROM milestone_rows
  `;
}

function payloadOf<T>(map: ReadonlyMap<string, string>, key: string, schema: z.ZodType<T>): T {
  const raw = map.get(key);
  if (raw === undefined) throw new Error(`Dataset de inteligência ausente: ${key}.`);
  const value: unknown = JSON.parse(raw);
  return schema.parse(value);
}

export function datasetFromPayloads(map: ReadonlyMap<string, string>): Dataset {
  const studies = payloadOf(map, 'studies', studyRowSchema.array());
  const goals = payloadOf(map, 'goals', goalRowSchema.array());
  const projects = payloadOf(map, 'projects', projectRowSchema.array());
  const tasks = payloadOf(map, 'tasks', taskJoinRowSchema.array());
  const milestones = payloadOf(map, 'milestones', milestoneRowSchema.array());
  return {
    studies: studies.slice(0, SESSION_LIMIT),
    goals: goals.slice(0, READ_LIMIT),
    projects: projects.slice(0, READ_LIMIT),
    tasks: tasks.slice(0, TASK_JOIN_LIMIT),
    milestones: milestones.slice(0, MILESTONE_LIMIT),
    truncated:
      studies.length > SESSION_LIMIT ||
      goals.length > READ_LIMIT ||
      projects.length > READ_LIMIT ||
      tasks.length > TASK_JOIN_LIMIT ||
      milestones.length > MILESTONE_LIMIT,
  };
}

export function datasetFromBatch(results: readonly unknown[]): Dataset {
  const rows = datasetRowSchema.array().parse(batchRows(results));
  return datasetFromPayloads(new Map(rows.map((row) => [row.dataset, row.payload])));
}

async function gather(ctx: IntelligenceContext, window: DatePeriod): Promise<Dataset> {
  return datasetFromBatch(await batchSql(ctx.db, [datasetStatement(window)]));
}

function localDay(instant: string | null, timezone: string): string | null {
  if (instant === null) return null;
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return null;
  return localDateFor(ms, timezone);
}

function uniqueTasks(rows: readonly TaskJoinRow[]): TaskJoinRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function weekKeys(window: DatePeriod): string[] {
  const first = weekStartFor(window.from);
  const last = weekStartFor(window.to);
  const count = Math.floor(dayCount(first, last) / 7) + 1;
  return Array.from({ length: count }, (_, index) => shiftLocalDate(first, index * 7));
}

/** Contagens semanais: semanas sem entidade existente viram `null`, não zero. */
function weeklyCountSeries(
  dates: readonly (string | null)[],
  presence: readonly (string | null)[],
  window: DatePeriod,
): TrendPoint[] {
  const weeks = weekKeys(window);
  const endByStart = new Map(weeks.map((start) => [start, shiftLocalDate(start, 6)]));
  return weeks.map((start) => {
    const end = endByStart.get(start) ?? start;
    const hasBasis = presence.some((date) => date !== null && date <= end);
    if (!hasBasis) return { date: start, value: null, sampleCount: 0 };
    const count = dates.filter((date) => date !== null && date >= start && date <= end).length;
    return { date: start, value: count, sampleCount: 1 };
  });
}

function studySeries(rows: readonly StudyRow[], window: DatePeriod): TrendPoint[] {
  const weeks = weekKeys(window);
  const endByStart = new Map(weeks.map((start) => [start, shiftLocalDate(start, 6)]));
  return weeks.map((start) => {
    const end = endByStart.get(start) ?? start;
    const inWeek = rows.filter((row) => row.localDate >= start && row.localDate <= end);
    if (inWeek.length === 0) return { date: start, value: null, sampleCount: 0 };
    return {
      date: start,
      value: inWeek.reduce((sum, row) => sum + row.durationMinutes, 0),
      sampleCount: inWeek.length,
    };
  });
}

function distinctDays(values: readonly (string | null)[], window: DatePeriod): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string => value !== null && value >= window.from && value <= window.to,
      ),
    ),
  ];
}

function metricFor(
  id: string,
  name: string,
  area: IntelligenceArea,
  unit: string,
  value: number | null,
  window: DatePeriod,
  referenceDate: string,
  source: string,
  coverage: number | null,
): IntelligenceMetric {
  return makeMetric({
    id,
    name,
    area,
    kind: value === null ? 'unavailable' : 'observed',
    value,
    unit,
    period: window,
    referenceDate,
    source,
    coverage,
    confidence: null,
  });
}

function consistencyFor(
  area: IntelligenceArea,
  window: DatePeriod,
  observedDates: readonly (string | null)[],
  activeDates: readonly (string | null)[],
  source: string,
): ConsistencyAnalysis {
  const observed = distinctDays(observedDates, window);
  const active = distinctDays(activeDates, window);
  return analyzeConsistency({
    area,
    period: window,
    observedDays: observed.length,
    activeDays: active.filter((date) => observed.includes(date)).length,
    totalDays: dayCount(window.from, window.to),
    source,
  });
}

function projectAlertInput(
  dataset: Dataset,
  today: string,
  timezone: string,
  blockedByProject: Map<string, number>,
): AlertProject[] {
  return dataset.projects
    .filter((project) => project.status === 'active' || project.status === 'planned')
    .map((project) => {
      const relatedTasks = dataset.tasks.filter((task) => task.projectId === project.id);
      const relatedMilestones = dataset.milestones.filter(
        (milestone) => milestone.projectId === project.id,
      );
      const timestamps = [
        project.createdAt,
        project.updatedAt,
        project.completedAt,
        ...relatedTasks.flatMap((task) => [task.createdAt, task.updatedAt, task.completedAt]),
        ...relatedMilestones.flatMap((milestone) => [milestone.updatedAt, milestone.completedAt]),
      ].filter((value): value is string => value !== null);
      const localDates = timestamps
        .map((value) => localDay(value, timezone))
        .filter((value): value is string => value !== null)
        .sort();
      const lastDate = localDates.at(-1) ?? null;
      return {
        id: project.id,
        title: project.title,
        status: project.status,
        lastActivityAt: lastDate,
        daysSinceActivity:
          lastDate === null ? null : Math.max(0, daysBetweenLocal(lastDate, today)),
        targetDate: project.targetDate,
        overdueTasks: relatedTasks.filter(
          (task) =>
            task.status !== 'completed' &&
            task.status !== 'cancelled' &&
            isOverdue(task.dueDate, today),
        ).length,
        overdueMilestones: relatedMilestones.filter(
          (milestone) =>
            milestone.status !== 'completed' &&
            milestone.status !== 'cancelled' &&
            isOverdue(milestone.dueDate, today),
        ).length,
        blockedTasks: blockedByProject.get(project.id) ?? 0,
      };
    });
}

function taskAlertInput(dataset: Dataset, today: string): AlertTask[] {
  const blockedIds = new Set(
    dataset.tasks
      .filter((row) => row.dependencyId !== null)
      .map((row) => ({ id: row.id, dependency: row.dependencyId }))
      .filter(({ dependency }) => {
        const status = dataset.tasks.find((task) => task.id === dependency)?.status;
        return status !== 'completed' && status !== 'cancelled';
      })
      .map(({ id }) => id),
  );
  return uniqueTasks(dataset.tasks).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    projectId: task.projectId,
    dueDate: task.dueDate,
    overdue:
      task.status !== 'completed' && task.status !== 'cancelled' && isOverdue(task.dueDate, today),
    blocked: task.status === 'blocked' || blockedIds.has(task.id),
  }));
}

function calculateCoverage(dataset: Dataset, window: DatePeriod, ctx: IntelligenceContext) {
  const expectedDays = dayCount(window.from, window.to);
  const source = (
    key: string,
    label: string,
    recordCount: number,
    localDates: readonly (string | null)[],
    fields: readonly string[],
    populatedFields: readonly string[],
  ) => {
    const days = distinctDays(localDates, window);
    return {
      key,
      label,
      recordCount,
      observedDays: days.length,
      expectedDays,
      firstDate: days[0] ?? null,
      lastDate: days.at(-1) ?? null,
      fields,
      populatedFields,
    };
  };
  const studyDates = dataset.studies.map((row) => row.localDate);
  const goalDates = dataset.goals.map((row) => localDay(row.updatedAt, ctx.timezone));
  const projectDates = dataset.projects.map((row) => localDay(row.updatedAt, ctx.timezone));
  const taskDates = uniqueTasks(dataset.tasks).map((row) => localDay(row.updatedAt, ctx.timezone));
  return buildCoverageReport(
    [
      source(
        'study_sessions',
        'Sessões de estudo',
        dataset.studies.length,
        studyDates,
        ['localDate', 'startedAt', 'durationMinutes', 'timezone', 'courseId'],
        [
          ...(dataset.studies.length > 0
            ? ['localDate', 'startedAt', 'durationMinutes', 'timezone']
            : []),
          ...(dataset.studies.some((row) => row.courseId !== null) ? ['courseId'] : []),
        ],
      ),
      source(
        'goals',
        'Objetivos',
        dataset.goals.length,
        goalDates,
        ['updatedAt', 'targetDate', 'manualProgress'],
        [
          ...(dataset.goals.length > 0 ? ['updatedAt'] : []),
          ...(dataset.goals.some((row) => row.targetDate !== null) ? ['targetDate'] : []),
          ...(dataset.goals.some((row) => row.manualProgress !== null) ? ['manualProgress'] : []),
        ],
      ),
      source(
        'projects',
        'Projetos',
        dataset.projects.length,
        projectDates,
        ['updatedAt', 'targetDate'],
        [
          ...(dataset.projects.length > 0 ? ['updatedAt'] : []),
          ...(dataset.projects.some((row) => row.targetDate !== null) ? ['targetDate'] : []),
        ],
      ),
      source(
        'tasks',
        'Tarefas',
        uniqueTasks(dataset.tasks).length,
        taskDates,
        ['updatedAt', 'dueDate', 'completedAt'],
        [
          ...(dataset.tasks.length > 0 ? ['updatedAt'] : []),
          ...(dataset.tasks.some((row) => row.dueDate !== null) ? ['dueDate'] : []),
          ...(dataset.tasks.some((row) => row.completedAt !== null) ? ['completedAt'] : []),
        ],
      ),
    ],
    UNCONNECTED_AREAS,
  );
}

function previousWeek(weekStart: string): DatePeriod {
  return { from: shiftLocalDate(weekStart, -7), to: shiftLocalDate(weekStart, -1) };
}

function reviewFacts(dataset: Dataset, period: DatePeriod, ctx: IntelligenceContext): ReviewFacts {
  const inPeriod = (date: string | null): boolean =>
    date !== null && date >= period.from && date <= period.to;
  const studies = dataset.studies.filter((row) => inPeriod(row.localDate));
  const studyDays = new Set(studies.map((row) => row.localDate));
  const unique = uniqueTasks(dataset.tasks);
  const completed = unique.filter((row) => inPeriod(localDay(row.completedAt, ctx.timezone)));
  const activeProjects = dataset.projects.filter(
    (project) => project.status === 'active' || project.status === 'planned',
  );
  const movedProjects = activeProjects.filter((project) => {
    const related = dataset.tasks.filter((task) => task.projectId === project.id);
    const stamps = [
      project.updatedAt,
      ...related.flatMap((task) => [task.updatedAt, task.completedAt]),
    ];
    return stamps.some((stamp) => inPeriod(localDay(stamp, ctx.timezone)));
  });
  return {
    weekStart: period.from,
    weekEnd: period.to,
    studyMinutes: studies.reduce((sum, row) => sum + row.durationMinutes, 0),
    studySessions: studies.length,
    studyObservedDays: studyDays.size,
    tasksCompleted: completed.length,
    tasksOverdue: unique.filter(
      (row) =>
        row.status !== 'completed' &&
        row.status !== 'cancelled' &&
        isOverdue(row.dueDate, period.to),
    ).length,
    activeProjects: activeProjects.length,
    movedProjects: movedProjects.length,
    goalsUpdated: dataset.goals.filter((row) => inPeriod(localDay(row.updatedAt, ctx.timezone)))
      .length,
    milestonesCompleted: dataset.milestones.filter((row) =>
      inPeriod(localDay(row.completedAt, ctx.timezone)),
    ).length,
  };
}

interface Analysis {
  metrics: IntelligenceMetric[];
  series: { id: string; label: string; unit: string; points: TrendPoint[] }[];
  trends: TrendAnalysis[];
  consistency: ConsistencyAnalysis[];
  alerts: IntelligenceAlert[];
  recommendations: Recommendation[];
  projections: Projection[];
  coverage: ReturnType<typeof calculateCoverage>;
  currentState: IntelligenceDashboardData['currentState'];
  sourcesWithData: string[];
}

function analyze(
  ctx: IntelligenceContext,
  dataset: Dataset,
  window: DatePeriod,
  today: string,
): Analysis {
  const taskRows = uniqueTasks(dataset.tasks);
  const studyPoints = studySeries(dataset.studies, window);
  const sessionPoints = weeklyCountSeries(
    dataset.studies.map((row) => row.localDate),
    dataset.studies.map((row) => row.localDate),
    window,
  );
  const completionDates = taskRows.map((row) => localDay(row.completedAt, ctx.timezone));
  const taskPresence = taskRows.map((row) => localDay(row.createdAt, ctx.timezone));
  const completionPoints = weeklyCountSeries(completionDates, taskPresence, window);
  const milestoneDates = dataset.milestones.map((row) => localDay(row.completedAt, ctx.timezone));
  const milestonePoints = weeklyCountSeries(
    milestoneDates,
    dataset.milestones.map((row) => localDay(row.updatedAt, ctx.timezone)),
    window,
  );
  const studySamples = dataset.studies.map((row) => ({
    localDate: row.localDate,
    value: row.durationMinutes,
  }));
  const studySum = summarizeWindow(studySamples, window);
  const previous = previousWeek(weekStartFor(today));
  const currentStudy = summarizeWindow(studySamples, periodForWeek(weekStartFor(today)));
  const previousStudy = summarizeWindow(studySamples, previous);
  const coverage = calculateCoverage(dataset, window, ctx);

  const trends: TrendAnalysis[] = [
    analyzeTrend({
      id: 'study_minutes',
      label: 'Minutos de estudo por semana',
      area: 'studies',
      window,
      points: studyPoints,
    }),
    analyzeTrend({
      id: 'study_sessions',
      label: 'Sessões de estudo por semana',
      area: 'studies',
      window,
      points: sessionPoints,
    }),
    analyzeTrend({
      id: 'tasks_completed',
      label: 'Tarefas concluídas por semana',
      area: 'tasks',
      window,
      points: completionPoints,
    }),
    analyzeTrend({
      id: 'milestones_completed',
      label: 'Marcos concluídos por semana',
      area: 'projects',
      window,
      points: milestonePoints,
    }),
  ];

  const studyCoverage = distinctDays(
    dataset.studies.map((row) => row.localDate),
    window,
  ).length;
  const expected = dayCount(window.from, window.to);
  const metrics: IntelligenceMetric[] = [
    metricFor(
      'study_minutes',
      'Minutos de estudo no período',
      'studies',
      'minutes',
      studySum.minutes,
      window,
      today,
      'study_sessions',
      expected === 0 ? null : studyCoverage / expected,
    ),
    metricFor(
      'study_sessions',
      'Sessões de estudo no período',
      'studies',
      'sessions',
      studySum.sessions,
      window,
      today,
      'study_sessions',
      expected === 0 ? null : studyCoverage / expected,
    ),
    metricFor(
      'active_projects',
      'Projetos ativos',
      'projects',
      'projects',
      dataset.projects.filter((project) => project.status === 'active').length,
      window,
      today,
      'projects',
      null,
    ),
    metricFor(
      'active_goals',
      'Objetivos ativos',
      'goals',
      'goals',
      dataset.goals.filter((goal) => goal.status === 'active').length,
      window,
      today,
      'goals',
      null,
    ),
    metricFor(
      'open_tasks',
      'Tarefas em aberto',
      'tasks',
      'tasks',
      taskRows.filter((task) => task.status !== 'completed' && task.status !== 'cancelled').length,
      window,
      today,
      'tasks',
      null,
    ),
    metricFor(
      'overdue_tasks',
      'Tarefas com prazo vencido',
      'tasks',
      'tasks',
      taskRows.filter(
        (task) =>
          task.status !== 'completed' &&
          task.status !== 'cancelled' &&
          isOverdue(task.dueDate, today),
      ).length,
      window,
      today,
      'tasks',
      null,
    ),
  ];

  const consistency: ConsistencyAnalysis[] = [
    consistencyFor(
      'studies',
      window,
      dataset.studies.map((row) => row.localDate),
      dataset.studies.map((row) => row.localDate),
      'study_sessions',
    ),
    consistencyFor(
      'tasks',
      window,
      taskRows.flatMap((row) => [
        localDay(row.createdAt, ctx.timezone),
        localDay(row.updatedAt, ctx.timezone),
      ]),
      completionDates,
      'tasks',
    ),
  ];

  const blockedByProject = new Map<string, number>();
  for (const task of taskAlertInput(dataset, today)) {
    if (!task.blocked || task.projectId === null) continue;
    blockedByProject.set(task.projectId, (blockedByProject.get(task.projectId) ?? 0) + 1);
  }
  const alerts = buildAlerts({
    date: today,
    nowMs: Date.parse(ctx.now),
    goals: dataset.goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      status: goal.status,
      priority: goal.priority,
      targetDate: goal.targetDate,
      lastUpdatedAt: goal.updatedAt,
      progressPercent: goal.manualProgress,
      // Apenas vínculos observáveis: tarefas que declaram `goal_id`.
      linkedActions: taskRows.filter((task) => task.goalId === goal.id).length,
    })),
    projects: projectAlertInput(dataset, today, ctx.timezone, blockedByProject),
    tasks: taskAlertInput(dataset, today),
    currentStudy,
    previousStudy,
    sourcesWithData: coverage.sources
      .filter((source) => source.recordCount > 0)
      .map((source) => source.key),
    truncated: dataset.truncated,
  });
  const recommendations = buildRecommendations(alerts);

  const projections: Projection[] = [
    buildProjection({
      id: 'study_minutes',
      label: 'Minutos de estudo por semana',
      area: 'studies',
      unit: 'minutes',
      nowMs: Date.parse(ctx.now),
      horizonDays: 7,
      points: studyPoints
        .filter((point): point is TrendPoint & { value: number } => point.value !== null)
        .map((point) => ({ date: point.date, value: point.value })),
    }),
    buildProjection({
      id: 'tasks_completed',
      label: 'Tarefas concluídas por semana',
      area: 'tasks',
      unit: 'tasks',
      nowMs: Date.parse(ctx.now),
      horizonDays: 7,
      points: completionPoints
        .filter((point): point is TrendPoint & { value: number } => point.value !== null)
        .map((point) => ({ date: point.date, value: point.value })),
    }),
  ];

  return {
    metrics,
    series: [
      {
        id: 'study_minutes',
        label: 'Minutos de estudo por semana',
        unit: 'min',
        points: studyPoints,
      },
      {
        id: 'tasks_completed',
        label: 'Tarefas concluídas por semana',
        unit: 'tarefas',
        points: completionPoints,
      },
    ],
    trends,
    consistency,
    alerts,
    recommendations,
    projections,
    coverage,
    currentState: {
      studyMinutes: currentStudy.minutes,
      studySessions: currentStudy.sessions,
      activeProjects: dataset.projects.filter((project) => project.status === 'active').length,
      activeGoals: dataset.goals.filter((goal) => goal.status === 'active').length,
      relevantTasks: taskRows.filter(
        (task) => task.status !== 'completed' && task.status !== 'cancelled',
      ).length,
    },
    sourcesWithData: coverage.sources
      .filter((source) => source.recordCount > 0)
      .map((source) => source.key),
  };
}

function periodForWeek(weekStart: string): DatePeriod {
  return { from: weekStart, to: shiftLocalDate(weekStart, 6) };
}

export function dashboardFromDataset(
  ctx: IntelligenceContext,
  query: IntelligenceQuery,
  dataset: Dataset,
): IntelligenceDashboardData {
  const today = todayFor(ctx);
  const window = windowFor(today, query.weeks);
  const analysis = analyze(ctx, dataset, window, today);
  return intelligenceDashboardDtoSchema.parse({
    date: today,
    timezone: ctx.timezone,
    generatedAt: ctx.now,
    window,
    metrics: analysis.metrics,
    series: analysis.series,
    trends: analysis.trends,
    consistency: analysis.consistency,
    alerts: analysis.alerts,
    recommendations: analysis.recommendations,
    projections: analysis.projections,
    coverage: analysis.coverage,
    currentState: analysis.currentState,
    sourcesWithData: analysis.sourcesWithData,
    truncated: dataset.truncated,
    algorithms: {
      metric: INTELLIGENCE_ALGORITHMS.metric,
      trend: INTELLIGENCE_ALGORITHMS.trend,
      consistency: INTELLIGENCE_ALGORITHMS.consistency,
      alert: INTELLIGENCE_ALGORITHMS.alert,
      recommendation: INTELLIGENCE_ALGORITHMS.recommendation,
      projection: INTELLIGENCE_ALGORITHMS.projection,
      coverage: INTELLIGENCE_ALGORITHMS.coverage,
    },
  });
}

export async function getDashboard(
  ctx: IntelligenceContext,
  query: IntelligenceQuery,
): Promise<IntelligenceDashboardData> {
  const today = todayFor(ctx);
  const dataset = await gather(ctx, windowFor(today, query.weeks));
  return dashboardFromDataset(ctx, query, dataset);
}

interface ReviewRow {
  id: string;
  weekStart: string;
  weekEnd: string;
  timezone: string;
  snapshotJson: string;
  worked: string | null;
  didntWork: string | null;
  learned: string | null;
  change: string | null;
  focus: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function reflectionsFrom(row: ReviewRow): WeeklyReflections {
  return {
    ...(row.worked === null ? {} : { worked: row.worked }),
    ...(row.didntWork === null ? {} : { didntWork: row.didntWork }),
    ...(row.learned === null ? {} : { learned: row.learned }),
    ...(row.change === null ? {} : { change: row.change }),
    ...(row.focus === null ? {} : { focus: row.focus }),
  };
}

function reviewToDto(row: ReviewRow): WeeklyReviewDto {
  const parsed = weeklyReviewSnapshotDtoSchema.safeParse(JSON.parse(row.snapshotJson));
  if (!parsed.success) throw new Error('Snapshot de revisão inválido no banco.');
  return {
    id: row.id,
    version: row.version,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    timezone: row.timezone,
    status: row.version > 1 ? 'updated' : 'saved',
    snapshot: parsed.data,
    reflections: reflectionsFrom(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findReviewByWeek(
  ctx: IntelligenceContext,
  weekStart: string,
): Promise<ReviewRow | undefined> {
  const rows = await ctx.db
    .select({
      id: weeklyReviews.id,
      weekStart: weeklyReviews.weekStart,
      weekEnd: weeklyReviews.weekEnd,
      timezone: weeklyReviews.timezone,
      snapshotJson: weeklyReviews.snapshotJson,
      worked: weeklyReviews.worked,
      didntWork: weeklyReviews.didntWork,
      learned: weeklyReviews.learned,
      change: weeklyReviews.change,
      focus: weeklyReviews.focus,
      version: weeklyReviews.version,
      createdAt: weeklyReviews.createdAt,
      updatedAt: weeklyReviews.updatedAt,
    })
    .from(weeklyReviews)
    .where(eq(weeklyReviews.weekStart, weekStart))
    .limit(1);
  return rows[0] as ReviewRow | undefined;
}

async function findReviewById(
  ctx: IntelligenceContext,
  id: string,
): Promise<ReviewRow | undefined> {
  const rows = await ctx.db
    .select({
      id: weeklyReviews.id,
      weekStart: weeklyReviews.weekStart,
      weekEnd: weeklyReviews.weekEnd,
      timezone: weeklyReviews.timezone,
      snapshotJson: weeklyReviews.snapshotJson,
      worked: weeklyReviews.worked,
      didntWork: weeklyReviews.didntWork,
      learned: weeklyReviews.learned,
      change: weeklyReviews.change,
      focus: weeklyReviews.focus,
      version: weeklyReviews.version,
      createdAt: weeklyReviews.createdAt,
      updatedAt: weeklyReviews.updatedAt,
    })
    .from(weeklyReviews)
    .where(eq(weeklyReviews.id, id))
    .limit(1);
  return rows[0] as ReviewRow | undefined;
}

const REVIEW_COLUMNS = {
  id: weeklyReviews.id,
  weekStart: weeklyReviews.weekStart,
  weekEnd: weeklyReviews.weekEnd,
  timezone: weeklyReviews.timezone,
  snapshotJson: weeklyReviews.snapshotJson,
  worked: weeklyReviews.worked,
  didntWork: weeklyReviews.didntWork,
  learned: weeklyReviews.learned,
  change: weeklyReviews.change,
  focus: weeklyReviews.focus,
  version: weeklyReviews.version,
  createdAt: weeklyReviews.createdAt,
  updatedAt: weeklyReviews.updatedAt,
};

async function findReviewPage(
  ctx: IntelligenceContext,
  limit: number,
  cursor: string | undefined,
): Promise<{ rows: ReviewRow[]; nextCursor?: string; hasMore: boolean }> {
  if (cursor !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
    throw validationError('Cursor inválido.');
  }
  const rows = (await ctx.db
    .select(REVIEW_COLUMNS)
    .from(weeklyReviews)
    .where(cursor === undefined ? undefined : sql`${weeklyReviews.weekStart} < ${cursor}`)
    .orderBy(sql`${weeklyReviews.weekStart} DESC`)
    .limit(limit + 1)) as ReviewRow[];
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return {
    rows: page,
    ...(hasMore && page.length > 0 ? { nextCursor: page[page.length - 1]?.weekStart } : {}),
    hasMore,
  };
}

async function computeReview(
  ctx: IntelligenceContext,
  weekStart: string,
): Promise<ComputedWeeklyReviewDto> {
  const window = windowFor(shiftLocalDate(weekStart, 6), 4);
  const dataset = await gather(ctx, window);
  const analysis = analyze(ctx, dataset, window, shiftLocalDate(weekStart, 6));
  const current = reviewFacts(dataset, periodForWeek(weekStart), ctx);
  const previous = reviewFacts(dataset, previousWeek(weekStart), ctx);
  const snapshot = buildWeeklyReview({
    weekStart,
    timezone: ctx.timezone,
    generatedAt: ctx.now,
    current,
    previous,
    metrics: analysis.metrics,
    trends: analysis.trends,
    alerts: analysis.alerts,
    recommendations: analysis.recommendations,
    coverage: analysis.coverage,
  });
  const saved = await findReviewByWeek(ctx, weekStart);
  return computedWeeklyReviewDtoSchema.parse({
    status: 'computed',
    weekStart,
    weekEnd: current.weekEnd,
    timezone: ctx.timezone,
    snapshot,
    saved: saved === undefined ? null : reviewToDto(saved),
  });
}

export async function getWeeklyReview(
  ctx: IntelligenceContext,
  weekStart?: string,
): Promise<ComputedWeeklyReviewDto> {
  const requested = weekStart ?? weekStartFor(todayFor(ctx));
  return computeReview(ctx, requested);
}

export async function getSavedReview(
  ctx: IntelligenceContext,
  id: string,
): Promise<WeeklyReviewDto> {
  const row = await findReviewById(ctx, id);
  if (row === undefined) throw notFound('Revisão semanal não encontrada.');
  return reviewToDto(row);
}

export async function listSavedReviews(
  ctx: IntelligenceContext,
  limit: number,
  cursor?: string,
): Promise<{ items: WeeklyReviewDto[]; nextCursor?: string; hasMore: boolean }> {
  const page = await findReviewPage(ctx, limit, cursor);
  return { items: page.rows.map(reviewToDto), nextCursor: page.nextCursor, hasMore: page.hasMore };
}

function reflectionValues(input: WeeklyReflections): Record<string, string | null> {
  return {
    worked: input.worked ?? null,
    didntWork: input.didntWork ?? null,
    learned: input.learned ?? null,
    change: input.change ?? null,
    focus: input.focus ?? null,
  };
}

function mutationContext(ctx: IntelligenceContext, request: MutatingRequest) {
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

function reviewAuditSnapshot(row: Pick<ReviewRow, 'weekStart' | 'weekEnd' | 'version'>) {
  return {
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    version: row.version,
    // Reflexões são pessoais: ficam de fora do snapshot de auditoria.
  };
}

export async function saveWeeklyReview(
  ctx: IntelligenceContext,
  request: MutatingRequest,
  input: CreateWeeklyReviewRequest,
): Promise<IdempotentResult> {
  const weekStart = weekStartFor(input.weekStart);
  const computation = await computeReview(ctx, weekStart);
  const snapshotJson = JSON.stringify(computation.snapshot);
  if (snapshotJson.length > MAX_SNAPSHOT_CHARS) {
    throw validationError('Snapshot da revisão excede o limite permitido.');
  }
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        if ((await findReviewByWeek(ctx, weekStart)) !== undefined) {
          throw conflict('Já existe revisão salva para esta semana.');
        }
      },
    },
    ({ opId, now }) => {
      const id = newId();
      const values = reflectionValues(input.reflections ?? {});
      const row: ReviewRow = {
        id,
        weekStart,
        weekEnd: computation.snapshot.weekEnd,
        timezone: input.timezone,
        snapshotJson,
        worked: values.worked ?? null,
        didntWork: values.didntWork ?? null,
        learned: values.learned ?? null,
        change: values.change ?? null,
        focus: values.focus ?? null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      return {
        status: 201 as const,
        bodyJson: envelope(ctx.requestId, weeklyReviewDtoSchema.parse(reviewToDto(row))),
        statements: [
          sql`INSERT INTO weekly_reviews
            (id, week_start, week_end, timezone, snapshot_json, worked, didnt_work, learned, change, focus, source_id, version, created_operation_id, created_at, updated_at)
            VALUES (${id}, ${row.weekStart}, ${row.weekEnd}, ${row.timezone}, ${snapshotJson},
              ${row.worked}, ${row.didntWork}, ${row.learned}, ${row.change}, ${row.focus},
              'src_manual', 1, ${opId}, ${now}, ${now})`,
          auditStatement({
            entityType: 'weekly_review',
            entityId: id,
            action: 'create',
            actorType: 'user',
            actorId: ctx.subject,
            afterJson: JSON.stringify(reviewAuditSnapshot(row)),
            requestId: ctx.requestId,
            ipHash: ctx.ipHash,
          }),
        ],
      };
    },
  );
}

export async function updateWeeklyReview(
  ctx: IntelligenceContext,
  request: MutatingRequest,
  id: string,
  input: UpdateWeeklyReviewRequest,
  expectedVersion: number | undefined,
): Promise<IdempotentResult> {
  const current = await findReviewById(ctx, id);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: async () => {
        const row = await findReviewById(ctx, id);
        if (row === undefined) throw notFound('Revisão semanal não encontrada.');
        if (expectedVersion !== undefined && row.version !== expectedVersion) {
          throw conflict('A revisão foi alterada desde a última leitura.');
        }
      },
    },
    ({ opId, now }) => {
      if (current === undefined) throw notFound('Revisão semanal não encontrada.');
      const values = reflectionValues(input.reflections);
      const after: ReviewRow = {
        ...current,
        ...values,
        version: current.version + 1,
        updatedAt: now,
      };
      const statements: SQL[] = [
        sql`UPDATE weekly_reviews SET
          worked = ${after.worked}, didnt_work = ${after.didntWork}, learned = ${after.learned},
          change = ${after.change}, focus = ${after.focus}, version = ${after.version},
          updated_operation_id = ${opId}, updated_at = ${now}
          WHERE id = ${id} AND version = ${current.version}`,
        auditStatement(
          {
            entityType: 'weekly_review',
            entityId: id,
            action: 'update',
            actorType: 'user',
            actorId: ctx.subject,
            beforeJson: JSON.stringify(reviewAuditSnapshot(current)),
            afterJson: JSON.stringify(reviewAuditSnapshot(after)),
            requestId: ctx.requestId,
            ipHash: ctx.ipHash,
          },
          true,
        ),
      ];
      return {
        status: 200 as const,
        bodyJson: envelope(ctx.requestId, weeklyReviewDtoSchema.parse(reviewToDto(after))),
        statements,
      };
    },
  );
}

interface AuditRow {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  afterJson: string | null;
  createdAt: string;
}

const AUDIT_ENTITY_TYPES = [
  'study_session',
  'task',
  'project_milestone',
  'goal_milestone',
  'project',
  'goal',
  'weekly_review',
];

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

function localDayStartMs(localDate: string, timezone: string): number {
  const noon = Date.parse(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(noon)) throw validationError('Data local inválida.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(noon));
  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((item) => item.type === type)?.value;
    return value === undefined ? 0 : Number(value);
  };
  const elapsed =
    (part('hour') % 24) * 3_600_000 + part('minute') * 60_000 + part('second') * 1_000;
  return noon - elapsed;
}

function eventMapping(entityType: string): {
  kind: IntelligenceTimelineEventDto['kind'];
  area: IntelligenceTimelineEventDto['area'];
  table: string;
} | null {
  switch (entityType) {
    case 'study_session':
      return { kind: 'study', area: 'studies', table: 'study' };
    case 'task':
      return { kind: 'task', area: 'tasks', table: 'tasks' };
    case 'project_milestone':
      return { kind: 'milestone', area: 'projects', table: 'milestones' };
    case 'goal_milestone':
      return { kind: 'milestone', area: 'goals', table: 'goalMilestones' };
    case 'project':
      return { kind: 'project', area: 'projects', table: 'projects' };
    case 'goal':
      return { kind: 'goal', area: 'goals', table: 'goals' };
    case 'weekly_review':
      return { kind: 'review', area: 'reviews', table: 'reviews' };
    default:
      return null;
  }
}

function auditTitle(json: string | null): string | null {
  if (json === null) return null;
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== 'object' || value === null) return null;
    const title = (value as Record<string, unknown>).title;
    return typeof title === 'string' ? title : null;
  } catch {
    return null;
  }
}

function auditStatus(json: string | null): string | null {
  if (json === null) return null;
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== 'object' || value === null) return null;
    const status = (value as Record<string, unknown>).status;
    return typeof status === 'string' ? status : null;
  } catch {
    return null;
  }
}

export async function getIntelligenceTimeline(
  ctx: IntelligenceContext,
  query: IntelligenceTimelineQuery,
): Promise<{ items: IntelligenceTimelineEventDto[]; nextCursor?: string; hasMore: boolean }> {
  const limit = Math.min(query.limit, READ_LIMIT);
  if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
    throw validationError('Intervalo inválido.');
  }
  const types = AUDIT_ENTITY_TYPES.filter((type) => {
    const mapping = eventMapping(type);
    if (mapping === null) return false;
    if (query.area !== undefined && mapping.area !== query.area) return false;
    if (query.kind !== undefined && mapping.kind !== query.kind) return false;
    return true;
  });
  if (types.length === 0) return { items: [], hasMore: false };

  const conditions: SQL[] = [
    sql`${auditLog.entityType} IN (${sql.join(
      types.map((type) => sql`${type}`),
      sql`, `,
    )})`,
    sql`${auditLog.action} IN ('create', 'update')`,
  ];
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
  const reviewIds = page
    .filter((row) => row.entityType === 'weekly_review')
    .map((row) => row.entityId);
  const reviews =
    reviewIds.length === 0
      ? []
      : ((await ctx.db
          .select({ id: weeklyReviews.id, weekStart: weeklyReviews.weekStart })
          .from(weeklyReviews)
          .where(inArray(weeklyReviews.id, reviewIds))
          .limit(reviewIds.length)) as { id: string; weekStart: string }[]);
  const reviewMap = new Map(reviews.map((review) => [review.id, review.weekStart]));

  const items = page.map((row): IntelligenceTimelineEventDto => {
    const mapping = eventMapping(row.entityType);
    if (mapping === null) throw validationError('Tipo de evento não suportado.');
    const title =
      row.entityType === 'weekly_review'
        ? `Revisão da semana de ${reviewMap.get(row.entityId) ?? 'registro removido'}`
        : (auditTitle(row.afterJson) ?? 'Registro sem título no eventos');
    return {
      id: auditEventId(row.id),
      kind: mapping.kind,
      area: mapping.area,
      occurredAt: row.createdAt,
      entityId: row.entityId,
      title,
      detail: row.action,
      status: auditStatus(row.afterJson),
      href:
        row.entityType === 'study_session'
          ? '/estudos'
          : mapping.area === 'tasks'
            ? `/tarefas/${row.entityId}`
            : mapping.area === 'projects'
              ? `/projetos/${row.entityId}`
              : mapping.area === 'goals'
                ? `/objetivos/${row.entityId}`
                : mapping.area === 'reviews'
                  ? '/revisao'
                  : null,
    };
  });
  const last = page.at(-1);
  return {
    items,
    ...(hasMore && last !== undefined ? { nextCursor: `event:${auditEventId(last.id)}` } : {}),
    hasMore,
  };
}
