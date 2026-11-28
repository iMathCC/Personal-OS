import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import type { Env } from '../../src/env';
import { trustedClientIp } from '../../src/modules/auth/security';
import { all, applyCurrentSchema, resetDatabase } from '../db/helpers';
import { ORIGIN, performSetup, testEnv } from './helpers';

function productionEnv(): Env {
  const local = testEnv();
  return {
    DB: local.DB,
    APP_VERSION: local.APP_VERSION,
    SETUP_TOKEN: local.SETUP_TOKEN,
    RP_ID: local.RP_ID,
    RP_NAME: local.RP_NAME,
    ORIGIN: local.ORIGIN,
    CSRF_SECRET: local.CSRF_SECRET,
    IP_HASH_SALT: local.IP_HASH_SALT,
  };
}

async function probe(env: Env, headers: Record<string, string> = {}): Promise<Response> {
  return app.request(
    'https://personal-os.test/api/v1/goals/dashboard',
    { headers: { Origin: ORIGIN, ...headers } },
    env,
  );
}

describe('resolução confiável de origem', () => {
  beforeEach(async () => {
    await resetDatabase();
    await applyCurrentSchema();
  });

  it('aceita somente IP literal no cabeçalho confiável', () => {
    expect(trustedClientIp(new Headers({ 'CF-Connecting-IP': '203.0.113.10' }))).toBe(
      '203.0.113.10',
    );
    expect(trustedClientIp(new Headers({ 'CF-Connecting-IP': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(trustedClientIp(new Headers({ 'CF-Connecting-IP': '::1' }))).toBe('::1');

    const invalid = ['', '   ', 'not-an-ip', '203.0.113.999', '127.1', '203.0.113.10:8080'];
    for (const value of invalid) {
      expect(trustedClientIp(new Headers({ 'CF-Connecting-IP': value }))).toBeNull();
    }
    expect(
      trustedClientIp(
        new Headers({
          'X-Forwarded-For': '198.51.100.7',
          Forwarded: 'for=198.51.100.7',
          'X-Real-IP': '198.51.100.7',
        }),
      ),
    ).toBeNull();
  });

  it('falha fechado em produção sem origem confiável', async () => {
    const missing = await probe(productionEnv());
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({
      error: { code: 'DEPENDENCY_UNAVAILABLE' },
    });

    const malformed = await probe(productionEnv(), { 'CF-Connecting-IP': 'not-an-ip' });
    expect(malformed.status).toBe(503);

    const spoofed = await probe(productionEnv(), { 'X-Forwarded-For': '198.51.100.7' });
    expect(spoofed.status).toBe(503);
    expect(await all<{ key: string }>('SELECT key FROM rate_limits')).toEqual([]);
  });

  it('aceita origem confiável em produção sem criar hash vazio', async () => {
    for (const ip of ['203.0.113.10', '2001:db8::1']) {
      const response = await probe(productionEnv(), { 'CF-Connecting-IP': ip });
      expect(response.status).toBe(401);
    }
    const rows = await all<{ key: string }>('SELECT key FROM rate_limits');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.key.endsWith(':')).toBe(false);
      expect(row.key).toMatch(/:[0-9a-f]{64}$/);
    }
  });

  it('usa fallback por dispositivo somente no ambiente local de teste', async () => {
    const response = await probe(testEnv());
    expect(response.status).toBe(401);
    const rows = await all<{ key: string }>('SELECT key FROM rate_limits');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.key.endsWith(':'))).toBe(false);
    expect(rows.some((row) => /:[0-9a-f]{64}$/.test(row.key))).toBe(true);
  });

  it('limita usuário autenticado mesmo sem cabeçalho de origem', async () => {
    const setup = await performSetup();
    const cookie = Object.entries(setup.client.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    const response = await probe(productionEnv(), { Cookie: cookie });
    expect(response.status).toBe(200);
    const rows = await all<{ key: string }>('SELECT key FROM rate_limits');
    expect(rows.some((row) => row.key.endsWith(':'))).toBe(false);
  });
});
