import { SESSION_COOKIE_MAX_AGE_SECONDS } from '@personal-os/domain';
import {
  bodyOf,
  loginWith,
  newClient,
  ORIGIN,
  performSetup,
  resetAuthDatabase,
  RP_ID,
  testDb,
} from './helpers';
import { VirtualAuthenticator } from '../spike/virtual-authenticator';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditRows } from './helpers';

beforeEach(async () => {
  await resetAuthDatabase();
});

describe('CSRF e Origem', () => {
  it('rejeita mutação sem token CSRF', async () => {
    const client = await newClient();
    const response = await client.request('/auth/login/options', {
      method: 'POST',
      json: {},
      skipCsrf: true,
    });
    expect(response.status).toBe(403);
  });

  it('rejeita Origem fora da allowlist', async () => {
    const client = await newClient();
    const response = await client.request('/auth/login/options', {
      method: 'POST',
      json: {},
      headers: { Origin: 'https://atacante.example' },
    });
    expect(response.status).toBe(403);
  });

  it('exige Content-Type application/json', async () => {
    const client = await newClient();
    const response = await client.request('/auth/login/options', {
      method: 'POST',
      json: {},
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(response.status).toBe(403);
  });

  it('permite leitura sem token CSRF', async () => {
    const client = await newClient();
    expect((await client.request('/auth/me')).status).toBe(401);
  });

  it('rejeita token CSRF de sessão diferente', async () => {
    const setup = await performSetup();
    const other = await newClient();
    const response = await setup.client.request('/auth/recovery/verify', {
      method: 'POST',
      json: { code: setup.recoveryCodes[0] },
      headers: { 'X-CSRF-Token': other.csrf },
    });
    expect(response.status).toBe(403);
  });
});

describe('cookies e segredos', () => {
  it('configura flags corretas e nunca grava o token em claro', async () => {
    const setup = await performSetup();
    const row = await testDb()
      .prepare('SELECT token_hash, length(token_hash) AS size FROM sessions LIMIT 1')
      .first<{ token_hash: string; size: number }>();

    expect(row?.size).toBe(64);
    expect(row?.token_hash).not.toBe(setup.sessionToken);

    // O cookie é emitido na autenticação, não em toda requisição: inspecionamos
    // a resposta que o originou em vez de `/auth/me`.
    const login = await loginWith(setup.client, setup.authenticator);
    expect(login.status).toBe(200);
    const setCookies = login.headers.getSetCookie();
    const sessionCookie = setCookies.find((value) => value.startsWith('__Host-pos_session='));
    const csrfCookie = setCookies.find((value) => value.startsWith('pos_csrf='));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).not.toContain('Domain=');
    expect(sessionCookie).toContain(`Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`);
    expect(csrfCookie).toContain('Secure');
    expect(csrfCookie).toContain('SameSite=Lax');
  });

  it('limpa o cookie de sessão no logout', async () => {
    const setup = await performSetup();
    const response = await setup.client.request('/auth/logout', { method: 'POST', json: {} });
    const sessionCookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-pos_session='));
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).not.toContain('Domain=');
    expect(sessionCookie).toContain('Max-Age=0');
  });
});

describe('WebAuthn', () => {
  async function loginWithOverride(
    authenticator: VirtualAuthenticator,
    overrides: Parameters<VirtualAuthenticator['createAuthenticationResponse']>[1],
  ) {
    const client = await newClient();
    const optionsResponse = await client.request('/auth/login/options', {
      method: 'POST',
      json: {},
    });
    const optionsBody = await bodyOf<{
      data: { challengeId: string; options: PublicKeyCredentialRequestOptionsJSON };
    }>(optionsResponse);
    const credential = await authenticator.createAuthenticationResponse(
      optionsBody.data.options,
      overrides,
    );
    return client.request('/auth/login/verify', {
      method: 'POST',
      json: { challengeId: optionsBody.data.challengeId, credential },
    });
  }

  it('rejeita UV ausente', async () => {
    const setup = await performSetup();
    const response = await loginWithOverride(setup.authenticator, {
      flags: { up: true, uv: false },
    });
    expect(response.status).toBe(401);
  });

  it('rejeita UP ausente', async () => {
    const setup = await performSetup();
    const response = await loginWithOverride(setup.authenticator, {
      flags: { up: false, uv: true },
    });
    expect(response.status).toBe(401);
  });

  it('rejeita Origem divergente', async () => {
    const setup = await performSetup();
    const response = await loginWithOverride(setup.authenticator, {
      origin: 'https://atacante.example',
    });
    expect(response.status).toBe(401);
  });

  it('rejeita RP ID divergente', async () => {
    const setup = await performSetup();
    const response = await loginWithOverride(setup.authenticator, { rpId: 'atacante.example' });
    expect(response.status).toBe(401);
  });

  it('rejeita assinatura inválida', async () => {
    const setup = await performSetup();
    const client = await newClient();
    const optionsResponse = await client.request('/auth/login/options', {
      method: 'POST',
      json: {},
    });
    const optionsBody = await bodyOf<{
      data: { challengeId: string; options: PublicKeyCredentialRequestOptionsJSON };
    }>(optionsResponse);
    const credential = await setup.authenticator.createAuthenticationResponse(
      optionsBody.data.options,
    );
    const signature = credential.response.signature;
    credential.response.signature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

    const response = await client.request('/auth/login/verify', {
      method: 'POST',
      json: { challengeId: optionsBody.data.challengeId, credential },
    });
    expect(response.status).toBe(401);
  });

  it('aceita contador repetido como anomalia, preserva o confiável e audita', async () => {
    const authenticator = await VirtualAuthenticator.create({
      rpId: RP_ID,
      origin: ORIGIN,
      initialCounter: 7,
    });
    const setup = await performSetup(authenticator);
    expect(setup.authenticator.counter).toBe(7);

    const response = await loginWithOverride(authenticator, { counter: 7 });
    expect(response.status).toBe(200);

    const stored = await testDb()
      .prepare('SELECT counter FROM passkeys LIMIT 1')
      .first<{ counter: number }>();
    expect(stored?.counter).toBe(7);

    const rows = await auditRows();
    expect(rows.some((row) => row.after_json?.includes('counter_anomaly'))).toBe(true);
  });
});

describe('replay e limites', () => {
  it('rejeita reuse de challenge', async () => {
    const setup = await performSetup();
    const optionsResponse = await setup.client.request('/auth/login/options', {
      method: 'POST',
      json: {},
    });
    const optionsBody = await bodyOf<{
      data: { challengeId: string; options: PublicKeyCredentialRequestOptionsJSON };
    }>(optionsResponse);
    const credential = await setup.authenticator.createAuthenticationResponse(
      optionsBody.data.options,
    );
    const payload = { challengeId: optionsBody.data.challengeId, credential };

    expect(
      (await setup.client.request('/auth/login/verify', { method: 'POST', json: payload })).status,
    ).toBe(200);
    // O login gera nova sessão e, portanto, novo subject para o token CSRF.
    await setup.client.refreshCsrf();
    expect(
      (await setup.client.request('/auth/login/verify', { method: 'POST', json: payload })).status,
    ).toBe(401);
  });

  it('rejeita código de recuperação usado duas vezes', async () => {
    const setup = await performSetup();
    const payload = { code: setup.recoveryCodes[0] };
    expect(
      (await setup.client.request('/auth/recovery/verify', { method: 'POST', json: payload }))
        .status,
    ).toBe(200);
    expect(
      (await setup.client.request('/auth/recovery/verify', { method: 'POST', json: payload }))
        .status,
    ).toBe(401);
  });

  it('bloqueia login/options após 30 requisições com Retry-After', async () => {
    const client = await newClient();
    for (let index = 0; index < 30; index += 1) {
      await client.request('/auth/login/options', { method: 'POST', json: {} });
    }
    const response = await client.request('/auth/login/options', { method: 'POST', json: {} });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('bloqueia recovery/verify após 5 falhas', async () => {
    const client = await newClient();
    for (let index = 0; index < 5; index += 1) {
      await client.request('/auth/recovery/verify', {
        method: 'POST',
        json: { code: '00000000-0000-0000-0000-000000000000' },
      });
    }
    const response = await client.request('/auth/recovery/verify', {
      method: 'POST',
      json: { code: '00000000-0000-0000-0000-000000000001' },
    });
    expect(response.status).toBe(429);
  });

  it('recusa corpo acima de 16 KB', async () => {
    const client = await newClient();
    const response = await client.request('/auth/login/options', {
      method: 'POST',
      json: { padding: 'x'.repeat(17 * 1024) },
    });
    expect(response.status).toBe(413);
  });

  it('recusa setup sem token e segundo setup', async () => {
    const client = await newClient();
    expect((await client.request('/auth/setup/options', { method: 'POST', json: {} })).status).toBe(
      403,
    );

    const setup = await performSetup();
    const response = await setup.client.request('/auth/setup/options', {
      method: 'POST',
      json: {},
      headers: { 'X-Setup-Token': 'local-setup-token' },
    });
    expect(response.status).toBe(409);
  });
});
