import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { errorHandler } from './middleware/error';
import { requestId } from './middleware/request-id';
import { healthRoutes } from './modules/health/routes';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('*', requestId);
  app.use('*', secureHeaders());
  app.onError(errorHandler);

  app.route('/api/v1', healthRoutes);

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
