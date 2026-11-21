import type { UserDto } from '@personal-os/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, authApi, clearPrivateCaches, subscribeToUnauthorized } from '@/lib/api';

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
  const invalidated = useRef(false);

  // Uma única transição, mesmo com vários 401 simultâneos.
  const invalidate = useCallback(() => {
    if (invalidated.current) return;
    invalidated.current = true;
    void clearPrivateCaches();
    setState({ status: 'anonymous' });
  }, []);

  useEffect(() => subscribeToUnauthorized(invalidate), [invalidate]);

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const account = await authApi.me();
      invalidated.current = false;
      setState({ status: 'authenticated', ...account });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        invalidate();
      } else {
        setState({ status: 'error', message: failureMessage(error) });
      }
    }
  }, [invalidate]);

  // O cookie HttpOnly não é legível pelo JS; a sessão só é conhecida após /auth/me.
  useEffect(() => {
    let cancelled = false;
    void authApi
      .me()
      .then((account) => {
        if (!cancelled) {
          invalidated.current = false;
          setState({ status: 'authenticated', ...account });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          invalidate();
        } else {
          setState({ status: 'error', message: failureMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [invalidate]);

  const signOut = useCallback(async (all: boolean) => {
    try {
      if (all) {
        await authApi.logoutAll();
      } else {
        await authApi.logout();
      }
    } catch (error) {
      // 401 no logout significa que a sessão já não é válida; conclui localmente.
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    } finally {
      invalidated.current = true;
    }
    await clearPrivateCaches();
    setState({ status: 'anonymous' });
  }, []);

  return { state, refresh, signOut };
}
