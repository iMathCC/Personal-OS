import { useCallback, useEffect, useState } from 'react';
import type { StrategyDashboardDto } from '@personal-os/shared';
import { ApiError, planningApi } from '@/lib/api';

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

/** Um único carregamento do painel compartilha visão, áreas, metas, ciclos e sinais. */
export function usePlanningDashboard(): AsyncState<StrategyDashboardDto> {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<StrategyDashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono */
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    void planningApi
      .dashboard(controller.signal)
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
  }, [attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { status, data, error, reload };
}

export function usePlanningResource<T>(
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
    // O loader é estável por página; `deps` controla a invalidação explícita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { status, data, error, reload };
}
