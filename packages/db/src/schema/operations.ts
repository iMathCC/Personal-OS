import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { timestamp } from './common';

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'restore',
  'login',
  'logout',
  'export',
  'import',
  'purge',
  'setup',
  'recovery',
  'passkey_add',
  'session_revoke',
] as const;

export const AUDIT_ACTOR_TYPES = ['user', 'system', 'job', 'integration'] as const;

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    windowStart: text('window_start').notNull(),
    count: integer('count').notNull().default(0),
    expiresAt: text('expires_at').notNull(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (table) => [
    check('rate_limits_count_non_negative', sql`${table.count} >= 0`),
    check('rate_limits_window_valid', sql`${table.expiresAt} > ${table.windowStart}`),
    index('idx_rate_limits_expiry').on(table.expiresAt),
  ],
);

export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    responseJson: text('response_json'),
    subject: text('subject'),
    opId: text('op_id'),
    state: text('state').notNull().default('done'),
    attempt: integer('attempt').notNull().default(1),
    errorJson: text('error_json'),
    createdAt: timestamp('created_at'),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    check('idempotency_keys_method', sql`${table.method} IN ('GET','POST','PUT','PATCH','DELETE')`),
    check('idempotency_keys_status', sql`${table.statusCode} BETWEEN 100 AND 599`),
    check('idempotency_keys_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      'idempotency_keys_response_json_valid',
      sql`${table.responseJson} IS NULL OR json_valid(${table.responseJson})`,
    ),
    check('idempotency_keys_response_size', sql`length(${table.responseJson}) <= 65536`),
    index('idx_idempotency_expiry').on(table.expiresAt),
    index('idx_idempotency_subject').on(table.subject, table.createdAt),
    index('idx_idempotency_op').on(table.opId),
  ],
);

/**
 * Reserva permanente da identidade de uma chave idempotente. É gravada antes
 * de qualquer mutação de domínio e não pode ser alterada ou removida.
 */
export const idempotencyKeyReservations = sqliteTable(
  'idempotency_key_reservations',
  {
    key: text('key').primaryKey(),
    operationId: text('operation_id').notNull(),
    requestHash: text('request_hash').notNull(),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check('idempotency_key_reservations_op_format', sql`length(${table.operationId}) = 36`),
    check('idempotency_key_reservations_hash_format', sql`length(${table.requestHash}) = 64`),
  ],
);

/** Resultado imutável de uma operação concluída; usado pela recuperação. */
export const operationResults = sqliteTable(
  'operation_results',
  {
    key: text('key').primaryKey(),
    operationId: text('operation_id').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    bodyJson: text('body_json').notNull(),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check('operation_results_op_format', sql`length(${table.operationId}) = 36`),
    check('operation_results_hash_format', sql`length(${table.requestHash}) = 64`),
    check('operation_results_status', sql`${table.statusCode} BETWEEN 100 AND 599`),
    check('operation_results_body_json_valid', sql`json_valid(${table.bodyJson})`),
    check('operation_results_body_size', sql`length(CAST(${table.bodyJson} AS BLOB)) <= 32768`),
    index('idx_operation_results_op').on(table.operationId),
  ],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    actorType: text('actor_type', { enum: AUDIT_ACTOR_TYPES }).notNull(),
    actorId: text('actor_id'),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check(
      'audit_log_action',
      sql`${table.action} IN ('create', 'update', 'delete', 'restore', 'login', 'logout', 'export', 'import', 'purge', 'setup', 'recovery', 'passkey_add', 'session_revoke')`,
    ),
    check(
      'audit_log_actor_type',
      sql`${table.actorType} IN ('user', 'system', 'job', 'integration')`,
    ),
    check(
      'audit_log_before_json_valid',
      sql`${table.beforeJson} IS NULL OR json_valid(${table.beforeJson})`,
    ),
    check(
      'audit_log_after_json_valid',
      sql`${table.afterJson} IS NULL OR json_valid(${table.afterJson})`,
    ),
    check('audit_log_ip_hash_length', sql`${table.ipHash} IS NULL OR length(${table.ipHash}) = 64`),
    index('idx_audit_entity').on(table.entityType, table.entityId, table.createdAt),
    index('idx_audit_created').on(table.createdAt),
    index('idx_audit_request_entity').on(
      table.requestId,
      table.entityType,
      table.entityId,
      table.action,
    ),
  ],
);
