import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  lifeEmptyQuerySchema,
  lifeHistoryQuerySchema,
  lifeImportCommitRequestSchema,
  lifeImportPreviewRequestSchema,
  lifePeriodQuerySchema,
} from '@personal-os/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody as parseBodyRequest } from '../auth/http';
import type { MutatingRequest } from '../goals/service';
import type { IdempotentResult } from '../operations/idempotency';
import { LIFE_ADAPTERS } from './adapters';
import {
  commitImport,
  correctRecord,
  createRecord,
  getDashboard,
  getFinanceSummary,
  getHealthSummary,
  getIntegration,
  getReadingSummary,
  getTimeSummary,
  getTrainingSummary,
  listHistory,
  listImports,
  listRecords,
  previewImport,
  type LifeContext,
  type RecordPage,
} from './service';

type AppContext = Context<AppEnv>;

export const lifeRoutes = new Hono<AppEnv>();

lifeRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<LifeContext> {
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

function jsonPage(c: AppContext, page: RecordPage) {
  return c.json(
    {
      data: page.items,
      meta: {
        requestId: c.get('requestId'),
        ...(page.nextCursor === null ? {} : { nextCursor: page.nextCursor }),
        hasMore: page.nextCursor !== null,
        truncated: page.truncated,
      },
    },
    200,
  );
}

/* --------------------------------------------------------------- Painel */

lifeRoutes.get('/dashboard', async (c) => {
  const query = parseQuery(c, lifePeriodQuerySchema);
  return jsonOk(c, await getDashboard(await context(c), query));
});

lifeRoutes.get('/integration', async (c) => {
  const query = parseQuery(c, lifePeriodQuerySchema);
  return jsonOk(c, await getIntegration(await context(c), query));
});

/* ---------------------------------------------------------- Importação */

lifeRoutes.get('/imports', async (c) => {
  const query = parseQuery(c, lifeHistoryQuerySchema);
  return jsonOk(c, await listImports(await context(c), query.limit ?? 50));
});

lifeRoutes.post('/imports/preview', async (c) => {
  parseQuery(c, lifeEmptyQuerySchema);
  const input = parseBodyRequest(c, lifeImportPreviewRequestSchema);
  return jsonOk(c, await previewImport(await context(c), input));
});

lifeRoutes.post('/imports', async (c) => {
  parseQuery(c, lifeEmptyQuerySchema);
  const input = parseBodyRequest(c, lifeImportCommitRequestSchema);
  return idempotentResponse(c, await commitImport(await context(c), mutating(c), input));
});

/* ---------------------------------------------------------- Indicadores */

const summaries = [
  { path: 'finance/summary', handler: getFinanceSummary },
  { path: 'health/summary', handler: getHealthSummary },
  { path: 'training/summary', handler: getTrainingSummary },
  { path: 'reading/summary', handler: getReadingSummary },
  { path: 'time/summary', handler: getTimeSummary },
] as const;

for (const summary of summaries) {
  lifeRoutes.get(`/${summary.path}`, async (c) => {
    const query = parseQuery(c, lifePeriodQuerySchema);
    return jsonOk(c, await summary.handler(await context(c), query));
  });
}

/* ------------------------------------------------------------- Registros */

for (const adapter of LIFE_ADAPTERS) {
  lifeRoutes.get(`/${adapter.path}`, async (c) => {
    const query = parseQuery(c, lifePeriodQuerySchema);
    return jsonPage(c, await listRecords(await context(c), adapter.domain, query));
  });

  lifeRoutes.get(`/${adapter.path}/history`, async (c) => {
    const query = parseQuery(c, lifeHistoryQuerySchema);
    return jsonPage(
      c,
      await listHistory(await context(c), adapter.domain, query.limit ?? 50, query.cursor),
    );
  });

  lifeRoutes.post(`/${adapter.path}`, async (c) => {
    parseQuery(c, lifeEmptyQuerySchema);
    const input = parseBodyRequest(c, adapter.createSchema);
    return idempotentResponse(
      c,
      await createRecord(await context(c), mutating(c), adapter.domain, input),
    );
  });

  lifeRoutes.patch(`/${adapter.path}/:id`, async (c) => {
    parseQuery(c, lifeEmptyQuerySchema);
    const input = parseBodyRequest(c, adapter.updateSchema);
    return idempotentResponse(
      c,
      await correctRecord(
        await context(c),
        mutating(c),
        adapter.domain,
        c.req.param('id'),
        input,
        ifMatchVersion(c),
      ),
    );
  });
}
