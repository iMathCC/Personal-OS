import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nullableTimestamp, timestamp } from './common';

export const SOURCE_KINDS = [
  'manual',
  'import',
  'integration',
  'inference',
  'calculation',
] as const;

export const AREA_KEYS = [
  'finance',
  'studies',
  'career',
  'reading',
  'training',
  'health',
  'activities',
  'life',
] as const;

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: timestamp('updated_at'),
});

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    locale: text('locale').notNull().default('pt-BR'),
    currency: text('currency').notNull().default('BRL'),
    weekStart: integer('week_start').notNull().default(1),
    horizonShortDays: integer('horizon_short_days').notNull().default(90),
    horizonMediumDays: integer('horizon_medium_days').notNull().default(365),
    setupCompletedAt: nullableTimestamp('setup_completed_at'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('users_week_start_range', sql`${table.weekStart} BETWEEN 0 AND 6`),
    check(
      'users_horizons_positive',
      sql`${table.horizonShortDays} > 0 AND ${table.horizonMediumDays} > 0`,
    ),
    check('users_currency_length', sql`length(${table.currency}) = 3`),
  ],
);

export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: SOURCE_KINDS }).notNull(),
    name: text('name').notNull().unique(),
    description: text('description'),
    isSystem: integer('is_system').notNull().default(0),
    configJson: text('config_json'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check(
      'sources_kind',
      sql`${table.kind} IN ('manual', 'import', 'integration', 'inference', 'calculation')`,
    ),
    check('sources_is_system_boolean', sql`${table.isSystem} IN (0, 1)`),
    check(
      'sources_config_json_valid',
      sql`${table.configJson} IS NULL OR json_valid(${table.configJson})`,
    ),
    index('idx_sources_kind').on(table.kind),
  ],
);

export const areas = sqliteTable(
  'areas',
  {
    id: text('id').primaryKey(),
    key: text('key', { enum: AREA_KEYS }).notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
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
    check(
      'areas_key',
      sql`${table.key} IN ('finance', 'studies', 'career', 'reading', 'training', 'health', 'activities', 'life')`,
    ),
    check('areas_is_active_boolean', sql`${table.isActive} IN (0, 1)`),
    check('areas_version_positive', sql`${table.version} > 0`),
    check(
      'areas_token_length',
      sql`(${table.color} IS NULL OR length(${table.color}) <= 32) AND (${table.icon} IS NULL OR length(${table.icon}) <= 32)`,
    ),
    check(
      'areas_metadata_json_valid',
      sql`${table.metadataJson} IS NULL OR json_valid(${table.metadataJson})`,
    ),
    index('idx_areas_active')
      .on(table.sortOrder)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_areas_source').on(table.sourceId),
  ],
);
