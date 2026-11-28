import { claimRateLimitSlot, createDb } from '@personal-os/db';
import { RATE_LIMIT_RULES, windowStartFor } from '@personal-os/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { all, applyObservationsSchema, executeSql, resetDatabase } from '../db/helpers';
import { newClient, performSetup, testDb } from './helpers';

beforeEach(async () => {
  await resetDatabase();
  await applyObservationsSchema();
});

describe('rate limit central', () => {
  it('não consome cota em health, CSRF ou rota não registrada', async () => {
    const client = await newClient();
    const before = await all<{ key: string }>('SELECT key FROM rate_limits');

    for (let index = 0; index < 10; index += 1) {
      expect((await client.request('/health')).status).toBe(200);
      expect((await client.request('/nao-existe')).status).toBe(404);
      await client.refreshCsrf();
    }

    const after = await all<{ key: string }>('SELECT key FROM rate_limits');
    expect(after).toEqual(before);
  });

  it('usa o usuário autenticado sem gravar contador de falhas', async () => {
    const setup = await performSetup();
    expect((await setup.client.request('/auth/me')).status).toBe(200);

    const reads = await all<{ key: string; count: number }>(
      "SELECT key, count FROM rate_limits WHERE key LIKE 'auth:read:%'",
    );
    expect(reads).toHaveLength(1);
    expect(reads[0]?.key).toContain(setup.userId);
    expect(reads[0]?.count).toBe(1);

    const failures = await all<{ key: string }>(
      "SELECT key FROM rate_limits WHERE key LIKE 'failure:%'",
    );
    expect(failures).toEqual([]);
  });

  it('usa o usuário autenticado em mutações', async () => {
    const setup = await performSetup();
    expect(
      (await setup.client.request('/auth/logout-all', { method: 'POST', json: {} })).status,
    ).toBe(200);

    const writes = await all<{ key: string; count: number }>(
      "SELECT key, count FROM rate_limits WHERE key LIKE 'auth:write:%'",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toContain(setup.userId);
    expect(writes[0]?.count).toBe(1);
  });

  it('concede no máximo o limite em reservas concorrentes', async () => {
    const db = createDb(testDb());
    const input = {
      key: 'test:concurrent',
      failureKey: 'failure:test:concurrent',
      windowStart: '2026-11-22T00:00:00.000Z',
      expiresAt: '2026-11-22T00:15:00.000Z',
      limit: 3,
      failureLimit: null,
    };

    const results = await Promise.all(
      Array.from({ length: 12 }, () => claimRateLimitSlot(db, input)),
    );
    expect(results.filter((allowed) => allowed)).toHaveLength(3);
  });

  it('permite requests dentro do limite em observations e adaptation', async () => {
    const setup = await performSetup();
    const obsRes = await setup.client.request('/observations');
    expect(obsRes.status).toBeLessThan(400);
    expect(obsRes.status).not.toBe(429);

    const adaptRes = await setup.client.request('/adaptation/dashboard');
    expect(adaptRes.status).toBeLessThan(400);
    expect(adaptRes.status).not.toBe(429);

    const reads = await all<{ key: string; count: number }>(
      "SELECT key, count FROM rate_limits WHERE key LIKE 'auth:read:%'",
    );
    const userRead = reads.find((r) => r.key.includes(setup.userId));
    expect(userRead).toBeDefined();
    expect(userRead!.count).toBeGreaterThanOrEqual(2);
  });

  it('aplica rate limit central em observations (leitura e escrita)', async () => {
    const setup = await performSetup();
    const readRule = RATE_LIMIT_RULES.authenticatedRead;
    const writeRule = RATE_LIMIT_RULES.authenticatedWrite;
    const now = Date.now();
    const readWindow = windowStartFor(now, readRule.windowMs);
    const writeWindow = windowStartFor(now, writeRule.windowMs);
    const readExpires = new Date(readWindow + readRule.windowMs).toISOString();
    const writeExpires = new Date(writeWindow + writeRule.windowMs).toISOString();
    const readWindowIso = new Date(readWindow).toISOString();
    const writeWindowIso = new Date(writeWindow).toISOString();

    await executeSql(
      `INSERT OR REPLACE INTO rate_limits (key, window_start, count, expires_at)
       VALUES ('auth:read:${setup.userId}', '${readWindowIso}', ${readRule.limit}, '${readExpires}')`,
    );
    await executeSql(
      `INSERT OR REPLACE INTO rate_limits (key, window_start, count, expires_at)
       VALUES ('auth:write:${setup.userId}', '${writeWindowIso}', ${writeRule.limit}, '${writeExpires}')`,
    );

    const readRes = await setup.client.request('/observations');
    expect(readRes.status).toBe(429);
    expect(readRes.headers.get('Retry-After')).toBeTruthy();

    const writeRes = await setup.client.request('/observations', {
      method: 'POST',
      json: {
        kind: 'executed',
        title: 'x',
        observedAt: '2026-11-10T12:00:00.000Z',
        timezone: 'UTC',
      },
    });
    expect(writeRes.status).toBe(429);
  });

  it('aplica rate limit central em adaptation (leitura)', async () => {
    const setup = await performSetup();
    const readRule = RATE_LIMIT_RULES.authenticatedRead;
    const now = Date.now();
    const readWindow = windowStartFor(now, readRule.windowMs);
    const readExpires = new Date(readWindow + readRule.windowMs).toISOString();
    const readWindowIso = new Date(readWindow).toISOString();

    await executeSql(
      `INSERT OR REPLACE INTO rate_limits (key, window_start, count, expires_at)
       VALUES ('auth:read:${setup.userId}', '${readWindowIso}', ${readRule.limit}, '${readExpires}')`,
    );

    const readRes = await setup.client.request('/adaptation/decisions');
    expect(readRes.status).toBe(429);
    expect(readRes.headers.get('Retry-After')).toBeTruthy();
  });
});
