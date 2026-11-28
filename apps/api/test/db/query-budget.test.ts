import { env } from 'cloudflare:workers';
import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { ORIGIN, performSetup, type Client } from '../auth/helpers';
import { applyPlanningSchema, executeSql, resetDatabase, testDb } from './helpers';

interface Counter {
  prepares: number;
  batches: number;
  batchSize: number;
  execs: number;
}

function trackedEnv(counter: Counter) {
  const database = testDb();
  const trackedDb = new Proxy(database, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === 'prepare') {
        return (...args: unknown[]) => {
          counter.prepares += 1;
          return (value as (...inner: unknown[]) => unknown).apply(target, args);
        };
      }
      if (property === 'batch') {
        return (...args: unknown[]) => {
          counter.batches += 1;
          const statements = args[0];
          counter.batchSize += Array.isArray(statements) ? statements.length : 0;
          return (value as (...inner: unknown[]) => unknown).apply(target, args);
        };
      }
      if (property === 'exec') {
        return (...args: unknown[]) => {
          counter.execs += 1;
          return (value as (...inner: unknown[]) => unknown).apply(target, args);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { ...env, DB: trackedDb };
}

async function measure(client: Client, path: string): Promise<Counter & { status: number }> {
  const counter: Counter = { prepares: 0, batches: 0, batchSize: 0, execs: 0 };
  const headers = new Headers({
    Accept: 'application/json',
    Origin: ORIGIN,
    'CF-Connecting-IP': '203.0.113.10',
    'User-Agent': 'Mozilla/5.0',
    Cookie: Object.entries(client.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
    'X-CSRF-Token': client.csrf,
  });
  const response = await app.request(
    `https://personal-os.test/api/v1${path}`,
    { headers },
    trackedEnv(counter),
  );
  return { ...counter, status: response.status };
}

const BUDGETS: Record<string, number> = {
  '/planning/dashboard': 5,
  '/planning/capacity': 5,
  '/planning/prioritization': 8,
  '/intelligence/dashboard': 5,
};

describe('orçamento de consultas D1', () => {
  let client: Client;

  beforeEach(async () => {
    await resetDatabase();
    await applyPlanningSchema();
    await executeSql(seedSql);
    client = (await performSetup()).client;
  });

  it('mantém dashboards e composições dentro do teto de oito statements', async () => {
    for (const [path, budget] of Object.entries(BUDGETS)) {
      const result = await measure(client, path);
      expect(result.status, path).toBe(200);
      expect(result.prepares + result.batchSize, path).toBeLessThanOrEqual(budget);
      expect(result.batches, path).toBeLessThanOrEqual(1);
      expect(result.execs, path).toBe(0);
    }
  });
});
