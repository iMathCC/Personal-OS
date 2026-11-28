import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { timestamp } from './common';
import { sources } from './core';

/**
 * Estado persistido de alertas derivados. O alerta em si é determinístico e não
 * é armazenado: aqui só vivem reconhecimento/dispensa e a versão otimista.
 * Nenhum texto de evidência, finança, saúde ou reflexão é persistido nesta tabela.
 */
export const intelligenceAlertStates = sqliteTable(
  'intelligence_alert_states',
  {
    id: text('id').primaryKey(),
    alertId: text('alert_id').notNull(),
    state: text('state', { enum: ['acknowledged', 'dismissed'] }).notNull(),
    ruleVersion: text('rule_version').notNull(),
    area: text('area').notNull(),
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
    uniqueIndex('uq_intelligence_alert_states_alert').on(table.alertId),
    check('intelligence_alert_states_state', sql`${table.state} IN ('acknowledged','dismissed')`),
    check(
      'intelligence_alert_states_alert_id_length',
      sql`length(${table.alertId}) BETWEEN 1 AND 120`,
    ),
    check('intelligence_alert_states_version_positive', sql`${table.version} > 0`),
    check('intelligence_alert_states_area_length', sql`length(${table.area}) BETWEEN 1 AND 80`),
    index('idx_intelligence_alert_states_area').on(table.area),
    index('idx_intelligence_alert_states_source').on(table.sourceId),
  ],
);

export type IntelligenceAlertStateRow = typeof intelligenceAlertStates.$inferSelect;
