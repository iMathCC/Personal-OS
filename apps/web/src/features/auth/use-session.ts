import type { UserDto } from '@personal-os/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, authApi, clearPrivateCaches } from '@/lib/api';

export interface AccountSummary {
  user: UserDto;
  counts: { passkeys: number; activeSessions: number };
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error'; message: string }
  | ({ status: 'authenticated' } & AccountSummary);

export interface SessionController {
  state: SessionState;
  refresh: () => Promise<void>;
  signOut: (all: boolean) => Promise<void>;
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Sua sessão expirou. Entre novamente com sua passkey.';
  }
  return 'Não foi possível consultar a sessão. Verifique a conexão e tente novamente.';
}

export function useSession(): SessionController {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const account = await authApi.me();
      setState({ status: 'authenticated', ...account });
    } catch (error) {
      setState(
        error instanceof ApiError && error.status === 401
          ? { status: 'anonymous' }
          : { status: 'error', message: failureMessage(error) },
      );
    }
  }, []);

  // O cookie HttpOnly não é legível pelo JS; a sessão só é conhecida após /auth/me.
  useEffect(() => {
    let cancelled = false;
    void authApi
      .me()
      .then((account) => {
        if (!cancelled) setState({ status: 'authenticated', ...account });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(
          error instanceof ApiError && error.status === 401
            ? { status: 'anonymous' }
            : { status: 'error', message: failureMessage(error) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async (all: boolean) => {
    if (all) {
      await authApi.logoutAll();
    } else {
      await authApi.logout();
    }
    await clearPrivateCaches();
    setState({ status: 'anonymous' });
  }, []);

  return { state, refresh, signOut };
}
