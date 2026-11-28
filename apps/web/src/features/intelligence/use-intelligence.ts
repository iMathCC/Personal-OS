import { useCallback, useEffect, useState } from 'react';
import type {
  IntelligenceDashboardData,
  IntelligenceTimelineEventDto,
  IntelligenceTimelineQuery,
} from '@personal-os/shared';
import { intelligenceApi, type Page } from '@/lib/api';

export interface IntelligenceDashboardController {
  data: IntelligenceDashboardData | null;
  loading: boolean;
  message: string | null;
  reload: () => void;
}

/** O painel nunca inventa números: sem resposta, `data` permanece `null`. */
export function useIntelligenceDashboard(weeks: number): IntelligenceDashboardController {
  const [data, setData] = useState<IntelligenceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setMessage(null);
    void intelligenceApi
      .dashboard({ weeks }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar inteligência.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [weeks, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { data, loading, message, reload };
}

export interface IntelligenceTimelineController {
  status: 'loading' | 'ready' | 'error';
  page: Page<IntelligenceTimelineEventDto>;
  loadingMore: boolean;
  message: string | null;
  reload: () => void;
  loadMore: () => void;
}

const TIMELINE_LIMIT = 25;

export function useIntelligenceTimeline(
  area?: IntelligenceTimelineQuery['area'],
): IntelligenceTimelineController {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState<Page<IntelligenceTimelineEventDto>>({
    items: [],
    hasMore: false,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono */
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setPage({ items: [], hasMore: false });
    setMessage(null);
    void intelligenceApi
      .timeline(
        { limit: TIMELINE_LIMIT, ...(area === undefined ? {} : { area }) },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) {
          setPage(result);
          setStatus('ready');
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error ? error.message : 'Falha ao carregar a linha do tempo.',
          );
          setStatus('error');
        }
      });
    return () => controller.abort();
  }, [area, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadMore = useCallback(() => {
    if (!page.hasMore || page.nextCursor === undefined || loadingMore) return;
    setLoadingMore(true);
    void intelligenceApi
      .timeline({
        limit: TIMELINE_LIMIT,
        cursor: page.nextCursor,
        ...(area === undefined ? {} : { area }),
      })
      .then((next) => {
        setPage((current) => ({
          items: [...current.items, ...next.items],
          nextCursor: next.nextCursor,
          hasMore: next.hasMore,
        }));
      })
      .catch(() => {
        // Falha ao paginar mantém a página atual; o usuário pode tentar de novo.
      })
      .finally(() => setLoadingMore(false));
  }, [area, loadingMore, page.hasMore, page.nextCursor]);

  return { status, page, loadingMore, message, reload, loadMore };
}
