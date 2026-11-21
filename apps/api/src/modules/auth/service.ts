import {
  auditStatement,
  batchSql,
  consumeChallengeStatement,
  consumeRecoveryCodeStatement,
  consumeRecoveryTokenStatement,
  countPasskeys,
  findChallenge,
  findPasskey,
  findRecoveryCode,
  findRecoveryToken,
  findSessionById,
  findUser,
  guardStatement,
  insertChallengeStatement,
  insertPasskeyStatement,
  insertRecoveryCodeStatement,
  insertRecoveryTokenStatement,
  insertSessionStatement,
  insertUserStatement,
  listActiveSessions,
  listPasskeys,
  newId,
  refreshLastSeenStatement,
  revokeAllSessionsStatement,
  revokeSessionStatement,
  sessionLimitGuardStatement,
  sessionLimitSentinelStatement,
  updatePasskeyCounterStatement,
  type Database,
  type SessionRow,
} from '@personal-os/db';
import {
  assertChallengeUsable,
  assertRecoveryTokenUsable,
  assertSetupAvailable,
  classifyCounter,
  conflict,
  counterForVerification,
  counterFromAuthenticatorData,
  DomainError,
  formatRecoveryCode,
  isSessionActive,
  normalizeRecoveryCode,
  RECOVERY_CODE_BYTES,
  RECOVERY_TOKEN_BYTES,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_TOKEN_BYTES,
  selectLruRevocations,
  shouldRefreshLastSeen,
  summarizeUserAgent,
  trustedCounter,
  unauthenticated,
} from '@personal-os/domain';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { SQL } from 'drizzle-orm';
import type { Env } from '../../env';
import {
  allowedOrigins,
  base64UrlToBytes,
  bytesToBase64Url,
  createCsrfToken,
  csrfSubject,
  hashWithSalt,
  randomToken,
  sha256Hex,
} from './security';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RECOVERY_TOKEN_TTL_MS = 10 * 60 * 1000;
const GUARD_TTL_MS = 24 * 60 * 60 * 1000;
const SUPPORTED_ALGORITHMS = [-7];

export interface RequestContext {
  db: Database;
  env: Env;
  requestId: string;
  ipHash: string | null;
  userAgent: string | null;
  posVid: string;
  session: SessionRow | null;
  sessionTokenHash: string | null;
}

interface UserSnapshot {
  id: string;
  displayName: string;
  timezone: string;
  locale: string;
  currency: string;
  setupCompletedAt: string | null;
}

interface SessionSnapshot {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
  userAgent: string;
}

type Statements = SQL[];

/**
 * A violação de UNIQUE no `idempotency_keys` é o guard de uso único: significa
 * que outra requisição já consumiu challenge/código/token. Não é erro interno.
 */
async function atomicBatch(db: Database, statements: Statements): Promise<unknown[]> {
  try {
    return await batchSql(db, statements);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      throw conflict('Recurso de uso único já consumido.');
    }
    throw error;
  }
}

/** Cópia com ArrayBuffer próprio, exigida pelas APIs WebAuthn/WebCrypto. */
function fixedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.length);
  copy.set(value);
  return copy;
}

/**
 * O @simplewebauthn/server sinaliza falhas de verificação lançando exceções
 * (inclusive para origin, RP ID, UP/UV e assinatura). Todas são credenciais
 * inválidas do ponto de vista da API — nunca devem vazar como 500.
 */
async function verifyWebAuthn<T>(verify: () => Promise<T>): Promise<T> {
  try {
    return await verify();
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw unauthenticated('Falha na verificação da passkey.');
  }
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function userDto(user: UserSnapshot) {
  return {
    id: user.id,
    displayName: user.displayName,
    timezone: user.timezone,
    locale: user.locale,
    currency: user.currency,
    setupCompletedAt: user.setupCompletedAt,
  };
}

function sessionDto(
  session: SessionRow,
  userAgent: string | null,
  current = true,
): SessionSnapshot {
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    current,
    userAgent: summarizeUserAgent(userAgent),
  };
}

export class AuthService {
  constructor(private readonly ctx: RequestContext) {}

  private get db(): Database {
    return this.ctx.db;
  }

  private get now(): number {
    return Date.now();
  }

  private audit(input: Parameters<typeof auditStatement>[0], conditional = false): SQL {
    return auditStatement(
      { requestId: this.ctx.requestId, ipHash: this.ctx.ipHash, ...input },
      conditional,
    );
  }

  private guard(kind: string, target: string): SQL {
    return guardStatement(kind, target, toIso(this.now + GUARD_TTL_MS));
  }

  private async requireUser(userId?: string): Promise<UserSnapshot> {
    const user = await findUser(this.db);
    if (user == null || (userId !== undefined && user.id !== userId)) {
      throw unauthenticated('Usuário não inicializado.');
    }
    return user;
  }

  private async requireActiveSession(): Promise<SessionRow> {
    const session = this.ctx.session;
    if (session === null || !isSessionActive(session, this.now)) {
      throw unauthenticated();
    }
    return session;
  }

  async csrf(): Promise<{ csrfToken: string; posVid: string }> {
    return {
      csrfToken: await createCsrfToken(
        this.ctx.env.CSRF_SECRET,
        csrfSubject(this.ctx.sessionTokenHash, this.ctx.posVid),
      ),
      posVid: this.ctx.posVid,
    };
  }

  async setupOptions(): Promise<{
    challengeId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }> {
    assertSetupAvailable((await findUser(this.db)) ?? null);
    const userId = newId();
    const options = await generateRegistrationOptions({
      rpName: this.ctx.env.RP_NAME,
      rpID: this.ctx.env.RP_ID,
      userName: userId,
      userDisplayName: 'Personal OS',
      userID: fixedBytes(new TextEncoder().encode(userId)),
      attestationType: 'none',
      supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const challengeId = newId();
    await atomicBatch(this.db, [
      insertChallengeStatement({
        id: challengeId,
        type: 'registration',
        purpose: 'setup',
        challenge: options.challenge,
        userId: null,
        userHandle: userId,
        expiresAt: toIso(this.now + CHALLENGE_TTL_MS),
      }),
      this.audit({
        entityType: 'challenge',
        entityId: challengeId,
        action: 'create',
        actorType: 'system',
        afterJson: JSON.stringify({ purpose: 'setup' }),
      }),
    ]);
    return { challengeId, options };
  }

  async setupVerify(input: {
    challengeId: string;
    credential: RegistrationResponseJSON;
    displayName: string;
    timezone: string;
    passkeyName: string;
  }): Promise<{
    user: ReturnType<typeof userDto>;
    session: SessionSnapshot;
    recoveryCodes: string[];
    sessionToken: string;
    csrfToken: string;
  }> {
    assertSetupAvailable((await findUser(this.db)) ?? null);
    const challenge = await findChallenge(this.db, input.challengeId);
    assertChallengeUsable(challenge ?? null, 'setup', this.now);
    if (challenge!.userHandle === null) {
      throw unauthenticated('Desafio sem titular.');
    }

    const verified = await verifyWebAuthn(() =>
      verifyRegistrationResponse({
        response: input.credential,
        expectedChallenge: challenge!.challenge,
        expectedOrigin: allowedOrigins(this.ctx.env),
        expectedRPID: this.ctx.env.RP_ID,
        requireUserPresence: true,
        requireUserVerification: true,
        supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
      }),
    );
    if (!verified.verified) {
      throw unauthenticated('Falha na verificação da passkey.');
    }

    const nowIso = toIso(this.now);
    const userId = challenge!.userHandle;
    // O credential ID do WebAuthn é a chave natural da passkey: o login o
    // recebe do autenticador e precisa encontrá-la sem consulta adicional.
    const passkeyId = verified.registrationInfo.credential.id;
    const sessionToken = randomToken(SESSION_TOKEN_BYTES);
    const sessionTokenHash = await sha256Hex(sessionToken);
    const recoveryCodes = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const bytes = new Uint8Array(RECOVERY_CODE_BYTES);
        crypto.getRandomValues(bytes);
        const formatted = formatRecoveryCode(bytes);
        return { plain: formatted, hash: await sha256Hex(formatted) };
      }),
    );
    const sessionId = newId();

    await atomicBatch(this.db, [
      this.guard('setup', 'single'),
      this.guard('challenge', challenge!.id),
      consumeChallengeStatement(challenge!.id, nowIso),
      this.audit(
        {
          entityType: 'challenge',
          entityId: challenge!.id,
          action: 'update',
          actorType: 'system',
          afterJson: JSON.stringify({ consumed: true }),
        },
        true,
      ),
      insertUserStatement({
        id: userId,
        displayName: input.displayName,
        timezone: input.timezone,
        setupCompletedAt: nowIso,
      }),
      sessionLimitSentinelStatement(userId, toIso(this.now + GUARD_TTL_MS)),
      insertPasskeyStatement({
        id: passkeyId,
        userId,
        publicKey: bytesToBase64Url(verified.registrationInfo.credential.publicKey),
        counter: verified.registrationInfo.credential.counter,
        transportsJson: input.credential.response.transports
          ? JSON.stringify(input.credential.response.transports)
          : null,
        name: input.passkeyName,
        createdAt: nowIso,
      }),
      ...recoveryCodes.map((code) =>
        insertRecoveryCodeStatement({
          id: newId(),
          userId,
          codeHash: code.hash,
          createdAt: nowIso,
        }),
      ),
      insertSessionStatement({
        id: sessionId,
        userId,
        tokenHash: sessionTokenHash,
        createdAt: nowIso,
        lastSeenAt: nowIso,
        expiresAt: toIso(this.now + SESSION_ABSOLUTE_TTL_MS),
        userAgentHash: await hashWithSalt(this.ctx.userAgent, this.ctx.env.IP_HASH_SALT),
        ipHash: this.ctx.ipHash,
      }),
      this.audit({
        entityType: 'user',
        entityId: userId,
        action: 'setup',
        actorType: 'user',
        actorId: userId,
        afterJson: JSON.stringify({
          passkeyId,
          sessionId,
          recoveryCodes: recoveryCodes.length,
        }),
      }),
      this.audit({
        entityType: 'passkey',
        entityId: passkeyId,
        action: 'passkey_add',
        actorType: 'user',
        actorId: userId,
        afterJson: JSON.stringify({ name: input.passkeyName }),
      }),
    ]);

    const user = await this.requireUser(userId);
    return {
      user: userDto(user),
      session: {
        id: sessionId,
        createdAt: nowIso,
        lastSeenAt: nowIso,
        expiresAt: toIso(this.now + SESSION_ABSOLUTE_TTL_MS),
        current: true,
        userAgent: summarizeUserAgent(this.ctx.userAgent),
      },
      recoveryCodes: recoveryCodes.map((code) => code.plain),
      sessionToken,
      csrfToken: await createCsrfToken(this.ctx.env.CSRF_SECRET, `session:${sessionTokenHash}`),
    };
  }

  async loginOptions(): Promise<{
    challengeId: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }> {
    const user = await findUser(this.db);
    const passkeys = user == null ? [] : await listPasskeys(this.db, user.id);
    const options = await generateAuthenticationOptions({
      rpID: this.ctx.env.RP_ID,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transportsJson ? JSON.parse(passkey.transportsJson) : undefined,
      })),
      userVerification: 'required',
    });
    const challengeId = newId();
    await atomicBatch(this.db, [
      insertChallengeStatement({
        id: challengeId,
        type: 'authentication',
        purpose: 'login',
        challenge: options.challenge,
        userId: user?.id ?? null,
        userHandle: user?.id ?? null,
        expiresAt: toIso(this.now + CHALLENGE_TTL_MS),
      }),
      this.audit({
        entityType: 'challenge',
        entityId: challengeId,
        action: 'create',
        actorType: 'system',
        afterJson: JSON.stringify({ purpose: 'login' }),
      }),
    ]);
    return { challengeId, options };
  }

  async loginVerify(input: {
    challengeId: string;
    credential: AuthenticationResponseJSON;
  }): Promise<{
    user: ReturnType<typeof userDto>;
    session: SessionSnapshot;
    sessionToken: string;
    csrfToken: string;
  }> {
    const challenge = await findChallenge(this.db, input.challengeId);
    assertChallengeUsable(challenge ?? null, 'login', this.now);

    const credentialId = input.credential.id;
    const stored = await findPasskey(this.db, credentialId);
    if (stored === undefined || challenge!.userId === null || stored.userId !== challenge!.userId) {
      throw unauthenticated('Credencial inválida.');
    }

    const observedCounter =
      counterFromAuthenticatorData(
        fixedBytes(base64UrlToBytes(input.credential.response.authenticatorData)),
      ) ?? 0;
    const classification = classifyCounter(stored.counter, observedCounter);
    const verification = await verifyWebAuthn(() =>
      verifyAuthenticationResponse({
        response: input.credential,
        expectedChallenge: challenge!.challenge,
        expectedOrigin: allowedOrigins(this.ctx.env),
        expectedRPID: this.ctx.env.RP_ID,
        requireUserVerification: true,
        credential: {
          id: credentialId,
          publicKey: fixedBytes(base64UrlToBytes(stored.publicKey)),
          counter: counterForVerification(stored.counter, observedCounter),
        },
      }),
    );
    if (!verification.verified) {
      throw unauthenticated('Falha na verificação da passkey.');
    }

    const nowIso = toIso(this.now);
    const active = await listActiveSessions(this.db, stored.userId);
    const revocations = selectLruRevocations(active, this.now);
    const token = randomToken(SESSION_TOKEN_BYTES);
    const tokenHash = await sha256Hex(token);
    const session: SessionRow = {
      id: newId(),
      userId: stored.userId,
      tokenHash,
      createdAt: nowIso,
      lastSeenAt: nowIso,
      expiresAt: toIso(this.now + SESSION_ABSOLUTE_TTL_MS),
      revokedAt: null,
    };

    await atomicBatch(this.db, [
      this.guard('challenge', challenge!.id),
      consumeChallengeStatement(challenge!.id, nowIso),
      this.audit(
        {
          entityType: 'challenge',
          entityId: challenge!.id,
          action: 'update',
          actorType: 'system',
          afterJson: JSON.stringify({ consumed: true }),
        },
        true,
      ),
      ...revocations.map((id) => revokeSessionStatement(id, nowIso)),
      ...revocations.map((id) =>
        this.audit(
          {
            entityType: 'session',
            entityId: id,
            action: 'session_revoke',
            actorType: 'user',
            actorId: stored.userId,
            afterJson: JSON.stringify({ reason: 'lru' }),
          },
          true,
        ),
      ),
      updatePasskeyCounterStatement(
        stored.id,
        classification === 'advance' ? trustedCounter(stored.counter, observedCounter) : null,
        nowIso,
      ),
      ...(classification === 'anomaly'
        ? [
            this.audit({
              entityType: 'passkey',
              entityId: stored.id,
              action: 'update',
              actorType: 'user',
              actorId: stored.userId,
              afterJson: JSON.stringify({
                kind: 'counter_anomaly',
                stored: stored.counter,
                observed: observedCounter,
              }),
            }),
          ]
        : []),
      sessionLimitGuardStatement(stored.userId, toIso(this.now + GUARD_TTL_MS)),
      insertSessionStatement({
        id: session.id,
        userId: stored.userId,
        tokenHash,
        createdAt: nowIso,
        lastSeenAt: nowIso,
        expiresAt: session.expiresAt,
        userAgentHash: await hashWithSalt(this.ctx.userAgent, this.ctx.env.IP_HASH_SALT),
        ipHash: this.ctx.ipHash,
      }),
      this.audit({
        entityType: 'user',
        entityId: stored.userId,
        action: 'login',
        actorType: 'user',
        actorId: stored.userId,
        afterJson: JSON.stringify({ sessionId: session.id, passkeyId: stored.id }),
      }),
    ]);

    const user = await this.requireUser(stored.userId);
    return {
      user: userDto(user),
      session: sessionDto(session, this.ctx.userAgent),
      sessionToken: token,
      csrfToken: await createCsrfToken(this.ctx.env.CSRF_SECRET, `session:${tokenHash}`),
    };
  }

  async logout(): Promise<void> {
    const session = await this.requireActiveSession();
    await atomicBatch(this.db, [
      revokeSessionStatement(session.id, toIso(this.now)),
      this.audit(
        {
          entityType: 'session',
          entityId: session.id,
          action: 'logout',
          actorType: 'user',
          actorId: session.userId,
          afterJson: JSON.stringify({ scope: 'single' }),
        },
        true,
      ),
    ]);
  }

  async logoutAll(): Promise<void> {
    const session = await this.requireActiveSession();
    await atomicBatch(this.db, [
      revokeAllSessionsStatement(session.userId, toIso(this.now)),
      this.audit({
        entityType: 'user',
        entityId: session.userId,
        action: 'logout',
        actorType: 'user',
        actorId: session.userId,
        afterJson: JSON.stringify({ scope: 'all' }),
      }),
    ]);
  }

  async recoveryVerify(input: { code: string }): Promise<{
    recoveryToken: string;
    expiresAt: string;
  }> {
    const normalized = normalizeRecoveryCode(input.code);
    if (normalized === null) {
      throw new DomainError('VALIDATION_ERROR', 'Código de recuperação inválido.');
    }
    const code = await findRecoveryCode(this.db, await sha256Hex(normalized));
    if (code === undefined || code.usedAt !== null) {
      throw unauthenticated('Código de recuperação inválido.');
    }

    const nowIso = toIso(this.now);
    const bytes = new Uint8Array(RECOVERY_TOKEN_BYTES);
    crypto.getRandomValues(bytes);
    const recoveryToken = bytesToBase64Url(bytes);
    const expiresAt = toIso(this.now + RECOVERY_TOKEN_TTL_MS);

    await atomicBatch(this.db, [
      this.guard('recovery-code', code.id),
      consumeRecoveryCodeStatement(code.id, nowIso),
      this.audit(
        {
          entityType: 'recovery_code',
          entityId: code.id,
          action: 'update',
          actorType: 'system',
          actorId: code.userId,
          afterJson: JSON.stringify({ consumed: true }),
        },
        true,
      ),
      revokeAllSessionsStatement(code.userId, nowIso),
      this.audit({
        entityType: 'user',
        entityId: code.userId,
        action: 'session_revoke',
        actorType: 'system',
        actorId: code.userId,
        afterJson: JSON.stringify({ reason: 'recovery' }),
      }),
      insertRecoveryTokenStatement({
        id: newId(),
        userId: code.userId,
        tokenHash: await sha256Hex(recoveryToken),
        purpose: 'recovery_register_passkey',
        expiresAt,
      }),
      this.audit({
        entityType: 'user',
        entityId: code.userId,
        action: 'recovery',
        actorType: 'system',
        actorId: code.userId,
        afterJson: JSON.stringify({ kind: 'token_issued' }),
      }),
    ]);

    return { recoveryToken, expiresAt };
  }

  async recoveryRegisterOptions(input: { recoveryToken: string }): Promise<{
    challengeId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }> {
    const token = await this.requireRecoveryToken(input.recoveryToken);
    const user = await this.requireUser(token.userId);
    const passkeys = await listPasskeys(this.db, user.id);
    const options = await generateRegistrationOptions({
      rpName: this.ctx.env.RP_NAME,
      rpID: this.ctx.env.RP_ID,
      userName: user.id,
      userDisplayName: user.displayName,
      userID: fixedBytes(new TextEncoder().encode(user.id)),
      attestationType: 'none',
      supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
      excludeCredentials: passkeys.map((passkey) => ({ id: passkey.id })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const challengeId = newId();
    await atomicBatch(this.db, [
      insertChallengeStatement({
        id: challengeId,
        type: 'registration',
        purpose: 'recovery_register_passkey',
        challenge: options.challenge,
        userId: token.userId,
        userHandle: user.id,
        expiresAt: toIso(this.now + CHALLENGE_TTL_MS),
      }),
      this.audit({
        entityType: 'challenge',
        entityId: challengeId,
        action: 'create',
        actorType: 'system',
        actorId: user.id,
        afterJson: JSON.stringify({ purpose: 'recovery_register_passkey' }),
      }),
    ]);
    return { challengeId, options };
  }

  async recoveryRegisterVerify(input: {
    recoveryToken: string;
    challengeId: string;
    credential: RegistrationResponseJSON;
    passkeyName: string;
  }): Promise<{ registered: boolean }> {
    const token = await this.requireRecoveryToken(input.recoveryToken);
    const challenge = await findChallenge(this.db, input.challengeId);
    assertChallengeUsable(challenge ?? null, 'recovery_register_passkey', this.now);
    if (challenge!.userId !== token.userId) {
      throw unauthenticated('Desafio inválido para este token.');
    }

    const verified = await verifyWebAuthn(() =>
      verifyRegistrationResponse({
        response: input.credential,
        expectedChallenge: challenge!.challenge,
        expectedOrigin: allowedOrigins(this.ctx.env),
        expectedRPID: this.ctx.env.RP_ID,
        requireUserPresence: true,
        requireUserVerification: true,
        supportedAlgorithmIDs: SUPPORTED_ALGORITHMS,
      }),
    );
    if (!verified.verified) {
      throw unauthenticated('Falha na verificação da passkey.');
    }

    const nowIso = toIso(this.now);
    // O credential ID do WebAuthn é a chave natural da passkey: o login o
    // recebe do autenticador e precisa encontrá-la sem consulta adicional.
    const passkeyId = verified.registrationInfo.credential.id;
    await atomicBatch(this.db, [
      this.guard('recovery-token', token.id),
      consumeRecoveryTokenStatement(token.id, nowIso),
      this.audit(
        {
          entityType: 'recovery_token',
          entityId: token.id,
          action: 'update',
          actorType: 'system',
          actorId: token.userId,
          afterJson: JSON.stringify({ consumed: true }),
        },
        true,
      ),
      this.guard('challenge', challenge!.id),
      consumeChallengeStatement(challenge!.id, nowIso),
      this.audit(
        {
          entityType: 'challenge',
          entityId: challenge!.id,
          action: 'update',
          actorType: 'system',
          actorId: token.userId,
          afterJson: JSON.stringify({ consumed: true }),
        },
        true,
      ),
      insertPasskeyStatement({
        id: passkeyId,
        userId: token.userId,
        publicKey: bytesToBase64Url(verified.registrationInfo.credential.publicKey),
        counter: verified.registrationInfo.credential.counter,
        transportsJson: input.credential.response.transports
          ? JSON.stringify(input.credential.response.transports)
          : null,
        name: input.passkeyName,
        createdAt: nowIso,
      }),
      this.audit({
        entityType: 'passkey',
        entityId: passkeyId,
        action: 'passkey_add',
        actorType: 'system',
        actorId: token.userId,
        afterJson: JSON.stringify({ name: input.passkeyName, via: 'recovery' }),
      }),
      this.audit({
        entityType: 'user',
        entityId: token.userId,
        action: 'recovery',
        actorType: 'system',
        actorId: token.userId,
        afterJson: JSON.stringify({ kind: 'passkey_registered' }),
      }),
    ]);

    return { registered: true };
  }

  async me() {
    const session = await this.requireActiveSession();
    const user = await this.requireUser(session.userId);
    const [passkeys, sessions] = await Promise.all([
      countPasskeys(this.db, session.userId),
      listActiveSessions(this.db, session.userId),
    ]);
    return {
      user: userDto(user),
      counts: {
        passkeys,
        activeSessions: sessions.filter((item) => isSessionActive(item, this.now)).length,
      },
    };
  }

  async sessions(): Promise<SessionSnapshot[]> {
    const session = await this.requireActiveSession();
    const all = await listActiveSessions(this.db, session.userId);
    return all
      .filter((item) => isSessionActive(item, this.now))
      .map((item) => sessionDto(item, this.ctx.userAgent, item.id === session.id));
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = await this.requireActiveSession();
    const target = await findSessionById(this.db, sessionId);
    if (target === undefined || target.userId !== session.userId) {
      throw new DomainError('NOT_FOUND', 'Sessão não encontrada.');
    }
    await atomicBatch(this.db, [
      revokeSessionStatement(sessionId, toIso(this.now)),
      this.audit(
        {
          entityType: 'session',
          entityId: sessionId,
          action: 'session_revoke',
          actorType: 'user',
          actorId: session.userId,
          afterJson: JSON.stringify({ reason: 'user' }),
        },
        true,
      ),
    ]);
  }

  async touchSession(): Promise<void> {
    const session = this.ctx.session;
    if (session === null || !shouldRefreshLastSeen(session, this.now)) {
      return;
    }
    await atomicBatch(this.db, [refreshLastSeenStatement(session.id, toIso(this.now))]);
  }

  private async requireRecoveryToken(plain: string) {
    const token = await findRecoveryToken(this.db, await sha256Hex(plain));
    assertRecoveryTokenUsable(token ?? null, this.now);
    if (token!.purpose !== 'recovery_register_passkey') {
      throw unauthenticated('Token de recuperação inválido.');
    }
    return token!;
  }
}
