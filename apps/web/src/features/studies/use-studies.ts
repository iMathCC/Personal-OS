import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CourseDto, StudiesDashboardData, StudySessionDto } from '@personal-os/shared';
import { ApiError, studiesApi } from '@/lib/api';
import { localDateIn, shiftLocalDate } from './time';

export const PERIOD_OPTIONS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

export type StudiesState =
  | { status: 'loading' }
  | {
      status: 'ready';
      sessions: StudySessionDto[];
      courses: CourseDto[];
      dashboard: StudiesDashboardData;
      nextCursor?: string;
      hasMore: boolean;
    }
  | { status: 'error'; message: string; sessionExpired: boolean };

export interface StudiesController {
  state: StudiesState;
  range: { from: string; to: string };
  periodDays: PeriodDays;
  courseId: string;
  loadingMore: boolean;
  setPeriodDays: (days: PeriodDays) => void;
  setCourseId: (courseId: string) => void;
  loadMore: () => void;
  reload: () => void;
}

export function useStudies(timezone: string): StudiesController {
  const [state, setState] = useState<StudiesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [courseId, setCourseId] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  /** Mudanças de filtro/período invalidam paginações em voo. */
  const generationRef = useRef(0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const range = useMemo(() => {
    const today = localDateIn(timezone, new Date());
    return { from: shiftLocalDate(today, -(periodDays - 1)), to: today };
  }, [timezone, periodDays]);
  const filter = courseId === '' ? undefined : courseId;

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono dos dados */
  useEffect(() => {
    generationRef.current += 1;
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadingMore(false);
    const controller = new AbortController();
    setState({ status: 'loading' });
    void Promise.all([
      studiesApi.sessionsPage(
        { from: range.from, to: range.to, courseId: filter, limit: 50 },
        controller.signal,
      ),
      studiesApi.courses(controller.signal),
      studiesApi.dashboard(range.from, range.to, filter, controller.signal),
    ])
      .then(([page, courses, dashboard]) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'ready',
          sessions: page.items,
          courses,
          dashboard,
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
          hasMore: page.hasMore,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const expired = error instanceof ApiError && error.status === 401;
        setState({
          status: 'error',
          message: expired
            ? 'Sua sessão expirou. Entre novamente para continuar.'
            : 'Não foi possível carregar os dados de estudos. Tente novamente.',
          sessionExpired: expired,
        });
      });
    return () => controller.abort();
  }, [attempt, range.from, range.to, filter]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(
    () => () => {
      loadMoreControllerRef.current?.abort();
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || state.nextCursor === undefined || loadingMore) return;
    const cursor = state.nextCursor;
    const generation = generationRef.current;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    void studiesApi
      .sessionsPage(
        {
          from: range.from,
          to: range.to,
          courseId: filter,
          limit: 50,
          cursor,
        },
        controller.signal,
      )
      .then((page) => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setState((current) =>
          current.status === 'ready'
            ? {
                ...current,
                sessions: [...current.sessions, ...page.items],
                ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
                hasMore: page.hasMore,
              }
            : current,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        const expired = error instanceof ApiError && error.status === 401;
        setState({
          status: 'error',
          message: expired
            ? 'Sua sessão expirou. Entre novamente para continuar.'
            : 'Não foi possível carregar mais sessões. Tente novamente.',
          sessionExpired: expired,
        });
      })
      .finally(() => {
        if (loadMoreControllerRef.current !== controller) return;
        loadMoreControllerRef.current = null;
        setLoadingMore(false);
      });
  }, [state, loadingMore, range.from, range.to, filter]);

  return {
    state,
    range,
    periodDays,
    courseId,
    loadingMore,
    setPeriodDays,
    setCourseId,
    loadMore,
    reload,
  };
}
