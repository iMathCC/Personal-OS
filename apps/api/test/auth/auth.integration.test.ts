import { beforeEach, describe, expect, it } from 'vitest';
import { VirtualAuthenticator } from '../spike/virtual-authenticator';
import {
  auditRows,
  bodyOf,
  loginWith,
  ORIGIN,
  performSetup,
  registerWithRecovery,
  resetAuthDatabase,
  RP_ID,
} from './helpers';

beforeEach(async () => {
  await resetAuthDatabase();
});

describe('fluxo de autenticação', () => {
  it('executa setup, login, consulta e logout', async () => {
    const setup = await performSetup();

    expect(setup.recoveryCodes).toHaveLength(10);
    expect(new Set(setup.recoveryCodes).size).toBe(10);
    expect(setup.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const me = await setup.client.request('/auth/me');
    expect(me.status).toBe(200);
    const meBody = await bodyOf<{ data: { user: { id: string }; counts: { passkeys: number } } }>(
      me,
    );
    expect(meBody.data.user.id).toBe(setup.userId);
    expect(meBody.data.counts.passkeys).toBe(1);

    const login = await loginWith(setup.client, setup.authenticator);
    expect(login.status).toBe(200);

    const sessions = await setup.client.request('/auth/sessions');
    expect(sessions.status).toBe(200);
    const sessionsBody = await bodyOf<{ data: Array<{ id: string; current: boolean }> }>(sessions);
    expect(sessionsBody.data.length).toBe(2);
    expect(sessionsBody.data.filter((item) => item.current)).toHaveLength(1);

    const logout = await setup.client.request('/auth/logout', { method: 'POST', json: {} });
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie().some((value) => value.includes('Max-Age=0'))).toBe(true);

    const afterLogout = await setup.client.request('/auth/me');
    expect(afterLogout.status).toBe(401);
  });

  it('registra auditoria com requestId e IP hash, sem segredos', async () => {
    const setup = await performSetup();
    const rows = await auditRows();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.request_id?.startsWith('req_'))).toBe(true);
    expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.ip_hash ?? ''))).toBe(true);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(setup.sessionToken);
    expect(serialized).not.toContain(setup.recoveryCodes[0] ?? 'nothing');
  });

  it('recupera acesso, revoga sessões e cadastra nova passkey', async () => {
    const setup = await performSetup();
    const recovery = await setup.client.request('/auth/recovery/verify', {
      method: 'POST',
      json: { code: setup.recoveryCodes[0] },
    });
    expect(recovery.status).toBe(200);
    const recoveryBody = await bodyOf<{ data: { recoveryToken: string } }>(recovery);

    expect((await setup.client.request('/auth/me')).status).toBe(401);

    const authenticator = await VirtualAuthenticator.create({ rpId: RP_ID, origin: ORIGIN });
    const registered = await registerWithRecovery(
      setup.client,
      recoveryBody.data.recoveryToken,
      authenticator,
    );
    expect(registered.status).toBe(200);

    const login = await loginWith(setup.client, authenticator);
    expect(login.status).toBe(200);
  });
});
