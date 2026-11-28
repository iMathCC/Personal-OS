import { useCallback, useEffect, useState } from 'react';
import type {
  DecisionAlertDto,
  DecisionAlertStateResultDto,
  DecisionCrossDomainDto,
  DecisionDashboardDto,
  DecisionListQuery,
  DecisionNextActionDto,
  DecisionRecommendationDto,
  DecisionReviewDto,
  DecisionReviewQuery,
} from '@personal-os/shared';
import { decisionApi, type DecisionCatalogItem, type Page } from '@/lib/api';
import {
  buildAlertsQuery,
  createIdempotencyKey,
  versionForMutation,
  type AlertFilters,
} from './format';

type PeriodParams = Partial<Pick<DecisionListQuery, 'comparison' | 'from' | 'to'>>;
type AlertAction = 'acknowledged' | 'dismissed';

function periodQuery(
  comparison: PeriodParams['comparison'],
  from: string | undefined,
  to: string | undefined,
): PeriodParams {
  return {
    ...(comparison === undefined ? {} : { comparison }),
    ...(from === undefined || to === undefined ? {} : { from, to }),
  };
}

function periodKey(
  comparison: PeriodParams['comparison'],
  from: string | undefined,
  to: string | undefined,
): string {
  return `${comparison ?? ''}|${from ?? ''}|${to ?? ''}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface DecisionRequestController<T> {
  data: T | null;
  loading: boolean;
  message: string | null;
  reload: () => void;
}

/** Uma consulta, um abort controller: nenhum dado permanece de uma consulta anterior. */
export function useDecisionRequest<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
  fallbackMessage: string,
): DecisionRequestController<T> {
  const [data, setData] = useState<T | null>(null);
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
    void load(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage(errorMessage(error, fallbackMessage));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fallbackMessage, key, load, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { data, loading, message, reload };
}

export interface DecisionPageController<T> {
  page: Page<T>;
  loading: boolean;
  loadingMore: boolean;
  message: string | null;
  reload: () => void;
  loadMore: () => void;
}

export function useDecisionPage<T>(
  loadPage: (cursor: string | undefined, signal?: AbortSignal) => Promise<Page<T>>,
  key: string,
  fallbackMessage: string,
): DecisionPageController<T> {
  const [page, setPage] = useState<Page<T>>({ items: [], hasMore: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPage({ items: [], hasMore: false });
    setMessage(null);
    void loadPage(undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage(errorMessage(error, fallbackMessage));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fallbackMessage, key, loadPage, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadMore = useCallback(() => {
    if (!page.hasMore || page.nextCursor === undefined || loadingMore) return;
    setLoadingMore(true);
    void loadPage(page.nextCursor)
      .then((next) => {
        setPage((current) => ({
          items: [...current.items, ...next.items],
          nextCursor: next.nextCursor,
          hasMore: next.hasMore,
          ...(next.truncated === undefined ? {} : { truncated: next.truncated }),
        }));
      })
      .catch((error: unknown) => setMessage(errorMessage(error, fallbackMessage)))
      .finally(() => setLoadingMore(false));
  }, [fallbackMessage, loadPage, loadingMore, page.hasMore, page.nextCursor]);

  return { page, loading, loadingMore, message, reload, loadMore };
}

export function useDecisionDashboard(
  comparison: PeriodParams['comparison'],
  from: string | undefined,
  to: string | undefined,
): DecisionRequestController<DecisionDashboardDto> {
  const load = useCallback(
    (signal: AbortSignal) => decisionApi.lifeDashboard(periodQuery(comparison, from, to), signal),
    [comparison, from, to],
  );
  return useDecisionRequest(
    load,
    periodKey(comparison, from, to),
    'Falha ao carregar o painel integrado.',
  );
}

export function useDecisionAlerts(filters: AlertFilters): DecisionPageController<DecisionAlertDto> {
  const { severity, area, state, comparison, from, to } = filters;
  const loadPage = useCallback(
    (cursor: string | undefined, signal?: AbortSignal) =>
      decisionApi.alerts(
        buildAlertsQuery({ severity, area, state, comparison, from, to }, cursor),
        signal,
      ),
    [severity, area, state, comparison, from, to],
  );
  const key = `${severity ?? ''}|${area}|${state ?? ''}|${periodKey(comparison, from, to)}`;
  return useDecisionPage<DecisionAlertDto>(loadPage, key, 'Falha ao carregar alertas.');
}

export interface DecisionDecisionsController {
  recommendations: DecisionPageController<DecisionRecommendationDto>;
  nextActions: DecisionPageController<DecisionNextActionDto>;
  crossDomain: DecisionRequestController<
    Page<DecisionCrossDomainDto> & { catalog: DecisionCatalogItem[] }
  >;
  catalog: DecisionRequestController<DecisionCatalogItem[]>;
}

export function useDecisionDecisions(
  comparison: PeriodParams['comparison'],
  from: string | undefined,
  to: string | undefined,
): DecisionDecisionsController {
  const key = periodKey(comparison, from, to);
  const loadRecommendations = useCallback(
    (cursor: string | undefined, signal?: AbortSignal) =>
      decisionApi.recommendations(
        {
          ...periodQuery(comparison, from, to),
          ...(cursor === undefined ? {} : { cursor }),
        },
        signal,
      ),
    [comparison, from, to],
  );
  const loadNextActions = useCallback(
    (cursor: string | undefined, signal?: AbortSignal) =>
      decisionApi.nextActions(
        {
          ...periodQuery(comparison, from, to),
          ...(cursor === undefined ? {} : { cursor }),
        },
        signal,
      ),
    [comparison, from, to],
  );
  const loadCrossDomain = useCallback(
    (signal: AbortSignal) => decisionApi.crossDomain(periodQuery(comparison, from, to), signal),
    [comparison, from, to],
  );
  const loadCatalog = useCallback(
    (signal: AbortSignal) => decisionApi.catalog(periodQuery(comparison, from, to), signal),
    [comparison, from, to],
  );

  return {
    recommendations: useDecisionPage<DecisionRecommendationDto>(
      loadRecommendations,
      `rec:${key}`,
      'Falha ao carregar recomendações.',
    ),
    nextActions: useDecisionPage<DecisionNextActionDto>(
      loadNextActions,
      `actions:${key}`,
      'Falha ao carregar próximas ações.',
    ),
    crossDomain: useDecisionRequest(
      loadCrossDomain,
      `cross:${key}`,
      'Falha ao carregar relações entre domínios.',
    ),
    catalog: useDecisionRequest(loadCatalog, `catalog:${key}`, 'Falha ao carregar o catálogo.'),
  };
}

export function useDecisionReviews(
  kind: DecisionReviewDto['kind'],
  comparison: DecisionReviewQuery['comparison'],
  from: string | undefined,
  to: string | undefined,
): DecisionRequestController<DecisionReviewDto> {
  const load = useCallback(
    (signal: AbortSignal) =>
      decisionApi.performanceReview(
        {
          kind,
          ...(comparison === undefined ? {} : { comparison }),
          ...(from === undefined || to === undefined ? {} : { from, to }),
        },
        signal,
      ),
    [kind, comparison, from, to],
  );
  return useDecisionRequest(
    load,
    `${kind}|${periodKey(comparison, from, to)}`,
    'Falha ao carregar a revisão de desempenho.',
  );
}

export interface AlertStateMutationController {
  pendingIds: readonly string[];
  message: string | null;
  changeState: (
    alert: DecisionAlertDto,
    action: AlertAction,
  ) => Promise<DecisionAlertStateResultDto | null>;
  clearMessage: () => void;
}

/** Cada transição recebe chave de idempotência própria e a versão vigente do alerta. */
export function useAlertStateMutation(): AlertStateMutationController {
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const clearMessage = useCallback(() => setMessage(null), []);

  const changeState = useCallback(async (alert: DecisionAlertDto, action: AlertAction) => {
    const version = versionForMutation(alert.stateVersion);
    const idempotencyKey = createIdempotencyKey();
    setPendingIds((current) => [...current, alert.id]);
    setMessage(null);
    try {
      return action === 'acknowledged'
        ? await decisionApi.acknowledgeAlert(alert.id, { version }, idempotencyKey)
        : await decisionApi.dismissAlert(alert.id, { version }, idempotencyKey);
    } catch (error) {
      setMessage(errorMessage(error, 'Não foi possível registrar a decisão sobre o alerta.'));
      return null;
    } finally {
      setPendingIds((current) => current.filter((id) => id !== alert.id));
    }
  }, []);

  return { pendingIds, message, changeState, clearMessage };
}
