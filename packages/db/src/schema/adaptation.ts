import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamp } from './common';
import { sources } from './core';

/**
 * Decisões explícitas do usuário sobre propostas de adaptação. As propostas
 * são derivadas deterministicamente; aqui persiste apenas a decisão humana,
 * metadados mínimos e um snapshot allowlisted para histórico/auditoria.
 * Nenhuma recomendação é executada automaticamente.
 */
export const adaptationDecisions = sqliteTable(
  'adaptation_decisions',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id').notNull(),
    action: text('action', { enum: ['accept', 'reject', 'defer'] }).notNull(),
    status: text('status', { enum: ['accepted', 'rejected', 'deferred'] }).notNull(),
    note: text('note'),
    proposalKind: text('proposal_kind').notNull(),
    proposalTitle: text('proposal_title').notNull(),
    severity: text('severity', { enum: ['info', 'attention', 'risk', 'critical'] }).notNull(),
    confidence: text('confidence', { enum: ['low', 'medium', 'high'] }).notNull(),
    periodFrom: text('period_from').notNull(),
    periodTo: text('period_to').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    proposalSnapshotJson: text('proposal_snapshot_json').notNull(),
    version: integer('version').notNull().default(1),
    sourceId: text('source_id')
      .notNull()
      .default('src_manual')
      .references(() => sources.id, { onDelete: 'restrict' }),
    createdOperationId: text('created_operation_id'),
    updatedOperationId: text('updated_operation_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    uniqueIndex('uq_adaptation_decisions_proposal').on(table.proposalId),
    check('adaptation_decisions_action', sql`${table.action} IN ('accept','reject','defer')`),
    check(
      'adaptation_decisions_status',
      sql`${table.status} IN ('accepted','rejected','deferred')`,
    ),
    check(
      'adaptation_decisions_severity',
      sql`${table.severity} IN ('info','attention','risk','critical')`,
    ),
    check('adaptation_decisions_confidence', sql`${table.confidence} IN ('low','medium','high')`),
    check('adaptation_decisions_version_positive', sql`${table.version} > 0`),
    check(
      'adaptation_decisions_proposal_id_length',
      sql`length(${table.proposalId}) BETWEEN 1 AND 120`,
    ),
    check(
      'adaptation_decisions_note_length',
      sql`${table.note} IS NULL OR length(${table.note}) <= 1000`,
    ),
    check('adaptation_decisions_snapshot_json', sql`json_valid(${table.proposalSnapshotJson})`),
    check(
      'adaptation_decisions_snapshot_size',
      sql`length(${table.proposalSnapshotJson}) <= 50000`,
    ),
    check(
      'adaptation_decisions_period_format',
      sql`length(${table.periodFrom}) = 10 AND length(${table.periodTo}) = 10`,
    ),
    index('idx_adaptation_decisions_created').on(table.createdAt),
    index('idx_adaptation_decisions_status').on(table.status),
    index('idx_adaptation_decisions_source').on(table.sourceId),
  ],
);

export type AdaptationDecisionRow = typeof adaptationDecisions.$inferSelect;
