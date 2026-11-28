import { forbidden } from '@personal-os/domain';
import {
  loginOptionsRequestSchema,
  loginVerifyRequestSchema,
  recoveryRegisterOptionsRequestSchema,
  recoveryRegisterVerifyRequestSchema,
  recoveryVerifyRequestSchema,
  setupOptionsRequestSchema,
  setupVerifyRequestSchema,
} from '@personal-os/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { authRequired } from '../../middleware/csrf';
import { jsonOk, parseBody } from './http';
import { clearSessionCookie, constantTimeEqual, csrfCookie, sessionCookie } from './security';
import { AuthService, type RequestContext } from './service';

function serviceContext(c: Parameters<typeof jsonOk>[0]): RequestContext {
  return {
    db: c.get('db'),
    env: c.env,
    requestId: c.get('requestId'),
    ipHash: c.get('ipHash'),
    userAgent: c.get('userAgent'),
    posVid: c.get('posVid'),
    session: c.get('session'),
    sessionTokenHash: c.get('sessionTokenHash'),
  };
}

function service(c: Parameters<typeof jsonOk>[0]): AuthService {
  return new AuthService(serviceContext(c));
}

/** Bootstrap de uma única conta: segredo fora do corpo e comparação constante. */
function requireSetupToken(c: Parameters<typeof jsonOk>[0]): void {
  const provided = c.req.header('X-Setup-Token') ?? '';
  if (!constantTimeEqual(provided, c.env.SETUP_TOKEN)) {
    throw forbidden('Token de setup inválido.');
  }
}

function applyAuthCookies(
  c: Parameters<typeof jsonOk>[0],
  sessionToken: string,
  csrfToken: string,
): void {
  c.header('Set-Cookie', sessionCookie(sessionToken), { append: true });
  c.header('Set-Cookie', csrfCookie(csrfToken), { append: true });
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/csrf', async (c) => {
  const result = await service(c).csrf();
  c.header('Set-Cookie', csrfCookie(result.csrfToken), { append: true });
  return jsonOk(c, result);
});

authRoutes.post('/setup/options', async (c) => {
  requireSetupToken(c);
  parseBody(c, setupOptionsRequestSchema);
  return jsonOk(c, await service(c).setupOptions());
});

authRoutes.post('/setup/verify', async (c) => {
  requireSetupToken(c);
  const input = parseBody(c, setupVerifyRequestSchema);
  const result = await service(c).setupVerify(input);
  applyAuthCookies(c, result.sessionToken, result.csrfToken);
  return jsonOk(
    c,
    {
      user: result.user,
      session: result.session,
      recoveryCodes: result.recoveryCodes,
    },
    201,
  );
});

authRoutes.post('/login/options', async (c) => {
  parseBody(c, loginOptionsRequestSchema);
  return jsonOk(c, await service(c).loginOptions());
});

authRoutes.post('/login/verify', async (c) => {
  const input = parseBody(c, loginVerifyRequestSchema);
  const result = await service(c).loginVerify(input);
  applyAuthCookies(c, result.sessionToken, result.csrfToken);
  return jsonOk(c, { user: result.user, session: result.session });
});

authRoutes.post('/logout', authRequired, async (c) => {
  await service(c).logout();
  c.header('Set-Cookie', clearSessionCookie(), { append: true });
  return jsonOk(c, { loggedOut: true });
});

authRoutes.post('/logout-all', authRequired, async (c) => {
  await service(c).logoutAll();
  c.header('Set-Cookie', clearSessionCookie(), { append: true });
  return jsonOk(c, { loggedOut: true });
});

authRoutes.post('/recovery/verify', async (c) => {
  const input = parseBody(c, recoveryVerifyRequestSchema);
  return jsonOk(c, await service(c).recoveryVerify(input));
});

authRoutes.post('/recovery/register/options', async (c) => {
  const input = parseBody(c, recoveryRegisterOptionsRequestSchema);
  return jsonOk(c, await service(c).recoveryRegisterOptions(input));
});

authRoutes.post('/recovery/register/verify', async (c) => {
  const input = parseBody(c, recoveryRegisterVerifyRequestSchema);
  return jsonOk(c, await service(c).recoveryRegisterVerify(input));
});

authRoutes.get('/me', authRequired, async (c) => {
  const result = await service(c).me();
  await service(c).touchSession();
  return jsonOk(c, result);
});

authRoutes.get('/sessions', authRequired, async (c) => {
  const result = await service(c).sessions();
  await service(c).touchSession();
  return jsonOk(c, result);
});

authRoutes.delete('/sessions/:id', authRequired, async (c) => {
  const id = c.req.param('id');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    throw forbidden('Identificador de sessão inválido.');
  }
  await service(c).revokeSession(id);
  return jsonOk(c, { revoked: true });
});
