import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateLifeGoalRequest,
  CreateMilestoneRequest,
  GoalAreaDto,
  GoalDashboardData,
  GoalDetailDto,
  GoalListQuery,
  LifeGoalDto,
  UpdateGoalRequest,
  UpdateMilestoneRequest,
} from '@personal-os/shared';
import { ApiError, goalsApi, type Page } from '@/lib/api';

export const SORT_OPTIONS = [
  { value: 'priority', label: 'Prioridade' },
  { value: 'target', label: 'Prazo' },
  { value: 'progress', label: 'Progresso' },
  { value: 'updated', label: 'Atualização' },
] as const;

export interface GoalFilters {
  area: string;
  status: '' | LifeGoalDto['status'];
  q: string;
  sort: NonNullable<GoalListQuery['sort']>;
}

const INITIAL_FILTERS: GoalFilters = { area: '', status: '', q: '', sort: 'priority' };

export type GoalsState =
  | { status: 'loading' }
  | {
      status: 'ready';
      dashboard: GoalDashboardData;
      areas: GoalAreaDto[];
      page: Page<LifeGoalDto>;
    }
  | { status: 'error'; message: string; sessionExpired: boolean };

export type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: GoalDetailDto }
  | { status: 'error'; message: string };

export interface GoalMutation {
  busy: boolean;
  message: string | null;
  error: string | null;
}

export interface GoalsController {
  state: GoalsState;
  filters: GoalFilters;
  detail: DetailState;
  mutation: GoalMutation;
  loadingMore: boolean;
  loadMoreError: string | null;
  setFilter: <K extends keyof GoalFilters>(key: K, value: GoalFilters[K]) => void;
  reload: () => void;
  loadMore: () => void;
  select: (id: string | null) => void;
  clearMutation: () => void;
  create: (input: CreateLifeGoalRequest) => Promise<boolean>;
  update: (goal: LifeGoalDto, input: UpdateGoalRequest) => Promise<boolean>;
  setStatus: (goal: LifeGoalDto, action: 'complete' | 'reopen' | 'archive') => Promise<boolean>;
  setProgress: (goal: LifeGoalDto, percent: number) => Promise<boolean>;
  addMilestone: (goal: LifeGoalDto, input: CreateMilestoneRequest) => Promise<boolean>;
  updateMilestone: (
    goal: LifeGoalDto,
    milestoneId: string,
    version: number,
    input: UpdateMilestoneRequest,
  ) => Promise<boolean>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function newKey(): string {
  return crypto.randomUUID();
}

export function useGoals(): GoalsController {
  const [state, setState] = useState<GoalsState>({ status: 'loading' });
  const [filters, setFiltersState] = useState<GoalFilters>(INITIAL_FILTERS);
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [mutation, setMutation] = useState<GoalMutation>({
    busy: false,
    message: null,
    error: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const clearMutation = useCallback(
    () => setMutation({ busy: false, message: null, error: null }),
    [],
  );
  const setFilter = useCallback(<K extends keyof GoalFilters>(key: K, value: GoalFilters[K]) => {
    setFiltersState((current) => ({ ...current, [key]: value }));
    // Um detalhe selecionado pode sair do novo conjunto filtrado.
    setSelectedId(null);
    setDetail({ status: 'idle' });
  }, []);
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setDetail(id === null ? { status: 'idle' } : { status: 'loading' });
  }, []);

  const trimmedQuery = filters.q.trim();
  const query: GoalListQuery = {
    ...(filters.area === '' ? {} : { area: filters.area }),
    ...(filters.status === '' ? {} : { status: filters.status }),
    ...(trimmedQuery === '' ? {} : { q: trimmedQuery }),
    sort: filters.sort,
    limit: 25,
  };

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono dos dados */
  useEffect(() => {
    generationRef.current += 1;
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadingMore(false);
    const controller = new AbortController();
    setLoadMoreError(null);
    setState({ status: 'loading' });
    void Promise.all([
      goalsApi.dashboard(controller.signal),
      goalsApi.areas(controller.signal),
      goalsApi.list(query, controller.signal),
    ])
      .then(([dashboard, areas, page]) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', dashboard, areas, page });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const expired = error instanceof ApiError && error.status === 401;
        setState({
          status: 'error',
          message: expired
            ? 'Sua sessão expirou. Entre novamente para continuar.'
            : 'Não foi possível carregar os objetivos. Tente novamente.',
          sessionExpired: expired,
        });
      });
    return () => controller.abort();
    // `query` é recreado a cada render; as dependências primitivas evitam recargas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, filters.area, filters.status, trimmedQuery, filters.sort]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- transição explícita para carregamento do detalhe */
  useEffect(() => {
    if (selectedId === null) return;
    const controller = new AbortController();
    setDetail({ status: 'loading' });
    void goalsApi
      .detail(selectedId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetail({
          status: 'error',
          message: errorMessage(error, 'Não foi possível carregar este objetivo.'),
        });
      });
    return () => controller.abort();
  }, [selectedId, detailAttempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(
    () => () => {
      loadMoreControllerRef.current?.abort();
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || state.page.nextCursor === undefined || loadingMore) return;
    const cursor = state.page.nextCursor;
    const generation = generationRef.current;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    void goalsApi
      .list({ ...query, cursor }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                page: {
                  items: [
                    ...current.page.items,
                    ...page.items.filter(
                      (item) => !current.page.items.some((existing) => existing.id === item.id),
                    ),
                  ],
                  ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
                  hasMore: page.hasMore,
                  ...(current.page.truncated === undefined
                    ? {}
                    : { truncated: current.page.truncated }),
                  ...(page.truncated === true ? { truncated: true } : {}),
                },
              }
            : current,
        );
      })
      .catch(() => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setLoadMoreError('Não foi possível carregar mais objetivos.');
      })
      .finally(() => {
        if (loadMoreControllerRef.current !== controller) return;
        loadMoreControllerRef.current = null;
        setLoadingMore(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loadingMore, filters.area, filters.status, filters.q, filters.sort]);

  const runMutation = useCallback(
    async (action: () => Promise<unknown>, message: string): Promise<boolean> => {
      setMutation({ busy: true, message: null, error: null });
      try {
        await action();
        setMutation({ busy: false, message, error: null });
        reload();
        setDetailAttempt((value) => value + 1);
        return true;
      } catch (error: unknown) {
        setMutation({
          busy: false,
          message: null,
          error: errorMessage(error, 'Não foi possível salvar a alteração.'),
        });
        return false;
      }
    },
    [reload],
  );

  const create = useCallback(
    async (input: CreateLifeGoalRequest) =>
      runMutation(() => goalsApi.create(input, newKey()), 'Objetivo criado.'),
    [runMutation],
  );

  const update = useCallback(
    async (goal: LifeGoalDto, input: UpdateGoalRequest) =>
      runMutation(
        () => goalsApi.update(goal.id, input, newKey(), goal.version),
        'Objetivo atualizado.',
      ),
    [runMutation],
  );

  const setStatus = useCallback(
    async (goal: LifeGoalDto, action: 'complete' | 'reopen' | 'archive') =>
      runMutation(
        () => goalsApi[action](goal.id, newKey(), goal.version),
        action === 'complete'
          ? 'Objetivo concluído.'
          : action === 'reopen'
            ? 'Objetivo reaberto.'
            : 'Objetivo arquivado.',
      ),
    [runMutation],
  );

  const setProgress = useCallback(
    async (goal: LifeGoalDto, percent: number) =>
      runMutation(
        () => goalsApi.updateProgress(goal.id, percent, newKey(), goal.version),
        'Progresso atualizado.',
      ),
    [runMutation],
  );

  const addMilestone = useCallback(
    async (goal: LifeGoalDto, input: CreateMilestoneRequest) =>
      runMutation(() => goalsApi.createMilestone(goal.id, input, newKey()), 'Marco adicionado.'),
    [runMutation],
  );

  const updateMilestone = useCallback(
    async (
      goal: LifeGoalDto,
      milestoneId: string,
      version: number,
      input: UpdateMilestoneRequest,
    ) =>
      runMutation(
        () => goalsApi.updateMilestone(goal.id, milestoneId, input, newKey(), version),
        'Marco atualizado.',
      ),
    [runMutation],
  );

  return {
    state,
    filters,
    detail,
    mutation,
    loadingMore,
    loadMoreError,
    setFilter,
    reload,
    loadMore,
    select,
    clearMutation,
    create,
    update,
    setStatus,
    setProgress,
    addMilestone,
    updateMilestone,
  };
}
