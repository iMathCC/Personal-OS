import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import {
  type AreaDto,
  type CourseDto,
  type CreateCourseRequest,
  type CreateStudySessionRequest,
  type ObservationDto,
  type SeriesQuery,
  type SessionDto,
  type StudySessionDto,
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

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Canal explícito entre o cliente HTTP e a sessão; evita dependência circular. */
export function subscribeToUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/**
 * Endpoints que exigem sessão ativa. Rotas públicas de setup/login/recuperação
 * podem devolver 401 como parte normal do fluxo e não devem invalidar a sessão.
 */
function isProtectedPath(path: string): boolean {
  if (path === '/auth/me' || path === '/auth/sessions') return true;
  if (path === '/auth/logout' || path === '/auth/logout-all') return true;
  if (path.startsWith('/auth/sessions/')) return true;
  // Estudos é autenticado: um 401 aqui também encerra a sessão local.
  return path.startsWith('/studies/');
}

function notifyUnauthorized(path: string, status: number): void {
  if (status !== 401 || !isProtectedPath(path)) return;
  for (const listener of unauthorizedListeners) listener();
}

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
    const error = await toApiError(response);
    notifyUnauthorized(path, error.status);
    throw error;
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
    const error = await toApiError(response);
    notifyUnauthorized(path, error.status);
    throw error;
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
    const error = await toApiError(response);
    notifyUnauthorized(path, error.status);
    throw error;
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

export interface SeriesPoint {
  date: string;
  value: number | null;
  sampleCount: number;
}

export interface StudiesSeries {
  metricKey: string;
  unit: string;
  granularity: 'day' | 'week';
  points: SeriesPoint[];
  algorithmVersion: string;
  timezone: string;
}

export interface StudiesDashboard {
  period: { from: string; to: string; timezone: string };
  summary: {
    totalMinutes: number;
    sessionCount: number;
    daysStudied: number;
    averageMinutes: number | null;
  };
  series: SeriesPoint[];
  generatedAt: string;
}

function dateQuery(from: string, to: string): string {
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

/** Estudos: primeira vertical slice com persistência real e idempotência. */
export const studiesApi = {
  areas: (signal?: AbortSignal) => read<AreaDto[]>('/studies/areas', signal),
  courses: (signal?: AbortSignal) => read<CourseDto[]>('/studies/courses', signal),
  sessions: (signal?: AbortSignal) => read<StudySessionDto[]>('/studies/sessions', signal),
  sessionDetail: (id: string, signal?: AbortSignal) =>
    read<{ session: StudySessionDto; observations: ObservationDto[] }>(
      `/studies/sessions/${encodeURIComponent(id)}`,
      signal,
    ),
  series: (query: SeriesQuery, signal?: AbortSignal) =>
    read<StudiesSeries>(
      `/studies/series?${dateQuery(query.from, query.to)}&granularity=${query.granularity ?? 'day'}`,
      signal,
    ),
  dashboard: (from: string, to: string, signal?: AbortSignal) =>
    read<StudiesDashboard>(`/studies/dashboard?${dateQuery(from, to)}`, signal),
  createCourse: (input: CreateCourseRequest, idempotencyKey: string) =>
    mutate<CourseDto>('/studies/courses', input, { 'Idempotency-Key': idempotencyKey }),
  createSession: (input: CreateStudySessionRequest, idempotencyKey: string) =>
    mutate<StudySessionDto>('/studies/sessions', input, { 'Idempotency-Key': idempotencyKey }),
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
