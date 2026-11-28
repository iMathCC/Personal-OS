import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  createProjectBodySchema,
  createProjectMilestoneBodySchema,
  listProjectsQuerySchema,
  setProjectGoalsBodySchema,
  updateProjectBodySchema,
  updateProjectMilestoneBodySchema,
} from '@personal-os/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody as parseBodyRequest } from '../auth/http';
import type { IdempotentResult } from '../operations/idempotency';
import {
  createProject,
  createProjectMilestone,
  deleteProject,
  getProjectDetail,
  listProjects,
  setProjectGoals,
  updateProject,
  updateProjectMilestone,
  type MutatingRequest,
  type ProjectsContext,
} from './service';

type AppContext = Context<AppEnv>;

export const projectsRoutes = new Hono<AppEnv>();

projectsRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<ProjectsContext> {
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

/**
 * Criações exigem `Idempotency-Key`. Nas demais mutações o cliente envia
 * `If-Match`; a chave é derivada de método + entidade + versão para manter
 * `executeIdempotent` sem exigir um cabeçalho extra não documentado.
 */
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

projectsRoutes.get('/', async (c) => {
  const query = parseQuery(c, listProjectsQuerySchema);
  const page = await listProjects(await context(c), query);
  return c.json({
    data: page.items,
    meta: {
      requestId: c.get('requestId'),
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
    },
  });
});

projectsRoutes.post('/', async (c) => {
  const input = parseBodyRequest(c, createProjectBodySchema);
  return idempotentResponse(c, await createProject(await context(c), mutating(c), input));
});

projectsRoutes.get('/:id', async (c) => {
  return jsonOk(c, await getProjectDetail(await context(c), c.req.param('id')));
});

projectsRoutes.patch('/:id', async (c) => {
  const input = parseBodyRequest(c, updateProjectBodySchema);
  const id = c.req.param('id');
  const result = await updateProject(
    await context(c),
    mutating(c, `PATCH:project:${id}:${input.version}`),
    id,
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

projectsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const version = ifMatchVersion(c);
  const result = await deleteProject(
    await context(c),
    mutating(c, `DELETE:project:${id}:${version ?? ''}`),
    id,
    version,
  );
  return idempotentResponse(c, result);
});

projectsRoutes.put('/:id/goals', async (c) => {
  const input = parseBodyRequest(c, setProjectGoalsBodySchema);
  const id = c.req.param('id');
  const result = await setProjectGoals(
    await context(c),
    mutating(c, `PUT:project-goals:${id}:${input.version}`),
    id,
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

projectsRoutes.post('/:id/milestones', async (c) => {
  const input = parseBodyRequest(c, createProjectMilestoneBodySchema);
  const id = c.req.param('id');
  const result = await createProjectMilestone(
    await context(c),
    mutating(c, `POST:project-milestone:${id}:${input.version}`),
    id,
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

projectsRoutes.patch('/:id/milestones/:milestoneId', async (c) => {
  const input = parseBodyRequest(c, updateProjectMilestoneBodySchema);
  const id = c.req.param('id');
  const milestoneId = c.req.param('milestoneId');
  const result = await updateProjectMilestone(
    await context(c),
    mutating(c, `PATCH:project-milestone:${milestoneId}:${input.version}`),
    id,
    milestoneId,
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});
