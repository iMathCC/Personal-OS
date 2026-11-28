import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nullableTimestamp, timestamp } from './common';
import { sources } from './core';
import { goals } from './domain';

export const PROJECT_STATUSES = [
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
  'archived',
] as const;
export const PLAN_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

/** Projetos são esforços finitos; vínculos com objetivos são N:N e não duplicam o projeto. */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('planned'),
    priority: text('priority', { enum: PLAN_PRIORITIES }).notNull().default('medium'),
    startDate: text('start_date'),
    targetDate: text('target_date'),
    completedAt: nullableTimestamp('completed_at'),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    deletedAt: nullableTimestamp('deleted_at'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('projects_title_length', sql`length(${table.title}) BETWEEN 1 AND 180`),
    check(
      'projects_description_length',
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`,
    ),
    check(
      'projects_status',
      sql`${table.status} IN ('planned','active','paused','completed','cancelled','archived')`,
    ),
    check('projects_priority', sql`${table.priority} IN ('low','medium','high','critical')`),
    check(
      'projects_start_date_format',
      sql`${table.startDate} IS NULL OR length(${table.startDate}) = 10`,
    ),
    check(
      'projects_target_date_format',
      sql`${table.targetDate} IS NULL OR length(${table.targetDate}) = 10`,
    ),
    check(
      'projects_date_order',
      sql`${table.targetDate} IS NULL OR ${table.startDate} IS NULL OR ${table.targetDate} >= ${table.startDate}`,
    ),
    check('projects_version_positive', sql`${table.version} > 0`),
    index('idx_projects_status_updated').on(table.status, table.updatedAt),
    index('idx_projects_priority').on(table.priority),
    index('idx_projects_target_date').on(table.targetDate),
    index('idx_projects_source').on(table.sourceId),
  ],
);

export const projectGoals = sqliteTable(
  'project_goals',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.goalId] }),
    index('idx_project_goals_goal').on(table.goalId),
    index('idx_project_goals_project').on(table.projectId),
  ],
);
