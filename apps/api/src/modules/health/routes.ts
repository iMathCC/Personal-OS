import { healthResponseSchema } from '@personal-os/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get('/health', async (c) => {
  let dbOk: boolean;

  try {
    const row = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    dbOk = row?.ok === 1;
  } catch {
    dbOk = false;
  }

  const payload = healthResponseSchema.parse({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'unavailable',
    version: c.env.APP_VERSION || 'dev',
    time: new Date().toISOString(),
  });

  return c.json(payload, dbOk ? 200 : 503);
});
