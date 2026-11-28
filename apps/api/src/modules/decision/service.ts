import { sql } from 'drizzle-orm';
import { auditStatement, newId, type Database } from '@personal-os/db';
import {
  CROSS_DOMAIN_CATALOG,
  DECISION_ALGORITHMS,
  DECISION_PRIORITY_FORMULA,
  DECISION_PRIORITY_WEIGHTS,
  INTELLIGENCE_ALGORITHMS,
  PERFORMANCE_ALGORITHMS,
  PERFORMANCE_DOMAINS,
  PERFORMANCE_MAX_SERIES_POINTS,
  PERFORMANCE_PATTERN_MIN_POINTS,
  PLANNING_EXECUTION_ALGORITHM_VERSION,
  assessDataSufficiency,
  analyzeCrossDomain,
  buildDecisionRecommendations,
  buildDomainEvolution,
  buildExecutionLongitudinal,
  buildGoalProjectEvolution,
  buildNextBestAction,
  buildPerformancePeriods,
  buildPerformanceProjection,
  buildPerformanceReview,
  buildPerformanceSnapshot,
  buildPlanningExecution,
  chooseNextAction,
  comparePeriodMetric,
  conflict,
  decisionPeriods,
  deriveTaskExecution,
  detectDecisionAlerts,
  detectRecurringPatterns,
  expectedPeriodEnd,
  expectedPreviousPeriodEnd,
  isOverdue,
  localDateFor,
  notFound,
  stableHash,
  toPerformanceAssociations,
  validationError,
  type DecisionAlert,
  type DecisionComparison,
  type DecisionDatePeriod,
  type DecisionFacts,
  type DecisionGoal,
  type DecisionPeriods,
  type DecisionProject,
  type ProjectStatus,
  type TaskStatus,
  type DecisionSeriesPoint,
  type DecisionSufficiency,
  type DecisionTask,
  type PerformanceDomainId,
  type PerformanceSeriesPoint,
  type PerformanceTrackedEntity,
  type StoredAlertState,
} from '@personal-os/domain';
import {
  decisionAlertDtoSchema,
  decisionAlertStateResultDtoSchema,
  decisionCatalogItemDtoSchema,
  decisionCrossDomainDtoSchema,
  decisionDashboardDtoSchema,
  decisionNextActionDtoSchema,
  decisionRecommendationDtoSchema,
  decisionReviewDtoSchema,
  decisionReviewKindSchema,
  performanceDashboardDtoSchema,
  performanceSnapshotDtoSchema,
  type DecisionAlertDto,
  type DecisionAlertsQuery,
  type DecisionDashboardDto,
  type DecisionListQuery,
  type DecisionPeriodQuery,
  type DecisionReviewQuery,
  type PerformanceQuery,
} from '@personal-os/shared';
import { envelope, type MutatingRequest } from '../goals/service';
import { executeIdempotent, type IdempotentResult } from '../operations/idempotency';

/** Contexto isolado por requisição; nenhum dado de outro usuário é acessado. */
export interface DecisionContext {
  readonly db: Database;
  readonly requestId: string;
  readonly subject: string;
  readonly ipHash: string | null;
  readonly now: string;
  readonly timezone: string;
}

interface FactsRow {
  goalsActive: number;
  goalsCompleted: number;
  strategicGoals: number;
  projectsActive: number;
  projectsCompleted: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksBlocked: number;
  tasksCompleted: number;
  cycleObjectives: number;
  weeklyReviewCount: number;
  quarterlyReviewCount: number;
  importBatches: number;
  financeExpenseCents: number;
  financeExpenses: number;
  healthObservations: number;
  trainingObservations: number;
  readingObservations: number;
  timeObservations: number;
  timeMinutes: number;
  studySessions: number;
  studyMinutes: number;
  capacityWeeklyMinutes: number | null;
  capacityContingencyPercent: number | null;
  activeCycleId: string | null;
  activeCycleName: string | null;
  linkedReadingMaterials: number;
}

interface SeriesRow {
  date_value: string;
  source_name: string;
  project_ref: string | null;
  area_ref: string | null;
  metric_value: number | null;
}

interface GoalRow {
  id: string;
  area: string;
  status: string;
  priority: number;
  target_date: string | null;
  manual_progress: number | null;
  updated_at: string | null;
  strategic_importance: number | null;
}

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  target_date: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

interface TaskRow {
  id: string;
  status: string;
  priority: DecisionTask['priority'];
  project_id: string | null;
  goal_id: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
  updated_at: string | null;
  completed_at: string | null;
  dependency_ids: string | null;
}

interface AlertStateRow {
  alert_id: string;
  state: 'acknowledged' | 'dismissed';
  version: number;
  rule_version: string;
}

export interface DecisionComputation {
  periods: DecisionPeriods;
  today: string;
  facts: DecisionFacts;
  sufficiency: Readonly<Record<string, DecisionSufficiency>>;
  series: Readonly<Record<string, readonly DecisionSeriesPoint[]>>;
  previousSeries: Readonly<Record<string, readonly DecisionSeriesPoint[]>>;
  alerts: readonly DecisionAlert[];
  recommendations: ReturnType<typeof buildDecisionRecommendations>;
  nextAction: ReturnType<typeof buildNextBestAction>;
  comparisons: readonly DecisionComparison[];
  crossDomain: ReturnType<typeof analyzeCrossDomain>;
  states: Readonly<Record<string, StoredAlertState>>;
  goals: readonly DecisionGoal[];
  projects: readonly DecisionProject[];
  tasks: readonly DecisionTask[];
}

function count(value: unknown): number {
  return Number(value ?? 0);
}

function nullableCount(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function text(value: unknown): string {
  return String(value ?? '');
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function taskStatus(value: string): TaskStatus {
  return value === 'todo' ||
    value === 'in_progress' ||
    value === 'blocked' ||
    value === 'completed' ||
    value === 'cancelled'
    ? value
    : 'todo';
}

function projectStatus(value: string): ProjectStatus {
  return value === 'planned' ||
    value === 'active' ||
    value === 'paused' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'archived'
    ? value
    : 'planned';
}

function taskPriority(value: string): DecisionTask['priority'] {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
    ? value
    : 'medium';
}

function defaultComparison(
  kind?: 'weekly' | 'monthly' | 'quarterly',
): 'week' | 'month' | 'quarter' {
  if (kind === 'monthly') return 'month';
  if (kind === 'quarterly') return 'quarter';
  return 'week';
}

function periodsFor(
  ctx: DecisionContext,
  query: DecisionPeriodQuery | DecisionReviewQuery,
  kind?: 'weekly' | 'monthly' | 'quarterly',
): DecisionPeriods {
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(nowMs)) throw validationError('Instante da requisição inválido.');
  const today = localDateFor(nowMs, ctx.timezone);
  const explicit =
    query.from === undefined || query.to === undefined
      ? undefined
      : { from: query.from, to: query.to };
  return decisionPeriods(today, query.comparison ?? defaultComparison(kind), explicit);
}

async function gatherFacts(
  ctx: DecisionContext,
  periods: DecisionPeriods,
  today: string,
): Promise<DecisionFacts> {
  const from = periods.current.from;
  const to = periods.current.to;
  const rows = (await ctx.db.all(sql`
    SELECT
      (SELECT count(*) FROM goals WHERE deleted_at IS NULL AND status IN ('active','paused')) AS goalsActive,
      (SELECT count(*) FROM goals WHERE deleted_at IS NULL AND status = 'achieved') AS goalsCompleted,
      (SELECT count(*) FROM strategic_goals sg JOIN goals g ON g.id = sg.goal_id
        WHERE g.deleted_at IS NULL AND g.status IN ('active','paused')) AS strategicGoals,
      (SELECT count(*) FROM projects WHERE deleted_at IS NULL AND status = 'active') AS projectsActive,
      (SELECT count(*) FROM projects WHERE deleted_at IS NULL AND status = 'completed') AS projectsCompleted,
      (SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND status IN ('todo','in_progress','blocked')) AS tasksOpen,
      (SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND status IN ('todo','in_progress','blocked')
        AND due_date IS NOT NULL AND due_date < ${today}) AS tasksOverdue,
      (SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND status = 'blocked') AS tasksBlocked,
      (SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND status = 'completed'
        AND date(completed_at) BETWEEN ${from} AND ${to}) AS tasksCompleted,
      (SELECT count(*) FROM planning_cycle_objectives pco JOIN planning_cycles pc ON pc.id = pco.cycle_id
        WHERE pc.status = 'active') AS cycleObjectives,
      (SELECT count(*) FROM weekly_reviews WHERE week_start = ${from}) AS weeklyReviewCount,
      (SELECT count(*) FROM planning_cycle_reviews WHERE date(created_at) BETWEEN ${from} AND ${to}) AS quarterlyReviewCount,
      (SELECT count(*) FROM life_import_batches WHERE date(created_at) BETWEEN ${from} AND ${to}) AS importBatches,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM finance_transactions
        WHERE status = 'active' AND kind = 'expense' AND transfer_pair_id IS NULL
        AND date BETWEEN ${from} AND ${to}) AS financeExpenseCents,
      (SELECT count(*) FROM finance_transactions
        WHERE status = 'active' AND kind = 'expense' AND transfer_pair_id IS NULL
        AND date BETWEEN ${from} AND ${to}) AS financeExpenses,
      (SELECT count(*) FROM health_observations WHERE status = 'active' AND date BETWEEN ${from} AND ${to}) AS healthObservations,
      (SELECT count(*) FROM training_sessions WHERE status = 'active' AND date BETWEEN ${from} AND ${to}) AS trainingObservations,
      (SELECT count(*) FROM reading_sessions WHERE status = 'active' AND date BETWEEN ${from} AND ${to}) AS readingObservations,
      (SELECT count(*) FROM time_entries WHERE status = 'active' AND date BETWEEN ${from} AND ${to}) AS timeObservations,
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM time_entries
        WHERE status = 'active' AND date BETWEEN ${from} AND ${to}) AS timeMinutes,
      (SELECT count(*) FROM study_sessions WHERE deleted_at IS NULL AND local_date BETWEEN ${from} AND ${to}) AS studySessions,
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM study_sessions
        WHERE deleted_at IS NULL AND local_date BETWEEN ${from} AND ${to}) AS studyMinutes,
      (SELECT weekly_minutes FROM capacity_profiles WHERE is_active = 1 LIMIT 1) AS capacityWeeklyMinutes,
      (SELECT contingency_percent FROM capacity_profiles WHERE is_active = 1 LIMIT 1) AS capacityContingencyPercent,
      (SELECT id FROM planning_cycles WHERE status = 'active' LIMIT 1) AS activeCycleId,
      (SELECT name FROM planning_cycles WHERE status = 'active' LIMIT 1) AS activeCycleName,
      (SELECT count(*) FROM reading_materials WHERE status = 'active' AND goal_id IS NOT NULL) AS linkedReadingMaterials
  `)) as FactsRow[];
  const row = rows[0];
  if (row === undefined) throw validationError('Não foi possível consolidar os fatos do período.');
  return {
    goalsActive: count(row.goalsActive),
    goalsCompleted: count(row.goalsCompleted),
    strategicGoals: count(row.strategicGoals),
    projectsActive: count(row.projectsActive),
    projectsCompleted: count(row.projectsCompleted),
    tasksOpen: count(row.tasksOpen),
    tasksOverdue: count(row.tasksOverdue),
    tasksBlocked: count(row.tasksBlocked),
    tasksCompleted: count(row.tasksCompleted),
    cycleObjectives: count(row.cycleObjectives),
    weeklyReviewCount: count(row.weeklyReviewCount),
    quarterlyReviewCount: count(row.quarterlyReviewCount),
    importBatches: count(row.importBatches),
    financeExpenseCents: count(row.financeExpenseCents),
    financeExpenses: count(row.financeExpenses),
    healthObservations: count(row.healthObservations),
    trainingObservations: count(row.trainingObservations),
    readingObservations: count(row.readingObservations),
    timeObservations: count(row.timeObservations),
    timeMinutes: count(row.timeMinutes),
    studySessions: count(row.studySessions),
    studyMinutes: count(row.studyMinutes),
    capacityWeeklyMinutes: nullableCount(row.capacityWeeklyMinutes),
    capacityContingencyPercent: nullableCount(row.capacityContingencyPercent),
    activeCycleId: nullableText(row.activeCycleId),
    activeCycleName: nullableText(row.activeCycleName),
    linkedReadingMaterials: count(row.linkedReadingMaterials),
  };
}

async function gatherSeries(
  ctx: DecisionContext,
  periods: DecisionPeriods,
): Promise<readonly SeriesRow[]> {
  const start =
    periods.previous.from < periods.current.from ? periods.previous.from : periods.current.from;
  const end = periods.previous.to > periods.current.to ? periods.previous.to : periods.current.to;
  // O D1 limita SELECTs compostos a cinco termos. Três blocos aninhados mantêm
  // uma única consulta (e um único span) sem perder nenhuma série.
  return (await ctx.db.all(sql`
    SELECT date_value, source_name, project_ref, area_ref, metric_value FROM (
      SELECT * FROM (
        SELECT local_date AS date_value, 'study' AS source_name, NULL AS project_ref, NULL AS area_ref,
          SUM(duration_minutes) AS metric_value
        FROM study_sessions
        WHERE deleted_at IS NULL AND local_date BETWEEN ${start} AND ${end}
        GROUP BY local_date
        UNION ALL
        SELECT date AS date_value, 'time' AS source_name, project_id AS project_ref, area_id AS area_ref,
          SUM(duration_minutes) AS metric_value
        FROM time_entries
        WHERE status = 'active' AND date BETWEEN ${start} AND ${end}
        GROUP BY date, project_id, area_id
        UNION ALL
        SELECT date AS date_value, 'finance_expense' AS source_name, NULL AS project_ref, NULL AS area_ref,
          SUM(amount_cents) AS metric_value
        FROM finance_transactions
        WHERE status = 'active' AND kind = 'expense' AND transfer_pair_id IS NULL
          AND date BETWEEN ${start} AND ${end}
        GROUP BY date
        UNION ALL
        SELECT date AS date_value, 'health' AS source_name, NULL AS project_ref, NULL AS area_ref,
          COUNT(*) AS metric_value
        FROM health_observations
        WHERE status = 'active' AND date BETWEEN ${start} AND ${end}
        GROUP BY date
        UNION ALL
        SELECT date AS date_value, 'training' AS source_name, NULL AS project_ref, NULL AS area_ref,
          SUM(duration_minutes) AS metric_value
        FROM training_sessions
        WHERE status = 'active' AND date BETWEEN ${start} AND ${end}
        GROUP BY date
      )
      UNION ALL
      SELECT * FROM (
        SELECT date AS date_value, 'reading' AS source_name, NULL AS project_ref, NULL AS area_ref,
          SUM(COALESCE(minutes, 0)) AS metric_value
        FROM reading_sessions
        WHERE status = 'active' AND date BETWEEN ${start} AND ${end}
        GROUP BY date
        UNION ALL
        SELECT rs.date AS date_value, 'reading_goal' AS source_name, NULL AS project_ref, NULL AS area_ref,
          SUM(COALESCE(rs.minutes, 0)) AS metric_value
        FROM reading_sessions rs JOIN reading_materials rm ON rm.id = rs.material_id
        WHERE rs.status = 'active' AND rm.status = 'active' AND rm.goal_id IS NOT NULL
          AND rs.date BETWEEN ${start} AND ${end}
        GROUP BY rs.date
        UNION ALL
        SELECT mo.local_date AS date_value, 'academic_progress' AS source_name, NULL AS project_ref,
          NULL AS area_ref, SUM(COALESCE(mo.value_num, 0)) AS metric_value
        FROM metric_observations mo JOIN courses c ON c.id = mo.course_id
        WHERE mo.superseded_by IS NULL
          AND mo.local_date BETWEEN ${start} AND ${end}
        GROUP BY mo.local_date
        UNION ALL
        SELECT date(completed_at) AS date_value, 'milestone_completed' AS source_name, NULL AS project_ref,
          NULL AS area_ref, COUNT(*) AS metric_value
        FROM project_milestones
        WHERE completed_at IS NOT NULL AND date(completed_at) BETWEEN ${start} AND ${end}
        GROUP BY date(completed_at)
        UNION ALL
        SELECT date(completed_at) AS date_value, 'task_completed' AS source_name, NULL AS project_ref,
          NULL AS area_ref, COUNT(*) AS metric_value
        FROM tasks
        WHERE status = 'completed' AND deleted_at IS NULL
          AND date(completed_at) BETWEEN ${start} AND ${end}
        GROUP BY date(completed_at)
      )
      UNION ALL
      SELECT * FROM (
        SELECT due_date AS date_value, 'task_due' AS source_name, NULL AS project_ref, NULL AS area_ref,
          COUNT(*) AS metric_value
        FROM tasks
        WHERE status IN ('todo','in_progress','blocked') AND deleted_at IS NULL
          AND due_date BETWEEN ${start} AND ${end}
        GROUP BY due_date
      )
    ) ORDER BY date_value
  `)) as SeriesRow[];
}

async function gatherGoals(ctx: DecisionContext): Promise<readonly GoalRow[]> {
  return (await ctx.db.all(sql`
    SELECT g.id,
      (SELECT a.key FROM areas a WHERE a.id = g.area_id) AS area,
      g.status, g.priority, g.target_date, g.manual_progress,
      COALESCE(g.updated_at, g.created_at) AS updated_at,
      (SELECT sg.importance FROM strategic_goals sg WHERE sg.goal_id = g.id LIMIT 1) AS strategic_importance
    FROM goals g
    WHERE g.deleted_at IS NULL AND g.status IN ('draft','active','paused','achieved')
    ORDER BY COALESCE(g.updated_at, g.created_at) DESC
    LIMIT 200
  `)) as GoalRow[];
}

async function gatherProjects(ctx: DecisionContext): Promise<readonly ProjectRow[]> {
  return (await ctx.db.all(sql`
    SELECT id, title, status, priority, target_date, completed_at,
      COALESCE(updated_at, created_at) AS updated_at
    FROM projects
    WHERE deleted_at IS NULL
    ORDER BY COALESCE(updated_at, created_at) DESC
    LIMIT 200
  `)) as ProjectRow[];
}

async function gatherTasks(ctx: DecisionContext): Promise<readonly TaskRow[]> {
  return (await ctx.db.all(sql`
    SELECT t.id, t.status, t.priority, t.project_id, t.goal_id, t.due_date,
      t.estimate_minutes, COALESCE(t.updated_at, t.created_at) AS updated_at, t.completed_at,
      (SELECT group_concat(d.depends_on_task_id, ',') FROM task_dependencies d
        WHERE d.task_id = t.id) AS dependency_ids
    FROM tasks t
    WHERE t.deleted_at IS NULL
    ORDER BY COALESCE(t.updated_at, t.created_at) DESC
    LIMIT 200
  `)) as TaskRow[];
}

async function gatherStates(
  ctx: DecisionContext,
): Promise<Readonly<Record<string, StoredAlertState>>> {
  const rows = (await ctx.db.all(sql`
    SELECT alert_id, state, version, rule_version
    FROM intelligence_alert_states
    ORDER BY alert_id
    LIMIT 200
  `)) as AlertStateRow[];
  const result: Record<string, StoredAlertState> = {};
  for (const row of rows) {
    result[row.alert_id] = { state: row.state, version: count(row.version) };
  }
  return result;
}

function seriesFor(
  rows: readonly SeriesRow[],
  source: string,
  period: DecisionDatePeriod,
): DecisionSeriesPoint[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (row.source_name !== source) continue;
    if (row.date_value < period.from || row.date_value > period.to) continue;
    byDate.set(row.date_value, (byDate.get(row.date_value) ?? 0) + count(row.metric_value));
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

function buildSufficiency(
  periods: DecisionPeriods,
  facts: DecisionFacts,
  series: Readonly<Record<string, readonly DecisionSeriesPoint[]>>,
): Record<string, DecisionSufficiency> {
  const definitions: readonly {
    key: string;
    observations: number;
    sourceKey: string;
    sources: readonly string[];
    missing: readonly string[];
  }[] = [
    {
      key: 'finance',
      observations: facts.financeExpenses,
      sourceKey: 'finance_expense',
      sources: ['finance_transactions'],
      missing: ['transações financeiras'],
    },
    {
      key: 'studies',
      observations: facts.studySessions,
      sourceKey: 'study',
      sources: ['study_sessions', 'metric_observations'],
      missing: ['sessões de estudo'],
    },
    {
      key: 'health',
      observations: facts.healthObservations,
      sourceKey: 'health',
      sources: ['health_observations'],
      missing: ['observações de saúde'],
    },
    {
      key: 'training',
      observations: facts.trainingObservations,
      sourceKey: 'training',
      sources: ['training_sessions'],
      missing: ['sessões de treinamento'],
    },
    {
      key: 'reading',
      observations: facts.readingObservations,
      sourceKey: 'reading',
      sources: ['reading_sessions'],
      missing: ['sessões de leitura'],
    },
    {
      key: 'time',
      observations: facts.timeObservations,
      sourceKey: 'time',
      sources: ['time_entries'],
      missing: ['registros de tempo'],
    },
    {
      key: 'projects',
      observations: facts.tasksCompleted,
      sourceKey: 'task_completed',
      sources: ['tasks', 'projects'],
      missing: ['tarefas concluídas'],
    },
    {
      key: 'planning',
      observations: facts.cycleObjectives,
      sourceKey: 'time',
      sources: ['planning_cycle_objectives', 'time_entries'],
      missing: ['objetivos do ciclo', 'tempo registrado'],
    },
  ];
  const result: Record<string, DecisionSufficiency> = {};
  for (const definition of definitions) {
    result[definition.key] = assessDataSufficiency({
      observations: definition.observations,
      observedDays: series[definition.sourceKey]?.length ?? 0,
      expectedDays: periods.currentDays,
      requiredObservations: 3,
      sources: definition.sources,
      missing: definition.observations === 0 ? definition.missing : [],
    });
  }
  return result;
}

function buildDataset(
  periods: DecisionPeriods,
  rows: readonly SeriesRow[],
  facts: DecisionFacts,
): {
  series: Record<string, DecisionSeriesPoint[]>;
  previousSeries: Record<string, DecisionSeriesPoint[]>;
  timeMinutesByProject: Record<string, number>;
} {
  const sources = new Set(rows.map((row) => row.source_name));
  const series: Record<string, DecisionSeriesPoint[]> = {};
  const previousSeries: Record<string, DecisionSeriesPoint[]> = {};
  for (const source of sources) {
    series[source] = seriesFor(rows, source, periods.current);
    previousSeries[source] = seriesFor(rows, source, periods.previous);
  }
  const timeMinutesByProject: Record<string, number> = {};
  for (const row of rows) {
    if (row.source_name !== 'time' || row.project_ref === null) continue;
    if (row.date_value < periods.current.from || row.date_value > periods.current.to) continue;
    timeMinutesByProject[row.project_ref] =
      (timeMinutesByProject[row.project_ref] ?? 0) + count(row.metric_value);
  }
  void facts;
  return { series, previousSeries, timeMinutesByProject };
}

function buildComparisons(
  periods: DecisionPeriods,
  series: Readonly<Record<string, readonly DecisionSeriesPoint[]>>,
  previousSeries: Readonly<Record<string, readonly DecisionSeriesPoint[]>>,
): DecisionComparison[] {
  const metrics: readonly [string, string][] = [
    ['studyMinutes', 'study'],
    ['timeMinutes', 'time'],
    ['financeExpenseCents', 'finance_expense'],
    ['trainingMinutes', 'training'],
    ['readingMinutes', 'reading'],
    ['completedTasks', 'task_completed'],
    ['healthObservations', 'health'],
  ];
  return metrics.map(([metric, source]) =>
    comparePeriodMetric({
      metric,
      current: series[source] ?? [],
      previous: previousSeries[source] ?? [],
      coverage:
        series[source]?.length === undefined
          ? null
          : Math.min(1, series[source].length / Math.max(1, periods.currentDays)),
    }),
  );
}

function buildCrossDomain(
  periods: DecisionPeriods,
  dataset: ReturnType<typeof buildDataset>,
  facts: DecisionFacts,
): ReturnType<typeof analyzeCrossDomain> {
  const current = periods.current;
  const capacityDaily = (facts.capacityWeeklyMinutes ?? 0) / 7;
  const capacitySeries: DecisionSeriesPoint[] = (dataset.series.time ?? []).map((point) => ({
    date: point.date,
    value: facts.capacityWeeklyMinutes === null ? null : capacityDaily,
  }));
  const candidates = CROSS_DOMAIN_CATALOG.map((catalog) => {
    const mapping: Record<string, [string, string, boolean, string]> = {
      study_time_vs_academic_progress: [
        'study',
        'academic_progress',
        true,
        'Séries de estudo e progresso acadêmico pareadas por data.',
      ],
      execution_time_vs_project_progress: [
        'time',
        'milestone_completed',
        false,
        'Minutos registrados e marcos concluídos têm unidades diferentes: apenas comparação descritiva.',
      ],
      time_distribution_vs_strategic_goals: [
        'time',
        'task_due',
        false,
        'Tempo registrado e prazos de tarefas são comparados descritivamente; unidades não permitem correlação.',
      ],
      finance_vs_commitments: [
        'finance_expense',
        'task_due',
        false,
        'Despesas e compromissos são comparados por data, sem inferência causal.',
      ],
      training_consistency: [
        'training',
        'training',
        false,
        'Consistência avaliada pela presença de dias com treinamento na janela.',
      ],
      reading_vs_knowledge_goals: [
        'reading',
        'reading_goal',
        false,
        'Leitura total e leitura vinculada a objetivos são descritas por data.',
      ],
      capacity_vs_logged_time: [
        'time',
        'capacity',
        false,
        'Capacidade diária é derivada da configuração semanal ÷ 7; não é observação de execução.',
      ],
    };
    const [sourceA, sourceB, compatible, descriptive] = mapping[catalog.id] ?? ['', '', false, ''];
    const seriesB = sourceB === 'capacity' ? capacitySeries : (dataset.series[sourceB] ?? []);
    return {
      id: catalog.id,
      seriesA: dataset.series[sourceA] ?? [],
      seriesB,
      sources: [...catalog.sources],
      missing:
        sourceB === 'capacity' && facts.capacityWeeklyMinutes === null
          ? ['capacidade configurada']
          : [],
      compatible,
      descriptive,
    };
  });
  void current;
  return analyzeCrossDomain({ period: periods.current, candidates });
}

export async function compute(
  ctx: DecisionContext,
  query: DecisionPeriodQuery,
): Promise<DecisionComputation> {
  const periods = periodsFor(ctx, query);
  const nowMs = Date.parse(ctx.now);
  const today = localDateFor(nowMs, ctx.timezone);
  const [facts, rows, goalRows, projectRows, taskRows, states] = await Promise.all([
    gatherFacts(ctx, periods, today),
    gatherSeries(ctx, periods),
    gatherGoals(ctx),
    gatherProjects(ctx),
    gatherTasks(ctx),
    gatherStates(ctx),
  ]);
  const dataset = buildDataset(periods, rows, facts);
  const sufficiency = buildSufficiency(periods, facts, dataset.series);
  const goals: DecisionGoal[] = goalRows.map((row) => ({
    id: text(row.id),
    area: text(row.area),
    status: text(row.status),
    priority: count(row.priority),
    targetDate: nullableText(row.target_date),
    manualProgress: nullableCount(row.manual_progress),
    updatedAt: text(row.updated_at),
    declaredPriority: nullableCount(row.strategic_importance),
  }));
  const projects: DecisionProject[] = projectRows.map((row) => ({
    id: text(row.id),
    title: text(row.title),
    status: text(row.status),
    priority: text(row.priority),
    targetDate: nullableText(row.target_date),
    completedAt: nullableText(row.completed_at),
    updatedAt: text(row.updated_at),
  }));
  const tasks: DecisionTask[] = taskRows.map((row) => ({
    id: text(row.id),
    status: text(row.status),
    priority: taskPriority(text(row.priority)),
    projectId: nullableText(row.project_id),
    goalId: nullableText(row.goal_id),
    dueDate: nullableText(row.due_date),
    estimateMinutes: nullableCount(row.estimate_minutes),
    updatedAt: text(row.updated_at),
    completedAt: nullableText(row.completed_at),
    dependencyIds: text(row.dependency_ids)
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  }));
  const statusByTaskId: Record<string, TaskStatus> = {};
  for (const task of tasks) statusByTaskId[task.id] = taskStatus(task.status);
  const blockedTaskIds = tasks
    .filter((task) => {
      const execution = deriveTaskExecution(
        taskStatus(task.status),
        task.dependencyIds,
        statusByTaskId,
        today,
        task.dueDate,
      );
      return !execution.executable;
    })
    .map((task) => task.id);
  const nextInputs = tasks
    .filter((task) => task.status === 'todo' || task.status === 'in_progress')
    .filter((task) => !blockedTaskIds.includes(task.id))
    .map((task) => {
      const linkedProject = projects.find((project) => project.id === task.projectId);
      return {
        task: {
          id: task.id,
          title: `Tarefa ${task.id}`,
          status: task.status === 'in_progress' ? ('in_progress' as const) : ('todo' as const),
          priority: task.priority,
          projectId: task.projectId,
          dueDate: task.dueDate,
          createdAt: task.updatedAt,
          dependencyIds: task.dependencyIds,
        },
        project:
          linkedProject === undefined
            ? null
            : {
                id: linkedProject.id,
                title: linkedProject.title ?? linkedProject.id,
                status: projectStatus(linkedProject.status),
                updatedAt: linkedProject.updatedAt,
                completedAt: linkedProject.completedAt,
              },
        dependencyState: 'none' as const,
        overdue: isOverdue(task.dueDate, today),
      };
    });
  const next = chooseNextAction(nextInputs, today);
  const comparisons = buildComparisons(periods, dataset.series, dataset.previousSeries);
  const studyComparison = comparisons.find((item) => item.metric === 'studyMinutes');
  const studyTrend = {
    status: studyComparison?.status === 'ok' ? ('ok' as const) : ('insufficient_data' as const),
    direction:
      studyComparison?.changePercent === null || studyComparison?.changePercent === undefined
        ? ('unknown' as const)
        : studyComparison.changePercent > 5
          ? ('up' as const)
          : studyComparison.changePercent < -5
            ? ('down' as const)
            : ('stable' as const),
    changePercent: studyComparison?.changePercent ?? null,
    observedPoints: dataset.series.study?.length ?? 0,
  };
  const crossDomain = buildCrossDomain(periods, dataset, facts);
  const alerts = detectDecisionAlerts({
    period: periods.current,
    periods,
    now: ctx.now,
    today,
    goals,
    projects,
    tasks,
    milestones: [],
    facts,
    sufficiency,
    crossDomain,
    states,
    studyTrend,
    timeMinutesByProject: dataset.timeMinutesByProject,
    financeLimitCents: query.financeLimitCents ?? null,
  });
  const recommendations = buildDecisionRecommendations({ alerts, period: periods.current });
  const goalIdByTask: Record<string, string | null> = {};
  const estimateByTask: Record<string, number | null> = {};
  for (const task of tasks) {
    goalIdByTask[task.id] = task.goalId;
    estimateByTask[task.id] = task.estimateMinutes;
  }
  const nextAction = buildNextBestAction({
    period: periods.current,
    next,
    blockedTaskIds,
    goalIdByTask,
    estimateByTask,
    sufficiency,
    alerts,
    recommendations,
    activeCycleId: facts.activeCycleId,
  });
  return {
    periods,
    today,
    facts,
    sufficiency,
    series: dataset.series,
    previousSeries: dataset.previousSeries,
    alerts,
    recommendations,
    nextAction,
    comparisons,
    crossDomain,
    states,
    goals,
    projects,
    tasks,
  };
}

const AREA_INDICATORS: readonly {
  key: string;
  label: string;
  sources: readonly string[];
  href: string;
}[] = [
  { key: 'finance', label: 'Finanças', sources: ['finance_transactions'], href: '/financas' },
  {
    key: 'studies',
    label: 'Estudos',
    sources: ['study_sessions', 'metric_observations'],
    href: '/estudos',
  },
  {
    key: 'career',
    label: 'Carreira',
    sources: ['goals', 'planning_cycle_objectives'],
    href: '/objetivos',
  },
  { key: 'health', label: 'Saúde e bem-estar', sources: ['health_observations'], href: '/saude' },
  { key: 'training', label: 'Treinamento', sources: ['training_sessions'], href: '/treinamento' },
  {
    key: 'reading',
    label: 'Leitura e conhecimento',
    sources: ['reading_sessions'],
    href: '/leitura',
  },
  { key: 'projects', label: 'Projetos', sources: ['projects', 'tasks'], href: '/projetos' },
  { key: 'time', label: 'Tempo e execução', sources: ['time_entries'], href: '/tempo' },
];

function buildAreas(computation: DecisionComputation): DecisionDashboardDto['areas'] {
  return AREA_INDICATORS.map((definition) => {
    const sufficiency =
      definition.key === 'career'
        ? assessDataSufficiency({
            observations: computation.goals.filter((goal) => goal.area === 'career').length,
            observedDays: new Set(
              computation.goals
                .filter((goal) => goal.area === 'career')
                .map((goal) => goal.updatedAt.slice(0, 10)),
            ).size,
            expectedDays: computation.periods.currentDays,
            requiredObservations: 1,
            sources: definition.sources,
            missing: ['objetivos de carreira'],
          })
        : computation.sufficiency[definition.key];
    const status =
      sufficiency?.status === 'sufficient' || sufficiency?.status === 'partial'
        ? 'available'
        : 'insufficient_data';
    return {
      area: definition.key,
      label: definition.label,
      status,
      observations: sufficiency?.observations ?? 0,
      coverage: sufficiency?.coverage ?? null,
      confidence: sufficiency?.confidence ?? 0,
      summary:
        status === 'insufficient_data'
          ? 'Sem evidência suficiente no período: área não avaliável.'
          : `${sufficiency?.observations ?? 0} observação(ões) com cobertura ${
              sufficiency?.coverage === null || sufficiency?.coverage === undefined
                ? 'desconhecida'
                : sufficiency.coverage
            }.`,
      sources: [...definition.sources],
      missing: [...(sufficiency?.missing ?? [])],
      href: definition.href,
    };
  });
}

const PERFORMANCE_SOURCE_BY_DOMAIN: Record<
  PerformanceDomainId,
  { readonly sourceKey: string | null; readonly sufficiencyKey: string | null }
> = {
  finance: { sourceKey: 'finance_expense', sufficiencyKey: 'finance' },
  studies: { sourceKey: 'study', sufficiencyKey: 'studies' },
  health: { sourceKey: 'health', sufficiencyKey: 'health' },
  training: { sourceKey: 'training', sufficiencyKey: 'training' },
  reading: { sourceKey: 'reading', sufficiencyKey: 'reading' },
  time: { sourceKey: 'time', sufficiencyKey: 'time' },
  projects: { sourceKey: 'task_completed', sufficiencyKey: 'projects' },
  goals: { sourceKey: null, sufficiencyKey: null },
  strategy: { sourceKey: null, sufficiencyKey: 'planning' },
};

function asPerformancePoints(points: readonly DecisionSeriesPoint[]): PerformanceSeriesPoint[] {
  return points.slice(0, PERFORMANCE_MAX_SERIES_POINTS).map((point) => ({
    date: point.date,
    value: point.value,
  }));
}

function instantLocalDate(value: string | null, timezone: string): string | null {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : localDateFor(ms, timezone);
}

function dateInPeriod(
  local: string | null,
  period: { readonly from: string; readonly to: string },
) {
  return local !== null && local >= period.from && local <= period.to;
}

export async function getLifeDashboard(
  ctx: DecisionContext,
  query: DecisionPeriodQuery,
): Promise<DecisionDashboardDto> {
  const computation = await compute(ctx, query);
  const visibleAlerts = computation.alerts
    .filter((alert) => alert.state !== 'dismissed')
    .slice(0, 8);
  const planningExecution = buildPlanningExecution({
    periods: computation.periods,
    timezone: ctx.timezone,
    tasks: computation.tasks,
    facts: computation.facts,
  });
  const longitudinalPeriods = buildPerformancePeriods({
    today: computation.today,
    comparison: computation.periods.comparison,
    ...(query.from === undefined || query.to === undefined
      ? {
          currentExpectedEnd: expectedPeriodEnd(
            computation.today,
            computation.periods.comparison === 'custom' ? 'week' : computation.periods.comparison,
          ),
          previousExpectedEnd: expectedPreviousPeriodEnd(
            computation.today,
            computation.periods.comparison === 'custom' ? 'week' : computation.periods.comparison,
          ),
        }
      : {
          explicit: { from: query.from, to: query.to },
        }),
  });
  const longitudinalIndicators = PERFORMANCE_DOMAINS.flatMap((domain) => {
    const mapping = PERFORMANCE_SOURCE_BY_DOMAIN[domain.id];
    if (mapping.sourceKey === null) return [];
    const current = asPerformancePoints(computation.series[mapping.sourceKey] ?? []);
    const previous = asPerformancePoints(computation.previousSeries[mapping.sourceKey] ?? []);
    const sufficiency =
      mapping.sufficiencyKey === null ? undefined : computation.sufficiency[mapping.sufficiencyKey];
    const indicator = buildDomainEvolution({
      id: `${domain.id}-longitudinal`,
      label: domain.label,
      domain: domain.id,
      unit: domain.unit,
      source: domain.source,
      period: longitudinalPeriods.current,
      current,
      previous,
      history: current,
      expectedDays: longitudinalPeriods.currentDays,
      observedDays: Math.min(current.length, longitudinalPeriods.currentDays),
      requiredObservations: 3,
      missing: sufficiency?.missing ?? [],
      limitations: sufficiency?.limitations ?? [],
      periodComplete: longitudinalPeriods.currentCompleteness === 'complete',
    });
    const weeklyObserved = new Set(
      current
        .filter((p) => p.value !== null)
        .map((p) => {
          const d = new Date(`${p.date}T00:00:00.000Z`);
          const day = d.getUTCDay();
          const mondayOffset = day === 0 ? -6 : 1 - day;
          d.setUTCDate(d.getUTCDate() + mondayOffset);
          return d.toISOString().slice(0, 10);
        }),
    ).size;
    const hasTrendEvidence = weeklyObserved >= 4 && longitudinalPeriods.comparable;
    const limitationsForIndicator = [
      ...indicator.limitations,
      ...(hasTrendEvidence
        ? []
        : ['Tendência suprimida: requer >= 4 observações semanais comparáveis.']),
    ];
    return [
      {
        id: indicator.id,
        domain: indicator.domain,
        label: indicator.label,
        unit: indicator.unit,
        source: indicator.source,
        status: indicator.status,
        currentValue: indicator.currentValue,
        previousValue: indicator.previousValue,
        delta: hasTrendEvidence ? indicator.delta : null,
        changePercent: hasTrendEvidence ? indicator.changePercent : null,
        direction: hasTrendEvidence ? indicator.direction : ('unknown' as const),
        observedPoints: indicator.observedPoints,
        coverage: indicator.coverage,
        confidence: hasTrendEvidence ? indicator.confidence : indicator.confidence,
        period: indicator.period,
        previousPeriod: indicator.previousPeriod,
        limitations: limitationsForIndicator,
        algorithmVersion: indicator.algorithmVersion,
      },
    ];
  });
  let feedbackRows: Array<{ action: string; c: number }> = [];
  try {
    feedbackRows = (await ctx.db.all(sql`
      SELECT action, COUNT(*) AS c
      FROM adaptation_decisions
      WHERE date(created_at) BETWEEN ${computation.periods.current.from} AND ${computation.periods.current.to}
      GROUP BY action
    `)) as Array<{ action: string; c: number }>;
  } catch (err) {
    const parts: string[] = [];
    let current: unknown = err;
    for (let depth = 0; depth < 4 && current !== null && current !== undefined; depth += 1) {
      if (current instanceof Error) {
        parts.push(current.message);
        current = (current as Error & { cause?: unknown }).cause;
      } else {
        parts.push(String(current));
        break;
      }
    }
    if (
      !/no such table.*adaptation_decisions|adaptation_decisions.*no such table/i.test(
        parts.join(' '),
      )
    ) {
      throw err;
    }
  }
  const feedbackCounts = { accepted: 0, rejected: 0, deferred: 0 };
  for (const row of feedbackRows) {
    if (row.action === 'accept') feedbackCounts.accepted = Number(row.c ?? 0);
    if (row.action === 'reject') feedbackCounts.rejected = Number(row.c ?? 0);
    if (row.action === 'defer') feedbackCounts.deferred = Number(row.c ?? 0);
  }
  const humanFeedback = {
    ...feedbackCounts,
    total: feedbackCounts.accepted + feedbackCounts.rejected + feedbackCounts.deferred,
    period: computation.periods.current,
    note: 'Decisões humanas sobre propostas de adaptação no período; decisão registrada não equivale a resultado observado.',
    limitations: [
      'Contagem baseada em registros de decisão; não mede eficácia do desfecho.',
      'Ausência de decisão não significa ausência de recomendação relevante.',
    ],
    algorithmVersion: 'human-feedback-v1',
  };
  const globalLimitations = [
    'Ausência de registro não significa ausência de atividade.',
    'Nenhuma relação entre domínios estabelece causalidade.',
  ];
  const otherLimitations = [
    ...new Set([
      ...Object.values(computation.sufficiency).flatMap((item) => item.limitations),
      ...computation.comparisons.flatMap((item) => item.limitations),
      ...planningExecution.limitations,
      ...longitudinalIndicators.flatMap((item) => item.limitations),
      ...humanFeedback.limitations,
    ]),
  ].filter((item) => !globalLimitations.includes(item));
  const limitations = [...otherLimitations, ...globalLimitations].slice(
    Math.max(0, otherLimitations.length + globalLimitations.length - 16),
  );
  return decisionDashboardDtoSchema.parse({
    date: computation.today,
    generatedAt: ctx.now,
    timezone: ctx.timezone,
    periods: computation.periods,
    areas: buildAreas(computation),
    facts: computation.facts,
    sufficiency: computation.sufficiency,
    comparisons: computation.comparisons,
    planningExecution,
    longitudinalIndicators,
    humanFeedback,
    alerts: visibleAlerts,
    recommendations: computation.recommendations,
    nextAction: computation.nextAction,
    crossDomainSummary: computation.crossDomain,
    algorithms: {
      ...DECISION_ALGORITHMS,
      planningExecution: PLANNING_EXECUTION_ALGORITHM_VERSION,
      humanFeedback: humanFeedback.algorithmVersion,
      priorityFormula: DECISION_PRIORITY_FORMULA,
      priorityWeights: JSON.stringify(DECISION_PRIORITY_WEIGHTS),
    },
    limitations,
  });
}

function page<T>(
  items: readonly T[],
  limit: number,
  cursor: string | undefined,
  id: (item: T) => string,
) {
  // Sem cursor, começa no primeiro item; cursor desconhecido também recomeça
  // do início em vez de descartar a página inteira.
  const start =
    cursor === undefined ? -1 : items.findIndex((item) => `alert:${id(item)}` === cursor);
  const offset = start < 0 ? 0 : start + 1;
  const slice = items.slice(offset, offset + limit);
  const hasMore = offset + slice.length < items.length;
  const last = slice[slice.length - 1];
  return {
    items: slice,
    hasMore,
    nextCursor: hasMore && last !== undefined ? `alert:${id(last)}` : undefined,
  };
}

export async function getAlerts(
  ctx: DecisionContext,
  query: DecisionAlertsQuery,
): Promise<{ items: readonly DecisionAlertDto[]; nextCursor?: string; hasMore: boolean }> {
  const computation = await compute(ctx, query);
  const filtered = computation.alerts.filter((alert) => {
    if (query.severity !== undefined && alert.severity !== query.severity) return false;
    if (query.area !== undefined && alert.area !== query.area) return false;
    if (query.state !== undefined) return alert.state === query.state;
    return alert.state !== 'dismissed';
  });
  const result = page(filtered, query.limit, query.cursor, (alert) => alert.id);
  return {
    items: result.items.map((alert) => decisionAlertDtoSchema.parse(alert)),
    hasMore: result.hasMore,
    ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
  };
}

export async function getRecommendations(
  ctx: DecisionContext,
  query: DecisionListQuery,
): Promise<{
  items: ReturnType<typeof decisionRecommendationDtoSchema.parse>[];
  nextCursor?: string;
  hasMore: boolean;
}> {
  const computation = await compute(ctx, query);
  const result = page(computation.recommendations, query.limit, query.cursor, (item) => item.id);
  return {
    items: result.items.map((item) => decisionRecommendationDtoSchema.parse(item)),
    hasMore: result.hasMore,
    ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
  };
}

export async function getNextActions(
  ctx: DecisionContext,
  query: DecisionListQuery,
): Promise<{
  items: ReturnType<typeof decisionNextActionDtoSchema.parse>[];
  nextCursor?: string;
  hasMore: boolean;
}> {
  const computation = await compute(ctx, query);
  const items = [computation.nextAction];
  const result = page(items, query.limit, query.cursor, (item) => item.id);
  return {
    items: result.items.map((item) => decisionNextActionDtoSchema.parse(item)),
    hasMore: result.hasMore,
    ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
  };
}

export async function getCrossDomain(
  ctx: DecisionContext,
  query: DecisionListQuery,
): Promise<{
  items: ReturnType<typeof decisionCrossDomainDtoSchema.parse>[];
  catalog: ReturnType<typeof decisionCatalogItemDtoSchema.parse>[];
  nextCursor?: string;
  hasMore: boolean;
}> {
  const computation = await compute(ctx, query);
  const result = page(computation.crossDomain, query.limit, query.cursor, (item) => item.id);
  return {
    items: result.items.map((item) => decisionCrossDomainDtoSchema.parse(item)),
    catalog: CROSS_DOMAIN_CATALOG.map((item) => decisionCatalogItemDtoSchema.parse(item)),
    hasMore: result.hasMore,
    ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
  };
}

export function getCatalog(): ReturnType<typeof decisionCatalogItemDtoSchema.parse>[] {
  return CROSS_DOMAIN_CATALOG.map((item) => decisionCatalogItemDtoSchema.parse(item));
}

function reviewFromComputation(
  kind: 'weekly' | 'monthly' | 'quarterly',
  computation: DecisionComputation,
): ReturnType<typeof buildPerformanceReview> {
  return buildPerformanceReview({
    kind,
    periods: computation.periods,
    facts: computation.facts,
    sufficiency: computation.sufficiency,
    crossDomain: computation.crossDomain,
    alerts: computation.alerts,
    recommendations: computation.recommendations,
    comparisons: computation.comparisons,
    series: computation.series,
    previousSeries: computation.previousSeries,
    persistedSnapshot:
      kind === 'weekly'
        ? computation.facts.weeklyReviewCount > 0
        : computation.facts.quarterlyReviewCount > 0,
  });
}

export async function getPerformanceReview(
  ctx: DecisionContext,
  query: DecisionReviewQuery,
): Promise<ReturnType<typeof decisionReviewDtoSchema.parse>> {
  const kind = decisionReviewKindSchema.parse(query.kind);
  const computation = await compute(ctx, {
    ...query,
    comparison: query.comparison ?? defaultComparison(kind),
  });
  return decisionReviewDtoSchema.parse(reviewFromComputation(kind, computation));
}

export async function getPerformanceDashboard(
  ctx: DecisionContext,
  query: PerformanceQuery,
): Promise<ReturnType<typeof performanceDashboardDtoSchema.parse>> {
  const reviewKind = query.reviewKind;
  const comparison = query.comparison ?? (reviewKind === 'quarterly' ? 'quarter' : 'month');
  const computation = await compute(ctx, {
    comparison,
    ...(query.from === undefined || query.to === undefined
      ? {}
      : { from: query.from, to: query.to }),
  });
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(nowMs)) throw validationError('Instante da requisição inválido.');
  const today = localDateFor(nowMs, ctx.timezone);
  const explicit =
    query.from === undefined || query.to === undefined
      ? undefined
      : { from: query.from, to: query.to };
  const naturalComparison =
    comparison === 'custom' ? (reviewKind === 'quarterly' ? 'quarter' : 'month') : comparison;
  const periods = buildPerformancePeriods({
    today,
    comparison,
    explicit,
    ...(explicit === undefined
      ? {
          currentExpectedEnd: expectedPeriodEnd(today, naturalComparison),
          previousExpectedEnd: expectedPreviousPeriodEnd(today, naturalComparison),
        }
      : {}),
  });
  const facts = computation.facts;
  const periodComplete = periods.currentCompleteness === 'complete';

  const domains = PERFORMANCE_DOMAINS.map((domain) => {
    const mapping = PERFORMANCE_SOURCE_BY_DOMAIN[domain.id];
    const series = mapping.sourceKey === null ? [] : (computation.series[mapping.sourceKey] ?? []);
    const recordCount =
      mapping.sourceKey === null
        ? domain.id === 'goals'
          ? facts.goalsActive + facts.goalsCompleted
          : facts.cycleObjectives
        : series.length;
    return {
      ...domain,
      available: recordCount > 0,
      recordCount,
    };
  });

  const indicators = PERFORMANCE_DOMAINS.flatMap((domain) => {
    const mapping = PERFORMANCE_SOURCE_BY_DOMAIN[domain.id];
    if (mapping.sourceKey === null) return [];
    const current = asPerformancePoints(computation.series[mapping.sourceKey] ?? []);
    const previous = asPerformancePoints(computation.previousSeries[mapping.sourceKey] ?? []);
    const sufficiency =
      mapping.sufficiencyKey === null ? undefined : computation.sufficiency[mapping.sufficiencyKey];
    return [
      buildDomainEvolution({
        id: `${domain.id}-evolution`,
        label: domain.label,
        domain: domain.id,
        unit: domain.unit,
        source: domain.source,
        period: periods.current,
        current,
        previous,
        history: current,
        expectedDays: periods.currentDays,
        observedDays: Math.min(current.length, periods.currentDays),
        requiredObservations: 3,
        missing: sufficiency?.missing ?? [],
        limitations: sufficiency?.limitations ?? [],
        periodComplete,
      }),
    ];
  });

  const patterns = indicators
    .filter((indicator) => indicator.points.length >= PERFORMANCE_PATTERN_MIN_POINTS)
    .slice(0, 5)
    .map((indicator) =>
      detectRecurringPatterns({
        id: `${indicator.id}-pattern`,
        label: `Padrão de ${indicator.label.toLowerCase()}`,
        domain: indicator.domain,
        source: indicator.source,
        window: periods.current,
        points: indicator.points,
      }),
    );

  const projections = indicators
    .filter(
      (indicator) =>
        indicator.points.filter((point) => point.value !== null && point.value > 0).length >= 4,
    )
    .slice(0, 6)
    .map((indicator) =>
      buildPerformanceProjection({
        id: `${indicator.id}-projection`,
        label: `${indicator.label} projetado`,
        domain: indicator.domain,
        source: indicator.source,
        unit: indicator.unit,
        nowMs,
        horizonDays: 30,
        points: indicator.points.flatMap((point) =>
          point.value === null ? [] : [{ date: point.date, value: point.value }],
        ),
        assumptions: [
          'Tendência linear dos pontos observados no período corrente.',
          'Nenhuma mudança futura de comportamento foi presumida.',
        ],
      }),
    );

  const tasksInPeriod = computation.tasks.filter((task) =>
    dateInPeriod(
      instantLocalDate(task.completedAt ?? task.updatedAt, ctx.timezone),
      periods.current,
    ),
  );
  const timeSeries = computation.series.time ?? [];
  const declaredCapacity =
    facts.capacityWeeklyMinutes === null
      ? null
      : Math.round((facts.capacityWeeklyMinutes / 7) * periods.currentDays);
  const execution = [
    buildExecutionLongitudinal({
      period: periods.current,
      plannedTasks: facts.tasksOpen + facts.tasksCompleted,
      completedTasks: facts.tasksCompleted,
      overdueTasks: facts.tasksOverdue,
      blockedTasks: facts.tasksBlocked,
      estimateMinutes: tasksInPeriod.map((task) => task.estimateMinutes),
      measuredMinutes: facts.timeObservations > 0 ? facts.timeMinutes : null,
      declaredCapacityMinutes: declaredCapacity,
      observedDays: timeSeries.length,
      activeDays: timeSeries.filter((point) => point.value !== null && point.value > 0).length,
      totalDays: periods.currentDays,
      source: 'tasks,time_entries,capacity_profiles',
      limitations:
        declaredCapacity === null
          ? []
          : ['Capacidade semanal extrapolada proporcionalmente ao período; não é tempo medido.'],
    }),
  ];

  const entities: PerformanceTrackedEntity[] = [
    ...computation.goals.map((goal) => ({
      id: goal.id,
      kind: 'goal' as const,
      title: `Objetivo ${goal.id}`,
      status: goal.status,
      updatedAt: goal.updatedAt,
      completedAt: null,
      targetDate: goal.targetDate,
    })),
    ...computation.projects.map((project) => ({
      id: project.id,
      kind: 'project' as const,
      title: project.title ?? `Projeto ${project.id}`,
      status: project.status,
      updatedAt: project.updatedAt,
      completedAt: project.completedAt,
      targetDate: project.targetDate,
    })),
  ];
  const goals = buildGoalProjectEvolution({ period: periods.current, entities, activeCycles: [] });

  const review = reviewFromComputation(reviewKind, computation);
  const persistedSnapshot = facts.quarterlyReviewCount > 0;
  const snapshot = buildPerformanceSnapshot({
    kind: reviewKind,
    createdAt: ctx.now,
    periods,
    review,
    indicators,
    patterns,
    associations: toPerformanceAssociations(computation.crossDomain),
    projections,
    execution,
    goals,
    persistedSnapshot,
  });
  const truncated = Object.values(computation.series).some(
    (series) => series.length > PERFORMANCE_MAX_SERIES_POINTS,
  );
  const limitations = [
    ...new Set([
      ...periods.limitations,
      ...Object.values(computation.sufficiency).flatMap((item) => item.limitations),
      ...execution.flatMap((item) => item.limitations),
      ...goals.limitations,
      'Ausência de registro não foi preenchida com zero.',
      'Estimativas não são tempo medido; correlações não estabelecem causalidade.',
      ...(truncated ? ['Algumas séries excederam o limite de pontos e foram recortadas.'] : []),
    ]),
  ].slice(0, 20);

  return performanceDashboardDtoSchema.parse({
    date: today,
    timezone: ctx.timezone,
    generatedAt: ctx.now,
    periods,
    domains,
    indicators,
    patterns,
    associations: toPerformanceAssociations(computation.crossDomain).slice(0, 6),
    projections,
    execution,
    goals,
    review: decisionReviewDtoSchema.parse(review),
    snapshot: performanceSnapshotDtoSchema.parse(snapshot),
    limitations,
    truncated,
    algorithms: {
      ...PERFORMANCE_ALGORITHMS,
      trend: INTELLIGENCE_ALGORITHMS.trend,
      consistency: INTELLIGENCE_ALGORITHMS.consistency,
      projection: INTELLIGENCE_ALGORITHMS.projection,
      metric: INTELLIGENCE_ALGORITHMS.metric,
      period: DECISION_ALGORITHMS.period,
      sufficiency: DECISION_ALGORITHMS.sufficiency,
      crossDomain: DECISION_ALGORITHMS.crossDomain,
      review: DECISION_ALGORITHMS.review,
    },
  });
}

function mutationContext(ctx: DecisionContext, request: MutatingRequest) {
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

async function findState(
  ctx: DecisionContext,
  alertId: string,
): Promise<AlertStateRow | undefined> {
  const rows = (await ctx.db.all(sql`
    SELECT alert_id, state, version, rule_version
    FROM intelligence_alert_states
    WHERE alert_id = ${alertId}
    LIMIT 1
  `)) as AlertStateRow[];
  return rows[0];
}

function auditState(
  ctx: DecisionContext,
  opId: string,
  alertId: string,
  before: Pick<AlertStateRow, 'state' | 'version' | 'rule_version'> | null,
  after: Pick<AlertStateRow, 'state' | 'version' | 'rule_version'>,
) {
  return auditStatement({
    entityType: 'intelligence_alert_state',
    entityId: alertId,
    action: before === null ? 'create' : 'update',
    actorType: 'user',
    actorId: ctx.subject,
    beforeJson: before === null ? null : JSON.stringify(before),
    afterJson: JSON.stringify({ alertId, ...after }),
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
  });
}

export async function setAlertState(
  ctx: DecisionContext,
  request: MutatingRequest,
  alertId: string,
  target: 'acknowledged' | 'dismissed',
  expectedVersion: number,
): Promise<IdempotentResult> {
  if (!/^[0-9a-z]{1,120}$/.test(alertId))
    throw validationError('Identificador de alerta inválido.');
  const current = await findState(ctx, alertId);
  return executeIdempotent(
    {
      ...mutationContext(ctx, request),
      validate: () => {
        if (current !== undefined && current.version !== expectedVersion) {
          throw conflict('O alerta foi alterado desde a última leitura.');
        }
        if (current === undefined && expectedVersion !== 1) {
          throw conflict('Versão informada não corresponde a um alerta ainda não registrado.');
        }
      },
    },
    ({ opId, now }) => {
      const version = current === undefined ? 1 : current.version + 1;
      const ruleVersion = current?.rule_version ?? DECISION_ALGORITHMS.earlyWarning;
      const after = { state: target, version, rule_version: ruleVersion };
      const statements =
        current === undefined
          ? [
              sql`INSERT INTO intelligence_alert_states
                (id, alert_id, state, rule_version, area, version, source_id, created_operation_id, created_at, updated_at)
                VALUES (${newId()}, ${alertId}, ${target}, ${ruleVersion}, 'general', ${version},
                  'src_manual', ${opId}, ${now}, ${now})`,
              auditState(ctx, opId, alertId, null, after),
            ]
          : [
              sql`UPDATE intelligence_alert_states SET
                state = ${target}, version = ${version}, updated_operation_id = ${opId}, updated_at = ${now}
                WHERE alert_id = ${alertId} AND version = ${current.version}`,
              auditState(
                ctx,
                opId,
                alertId,
                {
                  state: current.state,
                  version: current.version,
                  rule_version: current.rule_version,
                },
                after,
              ),
            ];
      return {
        status: 200 as const,
        bodyJson: envelope(
          ctx.requestId,
          decisionAlertStateResultDtoSchema.parse({
            alert: { id: alertId, state: target, version },
            state: target,
            version,
          }),
        ),
        statements,
      };
    },
  );
}

export async function findAlertForState(
  ctx: DecisionContext,
  alertId: string,
  query: DecisionPeriodQuery,
): Promise<DecisionAlert | undefined> {
  const computation = await compute(ctx, query);
  const alert = computation.alerts.find((item) => item.id === alertId);
  if (alert === undefined) throw notFound('Alerta não encontrado no período informado.');
  return alert;
}

function stableAlertId(type: string, entityId: string | null, period: DecisionDatePeriod): string {
  return stableHash(
    `${DECISION_ALGORITHMS.earlyWarning}|${type}|${entityId ?? 'global'}|${period.from}|${period.to}`,
  );
}

export { stableAlertId };
