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
  type CreateGoalRequest,
  type CreateStudySessionRequest,
  type GoalDto,
  type GoalAreaDto,
  type GoalDashboardData,
  type GoalDetailDto,
  type GoalListQuery,
  type GoalMilestoneDto,
  type CreateLifeGoalRequest,
  type CreateMilestoneRequest,
  type CreateProjectBody,
  type CreateProjectMilestoneBody,
  type CreateTaskBody,
  type ExecutionDashboardData,
  type ExecutionQuery,
  type LifeGoalDto,
  type ListProjectsQuery,
  type ListTasksQuery,
  type ProjectDetailDto,
  type ProjectMilestoneDto,
  type ProjectSummaryDto,
  type SetProjectGoalsBody,
  type SetTaskDependenciesBody,
  type TaskDetailDto,
  type TaskDto,
  type TimelineEventDto,
  type TimelineQuery,
  type ComputedWeeklyReviewDto,
  type CreateWeeklyReviewRequest,
  type IntelligenceDashboardData,
  type IntelligenceQuery,
  type IntelligenceTimelineEventDto,
  type IntelligenceTimelineQuery,
  type DecisionAlertDto,
  type DecisionAlertMutation,
  type DecisionAlertStateResultDto,
  type DecisionAlertsQuery,
  type DecisionCrossDomainDto,
  type DecisionDashboardDto,
  type DecisionListQuery,
  type DecisionNextActionDto,
  type DecisionRecommendationDto,
  type DecisionReviewDto,
  type DecisionReviewQuery,
  type PerformanceDashboardDto,
  type PerformanceQuery,
  type AdaptationDashboardDto,
  type AdaptationDashboardQuery,
  type AdaptationDecisionRecordDto,
  type AdaptationDecisionRequest,
  type AdaptationHistoryItemDto,
  type AdaptationProposalDto,
  type UpdateGoalRequest,
  type UpdateMilestoneRequest,
  type UpdateWeeklyReviewRequest,
  type WeeklyReviewDto,
  type WeeklyReviewListQuery,
  type CapacityProfileDto,
  type CapacityResultDto,
  type CreateCycleRequest,
  type CreateQuarterlyReviewRequest,
  type CreateScenarioRequest,
  type CreateStrategicAreaRequest,
  type CreateStrategicGoalRequest,
  type CreateVisionRequest,
  type CycleTransitionRequest,
  type LifeVisionDto,
  type PlanningCycleDto,
  type PrioritizationDto,
  type QuarterlyReviewDto,
  type SaveCapacityProfileRequest,
  type ScenarioComparisonDto,
  type ScenarioDto,
  type SimulateRequest,
  type SimulationResultDto,
  type StrategicAreaDto,
  type StrategicGoalDto,
  type StrategyDashboardDto,
  type UpdateCycleRequest,
  type UpdateQuarterlyReviewRequest,
  type UpdateStrategicAreaRequest,
  type UpdateStrategicGoalRequest,
  type UpdateVisionRequest,
  type VisionHistoryDto,
  type FinanceAccountDto,
  type FinanceCategoryDto,
  type FinanceTransactionDto,
  type FinanceBalanceItemDto,
  type HealthMetricDto,
  type HealthObservationDto,
  type TrainingSessionDto,
  type ReadingMaterialDto,
  type ReadingSessionDto,
  type ReadingNoteDto,
  type TimeEntryDto,
  type LifeDashboardDto,
  type LifeIntegrationDto,
  type FinanceSummaryDto,
  type HealthSummaryDto,
  type TrainingSummaryDto,
  type ReadingSummaryDto,
  type TimeSummaryDto,
  type ImportPreviewDto,
  type ImportReportDto,
  type ImportBatchDto,
  type ImportIssueDto,
  type LifeDomainDto,
  type LifeCoverageDto,
  type PersonalObservationDto,
  type CreatePersonalObservationRequest,
  type CorrectPersonalObservationRequest,
  type ListPersonalObservationsQuery,
  type ObservationSummaryDto,
  type ObservationSummaryQuery,
  type CreateFinanceAccount,
  type UpdateFinanceAccount,
  type CreateFinanceCategory,
  type UpdateFinanceCategory,
  type CreateFinanceTransaction,
  type UpdateFinanceTransaction,
  type CreateFinanceBalanceItem,
  type UpdateFinanceBalanceItem,
  type CreateHealthMetric,
  type UpdateHealthMetric,
  type CreateHealthObservation,
  type UpdateHealthObservation,
  type CreateTrainingSession,
  type UpdateTrainingSession,
  type CreateReadingMaterial,
  type UpdateReadingMaterial,
  type CreateReadingSession,
  type UpdateReadingSession,
  type CreateReadingNote,
  type UpdateReadingNote,
  type CreateTimeEntry,
  type UpdateTimeEntry,
  type UpdateProjectBody,
  type UpdateProjectMilestoneBody,
  type UpdateTaskBody,
  type ObservationDto,
  type SeriesQuery,
  type SessionDto,
  type StudiesDashboardData,
  type StudiesSeriesData,
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

/** Metadados do catálogo de relações devolvidos pelo endpoint de cruzamento. */
export interface DecisionCatalogItem {
  id: string;
  label: string;
  sources: string[];
  minimumObservations: number;
  correlationAllowed: boolean;
  condition: string;
}

interface Envelope<T> {
  data: T;
  meta: {
    requestId: string;
    nextCursor?: string;
    hasMore?: boolean;
    truncated?: boolean;
    catalog?: DecisionCatalogItem[];
  };
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  truncated?: boolean;
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
  // Módulos com dados privados: um 401 aqui encerra a sessão local.
  return (
    path.startsWith('/studies/') ||
    path.startsWith('/goals') ||
    path.startsWith('/projects') ||
    path.startsWith('/tasks') ||
    path.startsWith('/execution') ||
    path.startsWith('/intelligence') ||
    path.startsWith('/adaptation') ||
    path.startsWith('/planning') ||
    path.startsWith('/life')
  );
}

function notifyUnauthorized(path: string, status: number): void {
  if (status !== 401 || !isProtectedPath(path)) return;
  for (const listener of unauthorizedListeners) listener();
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function readEnvelope<T>(path: string, signal?: AbortSignal): Promise<Envelope<T>> {
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
  return (await response.json()) as Envelope<T>;
}

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await readEnvelope<T>(path, signal)).data;
}

async function readPage<T>(path: string, signal?: AbortSignal): Promise<Page<T>> {
  const envelope = await readEnvelope<T[]>(path, signal);
  return {
    items: envelope.data,
    ...(envelope.meta.nextCursor === undefined ? {} : { nextCursor: envelope.meta.nextCursor }),
    hasMore: envelope.meta.hasMore ?? false,
    ...(envelope.meta.truncated === undefined ? {} : { truncated: envelope.meta.truncated }),
  };
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
  method: 'POST' | 'PATCH' | 'PUT' = 'POST',
): Promise<T> {
  const token = await ensureCsrf();
  const response = await fetch(`/api/v1${path}`, {
    method,
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

async function remove<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const token = await ensureCsrf();
  const response = await fetch(`/api/v1${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      ...headers,
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
  const response = await fetch('/api/v1/health', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const error = await toApiError(response);
    notifyUnauthorized('/health', error.status);
    throw error;
  }
  return healthResponseSchema.parse(await response.json());
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

export interface StudySessionsQuery {
  from?: string;
  to?: string;
  courseId?: string;
  limit?: number;
  cursor?: string;
}

function studyQuery(
  from: string,
  to: string,
  extra: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams({ from, to });
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

/** Estudos: primeira vertical slice com persistência real e idempotência. */
export const studiesApi = {
  areas: (signal?: AbortSignal) => read<AreaDto[]>('/studies/areas', signal),
  courses: (signal?: AbortSignal) => read<CourseDto[]>('/studies/courses', signal),
  sessions: (signal?: AbortSignal) => read<StudySessionDto[]>('/studies/sessions', signal),
  sessionsPage: (query: StudySessionsQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return readPage<StudySessionDto>(`/studies/sessions?${params.toString()}`, signal);
  },
  sessionDetail: (id: string, signal?: AbortSignal) =>
    read<{ session: StudySessionDto; observations: ObservationDto[] }>(
      `/studies/sessions/${encodeURIComponent(id)}`,
      signal,
    ),
  series: (query: SeriesQuery, signal?: AbortSignal) =>
    read<StudiesSeriesData>(
      `/studies/series?${studyQuery(query.from, query.to, {
        granularity: query.granularity,
        courseId: query.courseId,
      })}`,
      signal,
    ),
  dashboard: (from: string, to: string, courseId?: string, signal?: AbortSignal) =>
    read<StudiesDashboardData>(`/studies/dashboard?${studyQuery(from, to, { courseId })}`, signal),
  goals: (from: string, to: string, signal?: AbortSignal) =>
    read<GoalDto[]>(`/studies/goals?${studyQuery(from, to)}`, signal),
  createCourse: (input: CreateCourseRequest, idempotencyKey: string) =>
    mutate<CourseDto>('/studies/courses', input, { 'Idempotency-Key': idempotencyKey }),
  createGoal: (input: CreateGoalRequest, idempotencyKey: string) =>
    mutate<GoalDto>('/studies/goals', input, { 'Idempotency-Key': idempotencyKey }),
  createSession: (input: CreateStudySessionRequest, idempotencyKey: string) =>
    mutate<StudySessionDto>('/studies/sessions', input, { 'Idempotency-Key': idempotencyKey }),
};

function observationsQuery(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

/** Observações pessoais: captura, histórico, correção e indicadores com evidência explícita. */
export const observationsApi = {
  list: (query: ListPersonalObservationsQuery = {}, signal?: AbortSignal) => {
    const qs = observationsQuery(query as Record<string, string | number | undefined>);
    return readPage<PersonalObservationDto>(`/observations${qs ? `?${qs}` : ''}`, signal);
  },
  get: (id: string, signal?: AbortSignal) =>
    read<PersonalObservationDto>(`/observations/${encodeURIComponent(id)}`, signal),
  summary: (query: ObservationSummaryQuery, signal?: AbortSignal) => {
    const qs = observationsQuery(query as Record<string, string | number | undefined>);
    return read<ObservationSummaryDto>(`/observations/summary?${qs}`, signal);
  },
  create: (input: CreatePersonalObservationRequest, idempotencyKey: string) =>
    mutate<PersonalObservationDto>('/observations', input, { 'Idempotency-Key': idempotencyKey }),
  correct: (
    id: string,
    input: CorrectPersonalObservationRequest,
    idempotencyKey: string,
    ifMatch?: number,
  ) =>
    mutate<PersonalObservationDto>(`/observations/${encodeURIComponent(id)}/correct`, input, {
      'Idempotency-Key': idempotencyKey,
      ...(ifMatch !== undefined ? { 'If-Match': `"${ifMatch}"` } : {}),
    }),
};

function goalsQuery(query: GoalListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

/** Objetivos: contratos compartilhados e mutações com idempotência/versão. */
export const goalsApi = {
  areas: (signal?: AbortSignal) => read<GoalAreaDto[]>('/goals/areas', signal),
  dashboard: (signal?: AbortSignal, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from !== undefined) params.set('from', from);
    if (to !== undefined) params.set('to', to);
    const query = params.toString();
    return read<GoalDashboardData>(`/goals/dashboard${query === '' ? '' : `?${query}`}`, signal);
  },
  list: (query: GoalListQuery = {}, signal?: AbortSignal) => {
    const search = goalsQuery(query);
    return readPage<LifeGoalDto>(`/goals${search === '' ? '' : `?${search}`}`, signal);
  },
  detail: (id: string, signal?: AbortSignal) =>
    read<GoalDetailDto>(`/goals/${encodeURIComponent(id)}`, signal),
  create: (input: CreateLifeGoalRequest, idempotencyKey: string) =>
    mutate<LifeGoalDto>('/goals', input, { 'Idempotency-Key': idempotencyKey }),
  update: (id: string, input: UpdateGoalRequest, idempotencyKey: string, version: number) =>
    mutate<LifeGoalDto>(
      `/goals/${encodeURIComponent(id)}`,
      input,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),
  complete: (id: string, idempotencyKey: string, version: number) =>
    mutate<LifeGoalDto>(
      `/goals/${encodeURIComponent(id)}/complete`,
      {},
      {
        'Idempotency-Key': idempotencyKey,
        'If-Match': String(version),
      },
    ),
  reopen: (id: string, idempotencyKey: string, version: number) =>
    mutate<LifeGoalDto>(
      `/goals/${encodeURIComponent(id)}/reopen`,
      {},
      {
        'Idempotency-Key': idempotencyKey,
        'If-Match': String(version),
      },
    ),
  archive: (id: string, idempotencyKey: string, version: number) =>
    mutate<LifeGoalDto>(
      `/goals/${encodeURIComponent(id)}/archive`,
      {},
      {
        'Idempotency-Key': idempotencyKey,
        'If-Match': String(version),
      },
    ),
  updateProgress: (id: string, percent: number, idempotencyKey: string, version: number) =>
    mutate<LifeGoalDto>(
      `/goals/${encodeURIComponent(id)}/progress`,
      { manualProgress: percent },
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
    ),
  createMilestone: (goalId: string, input: CreateMilestoneRequest, idempotencyKey: string) =>
    mutate<GoalMilestoneDto>(`/goals/${encodeURIComponent(goalId)}/milestones`, input, {
      'Idempotency-Key': idempotencyKey,
    }),
  updateMilestone: (
    goalId: string,
    milestoneId: string,
    input: UpdateMilestoneRequest,
    idempotencyKey: string,
    version: number,
  ) =>
    mutate<GoalMilestoneDto>(
      `/goals/${encodeURIComponent(goalId)}/milestones/${encodeURIComponent(milestoneId)}`,
      input,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),
};

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

function withQuery(path: string, query: string): string {
  return query === '' ? path : `${path}?${query}`;
}

/** O servidor aplica o `limit` padrão; o cliente aceita consultas parciais. */
type ListProjectsParams = Partial<ListProjectsQuery>;
type ListTasksParams = Partial<ListTasksQuery>;
type TimelineParams = Partial<TimelineQuery>;

/** Projetos: contratos de planejamento com idempotência e concorrência otimista. */
export const projectsApi = {
  list: (query: ListProjectsParams = {}, signal?: AbortSignal) =>
    readPage<ProjectSummaryDto>(withQuery('/projects', queryString({ ...query })), signal),
  detail: (id: string, signal?: AbortSignal) =>
    read<ProjectDetailDto>(`/projects/${encodeURIComponent(id)}`, signal),
  create: (input: CreateProjectBody, idempotencyKey: string) =>
    mutate<ProjectSummaryDto>('/projects', input, { 'Idempotency-Key': idempotencyKey }),
  update: (id: string, input: UpdateProjectBody, idempotencyKey: string, version: number) =>
    mutate<ProjectSummaryDto>(
      `/projects/${encodeURIComponent(id)}`,
      input,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),
  remove: (id: string, version: number) =>
    remove<{ deleted: boolean }>(`/projects/${encodeURIComponent(id)}`, {
      'If-Match': String(version),
    }),
  setGoals: (id: string, goalIds: string[], version: number, idempotencyKey: string) => {
    const body: SetProjectGoalsBody = { goalIds, version };
    return mutate<ProjectDetailDto>(
      `/projects/${encodeURIComponent(id)}/goals`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PUT',
    );
  },
  createMilestone: (id: string, input: CreateProjectMilestoneBody, idempotencyKey: string) =>
    mutate<ProjectMilestoneDto>(`/projects/${encodeURIComponent(id)}/milestones`, input, {
      'Idempotency-Key': idempotencyKey,
    }),
  updateMilestone: (
    id: string,
    milestoneId: string,
    input: UpdateProjectMilestoneBody,
    idempotencyKey: string,
    version: number,
  ) =>
    mutate<ProjectMilestoneDto>(
      `/projects/${encodeURIComponent(id)}/milestones/${encodeURIComponent(milestoneId)}`,
      input,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),
};

/** Tarefas: execução individual com dependências validadas pelo servidor. */
export const tasksApi = {
  list: (query: ListTasksParams = {}, signal?: AbortSignal) =>
    readPage<TaskDto>(withQuery('/tasks', queryString({ ...query })), signal),
  detail: (id: string, signal?: AbortSignal) =>
    read<TaskDetailDto>(`/tasks/${encodeURIComponent(id)}`, signal),
  create: (input: CreateTaskBody, idempotencyKey: string) =>
    mutate<TaskDto>('/tasks', input, { 'Idempotency-Key': idempotencyKey }),
  update: (id: string, input: UpdateTaskBody, idempotencyKey: string, version: number) =>
    mutate<TaskDto>(
      `/tasks/${encodeURIComponent(id)}`,
      input,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),
  complete: (id: string, version: number, idempotencyKey: string) =>
    mutate<TaskDto>(
      `/tasks/${encodeURIComponent(id)}/complete`,
      { version },
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
    ),
  setDependencies: (
    id: string,
    dependencyIds: string[],
    version: number,
    idempotencyKey: string,
  ) => {
    const body: SetTaskDependenciesBody = { dependencyIds, version };
    return mutate<TaskDetailDto>(
      `/tasks/${encodeURIComponent(id)}/dependencies`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PUT',
    );
  },
  remove: (id: string, version: number) =>
    remove<{ deleted: boolean }>(`/tasks/${encodeURIComponent(id)}`, {
      'If-Match': String(version),
    }),
};

/** Execução: sinais derivados e linha do tempo; nenhuma recomendação automática. */
export const executionApi = {
  dashboard: (query: ExecutionQuery = {}, signal?: AbortSignal) =>
    read<ExecutionDashboardData>(
      withQuery('/execution/dashboard', queryString({ ...query })),
      signal,
    ),
  timeline: (query: TimelineParams = {}, signal?: AbortSignal) =>
    readPage<TimelineEventDto>(withQuery('/execution/timeline', queryString({ ...query })), signal),
};

/**
 * Inteligência: fatos, tendências, alertas e revisões. Nenhuma recomendação é
 * executada automaticamente e nenhum número é calculado no cliente.
 */
export const intelligenceApi = {
  dashboard: (query: Partial<IntelligenceQuery> = {}, signal?: AbortSignal) =>
    read<IntelligenceDashboardData>(
      withQuery('/intelligence/dashboard', queryString({ ...query })),
      signal,
    ),
  timeline: (query: Partial<IntelligenceTimelineQuery> = {}, signal?: AbortSignal) =>
    readPage<IntelligenceTimelineEventDto>(
      withQuery('/intelligence/timeline', queryString({ ...query })),
      signal,
    ),
  review: (weekStart?: string, signal?: AbortSignal) =>
    read<ComputedWeeklyReviewDto>(
      withQuery('/intelligence/reviews', queryString({ weekStart })),
      signal,
    ),
  saveReview: (body: CreateWeeklyReviewRequest, idempotencyKey: string) =>
    mutate<WeeklyReviewDto>('/intelligence/reviews', body, {
      'Idempotency-Key': idempotencyKey,
    }),
  listSavedReviews: (query: Partial<WeeklyReviewListQuery> = {}, signal?: AbortSignal) =>
    readPage<WeeklyReviewDto>(
      withQuery('/intelligence/reviews/saved', queryString({ ...query })),
      signal,
    ),
  getSavedReview: (id: string, signal?: AbortSignal) =>
    read<WeeklyReviewDto>(`/intelligence/reviews/saved/${encodeURIComponent(id)}`, signal),
  updateReview: (
    id: string,
    body: UpdateWeeklyReviewRequest,
    idempotencyKey: string,
    version: number,
  ) =>
    mutate<WeeklyReviewDto>(
      `/intelligence/reviews/saved/${encodeURIComponent(id)}`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),
};

/** Leitura paginada de cruzamentos: o catálogo viaja no meta da resposta. */
async function readDecisionCrossDomainPage(
  path: string,
  signal?: AbortSignal,
): Promise<Page<DecisionCrossDomainDto> & { catalog: DecisionCatalogItem[] }> {
  const envelope = await readEnvelope<DecisionCrossDomainDto[]>(path, signal);
  return {
    items: envelope.data,
    ...(envelope.meta.nextCursor === undefined ? {} : { nextCursor: envelope.meta.nextCursor }),
    hasMore: envelope.meta.hasMore ?? false,
    ...(envelope.meta.truncated === undefined ? {} : { truncated: envelope.meta.truncated }),
    catalog: envelope.meta.catalog ?? [],
  };
}

/**
 * Camada de decisão: o cliente transporta DTOs estritos e versões. Nenhum
 * número é calculado no navegador e nenhuma recomendação é executada sozinha.
 */
export const decisionApi = {
  lifeDashboard: (query: Partial<DecisionListQuery> = {}, signal?: AbortSignal) =>
    read<DecisionDashboardDto>(
      withQuery('/intelligence/life-dashboard', queryString({ ...query })),
      signal,
    ),
  crossDomain: (query: Partial<DecisionListQuery> = {}, signal?: AbortSignal) =>
    readDecisionCrossDomainPage(
      withQuery('/intelligence/cross-domain', queryString({ ...query })),
      signal,
    ),
  catalog: (query: Partial<DecisionListQuery> = {}, signal?: AbortSignal) =>
    read<DecisionCatalogItem[]>(
      withQuery('/intelligence/catalog', queryString({ ...query })),
      signal,
    ),
  alerts: (query: Partial<DecisionAlertsQuery> = {}, signal?: AbortSignal) =>
    readPage<DecisionAlertDto>(
      withQuery('/intelligence/alerts', queryString({ ...query })),
      signal,
    ),
  recommendations: (query: Partial<DecisionListQuery> = {}, signal?: AbortSignal) =>
    readPage<DecisionRecommendationDto>(
      withQuery('/intelligence/recommendations', queryString({ ...query })),
      signal,
    ),
  nextActions: (query: Partial<DecisionListQuery> = {}, signal?: AbortSignal) =>
    readPage<DecisionNextActionDto>(
      withQuery('/intelligence/next-actions', queryString({ ...query })),
      signal,
    ),
  performanceReview: (query: DecisionReviewQuery, signal?: AbortSignal) =>
    read<DecisionReviewDto>(
      withQuery('/intelligence/performance-review', queryString({ ...query })),
      signal,
    ),
  acknowledgeAlert: (id: string, body: DecisionAlertMutation, idempotencyKey: string) =>
    mutate<DecisionAlertStateResultDto>(
      `/intelligence/alerts/${encodeURIComponent(id)}/acknowledge`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(body.version) },
    ),
  dismissAlert: (id: string, body: DecisionAlertMutation, idempotencyKey: string) =>
    mutate<DecisionAlertStateResultDto>(
      `/intelligence/alerts/${encodeURIComponent(id)}/dismiss`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(body.version) },
    ),
};

/** Painel longitudinal: todos os números são calculados na API e enviados por DTO. */
export const performanceApi = {
  dashboard: (query: Partial<PerformanceQuery> = {}, signal?: AbortSignal) =>
    read<PerformanceDashboardDto>(
      withQuery('/intelligence/performance', queryString({ ...query })),
      signal,
    ),
};

/** Adaptação pessoal: propostas determinísticas, simulações e decisões explícitas. */
export const adaptationApi = {
  dashboard: (query: Partial<AdaptationDashboardQuery> = {}, signal?: AbortSignal) =>
    read<AdaptationDashboardDto>(
      withQuery('/adaptation/dashboard', queryString({ ...query })),
      signal,
    ),
  proposals: (query: Partial<AdaptationDashboardQuery> = {}, signal?: AbortSignal) =>
    read<AdaptationProposalDto[]>(
      withQuery('/adaptation/proposals', queryString({ ...query })),
      signal,
    ),
  scenarios: (query: Partial<AdaptationDashboardQuery> = {}, signal?: AbortSignal) =>
    read<Array<{ proposalId: string; proposalTitle: string; [k: string]: unknown }>>(
      withQuery('/adaptation/scenarios', queryString({ ...query })),
      signal,
    ),
  history: async (
    query: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ items: AdaptationHistoryItemDto[]; nextCursor?: string; hasMore: boolean }> => {
    const envelope = await readEnvelope<AdaptationHistoryItemDto[]>(
      withQuery('/adaptation/history', queryString({ ...query })),
      signal,
    );
    return {
      items: envelope.data,
      ...(envelope.meta.nextCursor === undefined ? {} : { nextCursor: envelope.meta.nextCursor }),
      hasMore: envelope.meta.hasMore ?? false,
    };
  },
  decide: (body: AdaptationDecisionRequest, idempotencyKey: string) =>
    mutate<AdaptationDecisionRecordDto>('/adaptation/decisions', body, {
      'Idempotency-Key': idempotencyKey,
      'If-Match': String(body.version),
    }),
};

/**
 * Estratégia e planejamento: o cliente apenas transporta dados e versões.
 * Prioridades sugeridas, capacidade e cenários são calculados somente na API.
 */
export const planningApi = {
  dashboard: (signal?: AbortSignal) => read<StrategyDashboardDto>('/planning/dashboard', signal),
  intelligence: (signal?: AbortSignal) =>
    read<{
      alerts: number;
      recommendations: number;
      coverage: string[];
      sourcesWithData: string[];
      truncated: boolean;
      weeklyReviewWeeks: { weekStart: string }[];
      algorithms: Record<string, string>;
    }>('/planning/intelligence', signal),

  vision: (signal?: AbortSignal) => read<LifeVisionDto | null>('/planning/vision', signal),
  visionHistory: (limit = 50, signal?: AbortSignal) =>
    read<VisionHistoryDto>(withQuery('/planning/vision/history', queryString({ limit })), signal),
  createVision: (body: CreateVisionRequest, idempotencyKey: string) =>
    mutate<LifeVisionDto>('/planning/vision', body, { 'Idempotency-Key': idempotencyKey }),
  updateVision: (id: string, body: UpdateVisionRequest, idempotencyKey: string, version: number) =>
    mutate<LifeVisionDto>(
      `/planning/vision/${encodeURIComponent(id)}`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),

  areas: (signal?: AbortSignal) => read<StrategicAreaDto[]>('/planning/areas', signal),
  createArea: (body: CreateStrategicAreaRequest, idempotencyKey: string) =>
    mutate<{ areaId: string; importance: number; status: string; version: number }>(
      '/planning/areas',
      body,
      { 'Idempotency-Key': idempotencyKey },
    ),
  updateArea: (
    areaId: string,
    body: UpdateStrategicAreaRequest,
    idempotencyKey: string,
    version: number,
  ) =>
    mutate<{ areaId: string; importance: number; status: string; version: number }>(
      `/planning/areas/${encodeURIComponent(areaId)}`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),

  strategicGoals: (signal?: AbortSignal) => read<StrategicGoalDto[]>('/planning/goals', signal),
  createStrategicGoal: (body: CreateStrategicGoalRequest, idempotencyKey: string) =>
    mutate<StrategicGoalDto>('/planning/goals', body, { 'Idempotency-Key': idempotencyKey }),
  updateStrategicGoal: (
    id: string,
    body: UpdateStrategicGoalRequest,
    idempotencyKey: string,
    version: number,
  ) =>
    mutate<{ id: string; version: number }>(
      `/planning/goals/${encodeURIComponent(id)}`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),

  cycles: (signal?: AbortSignal) => read<PlanningCycleDto[]>('/planning/cycles', signal),
  cycle: (id: string, signal?: AbortSignal) =>
    read<PlanningCycleDto>(`/planning/cycles/${encodeURIComponent(id)}`, signal),
  createCycle: (body: CreateCycleRequest, idempotencyKey: string) =>
    mutate<PlanningCycleDto>('/planning/cycles', body, { 'Idempotency-Key': idempotencyKey }),
  updateCycle: (id: string, body: UpdateCycleRequest, idempotencyKey: string, version: number) =>
    mutate<{ id: string; version: number }>(
      `/planning/cycles/${encodeURIComponent(id)}`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),
  transitionCycle: (
    id: string,
    body: CycleTransitionRequest,
    idempotencyKey: string,
    version: number,
  ) =>
    mutate<{ id: string; status: string; version: number }>(
      `/planning/cycles/${encodeURIComponent(id)}/transition`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
    ),

  capacityProfile: (signal?: AbortSignal) =>
    read<CapacityProfileDto | null>('/planning/capacity/profile', signal),
  saveCapacityProfile: (
    body: SaveCapacityProfileRequest,
    idempotencyKey: string,
    version?: number,
  ) =>
    mutate<CapacityProfileDto>('/planning/capacity/profile', body, {
      'Idempotency-Key': idempotencyKey,
      ...(version === undefined ? {} : { 'If-Match': String(version) }),
    }),
  capacity: (weekStart?: string, signal?: AbortSignal) =>
    read<CapacityResultDto>(withQuery('/planning/capacity', queryString({ weekStart })), signal),
  prioritization: (weekStart?: string, signal?: AbortSignal) =>
    read<PrioritizationDto>(
      withQuery('/planning/prioritization', queryString({ weekStart })),
      signal,
    ),

  simulate: (body: SimulateRequest) =>
    mutate<SimulationResultDto>('/planning/scenarios/simulate', body, {}, 'POST'),
  compare: (body: SimulateRequest) =>
    mutate<ScenarioComparisonDto>('/planning/scenarios/compare', body, {}, 'POST'),
  scenarios: (limit = 50, signal?: AbortSignal) =>
    read<ScenarioDto[]>(withQuery('/planning/scenarios', queryString({ limit })), signal),
  scenario: (id: string, signal?: AbortSignal) =>
    read<ScenarioDto>(`/planning/scenarios/${encodeURIComponent(id)}`, signal),
  createScenario: (body: CreateScenarioRequest, idempotencyKey: string) =>
    mutate<ScenarioDto>('/planning/scenarios', body, { 'Idempotency-Key': idempotencyKey }),

  reviews: (signal?: AbortSignal) => read<QuarterlyReviewDto[]>('/planning/reviews', signal),
  review: (cycleId: string, signal?: AbortSignal) =>
    read<QuarterlyReviewDto | null>(`/planning/reviews/${encodeURIComponent(cycleId)}`, signal),
  saveReview: (body: CreateQuarterlyReviewRequest, idempotencyKey: string) =>
    mutate<QuarterlyReviewDto>('/planning/reviews', body, { 'Idempotency-Key': idempotencyKey }),
  updateReview: (
    cycleId: string,
    body: UpdateQuarterlyReviewRequest,
    idempotencyKey: string,
    version: number,
  ) =>
    mutate<QuarterlyReviewDto>(
      `/planning/reviews/${encodeURIComponent(cycleId)}`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),
};

/** Mapa de domínio para rota: o cliente não conhece tabelas nem colunas SQL. */
const LIFE_PATHS: Record<LifeDomainDto, string> = {
  finance_accounts: 'finance/accounts',
  finance_categories: 'finance/categories',
  finance_transactions: 'finance/transactions',
  finance_balance_items: 'finance/balance',
  health_metrics: 'health/metrics',
  health_observations: 'health/observations',
  training_sessions: 'training/sessions',
  reading_materials: 'reading/materials',
  reading_sessions: 'reading/sessions',
  reading_notes: 'reading/notes',
  time_entries: 'time/entries',
};

export interface LifePeriod {
  readonly from: string;
  readonly to: string;
}

function lifePeriodQuery(period: LifePeriod): string {
  return queryString({ from: period.from, to: period.to });
}

export interface LifeRecordMap {
  finance_accounts: FinanceAccountDto;
  finance_categories: FinanceCategoryDto;
  finance_transactions: FinanceTransactionDto;
  finance_balance_items: FinanceBalanceItemDto;
  health_metrics: HealthMetricDto;
  health_observations: HealthObservationDto;
  training_sessions: TrainingSessionDto;
  reading_materials: ReadingMaterialDto;
  reading_sessions: ReadingSessionDto;
  reading_notes: ReadingNoteDto;
  time_entries: TimeEntryDto;
}

export interface LifeCreateMap {
  finance_accounts: CreateFinanceAccount;
  finance_categories: CreateFinanceCategory;
  finance_transactions: CreateFinanceTransaction;
  finance_balance_items: CreateFinanceBalanceItem;
  health_metrics: CreateHealthMetric;
  health_observations: CreateHealthObservation;
  training_sessions: CreateTrainingSession;
  reading_materials: CreateReadingMaterial;
  reading_sessions: CreateReadingSession;
  reading_notes: CreateReadingNote;
  time_entries: CreateTimeEntry;
}

export interface LifeUpdateMap {
  finance_accounts: UpdateFinanceAccount;
  finance_categories: UpdateFinanceCategory;
  finance_transactions: UpdateFinanceTransaction;
  finance_balance_items: UpdateFinanceBalanceItem;
  health_metrics: UpdateHealthMetric;
  health_observations: UpdateHealthObservation;
  training_sessions: UpdateTrainingSession;
  reading_materials: UpdateReadingMaterial;
  reading_sessions: UpdateReadingSession;
  reading_notes: UpdateReadingNote;
  time_entries: UpdateTimeEntry;
}

/**
 * Dados pessoais: somente contratos tipados e versões explícitas trafegam no
 * cliente. Cálculos, deduplicação e proveniência são always produzidos pela API.
 */
export const lifeApi = {
  dashboard: (period: LifePeriod, signal?: AbortSignal) =>
    read<LifeDashboardDto>(withQuery('/life/dashboard', lifePeriodQuery(period)), signal),
  integration: (period: LifePeriod, signal?: AbortSignal) =>
    read<LifeIntegrationDto>(withQuery('/life/integration', lifePeriodQuery(period)), signal),

  financeSummary: (period: LifePeriod, signal?: AbortSignal) =>
    read<FinanceSummaryDto>(withQuery('/life/finance/summary', lifePeriodQuery(period)), signal),
  healthSummary: (period: LifePeriod, signal?: AbortSignal) =>
    read<HealthSummaryDto>(withQuery('/life/health/summary', lifePeriodQuery(period)), signal),
  trainingSummary: (period: LifePeriod, signal?: AbortSignal) =>
    read<TrainingSummaryDto>(withQuery('/life/training/summary', lifePeriodQuery(period)), signal),
  readingSummary: (period: LifePeriod, signal?: AbortSignal) =>
    read<ReadingSummaryDto>(withQuery('/life/reading/summary', lifePeriodQuery(period)), signal),
  timeSummary: (period: LifePeriod, signal?: AbortSignal) =>
    read<TimeSummaryDto>(withQuery('/life/time/summary', lifePeriodQuery(period)), signal),

  list: <D extends LifeDomainDto>(
    domain: D,
    period: LifePeriod,
    cursor?: string,
    signal?: AbortSignal,
  ) =>
    readPage<LifeRecordMap[D]>(
      withQuery(`/life/${LIFE_PATHS[domain]}`, lifePeriodQuery(period) + queryString({ cursor })),
      signal,
    ),
  history: <D extends LifeDomainDto>(domain: D, cursor?: string, signal?: AbortSignal) =>
    readPage<LifeRecordMap[D]>(
      withQuery(`/life/${LIFE_PATHS[domain]}/history`, queryString({ cursor })),
      signal,
    ),
  create: <D extends LifeDomainDto>(
    domain: D,
    // O painel genérico transporta campos dinâmicos; a API valida com Zod.
    body: LifeCreateMap[D] | Record<string, unknown>,
    idempotencyKey: string,
  ) =>
    mutate<LifeRecordMap[D]>(`/life/${LIFE_PATHS[domain]}`, body, {
      'Idempotency-Key': idempotencyKey,
    }),
  correct: <D extends LifeDomainDto>(
    domain: D,
    id: string,
    body: LifeUpdateMap[D] | Record<string, unknown>,
    idempotencyKey: string,
    version: number,
  ) =>
    mutate<LifeRecordMap[D]>(
      `/life/${LIFE_PATHS[domain]}/${encodeURIComponent(id)}`,
      body,
      { 'Idempotency-Key': idempotencyKey, 'If-Match': String(version) },
      'PATCH',
    ),

  previewImport: (body: { domain: LifeDomainDto; format: 'csv' | 'json'; content: string }) =>
    mutate<ImportPreviewDto>('/life/imports/preview', body),
  commitImport: (
    body: {
      domain: LifeDomainDto;
      format: 'csv' | 'json';
      content: string;
      fileName?: string;
      confirm: true;
    },
    idempotencyKey: string,
  ) => mutate<ImportReportDto>('/life/imports', body, { 'Idempotency-Key': idempotencyKey }),
  imports: (limit = 50, signal?: AbortSignal) =>
    read<ImportBatchDto[]>(withQuery('/life/imports', queryString({ limit })), signal),
};

export type { ImportIssueDto, LifeCoverageDto };

async function refreshCsrfAfterAuth(): Promise<void> {
  csrfToken = null;
  await ensureCsrf();
}

/** Remove caches privados ao encerrar a sessão. */
export async function clearPrivateCaches(): Promise<void> {
  setCsrfToken(null);
  if (typeof caches === 'undefined') {
    return;
  }
  const names = await caches.keys();
  await Promise.all(
    // Preserva somente o precache de assets do Workbox. Qualquer outro cache
    // pode conter respostas privadas de versões anteriores da aplicação.
    names
      .filter((name) => !name.startsWith('workbox-precache-v2-'))
      .map((name) => caches.delete(name)),
  );
}
