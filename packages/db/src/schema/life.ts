import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamp } from './common';
import { sources } from './core';

/**
 * Colunas comuns da camada de dados pessoais. Cada domínio mantém suas próprias
 * colunas tipadas: esta proveniência não substitui modelagem por área.
 */
function provenanceColumns() {
  return {
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    externalId: text('external_id'),
    originKind: text('origin_kind', {
      enum: ['observed', 'estimated', 'derived', 'imported', 'corrected'],
    })
      .notNull()
      .default('observed'),
    confidence: integer('confidence'),
    algorithmVersion: text('algorithm_version'),
    status: text('status', { enum: ['active', 'superseded', 'archived'] })
      .notNull()
      .default('active'),
    supersededBy: text('superseded_by'),
    correctsId: text('corrects_id'),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  };
}

interface ProvenanceShape {
  id: AnySQLiteColumn;
  sourceId: AnySQLiteColumn;
  externalId: AnySQLiteColumn;
  originKind: AnySQLiteColumn;
  confidence: AnySQLiteColumn;
  status: AnySQLiteColumn;
  supersededBy: AnySQLiteColumn;
  correctsId: AnySQLiteColumn;
  version: AnySQLiteColumn;
}

function provenanceChecks(name: string, table: ProvenanceShape) {
  return [
    check(
      `${name}_origin_kind`,
      sql`${table.originKind} IN ('observed','estimated','derived','imported','corrected')`,
    ),
    check(`${name}_status`, sql`${table.status} IN ('active','superseded','archived')`),
    check(
      `${name}_confidence`,
      sql`${table.confidence} IS NULL OR ${table.confidence} BETWEEN 0 AND 100`,
    ),
    check(`${name}_version_positive`, sql`${table.version} > 0`),
    check(
      `${name}_no_self_reference`,
      sql`(${table.supersededBy} IS NULL OR ${table.supersededBy} <> ${table.id}) AND (${table.correctsId} IS NULL OR ${table.correctsId} <> ${table.id})`,
    ),
  ];
}

type ProvenanceIndexes = ProvenanceShape;

function provenanceIndexes(name: string, table: ProvenanceIndexes) {
  return [
    uniqueIndex(`uq_${name}_external`)
      .on(table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    index(`idx_${name}_source`).on(table.sourceId),
    index(`idx_${name}_status`).on(table.status),
    index(`idx_${name}_superseded`).on(table.supersededBy),
    index(`idx_${name}_corrects`).on(table.correctsId),
  ];
}

export const lifeImportBatches = sqliteTable(
  'life_import_batches',
  {
    id: text('id').primaryKey(),
    domain: text('domain').notNull(),
    format: text('format', { enum: ['csv', 'json'] }).notNull(),
    fileName: text('file_name'),
    total: integer('total').notNull(),
    imported: integer('imported').notNull(),
    invalid: integer('invalid').notNull(),
    duplicates: integer('duplicates').notNull(),
    reportJson: text('report_json').notNull().default('{}'),
    sourceId: text('source_id')
      .notNull()
      .default('src_import')
      .references(() => sources.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    createdOperationId: text('created_operation_id'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check(
      'life_import_batches_domain',
      sql`${table.domain} IN ('finance_accounts','finance_categories','finance_transactions','finance_balance_items','health_metrics','health_observations','training_sessions','reading_materials','reading_sessions','reading_notes','time_entries')`,
    ),
    check('life_import_batches_format', sql`${table.format} IN ('csv','json')`),
    check(
      'life_import_batches_counts',
      sql`${table.total} >= 0 AND ${table.imported} >= 0 AND ${table.invalid} >= 0 AND ${table.duplicates} >= 0`,
    ),
    check('life_import_batches_report_json', sql`json_valid(${table.reportJson})`),
    check(
      'life_import_batches_file_name_size',
      sql`${table.fileName} IS NULL OR length(${table.fileName}) <= 120`,
    ),
    index('idx_life_import_batches_created').on(table.createdAt),
    index('idx_life_import_batches_domain').on(table.domain),
    index('idx_life_import_batches_source_id').on(table.sourceId),
  ],
);

export const financeAccounts = sqliteTable(
  'finance_accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', { enum: ['checking', 'savings', 'cash', 'investment'] }).notNull(),
    currency: text('currency').notNull().default('BRL'),
    initialBalanceCents: integer('initial_balance_cents').notNull().default(0),
    includeInPatrimony: integer('include_in_patrimony').notNull().default(1),
    ...provenanceColumns(),
  },
  (table) => [
    check('finance_accounts_name_length', sql`length(${table.name}) BETWEEN 1 AND 200`),
    check(
      'finance_accounts_type',
      sql`${table.type} IN ('checking','savings','cash','investment')`,
    ),
    check('finance_accounts_currency', sql`length(${table.currency}) = 3`),
    check('finance_accounts_patrimony_boolean', sql`${table.includeInPatrimony} IN (0,1)`),
    ...provenanceChecks('finance_accounts', table),
    ...provenanceIndexes('finance_accounts', table),
  ],
);

export const financeCategories = sqliteTable(
  'finance_categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
    ...provenanceColumns(),
  },
  (table) => [
    check('finance_categories_name_length', sql`length(${table.name}) BETWEEN 1 AND 120`),
    check('finance_categories_kind', sql`${table.kind} IN ('income','expense')`),
    ...provenanceChecks('finance_categories', table),
    ...provenanceIndexes('finance_categories', table),
  ],
);

export const financeTransactions = sqliteTable(
  'finance_transactions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => financeAccounts.id, { onDelete: 'restrict' }),
    categoryId: text('category_id').references(() => financeCategories.id, {
      onDelete: 'restrict',
    }),
    kind: text('kind', { enum: ['income', 'expense', 'transfer'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),
    date: text('date').notNull(),
    description: text('description').notNull(),
    notes: text('notes'),
    transferPairId: text('transfer_pair_id'),
    importBatchId: text('import_batch_id').references(() => lifeImportBatches.id, {
      onDelete: 'set null',
    }),
    ...provenanceColumns(),
  },
  (table) => [
    check('finance_transactions_kind', sql`${table.kind} IN ('income','expense','transfer')`),
    check('finance_transactions_amount', sql`${table.amountCents} >= 0`),
    check('finance_transactions_currency', sql`length(${table.currency}) = 3`),
    check('finance_transactions_date_format', sql`length(${table.date}) = 10`),
    check(
      'finance_transactions_description_length',
      sql`length(${table.description}) BETWEEN 1 AND 300`,
    ),
    check(
      'finance_transactions_notes_length',
      sql`${table.notes} IS NULL OR length(${table.notes}) <= 1000`,
    ),
    check(
      'finance_transactions_category_kind',
      sql`${table.kind} <> 'transfer' OR ${table.categoryId} IS NULL`,
    ),
    ...provenanceChecks('finance_transactions', table),
    ...provenanceIndexes('finance_transactions', table),
    index('idx_finance_transactions_account_date').on(table.accountId, table.date),
    index('idx_finance_transactions_date_kind').on(table.date, table.kind),
    index('idx_finance_transactions_category').on(table.categoryId),
    index('idx_finance_transactions_transfer_pair').on(table.transferPairId),
    index('idx_finance_transactions_import_batch').on(table.importBatchId),
  ],
);

export const financeBalanceItems = sqliteTable(
  'finance_balance_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['asset', 'debt'] }).notNull(),
    accountId: text('account_id').references(() => financeAccounts.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),
    date: text('date').notNull(),
    importBatchId: text('import_batch_id').references(() => lifeImportBatches.id, {
      onDelete: 'set null',
    }),
    ...provenanceColumns(),
  },
  (table) => [
    check('finance_balance_items_kind', sql`${table.kind} IN ('asset','debt')`),
    check('finance_balance_items_amount', sql`${table.amountCents} >= 0`),
    check('finance_balance_items_currency', sql`length(${table.currency}) = 3`),
    check('finance_balance_items_date_format', sql`length(${table.date}) = 10`),
    check('finance_balance_items_name_length', sql`length(${table.name}) BETWEEN 1 AND 200`),
    ...provenanceChecks('finance_balance_items', table),
    ...provenanceIndexes('finance_balance_items', table),
    index('idx_finance_balance_items_date_kind').on(table.date, table.kind),
    index('idx_finance_balance_items_account').on(table.accountId),
    index('idx_finance_balance_items_import_batch').on(table.importBatchId),
  ],
);

export const healthMetrics = sqliteTable(
  'health_metrics',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    unit: text('unit').notNull(),
    valueKind: text('value_kind', { enum: ['integer', 'scale'] })
      .notNull()
      .default('integer'),
    ...provenanceColumns(),
  },
  (table) => [
    check('health_metrics_key_length', sql`length(${table.key}) BETWEEN 1 AND 64`),
    check('health_metrics_label_length', sql`length(${table.label}) BETWEEN 1 AND 120`),
    check('health_metrics_unit_length', sql`length(${table.unit}) BETWEEN 1 AND 20`),
    check('health_metrics_value_kind', sql`${table.valueKind} IN ('integer','scale')`),
    ...provenanceChecks('health_metrics', table),
    ...provenanceIndexes('health_metrics', table),
    uniqueIndex('uq_health_metrics_key_active')
      .on(table.key)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const healthObservations = sqliteTable(
  'health_observations',
  {
    id: text('id').primaryKey(),
    metricId: text('metric_id')
      .notNull()
      .references(() => healthMetrics.id, { onDelete: 'restrict' }),
    date: text('date').notNull(),
    value: integer('value').notNull(),
    note: text('note'),
    ...provenanceColumns(),
  },
  (table) => [
    check('health_observations_date_format', sql`length(${table.date}) = 10`),
    check(
      'health_observations_note_length',
      sql`${table.note} IS NULL OR length(${table.note}) <= 1000`,
    ),
    ...provenanceChecks('health_observations', table),
    ...provenanceIndexes('health_observations', table),
    index('idx_health_observations_metric_date').on(table.metricId, table.date),
  ],
);

export const trainingSessions = sqliteTable(
  'training_sessions',
  {
    id: text('id').primaryKey(),
    activityType: text('activity_type').notNull(),
    date: text('date').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    volume: integer('volume'),
    distanceMeters: integer('distance_meters'),
    intensity: integer('intensity'),
    note: text('note'),
    ...provenanceColumns(),
  },
  (table) => [
    check('training_sessions_activity_length', sql`length(${table.activityType}) BETWEEN 1 AND 80`),
    check('training_sessions_date_format', sql`length(${table.date}) = 10`),
    check('training_sessions_duration', sql`${table.durationMinutes} BETWEEN 1 AND 1440`),
    check('training_sessions_volume', sql`${table.volume} IS NULL OR ${table.volume} >= 0`),
    check(
      'training_sessions_distance',
      sql`${table.distanceMeters} IS NULL OR ${table.distanceMeters} >= 0`,
    ),
    check(
      'training_sessions_intensity',
      sql`${table.intensity} IS NULL OR ${table.intensity} BETWEEN 1 AND 10`,
    ),
    check(
      'training_sessions_note_length',
      sql`${table.note} IS NULL OR length(${table.note}) <= 1000`,
    ),
    ...provenanceChecks('training_sessions', table),
    ...provenanceIndexes('training_sessions', table),
    index('idx_training_sessions_date_activity').on(table.date, table.activityType),
  ],
);

export const readingMaterials = sqliteTable(
  'reading_materials',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    author: text('author'),
    kind: text('kind', { enum: ['book', 'article', 'material'] })
      .notNull()
      .default('book'),
    readingStatus: text('reading_status', { enum: ['planned', 'reading', 'finished', 'paused'] })
      .notNull()
      .default('planned'),
    totalPages: integer('total_pages'),
    goalId: text('goal_id'),
    courseId: text('course_id'),
    ...provenanceColumns(),
  },
  (table) => [
    check('reading_materials_title_length', sql`length(${table.title}) BETWEEN 1 AND 300`),
    check(
      'reading_materials_author_length',
      sql`${table.author} IS NULL OR length(${table.author}) <= 200`,
    ),
    check('reading_materials_kind', sql`${table.kind} IN ('book','article','material')`),
    check(
      'reading_materials_reading_status',
      sql`${table.readingStatus} IN ('planned','reading','finished','paused')`,
    ),
    check(
      'reading_materials_pages',
      sql`${table.totalPages} IS NULL OR ${table.totalPages} BETWEEN 1 AND 20000`,
    ),
    ...provenanceChecks('reading_materials', table),
    ...provenanceIndexes('reading_materials', table),
    index('idx_reading_materials_goal').on(table.goalId),
    index('idx_reading_materials_course').on(table.courseId),
  ],
);

export const readingSessions = sqliteTable(
  'reading_sessions',
  {
    id: text('id').primaryKey(),
    materialId: text('material_id')
      .notNull()
      .references(() => readingMaterials.id, { onDelete: 'restrict' }),
    date: text('date').notNull(),
    minutes: integer('minutes'),
    pagesRead: integer('pages_read'),
    note: text('note'),
    ...provenanceColumns(),
  },
  (table) => [
    check('reading_sessions_date_format', sql`length(${table.date}) = 10`),
    check(
      'reading_sessions_minutes',
      sql`${table.minutes} IS NULL OR ${table.minutes} BETWEEN 1 AND 1440`,
    ),
    check('reading_sessions_pages', sql`${table.pagesRead} IS NULL OR ${table.pagesRead} >= 0`),
    check(
      'reading_sessions_note_length',
      sql`${table.note} IS NULL OR length(${table.note}) <= 1000`,
    ),
    ...provenanceChecks('reading_sessions', table),
    ...provenanceIndexes('reading_sessions', table),
    index('idx_reading_sessions_material_date').on(table.materialId, table.date),
  ],
);

export const readingNotes = sqliteTable(
  'reading_notes',
  {
    id: text('id').primaryKey(),
    materialId: text('material_id')
      .notNull()
      .references(() => readingMaterials.id, { onDelete: 'restrict' }),
    date: text('date').notNull(),
    kind: text('kind', { enum: ['note', 'learning'] })
      .notNull()
      .default('note'),
    content: text('content').notNull(),
    ...provenanceColumns(),
  },
  (table) => [
    check('reading_notes_date_format', sql`length(${table.date}) = 10`),
    check('reading_notes_kind', sql`${table.kind} IN ('note','learning')`),
    check('reading_notes_content_length', sql`length(${table.content}) BETWEEN 1 AND 4000`),
    ...provenanceChecks('reading_notes', table),
    ...provenanceIndexes('reading_notes', table),
    index('idx_reading_notes_material_date').on(table.materialId, table.date),
  ],
);

export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id'),
    projectId: text('project_id'),
    areaId: text('area_id'),
    date: text('date').notNull(),
    startAt: text('start_at'),
    endAt: text('end_at'),
    durationMinutes: integer('duration_minutes').notNull(),
    note: text('note'),
    importBatchId: text('import_batch_id').references(() => lifeImportBatches.id, {
      onDelete: 'set null',
    }),
    ...provenanceColumns(),
  },
  (table) => [
    check('time_entries_date_format', sql`length(${table.date}) = 10`),
    check('time_entries_duration', sql`${table.durationMinutes} BETWEEN 1 AND 1440`),
    check(
      'time_entries_interval',
      sql`(${table.startAt} IS NULL AND ${table.endAt} IS NULL) OR (${table.startAt} IS NOT NULL AND ${table.endAt} IS NOT NULL AND ${table.endAt} > ${table.startAt})`,
    ),
    check('time_entries_note_length', sql`${table.note} IS NULL OR length(${table.note}) <= 1000`),
    ...provenanceChecks('time_entries', table),
    ...provenanceIndexes('time_entries', table),
    index('idx_time_entries_date').on(table.date),
    index('idx_time_entries_project_date').on(table.projectId, table.date),
    index('idx_time_entries_task_date').on(table.taskId, table.date),
    index('idx_time_entries_area_date').on(table.areaId, table.date),
    index('idx_time_entries_start').on(table.startAt),
    index('idx_time_entries_import_batch').on(table.importBatchId),
  ],
);

export type FinanceAccountRow = typeof financeAccounts.$inferSelect;
export type FinanceCategoryRow = typeof financeCategories.$inferSelect;
export type FinanceTransactionRow = typeof financeTransactions.$inferSelect;
export type FinanceBalanceItemRow = typeof financeBalanceItems.$inferSelect;
export type HealthMetricRow = typeof healthMetrics.$inferSelect;
export type HealthObservationRow = typeof healthObservations.$inferSelect;
export type TrainingSessionRow = typeof trainingSessions.$inferSelect;
export type ReadingMaterialRow = typeof readingMaterials.$inferSelect;
export type ReadingSessionRow = typeof readingSessions.$inferSelect;
export type ReadingNoteRow = typeof readingNotes.$inferSelect;
export type TimeEntryRow = typeof timeEntries.$inferSelect;
export type LifeImportBatchRow = typeof lifeImportBatches.$inferSelect;
