import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

/**
 * Gera um ID de correlação por requisição. Não confiamos em IDs enviados
 * pelo cliente para evitar poluição de logs e colisões.
 */
export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const id = `req_${crypto.randomUUID()}`;
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
});
