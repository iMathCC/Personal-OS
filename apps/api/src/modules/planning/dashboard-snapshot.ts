import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { batchSql } from '@personal-os/db';
import { datasetFromPayloads, INTELLIGENCE_LIMITS, type Dataset } from '../intelligence/service';
import type { PlanningContext } from './service';

const READ_LIMIT = 200;
const TASK_LIMIT = 2_000;
const SCENARIO_LIMIT = 20;
const CYCLE_REVIEW_LIMIT = 40_000;
const WEEKLY_REVIEW_LIMIT = 10;

const visionRowSchema = z.object({
  id: z.string(),
  version: z.number(),
  statement: z.string().nullable(),
  horizonYears: z.number().nullable(),
  principlesJson: z.string(),
  outcomesJson: z.string(),
  status: z.enum(['draft', 'active', 'superseded']),
  changeNote: z.string().nullable(),
  supersededBy: z.string().nullable(),
  versionRow: z.number(),
  sourceId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const areaAggregateRowSchema = z.object({
  areaId: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  importance: z.number(),
  status: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  goalCount: z.number(),
  activeGoalCount: z.number(),
});
const availableAreaRowSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});
const availableGoalRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  areaId: z.string(),
  priority: z.number(),
  status: z.string(),
});
const strategicGoalJoinRowSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  visionId: z.string().nullable(),
  horizon: z.enum(['short', 'medium', 'long']),
  importance: z.number(),
  reviewCadenceDays: z.number(),
  resultsJson: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.number(),
  progressPercent: z.number().nullable(),
  targetDate: z.string().nullable(),
  areaId: z.string(),
});
const cycleJoinRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  theme: z.string().nullable(),
  expectedResultsJson: z.string(),
  priorityProjectsJson: z.string(),
  successCriteriaJson: z.string(),
  status: z.enum(['planned', 'active', 'paused', 'completed', 'cancelled']),
  sourceId: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const cycleObjectiveRowSchema = z.object({
  cycleId: z.string(),
  goalId: z.string(),
  isPriority: z.number(),
  title: z.string(),
  areaId: z.string(),
  declaredPriority: z.number(),
});
const cycleReviewRowSchema = z.object({ cycleId: z.string() });
const scenarioRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  hypotheses: z.string().nullable(),
  changesJson: z.string(),
  weekStart: z.string(),
  resultJson: z.string(),
  limitationsJson: z.string(),
  algorithmVersion: z.string(),
  sourceId: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const reviewRowSchema = z.object({
  id: z.string(),
  cycleId: z.string(),
  snapshotJson: z.string(),
  reflectionsJson: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  cycleName: z.string(),
});
const profileRowSchema = z.object({
  id: z.string(),
  weeklyMinutes: z.number(),
  contingencyPercent: z.number(),
  allocationsJson: z.string(),
  preferencesJson: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const unavailabilityRowSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  reason: z.string().nullable(),
  minutesPerDay: z.number().nullable(),
});
const commitmentRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  areaId: z.string(),
  projectId: z.string().nullable(),
  goalId: z.string().nullable(),
  estimateMinutes: z.number().nullable(),
  status: z.string(),
  dueDate: z.string().nullable(),
  blocked: z.number(),
});
const prioritizationRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['goal', 'project']),
  declaredPriority: z.union([z.number(), z.string()]),
  importance: z.number().nullable(),
  dueDate: z.string().nullable(),
  progressPercent: z.number().nullable(),
  pendingDependencies: z.number(),
  minutes: z.number().nullable(),
  risk: z.number().nullable(),
  contribution: z.number().nullable(),
});
const weeklyReviewWeekRowSchema = z.object({ weekStart: z.string() });

/** Uma coluna por dataset: evita `UNION ALL` longo e mantém um único statement D1. */
const snapshotPayloadSchema = z.object({
  vision: z.string(),
  areas: z.string(),
  availableAreas: z.string(),
  availableGoals: z.string(),
  strategicGoals: z.string(),
  cycles: z.string(),
  cycleObjectives: z.string(),
  cycleReviews: z.string(),
  scenarios: z.string(),
  reviews: z.string(),
  profile: z.string(),
  unavailability: z.string(),
  commitments: z.string(),
  prioritizationGoals: z.string(),
  prioritizationProjects: z.string(),
  intelligenceStudies: z.string(),
  intelligenceGoals: z.string(),
  intelligenceProjects: z.string(),
  intelligenceTasks: z.string(),
  intelligenceMilestones: z.string(),
  weeks: z.string(),
});
type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;
const batchEntrySchema = z.object({ results: z.array(z.unknown()) });

export type VisionSnapshotRow = z.infer<typeof visionRowSchema>;
export type AreaAggregateSnapshotRow = z.infer<typeof areaAggregateRowSchema>;
export type AvailableAreaSnapshotRow = z.infer<typeof availableAreaRowSchema>;
export type AvailableGoalSnapshotRow = z.infer<typeof availableGoalRowSchema>;
export type StrategicGoalSnapshotRow = z.infer<typeof strategicGoalJoinRowSchema>;
export type CycleSnapshotRow = z.infer<typeof cycleJoinRowSchema>;
export type CycleObjectiveSnapshotRow = z.infer<typeof cycleObjectiveRowSchema>;
export type CycleReviewSnapshotRow = z.infer<typeof cycleReviewRowSchema>;
export type ScenarioSnapshotRow = z.infer<typeof scenarioRowSchema>;
export type ReviewSnapshotRow = z.infer<typeof reviewRowSchema>;
export type ProfileSnapshotRow = z.infer<typeof profileRowSchema>;
export type UnavailabilitySnapshotRow = z.infer<typeof unavailabilityRowSchema>;
export type CommitmentSnapshotRow = z.infer<typeof commitmentRowSchema>;
export type PrioritizationSnapshotRow = z.infer<typeof prioritizationRowSchema>;
export type WeeklyReviewWeekSnapshotRow = z.infer<typeof weeklyReviewWeekRowSchema>;

export interface PlanningDashboardSnapshot {
  vision: VisionSnapshotRow[];
  areas: AreaAggregateSnapshotRow[];
  availableAreas: AvailableAreaSnapshotRow[];
  availableGoals: AvailableGoalSnapshotRow[];
  strategicGoals: StrategicGoalSnapshotRow[];
  cycles: CycleSnapshotRow[];
  cycleObjectives: CycleObjectiveSnapshotRow[];
  cycleReviews: CycleReviewSnapshotRow[];
  scenarios: ScenarioSnapshotRow[];
  scenariosTruncated: boolean;
  reviews: ReviewSnapshotRow[];
  profile: ProfileSnapshotRow[];
  unavailability: UnavailabilitySnapshotRow[];
  commitments: CommitmentSnapshotRow[];
  prioritization: PrioritizationSnapshotRow[];
  intelligence: Dataset;
  weeklyReviewWeeks: WeeklyReviewWeekSnapshotRow[];
}

function batchRows(results: readonly unknown[]): unknown[] {
  return batchEntrySchema.parse(results[0]).results;
}

function payload<T>(row: SnapshotPayload, key: keyof SnapshotPayload, schema: z.ZodType<T>): T {
  const value: unknown = JSON.parse(row[key]);
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Payload de planejamento inválido (${key}): ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Um único statement devolve todos os fatos do painel como colunas JSON. Isso
 * mantém o painel em quatro statements por requisição (sessão, usuário, limite
 * e este snapshot), abaixo do teto documentado de oito. Subconsultas escalares
 * substituem um `UNION ALL` longo, que excede o limite do D1 nesta dimensão.
 */
function snapshotStatement(window: { from: string; to: string }, weekEnd: string): SQL {
  return sql`
    WITH vision_rows AS (
      SELECT id, version, statement, horizon_years, principles_json, outcomes_json,
        status, change_note, superseded_by, version_row, source_id, created_at, updated_at
      FROM life_vision_versions
      WHERE status = 'active'
      LIMIT 1
    ),
    area_rows AS (
      SELECT p.area_id, a.key, a.name, p.description, p.importance, p.status, p.version,
        p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM goals g WHERE g.area_id = p.area_id AND g.deleted_at IS NULL) AS goal_count,
        (SELECT COUNT(*) FROM goals g WHERE g.area_id = p.area_id AND g.deleted_at IS NULL AND g.status = 'active') AS active_goal_count
      FROM strategic_area_profiles p
      INNER JOIN areas a ON a.id = p.area_id
      ORDER BY p.importance DESC, a.name ASC
      LIMIT ${READ_LIMIT}
    ),
    available_area_rows AS (
      SELECT id, key, name FROM areas
      WHERE deleted_at IS NULL
      ORDER BY name ASC
      LIMIT ${READ_LIMIT}
    ),
    available_goal_rows AS (
      SELECT id, title, area_id, priority, status FROM goals
      WHERE deleted_at IS NULL
      ORDER BY title ASC
      LIMIT ${READ_LIMIT}
    ),
    strategic_goal_rows AS (
      SELECT s.id, s.goal_id, s.vision_id, s.horizon, s.importance, s.review_cadence_days,
        s.results_json, s.version, s.created_at, s.updated_at,
        g.title, g.status, g.priority, g.manual_progress, g.target_date, g.area_id
      FROM strategic_goals s
      INNER JOIN goals g ON g.id = s.goal_id
      WHERE g.deleted_at IS NULL
      ORDER BY s.importance DESC, g.priority DESC, g.title ASC
      LIMIT ${READ_LIMIT}
    ),
    cycle_rows AS (
      SELECT id, name, start_date, end_date, theme, expected_results_json,
        priority_projects_json, success_criteria_json, status, source_id, version,
        created_at, updated_at
      FROM planning_cycles
      ORDER BY start_date DESC
      LIMIT ${READ_LIMIT}
    ),
    cycle_objective_rows AS (
      SELECT o.cycle_id, o.goal_id, o.is_priority, g.title, g.area_id, g.priority AS declared_priority
      FROM planning_cycle_objectives o
      INNER JOIN goals g ON g.id = o.goal_id
      WHERE o.cycle_id IN (SELECT id FROM cycle_rows)
      ORDER BY o.cycle_id ASC, o.is_priority DESC, g.title ASC
      LIMIT ${CYCLE_REVIEW_LIMIT}
    ),
    cycle_review_rows AS (
      SELECT cycle_id FROM planning_cycle_reviews
      WHERE cycle_id IN (SELECT id FROM cycle_rows)
      LIMIT ${CYCLE_REVIEW_LIMIT}
    ),
    scenario_rows AS (
      SELECT id, name, hypotheses, changes_json, week_start, result_json,
        limitations_json, algorithm_version, source_id, version, created_at, updated_at
      FROM planning_scenarios
      ORDER BY created_at DESC
      LIMIT ${SCENARIO_LIMIT + 1}
    ),
    review_rows AS (
      SELECT r.id, r.cycle_id, r.snapshot_json, r.reflections_json, r.version,
        r.created_at, r.updated_at, c.name AS cycle_name
      FROM planning_cycle_reviews r
      INNER JOIN planning_cycles c ON c.id = r.cycle_id
      ORDER BY r.updated_at DESC
      LIMIT ${READ_LIMIT}
    ),
    profile_rows AS (
      SELECT id, weekly_minutes, contingency_percent, allocations_json, preferences_json,
        version, created_at, updated_at
      FROM capacity_profiles
      WHERE is_active = 1
      LIMIT 1
    ),
    unavailability_rows AS (
      SELECT id, from_date, to_date, reason, minutes_per_day
      FROM capacity_unavailability
      WHERE profile_id IN (SELECT id FROM profile_rows)
      ORDER BY from_date ASC
      LIMIT ${READ_LIMIT}
    ),
    commitment_rows AS (
      SELECT t.id, t.title, t.project_id, t.goal_id, t.estimate_minutes, t.status, t.due_date,
        COALESCE(g.area_id, pg.area_id, (SELECT id FROM areas WHERE key = 'life' LIMIT 1)) AS area_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM task_dependencies td INNER JOIN tasks dep ON dep.id = td.depends_on_task_id
          WHERE td.task_id = t.id AND dep.status NOT IN ('completed','cancelled') AND dep.deleted_at IS NULL
        ) THEN 1 ELSE 0 END AS blocked
      FROM tasks t
      LEFT JOIN goals g ON g.id = t.goal_id
      LEFT JOIN project_goals pgl ON pgl.project_id = t.project_id
      LEFT JOIN goals pg ON pg.id = pgl.goal_id
      WHERE t.deleted_at IS NULL AND (t.due_date IS NULL OR t.due_date <= ${weekEnd})
      ORDER BY t.due_date ASC, t.id ASC
      LIMIT ${TASK_LIMIT}
    ),
    prioritization_goal_rows AS (
      SELECT s.goal_id, g.title, g.priority, s.importance, g.target_date, g.manual_progress,
        (SELECT COUNT(*) FROM goal_milestones m WHERE m.goal_id = g.id AND m.status IN ('pending','in_progress')) AS pending_dependencies,
        (SELECT SUM(t.estimate_minutes) FROM tasks t WHERE t.goal_id = g.id AND t.deleted_at IS NULL AND t.status NOT IN ('completed','cancelled')) AS minutes,
        (SELECT COUNT(*) FROM goal_milestones m WHERE m.goal_id = g.id AND m.status = 'pending') AS risk,
        s.importance AS contribution, 'goal' AS kind
      FROM strategic_goals s INNER JOIN goals g ON g.id = s.goal_id
      WHERE g.deleted_at IS NULL
      ORDER BY s.goal_id ASC
      LIMIT ${READ_LIMIT}
    ),
    prioritization_project_rows AS (
      SELECT p.id, p.title, p.priority,
        (SELECT MAX(s.importance) FROM project_goals pg JOIN strategic_goals s ON s.goal_id = pg.goal_id WHERE pg.project_id = p.id) AS importance,
        p.target_date, NULL AS manual_progress,
        (SELECT COUNT(*) FROM task_dependencies td JOIN tasks t ON t.id = td.task_id WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS pending_dependencies,
        (SELECT SUM(t.estimate_minutes) FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL AND t.status NOT IN ('completed','cancelled')) AS minutes,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'blocked' AND t.deleted_at IS NULL) AS risk,
        COALESCE((SELECT MAX(s.importance) FROM project_goals pg JOIN strategic_goals s ON s.goal_id = pg.goal_id WHERE pg.project_id = p.id), 1) AS contribution,
        'project' AS kind
      FROM projects p
      WHERE p.deleted_at IS NULL AND p.status IN ('planned','active','paused')
      ORDER BY p.id ASC
      LIMIT ${READ_LIMIT}
    ),
    intelligence_study_rows AS (
      SELECT local_date, started_at, duration_minutes, course_id, timezone
      FROM study_sessions
      WHERE deleted_at IS NULL AND local_date >= ${window.from} AND local_date <= ${window.to}
      ORDER BY local_date ASC, id ASC
      LIMIT ${INTELLIGENCE_LIMITS.studies + 1}
    ),
    intelligence_goal_rows AS (
      SELECT id, title, status, priority, target_date, manual_progress, progress_mode, updated_at
      FROM goals
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      LIMIT ${INTELLIGENCE_LIMITS.read + 1}
    ),
    intelligence_project_rows AS (
      SELECT id, title, status, target_date, created_at, updated_at, completed_at
      FROM projects
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      LIMIT ${INTELLIGENCE_LIMITS.read + 1}
    ),
    intelligence_task_rows AS (
      SELECT t.id, t.title, t.status, t.priority, t.project_id, t.due_date, t.goal_id,
        td.depends_on_task_id, t.created_at, t.updated_at, t.completed_at
      FROM tasks t
      LEFT JOIN task_dependencies td ON td.task_id = t.id
      WHERE t.deleted_at IS NULL
      ORDER BY t.id ASC, td.depends_on_task_id ASC
      LIMIT ${INTELLIGENCE_LIMITS.tasks + 1}
    ),
    intelligence_milestone_rows AS (
      SELECT id, title, status, due_date, completed_at, updated_at, project_id, NULL AS goal_id
      FROM project_milestones
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      LIMIT ${INTELLIGENCE_LIMITS.milestones + 1}
    )
    SELECT
      (SELECT json_group_array(json_object(
        'id', id, 'version', version, 'statement', statement,
        'horizonYears', horizon_years, 'principlesJson', principles_json,
        'outcomesJson', outcomes_json, 'status', status, 'changeNote', change_note,
        'supersededBy', superseded_by, 'versionRow', version_row, 'sourceId', source_id,
        'createdAt', created_at, 'updatedAt', updated_at
      )) FROM vision_rows) AS "vision",
      (SELECT json_group_array(json_object(
        'areaId', area_id, 'key', key, 'name', name, 'description', description,
        'importance', importance, 'status', status, 'version', version,
        'createdAt', created_at, 'updatedAt', updated_at,
        'goalCount', goal_count, 'activeGoalCount', active_goal_count
      )) FROM area_rows) AS "areas",
      (SELECT json_group_array(json_object(
        'id', id, 'key', key, 'name', name
      )) FROM available_area_rows) AS "availableAreas",
      (SELECT json_group_array(json_object(
        'id', id, 'title', title, 'areaId', area_id, 'priority', priority, 'status', status
      )) FROM available_goal_rows) AS "availableGoals",
      (SELECT json_group_array(json_object(
        'id', id, 'goalId', goal_id, 'visionId', vision_id, 'horizon', horizon,
        'importance', importance, 'reviewCadenceDays', review_cadence_days,
        'resultsJson', results_json, 'version', version, 'createdAt', created_at,
        'updatedAt', updated_at, 'title', title, 'status', status, 'priority', priority,
        'progressPercent', manual_progress, 'targetDate', target_date, 'areaId', area_id
      )) FROM strategic_goal_rows) AS "strategicGoals",
      (SELECT json_group_array(json_object(
        'id', id, 'name', name, 'startDate', start_date, 'endDate', end_date,
        'theme', theme, 'expectedResultsJson', expected_results_json,
        'priorityProjectsJson', priority_projects_json, 'successCriteriaJson', success_criteria_json,
        'status', status, 'sourceId', source_id, 'version', version,
        'createdAt', created_at, 'updatedAt', updated_at
      )) FROM cycle_rows) AS "cycles",
      (SELECT json_group_array(json_object(
        'cycleId', cycle_id, 'goalId', goal_id, 'isPriority', is_priority,
        'title', title, 'areaId', area_id, 'declaredPriority', declared_priority
      )) FROM cycle_objective_rows) AS "cycleObjectives",
      (SELECT json_group_array(json_object('cycleId', cycle_id)) FROM cycle_review_rows) AS "cycleReviews",
      (SELECT json_group_array(json_object(
        'id', id, 'name', name, 'hypotheses', hypotheses, 'changesJson', changes_json,
        'weekStart', week_start, 'resultJson', result_json, 'limitationsJson', limitations_json,
        'algorithmVersion', algorithm_version, 'sourceId', source_id, 'version', version,
        'createdAt', created_at, 'updatedAt', updated_at
      )) FROM scenario_rows) AS "scenarios",
      (SELECT json_group_array(json_object(
        'id', id, 'cycleId', cycle_id, 'snapshotJson', snapshot_json,
        'reflectionsJson', reflections_json, 'version', version,
        'createdAt', created_at, 'updatedAt', updated_at, 'cycleName', cycle_name
      )) FROM review_rows) AS "reviews",
      (SELECT json_group_array(json_object(
        'id', id, 'weeklyMinutes', weekly_minutes, 'contingencyPercent', contingency_percent,
        'allocationsJson', allocations_json, 'preferencesJson', preferences_json,
        'version', version, 'createdAt', created_at, 'updatedAt', updated_at
      )) FROM profile_rows) AS "profile",
      (SELECT json_group_array(json_object(
        'id', id, 'from', from_date, 'to', to_date, 'reason', reason,
        'minutesPerDay', minutes_per_day
      )) FROM unavailability_rows) AS "unavailability",
      (SELECT json_group_array(json_object(
        'id', id, 'title', title, 'areaId', area_id, 'projectId', project_id,
        'goalId', goal_id, 'estimateMinutes', estimate_minutes, 'status', status,
        'dueDate', due_date, 'blocked', blocked
      )) FROM commitment_rows) AS "commitments",
      (SELECT json_group_array(json_object(
        'id', goal_id, 'title', title, 'kind', kind, 'declaredPriority', priority,
        'importance', importance, 'dueDate', target_date, 'progressPercent', manual_progress,
        'pendingDependencies', pending_dependencies, 'minutes', minutes,
        'risk', risk, 'contribution', contribution
      )) FROM prioritization_goal_rows) AS "prioritizationGoals",
      (SELECT json_group_array(json_object(
        'id', id, 'title', title, 'kind', kind, 'declaredPriority', priority,
        'importance', importance, 'dueDate', target_date, 'progressPercent', manual_progress,
        'pendingDependencies', pending_dependencies, 'minutes', minutes,
        'risk', risk, 'contribution', contribution
      )) FROM prioritization_project_rows) AS "prioritizationProjects",
      (SELECT json_group_array(json_object(
        'localDate', local_date, 'startedAt', started_at,
        'durationMinutes', duration_minutes, 'courseId', course_id, 'timezone', timezone
      )) FROM intelligence_study_rows) AS "intelligenceStudies",
      (SELECT json_group_array(json_object(
        'id', id, 'title', title, 'status', status, 'priority', priority,
        'targetDate', target_date, 'manualProgress', manual_progress,
        'progressMode', progress_mode, 'updatedAt', updated_at
      )) FROM intelligence_goal_rows) AS "intelligenceGoals",
      (SELECT json_group_array(json_object(
        'id', id, 'title', title, 'status', status, 'targetDate', target_date,
        'createdAt', created_at, 'updatedAt', updated_at, 'completedAt', completed_at
      )) FROM intelligence_project_rows) AS "intelligenceProjects",
      (SELECT json_group_array(json_object(
        'id', id, 'title', title, 'status', status, 'priority', priority,
        'projectId', project_id, 'dueDate', due_date, 'goalId', goal_id,
        'dependencyId', depends_on_task_id, 'createdAt', created_at,
        'updatedAt', updated_at, 'completedAt', completed_at
      )) FROM intelligence_task_rows) AS "intelligenceTasks",
      (SELECT json_group_array(json_object(
        'id', id, 'title', title, 'status', status, 'dueDate', due_date,
        'completedAt', completed_at, 'updatedAt', updated_at,
        'projectId', project_id, 'goalId', goal_id
      )) FROM intelligence_milestone_rows) AS "intelligenceMilestones",
      (SELECT json_group_array(json_object('weekStart', week_start)) FROM (
        SELECT week_start FROM weekly_reviews
        ORDER BY week_start DESC
        LIMIT ${WEEKLY_REVIEW_LIMIT}
      )) AS "weeks"
  `;
}

/** Carrega o painel inteiro em um statement, respeitando o teto de consultas. */
export async function loadPlanningDashboardSnapshot(
  ctx: PlanningContext,
  window: { from: string; to: string },
  weekEnd: string,
): Promise<PlanningDashboardSnapshot> {
  const row = snapshotPayloadSchema.parse(
    batchRows(await batchSql(ctx.db, [snapshotStatement(window, weekEnd)]))[0],
  );
  const scenarioRows = payload(row, 'scenarios', scenarioRowSchema.array());

  return {
    vision: payload(row, 'vision', visionRowSchema.array()),
    areas: payload(row, 'areas', areaAggregateRowSchema.array()),
    availableAreas: payload(row, 'availableAreas', availableAreaRowSchema.array()),
    availableGoals: payload(row, 'availableGoals', availableGoalRowSchema.array()),
    strategicGoals: payload(row, 'strategicGoals', strategicGoalJoinRowSchema.array()),
    cycles: payload(row, 'cycles', cycleJoinRowSchema.array()),
    cycleObjectives: payload(row, 'cycleObjectives', cycleObjectiveRowSchema.array()),
    cycleReviews: payload(row, 'cycleReviews', cycleReviewRowSchema.array()),
    scenarios: scenarioRows.slice(0, SCENARIO_LIMIT),
    scenariosTruncated: scenarioRows.length > SCENARIO_LIMIT,
    reviews: payload(row, 'reviews', reviewRowSchema.array()),
    profile: payload(row, 'profile', profileRowSchema.array()),
    unavailability: payload(row, 'unavailability', unavailabilityRowSchema.array()),
    commitments: payload(row, 'commitments', commitmentRowSchema.array()),
    prioritization: [
      ...payload(row, 'prioritizationGoals', prioritizationRowSchema.array()),
      ...payload(row, 'prioritizationProjects', prioritizationRowSchema.array()),
    ].map((item) => ({
      ...item,
      importance: item.importance ?? 1,
      risk: item.risk ?? 0,
      contribution: item.contribution ?? 1,
    })),
    intelligence: datasetFromPayloads(
      new Map<string, string>([
        ['studies', row.intelligenceStudies],
        ['goals', row.intelligenceGoals],
        ['projects', row.intelligenceProjects],
        ['tasks', row.intelligenceTasks],
        ['milestones', row.intelligenceMilestones],
      ]),
    ),
    weeklyReviewWeeks: payload(row, 'weeks', weeklyReviewWeekRowSchema.array()),
  };
}
