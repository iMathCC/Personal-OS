import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import {
  type SessionDto,
  type UserDto,
  healthResponseSchema,
  type HealthResponse,
} from '@personal-os/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  data: T;
  meta: { requestId: string };
}

/** Token em memória: nunca em localStorage/sessionStorage. */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return ((await response.json()) as Envelope<T>).data;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'Erro na requisição.',
    );
  } catch {
    return new ApiError(response.status, 'UNKNOWN', 'Erro na requisição.');
  }
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken !== null) {
    return csrfToken;
  }
  const result = await read<{ csrfToken: string }>('/auth/csrf');
  csrfToken = result.csrfToken;
  return csrfToken;
}

async function mutate<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const token = await ensureCsrf();
  const response = await fetch(`/api/v1${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return ((await response.json()) as Envelope<T>).data;
}

async function remove<T>(path: string): Promise<T> {
  const token = await ensureCsrf();
  const response = await fetch(`/api/v1${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return ((await response.json()) as Envelope<T>).data;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return healthResponseSchema.parse((await read<unknown>('/health', signal)) ?? {});
}

export interface SetupResult {
  user: UserDto;
  session: SessionDto;
  recoveryCodes: string[];
}

export const authApi = {
  async setupOptions(setupToken: string) {
    return mutate<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>(
      '/auth/setup/options',
      {},
      { 'X-Setup-Token': setupToken },
    );
  },

  async setupVerify(input: {
    setupToken: string;
    challengeId: string;
    credential: RegistrationResponseJSON;
    displayName: string;
    timezone: string;
    passkeyName: string;
  }): Promise<SetupResult> {
    const { setupToken, ...body } = input;
    const result = await mutate<SetupResult & { csrfToken?: string }>('/auth/setup/verify', body, {
      'X-Setup-Token': setupToken,
    });
    // O contrato não devolve o CSRF token novo; buscamos um vinculado à sessão.
    await refreshCsrfAfterAuth();
    return result;
  },

  async loginOptions() {
    return mutate<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>(
      '/auth/login/options',
      {},
    );
  },

  async loginVerify(input: {
    challengeId: string;
    credential: AuthenticationResponseJSON;
  }): Promise<{ user: UserDto; session: SessionDto }> {
    const result = await mutate<{ user: UserDto; session: SessionDto }>(
      '/auth/login/verify',
      input,
    );
    await refreshCsrfAfterAuth();
    return result;
  },

  me: () =>
    read<{ user: UserDto; counts: { passkeys: number; activeSessions: number } }>('/auth/me'),
  sessions: () => read<SessionDto[]>('/auth/sessions'),
  logout: () => mutate<{ loggedOut: boolean }>('/auth/logout', {}),
  logoutAll: () => mutate<{ loggedOut: boolean }>('/auth/logout-all', {}),
  revokeSession: (id: string) =>
    remove<{ revoked: boolean }>(`/auth/sessions/${encodeURIComponent(id)}`),

  recoveryVerify: (code: string) =>
    mutate<{ recoveryToken: string; expiresAt: string }>('/auth/recovery/verify', { code }),

  recoveryRegisterOptions: (recoveryToken: string) =>
    mutate<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>(
      '/auth/recovery/register/options',
      { recoveryToken },
    ),

  recoveryRegisterVerify: (input: {
    recoveryToken: string;
    challengeId: string;
    credential: RegistrationResponseJSON;
    passkeyName: string;
  }) => mutate<{ registered: boolean }>('/auth/recovery/register/verify', input),
};

async function refreshCsrfAfterAuth(): Promise<void> {
  csrfToken = null;
  await ensureCsrf();
}

/** Remove caches privados ao encerrar a sessão. */
export async function clearPrivateCaches(): Promise<void> {
  setCsrfToken(null);
  if (!('caches' in globalThis)) {
    return;
  }
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith('api-get-v1') || name.startsWith('private-'))
      .map((name) => caches.delete(name)),
  );
}
