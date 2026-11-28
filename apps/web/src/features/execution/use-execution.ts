import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ExecutionDashboardData,
  ListProjectsQuery,
  ProjectSummaryDto,
  TimelineEventDto,
} from '@personal-os/shared';
import { executionApi, projectsApi, type Page } from '@/lib/api';
import { localDateIn, shiftLocalDate } from '@/features/studies/time';

export interface ExecutionDashboardController {
  /** `null` quando a API não respondeu: nenhum sinal é inventado. */
  data: ExecutionDashboardData | null;
  loading: boolean;
  reload: () => void;
}

export interface ExecutionDashboardOptions {
  date?: string;
  projectId?: string;
}

/** Consulta isolada: falha da execução nunca derruba quem a consome. */
export function useExecutionDashboard(
  timezone: string,
  options: ExecutionDashboardOptions = {},
): ExecutionDashboardController {
  const date = options.date ?? localDateIn(timezone, new Date());
  const projectId = options.projectId ?? '';
  const [data, setData] = useState<ExecutionDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono e degradado */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    void executionApi
      .dashboard({ date, ...(projectId === '' ? {} : { projectId }) }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, projectId, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { data, loading, reload };
}

export interface TimelineState {
  status: 'loading' | 'ready' | 'error';
  page: Page<TimelineEventDto>;
  message?: string;
}

export interface ExecutionController {
  date: string;
  projectId: string;
  range: { from: string; to: string };
  projects: ProjectSummaryDto[];
  dashboard: ExecutionDashboardController;
  timeline: TimelineState;
  loadingMore: boolean;
  setDate: (date: string) => void;
  setProjectId: (projectId: string) => void;
  setRange: (range: { from: string; to: string }) => void;
  reloadTimeline: () => void;
  loadMoreTimeline: () => void;
}

export function useExecution(timezone: string): ExecutionController {
  const today = localDateIn(timezone, new Date());
  const [date, setDate] = useState(today);
  const [projectId, setProjectId] = useState('');
  const [range, setRange] = useState(() => ({
    from: shiftLocalDate(today, -29),
    to: today,
  }));
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([]);
  const [timeline, setTimeline] = useState<TimelineState>({
    status: 'loading',
    page: { items: [], hasMore: false },
  });
  const [timelineAttempt, setTimelineAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const generationRef = useRef(0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const dashboard = useExecutionDashboard(timezone, { date, projectId });

  const reloadTimeline = useCallback(() => setTimelineAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- listas auxiliares e linha do tempo */
  useEffect(() => {
    const query: ListProjectsQuery = { limit: 200 };
    const controller = new AbortController();
    void projectsApi.list(query, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) setProjects(page.items);
      },
      () => {
        if (!controller.signal.aborted) setProjects([]);
      },
    );
    return () => controller.abort();
  }, [timelineAttempt]);

  useEffect(() => {
    generationRef.current += 1;
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadingMore(false);
    const controller = new AbortController();
    setTimeline({ status: 'loading', page: { items: [], hasMore: false } });
    void executionApi
      .timeline(
        {
          ...(projectId === '' ? {} : { projectId }),
          from: range.from,
          to: range.to,
          limit: 25,
        },
        controller.signal,
      )
      .then((page) => {
        if (controller.signal.aborted) return;
        setTimeline({ status: 'ready', page });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setTimeline({
          status: 'error',
          page: { items: [], hasMore: false },
          message: 'Não foi possível carregar a linha do tempo. Tente novamente.',
        });
      });
    return () => controller.abort();
  }, [timelineAttempt, projectId, range.from, range.to]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(
    () => () => {
      loadMoreControllerRef.current?.abort();
    },
    [],
  );

  const loadMoreTimeline = useCallback(() => {
    if (timeline.status !== 'ready' || timeline.page.nextCursor === undefined || loadingMore) {
      return;
    }
    const cursor = timeline.page.nextCursor;
    const generation = generationRef.current;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    void executionApi
      .timeline(
        {
          ...(projectId === '' ? {} : { projectId }),
          from: range.from,
          to: range.to,
          cursor,
          limit: 25,
        },
        controller.signal,
      )
      .then((page) => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setTimeline((current) =>
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
        setTimeline((current) => ({
          ...current,
          message: 'Não foi possível carregar mais eventos.',
        }));
      })
      .finally(() => {
        if (loadMoreControllerRef.current !== controller) return;
        loadMoreControllerRef.current = null;
        setLoadingMore(false);
      });
  }, [timeline, loadingMore, projectId, range.from, range.to]);

  return {
    date,
    projectId,
    range,
    projects,
    dashboard,
    timeline,
    loadingMore,
    setDate,
    setProjectId,
    setRange,
    reloadTimeline,
    loadMoreTimeline,
  };
}
