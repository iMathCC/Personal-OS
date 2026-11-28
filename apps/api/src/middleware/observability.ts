import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

export interface RequestLogInput {
  requestId: string;
  method: string;
  /** URL completa; a query é removida antes de qualquer log. */
  path: string;
  status: number;
  durationMs: number;
  errorCode: string | null;
}

/**
 * Campos permitidos em log. Não existem entradas para cookies, tokens, corpo,
 * IP bruto ou User-Agent — estes nunca devem chegar ao coletor.
 */
export function requestLogFields(input: RequestLogInput): Record<string, string | number> {
  const path = input.path.split('?')[0] ?? '';
  return {
    level: input.status >= 500 ? 'error' : input.status >= 400 ? 'warn' : 'info',
    event: 'api_request',
    requestId: input.requestId,
    method: input.method.toUpperCase(),
    path,
    status: input.status,
    durationMs: input.durationMs,
    ...(input.errorCode === null ? {} : { code: input.errorCode }),
  };
}

/** Eventos de segurança: apenas código, status e caminho sem query. */
export function securityLogFields(
  event: 'auth_failure' | 'dependency_unavailable',
  input: { requestId: string; path: string; status: number; code: string },
): Record<string, string | number> {
  return {
    level: event === 'auth_failure' ? 'warn' : 'error',
    event,
    requestId: input.requestId,
    path: input.path.split('?')[0] ?? '',
    status: input.status,
    code: input.code,
  };
}

export type DataStoreFailureCategory = 'unavailable' | 'constraint' | 'execution';

/**
 * Diagnóstico interno de falha do D1. Nunca inclui mensagem, SQL, valores,
 * corpo, cookies ou tokens — apenas categoria e nome técnico sanitizado.
 */
export function dataStoreFailureFields(input: {
  requestId: string;
  path: string;
  status: number;
  code: string;
  category: DataStoreFailureCategory;
  errorName: string;
}): Record<string, string | number> {
  return {
    level: 'error',
    event: 'data_store_failure',
    requestId: input.requestId,
    path: input.path.split('?')[0] ?? '',
    status: input.status,
    code: input.code,
    category: input.category,
    errorName: input.errorName,
  };
}

/** Log de conclusão por requisição, com duração relativa (latência local). */
export const requestLogging = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  await next();
  const fields = requestLogFields({
    requestId: c.get('requestId') ?? 'unknown',
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - start,
    errorCode: c.get('errorCode') ?? null,
  });
  const line = JSON.stringify(fields);
  if (fields.level === 'error') console.error(line);
  else if (fields.level === 'warn') console.warn(line);
  else console.info(line);
});
