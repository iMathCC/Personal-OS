import { claimRateLimitSlot, createDb } from '@personal-os/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { all } from '../db/helpers';
import { newClient, performSetup, resetAuthDatabase, testDb } from './helpers';

beforeEach(async () => {
  await resetAuthDatabase();
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
});
