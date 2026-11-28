import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamp } from './common';
import { areas, sources } from './core';
import { goals } from './domain';

export const PLANNING_CYCLE_STATUSES = [
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
] as const;

export const VISION_STATUSES = ['draft', 'active', 'superseded'] as const;

/** Visão editável: cada atualização cria uma versão e liga a anterior. */
export const lifeVisionVersions = sqliteTable(
  'life_vision_versions',
  {
    id: text('id').primaryKey(),
    version: integer('version').notNull(),
    statement: text('statement'),
    horizonYears: integer('horizon_years'),
    principlesJson: text('principles_json').notNull().default('[]'),
    outcomesJson: text('outcomes_json').notNull().default('[]'),
    status: text('status', { enum: VISION_STATUSES }).notNull(),
    changeNote: text('change_note'),
    supersededBy: text('superseded_by').references((): AnySQLiteColumn => lifeVisionVersions.id, {
      onDelete: 'restrict',
    }),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    versionRow: integer('version_row').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('life_vision_versions_status', sql`${table.status} IN ('draft','active','superseded')`),
    check('life_vision_versions_version_positive', sql`${table.version} > 0`),
    check('life_vision_versions_version_row_positive', sql`${table.versionRow} > 0`),
    check(
      'life_vision_versions_horizon',
      sql`${table.horizonYears} IS NULL OR ${table.horizonYears} BETWEEN 1 AND 50`,
    ),
    check('life_vision_versions_principles_json', sql`json_valid(${table.principlesJson})`),
    check('life_vision_versions_outcomes_json', sql`json_valid(${table.outcomesJson})`),
    check(
      'life_vision_versions_no_self_reference',
      sql`${table.supersededBy} IS NULL OR ${table.supersededBy} <> ${table.id}`,
    ),
    check(
      'life_vision_versions_statement_size',
      sql`${table.statement} IS NULL OR length(${table.statement}) <= 4000`,
    ),
    uniqueIndex('uq_life_vision_active')
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    index('idx_life_vision_version').on(table.version),
    index('idx_life_vision_source').on(table.sourceId),
    index('idx_life_vision_superseded').on(table.supersededBy),
  ],
);

/** Extensão das áreas existentes: não cria classificação concorrente. */
export const strategicAreaProfiles = sqliteTable(
  'strategic_area_profiles',
  {
    areaId: text('area_id')
      .primaryKey()
      .references(() => areas.id, { onDelete: 'restrict' }),
    description: text('description'),
    importance: integer('importance').notNull().default(3),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('strategic_area_profiles_importance', sql`${table.importance} BETWEEN 1 AND 5`),
    check('strategic_area_profiles_status', sql`${table.status} IN ('active','archived')`),
    check('strategic_area_profiles_version_positive', sql`${table.version} > 0`),
    check(
      'strategic_area_profiles_description_size',
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`,
    ),
    index('idx_strategic_area_profiles_status').on(table.status),
    index('idx_strategic_area_profiles_source').on(table.sourceId),
  ],
);

/** Camada estratégica sobre `goals`: vínculo com visão e metadados de revisão. */
export const strategicGoals = sqliteTable(
  'strategic_goals',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'restrict' }),
    visionId: text('vision_id').references(() => lifeVisionVersions.id, { onDelete: 'set null' }),
    horizon: text('horizon', { enum: ['short', 'medium', 'long'] }).notNull(),
    importance: integer('importance').notNull().default(3),
    reviewCadenceDays: integer('review_cadence_days').notNull().default(90),
    resultsJson: text('results_json').notNull().default('[]'),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_strategic_goals_goal').on(table.goalId),
    check('strategic_goals_horizon', sql`${table.horizon} IN ('short','medium','long')`),
    check('strategic_goals_importance', sql`${table.importance} BETWEEN 1 AND 5`),
    check('strategic_goals_cadence', sql`${table.reviewCadenceDays} BETWEEN 7 AND 365`),
    check('strategic_goals_results_json', sql`json_valid(${table.resultsJson})`),
    check('strategic_goals_version_positive', sql`${table.version} > 0`),
    index('idx_strategic_goals_vision').on(table.visionId),
    index('idx_strategic_goals_importance').on(table.importance),
    index('idx_strategic_goals_source').on(table.sourceId),
  ],
);

export const planningCycles = sqliteTable(
  'planning_cycles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    theme: text('theme'),
    expectedResultsJson: text('expected_results_json').notNull().default('[]'),
    priorityProjectsJson: text('priority_projects_json').notNull().default('[]'),
    successCriteriaJson: text('success_criteria_json').notNull().default('[]'),
    status: text('status', { enum: PLANNING_CYCLE_STATUSES }).notNull().default('planned'),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('planning_cycles_name_length', sql`length(${table.name}) BETWEEN 1 AND 200`),
    check(
      'planning_cycles_date_format',
      sql`length(${table.startDate}) = 10 AND length(${table.endDate}) = 10`,
    ),
    check('planning_cycles_date_order', sql`${table.endDate} >= ${table.startDate}`),
    check(
      'planning_cycles_status',
      sql`${table.status} IN ('planned','active','paused','completed','cancelled')`,
    ),
    check('planning_cycles_expected_results_json', sql`json_valid(${table.expectedResultsJson})`),
    check('planning_cycles_priority_projects_json', sql`json_valid(${table.priorityProjectsJson})`),
    check('planning_cycles_success_criteria_json', sql`json_valid(${table.successCriteriaJson})`),
    check('planning_cycles_version_positive', sql`${table.version} > 0`),
    index('idx_planning_cycles_status').on(table.status),
    index('idx_planning_cycles_dates').on(table.startDate, table.endDate),
    index('idx_planning_cycles_source').on(table.sourceId),
  ],
);

export const planningCycleObjectives = sqliteTable(
  'planning_cycle_objectives',
  {
    cycleId: text('cycle_id')
      .notNull()
      .references(() => planningCycles.id, { onDelete: 'cascade' }),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'restrict' }),
    isPriority: integer('is_priority').notNull().default(0),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check('planning_cycle_objectives_priority_boolean', sql`${table.isPriority} IN (0,1)`),
    uniqueIndex('uq_planning_cycle_objectives').on(table.cycleId, table.goalId),
    index('idx_planning_cycle_objectives_goal').on(table.goalId),
    index('idx_planning_cycle_objectives_priority').on(table.cycleId, table.isPriority),
  ],
);

export const capacityProfiles = sqliteTable(
  'capacity_profiles',
  {
    id: text('id').primaryKey(),
    weeklyMinutes: integer('weekly_minutes').notNull(),
    contingencyPercent: integer('contingency_percent').notNull().default(10),
    allocationsJson: text('allocations_json').notNull().default('[]'),
    preferencesJson: text('preferences_json').notNull().default('[]'),
    isActive: integer('is_active').notNull().default(1),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('capacity_profiles_weekly_minutes', sql`${table.weeklyMinutes} BETWEEN 0 AND 10000`),
    check('capacity_profiles_contingency', sql`${table.contingencyPercent} BETWEEN 0 AND 50`),
    check('capacity_profiles_allocations_json', sql`json_valid(${table.allocationsJson})`),
    check('capacity_profiles_preferences_json', sql`json_valid(${table.preferencesJson})`),
    check('capacity_profiles_is_active_boolean', sql`${table.isActive} IN (0,1)`),
    check('capacity_profiles_version_positive', sql`${table.version} > 0`),
    uniqueIndex('uq_capacity_profiles_active')
      .on(table.isActive)
      .where(sql`${table.isActive} = 1`),
    index('idx_capacity_profiles_source').on(table.sourceId),
  ],
);

export const capacityUnavailability = sqliteTable(
  'capacity_unavailability',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => capacityProfiles.id, { onDelete: 'cascade' }),
    fromDate: text('from_date').notNull(),
    toDate: text('to_date').notNull(),
    reason: text('reason'),
    minutesPerDay: integer('minutes_per_day'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check(
      'capacity_unavailability_date_format',
      sql`length(${table.fromDate}) = 10 AND length(${table.toDate}) = 10`,
    ),
    check('capacity_unavailability_date_order', sql`${table.toDate} >= ${table.fromDate}`),
    check(
      'capacity_unavailability_minutes',
      sql`${table.minutesPerDay} IS NULL OR ${table.minutesPerDay} BETWEEN 0 AND 1440`,
    ),
    check(
      'capacity_unavailability_reason_size',
      sql`${table.reason} IS NULL OR length(${table.reason}) <= 500`,
    ),
    index('idx_capacity_unavailability_profile').on(table.profileId, table.fromDate),
  ],
);

export const planningScenarios = sqliteTable(
  'planning_scenarios',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    hypotheses: text('hypotheses'),
    changesJson: text('changes_json').notNull(),
    weekStart: text('week_start').notNull(),
    resultJson: text('result_json').notNull(),
    limitationsJson: text('limitations_json').notNull().default('[]'),
    algorithmVersion: text('algorithm_version').notNull(),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('planning_scenarios_name_length', sql`length(${table.name}) BETWEEN 1 AND 200`),
    check('planning_scenarios_week_format', sql`length(${table.weekStart}) = 10`),
    check('planning_scenarios_changes_json', sql`json_valid(${table.changesJson})`),
    check('planning_scenarios_result_json', sql`json_valid(${table.resultJson})`),
    check('planning_scenarios_limitations_json', sql`json_valid(${table.limitationsJson})`),
    check('planning_scenarios_result_size', sql`length(${table.resultJson}) <= 200000`),
    check('planning_scenarios_version_positive', sql`${table.version} > 0`),
    index('idx_planning_scenarios_created').on(table.createdAt),
    index('idx_planning_scenarios_source').on(table.sourceId),
  ],
);

export const planningCycleReviews = sqliteTable(
  'planning_cycle_reviews',
  {
    id: text('id').primaryKey(),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => planningCycles.id, { onDelete: 'restrict' }),
    snapshotJson: text('snapshot_json').notNull(),
    reflectionsJson: text('reflections_json').notNull().default('{}'),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_planning_cycle_reviews_cycle').on(table.cycleId),
    check('planning_cycle_reviews_snapshot_json', sql`json_valid(${table.snapshotJson})`),
    check('planning_cycle_reviews_snapshot_size', sql`length(${table.snapshotJson}) <= 200000`),
    check('planning_cycle_reviews_reflections_json', sql`json_valid(${table.reflectionsJson})`),
    check('planning_cycle_reviews_version_positive', sql`${table.version} > 0`),
    index('idx_planning_cycle_reviews_updated').on(table.updatedAt),
    index('idx_planning_cycle_reviews_source').on(table.sourceId),
  ],
);

export type LifeVisionVersionRow = typeof lifeVisionVersions.$inferSelect;
export type StrategicAreaProfileRow = typeof strategicAreaProfiles.$inferSelect;
export type StrategicGoalRow = typeof strategicGoals.$inferSelect;
export type PlanningCycleRow = typeof planningCycles.$inferSelect;
export type CapacityProfileRow = typeof capacityProfiles.$inferSelect;
export type CapacityUnavailabilityRow = typeof capacityUnavailability.$inferSelect;
export type PlanningScenarioRow = typeof planningScenarios.$inferSelect;
export type PlanningCycleReviewRow = typeof planningCycleReviews.$inferSelect;
