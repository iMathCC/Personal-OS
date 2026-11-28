import { claimRateLimitSlot, recordRateLimitFailure } from '@personal-os/db';
import {
  dependencyUnavailable,
  RATE_LIMIT_RULES,
  windowStartFor,
  type RateLimitOperation,
} from '@personal-os/domain';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../env';

type Scope = 'ip' | 'user';

interface MiddlewarePlan {
  operation: RateLimitOperation;
  scope: Scope;
}

const middlewareCache = new Map<string, MiddlewareHandler<AppEnv>>();

/** Prefixos registrados no `app.route`: rotas fora deles devem chegar ao 404. */
const LIMITED_PATH_PREFIXES = [
  '/api/v1/auth/',
  '/api/v1/studies/',
  '/api/v1/goals/',
  '/api/v1/projects/',
  '/api/v1/tasks/',
  '/api/v1/execution/',
  '/api/v1/intelligence/',
  '/api/v1/planning/',
  '/api/v1/life/',
] as const;

function isRegisteredApiPath(path: string): boolean {
  return LIMITED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Rotas com limites próprios já cobertas pelo middleware central. */
function authPlan(path: string): MiddlewarePlan | null {
  if (path.startsWith('/api/v1/auth/setup/')) return { operation: 'setup', scope: 'ip' };
  if (path === '/api/v1/auth/login/options') return { operation: 'loginOptions', scope: 'ip' };
  if (path === '/api/v1/auth/login/verify') return { operation: 'loginVerify', scope: 'ip' };
  if (path === '/api/v1/auth/recovery/verify') {
    return { operation: 'recoveryVerify', scope: 'ip' };
  }
  if (path.startsWith('/api/v1/auth/recovery/register/')) {
    return { operation: 'recoveryRegister', scope: 'ip' };
  }
  return null;
}

/**
 * Limite central de todas as rotas registradas, exceto health (observabilidade)
 * e `/auth/csrf` (emissão de nonce necessária para consultar qualquer outra rota).
 * Caminhos não registrados não consomem cota e chegam ao `404` do Hono. Rotas de
 * autenticação com regras próprias são mapeadas aqui; as demais usam
 * leitura/escrita autenticada com escopo de usuário quando há sessão válida e
 * de IP caso contrário.
 */
export function rateLimitForRequest() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const path = c.req.path;
    if (
      path === '/api/v1/health' ||
      path.startsWith('/api/v1/health/') ||
      path === '/api/v1/auth/csrf'
    ) {
      await next();
      return;
    }
    if (!isRegisteredApiPath(path)) {
      await next();
      return;
    }

    const plan =
      authPlan(path) ??
      ({
        operation:
          c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS'
            ? 'authenticatedRead'
            : 'authenticatedWrite',
        scope: c.get('session') === null ? 'ip' : 'user',
      } satisfies MiddlewarePlan);

    await middlewareFor(plan.operation, plan.scope)(c, next);
  });
}

/**
 * Rate limit com janela fixa no D1. Falha fechada: se o banco não responder,
 * a requisição é recusada com 503 em vez de liberar o acesso.
 *
 * O contador de falhas só existe quando a regra define `failureLimit`; gravá-lo
 * nas regras de leitura/escrita autenticada seria um write D1 extra sem efeito.
 */
export function rateLimit(operation: RateLimitOperation, scope: Scope) {
  return middlewareFor(operation, scope);
}

function middlewareFor(operation: RateLimitOperation, scope: Scope): MiddlewareHandler<AppEnv> {
  const cacheKey = `${operation}:${scope}`;
  const cached = middlewareCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const rule = RATE_LIMIT_RULES[operation];
  const tracksFailures = rule.failureLimit !== undefined;
  const middleware = createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    const identifier = scope === 'user' && session !== null ? session.userId : c.get('ipHash');
    if (identifier === null || identifier.length === 0) {
      // Sem origem confiável não existe bucket seguro: fail-closed, sem
      // identificador vazio e sem bucket global compartilhado.
      throw dependencyUnavailable('Não foi possível identificar a origem da requisição.');
    }
    const key = `${rule.prefix}:${identifier}`;
    const now = Date.now();
    const windowStartMs = windowStartFor(now, rule.windowMs);
    const windowStart = new Date(windowStartMs).toISOString();
    const expiresAt = new Date(windowStartMs + rule.windowMs).toISOString();
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + rule.windowMs - now) / 1000));

    let allowed: boolean;
    try {
      allowed = await claimRateLimitSlot(c.get('db'), {
        key,
        failureKey: `failure:${key}`,
        windowStart,
        expiresAt,
        limit: rule.limit,
        failureLimit: rule.failureLimit ?? null,
      });
    } catch {
      throw dependencyUnavailable('Não foi possível registrar o limite de requisições.');
    }

    if (!allowed) {
      const response = new Response(null, {
        headers: { 'Retry-After': String(retryAfterSeconds) },
      });
      throw new HTTPException(429, {
        message: 'Limite de requisições excedido.',
        res: response,
      });
    }

    await next();

    if (tracksFailures && c.res.status >= 400) {
      c.set('authFailure', true);
      try {
        await recordRateLimitFailure(c.get('db'), {
          key: `failure:${key}`,
          windowStart,
          expiresAt,
        });
      } catch {
        // A resposta já foi enviada; a fatia foi reservada antes de `next()`.
      }
    }
  });

  middlewareCache.set(cacheKey, middleware);
  return middleware;
}
