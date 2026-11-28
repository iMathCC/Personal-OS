import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateProjectBody,
  CreateProjectMilestoneBody,
  LifeGoalDto,
  ListProjectsQuery,
  PlanPriority,
  ProjectDetailDto,
  ProjectSummaryDto,
  UpdateProjectBody,
  UpdateProjectMilestoneBody,
} from '@personal-os/shared';
import { ApiError, goalsApi, projectsApi, type Page } from '@/lib/api';

export const PROJECT_STATUS_OPTIONS = [
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
  'archived',
] as const;

export const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;

export interface ProjectFilters {
  status: '' | ProjectSummaryDto['status'];
  priority: '' | PlanPriority;
  goalId: string;
  search: string;
}

const INITIAL_FILTERS: ProjectFilters = { status: '', priority: '', goalId: '', search: '' };

export type ProjectsState =
  | { status: 'loading' }
  | { status: 'ready'; page: Page<ProjectSummaryDto>; goals: LifeGoalDto[] }
  | { status: 'error'; message: string; sessionExpired: boolean };

export type ProjectDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ProjectDetailDto }
  | { status: 'error'; message: string };

export interface ProjectMutation {
  busy: boolean;
  message: string | null;
  error: string | null;
}

export interface ProjectsController {
  state: ProjectsState;
  filters: ProjectFilters;
  detail: ProjectDetailState;
  mutation: ProjectMutation;
  loadingMore: boolean;
  loadMoreError: string | null;
  setFilter: <K extends keyof ProjectFilters>(key: K, value: ProjectFilters[K]) => void;
  reload: () => void;
  loadMore: () => void;
  select: (id: string | null) => void;
  clearMutation: () => void;
  create: (input: CreateProjectBody) => Promise<boolean>;
  update: (project: ProjectSummaryDto, input: UpdateProjectBody) => Promise<boolean>;
  remove: (project: ProjectSummaryDto) => Promise<boolean>;
  setGoals: (project: ProjectSummaryDto, goalIds: string[]) => Promise<boolean>;
  addMilestone: (
    project: ProjectSummaryDto,
    input: Omit<CreateProjectMilestoneBody, 'version'>,
  ) => Promise<boolean>;
  updateMilestone: (
    project: ProjectSummaryDto,
    milestoneId: string,
    version: number,
    input: Omit<UpdateProjectMilestoneBody, 'version'>,
  ) => Promise<boolean>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function newKey(): string {
  return crypto.randomUUID();
}

export function useProjects(initialFilters: Partial<ProjectFilters> = {}): ProjectsController {
  const [state, setState] = useState<ProjectsState>({ status: 'loading' });
  const [filters, setFiltersState] = useState<ProjectFilters>({
    ...INITIAL_FILTERS,
    ...initialFilters,
  });
  const [detail, setDetail] = useState<ProjectDetailState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [mutation, setMutation] = useState<ProjectMutation>({
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
  const setFilter = useCallback(
    <K extends keyof ProjectFilters>(key: K, value: ProjectFilters[K]) => {
      setFiltersState((current) => ({ ...current, [key]: value }));
      setSelectedId(null);
      setDetail({ status: 'idle' });
    },
    [],
  );
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setDetail(id === null ? { status: 'idle' } : { status: 'loading' });
  }, []);

  const query: ListProjectsQuery = {
    ...(filters.status === '' ? {} : { status: filters.status }),
    ...(filters.priority === '' ? {} : { priority: filters.priority }),
    ...(filters.goalId === '' ? {} : { goalId: filters.goalId }),
    ...(filters.search.trim() === '' ? {} : { search: filters.search.trim() }),
    limit: 25,
  };

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono dos dados */
  useEffect(() => {
    generationRef.current += 1;
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadingMore(false);
    setLoadMoreError(null);
    const controller = new AbortController();
    setState({ status: 'loading' });
    // A lista de objetivos é opcional: falha nela não esconde os projetos.
    const goalsRequest = goalsApi.list({ limit: 200 }, controller.signal).then(
      (page) => page.items,
      () => [] as LifeGoalDto[],
    );
    void Promise.all([projectsApi.list(query, controller.signal), goalsRequest])
      .then(([page, goals]) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', page, goals });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const expired = error instanceof ApiError && error.status === 401;
        setState({
          status: 'error',
          message: expired
            ? 'Sua sessão expirou. Entre novamente para continuar.'
            : 'Não foi possível carregar os projetos. Tente novamente.',
          sessionExpired: expired,
        });
      });
    return () => controller.abort();
    // `query` é recriado a cada render; primitivas evitam recargas desnecessárias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, filters.status, filters.priority, filters.goalId, filters.search]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- transição explícita para carregamento do detalhe */
  useEffect(() => {
    if (selectedId === null) return;
    const controller = new AbortController();
    setDetail({ status: 'loading' });
    void projectsApi
      .detail(selectedId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetail({
          status: 'error',
          message: errorMessage(error, 'Não foi possível carregar este projeto.'),
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
    void projectsApi
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
                  ...(page.truncated === true
                    ? { truncated: true }
                    : current.page.truncated === undefined
                      ? {}
                      : { truncated: current.page.truncated }),
                },
              }
            : current,
        );
      })
      .catch(() => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setLoadMoreError('Não foi possível carregar mais projetos.');
      })
      .finally(() => {
        if (loadMoreControllerRef.current !== controller) return;
        loadMoreControllerRef.current = null;
        setLoadingMore(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loadingMore, filters.status, filters.priority, filters.goalId, filters.search]);

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
    async (input: CreateProjectBody) =>
      runMutation(() => projectsApi.create(input, newKey()), 'Projeto criado.'),
    [runMutation],
  );

  const update = useCallback(
    async (project: ProjectSummaryDto, input: UpdateProjectBody) =>
      runMutation(
        () => projectsApi.update(project.id, input, newKey(), project.version),
        'Projeto atualizado.',
      ),
    [runMutation],
  );

  const remove = useCallback(
    async (project: ProjectSummaryDto) => {
      const removed = await runMutation(
        () => projectsApi.remove(project.id, project.version),
        'Projeto excluído.',
      );
      if (removed) select(null);
      return removed;
    },
    [runMutation, select],
  );

  const setGoals = useCallback(
    async (project: ProjectSummaryDto, goalIds: string[]) =>
      runMutation(
        () => projectsApi.setGoals(project.id, goalIds, project.version, newKey()),
        'Vínculos com objetivos atualizados.',
      ),
    [runMutation],
  );

  const addMilestone = useCallback(
    async (project: ProjectSummaryDto, input: Omit<CreateProjectMilestoneBody, 'version'>) =>
      runMutation(
        () =>
          projectsApi.createMilestone(project.id, { ...input, version: project.version }, newKey()),
        'Marco adicionado.',
      ),
    [runMutation],
  );

  const updateMilestone = useCallback(
    async (
      project: ProjectSummaryDto,
      milestoneId: string,
      version: number,
      input: Omit<UpdateProjectMilestoneBody, 'version'>,
    ) =>
      runMutation(
        () =>
          projectsApi.updateMilestone(
            project.id,
            milestoneId,
            { ...input, version },
            newKey(),
            version,
          ),
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
    remove,
    setGoals,
    addMilestone,
    updateMilestone,
  };
}
