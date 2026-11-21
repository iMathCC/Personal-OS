import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { nullableTimestamp, timestamp } from './common';
import { areas, sources } from './core';

export const METRIC_VALUE_TYPES = [
  'number',
  'integer',
  'duration',
  'currency',
  'boolean',
  'rating',
] as const;

export const METRIC_AGGREGATIONS = ['sum', 'avg', 'last', 'min', 'max', 'count'] as const;
export const METRIC_DIRECTIONS = ['higher_better', 'lower_better', 'neutral'] as const;
export const METRIC_CADENCES = ['daily', 'weekly', 'monthly', 'ad_hoc'] as const;
export const GOAL_HORIZONS = ['short', 'medium', 'long'] as const;
export const GOAL_STATUSES = ['draft', 'active', 'paused', 'achieved', 'cancelled'] as const;
export const GOAL_PROGRESS_MODES = ['manual', 'metrics', 'tasks', 'hybrid'] as const;
export const GOAL_METRIC_DIRECTIONS = ['increase', 'decrease', 'maintain'] as const;
export const COURSE_STATUSES = ['planned', 'active', 'paused', 'completed', 'dropped'] as const;

export const metrics = sqliteTable(
  'metrics',
  {
    id: text('id').primaryKey(),
    areaId: text('area_id').references(() => areas.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    unit: text('unit').notNull(),
    valueType: text('value_type', { enum: METRIC_VALUE_TYPES }).notNull(),
    aggregation: text('aggregation', { enum: METRIC_AGGREGATIONS }).notNull(),
    direction: text('direction', { enum: METRIC_DIRECTIONS }).notNull(),
    cadence: text('cadence', { enum: METRIC_CADENCES }).notNull(),
    targetValue: real('target_value'),
    precision: integer('precision').notNull().default(2),
    isActive: integer('is_active').notNull().default(1),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    metadataJson: text('metadata_json'),
    deletedAt: nullableTimestamp('deleted_at'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('metrics_key_unique').on(table.key),
    check(
      'metrics_value_type',
      sql`${table.valueType} IN ('number','integer','duration','currency','boolean','rating')`,
    ),
    check(
      'metrics_aggregation',
      sql`${table.aggregation} IN ('sum','avg','last','min','max','count')`,
    ),
    check(
      'metrics_direction',
      sql`${table.direction} IN ('higher_better','lower_better','neutral')`,
    ),
    check('metrics_cadence', sql`${table.cadence} IN ('daily','weekly','monthly','ad_hoc')`),
    check('metrics_precision', sql`${table.precision} BETWEEN 0 AND 6`),
    check('metrics_is_active_boolean', sql`${table.isActive} IN (0,1)`),
    check('metrics_version_positive', sql`${table.version} > 0`),
    check('metrics_key_length', sql`length(${table.key}) BETWEEN 1 AND 120`),
    check('metrics_unit_length', sql`length(${table.unit}) BETWEEN 1 AND 16`),
    check(
      'metrics_metadata_json_valid',
      sql`${table.metadataJson} IS NULL OR json_valid(${table.metadataJson})`,
    ),
    index('idx_metrics_area').on(table.areaId),
    index('idx_metrics_source').on(table.sourceId),
  ],
);

export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    areaId: text('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    parentGoalId: text('parent_goal_id').references((): AnySQLiteColumn => goals.id, {
      onDelete: 'restrict',
    }),
    title: text('title').notNull(),
    description: text('description'),
    horizon: text('horizon', { enum: GOAL_HORIZONS }).notNull(),
    status: text('status', { enum: GOAL_STATUSES }).notNull(),
    priority: integer('priority').notNull().default(3),
    startDate: text('start_date'),
    targetDate: text('target_date'),
    successCriteria: text('success_criteria'),
    progressMode: text('progress_mode', { enum: GOAL_PROGRESS_MODES }).notNull().default('manual'),
    manualProgress: real('manual_progress'),
    achievedAt: nullableTimestamp('achieved_at'),
    archivedAt: nullableTimestamp('archived_at'),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    metadataJson: text('metadata_json'),
    deletedAt: nullableTimestamp('deleted_at'),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('goals_area_title_unique')
      .on(table.areaId, table.title)
      .where(sql`${table.deletedAt} IS NULL`),
    check('goals_horizon', sql`${table.horizon} IN ('short','medium','long')`),
    check(
      'goals_status',
      sql`${table.status} IN ('draft','active','paused','achieved','cancelled')`,
    ),
    check('goals_priority', sql`${table.priority} BETWEEN 1 AND 5`),
    check(
      'goals_progress_mode',
      sql`${table.progressMode} IN ('manual','metrics','tasks','hybrid')`,
    ),
    check(
      'goals_manual_progress',
      sql`${table.manualProgress} IS NULL OR ${table.manualProgress} BETWEEN 0 AND 100`,
    ),
    check('goals_title_length', sql`length(${table.title}) BETWEEN 1 AND 200`),
    check(
      'goals_date_order',
      sql`${table.targetDate} IS NULL OR ${table.startDate} IS NULL OR ${table.targetDate} >= ${table.startDate}`,
    ),
    check('goals_version_positive', sql`${table.version} > 0`),
    check(
      'goals_metadata_json_valid',
      sql`${table.metadataJson} IS NULL OR json_valid(${table.metadataJson})`,
    ),
    index('idx_goals_area_status').on(table.areaId, table.status),
    index('idx_goals_parent').on(table.parentGoalId),
    index('idx_goals_target')
      .on(table.targetDate)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_goals_source').on(table.sourceId),
  ],
);

export const goalMetrics = sqliteTable(
  'goal_metrics',
  {
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    metricId: text('metric_id')
      .notNull()
      .references(() => metrics.id, { onDelete: 'restrict' }),
    baselineValue: real('baseline_value'),
    targetValue: real('target_value').notNull(),
    targetDate: text('target_date'),
    direction: text('direction', { enum: GOAL_METRIC_DIRECTIONS }).notNull(),
    weight: real('weight').notNull().default(1),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check('goal_metrics_direction', sql`${table.direction} IN ('increase','decrease','maintain')`),
    check('goal_metrics_weight_positive', sql`${table.weight} > 0`),
    index('idx_goal_metrics_metric').on(table.metricId),
  ],
);

export const courses = sqliteTable(
  'courses',
  {
    id: text('id').primaryKey(),
    areaId: text('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    provider: text('provider'),
    url: text('url'),
    status: text('status', { enum: COURSE_STATUSES }).notNull().default('planned'),
    startDate: text('start_date'),
    targetEndDate: text('target_end_date'),
    completedAt: nullableTimestamp('completed_at'),
    plannedMinutes: integer('planned_minutes'),
    notes: text('notes'),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    metadataJson: text('metadata_json'),
    deletedAt: nullableTimestamp('deleted_at'),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check(
      'courses_status',
      sql`${table.status} IN ('planned','active','paused','completed','dropped')`,
    ),
    check('courses_title_length', sql`length(${table.title}) BETWEEN 1 AND 200`),
    check(
      'courses_planned_minutes',
      sql`${table.plannedMinutes} IS NULL OR ${table.plannedMinutes} >= 0`,
    ),
    check(
      'courses_date_order',
      sql`${table.targetEndDate} IS NULL OR ${table.startDate} IS NULL OR ${table.targetEndDate} >= ${table.startDate}`,
    ),
    check('courses_version_positive', sql`${table.version} > 0`),
    check(
      'courses_metadata_json_valid',
      sql`${table.metadataJson} IS NULL OR json_valid(${table.metadataJson})`,
    ),
    index('idx_courses_area_status')
      .on(table.areaId, table.status)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_courses_source').on(table.sourceId),
  ],
);

export const studySessions = sqliteTable(
  'study_sessions',
  {
    id: text('id').primaryKey(),
    courseId: text('course_id').references(() => courses.id, { onDelete: 'set null' }),
    topic: text('topic').notNull(),
    startedAt: text('started_at').notNull(),
    localDate: text('local_date').notNull(),
    timezone: text('timezone').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    unitsCompleted: real('units_completed'),
    notes: text('notes'),
    externalRef: text('external_ref'),
    dedupeKey: text('dedupe_key'),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    metadataJson: text('metadata_json'),
    deletedAt: nullableTimestamp('deleted_at'),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    deleteOperationId: text('delete_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('study_sessions_dedupe_unique')
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} IS NOT NULL`),
    check('study_sessions_topic_length', sql`length(${table.topic}) BETWEEN 1 AND 200`),
    check('study_sessions_duration_positive', sql`${table.durationMinutes} > 0`),
    check(
      'study_sessions_units_non_negative',
      sql`${table.unitsCompleted} IS NULL OR ${table.unitsCompleted} >= 0`,
    ),
    check('study_sessions_version_positive', sql`${table.version} > 0`),
    check(
      'study_sessions_metadata_json_valid',
      sql`${table.metadataJson} IS NULL OR json_valid(${table.metadataJson})`,
    ),
    index('idx_study_date').on(table.localDate),
    index('idx_study_course').on(table.courseId),
    index('idx_study_source').on(table.sourceId),
    index('idx_study_active_date')
      .on(table.localDate, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const metricObservations = sqliteTable(
  'metric_observations',
  {
    id: text('id').primaryKey(),
    metricId: text('metric_id')
      .notNull()
      .references(() => metrics.id, { onDelete: 'restrict' }),
    observedAt: text('observed_at').notNull(),
    localDate: text('local_date').notNull(),
    timezone: text('timezone').notNull(),
    valueNum: real('value_num'),
    valueText: text('value_text'),
    sampleMarker: text('sample_marker'),
    dimensionJson: text('dimension_json'),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    sourceRef: text('source_ref'),
    dedupeKey: text('dedupe_key'),
    confidence: real('confidence'),
    algorithmVersion: text('algorithm_version'),
    supersededBy: text('superseded_by').references((): AnySQLiteColumn => metricObservations.id, {
      onDelete: 'restrict',
    }),
    courseId: text('course_id').references(() => courses.id, { onDelete: 'set null' }),
    studySessionId: text('study_session_id').references(() => studySessions.id, {
      onDelete: 'set null',
    }),
    createdOperationId: text('created_operation_id'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    uniqueIndex('metric_observations_dedupe_unique')
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} IS NOT NULL`),
    check(
      'metric_observations_single_value',
      sql`(${table.valueNum} IS NULL) <> (${table.valueText} IS NULL)`,
    ),
    check(
      'metric_observations_confidence',
      sql`${table.confidence} IS NULL OR ${table.confidence} BETWEEN 0 AND 1`,
    ),
    check(
      'metric_observations_dimension_json_valid',
      sql`${table.dimensionJson} IS NULL OR json_valid(${table.dimensionJson})`,
    ),
    check(
      'metric_observations_source_requirements',
      sql`(${table.sourceId} <> 'src_inference' OR ${table.confidence} IS NOT NULL) AND (${table.sourceId} <> 'src_calculation' OR ${table.algorithmVersion} IS NOT NULL)`,
    ),
    check(
      'metric_observations_no_self_reference',
      sql`${table.supersededBy} IS NULL OR ${table.supersededBy} <> ${table.id}`,
    ),
    index('idx_obs_metric_time').on(table.metricId, table.observedAt),
    index('idx_obs_metric_date').on(table.metricId, table.localDate),
    index('idx_obs_source').on(table.sourceId),
    index('idx_obs_superseded').on(table.supersededBy),
    index('idx_obs_session').on(table.studySessionId),
    index('idx_obs_course').on(table.courseId),
    index('idx_obs_active_metric_date')
      .on(table.metricId, table.localDate)
      .where(sql`${table.supersededBy} IS NULL`),
  ],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    areaId: text('area_id').references(() => areas.id, { onDelete: 'restrict' }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    courseId: text('course_id').references(() => courses.id, { onDelete: 'set null' }),
    studySessionId: text('study_session_id').references(() => studySessions.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    eventType: text('event_type').notNull().default('note'),
    occurredAt: text('occurred_at').notNull(),
    localDate: text('local_date').notNull(),
    timezone: text('timezone').notNull(),
    durationMinutes: integer('duration_minutes'),
    payloadJson: text('payload_json'),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    metadataJson: text('metadata_json'),
    deletedAt: nullableTimestamp('deleted_at'),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('events_title_length', sql`length(${table.title}) BETWEEN 1 AND 200`),
    check(
      'events_duration_non_negative',
      sql`${table.durationMinutes} IS NULL OR ${table.durationMinutes} >= 0`,
    ),
    check('events_version_positive', sql`${table.version} > 0`),
    check(
      'events_payload_json_valid',
      sql`${table.payloadJson} IS NULL OR json_valid(${table.payloadJson})`,
    ),
    check(
      'events_metadata_json_valid',
      sql`${table.metadataJson} IS NULL OR json_valid(${table.metadataJson})`,
    ),
    index('idx_events_date').on(table.localDate),
    index('idx_events_area_date').on(table.areaId, table.localDate),
    index('idx_events_goal').on(table.goalId),
    index('idx_events_course').on(table.courseId),
    index('idx_events_session').on(table.studySessionId),
    index('idx_events_source').on(table.sourceId),
  ],
);
