import {
  createStudySessionRequestSchema,
  createTaskBodySchema,
  type CapacityProfileDto,
  type CapacityResultDto,
  type CreateStudySessionRequest,
  type CreateTaskBody,
  type DecisionAlertDto,
  type DecisionNextActionDto,
  type ExecutionDashboardData,
  type IntelligenceDashboardData,
  type PlanPriority,
  type TaskDto,
  type TaskStatus,
} from '@personal-os/shared';
/** Saudação calculada no fuso da conta, sem usar a hora do servidor. */
export function greetingFor(timezone: string, now: Date): string {
  let zone = timezone;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: zone }).format(now);
  } catch {
    zone = 'America/Sao_Paulo';
  }
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Nenhum número é inventado: cada indicador diz se o dado existe, falta ou carrega. */
export type DataState = 'loading' | 'unavailable' | 'empty' | 'ready';

export interface DayIndicator {
  readonly id: string;
  readonly label: string;
  readonly value: number | null;
  readonly state: DataState;
  readonly hint: string;
}

function countIndicator(
  id: string,
  label: string,
  value: number | null | undefined,
  loading: boolean,
  hint: string,
): DayIndicator {
  if (loading) {
    return { id, label, value: null, state: 'loading', hint: 'Carregando dado real…' };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      id,
      label,
      value: null,
      state: 'unavailable',
      hint: 'Dado indisponível nesta consulta; não foi assumido como zero.',
    };
  }
  return {
    id,
    label,
    value,
    state: value === 0 ? 'empty' : 'ready',
    hint: value === 0 ? 'Nenhum registro encontrado.' : hint,
  };
}

export interface DayIndicatorInput {
  readonly execution: ExecutionDashboardData | null;
  readonly executionLoading: boolean;
  readonly capacity: CapacityResultDto | null;
  readonly capacityLoading: boolean;
  readonly alertCount: number | null;
  readonly alertsLoading: boolean;
}

export function deriveDayIndicators(input: DayIndicatorInput): DayIndicator[] {
  const signals = input.execution?.signals;
  const pending = signals === undefined ? null : signals.executableTasks + signals.blockedTasks;
  return [
    countIndicator(
      'pending',
      'Pendentes (executáveis ou bloqueadas)',
      pending,
      input.executionLoading,
      'Soma de tarefas executáveis e bloqueadas; atrasadas aparecem separadamente.',
    ),
    countIndicator(
      'due-today',
      'Vencem hoje',
      signals?.dueToday,
      input.executionLoading,
      'Prazo local igual à data da conta.',
    ),
    countIndicator(
      'overdue',
      'Atrasadas',
      signals?.overdueTasks,
      input.executionLoading,
      'Prazo anterior à data local da conta.',
    ),
    countIndicator(
      'blocked',
      'Bloqueadas',
      signals?.blockedTasks,
      input.executionLoading,
      'Dependências não resolvidas ou situação bloqueada.',
    ),
    countIndicator(
      'completed',
      'Concluídas hoje',
      signals?.completedTasksToday,
      input.executionLoading,
      'Conclusões registradas com data local de hoje.',
    ),
    countIndicator(
      'committed',
      'Compromisso semanal (min)',
      input.capacity?.committedMinutes,
      input.capacityLoading,
      'Soma de estimativas de tarefas; não é tempo efetivamente trabalhado.',
    ),
    countIndicator(
      'alerts',
      'Alertas em aberto',
      input.alertCount,
      input.alertsLoading,
      'Sinais calculados pela camada de decisão; nenhum é executado automaticamente.',
    ),
  ];
}

export type PriorityKind = 'next-action' | 'risk' | 'decision-alert' | 'intelligence' | 'action';

export interface PriorityItem {
  readonly id: string;
  readonly kind: PriorityKind;
  readonly title: string;
  readonly detail: string;
  /** Origem legível: o usuário precisa saber por que o item está aqui. */
  readonly source: string;
  readonly href: string;
  readonly taskId: string | null;
  readonly version: number | null;
  readonly taskStatus: TaskStatus | null;
  readonly declaredPriority: string | null;
  readonly calculatedScore: number | null;
  readonly rank: number;
}

/** Só aceita destinos internos: a UI nunca segue um href arbitrário vindo da API. */
export function safeInternalHref(href: string | null | undefined, fallback: string): string {
  if (href === null || href === undefined) return fallback;
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return fallback;
  return href;
}

function taskHref(taskId: string): string {
  return `/tarefas?taskId=${encodeURIComponent(taskId)}`;
}

export interface PriorityInput {
  readonly execution: ExecutionDashboardData | null;
  readonly tasks: readonly TaskDto[];
  readonly nextActions: readonly DecisionNextActionDto[];
  readonly alerts: readonly DecisionAlertDto[];
  readonly intelligence: IntelligenceDashboardData | null;
}

/**
 * Compõe sinais já calculados pela API. Não reexecuta o motor e não altera
 * prioridade declarada: `declaredPriority` e `calculatedScore` convivem.
 */
export function derivePriorityItems(input: PriorityInput): PriorityItem[] {
  const items: PriorityItem[] = [];
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const used = new Set<string>();
  const push = (item: PriorityItem): void => {
    if (used.has(item.id)) return;
    used.add(item.id);
    items.push(item);
  };

  const next = input.execution?.nextAction;
  if (next !== undefined && next !== null) {
    const task = taskById.get(next.taskId);
    // A API calcula elegibilidade; quando a tarefa está na leitura local,
    // uma dependência bloqueadora impede sugerir a ação.
    if (task === undefined || task.executable) {
      const taskVersion = task?.version ?? null;
      const ctx = [
        next.projectTitle ? `Projeto: ${next.projectTitle}` : null,
        next.dueDate ? `Prazo: ${next.dueDate}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      push({
        id: `task:${next.taskId}`,
        kind: 'next-action',
        title: next.taskTitle,
        detail: `${next.explanation}${ctx ? ` ${ctx}.` : ''} Motivos: ${next.reasonCodes.join(', ') || 'sem código adicional'}. Regra ${next.algorithmVersion}.`,
        source: 'Próxima ação calculada pela execução',
        href: taskHref(next.taskId),
        taskId: next.taskId,
        version: taskVersion,
        taskStatus: task?.status ?? (next.taskStatus as TaskStatus | undefined) ?? null,
        declaredPriority: next.priority,
        calculatedScore: next.score,
        rank: 0,
      });
    }
  }

  for (const risk of input.execution?.risks ?? []) {
    if (risk.kind === 'OVERDUE_TASK' && used.has(`task:${risk.entityId}`)) continue;
    push({
      id: `risk:${risk.kind}:${risk.entityId}`,
      kind: 'risk',
      title: risk.title,
      detail: `${risk.reasons.join(' ') || 'Sem razões adicionais.'} Gravidade ${risk.severity}. Regra ${risk.algorithmVersion}.`,
      source: 'Risco calculado pela execução',
      href: risk.kind === 'OVERDUE_TASK' ? taskHref(risk.entityId) : '/execucao',
      taskId: risk.kind === 'OVERDUE_TASK' ? risk.entityId : null,
      version: risk.kind === 'OVERDUE_TASK' ? (taskById.get(risk.entityId)?.version ?? null) : null,
      taskStatus:
        risk.kind === 'OVERDUE_TASK' ? (taskById.get(risk.entityId)?.status ?? null) : null,
      declaredPriority: null,
      calculatedScore: null,
      rank: risk.severity === 'high' ? 1 : 2,
    });
  }

  for (const alert of input.alerts.filter((item) => item.state === 'open').slice(0, 5)) {
    push({
      id: `decision:${alert.id}`,
      kind: 'decision-alert',
      title: alert.title,
      detail: `${alert.reason} Evidência: ${alert.evidence.map((item) => `${item.label}: ${item.value}`).join('; ') || 'sem evidência adicional'}. Regra ${alert.ruleVersion}.`,
      source: `Alerta de decisão (${alert.severity}, ${alert.area})`,
      href: safeInternalHref(alert.href, '/inteligencia/alertas'),
      taskId: null,
      version: null,
      taskStatus: null,
      declaredPriority:
        alert.declaredPriority === null ? null : `${alert.declaredPriority}/5 (declarada)`,
      calculatedScore: null,
      rank: alert.severity === 'critical' ? 0 : alert.severity === 'risk' ? 1 : 3,
    });
  }

  for (const alert of (input.intelligence?.alerts ?? []).slice(0, 4)) {
    const entityKey = alert.entityId === null ? alert.code : `entity:${alert.entityId}`;
    if (used.has(`intel:${alert.code}`) || used.has(`entity:${entityKey}`)) continue;
    push({
      id: `intel:${alert.code}`,
      kind: 'intelligence',
      title: alert.title,
      detail: `${alert.explanation} Origem ${alert.source}. Regra ${alert.algorithmVersion}.`,
      source: `Inteligência determinística (${alert.severity}, ${alert.category})`,
      href: safeInternalHref(alert.href, '/inteligencia'),
      taskId: null,
      version: null,
      taskStatus: null,
      declaredPriority: null,
      calculatedScore: null,
      rank: alert.severity === 'high' ? 2 : 4,
    });
  }

  for (const action of input.nextActions.slice(0, 4)) {
    if (action.kind === 'task' && action.blockers.length > 0) continue;
    push({
      id: `action:${action.id}`,
      kind: 'action',
      title: action.title,
      detail: `${action.why} Confiança ${action.confidence}. Regra ${action.algorithmVersion}.`,
      source: 'Próxima ação da camada de decisão',
      href: action.projectId === null ? '/objetivos' : '/projetos',
      taskId: null,
      version: null,
      taskStatus: null,
      declaredPriority: null,
      calculatedScore: null,
      rank: 5,
    });
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, 8);
}

export interface CapacityRow {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export function deriveCapacityRows(
  capacity: CapacityResultDto | null,
  profile: CapacityProfileDto | null,
  loading: boolean,
): { rows: CapacityRow[]; warnings: string[]; limitation: string | null } {
  if (loading) {
    return { rows: [], warnings: [], limitation: 'Carregando capacidade declarada…' };
  }
  if (profile === null || capacity === null) {
    return {
      rows: [],
      warnings: [],
      limitation:
        'Sem perfil de capacidade declarado ou resposta da API. Nenhum horário ou tempo realizado foi inventado.',
    };
  }
  const minutes = new Intl.NumberFormat('pt-BR');
  const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const rows: CapacityRow[] = [
    {
      label: 'Capacidade declarada',
      value: `${minutes.format(profile.weeklyMinutes)} min/semana`,
      detail: 'Valor informado pelo usuário, não uma estimativa do sistema.',
    },
    {
      label: 'Reserva de contingência',
      value: `${percent.format(profile.contingencyPercent)}%`,
      detail: 'Percentual declarado no perfil.',
    },
    {
      label: 'Disponível após reservas',
      value: `${minutes.format(capacity.availableMinutes)} min`,
      detail: 'Capacidade menos contingência e indisponibilidades declaradas.',
    },
    {
      label: 'Comprometido',
      value: `${minutes.format(capacity.committedMinutes)} min`,
      detail: 'Soma de estimativas de tarefas; não representa tempo trabalhado.',
    },
    {
      label: 'Restante',
      value: `${minutes.format(capacity.remainingMinutes)} min`,
      detail:
        capacity.remainingMinutes < 0 ? 'Sobrecarga derivada das estimativas.' : 'Saldo derivado.',
    },
    {
      label: 'Cobertura das estimativas',
      value: `${percent.format(capacity.coverage * 100)}%`,
      detail: `${capacity.estimatedTaskCount} tarefa(s) estimada(s); ${capacity.unestimatedTaskCount} sem estimativa.`,
    },
    {
      label: 'Tarefas bloqueadas',
      value: minutes.format(capacity.blockedTaskCount),
      detail: 'Não entram como compromisso executável.',
    },
  ];
  return { rows, warnings: capacity.warnings, limitation: null };
}

export interface DailyReviewGroups {
  readonly facts: string[];
  readonly calculations: string[];
  readonly recommendations: readonly PriorityItem[];
  readonly limitations: string[];
  readonly planned: string[];
  readonly executed: string[];
  readonly pending: string[];
}

export function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return utc.toISOString().slice(0, 10);
}

export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'todo':
      return 'A fazer';
    case 'in_progress':
      return 'Em andamento';
    case 'blocked':
      return 'Bloqueada';
    case 'completed':
      return 'Concluída';
    case 'cancelled':
      return 'Cancelada';
  }
}

export function deriveDailyReview(input: {
  readonly indicators: readonly DayIndicator[];
  readonly execution: ExecutionDashboardData | null;
  readonly intelligence: IntelligenceDashboardData | null;
  readonly capacity: CapacityResultDto | null;
  readonly priorities: readonly PriorityItem[];
  readonly tasks?: readonly TaskDto[];
  readonly today?: string;
}): DailyReviewGroups {
  const facts: string[] = [];
  const calculations: string[] = [];
  const limitations: string[] = [];
  const planned: string[] = [];
  const executed: string[] = [];
  const pending: string[] = [];

  for (const indicator of input.indicators) {
    if (indicator.id === 'committed' || indicator.id === 'alerts') continue;
    if (indicator.state === 'ready' || indicator.state === 'empty') {
      facts.push(`${indicator.label}: ${indicator.value ?? 0}.`);
    } else if (indicator.state !== 'loading') {
      limitations.push(`${indicator.label}: dado indisponível.`);
    }
  }

  const tasks = input.tasks ?? [];
  const today = input.today ?? input.execution?.date ?? null;
  if (tasks.length > 0 && today !== null) {
    for (const task of tasks) {
      const due =
        task.dueDate === today ? ' (vence hoje)' : task.dueDate ? ` (prazo ${task.dueDate})` : '';
      if (task.status === 'completed') {
        executed.push(`${task.title}${due}.`);
      } else if (task.status !== 'cancelled') {
        const label = `${task.title}${due} · ${taskStatusLabel(task.status)}${task.overdue ? ' · atrasada' : ''}`;
        if (task.dueDate === today || task.status === 'in_progress' || task.overdue) {
          planned.push(`${label}.`);
        }
        pending.push(`${label}.`);
      }
    }
    if (planned.length === 0) {
      limitations.push(
        'Nenhuma tarefa prevista para hoje foi identificada nos dados consultados; use as tarefas pendentes como referência.',
      );
    }
  } else {
    limitations.push('Lista de tarefas não disponível para comparar planejamento e execução.');
  }

  const next = input.execution?.nextAction;
  if (next !== undefined && next !== null) {
    calculations.push(
      `Próxima ação: pontuação ${next.score}, motivos ${next.reasonCodes.join(', ') || 'sem código adicional'}, regra ${next.algorithmVersion}.`,
    );
  }
  if (input.capacity !== null) {
    calculations.push(
      `Capacidade: ${input.capacity.availableMinutes} min disponíveis, ${input.capacity.committedMinutes} min comprometidos por estimativa, ${input.capacity.remainingMinutes} min restantes (regra ${input.capacity.algorithmVersion}).`,
    );
    if (input.capacity.warnings.length > 0) calculations.push(...input.capacity.warnings);
  }
  for (const metric of (input.intelligence?.metrics ?? []).slice(0, 6)) {
    calculations.push(`${metric.name}: ${metric.value ?? 'sem dados'} ${metric.unit}.`);
  }
  for (const source of input.intelligence?.coverage.sources ?? []) {
    if (source.recordCount === 0) limitations.push(`Sem registros em ${source.label}.`);
  }
  if (input.intelligence?.truncated === true || input.execution?.truncated === true) {
    limitations.push('A consulta foi parcial; faltam dados para uma conclusão completa.');
  }

  return {
    facts,
    calculations,
    recommendations: [...input.priorities],
    limitations,
    planned,
    executed,
    pending,
  };
}

export interface QuickTaskDraft {
  readonly title: string;
  readonly priority: PlanPriority;
  readonly dueDate: string;
  readonly projectId: string;
  readonly goalId: string;
  readonly estimateMinutes: string;
}

export interface QuickStudyDraft {
  readonly topic: string;
  readonly durationMinutes: string;
}

type ParseResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function isIssue(value: unknown): value is { path: readonly unknown[]; message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string' &&
    'path' in value &&
    Array.isArray(value.path)
  );
}

function issueMessage(error: { readonly issues: readonly unknown[] }): string {
  const first = error.issues.find(isIssue);
  if (first === undefined) return 'Registro inválido.';
  const field = first.path.map(String).join('.');
  return field === '' ? first.message : `${field}: ${first.message}`;
}

/** Valida antes de mutar; rascunho inválido permanece no formulário. */
export function buildQuickTaskInput(draft: QuickTaskDraft): ParseResult<CreateTaskBody> {
  const parsed = createTaskBodySchema.safeParse({
    title: draft.title.trim(),
    priority: draft.priority,
    dueDate: draft.dueDate,
    ...(draft.projectId === '' ? {} : { projectId: draft.projectId }),
    ...(draft.goalId === '' ? {} : { goalId: draft.goalId }),
    ...(draft.estimateMinutes.trim() === ''
      ? {}
      : { estimateMinutes: Number(draft.estimateMinutes) }),
    dependencyIds: [],
    status: 'todo',
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: issueMessage(parsed.error) };
}

export function buildQuickStudyInput(
  draft: QuickStudyDraft,
  timezone: string,
  now: Date,
): ParseResult<CreateStudySessionRequest> {
  const parsed = createStudySessionRequestSchema.safeParse({
    topic: draft.topic.trim(),
    durationMinutes: Number(draft.durationMinutes),
    startedAt: now.toISOString(),
    timezone,
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: issueMessage(parsed.error) };
}
