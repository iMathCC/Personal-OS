import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { bodyLimit } from './middleware/body-limit';
import { noStore } from './middleware/cache';
import { apiContext } from './middleware/context';
import { originAndCsrf } from './middleware/csrf';
import { errorHandler } from './middleware/error';
import { hsts, HSTS_VALUE } from './middleware/hsts';
import { requestLogging } from './middleware/observability';
import { requestId } from './middleware/request-id';
import { authRoutes } from './modules/auth/routes';
import { healthRoutes } from './modules/health/routes';
import { studiesRoutes } from './modules/studies/routes';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.onError(errorHandler);
  app.use('*', hsts);
  app.use('/api/v1/*', requestId);
  app.use('/api/v1/*', requestLogging);
  app.use('/api/v1/*', noStore);
  app.use('/api/v1/*', secureHeaders({ strictTransportSecurity: HSTS_VALUE }));
  app.use('/api/v1/*', apiContext);
  app.use('/api/v1/*', bodyLimit);
  app.use('/api/v1/*', originAndCsrf);

  app.route('/api/v1', healthRoutes);
  app.route('/api/v1/auth', authRoutes);
  app.route('/api/v1/studies', studiesRoutes);

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
