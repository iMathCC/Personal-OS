import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

/**
 * 15.552.000 s = 180 dias, acima do mínimo de seis meses da política de segurança.
 * `includeSubDomains` é seguro aqui: o hostname publicado é dedicado e não há
 * outros subdomínios sob `personal-os.imathscc.workers.dev` cuja política seria
 * alterada. `preload` fica de fora até decisão explícita (difícil reversão).
 */
export const HSTS_VALUE = 'max-age=15552000; includeSubDomains';

/** Aplica HSTS também a 404 e erros, que não passam pelos middlewares de /api/v1. */
export const hsts = createMiddleware<AppEnv>(async (c, next) => {
  c.header('Strict-Transport-Security', HSTS_VALUE);
  await next();
});
