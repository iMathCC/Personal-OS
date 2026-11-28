import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nullableTimestamp, timestamp } from './common';
import { sources } from './core';
import { projects } from './projects';

export const PROJECT_MILESTONE_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
] as const;

/** Marco pertence a um projeto; exclusão do projeto remove seus marcos. */
export const projectMilestones = sqliteTable(
  'project_milestones',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    dueDate: text('due_date'),
    status: text('status', { enum: PROJECT_MILESTONE_STATUSES }).notNull().default('pending'),
    position: integer('position').notNull().default(0),
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
    check('project_milestones_title_length', sql`length(${table.title}) BETWEEN 1 AND 180`),
    check(
      'project_milestones_due_date_format',
      sql`${table.dueDate} IS NULL OR length(${table.dueDate}) = 10`,
    ),
    check(
      'project_milestones_status',
      sql`${table.status} IN ('pending','in_progress','completed','cancelled')`,
    ),
    check('project_milestones_position_non_negative', sql`${table.position} >= 0`),
    check('project_milestones_version_positive', sql`${table.version} > 0`),
    check(
      'project_milestones_completed_consistency',
      sql`(${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL) OR (${table.status} <> 'completed' AND ${table.completedAt} IS NULL)`,
    ),
    index('idx_project_milestones_project_position').on(table.projectId, table.position),
    index('idx_project_milestones_due').on(table.dueDate),
    index('idx_project_milestones_source').on(table.sourceId),
  ],
);
