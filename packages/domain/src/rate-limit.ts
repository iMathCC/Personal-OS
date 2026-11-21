export type RateLimitOperation =
  | 'loginOptions'
  | 'loginVerify'
  | 'setup'
  | 'recoveryVerify'
  | 'recoveryRegister'
  | 'authenticatedRead'
  | 'authenticatedWrite';

export interface RateLimitRule {
  windowMs: number;
  limit: number;
  failureLimit?: number;
  prefix: string;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

/** Valores consolidados na Entrega 3 (pedido do usuário / ADR-0012). */
export const RATE_LIMIT_RULES: Record<RateLimitOperation, RateLimitRule> = {
  loginOptions: { windowMs: FIFTEEN_MINUTES, limit: 30, prefix: 'login:options' },
  loginVerify: {
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    failureLimit: 5,
    prefix: 'login:verify',
  },
  setup: { windowMs: FIFTEEN_MINUTES, limit: 10, failureLimit: 5, prefix: 'setup' },
  recoveryVerify: { windowMs: FIVE_MINUTES, limit: 5, prefix: 'recovery:verify' },
  recoveryRegister: { windowMs: FIVE_MINUTES, limit: 10, prefix: 'recovery:register' },
  authenticatedRead: { windowMs: ONE_MINUTE, limit: 600, prefix: 'auth:read' },
  authenticatedWrite: { windowMs: ONE_MINUTE, limit: 300, prefix: 'auth:write' },
};

export interface RateLimitState {
  count: number;
  failures: number;
  windowStart: number;
}

export type RateLimitReason = 'allowed' | 'request-limit' | 'failure-limit';

export interface RateLimitDecision {
  allowed: boolean;
  reason: RateLimitReason;
  retryAfterSeconds: number;
  resetWindow: boolean;
}

export function windowStartFor(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function evaluateRateLimit(
  state: RateLimitState | null,
  rule: RateLimitRule,
  now: number,
): RateLimitDecision {
  const windowStart = windowStartFor(now, rule.windowMs);
  const expired = state === null || state.windowStart !== windowStart;
  const count = expired ? 0 : state.count;
  const failures = expired ? 0 : state.failures;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));

  if (count >= rule.limit) {
    return { allowed: false, reason: 'request-limit', retryAfterSeconds, resetWindow: expired };
  }
  if (rule.failureLimit !== undefined && failures >= rule.failureLimit) {
    return { allowed: false, reason: 'failure-limit', retryAfterSeconds, resetWindow: expired };
  }

  return { allowed: true, reason: 'allowed', retryAfterSeconds, resetWindow: expired };
}

export function nextRateLimitState(
  state: RateLimitState | null,
  rule: RateLimitRule,
  now: number,
  isFailure: boolean,
): RateLimitState {
  const decision = evaluateRateLimit(state, rule, now);
  const windowStart = windowStartFor(now, rule.windowMs);

  return {
    windowStart,
    count: (decision.resetWindow ? 0 : (state?.count ?? 0)) + 1,
    failures: (decision.resetWindow ? 0 : (state?.failures ?? 0)) + (isFailure ? 1 : 0),
  };
}
