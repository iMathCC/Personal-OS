import type { SessionDto } from '@personal-os/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, authApi } from '@/lib/api';

export type SessionsState =
  | { status: 'loading' }
  | { status: 'ready'; sessions: SessionDto[] }
  | { status: 'error'; message: string };

export interface SessionsController {
  state: SessionsState;
  reload: () => void;
  revoke: (id: string) => Promise<void>;
}

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Não foi possível carregar as sessões. Tente novamente.';
}

export function useSessions(): SessionsController {
  const [state, setState] = useState<SessionsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  /* eslint-disable react-hooks/set-state-in-effect -- carregamento assíncrono de sessões */
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void authApi
      .sessions()
      .then((sessions) => {
        if (!controller.signal.aborted) setState({ status: 'ready', sessions });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: message(error) });
      });
    return () => controller.abort();
  }, [attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const revoke = useCallback(async (id: string) => {
    await authApi.revokeSession(id);
    setState((current) =>
      current.status === 'ready'
        ? { status: 'ready', sessions: current.sessions.filter((session) => session.id !== id) }
        : current,
    );
  }, []);

  return { state, reload, revoke };
}
