import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import { executionQuerySchema, timelineQuerySchema } from '@personal-os/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk } from '../auth/http';
import { getExecutionDashboard, getTimeline, type ExecutionContext } from './service';

type AppContext = Context<AppEnv>;

export const executionRoutes = new Hono<AppEnv>();

executionRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<ExecutionContext> {
  const session = c.get('session');
  if (session === null) throw unauthenticated();
  return {
    db: c.get('db'),
    requestId: c.get('requestId'),
    now: systemClock.now().toISOString(),
    timezone: c.get('userTimezone'),
  };
}

function parseQuery<S extends z.ZodType>(c: AppContext, schema: S): z.infer<S> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw validationError('Parâmetros de consulta inválidos.');
  return parsed.data;
}

executionRoutes.get('/dashboard', async (c) => {
  const query = parseQuery(c, executionQuerySchema);
  return jsonOk(c, await getExecutionDashboard(await context(c), query));
});

executionRoutes.get('/timeline', async (c) => {
  const query = parseQuery(c, timelineQuerySchema);
  const page = await getTimeline(await context(c), query);
  return c.json({
    data: page.items,
    meta: {
      requestId: c.get('requestId'),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
    },
  });
});
