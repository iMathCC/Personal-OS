import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { bodyLimit } from './middleware/body-limit';
import { noStore } from './middleware/cache';
import { apiContext } from './middleware/context';
import { adaptationRoutes } from './modules/adaptation/routes';
import { decisionRoutes } from './modules/decision/routes';
import { observationsRoutes } from './modules/observations/routes';
import { originAndCsrf } from './middleware/csrf';
import { errorHandler } from './middleware/error';
import { hsts, HSTS_VALUE } from './middleware/hsts';
import { requestLogging } from './middleware/observability';
import { rateLimitForRequest } from './middleware/rate-limit';
import { requestId } from './middleware/request-id';
import { authRoutes } from './modules/auth/routes';
import { executionRoutes } from './modules/execution/routes';
import { goalsRoutes } from './modules/goals/routes';
import { healthRoutes } from './modules/health/routes';
import { intelligenceRoutes } from './modules/intelligence/routes';
import { lifeRoutes } from './modules/life/routes';
import { planningRoutes } from './modules/planning/routes';
import { projectsRoutes } from './modules/projects/routes';
import { studiesRoutes } from './modules/studies/routes';
import { tasksRoutes } from './modules/tasks/routes';

/**
 * Respostas /api são JSON e nunca devem ser renderizadas como documento. A CSP
 * é de defesa em profundidade: sem origens carregáveis,sem base/formulário e
 * sem framing, mesmo se um cliente abrir a resposta diretamente.
 */
export const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.onError(errorHandler);
  app.use('*', hsts);
  app.use('/api/v1/*', requestId);
  app.use('/api/v1/*', requestLogging);
  app.use('/api/v1/*', noStore);
  app.use(
    '/api/v1/*',
    secureHeaders({
      strictTransportSecurity: HSTS_VALUE,
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    }),
  );
  app.use('/api/v1/*', apiContext);
  app.use('/api/v1/*', bodyLimit);
  app.use('/api/v1/*', originAndCsrf);
  app.use('/api/v1/*', rateLimitForRequest());

  app.route('/api/v1', healthRoutes);
  app.route('/api/v1/auth', authRoutes);
  app.route('/api/v1/studies', studiesRoutes);
  app.route('/api/v1/goals', goalsRoutes);
  app.route('/api/v1/projects', projectsRoutes);
  app.route('/api/v1/tasks', tasksRoutes);
  app.route('/api/v1/execution', executionRoutes);
  app.route('/api/v1/intelligence', intelligenceRoutes);
  app.route('/api/v1/intelligence', decisionRoutes);
  app.route('/api/v1/adaptation', adaptationRoutes);
  app.route('/api/v1/planning', planningRoutes);
  app.route('/api/v1/life', lifeRoutes);
  app.route('/api/v1/observations', observationsRoutes);

  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Recurso não encontrado.',
          requestId: c.get('requestId') ?? 'unknown',
        },
      },
      404,
    );
  });

  return app;
}

export const app = createApp();
