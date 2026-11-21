import type { HealthResponse } from '@personal-os/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchHealth } from '@/lib/api';

export type DashboardState =
  | { status: 'loading' }
  | { status: 'ready'; health: HealthResponse }
  | { status: 'error'; message: string };

export interface DashboardController {
  state: DashboardState;
  reload: () => void;
}

export function useDashboard(): DashboardController {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono do health */
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void fetchHealth(controller.signal)
      .then((health) => setState({ status: 'ready', health }))
      .catch(() => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: 'Não foi possível consultar o estado da API. Tente novamente.',
        });
      });
    return () => controller.abort();
  }, [attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { state, reload };
}
