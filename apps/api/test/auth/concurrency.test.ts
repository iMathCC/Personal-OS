import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { all } from '../db/helpers';
import { bodyOf, newClient, performSetup, resetAuthDatabase } from './helpers';

beforeEach(async () => {
  await resetAuthDatabase();
});

interface LoginPayload {
  challengeId: string;
  credential: AuthenticationResponseJSON;
}

async function prepareLogin(
  client: Awaited<ReturnType<typeof newClient>>,
  authenticator: Awaited<ReturnType<typeof performSetup>>['authenticator'],
): Promise<LoginPayload> {
  const optionsResponse = await client.request('/auth/login/options', { method: 'POST', json: {} });
  expect(optionsResponse.status).toBe(200);
  const optionsBody = await bodyOf<{
    data: { challengeId: string; options: PublicKeyCredentialRequestOptionsJSON };
  }>(optionsResponse);
  return {
    challengeId: optionsBody.data.challengeId,
    credential: await authenticator.createAuthenticationResponse(optionsBody.data.options),
  };
}

describe('concorrência e atomicidade', () => {
  it('permite que apenas uma requisição consuma o mesmo challenge', async () => {
    const setup = await performSetup();
    const payload = await prepareLogin(setup.client, setup.authenticator);
    const first = await newClient('203.0.113.21');
    const second = await newClient('203.0.113.22');

    const results = await Promise.all([
      first.request('/auth/login/verify', { method: 'POST', json: payload }),
      second.request('/auth/login/verify', { method: 'POST', json: payload }),
    ]);
    const statuses = results.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 409]);

    const challenge = await all<{ consumed_at: string | null }>(
      'SELECT consumed_at FROM auth_challenges WHERE id = ?',
      payload.challengeId,
    );
    expect(challenge[0]?.consumed_at).not.toBeNull();

    const audits = await all<{ entity_id: string; after_json: string | null }>(
      "SELECT entity_id, after_json FROM audit_log WHERE entity_type = 'challenge' AND entity_id = ? AND action = 'update'",
      payload.challengeId,
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.after_json).toContain('consumed');

    const sessions = await all<{ id: string }>(
      'SELECT id FROM sessions WHERE token_hash = ?',
      await sha256Of(clientToken(results)),
    );
    expect(sessions).toHaveLength(1);
  });

  it('permite que apenas uma requisição consuma o mesmo código de recuperação', async () => {
    const setup = await performSetup();
    const code = setup.recoveryCodes[0]!;
    const first = await newClient('203.0.113.31');
    const second = await newClient('203.0.113.32');

    const results = await Promise.all([
      first.request('/auth/recovery/verify', { method: 'POST', json: { code } }),
      second.request('/auth/recovery/verify', { method: 'POST', json: { code } }),
    ]);
    const statuses = results.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 409]);

    const rows = await all<{ used_at: string | null }>(
      'SELECT used_at FROM recovery_codes WHERE used_at IS NOT NULL',
    );
    expect(rows).toHaveLength(1);

    const tokens = await all<{ id: string }>('SELECT id FROM recovery_tokens');
    expect(tokens).toHaveLength(1);

    const audits = await all<{ id: string }>(
      "SELECT id FROM audit_log WHERE entity_type = 'recovery_code' AND action = 'update'",
    );
    expect(audits).toHaveLength(1);
  });

  it('mantém no máximo 10 sessões ativas sob 14 logins concorrentes, com auditoria consistente', async () => {
    const setup = await performSetup();
    const clients = await Promise.all(
      Array.from({ length: 14 }, (_, index) => newClient(`203.0.113.${50 + index}`)),
    );

    // Preparação sequencial: o autenticador virtual incrementa o contador e
    // não é seguro compartilhá-lo entre chamadas simultâneas.
    const payloads: LoginPayload[] = [];
    for (const client of clients) {
      payloads.push(await prepareLogin(client, setup.authenticator));
    }

    const responses = await Promise.all(
      clients.map((client, index) =>
        client.request('/auth/login/verify', { method: 'POST', json: payloads[index] }),
      ),
    );
    const successes = responses.filter((response) => response.status === 200).length;
    expect(successes).toBeGreaterThan(0);

    const active = await all<{ id: string }>(
      'SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL',
      setup.userId,
    );
    expect(active.length).toBeLessThanOrEqual(10);
    expect(active.length).toBe(10);

    const sessions = await all<{ id: string; revoked_at: string | null }>(
      'SELECT id, revoked_at FROM sessions WHERE user_id = ?',
      setup.userId,
    );
    const loginAudits = await all<{ after_json: string | null }>(
      "SELECT after_json FROM audit_log WHERE action = 'login' AND actor_id = ?",
      setup.userId,
    );

    // Cada login bem-sucedido cria uma sessão e exatamente um registro de auditoria.
    expect(sessions.length - 1).toBe(loginAudits.length);
    const sessionIds = loginAudits.map((row) => parseSessionId(row.after_json));
    expect(new Set(sessionIds).size).toBe(sessionIds.length);
    expect(sessionIds.every((id) => sessions.some((session) => session.id === id))).toBe(true);

    const revokeAudits = await all<{ entity_id: string }>(
      "SELECT entity_id FROM audit_log WHERE entity_type = 'session' AND action = 'session_revoke'",
    );
    expect(
      revokeAudits.every((audit) =>
        sessions.some((session) => session.id === audit.entity_id && session.revoked_at !== null),
      ),
    ).toBe(true);
  });
});

function clientToken(results: Response[]): string {
  const winner = results.find((response) => response.status === 200);
  const cookie = winner?.headers
    .getSetCookie()
    .find((value) => value.startsWith('__Host-pos_session='));
  return cookie?.split(';')[0]?.split('=')[1] ?? '';
}

async function sha256Of(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseSessionId(afterJson: string | null): string {
  const parsed: unknown = JSON.parse(afterJson ?? '{}');
  if (typeof parsed !== 'object' || parsed === null || !('sessionId' in parsed)) {
    throw new Error('Auditoria de login sem ID de sessão.');
  }
  const sessionId = (parsed as { sessionId: unknown }).sessionId;
  if (typeof sessionId !== 'string') {
    throw new Error('Auditoria de login com ID de sessão inválido.');
  }
  return sessionId;
}
