import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

/**
 * Respostas da API contêm dados de sessão e domínio. Nenhum intermediário ou
 * cache do navegador deve retê-las, inclusive respostas de erro.
 */
export const noStore = createMiddleware<AppEnv>(async (c, next) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  await next();
});
