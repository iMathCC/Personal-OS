import { useCallback, useEffect, useState } from 'react';
import { ApiError, type LifePeriod, type Page } from '@/lib/api';

export interface AsyncState<T> {
  readonly status: 'loading' | 'ready' | 'error';
  readonly data: T | null;
  readonly error: string | null;
  readonly reload: () => void;
}

export function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'CONFLICT' || error.code === 'BUSINESS_RULE_VIOLATION') return error.message;
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return 'Não foi possível concluir a operação.';
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Reutiliza a chave da mesma tentativa de confirmação. Uma nova chave só é
 * gerada quando o rascunho muda ou quando a operação terminou; assim uma falha
 * de rede repetida não transforma um envio já aceito em uma segunda gravação.
 */
export function idempotencyKeyFor(
  existing: string | null,
  generate: () => string = newIdempotencyKey,
): string {
  return existing === null ? generate() : existing;
}

/** `nextCursor` é opcional: `undefined` não é um cursor navegável. */
export function hasNextCursor<T>(page: Page<T> | null): page is Page<T> & { nextCursor: string } {
  return page !== null && page.nextCursor !== undefined;
}

export function useLifeResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono */
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    void loader(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(failureMessage(cause));
        setStatus('error');
      });
    return () => controller.abort();
    // O loader é recriado por render; `deps` controla a invalidação explícita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { status, data, error, reload };
}

export function useDefaultPeriod(): [LifePeriod, (period: LifePeriod) => void] {
  const [period, setPeriod] = useState<LifePeriod>(() => {
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 89);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });
  return [period, setPeriod];
}

export function formatCents(cents: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatRatio(ratio: number | null): string {
  return ratio === null ? 'desconhecido' : `${Math.round(ratio * 100)}%`;
}
