import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApi, subscribeToUnauthorized, ApiError, setCsrfToken } from '@/lib/api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const envelope = (data: unknown) => ({ data, meta: { requestId: 'test' } });

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe('notificação de sessão inválida', () => {
  it('notifica apenas 401 de endpoint protegido', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'expirada' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(authApi.sessions()).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await expect(authApi.sessions()).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('não notifica 403, 404, 429 ou 500 em endpoint protegido', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    for (const status of [403, 404, 429, 500]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(status, { error: {} })));
      await expect(authApi.me()).rejects.toMatchObject({ status });
    }
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('não notifica 401 em endpoints públicos de login, setup e recuperação', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    setCsrfToken('csrf');
    const failure = jsonResponse(401, { error: { code: 'INVALID', message: 'negado' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure));

    await expect(authApi.loginOptions()).rejects.toBeInstanceOf(ApiError);
    await expect(authApi.setupOptions('token')).rejects.toBeInstanceOf(ApiError);
    await expect(authApi.recoveryVerify('code')).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('não notifica logout bem-sucedido', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    setCsrfToken('csrf');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, envelope({ loggedOut: true }))),
    );

    await expect(authApi.logout()).resolves.toEqual({ loggedOut: true });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
