import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  decisionAlertMutationSchema,
  decisionAlertsQuerySchema,
  decisionListQuerySchema,
  decisionReviewQuerySchema,
  performanceQuerySchema,
} from '@personal-os/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody as parseBodyRequest } from '../auth/http';
import type { MutatingRequest } from '../goals/service';
import type { IdempotentResult } from '../operations/idempotency';
import {
  getAlerts,
  getCatalog,
  getCrossDomain,
  getLifeDashboard,
  getNextActions,
  getPerformanceDashboard,
  getPerformanceReview,
  getRecommendations,
  setAlertState,
  type DecisionContext,
} from './service';

type AppContext = Context<AppEnv>;

export const decisionRoutes = new Hono<AppEnv>();

decisionRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<DecisionContext> {
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

function pageMeta(c: AppContext, page: { nextCursor?: string; hasMore: boolean }) {
  return {
    requestId: c.get('requestId'),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    hasMore: page.hasMore,
  };
}

decisionRoutes.get('/life-dashboard', async (c) => {
  return jsonOk(
    c,
    await getLifeDashboard(await context(c), parseQuery(c, decisionListQuerySchema)),
  );
});

decisionRoutes.get('/cross-domain', async (c) => {
  const query = parseQuery(c, decisionListQuerySchema);
  const page = await getCrossDomain(await context(c), query);
  return c.json({
    data: page.items,
    meta: { ...pageMeta(c, page), catalog: page.catalog },
  });
});

decisionRoutes.get('/catalog', async (c) => {
  parseQuery(c, decisionListQuerySchema);
  return c.json({
    data: getCatalog(),
    meta: { requestId: c.get('requestId') },
  });
});

decisionRoutes.get('/alerts', async (c) => {
  const page = await getAlerts(await context(c), parseQuery(c, decisionAlertsQuerySchema));
  return c.json({ data: page.items, meta: pageMeta(c, page) });
});

decisionRoutes.get('/recommendations', async (c) => {
  const page = await getRecommendations(await context(c), parseQuery(c, decisionListQuerySchema));
  return c.json({ data: page.items, meta: pageMeta(c, page) });
});

decisionRoutes.get('/next-actions', async (c) => {
  const page = await getNextActions(await context(c), parseQuery(c, decisionListQuerySchema));
  return c.json({ data: page.items, meta: pageMeta(c, page) });
});

decisionRoutes.get('/performance-review', async (c) => {
  return jsonOk(
    c,
    await getPerformanceReview(await context(c), parseQuery(c, decisionReviewQuerySchema)),
  );
});

decisionRoutes.get('/performance', async (c) => {
  return jsonOk(
    c,
    await getPerformanceDashboard(await context(c), parseQuery(c, performanceQuerySchema)),
  );
});

async function mutateState(c: AppContext, target: 'acknowledged' | 'dismissed'): Promise<Response> {
  const input = parseBodyRequest(c, decisionAlertMutationSchema);
  const headerVersion = ifMatchVersion(c);
  if (headerVersion !== undefined && headerVersion !== input.version) {
    throw validationError('If-Match e version devem coincidir.');
  }
  const alertId = c.req.param('id') ?? '';
  return idempotentResponse(
    c,
    await setAlertState(await context(c), mutating(c), alertId, target, input.version),
  );
}

decisionRoutes.post('/alerts/:id/acknowledge', async (c) => mutateState(c, 'acknowledged'));
decisionRoutes.post('/alerts/:id/dismiss', async (c) => mutateState(c, 'dismissed'));
