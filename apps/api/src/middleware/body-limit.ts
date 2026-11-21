import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

export const MAX_BODY_BYTES = 16 * 1024;

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Lê o corpo uma única vez e o guarda no contexto. Além do `Content-Length`
 * (que o cliente pode omitir), medimos o corpo efetivo antes de qualquer parsing.
 */
export const bodyLimit = createMiddleware<AppEnv>(async (c, next) => {
  if (!MUTATIONS.has(c.req.method)) {
    await next();
    return;
  }

  const declaredLength = Number(c.req.header('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new HTTPException(413, { message: 'Corpo da requisição muito grande.' });
  }

  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new HTTPException(413, { message: 'Corpo da requisição muito grande.' });
  }
  c.set('rawBody', raw);

  await next();
});
