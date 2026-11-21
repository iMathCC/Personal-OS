import { beforeEach, describe, expect, it } from 'vitest';
import { VirtualAuthenticator } from '../spike/virtual-authenticator';
import {
  auditRows,
  bodyOf,
  loginWith,
  newClient,
  ORIGIN,
  registerWithRecovery,
  resetAuthDatabase,
  RP_ID,
  SETUP_TOKEN,
} from './helpers';

/**
 * E2E em nível de Worker: todas as requisições passam pelo Hono real, pelo D1
 * real e pelo autenticador virtual (WebAuthn assinado), sem mocks de serviço.
 * O teste cobre a jornada completa de uma conta, do setup à recuperação.
 */
beforeEach(async () => {
  await resetAuthDatabase();
});

describe('jornada completa com autenticador virtual', () => {
  it('faz setup, login, revoga sessão, encerra todas, recupera e volta a entrar', async () => {
    const client = await newClient();
    const firstAuthenticator = await VirtualAuthenticator.create({ rpId: RP_ID, origin: ORIGIN });

    const optionsResponse = await client.request('/auth/setup/options', {
      method: 'POST',
      json: {},
      headers: { 'X-Setup-Token': SETUP_TOKEN },
    });
    expect(optionsResponse.status).toBe(200);
    const options = await bodyOf<{
      data: { challengeId: string; options: { rp: { id?: string } } };
    }>(optionsResponse);
    expect(options.data.options.rp.id).toBe(RP_ID);

    const credential = await firstAuthenticator.createRegistrationResponse(
      options.data.options as never,
    );
    const setupResponse = await client.request('/auth/setup/verify', {
      method: 'POST',
      json: {
        challengeId: options.data.challengeId,
        credential,
        displayName: 'Ana',
        timezone: 'America/Sao_Paulo',
        passkeyName: 'Passkey do notebook',
      },
      headers: { 'X-Setup-Token': SETUP_TOKEN },
    });
    expect(setupResponse.status).toBe(201);
    const setupBody = await bodyOf<{
      data: { user: { displayName: string }; recoveryCodes: string[]; session: { id: string } };
    }>(setupResponse);
    expect(setupBody.data.user.displayName).toBe('Ana');
    expect(setupBody.data.recoveryCodes).toHaveLength(10);
    await client.refreshCsrf();

    expect((await client.request('/auth/me')).status).toBe(200);

    expect((await loginWith(client, firstAuthenticator)).status).toBe(200);
    const sessionsBefore = await bodyOf<{ data: Array<{ id: string; current: boolean }> }>(
      await client.request('/auth/sessions'),
    );
    expect(sessionsBefore.data).toHaveLength(2);
    const other = sessionsBefore.data.find((session) => !session.current);
    expect(other).toBeDefined();

    const revoke = await client.request(`/auth/sessions/${other!.id}`, { method: 'DELETE' });
    expect(revoke.status).toBe(200);
    const sessionsAfter = await bodyOf<{ data: Array<{ id: string }> }>(
      await client.request('/auth/sessions'),
    );
    expect(sessionsAfter.data).toHaveLength(1);
    expect(sessionsAfter.data[0]?.id).not.toBe(other!.id);

    const logout = await client.request('/auth/logout', { method: 'POST', json: {} });
    expect(logout.status).toBe(200);
    expect((await client.request('/auth/me')).status).toBe(401);

    expect((await loginWith(client, firstAuthenticator)).status).toBe(200);
    expect((await client.request('/auth/me')).status).toBe(200);

    expect((await client.request('/auth/logout-all', { method: 'POST', json: {} })).status).toBe(
      200,
    );
    expect((await client.request('/auth/me')).status).toBe(401);

    const recoveryResponse = await client.request('/auth/recovery/verify', {
      method: 'POST',
      json: { code: setupBody.data.recoveryCodes[0] },
    });
    expect(recoveryResponse.status).toBe(200);
    const recovery = await bodyOf<{ data: { recoveryToken: string; expiresAt: string } }>(
      recoveryResponse,
    );
    expect(new Date(recovery.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect((await client.request('/auth/me')).status).toBe(401);

    const secondAuthenticator = await VirtualAuthenticator.create({ rpId: RP_ID, origin: ORIGIN });
    expect(
      (await registerWithRecovery(client, recovery.data.recoveryToken, secondAuthenticator)).status,
    ).toBe(200);

    // O mesmo token e o mesmo código não podem ser reutilizados.
    expect(
      (await registerWithRecovery(client, recovery.data.recoveryToken, secondAuthenticator)).status,
    ).toBe(401);
    expect(
      (
        await client.request('/auth/recovery/verify', {
          method: 'POST',
          json: { code: setupBody.data.recoveryCodes[0] },
        })
      ).status,
    ).toBe(401);

    expect((await loginWith(client, secondAuthenticator)).status).toBe(200);
    const me = await bodyOf<{
      data: { user: { displayName: string }; counts: { passkeys: number } };
    }>(await client.request('/auth/me'));
    expect(me.data.user.displayName).toBe('Ana');
    expect(me.data.counts.passkeys).toBe(2);

    const actions = (await auditRows()).map((row) => row.action);
    for (const action of [
      'setup',
      'passkey_add',
      'login',
      'logout',
      'session_revoke',
      'recovery',
    ]) {
      expect(actions).toContain(action);
    }

    const serialized = JSON.stringify(await auditRows());
    expect(serialized).not.toContain(client.cookies['__Host-pos_session'] ?? '');
    expect(serialized).not.toContain(recovery.data.recoveryToken);
    expect(serialized).not.toContain(setupBody.data.recoveryCodes[0] ?? '');
  });
});
