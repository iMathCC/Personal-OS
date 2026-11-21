import { forbidden, unauthenticated } from '@personal-os/domain';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import {
  allowedOrigins,
  constantTimeEqual,
  csrfSubject,
  requestOrigin,
  verifyCsrfToken,
} from '../modules/auth/security';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defesa em camadas: Origem explícita, JSON obrigatório e token assinado que
 * vincula o cookie `pos_csrf` à sessão (ou ao nonce anônimo, no pré-login).
 */
export const originAndCsrf = createMiddleware<AppEnv>(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = requestOrigin(c.req.raw.headers);
    if (origin === null || !allowedOrigins(c.env).includes(origin)) {
      throw forbidden('Origem não permitida.');
    }

    const contentType = c.req.header('Content-Type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      throw forbidden('Content-Type inválido.');
    }

    const cookieToken = c.get('csrfToken') ?? null;
    const headerToken = c.req.header('X-CSRF-Token') ?? null;
    if (
      cookieToken === null ||
      headerToken === null ||
      !constantTimeEqual(cookieToken, headerToken) ||
      !(await verifyCsrfToken(
        c.env.CSRF_SECRET,
        csrfSubject(c.get('sessionTokenHash'), c.get('posVid')),
        headerToken,
      ))
    ) {
      throw forbidden('Token CSRF inválido.');
    }

    c.set('csrfToken', headerToken);
  }

  await next();
});

/** Garante que a sessão esteja presente antes de rotas protegidas. */
export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('session') === null) {
    throw unauthenticated();
  }
  await next();
});
