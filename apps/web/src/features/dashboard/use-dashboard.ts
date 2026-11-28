import type {
  DecisionDashboardDto,
  GoalDashboardData,
  HealthResponse,
  StudySessionDto,
} from '@personal-os/shared';
import { useCallback, useEffect, useState } from 'react';
import { decisionApi, fetchHealth, goalsApi, studiesApi } from '@/lib/api';
import { localDateIn, shiftLocalDate } from '@/features/studies/time';

export interface StudiesSnapshot {
  totalMinutes: number;
  sessionCount: number;
  daysStudied: number;
  recentSessions: StudySessionDto[];
}

export type DashboardState =
  | { status: 'loading' }
  | {
      status: 'ready';
      health: HealthResponse;
      studies: StudiesSnapshot;
      goals: GoalDashboardData | null;
      life: DecisionDashboardDto | null;
    }
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
    // Falha de módulos não centrais não derruba a visão geral.
    const goalsRequest = goalsApi.dashboard(controller.signal).then(
      (data) => data,
      () => null,
    );
    const lifeRequest = decisionApi.lifeDashboard({}, controller.signal).then(
      (data) => data,
      () => null,
    );
    void Promise.all([
      fetchHealth(controller.signal),
      studiesApi.dashboard(from, today, undefined, controller.signal),
      studiesApi.sessions(controller.signal),
      goalsRequest,
      lifeRequest,
    ])
      .then(([health, dashboard, sessions, goals, life]) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'ready',
          health,
          goals,
          life,
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
