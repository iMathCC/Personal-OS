import { readRateLimitState, writeRateLimitState } from '@personal-os/db';
import {
  dependencyUnavailable,
  evaluateRateLimit,
  nextRateLimitState,
  RATE_LIMIT_RULES,
  type RateLimitOperation,
} from '@personal-os/domain';
import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

type Scope = 'ip' | 'user';

/**
 * Rate limit com janela fixa no D1. Falha fechada: se o banco não responder,
 * a requisição é recusada com 503 em vez de liberar o acesso.
 */
export function rateLimit(operation: RateLimitOperation, scope: Scope) {
  const rule = RATE_LIMIT_RULES[operation];

  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session');
    const identifier = scope === 'user' && session !== null ? session.userId : c.get('ipHash');
    const key = `${rule.prefix}:${identifier}`;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / rule.windowMs) * rule.windowMs).toISOString();

    let state;
    try {
      state = await readRateLimitState(c.get('db'), key);
    } catch {
      throw dependencyUnavailable('Não foi possível verificar o limite de requisições.');
    }

    const decision = evaluateRateLimit(state, rule, now);
    if (!decision.allowed) {
      const response = new Response(null, {
        headers: { 'Retry-After': String(decision.retryAfterSeconds) },
      });
      throw new HTTPException(429, {
        message: 'Limite de requisições excedido.',
        res: response,
      });
    }

    const nextState = nextRateLimitState(state, rule, now, false);
    try {
      await writeRateLimitState(c.get('db'), {
        key,
        windowStart,
        expiresAt: new Date(
          Math.floor(now / rule.windowMs) * rule.windowMs + rule.windowMs,
        ).toISOString(),
        count: nextState.count,
        failures: nextState.failures,
      });
    } catch {
      throw dependencyUnavailable('Não foi possível registrar o limite de requisições.');
    }

    await next();

    if (c.res.status >= 400) {
      c.set('authFailure', true);
      try {
        await writeRateLimitState(c.get('db'), {
          key,
          windowStart,
          expiresAt: new Date(
            Math.floor(Date.now() / rule.windowMs) * rule.windowMs + rule.windowMs,
          ).toISOString(),
          count: nextState.count,
          failures: nextState.failures + 1,
        });
      } catch {
        // A falha na contabilização não altera a resposta já enviada, mas o
        // contador de requisições foi gravado antes: não há janela livre.
      }
    }
  });
}
