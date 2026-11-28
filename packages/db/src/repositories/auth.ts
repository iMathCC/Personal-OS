import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client';
import {
  authChallenges,
  passkeys,
  rateLimits,
  recoveryCodes,
  recoveryTokens,
  sessions,
  users,
} from '../schema';
import { MAX_ACTIVE_SESSIONS, type RateLimitState } from '@personal-os/domain';
import { sanitizeAuditJson } from './audit';

export interface UserRow {
  id: string;
  displayName: string;
  timezone: string;
  locale: string;
  currency: string;
  setupCompletedAt: string | null;
}

export interface ChallengeRow {
  id: string;
  type: 'registration' | 'authentication';
  purpose: 'setup' | 'login' | 'recovery_register_passkey' | null;
  challenge: string;
  userId: string | null;
  userHandle: string | null;
  expiresAt: string;
  consumedAt: string | null;
}

export interface PasskeyRow {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transportsJson: string | null;
  name: string;
  lastUsedAt: string | null;
}

export interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface RecoveryCodeRow {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: string | null;
}

export interface RecoveryTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface AuditInput {
  entityType: string;
  entityId: string;
  action:
    | 'create'
    | 'update'
    | 'delete'
    | 'login'
    | 'logout'
    | 'setup'
    | 'recovery'
    | 'passkey_add'
    | 'session_revoke';
  actorType: 'user' | 'system';
  actorId?: string | null;
  beforeJson?: string | null;
  afterJson?: string | null;
  requestId?: string | null;
  ipHash?: string | null;
}

export function findUser(db: Database): Promise<UserRow | undefined> {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      timezone: users.timezone,
      locale: users.locale,
      currency: users.currency,
      setupCompletedAt: users.setupCompletedAt,
    })
    .from(users)
    .limit(1)
    .then((rows) => rows[0]);
}

export function findChallenge(db: Database, id: string): Promise<ChallengeRow | undefined> {
  return db
    .select({
      id: authChallenges.id,
      type: authChallenges.type,
      purpose: authChallenges.purpose,
      challenge: authChallenges.challenge,
      userId: authChallenges.userId,
      userHandle: authChallenges.userHandle,
      expiresAt: authChallenges.expiresAt,
      consumedAt: authChallenges.consumedAt,
    })
    .from(authChallenges)
    .where(sql`${authChallenges.id} = ${id}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function findPasskey(db: Database, id: string): Promise<PasskeyRow | undefined> {
  return db
    .select({
      id: passkeys.id,
      userId: passkeys.userId,
      publicKey: passkeys.publicKey,
      counter: passkeys.counter,
      transportsJson: passkeys.transportsJson,
      name: passkeys.name,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(sql`${passkeys.id} = ${id}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function listPasskeys(db: Database, userId: string): Promise<PasskeyRow[]> {
  return db
    .select({
      id: passkeys.id,
      userId: passkeys.userId,
      publicKey: passkeys.publicKey,
      counter: passkeys.counter,
      transportsJson: passkeys.transportsJson,
      name: passkeys.name,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(sql`${passkeys.userId} = ${userId}`);
}

export function findSessionByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<SessionRow | undefined> {
  return db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      tokenHash: sessions.tokenHash,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(sql`${sessions.tokenHash} = ${tokenHash}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function findSessionById(db: Database, id: string): Promise<SessionRow | undefined> {
  return db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      tokenHash: sessions.tokenHash,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(sql`${sessions.id} = ${id}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function listActiveSessions(db: Database, userId: string): Promise<SessionRow[]> {
  return db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      tokenHash: sessions.tokenHash,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(sql`${sessions.userId} = ${userId} AND ${sessions.revokedAt} IS NULL`);
}

export function findRecoveryCode(
  db: Database,
  codeHash: string,
): Promise<RecoveryCodeRow | undefined> {
  return db
    .select({
      id: recoveryCodes.id,
      userId: recoveryCodes.userId,
      codeHash: recoveryCodes.codeHash,
      usedAt: recoveryCodes.usedAt,
    })
    .from(recoveryCodes)
    .where(sql`${recoveryCodes.codeHash} = ${codeHash}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export function findRecoveryToken(
  db: Database,
  tokenHash: string,
): Promise<RecoveryTokenRow | undefined> {
  return db
    .select({
      id: recoveryTokens.id,
      userId: recoveryTokens.userId,
      tokenHash: recoveryTokens.tokenHash,
      purpose: recoveryTokens.purpose,
      expiresAt: recoveryTokens.expiresAt,
      consumedAt: recoveryTokens.consumedAt,
    })
    .from(recoveryTokens)
    .where(sql`${recoveryTokens.tokenHash} = ${tokenHash}`)
    .limit(1)
    .then((rows) => rows[0]);
}

export async function countPasskeys(db: Database, userId: string): Promise<number> {
  const rows = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(sql`${passkeys.userId} = ${userId}`);
  return rows.length;
}

export function guardStatement(kind: string, target: string, expiresAt: string): SQL {
  // UNIQUE em `idempotency_keys.key` é o guard: uma segunda tentativa de
  // consumir o mesmo recurso aborta o batch inteiro, sem efeitos colaterais.
  return sql`INSERT INTO idempotency_keys
    (key, method, path, request_hash, status_code, expires_at)
    VALUES (${`guard:${kind}:${target}`}, 'POST', '/internal/guard', ${target}, 200, ${expiresAt})`;
}

const SESSION_LIMIT_KEY = 'guard:session-limit:';

/**
 * A linha sentinela existe desde o setup. O guard abaixo tenta inseri-la com a
 * mesma chave quando não há slot livre; a violação de PK aborta o batch e
 * impede que requisições concorrentes ultrapassem `MAX_ACTIVE_SESSIONS`.
 */
export function sessionLimitSentinelStatement(userId: string, expiresAt: string): SQL {
  return sql`INSERT INTO idempotency_keys
    (key, method, path, request_hash, status_code, expires_at)
    VALUES (${`${SESSION_LIMIT_KEY}${userId}`}, 'POST', '/internal/guard', ${userId}, 200, ${expiresAt})`;
}

export function sessionLimitGuardStatement(userId: string, expiresAt: string): SQL {
  return sql`INSERT INTO idempotency_keys
    (key, method, path, request_hash, status_code, expires_at)
    SELECT ${`${SESSION_LIMIT_KEY}${userId}`}, 'POST', '/internal/guard', ${userId}, 200, ${expiresAt}
    WHERE (SELECT COUNT(*) FROM sessions WHERE user_id = ${userId} AND revoked_at IS NULL) >= ${MAX_ACTIVE_SESSIONS}`;
}

export function auditStatement(input: AuditInput, conditional = false): SQL {
  const values = [
    input.entityType,
    input.entityId,
    input.action,
    input.actorType,
    input.actorId ?? null,
    sanitizeAuditJson(input.beforeJson),
    sanitizeAuditJson(input.afterJson),
    input.requestId ?? null,
    input.ipHash ?? null,
  ] as const;

  if (conditional) {
    return sql`INSERT INTO audit_log
      (entity_type, entity_id, action, actor_type, actor_id, before_json, after_json, request_id, ip_hash)
      SELECT ${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]}
      WHERE changes() = 1`;
  }

  return sql`INSERT INTO audit_log
    (entity_type, entity_id, action, actor_type, actor_id, before_json, after_json, request_id, ip_hash)
    VALUES (${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]})`;
}

export function insertChallengeStatement(input: {
  id: string;
  type: 'registration' | 'authentication';
  purpose: 'setup' | 'login' | 'recovery_register_passkey';
  challenge: string;
  userId: string | null;
  userHandle: string | null;
  expiresAt: string;
}): SQL {
  return sql`INSERT INTO auth_challenges
    (id, type, purpose, challenge, user_id, user_handle, expires_at)
    VALUES (${input.id}, ${input.type}, ${input.purpose}, ${input.challenge}, ${input.userId}, ${input.userHandle}, ${input.expiresAt})`;
}

export function consumeChallengeStatement(id: string, consumedAt: string): SQL {
  return sql`UPDATE auth_challenges SET consumed_at = ${consumedAt}
    WHERE id = ${id} AND consumed_at IS NULL`;
}

export function insertPasskeyStatement(input: {
  id: string;
  userId: string;
  publicKey: string;
  counter: number;
  transportsJson: string | null;
  name: string;
  createdAt: string;
}): SQL {
  return sql`INSERT INTO passkeys
    (id, user_id, public_key, counter, transports_json, name, created_at)
    VALUES (${input.id}, ${input.userId}, ${input.publicKey}, ${input.counter}, ${input.transportsJson}, ${input.name}, ${input.createdAt})`;
}

export function updatePasskeyCounterStatement(
  id: string,
  counter: number | null,
  lastUsedAt: string,
): SQL {
  return sql`UPDATE passkeys SET counter = ${counter === null ? sql`counter` : counter}, last_used_at = ${lastUsedAt}
    WHERE id = ${id}`;
}

export function insertSessionStatement(input: {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgentHash: string | null;
  ipHash: string | null;
}): SQL {
  return sql`INSERT INTO sessions
    (id, user_id, token_hash, created_at, last_seen_at, expires_at, user_agent_hash, ip_hash)
    VALUES (${input.id}, ${input.userId}, ${input.tokenHash}, ${input.createdAt}, ${input.lastSeenAt}, ${input.expiresAt}, ${input.userAgentHash}, ${input.ipHash})`;
}

export function revokeSessionStatement(id: string, revokedAt: string): SQL {
  return sql`UPDATE sessions SET revoked_at = ${revokedAt}
    WHERE id = ${id} AND revoked_at IS NULL`;
}

export function revokeAllSessionsStatement(userId: string, revokedAt: string): SQL {
  return sql`UPDATE sessions SET revoked_at = ${revokedAt}
    WHERE user_id = ${userId} AND revoked_at IS NULL`;
}

export function refreshLastSeenStatement(id: string, lastSeenAt: string): SQL {
  return sql`UPDATE sessions SET last_seen_at = ${lastSeenAt}
    WHERE id = ${id} AND revoked_at IS NULL`;
}

export function insertRecoveryCodeStatement(input: {
  id: string;
  userId: string;
  codeHash: string;
  createdAt: string;
}): SQL {
  return sql`INSERT INTO recovery_codes (id, user_id, code_hash, created_at)
    VALUES (${input.id}, ${input.userId}, ${input.codeHash}, ${input.createdAt})`;
}

export function consumeRecoveryCodeStatement(id: string, usedAt: string): SQL {
  return sql`UPDATE recovery_codes SET used_at = ${usedAt}
    WHERE id = ${id} AND used_at IS NULL`;
}

export function insertRecoveryTokenStatement(input: {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: string;
  expiresAt: string;
}): SQL {
  return sql`INSERT INTO recovery_tokens (id, user_id, token_hash, purpose, expires_at)
    VALUES (${input.id}, ${input.userId}, ${input.tokenHash}, ${input.purpose}, ${input.expiresAt})`;
}

export function consumeRecoveryTokenStatement(id: string, consumedAt: string): SQL {
  return sql`UPDATE recovery_tokens SET consumed_at = ${consumedAt}
    WHERE id = ${id} AND consumed_at IS NULL`;
}

export function insertUserStatement(input: {
  id: string;
  displayName: string;
  timezone: string;
  setupCompletedAt: string;
}): SQL {
  return sql`INSERT INTO users (id, display_name, timezone, setup_completed_at, created_at, updated_at)
    VALUES (${input.id}, ${input.displayName}, ${input.timezone}, ${input.setupCompletedAt}, ${input.setupCompletedAt}, ${input.setupCompletedAt})`;
}

export function completeUserSetupStatement(input: {
  id: string;
  displayName: string;
  timezone: string;
  setupCompletedAt: string;
}): SQL {
  return sql`UPDATE users SET display_name = ${input.displayName}, timezone = ${input.timezone},
    setup_completed_at = ${input.setupCompletedAt}, updated_at = ${input.setupCompletedAt}
    WHERE id = ${input.id} AND setup_completed_at IS NULL`;
}

export interface RateLimitRow {
  count: number;
  windowStart: number;
}

async function readCounter(db: Database, key: string): Promise<RateLimitRow | null> {
  const rows = await db
    .select({
      count: rateLimits.count,
      windowStart: rateLimits.windowStart,
    })
    .from(rateLimits)
    .where(sql`${rateLimits.key} = ${key}`)
    .limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return { count: row.count, windowStart: Date.parse(row.windowStart) };
}

/**
 * O schema não possui coluna de falhas: contagem e falhas vivem em duas chaves
 * (`<key>` e `failure:<key>`) na mesma janela, evitando nova migração.
 */
export async function readRateLimitState(
  db: Database,
  key: string,
): Promise<RateLimitState | null> {
  const [requests, failures] = await Promise.all([
    readCounter(db, key),
    readCounter(db, `failure:${key}`),
  ]);
  if (requests === null && failures === null) {
    return null;
  }
  return {
    count: requests?.count ?? 0,
    failures: failures?.count ?? 0,
    windowStart: requests?.windowStart ?? failures?.windowStart ?? 0,
  };
}

/**
 * Reserva uma fatia do limite em uma única instrução atômica.
 *
 * Um `read` seguido de `write` permite que requisições concorrentes leiam o
 * mesmo contador e todas passem. Aqui o `UPDATE` só incrementa quando a janela
 * atual ainda tem capacidade; zero linhas retornadas significa 429.
 */
export async function claimRateLimitSlot(
  db: Database,
  input: {
    key: string;
    failureKey: string;
    windowStart: string;
    expiresAt: string;
    limit: number;
    failureLimit: number | null;
  },
): Promise<boolean> {
  const failureLimit = input.failureLimit ?? Number.MAX_SAFE_INTEGER;
  const rows = await db.all(sql`
    INSERT INTO rate_limits (key, window_start, count, expires_at, updated_at)
    VALUES (${input.key}, ${input.windowStart}, 1, ${input.expiresAt}, ${input.windowStart})
    ON CONFLICT(key) DO UPDATE SET
      window_start = excluded.window_start,
      count = CASE
        WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1
        ELSE 1
      END,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
    WHERE (
      rate_limits.window_start = excluded.window_start AND rate_limits.count < ${input.limit}
      OR rate_limits.window_start <> excluded.window_start
    )
    AND COALESCE(
      (
        SELECT count FROM rate_limits
        WHERE key = ${input.failureKey} AND window_start = ${input.windowStart}
      ),
      0
    ) < ${failureLimit}
    RETURNING count
  `);
  return rows.length > 0;
}

/** Incrementa falhas somente após a resposta, sem zerar o contador de requisições. */
export async function recordRateLimitFailure(
  db: Database,
  input: { key: string; windowStart: string; expiresAt: string },
): Promise<void> {
  await db.all(sql`
    INSERT INTO rate_limits (key, window_start, count, expires_at, updated_at)
    VALUES (${input.key}, ${input.windowStart}, 1, ${input.expiresAt}, ${input.windowStart})
    ON CONFLICT(key) DO UPDATE SET
      window_start = excluded.window_start,
      count = CASE
        WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1
        ELSE 1
      END,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `);
}

export async function cleanupExpiredRateLimits(db: Database, now: string): Promise<void> {
  await db.delete(rateLimits).where(sql`${rateLimits.expiresAt} < ${now}`);
}
