import { createDb, findSessionByTokenHash } from '@personal-os/db';
import { isSessionActive } from '@personal-os/domain';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import {
  CSRF_COOKIE,
  VID_COOKIE,
  deviceCookie,
  hashWithSalt,
  parseCookies,
  randomToken,
  sha256Hex,
  trustedClientIp,
} from '../modules/auth/security';

/** Identificador do cookie de sessão, isolado aqui para não duplicar strings. */
const SESSION_COOKIE_NAME = '__Host-pos_session';

/**
 * Contexto comum a todas as rotas de API: banco por requisição, identificador
 * de dispositivo opaco, hashes de IP/UA e sessão validada no D1.
 */
export const apiContext = createMiddleware<AppEnv>(async (c, next) => {
  const env = c.env;
  const db = createDb(env.DB);
  const cookies = parseCookies(c.req.header('Cookie') ?? null);

  let posVid = cookies[VID_COOKIE] ?? '';
  const shouldSetVidCookie = posVid.length === 0;
  if (shouldSetVidCookie) {
    posVid = randomToken(16);
  }

  const ip = trustedClientIp(c.req.raw.headers) ?? null;
  const ipHash = (await hashWithSalt(ip, env.IP_HASH_SALT)) ?? '';
  const userAgent = c.req.header('User-Agent');
  const sessionToken = cookies[SESSION_COOKIE_NAME] ?? '';
  const sessionTokenHash = sessionToken.length > 0 ? await sha256Hex(sessionToken) : null;

  const session =
    sessionTokenHash === null
      ? null
      : ((await findSessionByTokenHash(db, sessionTokenHash)) ?? null);

  c.set('db', db);
  c.set('rawBody', '');
  c.set('userAgent', userAgent ?? null);
  c.set('setVidCookie', shouldSetVidCookie);
  c.set('posVid', posVid);
  c.set('ipHash', ipHash);
  c.set('session', session !== null && isSessionActive(session, Date.now()) ? session : null);
  c.set('sessionToken', sessionToken.length > 0 ? sessionToken : null);
  c.set('sessionTokenHash', sessionTokenHash);
  c.set('csrfToken', cookies[CSRF_COOKIE] ?? null);
  c.set('authFailure', false);
  c.set('errorCode', null);

  await next();

  if (shouldSetVidCookie) {
    c.header('Set-Cookie', deviceCookie(posVid), { append: true });
  }
});
