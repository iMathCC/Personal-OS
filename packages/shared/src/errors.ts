import { z } from 'zod';

/**
 * Códigos de erro estáveis da API. Adicionar um código é uma mudança
 * compatível; remover ou renomear exige nova versão da API.
 */
export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'GONE',
  'PAYLOAD_TOO_LARGE',
  'BUSINESS_RULE_VIOLATION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'DEPENDENCY_UNAVAILABLE',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.unknown().optional(),
    requestId: z.string().min(1),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
