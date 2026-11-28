import { DomainError } from '@personal-os/domain';
import type { ErrorCode } from '@personal-os/shared';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from '../env';
import {
  dataStoreFailureFields,
  securityLogFields,
  type DataStoreFailureCategory,
} from './observability';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'BUSINESS_RULE_VIOLATION',
  429: 'RATE_LIMITED',
  503: 'DEPENDENCY_UNAVAILABLE',
};

function httpStatusIsAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function safeErrorName(err: unknown): string {
  const name = err instanceof Error ? err.name : 'UnknownError';
  return /^[A-Z][A-Z0-9_]{1,39}$/.test(name) ? name : 'UnknownError';
}

/**
 * Classifica falhas do D1 sem jamais registrar a mensagem original: o texto
 * pode conter SQL com valores sensíveis. Apenas a categoria orienta o cliente
 * e o diagnóstico interno.
 */
export function classifyDataStoreFailure(err: unknown): DataStoreFailureCategory | null {
  if (!(err instanceof Error)) return null;
  const names: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 3 && typeof current === 'object' && current !== null; depth += 1) {
    const name = (current as { name?: unknown }).name;
    if (typeof name === 'string') names.push(name);
    current = (current as { cause?: unknown }).cause;
  }
  const text = `${names.join(' ')} ${err.message}`;
  if (
    /SQLITE_CONSTRAINT|UNIQUE constraint failed|FOREIGN KEY constraint failed|NOT NULL constraint failed|CHECK constraint failed/i.test(
      text,
    )
  ) {
    return 'constraint';
  }
  if (
    /D1_ERROR|D1_EXEC_ERROR|D1_CREATE_STATEMENT_ERROR|D1_BINDING_ERROR|SQLITE_BUSY|SQLITE_LOCKED|database is locked|database is busy|timeout|timed out|interrupted|fetch failed|unavailable/i.test(
      text,
    )
  ) {
    return 'unavailable';
  }
  return /D1|SQLITE|DATABASE/i.test(names.join(' ')) ? 'execution' : null;
}

const STATUS_BY_DOMAIN_CODE: Record<DomainError['code'], ContentfulStatusCode> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
};

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId') ?? 'unknown';
  const code: ErrorCode =
    err instanceof DomainError
      ? err.code
      : err instanceof HTTPException
        ? (CODE_BY_STATUS[err.status] ?? 'INTERNAL_ERROR')
        : 'INTERNAL_ERROR';
  const status = err instanceof DomainError ? STATUS_BY_DOMAIN_CODE[err.code] : 500;
  const details = err instanceof DomainError ? err.details : undefined;
  const effectiveStatus = err instanceof HTTPException ? err.status : status;
  c.set('errorCode', code);

  if (code === 'DEPENDENCY_UNAVAILABLE') {
    console.error(
      JSON.stringify(
        securityLogFields('dependency_unavailable', {
          requestId,
          path: c.req.path,
          status: effectiveStatus,
          code,
        }),
      ),
    );
  } else if (httpStatusIsAuthFailure(effectiveStatus)) {
    console.warn(
      JSON.stringify(
        securityLogFields('auth_failure', {
          requestId,
          path: c.req.path,
          status: effectiveStatus,
          code,
        }),
      ),
    );
  }

  if (err instanceof HTTPException) {
    const httpStatus = err.status;
    const httpCode = CODE_BY_STATUS[httpStatus] ?? 'INTERNAL_ERROR';
    const retryAfter = err.res?.headers.get('Retry-After');
    if (retryAfter !== null && retryAfter !== undefined) {
      c.header('Retry-After', retryAfter);
    }
    return c.json(
      {
        error: {
          code: httpCode,
          message: err.message || 'Erro na requisição.',
          requestId,
        },
      },
      httpStatus,
    );
  }

  if (err instanceof DomainError) {
    if (details !== undefined) {
      return c.json({ error: { code, message: err.message, details, requestId } }, status);
    }
    return c.json({ error: { code, message: err.message, requestId } }, status);
  }

  const dataStoreCategory = classifyDataStoreFailure(err);
  if (dataStoreCategory !== null) {
    const dataStoreCode: ErrorCode =
      dataStoreCategory === 'constraint' ? 'CONFLICT' : 'DEPENDENCY_UNAVAILABLE';
    const dataStoreStatus = dataStoreCategory === 'constraint' ? 409 : 503;
    c.set('errorCode', dataStoreCode);
    console.error(
      JSON.stringify(
        dataStoreFailureFields({
          requestId,
          path: c.req.path,
          status: dataStoreStatus,
          code: dataStoreCode,
          category: dataStoreCategory,
          errorName: safeErrorName(err),
        }),
      ),
    );
    return c.json(
      {
        error: {
          code: dataStoreCode,
          message:
            dataStoreCategory === 'constraint'
              ? 'Conflito de dados.'
              : 'Serviço temporariamente indisponível.',
          requestId,
        },
      },
      dataStoreStatus,
    );
  }

  // Nunca expor stack trace, SQL ou dados do usuário. Apenas o tipo do erro
  // para correlação com os logs estruturados do provedor.
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'unhandled_error',
      requestId,
      errorName: safeErrorName(err),
    }),
  );

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno.',
        requestId,
      },
    },
    500,
  );
};
