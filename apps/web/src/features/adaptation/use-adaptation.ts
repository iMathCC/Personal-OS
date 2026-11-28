import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdaptationDashboardDto,
  AdaptationDashboardQuery,
  AdaptationDecisionRequest,
  AdaptationHistoryItemDto,
} from '@personal-os/shared';
import { adaptationApi } from '@/lib/api';
import { useDecisionRequest } from '../decision/use-decision';

export interface AdaptationSelection {
  comparison: 'week' | 'month' | 'quarter' | 'custom';
  from?: string;
  to?: string;
}

function query(selection: AdaptationSelection): Partial<AdaptationDashboardQuery> {
  return {
    comparison: selection.comparison,
    ...(selection.from && selection.to ? { from: selection.from, to: selection.to } : {}),
  };
}

export function useAdaptationDashboard(selection: AdaptationSelection) {
  const q = useMemo(() => query(selection), [selection]);
  const key = `${q.comparison ?? ''}|${q.from ?? ''}|${q.to ?? ''}`;
  const load = useCallback((signal: AbortSignal) => adaptationApi.dashboard(q, signal), [q]);
  return useDecisionRequest<AdaptationDashboardDto>(
    load,
    key,
    'Falha ao carregar a adaptação estratégica.',
  );
}

export function useAdaptationHistory() {
  const [items, setItems] = useState<AdaptationHistoryItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((v) => v + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- recarrega histórico ao mudar tentativa explícita */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage(null);
    void adaptationApi
      .history({}, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setMessage(err instanceof Error ? err.message : 'Falha ao carregar histórico.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadMore = useCallback(() => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    void adaptationApi
      .history({ cursor: nextCursor })
      .then((page) => {
        setItems((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((err: unknown) =>
        setMessage(err instanceof Error ? err.message : 'Falha ao carregar histórico.'),
      )
      .finally(() => setLoadingMore(false));
  }, [hasMore, nextCursor, loadingMore]);

  return { items, loading, loadingMore, message, hasMore, loadMore, reload };
}

export async function submitAdaptationDecision(input: AdaptationDecisionRequest) {
  return adaptationApi.decide(input, crypto.randomUUID());
}
