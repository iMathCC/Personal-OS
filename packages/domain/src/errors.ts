/**
 * Códigos de erro de domínio. A camada de API converte cada código para o
 * status HTTP e o `ErrorCode` do contrato público.
 */
export type DomainErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'BUSINESS_RULE_VIOLATION'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_UNAVAILABLE';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: DomainErrorCode,
    message: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.name = 'DomainError';
    this.code = code;
    this.details = options?.details;
  }
}

export function unauthenticated(message = 'Autenticação necessária.'): DomainError {
  return new DomainError('UNAUTHENTICATED', message);
}

export function forbidden(message = 'Acesso negado.'): DomainError {
  return new DomainError('FORBIDDEN', message);
}

export function notFound(message = 'Recurso não encontrado.'): DomainError {
  return new DomainError('NOT_FOUND', message);
}

export function conflict(message = 'O recurso está em estado incompatível.'): DomainError {
  return new DomainError('CONFLICT', message);
}

export function validationError(message = 'Dados inválidos.'): DomainError {
  return new DomainError('VALIDATION_ERROR', message);
}

export function businessRule(message = 'Regra de negócio violada.'): DomainError {
  return new DomainError('BUSINESS_RULE_VIOLATION', message);
}

export function rateLimited(message = 'Limite de requisições excedido.'): DomainError {
  return new DomainError('RATE_LIMITED', message);
}

export function dependencyUnavailable(message = 'Dependência indisponível.'): DomainError {
  return new DomainError('DEPENDENCY_UNAVAILABLE', message);
}
