import type { ErrorCode } from '@personal-os/shared';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../env';

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

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId') ?? 'unknown';

  if (err instanceof HTTPException) {
    const status = err.status;
    const code = CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR';

    return c.json(
      {
        error: {
          code,
          message: err.message || 'Erro na requisição.',
          requestId,
        },
      },
      status,
    );
  }

  // Nunca expor stack trace, SQL ou dados do usuário. Apenas o tipo do erro
  // para correlação com os logs estruturados do provedor.
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'unhandled_error',
      requestId,
      errorName: err instanceof Error ? err.name : 'UnknownError',
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
