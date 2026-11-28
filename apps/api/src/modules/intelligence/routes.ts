import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  createWeeklyReviewRequestSchema,
  intelligenceQuerySchema,
  intelligenceTimelineQuerySchema,
  updateWeeklyReviewRequestSchema,
  weeklyReviewListQuerySchema,
  weeklyReviewQuerySchema,
} from '@personal-os/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody as parseBodyRequest } from '../auth/http';
import type { IdempotentResult } from '../operations/idempotency';
import type { MutatingRequest } from '../goals/service';
import {
  getDashboard,
  getIntelligenceTimeline,
  getSavedReview,
  getWeeklyReview,
  listSavedReviews,
  saveWeeklyReview,
  updateWeeklyReview,
  type IntelligenceContext,
} from './service';

type AppContext = Context<AppEnv>;

export const intelligenceRoutes = new Hono<AppEnv>();

intelligenceRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<IntelligenceContext> {
  const session = c.get('session');
  if (session === null) throw unauthenticated();
  return {
    db: c.get('db'),
    requestId: c.get('requestId'),
    subject: session.userId,
    ipHash: c.get('ipHash') ?? null,
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

intelligenceRoutes.get('/dashboard', async (c) => {
  const query = parseQuery(c, intelligenceQuerySchema);
  return jsonOk(c, await getDashboard(await context(c), query));
});

intelligenceRoutes.get('/timeline', async (c) => {
  const query = parseQuery(c, intelligenceTimelineQuerySchema);
  const page = await getIntelligenceTimeline(await context(c), query);
  return c.json({
    data: page.items,
    meta: {
      requestId: c.get('requestId'),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
    },
  });
});

intelligenceRoutes.get('/reviews', async (c) => {
  const query = parseQuery(c, weeklyReviewQuerySchema);
  return jsonOk(c, await getWeeklyReview(await context(c), query.weekStart));
});

intelligenceRoutes.post('/reviews', async (c) => {
  const input = parseBodyRequest(c, createWeeklyReviewRequestSchema);
  return idempotentResponse(c, await saveWeeklyReview(await context(c), mutating(c), input));
});

intelligenceRoutes.get('/reviews/saved', async (c) => {
  const query = parseQuery(c, weeklyReviewListQuerySchema);
  const page = await listSavedReviews(await context(c), query.limit, query.cursor);
  return c.json({
    data: page.items,
    meta: {
      requestId: c.get('requestId'),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
    },
  });
});

intelligenceRoutes.get('/reviews/saved/:id', async (c) => {
  return jsonOk(c, await getSavedReview(await context(c), c.req.param('id')));
});

intelligenceRoutes.patch('/reviews/saved/:id', async (c) => {
  const input = parseBodyRequest(c, updateWeeklyReviewRequestSchema);
  const result = await updateWeeklyReview(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});
