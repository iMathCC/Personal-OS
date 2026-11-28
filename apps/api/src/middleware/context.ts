import { createDb, findSessionByTokenHash, findUser } from '@personal-os/db';
import { assertIanaTimezone, isSessionActive } from '@personal-os/domain';
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
  type RequestOriginKind,
} from '../modules/auth/security';

/** Identificador do cookie de sessão, isolado aqui para não duplicar strings. */
const SESSION_COOKIE_NAME = '__Host-pos_session';

/**
 * O fuso vem de `users.timezone` (texto livre no setup da Entrega 3). Valores
 * legados inválidos caem em UTC explicitamente: nenhuma rota deve calcular
 * datas com um fuso que `Intl` não reconhece.
 */
function safeUserTimezone(timezone: string | undefined): string {
  if (timezone === undefined) return 'UTC';
  try {
    return assertIanaTimezone(timezone);
  } catch {
    return 'UTC';
  }
}

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

  const trustedIp = trustedClientIp(c.req.raw.headers);
  // `DB_TEST` existe apenas no Worker local de teste. Nunca é um binding de produção.
  const isLocalTest = env.DB_TEST !== undefined;
  const originKind: RequestOriginKind =
    trustedIp !== null ? 'trusted-ip' : isLocalTest ? 'local-test' : 'unavailable';
  /**
   * Nunca existe `ipHash = ''`: sem origem confiável o valor é NULL e o
   * limitador falha fechado. No ambiente de teste, o cookie de dispositivo
   * fornece um identificador por cliente, nunca um bucket global compartilhado.
   */
  const hashInput = trustedIp !== null ? trustedIp : isLocalTest ? `local-test:${posVid}` : null;
  const ipHash = await hashWithSalt(hashInput, env.IP_HASH_SALT);
  const userAgent = c.req.header('User-Agent');
  const sessionToken = cookies[SESSION_COOKIE_NAME] ?? '';
  const sessionTokenHash = sessionToken.length > 0 ? await sha256Hex(sessionToken) : null;

  const session =
    sessionTokenHash === null
      ? null
      : ((await findSessionByTokenHash(db, sessionTokenHash)) ?? null);

  const activeSession = session !== null && isSessionActive(session, Date.now()) ? session : null;
  const user = activeSession === null ? undefined : await findUser(db);

  c.set('db', db);
  c.set('rawBody', '');
  c.set('userAgent', userAgent ?? null);
  c.set('setVidCookie', shouldSetVidCookie);
  c.set('posVid', posVid);
  c.set('ipHash', ipHash);
  c.set('originKind', originKind);
  c.set('session', activeSession);
  c.set('userTimezone', safeUserTimezone(user?.timezone));
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
