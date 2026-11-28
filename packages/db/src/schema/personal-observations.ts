import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nullableTimestamp, timestamp } from './common';
import { courses, goals, studySessions } from './domain';
import { projects } from './projects';
import { tasks } from './tasks';
import { sources } from './core';

export const PERSONAL_OBSERVATION_KINDS = [
  'intention',
  'planning',
  'executed',
  'observed_result',
  'confirmed_result',
  'inference',
] as const;
export type PersonalObservationKind = (typeof PERSONAL_OBSERVATION_KINDS)[number];

export const PERSONAL_OBSERVATION_STATUSES = ['active', 'superseded', 'archived'] as const;
export type PersonalObservationStatus = (typeof PERSONAL_OBSERVATION_STATUSES)[number];

/**
 * Observações pessoais reais registradas pelo usuário. Distingue fato observado,
 * resultado confirmado e inferência; nunca transforma intenção/planejamento em resultado.
 */
export const personalObservations = sqliteTable(
  'personal_observations',
  {
    id: text('id').primaryKey(),
    areaId: text('area_id'),
    kind: text('kind', { enum: PERSONAL_OBSERVATION_KINDS }).notNull(),
    title: text('title').notNull(),
    content: text('content'),
    observedAt: text('observed_at').notNull(),
    localDate: text('local_date').notNull(),
    timezone: text('timezone').notNull(),
    valueNum: real('value_num'),
    valueText: text('value_text'),
    unit: text('unit'),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    confidence: real('confidence'),
    algorithmVersion: text('algorithm_version'),
    evidenceJson: text('evidence_json'),
    relatedTaskId: text('related_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    relatedProjectId: text('related_project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    relatedGoalId: text('related_goal_id').references(() => goals.id, { onDelete: 'set null' }),
    relatedStudySessionId: text('related_study_session_id').references(() => studySessions.id, {
      onDelete: 'set null',
    }),
    relatedCourseId: text('related_course_id').references(() => courses.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: PERSONAL_OBSERVATION_STATUSES }).notNull().default('active'),
    supersededBy: text('superseded_by').references((): AnySQLiteColumn => personalObservations.id, {
      onDelete: 'restrict',
    }),
    correctsId: text('corrects_id').references((): AnySQLiteColumn => personalObservations.id, {
      onDelete: 'restrict',
    }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    deleteOperationId: text('delete_operation_id'),
    deletedAt: nullableTimestamp('deleted_at'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check(
      'personal_obs_kind',
      sql`${table.kind} IN ('intention','planning','executed','observed_result','confirmed_result','inference')`,
    ),
    check('personal_obs_title_length', sql`length(${table.title}) BETWEEN 1 AND 200`),
    check(
      'personal_obs_content_length',
      sql`${table.content} IS NULL OR length(${table.content}) <= 5000`,
    ),
    check(
      'personal_obs_value_text_length',
      sql`${table.valueText} IS NULL OR length(${table.valueText}) <= 500`,
    ),
    check('personal_obs_unit_length', sql`${table.unit} IS NULL OR length(${table.unit}) <= 32`),
    check(
      'personal_obs_confidence',
      sql`${table.confidence} IS NULL OR ${table.confidence} BETWEEN 0 AND 1`,
    ),
    check(
      'personal_obs_inference_confidence',
      sql`${table.kind} <> 'inference' OR ${table.confidence} IS NOT NULL`,
    ),
    check(
      'personal_obs_source_requirements',
      sql`(${table.sourceId} <> 'src_inference' OR ${table.confidence} IS NOT NULL) AND (${table.sourceId} <> 'src_calculation' OR ${table.algorithmVersion} IS NOT NULL)`,
    ),
    check(
      'personal_obs_evidence_json_valid',
      sql`${table.evidenceJson} IS NULL OR json_valid(${table.evidenceJson})`,
    ),
    check('personal_obs_status', sql`${table.status} IN ('active','superseded','archived')`),
    check(
      'personal_obs_no_self_supersede',
      sql`${table.supersededBy} IS NULL OR ${table.supersededBy} <> ${table.id}`,
    ),
    check(
      'personal_obs_no_self_correct',
      sql`${table.correctsId} IS NULL OR ${table.correctsId} <> ${table.id}`,
    ),
    check('personal_obs_version_positive', sql`${table.version} > 0`),
    check('personal_obs_local_date_format', sql`length(${table.localDate}) = 10`),
    index('idx_personal_obs_date').on(table.localDate),
    index('idx_personal_obs_area_date').on(table.areaId, table.localDate),
    index('idx_personal_obs_kind_date').on(table.kind, table.localDate),
    index('idx_personal_obs_status_date').on(table.status, table.localDate),
    index('idx_personal_obs_source').on(table.sourceId),
    index('idx_personal_obs_superseded').on(table.supersededBy),
    index('idx_personal_obs_corrects').on(table.correctsId),
    index('idx_personal_obs_task').on(table.relatedTaskId),
    index('idx_personal_obs_project').on(table.relatedProjectId),
    index('idx_personal_obs_goal').on(table.relatedGoalId),
    index('idx_personal_obs_study_session').on(table.relatedStudySessionId),
  ],
);
