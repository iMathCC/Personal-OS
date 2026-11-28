import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  completeTaskBodySchema,
  createTaskBodySchema,
  listTasksQuerySchema,
  setTaskDependenciesBodySchema,
  updateTaskBodySchema,
} from '@personal-os/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody as parseBodyRequest } from '../auth/http';
import type { IdempotentResult } from '../operations/idempotency';
import {
  completeTask,
  createTask,
  deleteTask,
  getTaskDetail,
  listTasks,
  setTaskDependencies,
  updateTask,
  type MutatingRequest,
  type TasksContext,
} from './service';

type AppContext = Context<AppEnv>;

export const tasksRoutes = new Hono<AppEnv>();

tasksRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<TasksContext> {
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

/** Criação exige `Idempotency-Key`; demais mutações usam chave derivada de versão. */
function mutating(c: AppContext, fallback?: string): MutatingRequest {
  const url = new URL(c.req.raw.url);
  return {
    clientKey: c.req.header('Idempotency-Key') ?? fallback ?? '',
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

tasksRoutes.get('/', async (c) => {
  const query = parseQuery(c, listTasksQuerySchema);
  const page = await listTasks(await context(c), query);
  return c.json({
    data: page.items,
    meta: {
      requestId: c.get('requestId'),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
    },
  });
});

tasksRoutes.post('/', async (c) => {
  const input = parseBodyRequest(c, createTaskBodySchema);
  return idempotentResponse(c, await createTask(await context(c), mutating(c), input));
});

tasksRoutes.get('/:id', async (c) => {
  return jsonOk(c, await getTaskDetail(await context(c), c.req.param('id')));
});

tasksRoutes.patch('/:id', async (c) => {
  const input = parseBodyRequest(c, updateTaskBodySchema);
  const id = c.req.param('id');
  const result = await updateTask(
    await context(c),
    mutating(c, `PATCH:task:${id}:${input.version}`),
    id,
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

tasksRoutes.post('/:id/complete', async (c) => {
  const input = parseBodyRequest(c, completeTaskBodySchema);
  const id = c.req.param('id');
  const result = await completeTask(
    await context(c),
    mutating(c, `POST:task-complete:${id}:${input.version}`),
    id,
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

tasksRoutes.put('/:id/dependencies', async (c) => {
  const input = parseBodyRequest(c, setTaskDependenciesBodySchema);
  const id = c.req.param('id');
  const result = await setTaskDependencies(
    await context(c),
    mutating(c, `PUT:task-dependencies:${id}:${input.version}`),
    id,
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

tasksRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const version = ifMatchVersion(c);
  const result = await deleteTask(
    await context(c),
    mutating(c, `DELETE:task:${id}:${version ?? ''}`),
    id,
    version,
  );
  return idempotentResponse(c, result);
});
