import type { SQL } from 'drizzle-orm';
import {
  batchSql,
  claimIdempotencyStatement,
  completeIdempotencyStatement,
  findOperationResult,
  findReservation,
  insertOperationResultStatement,
  newId,
  reserveIdempotencyStatement,
  type Database,
} from '@personal-os/db';
import {
  assertClientKey,
  assertOperationPath,
  assertResultSize,
  canonicalIdempotencyKey,
  conflict,
  mirrorFor,
} from '@personal-os/domain';
import { sha256Hex } from '../auth/security';

/**
 * Janela operacional da linha descartável `idempotency_keys`. Não é política de
 * retenção: reserva e resultado são append-only e não são removidos por limpeza.
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyRequest {
  db: Database;
  subject: string;
  method: string;
  /** Caminho sem query: entra na identidade da chave. */
  path: string;
  /** Query bruta: entra apenas no hash, nunca na chave. */
  query: string;
  clientKey: string;
  rawBody: string;
  /** Instante UTC ISO-8601 com ms, injetado pelo chamador. */
  now: string;
}

export interface MutationPlan {
  status: 200 | 201;
  /** Envelope JSON já serializado; sua forma é validada antes da mutação. */
  bodyJson: string;
  /** Mutação + auditoria, nesta ordem, dentro do mesmo `db.batch()`. */
  statements: readonly SQL[];
}

export interface MutationContext {
  opId: string;
  now: string;
}

export interface IdempotentResult {
  status: number;
  bodyJson: string;
  opId: string;
  replayed: boolean;
}

/** Hash da requisição: método, caminho, query e corpo — nunca o requestId. */
export async function requestFingerprint(input: {
  method: string;
  path: string;
  query: string;
  rawBody: string;
}): Promise<string> {
  return sha256Hex([input.method.toUpperCase(), input.path, input.query, input.rawBody].join('\n'));
}

async function replayFromStore(
  db: Database,
  key: string,
  requestHash: string,
): Promise<IdempotentResult | null> {
  const result = await findOperationResult(db, key);
  if (result === undefined) return null;
  if (result.requestHash !== requestHash) {
    throw conflict('Chave idempotente já usada com conteúdo diferente.');
  }
  return {
    status: result.statusCode,
    bodyJson: result.bodyJson,
    opId: result.operationId,
    replayed: true,
  };
}

/**
 * Executa uma mutação exatamente uma vez por chave canônica.
 *
 * A reserva permanente é gravada ANTES da mutação; o `claim` na tabela
 * operacional é o guard de concorrência: duas requisições concorrentes
 * produzem um único `db.batch()` vencedor e o perdedor recupera o resultado
 * original de `operation_results` (append-only).
 */
export async function executeIdempotent(
  input: IdempotencyRequest,
  plan: (context: MutationContext) => MutationPlan,
): Promise<IdempotentResult> {
  const clientKey = assertClientKey(input.clientKey);
  const path = assertOperationPath(input.path);
  const key = canonicalIdempotencyKey(input.subject, input.method, path, clientKey);
  const requestHash = await requestFingerprint({
    method: input.method,
    path,
    query: input.query,
    rawBody: input.rawBody,
  });
  const opId = newId();
  const expiresAt = new Date(Date.parse(input.now) + IDEMPOTENCY_TTL_MS).toISOString();

  await batchSql(input.db, [
    reserveIdempotencyStatement({ key, opId, requestHash, createdAt: input.now }),
  ]);

  const reservation = await findReservation(input.db, key);
  if (reservation === undefined || reservation.operationId !== opId) {
    if (reservation !== undefined && reservation.requestHash !== requestHash) {
      throw conflict('Chave idempotente já usada com conteúdo diferente.');
    }
    const replayed = await replayFromStore(input.db, key, requestHash);
    if (replayed !== null) return replayed;
    throw conflict('Operação idempotente em andamento; tente novamente.');
  }

  const mutation = plan({ opId, now: input.now });
  // Limite verificado ANTES de qualquer mutação de domínio.
  assertResultSize(mutation.bodyJson);
  const { mirror } = mirrorFor(mutation.bodyJson);

  try {
    await batchSql(input.db, [
      claimIdempotencyStatement({
        key,
        method: input.method.toUpperCase(),
        path,
        requestHash,
        subject: input.subject,
        opId,
        expiresAt,
        createdAt: input.now,
      }),
      ...mutation.statements,
      insertOperationResultStatement({
        key,
        opId,
        requestHash,
        statusCode: mutation.status,
        bodyJson: mutation.bodyJson,
      }),
      completeIdempotencyStatement({
        key,
        opId,
        statusCode: mutation.status,
        mirrorJson: mirror,
        expiresAt,
      }),
    ]);
  } catch (error) {
    // O guard de claim pode ter perdido a corrida: a outra requisição já
    // gravou o resultado canônico, que deve ser devolvido ao chamador.
    const replayed = await replayFromStore(input.db, key, requestHash);
    if (replayed !== null) return replayed;
    throw error;
  }

  return { status: mutation.status, bodyJson: mutation.bodyJson, opId, replayed: false };
}
