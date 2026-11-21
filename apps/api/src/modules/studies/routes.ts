import {
  createCourseRequestSchema,
  createStudySessionRequestSchema,
  dashboardStudiesQuerySchema,
  listSessionsQuerySchema,
  seriesQuerySchema,
  supersedeObservationRequestSchema,
} from '@personal-os/shared';
import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody as parseBodyRequest } from '../auth/http';
import type { IdempotentResult } from '../operations/idempotency';
import {
  createCourse,
  createStudySession,
  currentTimezone,
  getDashboard,
  getObservationsForSession,
  getSeries,
  getSessionDetail,
  listAllCourses,
  listAreas,
  listSessions,
  softDeleteSession,
  supersedeObservation,
  type MutatingRequest,
  type StudiesContext,
} from './service';

type AppContext = Context<AppEnv>;

export const studiesRoutes = new Hono<AppEnv>();

studiesRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<StudiesContext> {
  const session = c.get('session');
  if (session === null) throw unauthenticated();
  const db = c.get('db');
  return {
    db,
    requestId: c.get('requestId'),
    ipHash: c.get('ipHash') ?? null,
    subject: session.userId,
    now: systemClock.now().toISOString(),
    timezone: await currentTimezone(db),
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
  if (!parsed.success) {
    throw validationError('Parâmetros de consulta inválidos.');
  }
  return parsed.data;
}

function ifMatchVersion(c: AppContext): number | undefined {
  const raw = c.req.header('If-Match');
  if (raw === undefined) return undefined;
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(raw.trim());
  if (match === null) throw validationError('If-Match inválido.');
  return Number(match[1]);
}

/**
 * O corpo gravado é devolvido byte a byte. Re-serializar alteraria o envelope
 * original e quebraria a promessa de recuperação exata da operação.
 */
function idempotentResponse(c: AppContext, result: IdempotentResult): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Request-Id': c.get('requestId'),
    'Cache-Control': 'no-store',
  };
  if (result.replayed) headers['Idempotent-Replayed'] = 'true';
  return new Response(result.bodyJson, { status: result.status, headers });
}

studiesRoutes.get('/areas', async (c) => {
  const data = await listAreas(await context(c));
  return jsonOk(c, data);
});

studiesRoutes.get('/courses', async (c) => {
  const data = await listAllCourses(await context(c));
  return jsonOk(c, data);
});

studiesRoutes.post('/courses', async (c) => {
  const input = parseBodyRequest(c, createCourseRequestSchema);
  const result = await createCourse(await context(c), mutating(c), input);
  return idempotentResponse(c, result);
});

studiesRoutes.post('/sessions', async (c) => {
  const input = parseBodyRequest(c, createStudySessionRequestSchema);
  const result = await createStudySession(await context(c), mutating(c), input);
  return idempotentResponse(c, result);
});

studiesRoutes.get('/sessions', async (c) => {
  const query = parseQuery(c, listSessionsQuerySchema);
  const page = await listSessions(await context(c), query);
  return c.json({
    data: page.items,
    meta: {
      requestId: c.get('requestId'),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
    },
  });
});

studiesRoutes.get('/sessions/:id', async (c) => {
  const data = await getSessionDetail(await context(c), c.req.param('id'));
  return jsonOk(c, data);
});

studiesRoutes.get('/sessions/:id/observations', async (c) => {
  const data = await getObservationsForSession(await context(c), c.req.param('id'));
  return jsonOk(c, data);
});

studiesRoutes.delete('/sessions/:id', async (c) => {
  const result = await softDeleteSession(
    await context(c),
    mutating(c),
    c.req.param('id'),
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

studiesRoutes.post('/observations/:id/supersede', async (c) => {
  const input = parseBodyRequest(c, supersedeObservationRequestSchema);
  const result = await supersedeObservation(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
  );
  return idempotentResponse(c, result);
});

studiesRoutes.get('/series', async (c) => {
  const query = parseQuery(c, seriesQuerySchema);
  const data = await getSeries(await context(c), query);
  return jsonOk(c, data);
});

studiesRoutes.get('/dashboard', async (c) => {
  const query = parseQuery(c, dashboardStudiesQuerySchema);
  const data = await getDashboard(await context(c), query);
  return jsonOk(c, data);
});
