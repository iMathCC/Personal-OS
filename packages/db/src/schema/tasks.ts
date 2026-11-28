import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nullableTimestamp, timestamp } from './common';
import { sources } from './core';
import { goals } from './domain';
import { projectMilestones } from './project-milestones';
import { PLAN_PRIORITIES, projects } from './projects';

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'completed', 'cancelled'] as const;

/** Tarefas podem existir sem projeto; vínculos opcionais usam ON DELETE SET NULL. */
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    milestoneId: text('milestone_id').references(() => projectMilestones.id, {
      onDelete: 'set null',
    }),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('todo'),
    priority: text('priority', { enum: PLAN_PRIORITIES }).notNull().default('medium'),
    dueDate: text('due_date'),
    estimateMinutes: integer('estimate_minutes'),
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
    check('tasks_title_length', sql`length(${table.title}) BETWEEN 1 AND 180`),
    check(
      'tasks_description_length',
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`,
    ),
    check(
      'tasks_status',
      sql`${table.status} IN ('todo','in_progress','blocked','completed','cancelled')`,
    ),
    check('tasks_priority', sql`${table.priority} IN ('low','medium','high','critical')`),
    check('tasks_due_date_format', sql`${table.dueDate} IS NULL OR length(${table.dueDate}) = 10`),
    check(
      'tasks_estimate_minutes',
      sql`${table.estimateMinutes} IS NULL OR (${table.estimateMinutes} >= 0 AND ${table.estimateMinutes} <= 100000)`,
    ),
    check('tasks_version_positive', sql`${table.version} > 0`),
    check(
      'tasks_completed_consistency',
      sql`(${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL) OR (${table.status} <> 'completed' AND ${table.completedAt} IS NULL)`,
    ),
    index('idx_tasks_project_status').on(table.projectId, table.status),
    index('idx_tasks_goal').on(table.goalId),
    index('idx_tasks_milestone').on(table.milestoneId),
    index('idx_tasks_due').on(table.dueDate),
    index('idx_tasks_status_priority').on(table.status, table.priority),
    index('idx_tasks_updated').on(table.updatedAt),
    index('idx_tasks_source').on(table.sourceId),
  ],
);

/** Aresta direcionada: task depende de depends_on_task; self-loop é bloqueado no banco. */
export const taskDependencies = sqliteTable(
  'task_dependencies',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: text('depends_on_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    check('task_dependencies_no_self', sql`${table.taskId} <> ${table.dependsOnTaskId}`),
    index('idx_task_dependencies_task').on(table.taskId),
    index('idx_task_dependencies_depends_on').on(table.dependsOnTaskId),
  ],
);
