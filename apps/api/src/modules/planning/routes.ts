import { systemClock, unauthenticated, validationError } from '@personal-os/domain';
import {
  capacityQuerySchema,
  createCycleRequestSchema,
  createQuarterlyReviewRequestSchema,
  createScenarioRequestSchema,
  createStrategicAreaRequestSchema,
  createStrategicGoalRequestSchema,
  createVisionRequestSchema,
  cycleListQuerySchema,
  cycleTransitionRequestSchema,
  planningEmptyQuerySchema,
  prioritizationQuerySchema,
  saveCapacityProfileRequestSchema,
  scenarioComparisonDtoSchema,
  scenarioListQuerySchema,
  simulateRequestSchema,
  updateCycleRequestSchema,
  updateQuarterlyReviewRequestSchema,
  updateStrategicAreaRequestSchema,
  updateStrategicGoalRequestSchema,
  updateVisionRequestSchema,
  visionListQuerySchema,
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
  compare,
  computeCapacity,
  createCycle,
  createScenario,
  createStrategicArea,
  createStrategicGoal,
  createVision,
  getCapacityProfile,
  getCycle,
  getDashboard,
  getIntelligenceIntegration,
  getPrioritization,
  getReview,
  getScenario,
  getVision,
  listCycles,
  listReviews,
  listScenarios,
  listStrategicAreas,
  listStrategicGoals,
  listVisionHistory,
  saveCapacityProfile,
  saveReview,
  simulate,
  transitionCycle,
  updateCycle,
  updateReview,
  updateStrategicArea,
  updateStrategicGoal,
  updateVision,
  type PlanningContext,
} from './service';

type AppContext = Context<AppEnv>;

export const planningRoutes = new Hono<AppEnv>();

planningRoutes.use('*', authRequired);

async function context(c: AppContext): Promise<PlanningContext> {
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

/* ------------------------------------------------------------------ Painel */

planningRoutes.get('/dashboard', async (c) => {
  parseQuery(c, planningEmptyQuerySchema);
  return jsonOk(c, await getDashboard(await context(c)));
});

planningRoutes.get('/intelligence', async (c) => {
  parseQuery(c, planningEmptyQuerySchema);
  return jsonOk(c, await getIntelligenceIntegration(await context(c)));
});

/* -------------------------------------------------------------------- Visão */

planningRoutes.get('/vision', async (c) => {
  parseQuery(c, planningEmptyQuerySchema);
  return jsonOk(c, await getVision(await context(c)));
});

planningRoutes.get('/vision/history', async (c) => {
  const query = parseQuery(c, visionListQuerySchema);
  return jsonOk(c, await listVisionHistory(await context(c), query.limit ?? 50));
});

planningRoutes.post('/vision', async (c) => {
  const input = parseBodyRequest(c, createVisionRequestSchema);
  return idempotentResponse(c, await createVision(await context(c), mutating(c), input));
});

planningRoutes.patch('/vision/:id', async (c) => {
  const input = parseBodyRequest(c, updateVisionRequestSchema);
  const result = await updateVision(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

/* ------------------------------------------------------------ Áreas e metas */

planningRoutes.get('/areas', async (c) => {
  parseQuery(c, planningEmptyQuerySchema);
  return jsonOk(c, await listStrategicAreas(await context(c)));
});

planningRoutes.post('/areas', async (c) => {
  const input = parseBodyRequest(c, createStrategicAreaRequestSchema);
  return idempotentResponse(c, await createStrategicArea(await context(c), mutating(c), input));
});

planningRoutes.patch('/areas/:id', async (c) => {
  const input = parseBodyRequest(c, updateStrategicAreaRequestSchema);
  const result = await updateStrategicArea(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

planningRoutes.get('/goals', async (c) => {
  parseQuery(c, planningEmptyQuerySchema);
  return jsonOk(c, await listStrategicGoals(await context(c)));
});

planningRoutes.post('/goals', async (c) => {
  const input = parseBodyRequest(c, createStrategicGoalRequestSchema);
  return idempotentResponse(c, await createStrategicGoal(await context(c), mutating(c), input));
});

planningRoutes.patch('/goals/:id', async (c) => {
  const input = parseBodyRequest(c, updateStrategicGoalRequestSchema);
  const result = await updateStrategicGoal(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

/* -------------------------------------------------------------------- Ciclos */

planningRoutes.get('/cycles', async (c) => {
  const query = parseQuery(c, cycleListQuerySchema);
  return jsonOk(c, await listCycles(await context(c), query.status));
});

planningRoutes.get('/cycles/:id', async (c) => {
  return jsonOk(c, await getCycle(await context(c), c.req.param('id')));
});

planningRoutes.post('/cycles', async (c) => {
  const input = parseBodyRequest(c, createCycleRequestSchema);
  return idempotentResponse(c, await createCycle(await context(c), mutating(c), input));
});

planningRoutes.patch('/cycles/:id', async (c) => {
  const input = parseBodyRequest(c, updateCycleRequestSchema);
  const result = await updateCycle(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

planningRoutes.post('/cycles/:id/transition', async (c) => {
  const input = parseBodyRequest(c, cycleTransitionRequestSchema);
  const result = await transitionCycle(
    await context(c),
    mutating(c),
    c.req.param('id'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});

/* ---------------------------------------------------------------- Capacidade */

planningRoutes.get('/capacity/profile', async (c) => {
  parseQuery(c, planningEmptyQuerySchema);
  return jsonOk(c, await getCapacityProfile(await context(c)));
});

planningRoutes.post('/capacity/profile', async (c) => {
  const input = parseBodyRequest(c, saveCapacityProfileRequestSchema);
  const result = await saveCapacityProfile(await context(c), mutating(c), input, ifMatchVersion(c));
  return idempotentResponse(c, result);
});

planningRoutes.get('/capacity', async (c) => {
  const query = parseQuery(c, capacityQuerySchema);
  return jsonOk(c, await computeCapacity(await context(c), query));
});

planningRoutes.get('/prioritization', async (c) => {
  const query = parseQuery(c, prioritizationQuerySchema);
  return jsonOk(c, await getPrioritization(await context(c), query));
});

/* ------------------------------------------------------------------ Cenários */

planningRoutes.post('/scenarios/simulate', async (c) => {
  const input = parseBodyRequest(c, simulateRequestSchema);
  return jsonOk(c, await simulate(await context(c), input));
});

planningRoutes.post('/scenarios/compare', async (c) => {
  const input = parseBodyRequest(c, simulateRequestSchema);
  const result = await compare(await context(c), input);
  return jsonOk(c, scenarioComparisonDtoSchema.parse(result));
});

planningRoutes.get('/scenarios', async (c) => {
  const query = parseQuery(c, scenarioListQuerySchema);
  return jsonOk(c, await listScenarios(await context(c), query.limit ?? 50));
});

planningRoutes.get('/scenarios/:id', async (c) => {
  return jsonOk(c, await getScenario(await context(c), c.req.param('id')));
});

planningRoutes.post('/scenarios', async (c) => {
  const input = parseBodyRequest(c, createScenarioRequestSchema);
  return idempotentResponse(c, await createScenario(await context(c), mutating(c), input));
});

/* ------------------------------------------------------------------ Revisões */

planningRoutes.get('/reviews', async (c) => {
  return jsonOk(c, await listReviews(await context(c)));
});

planningRoutes.get('/reviews/:cycleId', async (c) => {
  return jsonOk(c, await getReview(await context(c), c.req.param('cycleId')));
});

planningRoutes.post('/reviews', async (c) => {
  const input = parseBodyRequest(c, createQuarterlyReviewRequestSchema);
  return idempotentResponse(
    c,
    await saveReview(await context(c), mutating(c), input.cycleId, input),
  );
});

planningRoutes.patch('/reviews/:cycleId', async (c) => {
  const input = parseBodyRequest(c, updateQuarterlyReviewRequestSchema);
  const result = await updateReview(
    await context(c),
    mutating(c),
    c.req.param('cycleId'),
    input,
    ifMatchVersion(c),
  );
  return idempotentResponse(c, result);
});
