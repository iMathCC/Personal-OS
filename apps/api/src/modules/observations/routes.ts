import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  correctPersonalObservationRequestSchema,
  createPersonalObservationRequestSchema,
  listPersonalObservationsQuerySchema,
  observationSummaryQuerySchema,
} from '@personal-os/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody as parseBodyRequest } from '../auth/http';
import type { IdempotentResult } from '../operations/idempotency';
import {
  correctObservation,
  createObservation,
  getObservation,
  getObservationSummary,
  listObservations,
  type MutatingRequest,
  type ObservationsContext,
} from './service';

type AppContext = Context<AppEnv>;

export const observationsRoutes = new Hono<AppEnv>();
observationsRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<ObservationsContext> {
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

observationsRoutes.get('/', async (c) => {
  const query = parseQuery(c, listPersonalObservationsQuerySchema);
  const page = await listObservations(await context(c), query);
  return c.json(
    {
      data: page.items,
      meta: {
        requestId: c.get('requestId'),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        hasMore: page.hasMore,
        truncated: page.truncated,
      },
    },
    200,
  );
});

observationsRoutes.post('/', async (c) => {
  const input = parseBodyRequest(c, createPersonalObservationRequestSchema);
  return idempotentResponse(c, await createObservation(await context(c), mutating(c), input));
});

observationsRoutes.get('/summary', async (c) => {
  const query = parseQuery(c, observationSummaryQuerySchema);
  return jsonOk(c, await getObservationSummary(await context(c), query));
});

observationsRoutes.get('/:id', async (c) => {
  return jsonOk(c, await getObservation(await context(c), c.req.param('id')));
});

observationsRoutes.post('/:id/correct', async (c) => {
  const input = parseBodyRequest(c, correctPersonalObservationRequestSchema);
  return idempotentResponse(
    c,
    await correctObservation(
      await context(c),
      mutating(c),
      c.req.param('id'),
      input,
      ifMatchVersion(c),
    ),
  );
});
