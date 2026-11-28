import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  createLifeGoalRequestSchema,
  createMilestoneRequestSchema,
  goalDashboardQuerySchema,
  goalListQuerySchema,
  updateGoalProgressRequestSchema,
  updateGoalRequestSchema,
  updateMilestoneRequestSchema,
} from '@personal-os/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody as parseBodyRequest } from '../auth/http';
import type { IdempotentResult } from '../operations/idempotency';
import {
  archiveGoal,
  completeGoal,
  createGoal,
  createMilestone,
  getGoalDetail,
  getGoalsDashboard,
  listAreas,
  listGoals,
  reopenGoal,
  updateGoal,
  updateGoalProgress,
  updateMilestone,
  type GoalsContext,
  type MutatingRequest,
} from './service';

type AppContext = Context<AppEnv>;

export const goalsRoutes = new Hono<AppEnv>();

goalsRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<GoalsContext> {
  const session = c.get('session');
  if (session === null) throw unauthenticated();
  return {
    db: c.get('db'),
    requestId: c.get('requestId'),
    ipHash: c.get('ipHash') ?? null,
    subject: session.userId,
    now: systemClock.now().toISOString(),
    timezone: c.get('userTimezone'),
  };
}

function mutating(c: AppContext): MutatingRequest {
  const url = new URL(c.req.raw.url);
  return {
    clientKey: c.req.header('Idempotency-Key') ?? '',
    method: c.req.method,
    path: url.pathname,
    query: url.search,
    rawBody: c.get('rawBody') ?? '',
  };
}

function parseQuery<S extends z.ZodType>(c: AppContext, schema: S): z.infer<S> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw validationError('Parâmetros de consulta inválidos.');
  return parsed.data;
}

function ifMatchVersion(c: AppContext): number | undefined {
  const raw = c.req.header('If-Match');
  if (raw === undefined) return undefined;
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(raw.trim());
  if (match === null) throw validationError('If-Match inválido.');
  return Number(match[1]);
}

function idempotentResponse(c: AppContext, result: IdempotentResult): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Request-Id': c.get('requestId'),
    'Cache-Control': 'no-store',
  };
  if (result.replayed) headers['Idempotent-Replayed'] = 'true';
  return new Response(result.bodyJson, { status: result.status, headers });
}

goalsRoutes.get('/areas', async (c) => {
  return jsonOk(c, await listAreas(await context(c)));
});

goalsRoutes.get('/dashboard', async (c) => {
  const query = parseQuery(c, goalDashboardQuerySchema);
  return jsonOk(c, await getGoalsDashboard(await context(c), query));
});

goalsRoutes.get('/', async (c) => {
  const query = parseQuery(c, goalListQuerySchema);
  const page = await listGoals(await context(c), query);
  return c.json({
    data: page.items,
    meta: {
      requestId: c.get('requestId'),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
      truncated: page.truncated,
    },
  });
});

goalsRoutes.post('/', async (c) => {
  const input = parseBodyRequest(c, createLifeGoalRequestSchema);
  return idempotentResponse(c, await createGoal(await context(c), mutating(c), input));
});

goalsRoutes.get('/:id', async (c) => {
  return jsonOk(c, await getGoalDetail(await context(c), c.req.param('id')));
});

goalsRoutes.patch('/:id', async (c) => {
  const input = parseBodyRequest(c, updateGoalRequestSchema);
  const result = await updateGoal(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

goalsRoutes.post('/:id/complete', async (c) => {
  const result = await completeGoal(
    await context(c),
    mutating(c),
    c.req.param('id'),
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

goalsRoutes.post('/:id/reopen', async (c) => {
  const result = await reopenGoal(
    await context(c),
    mutating(c),
    c.req.param('id'),
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

goalsRoutes.post('/:id/archive', async (c) => {
  const result = await archiveGoal(
    await context(c),
    mutating(c),
    c.req.param('id'),
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

goalsRoutes.post('/:id/progress', async (c) => {
  const input = parseBodyRequest(c, updateGoalProgressRequestSchema);
  const result = await updateGoalProgress(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

goalsRoutes.post('/:id/milestones', async (c) => {
  const input = parseBodyRequest(c, createMilestoneRequestSchema);
  return idempotentResponse(
    c,
    await createMilestone(await context(c), mutating(c), c.req.param('id'), input),
  );
});

goalsRoutes.patch('/:id/milestones/:milestoneId', async (c) => {
  const input = parseBodyRequest(c, updateMilestoneRequestSchema);
  const result = await updateMilestone(
    await context(c),
    mutating(c),
    c.req.param('id'),
    c.req.param('milestoneId'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});
