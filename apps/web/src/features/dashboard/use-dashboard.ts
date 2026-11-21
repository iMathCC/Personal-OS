import type { HealthResponse, StudySessionDto } from '@personal-os/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchHealth, studiesApi } from '@/lib/api';
import { localDateIn, shiftLocalDate } from '@/features/studies/time';

export interface StudiesSnapshot {
  totalMinutes: number;
  sessionCount: number;
  daysStudied: number;
  recentSessions: StudySessionDto[];
}

export type DashboardState =
  | { status: 'loading' }
  | { status: 'ready'; health: HealthResponse; studies: StudiesSnapshot }
  | { status: 'error'; message: string };

export interface DashboardController {
  state: DashboardState;
  reload: () => void;
}

export function useDashboard(timezone: string): DashboardController {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono do health e estudos */
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    const today = localDateIn(timezone, new Date());
    const from = shiftLocalDate(today, -29);
    void Promise.all([
      fetchHealth(controller.signal),
      studiesApi.dashboard(from, today, controller.signal),
      studiesApi.sessions(controller.signal),
    ])
      .then(([health, dashboard, sessions]) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'ready',
          health,
          studies: {
            totalMinutes: dashboard.summary.totalMinutes,
            sessionCount: dashboard.summary.sessionCount,
            daysStudied: dashboard.summary.daysStudied,
            recentSessions: sessions.slice(0, 5),
          },
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message:
            'Não foi possível consultar o estado da API e os dados de estudos. Tente novamente.',
        });
      });
    return () => controller.abort();
  }, [attempt, timezone]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { state, reload };
}
