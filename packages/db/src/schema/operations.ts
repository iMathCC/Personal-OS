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
  ],
);
