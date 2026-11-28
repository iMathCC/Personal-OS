import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamp } from './common';
import { sources } from './core';

/**
 * Revisão semanal salva: o snapshot é imutável por conceito — atualizações
 * trocam explicitamente as reflexões e incrementam `version`, sem recalcular
 * o conteúdo apresentado na semana em que foi salva.
 */
export const weeklyReviews = sqliteTable(
  'weekly_reviews',
  {
    id: text('id').primaryKey(),
    weekStart: text('week_start').notNull(),
    weekEnd: text('week_end').notNull(),
    timezone: text('timezone').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    worked: text('worked'),
    didntWork: text('didnt_work'),
    learned: text('learned'),
    change: text('change'),
    focus: text('focus'),
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
    uniqueIndex('uq_weekly_reviews_week').on(table.weekStart),
    check('weekly_reviews_week_format', sql`length(${table.weekStart}) = 10`),
    check('weekly_reviews_week_order', sql`${table.weekEnd} >= ${table.weekStart}`),
    check('weekly_reviews_snapshot_json_valid', sql`json_valid(${table.snapshotJson})`),
    check('weekly_reviews_snapshot_size', sql`length(${table.snapshotJson}) <= 200000`),
    check('weekly_reviews_timezone_length', sql`length(${table.timezone}) BETWEEN 1 AND 80`),
    check(
      'weekly_reviews_reflection_size',
      sql`(
      (${table.worked} IS NULL OR length(${table.worked}) <= 2000) AND
      (${table.didntWork} IS NULL OR length(${table.didntWork}) <= 2000) AND
      (${table.learned} IS NULL OR length(${table.learned}) <= 2000) AND
      (${table.change} IS NULL OR length(${table.change}) <= 2000) AND
      (${table.focus} IS NULL OR length(${table.focus}) <= 2000)
    )`,
    ),
    check('weekly_reviews_version_positive', sql`${table.version} > 0`),
    index('idx_weekly_reviews_week_start').on(table.weekStart),
    index('idx_weekly_reviews_updated').on(table.updatedAt),
    index('idx_weekly_reviews_source').on(table.sourceId),
  ],
);

export type WeeklyReviewRow = typeof weeklyReviews.$inferSelect;
