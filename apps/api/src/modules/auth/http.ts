import { DomainError } from '@personal-os/domain';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../../env';

type AppContext = Context<AppEnv>;

export function jsonOk<T>(c: AppContext, data: T, status: 200 | 201 = 200) {
  return c.json({ data, meta: { requestId: c.get('requestId') } }, status);
}

/** Corpo já limitado pelo middleware, validado com o schema do contrato. */
export function parseBody<S extends z.ZodType>(c: AppContext, schema: S): z.infer<S> {
  let value: unknown;
  try {
    value = JSON.parse(c.get('rawBody'));
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'JSON inválido.');
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError('VALIDATION_ERROR', 'Dados inválidos.', {
      details: {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
    });
  }
  return parsed.data;
}
