import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  adaptationDashboardQuerySchema,
  adaptationDecisionRequestSchema,
  adaptationHistoryQuerySchema,
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
  getAdaptationDashboard,
  getAdaptationHistory,
  getAdaptationProposals,
  getAdaptationScenarios,
  recordAdaptationDecision,
  type AdaptationContext,
} from './service';

type AppContext = Context<AppEnv>;

export const adaptationRoutes = new Hono<AppEnv>();

adaptationRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<AdaptationContext> {
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

adaptationRoutes.get('/dashboard', async (c) => {
  return jsonOk(
    c,
    await getAdaptationDashboard(await context(c), parseQuery(c, adaptationDashboardQuerySchema)),
  );
});

adaptationRoutes.get('/proposals', async (c) => {
  return jsonOk(
    c,
    await getAdaptationProposals(await context(c), parseQuery(c, adaptationDashboardQuerySchema)),
  );
});

adaptationRoutes.get('/scenarios', async (c) => {
  return jsonOk(
    c,
    await getAdaptationScenarios(await context(c), parseQuery(c, adaptationDashboardQuerySchema)),
  );
});

adaptationRoutes.get('/history', async (c) => {
  const query = parseQuery(c, adaptationHistoryQuerySchema);
  const page = await getAdaptationHistory(await context(c), query);
  return c.json({
    data: page.items,
    meta: {
      requestId: c.get('requestId'),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
    },
  });
});

adaptationRoutes.post('/decisions', async (c) => {
  const input = parseBodyRequest(c, adaptationDecisionRequestSchema);
  const headerVersion = ifMatchVersion(c);
  if (headerVersion !== undefined && headerVersion !== input.version) {
    throw validationError('If-Match e version devem coincidir.');
  }
  return idempotentResponse(
    c,
    await recordAdaptationDecision(await context(c), mutating(c), input),
  );
});
