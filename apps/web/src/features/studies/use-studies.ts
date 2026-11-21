import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CourseDto, StudySessionDto } from '@personal-os/shared';
import { ApiError, studiesApi, type StudiesDashboard } from '@/lib/api';
import { localDateIn, shiftLocalDate } from './time';

export type StudiesState =
  | { status: 'loading' }
  | {
      status: 'ready';
      sessions: StudySessionDto[];
      courses: CourseDto[];
      dashboard: StudiesDashboard;
    }
  | { status: 'error'; message: string; sessionExpired: boolean };

export interface StudiesController {
  state: StudiesState;
  range: { from: string; to: string };
  reload: () => void;
}

export function useStudies(timezone: string): StudiesController {
  const [state, setState] = useState<StudiesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const range = useMemo(() => {
    const today = localDateIn(timezone, new Date());
    return { from: shiftLocalDate(today, -29), to: today };
  }, [timezone]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono dos dados */
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void Promise.all([
      studiesApi.sessions(controller.signal),
      studiesApi.courses(controller.signal),
      studiesApi.dashboard(range.from, range.to, controller.signal),
    ])
      .then(([sessions, courses, dashboard]) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', sessions, courses, dashboard });
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
  }, [attempt, range.from, range.to]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { state, range, reload };
}
