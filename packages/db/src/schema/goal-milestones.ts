import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nullableTimestamp, timestamp } from './common';
import { sources } from './core';
import { goals } from './domain';

export const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

/** Marcos são etapas observáveis de um objetivo; não são um sistema de tarefas. */
export const goalMilestones = sqliteTable(
  'goal_milestones',
  {
    id: text('id').primaryKey(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: text('due_date'),
    status: text('status', { enum: MILESTONE_STATUSES }).notNull().default('pending'),
    completedAt: nullableTimestamp('completed_at'),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    deletedAt: nullableTimestamp('deleted_at'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check(
      'goal_milestones_status',
      sql`${table.status} IN ('pending','in_progress','completed','cancelled')`,
    ),
    check('goal_milestones_title_length', sql`length(${table.title}) BETWEEN 1 AND 200`),
    check(
      'goal_milestones_due_date_format',
      sql`${table.dueDate} IS NULL OR length(${table.dueDate}) = 10`,
    ),
    check('goal_milestones_version_positive', sql`${table.version} > 0`),
    check(
      'goal_milestones_completed_consistency',
      sql`(${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL) OR (${table.status} <> 'completed' AND ${table.completedAt} IS NULL)`,
    ),
    index('idx_goal_milestones_goal').on(table.goalId, table.status),
    index('idx_goal_milestones_due').on(table.dueDate),
    index('idx_goal_milestones_source').on(table.sourceId),
  ],
);
