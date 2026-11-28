import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateTaskBody,
  LifeGoalDto,
  ListTasksQuery,
  PlanPriority,
  ProjectSummaryDto,
  SetTaskDependenciesBody,
  TaskDetailDto,
  TaskDto,
  TaskStatus,
  UpdateTaskBody,
} from '@personal-os/shared';
import { ApiError, goalsApi, projectsApi, tasksApi, type Page } from '@/lib/api';

export const TASK_STATUS_OPTIONS = [
  'todo',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
] as const;

export interface TaskFilters {
  status: '' | TaskStatus;
  priority: '' | PlanPriority;
  projectId: string;
  goalId: string;
  search: string;
  dueBefore: string;
  dueAfter: string;
}

const INITIAL_FILTERS: TaskFilters = {
  status: '',
  priority: '',
  projectId: '',
  goalId: '',
  search: '',
  dueBefore: '',
  dueAfter: '',
};

export type TasksState =
  | { status: 'loading' }
  | {
      status: 'ready';
      page: Page<TaskDto>;
      projects: ProjectSummaryDto[];
      goals: LifeGoalDto[];
      candidates: TaskDto[];
    }
  | { status: 'error'; message: string; sessionExpired: boolean };

export type TaskDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: TaskDetailDto }
  | { status: 'error'; message: string };

export interface TaskMutation {
  busy: boolean;
  message: string | null;
  error: string | null;
}

export interface TasksController {
  state: TasksState;
  filters: TaskFilters;
  detail: TaskDetailState;
  mutation: TaskMutation;
  loadingMore: boolean;
  loadMoreError: string | null;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
  reload: () => void;
  loadMore: () => void;
  select: (id: string | null) => void;
  clearMutation: () => void;
  create: (input: CreateTaskBody) => Promise<boolean>;
  update: (task: TaskDto, input: UpdateTaskBody) => Promise<boolean>;
  complete: (task: TaskDto) => Promise<boolean>;
  setDependencies: (
    task: TaskDetailDto,
    dependencyIds: SetTaskDependenciesBody['dependencyIds'],
  ) => Promise<boolean>;
  remove: (task: TaskDto) => Promise<boolean>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function newKey(): string {
  return crypto.randomUUID();
}

export function useTasks(): TasksController {
  const [state, setState] = useState<TasksState>({ status: 'loading' });
  const [filters, setFiltersState] = useState<TaskFilters>(INITIAL_FILTERS);
  const [detail, setDetail] = useState<TaskDetailState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [mutation, setMutation] = useState<TaskMutation>({
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
  const setFilter = useCallback(<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => {
    setFiltersState((current) => ({ ...current, [key]: value }));
    setSelectedId(null);
    setDetail({ status: 'idle' });
  }, []);
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setDetail(id === null ? { status: 'idle' } : { status: 'loading' });
  }, []);

  const query: ListTasksQuery = {
    ...(filters.status === '' ? {} : { status: filters.status }),
    ...(filters.priority === '' ? {} : { priority: filters.priority }),
    ...(filters.projectId === '' ? {} : { projectId: filters.projectId }),
    ...(filters.goalId === '' ? {} : { goalId: filters.goalId }),
    ...(filters.search.trim() === '' ? {} : { search: filters.search.trim() }),
    ...(filters.dueBefore === '' ? {} : { dueBefore: filters.dueBefore }),
    ...(filters.dueAfter === '' ? {} : { dueAfter: filters.dueAfter }),
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
    // Listas auxiliares são opcionais: a falha delas não esconde as tarefas.
    const projectsRequest = projectsApi.list({ limit: 200 }, controller.signal).then(
      (page) => page.items,
      () => [] as ProjectSummaryDto[],
    );
    const goalsRequest = goalsApi.list({ limit: 200 }, controller.signal).then(
      (page) => page.items,
      () => [] as LifeGoalDto[],
    );
    const candidatesRequest = tasksApi.list({ limit: 200 }, controller.signal).then(
      (page) => page.items,
      () => [] as TaskDto[],
    );
    void Promise.all([
      tasksApi.list(query, controller.signal),
      projectsRequest,
      goalsRequest,
      candidatesRequest,
    ])
      .then(([page, projects, goals, candidates]) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', page, projects, goals, candidates });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const expired = error instanceof ApiError && error.status === 401;
        setState({
          status: 'error',
          message: expired
            ? 'Sua sessão expirou. Entre novamente para continuar.'
            : 'Não foi possível carregar as tarefas. Tente novamente.',
          sessionExpired: expired,
        });
      });
    return () => controller.abort();
    // `query` é recriado a cada render; primitivas evitam recargas desnecessárias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attempt,
    filters.status,
    filters.priority,
    filters.projectId,
    filters.goalId,
    filters.search,
    filters.dueBefore,
    filters.dueAfter,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- transição explícita para carregamento do detalhe */
  useEffect(() => {
    if (selectedId === null) return;
    const controller = new AbortController();
    setDetail({ status: 'loading' });
    void tasksApi
      .detail(selectedId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetail({
          status: 'error',
          message: errorMessage(error, 'Não foi possível carregar esta tarefa.'),
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
    void tasksApi
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
        setLoadMoreError('Não foi possível carregar mais tarefas.');
      })
      .finally(() => {
        if (loadMoreControllerRef.current !== controller) return;
        loadMoreControllerRef.current = null;
        setLoadingMore(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state,
    loadingMore,
    filters.status,
    filters.priority,
    filters.projectId,
    filters.goalId,
    filters.search,
    filters.dueBefore,
    filters.dueAfter,
  ]);

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
    async (input: CreateTaskBody) =>
      runMutation(() => tasksApi.create(input, newKey()), 'Tarefa criada.'),
    [runMutation],
  );

  const update = useCallback(
    async (task: TaskDto, input: UpdateTaskBody) =>
      runMutation(
        () => tasksApi.update(task.id, input, newKey(), task.version),
        'Tarefa atualizada.',
      ),
    [runMutation],
  );

  const complete = useCallback(
    async (task: TaskDto) =>
      runMutation(() => tasksApi.complete(task.id, task.version, newKey()), 'Tarefa concluída.'),
    [runMutation],
  );

  const setDependencies = useCallback(
    async (task: TaskDetailDto, dependencyIds: SetTaskDependenciesBody['dependencyIds']) =>
      runMutation(
        () => tasksApi.setDependencies(task.id, dependencyIds, task.version, newKey()),
        'Dependências atualizadas.',
      ),
    [runMutation],
  );

  const remove = useCallback(
    async (task: TaskDto) => {
      const removed = await runMutation(
        () => tasksApi.remove(task.id, task.version),
        'Tarefa excluída.',
      );
      if (removed) select(null);
      return removed;
    },
    [runMutation, select],
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
    complete,
    setDependencies,
    remove,
  };
}
