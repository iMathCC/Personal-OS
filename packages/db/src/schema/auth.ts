import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { nullableTimestamp, timestamp } from './common';
import { users } from './core';

export const CHALLENGE_TYPES = ['registration', 'authentication'] as const;
export const CHALLENGE_PURPOSES = ['setup', 'login', 'recovery_register_passkey'] as const;
export const RECOVERY_TOKEN_PURPOSE = 'recovery_register_passkey';

export const passkeys = sqliteTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transportsJson: text('transports_json'),
    name: text('name').notNull(),
    createdAt: timestamp('created_at'),
    lastUsedAt: nullableTimestamp('last_used_at'),
  },
  (table) => [
    check('passkeys_counter_non_negative', sql`${table.counter} >= 0`),
    check(
      'passkeys_transports_json_valid',
      sql`${table.transportsJson} IS NULL OR json_valid(${table.transportsJson})`,
    ),
    index('idx_passkeys_user').on(table.userId),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at'),
    lastSeenAt: timestamp('last_seen_at'),
    expiresAt: text('expires_at').notNull(),
    revokedAt: nullableTimestamp('revoked_at'),
    userAgentHash: text('user_agent_hash'),
    ipHash: text('ip_hash'),
  },
  (table) => [
    check('sessions_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
    uniqueIndex('idx_sessions_token_hash').on(table.tokenHash),
    index('idx_sessions_user').on(table.userId, table.expiresAt),
    index('idx_sessions_expiry').on(table.expiresAt),
    index('idx_sessions_lru')
      .on(table.userId, table.lastSeenAt)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: nullableTimestamp('used_at'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check('recovery_codes_hash_length', sql`length(${table.codeHash}) = 64`),
    uniqueIndex('idx_recovery_codes_hash').on(table.codeHash),
    index('idx_recovery_codes_user').on(table.userId),
  ],
);

export const recoveryTokens = sqliteTable(
  'recovery_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    purpose: text('purpose').notNull().default(RECOVERY_TOKEN_PURPOSE),
    expiresAt: text('expires_at').notNull(),
    consumedAt: nullableTimestamp('consumed_at'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check('recovery_tokens_hash_length', sql`length(${table.tokenHash}) = 64`),
    check('recovery_tokens_purpose', sql`${table.purpose} = 'recovery_register_passkey'`),
    check('recovery_tokens_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
    uniqueIndex('idx_recovery_tokens_hash').on(table.tokenHash),
    index('idx_recovery_tokens_user').on(table.userId),
    index('idx_recovery_tokens_expiry').on(table.expiresAt),
  ],
);

export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: CHALLENGE_TYPES }).notNull(),
    purpose: text('purpose', { enum: CHALLENGE_PURPOSES }),
    challenge: text('challenge').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    userHandle: text('user_handle'),
    expiresAt: text('expires_at').notNull(),
    consumedAt: nullableTimestamp('consumed_at'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    check('auth_challenges_type', sql`${table.type} IN ('registration', 'authentication')`),
    check(
      'auth_challenges_purpose',
      sql`${table.purpose} IS NULL OR ${table.purpose} IN ('setup', 'login', 'recovery_register_passkey')`,
    ),
    check('auth_challenges_expiry_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
    index('idx_auth_challenges_expiry').on(table.expiresAt),
    index('idx_auth_challenges_user').on(table.userId),
  ],
);
