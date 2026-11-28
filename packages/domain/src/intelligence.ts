import { businessRule, validationError } from './errors';
import { daysSinceInstant, daysBetweenLocal } from './goals';
import { dayCount, isLocalDate, shiftLocalDate, weekStartFor } from './studies';

/**
 * Motor de inteligência determinístico. Toda conclusão nasce de fatos enviados
 * pelo chamador; nenhuma função consulta infraestrutura, relógio do sistema ou
 * fuso do servidor. Números ausentes permanecem `null` — nunca viram zero.
 */

export const INTELLIGENCE_ALGORITHMS = Object.freeze({
  metric: 'intel-metric-v1',
  trend: 'intel-trend-v1',
  consistency: 'intel-consistency-v1',
  alert: 'intel-alert-v1',
  recommendation: 'intel-recommendation-v1',
  projection: 'intel-projection-linear-v1',
  coverage: 'intel-coverage-v1',
  weeklyReview: 'intel-weekly-review-v1',
});

/** Mínimo de observações para chamar algo de tendência; uma única nunca serve. */
export const TREND_MIN_POINTS = 3;
/** Mínimo de pontos para uma projeção linear transparente. */
export const PROJECTION_MIN_POINTS = 4;
export const PROJECTION_WINDOW_POINTS = 8;
export const MAX_ALERTS = 20;
export const MAX_RECOMMENDATIONS = 6;
export const MAX_TIMELINE_EVENTS = 200;
export const REFLECTION_MAX_CHARS = 2_000;

const STUDY_DROP_MIN_PERCENT = 30;
const STUDY_DROP_MIN_MINUTES = 30;
const MIN_OBSERVED_DAYS_FOR_DROP = 3;
const GOAL_STALE_ALERT_DAYS = 30;
const PROJECT_STALL_ALERT_DAYS = 14;
const TASK_ACCUMULATION_ALERT = 5;
const DUE_SOON_DAYS = 7;

export type IntelligenceArea = 'studies' | 'goals' | 'projects' | 'tasks' | 'execution';
export type MetricKind = 'observed' | 'derived' | 'estimated' | 'unavailable';

export interface DatePeriod {
  readonly from: string;
  readonly to: string;
}

export interface IntelligenceMetric {
  readonly id: string;
  readonly name: string;
  readonly area: IntelligenceArea;
  readonly kind: MetricKind;
  readonly value: number | null;
  readonly unit: string;
  readonly period: DatePeriod;
  readonly referenceDate: string;
  readonly source: string;
  /** Proporção de observações esperadas que existem; `null` quando desconhecida. */
  readonly coverage: number | null;
  /** Confiança explícita; `null` quando não há base para estimá-la. */
  readonly confidence: number | null;
  readonly algorithmVersion: string;
}

export function makeMetric(
  input: Omit<IntelligenceMetric, 'algorithmVersion'>,
): IntelligenceMetric {
  assertPeriod(input.period);
  if (!isLocalDate(input.referenceDate)) throw validationError('Data de referência inválida.');
  if (input.value !== null && !Number.isFinite(input.value)) {
    throw validationError('Valor de métrica inválido.');
  }
  if (input.kind === 'unavailable' && input.value !== null) {
    throw businessRule('Métrica indisponível não pode ter valor.');
  }
  if (input.kind !== 'unavailable' && input.value === null) {
    throw businessRule('Métrica disponível exige valor observado.');
  }
  for (const [field, value] of [
    ['cobertura', input.coverage],
    ['confiança', input.confidence],
  ] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) {
      throw validationError(`${field} de métrica inválida.`);
    }
  }
  return { ...input, algorithmVersion: INTELLIGENCE_ALGORITHMS.metric };
}

function assertPeriod(period: DatePeriod): void {
  if (!isLocalDate(period.from) || !isLocalDate(period.to)) {
    throw validationError('Período inválido.');
  }
  if (period.from > period.to) throw validationError('Período invertido.');
}

export interface TrendPoint {
  readonly date: string;
  readonly value: number | null;
  readonly sampleCount: number;
}

export type TrendDirection = 'up' | 'down' | 'stable' | 'unknown';
export type TrendStatus = 'ok' | 'insufficient_data';

export interface TrendAnalysis {
  readonly id: string;
  readonly label: string;
  readonly area: IntelligenceArea;
  readonly status: TrendStatus;
  readonly reason: string | null;
  readonly direction: TrendDirection;
  readonly observedPoints: number;
  readonly firstValue: number | null;
  readonly lastValue: number | null;
  readonly absoluteChange: number | null;
  /** `null` quando a base é zero ou inexistente: variação percentual indefinida. */
  readonly changePercent: number | null;
  readonly stable: boolean | null;
  readonly window: DatePeriod;
  readonly algorithmVersion: string;
}

function insufficientTrend(
  input: TrendInput,
  reason: string,
  observedPoints: number,
): TrendAnalysis {
  return {
    id: input.id,
    label: input.label,
    area: input.area,
    status: 'insufficient_data',
    reason,
    direction: 'unknown',
    observedPoints,
    firstValue: null,
    lastValue: null,
    absoluteChange: null,
    changePercent: null,
    stable: null,
    window: { ...input.window },
    algorithmVersion: INTELLIGENCE_ALGORITHMS.trend,
  };
}

export interface TrendInput {
  readonly id: string;
  readonly label: string;
  readonly area: IntelligenceArea;
  readonly window: DatePeriod;
  readonly points: readonly TrendPoint[];
  /** Tolerância absoluta para classificar variações como estabilidade. */
  readonly stableEpsilon?: number;
}

/**
 * Tendência exige no mínimo TREND_MIN_POINTS observações reais. A variação
 * percentual só é calculada quando o primeiro valor existe e é diferente de
 * zero; lacunas (`null`) nunca são preenchidas com zero.
 */
export function analyzeTrend(input: TrendInput): TrendAnalysis {
  assertPeriod(input.window);
  if (
    input.stableEpsilon !== undefined &&
    (!Number.isFinite(input.stableEpsilon) || input.stableEpsilon < 0)
  ) {
    throw validationError('Limiar de estabilidade inválido.');
  }
  const observed = input.points.filter(
    (point): point is TrendPoint & { value: number } =>
      point.value !== null && Number.isFinite(point.value) && point.sampleCount > 0,
  );
  if (observed.length < TREND_MIN_POINTS) {
    return insufficientTrend(
      input,
      `São necessárias pelo menos ${TREND_MIN_POINTS} observações; há ${observed.length}.`,
      observed.length,
    );
  }
  const first = observed[0];
  const last = observed[observed.length - 1];
  if (first === undefined || last === undefined) return insufficientTrend(input, 'Série vazia.', 0);
  const absoluteChange = Math.round((last.value - first.value) * 1_000) / 1_000;
  const epsilon = input.stableEpsilon ?? 0;
  const stable = Math.abs(absoluteChange) <= epsilon;
  const direction: TrendDirection = stable ? 'stable' : absoluteChange > 0 ? 'up' : 'down';
  return {
    id: input.id,
    label: input.label,
    area: input.area,
    status: 'ok',
    reason: null,
    direction,
    observedPoints: observed.length,
    firstValue: first.value,
    lastValue: last.value,
    absoluteChange,
    changePercent: first.value === 0 ? null : (absoluteChange / first.value) * 100,
    stable,
    window: { ...input.window },
    algorithmVersion: INTELLIGENCE_ALGORITHMS.trend,
  };
}

export interface ConsistencyInput {
  readonly area: IntelligenceArea;
  readonly period: DatePeriod;
  /** Dias do período com pelo menos uma observação registrada. */
  readonly observedDays: number;
  /** Dias do período com atividade efetivamente registrada. */
  readonly activeDays: number;
  readonly totalDays: number;
  readonly source: string;
}

export interface ConsistencyAnalysis {
  readonly area: IntelligenceArea;
  readonly period: DatePeriod;
  readonly status: 'available' | 'insufficient_data';
  readonly observedDays: number;
  readonly activeDays: number;
  /** Dias sem registro — ausência de informação, não ausência de atividade. */
  readonly unobservedDays: number;
  /** Dias com registro e sem atividade: aqui sim há evidência de não execução. */
  readonly inactiveDays: number;
  readonly recordedFrequency: number | null;
  readonly coverage: number;
  readonly note: string;
  readonly algorithmVersion: string;
}

/**
 * Cobertura = observedDays / totalDays. Frequência registrada =
 * activeDays / observedDays. Dias sem registro nunca são contados como
 * "o usuário não fez": são declarados como informação ausente.
 */
export function analyzeConsistency(input: ConsistencyInput): ConsistencyAnalysis {
  assertPeriod(input.period);
  const integers = [input.observedDays, input.activeDays, input.totalDays];
  if (integers.some((value) => !Number.isInteger(value) || value < 0)) {
    throw validationError('Contagens de consistência inválidas.');
  }
  if (input.activeDays > input.observedDays || input.observedDays > input.totalDays) {
    throw validationError('Contagens de consistência incoerentes.');
  }
  if (input.totalDays === 0) throw validationError('Período sem dias.');
  const coverage = Math.round((input.observedDays / input.totalDays) * 1_000) / 1_000;
  const base = {
    area: input.area,
    period: { ...input.period },
    observedDays: input.observedDays,
    activeDays: input.activeDays,
    unobservedDays: input.totalDays - input.observedDays,
    inactiveDays: input.observedDays - input.activeDays,
    coverage,
    algorithmVersion: INTELLIGENCE_ALGORITHMS.consistency,
  };
  if (input.observedDays < TREND_MIN_POINTS) {
    return {
      ...base,
      status: 'insufficient_data',
      recordedFrequency: null,
      note: `Apenas ${input.observedDays} ${input.observedDays === 1 ? 'dia registrado' : 'dias registrados'}; ${base.unobservedDays} sem informação. Não é possível afirmar consistência.`,
    };
  }
  return {
    ...base,
    status: 'available',
    recordedFrequency: Math.round((input.activeDays / input.observedDays) * 1_000) / 1_000,
    note: `${base.unobservedDays} ${base.unobservedDays === 1 ? 'dia sem registro' : 'dias sem registro'} não foram considerados como inatividade.`,
  };
}

export type AlertCategory = 'goal' | 'project' | 'task' | 'study' | 'data';
export type AlertSeverity = 'low' | 'medium' | 'high';

export interface AlertEvidence {
  readonly label: string;
  readonly value: string;
}

export interface IntelligenceAlert {
  readonly code: string;
  readonly category: AlertCategory;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly explanation: string;
  readonly evidence: readonly AlertEvidence[];
  readonly source: string;
  readonly referenceDate: string;
  readonly recommendation: string;
  readonly href: string | null;
  readonly entityId: string | null;
  readonly algorithmVersion: string;
}

export interface AlertGoal {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: number;
  readonly targetDate: string | null;
  readonly lastUpdatedAt: string;
  readonly progressPercent: number | null;
  readonly linkedActions: number;
}

export interface AlertProject {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly lastActivityAt: string | null;
  readonly daysSinceActivity: number | null;
  readonly targetDate: string | null;
  readonly overdueTasks: number;
  readonly overdueMilestones: number;
  readonly blockedTasks: number;
}

export interface AlertTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly projectId: string | null;
  readonly dueDate: string | null;
  readonly overdue: boolean;
  readonly blocked: boolean;
}

export interface AlertStudyWindow {
  readonly minutes: number;
  readonly sessions: number;
  readonly observedDays: number;
}

export interface AlertInput {
  readonly date: string;
  readonly nowMs: number;
  readonly goals: readonly AlertGoal[];
  readonly projects: readonly AlertProject[];
  readonly tasks: readonly AlertTask[];
  readonly currentStudy: AlertStudyWindow;
  readonly previousStudy: AlertStudyWindow;
  readonly sourcesWithData: readonly string[];
  readonly truncated: boolean;
}

function alert(input: Omit<IntelligenceAlert, 'algorithmVersion'>): IntelligenceAlert {
  return { ...input, algorithmVersion: INTELLIGENCE_ALGORITHMS.alert };
}

/**
 * Alertas vêm apenas de fatos registrados. Limiares explícitos evitam transformar
 * qualquer variação negativa em alarme; quando a janela não tem observações, o
 * resultado é um alerta de dados insuficientes — nunca um alerta de desempenho.
 */
export function buildAlerts(input: AlertInput): IntelligenceAlert[] {
  if (!isLocalDate(input.date)) throw validationError('Data de referência inválida.');
  const result: IntelligenceAlert[] = [];

  for (const goal of input.goals) {
    if (goal.status !== 'active' && goal.status !== 'paused') continue;
    const staleDays = daysSinceInstant(goal.lastUpdatedAt, input.nowMs);
    if (staleDays >= GOAL_STALE_ALERT_DAYS) {
      result.push(
        alert({
          code: 'GOAL_STALE',
          category: 'goal',
          severity: staleDays >= 60 ? 'high' : 'medium',
          title: `Objetivo sem atualização registrada: ${goal.title}`,
          explanation:
            'A última atualização registrada é antiga. A ausência de atualização não prova que o objetivo foi abandonado.',
          evidence: [
            { label: 'Dias desde a atualização', value: String(staleDays) },
            {
              label: 'Progresso registrado',
              value: goal.progressPercent === null ? 'indisponível' : `${goal.progressPercent}%`,
            },
          ],
          source: 'goals',
          referenceDate: input.date,
          recommendation: 'Revise o objetivo e registre o que mudou, se houver.',
          href: `/objetivos/${goal.id}`,
          entityId: goal.id,
        }),
      );
    }
    if (goal.linkedActions === 0 && staleDays >= 14) {
      result.push(
        alert({
          code: 'GOAL_WITHOUT_ACTIONS',
          category: 'goal',
          severity: 'low',
          title: `Objetivo sem ações ou projetos vinculados: ${goal.title}`,
          explanation:
            'Não há projeto ou tarefa vinculada no conjunto de dados lido. Isso pode significar planejamento pendente.',
          evidence: [{ label: 'Ações vinculadas', value: '0' }],
          source: 'goals',
          referenceDate: input.date,
          recommendation: 'Verifique se o objetivo precisa de uma próxima ação registrada.',
          href: `/objetivos/${goal.id}`,
          entityId: goal.id,
        }),
      );
    }
    if (goal.targetDate !== null) {
      const remaining = daysBetweenLocal(input.date, goal.targetDate);
      if (
        remaining >= 0 &&
        remaining <= DUE_SOON_DAYS &&
        goal.progressPercent !== null &&
        goal.progressPercent < 50
      ) {
        result.push(
          alert({
            code: 'GOAL_DUE_SOON_LOW_PROGRESS',
            category: 'goal',
            severity: remaining <= 3 ? 'high' : 'medium',
            title: `Prazo próximo com progresso registrado baixo: ${goal.title}`,
            explanation:
              'A comparação usa apenas progresso registrado. Progresso indisponível é tratado como dado ausente, não como zero.',
            evidence: [
              { label: 'Dias até o prazo', value: String(remaining) },
              {
                label: 'Progresso registrado',
                value: goal.progressPercent === null ? 'indisponível' : `${goal.progressPercent}%`,
              },
            ],
            source: 'goals',
            referenceDate: input.date,
            recommendation: 'Escolha explicitamente o próximo passo ou revise o prazo.',
            href: `/objetivos/${goal.id}`,
            entityId: goal.id,
          }),
        );
      }
    }
  }

  for (const project of input.projects) {
    if (project.status !== 'active' && project.status !== 'planned') continue;
    if (
      project.daysSinceActivity !== null &&
      project.daysSinceActivity > PROJECT_STALL_ALERT_DAYS
    ) {
      result.push(
        alert({
          code: 'PROJECT_STALLED',
          category: 'project',
          severity: 'medium',
          title: `Projeto sem movimentação registrada: ${project.title}`,
          explanation: 'A data é a última movimentação registrada no projeto ou em suas entidades.',
          evidence: [
            { label: 'Dias sem movimentação', value: String(project.daysSinceActivity) },
            { label: 'Limiar', value: `${PROJECT_STALL_ALERT_DAYS} dias` },
          ],
          source: 'projects',
          referenceDate: input.date,
          recommendation: 'Retome o projeto com uma ação concreta ou arquive a intenção.',
          href: `/projetos/${project.id}`,
          entityId: project.id,
        }),
      );
    }
    if (project.overdueTasks > 0 || project.overdueMilestones > 0) {
      result.push(
        alert({
          code: 'PROJECT_OVERDUE_WORK',
          category: 'project',
          severity: project.overdueTasks >= TASK_ACCUMULATION_ALERT ? 'high' : 'medium',
          title: `Prazos vencidos em ${project.title}`,
          explanation: 'Contagem de tarefas e marcos com prazo anterior à data de referência.',
          evidence: [
            { label: 'Tarefas vencidas', value: String(project.overdueTasks) },
            { label: 'Marcos vencidos', value: String(project.overdueMilestones) },
          ],
          source: 'projects',
          referenceDate: input.date,
          recommendation: 'Replaneje os prazos ou conclua o trabalho pendente.',
          href: `/projetos/${project.id}`,
          entityId: project.id,
        }),
      );
    }
    if (project.blockedTasks > 0) {
      result.push(
        alert({
          code: 'PROJECT_BLOCKED',
          category: 'project',
          severity: 'medium',
          title: `Projeto com tarefas bloqueadas: ${project.title}`,
          explanation: 'Existem tarefas bloqueadas manualmente ou por dependência não concluída.',
          evidence: [{ label: 'Tarefas bloqueadas', value: String(project.blockedTasks) }],
          source: 'projects',
          referenceDate: input.date,
          recommendation: 'Resolva a dependência ou o bloqueio antes de iniciar novo trabalho.',
          href: `/projetos/${project.id}`,
          entityId: project.id,
        }),
      );
    }
  }

  const overdueTasks = input.tasks.filter((task) => task.overdue);
  if (overdueTasks.length >= TASK_ACCUMULATION_ALERT) {
    result.push(
      alert({
        code: 'TASK_OVERDUE_ACCUMULATION',
        category: 'task',
        severity: overdueTasks.length >= 10 ? 'high' : 'medium',
        title: `${overdueTasks.length} tarefas com prazo vencido`,
        explanation: 'Acúmulo calculado apenas sobre tarefas com prazo explícito e registrado.',
        evidence: [
          { label: 'Tarefas vencidas', value: String(overdueTasks.length) },
          { label: 'Limiar', value: String(TASK_ACCUMULATION_ALERT) },
        ],
        source: 'tasks',
        referenceDate: input.date,
        recommendation: 'Escolha poucas tarefas para reagendar e conclua as mais antigas.',
        href: '/tarefas',
        entityId: null,
      }),
    );
  }
  const blocked = input.tasks.filter((task) => task.blocked);
  if (blocked.length > 0) {
    result.push(
      alert({
        code: 'TASK_BLOCKED',
        category: 'task',
        severity: blocked.some((task) => task.priority === 'critical') ? 'high' : 'medium',
        title: `${blocked.length} ${blocked.length === 1 ? 'tarefa bloqueada' : 'tarefas bloqueadas'}`,
        explanation:
          'Bloqueio explícito ou dependência pendente informada pela camada de execução.',
        evidence: [{ label: 'Tarefas bloqueadas', value: String(blocked.length) }],
        source: 'tasks',
        referenceDate: input.date,
        recommendation: 'Desbloqueie a dependência antes de comprometer prazos.',
        href: '/tarefas',
        entityId: null,
      }),
    );
  }

  const { currentStudy, previousStudy } = input;
  if (
    currentStudy.observedDays >= MIN_OBSERVED_DAYS_FOR_DROP &&
    previousStudy.observedDays >= MIN_OBSERVED_DAYS_FOR_DROP
  ) {
    const previous = previousStudy.minutes;
    const absolute = previous - currentStudy.minutes;
    const percent = previous === 0 ? null : (absolute / previous) * 100;
    if (
      absolute >= STUDY_DROP_MIN_MINUTES &&
      (percent === null || percent >= STUDY_DROP_MIN_PERCENT)
    ) {
      result.push(
        alert({
          code: 'STUDY_TIME_DROP',
          category: 'study',
          severity: (percent ?? 100) >= 50 ? 'high' : 'medium',
          title: 'Redução registrada no tempo de estudo',
          explanation:
            'Comparação entre janelas com observações suficientes. Ausência de registro não é contabilizada como estudo zerado.',
          evidence: [
            { label: 'Minutos na janela anterior', value: String(previous) },
            { label: 'Minutos na janela atual', value: String(currentStudy.minutes) },
            {
              label: 'Variação percentual',
              value: percent === null ? 'indefinida (base zero)' : `${Math.round(percent)}%`,
            },
          ],
          source: 'study_sessions',
          referenceDate: input.date,
          recommendation: 'Confira se a queda é intencional antes de mudar a rotina.',
          href: '/estudos',
          entityId: null,
        }),
      );
    }
  }

  if (!input.truncated && input.sourcesWithData.length === 0) {
    result.push(
      alert({
        code: 'INSUFFICIENT_DATA',
        category: 'data',
        severity: 'low',
        title: 'Ainda não há registros para analisar',
        explanation:
          'Nenhuma fonte de dados real retornou registros. Nenhuma conclusão sobre desempenho foi inferida.',
        evidence: [{ label: 'Fontes com dados', value: '0' }],
        source: 'coverage',
        referenceDate: input.date,
        recommendation: 'Registre dados reais nas áreas existentes para habilitar análises.',
        href: null,
        entityId: null,
      }),
    );
  }

  const rank: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };
  return result
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        a.category.localeCompare(b.category) ||
        a.code.localeCompare(b.code) ||
        (a.entityId ?? '').localeCompare(b.entityId ?? ''),
    )
    .slice(0, MAX_ALERTS);
}

export interface Recommendation {
  readonly id: string;
  readonly action: string;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly priority: AlertSeverity;
  readonly area: IntelligenceArea | 'data';
  readonly entityId: string | null;
  readonly href: string | null;
  readonly confidence: number;
  readonly score: number;
  readonly algorithmVersion: string;
}

const RECOMMENDATION_BY_CODE: Readonly<
  Record<string, { area: Recommendation['area']; action: string; confidence: number }>
> = {
  GOAL_STALE: { area: 'goals', action: 'Revisar objetivo sem atualização', confidence: 0.8 },
  GOAL_WITHOUT_ACTIONS: {
    area: 'goals',
    action: 'Definir uma próxima ação para o objetivo',
    confidence: 0.7,
  },
  GOAL_DUE_SOON_LOW_PROGRESS: {
    area: 'goals',
    action: 'Reavaliar prazo e próximo passo',
    confidence: 0.75,
  },
  PROJECT_STALLED: { area: 'projects', action: 'Retomar projeto parado', confidence: 0.8 },
  PROJECT_OVERDUE_WORK: { area: 'projects', action: 'Replanejar prazos vencidos', confidence: 0.9 },
  PROJECT_BLOCKED: { area: 'tasks', action: 'Resolver bloqueio do projeto', confidence: 0.9 },
  TASK_OVERDUE_ACCUMULATION: {
    area: 'tasks',
    action: 'Reduzir tarefas vencidas acumuladas',
    confidence: 0.9,
  },
  TASK_BLOCKED: { area: 'tasks', action: 'Desbloquear dependência pendente', confidence: 0.85 },
  STUDY_TIME_DROP: {
    area: 'studies',
    action: 'Verificar queda de consistência nos estudos',
    confidence: 0.7,
  },
  INSUFFICIENT_DATA: {
    area: 'data',
    action: 'Registrar dados reais nas áreas disponíveis',
    confidence: 0.95,
  },
};

const PRIORITY_WEIGHT: Record<AlertSeverity, number> = { high: 30, medium: 20, low: 10 };

/**
 * Traduz alertas em poucas ações concretas. Nada é executado automaticamente e
 * nenhuma recomendação é gerada sem um alerta que a justifique.
 */
export function buildRecommendations(alerts: readonly IntelligenceAlert[]): Recommendation[] {
  const byCode = new Map<string, IntelligenceAlert>();
  for (const item of alerts) {
    const existing = byCode.get(item.code);
    if (existing === undefined) byCode.set(item.code, item);
  }
  const recommendations = [...byCode.entries()]
    .map(([code, item]): Recommendation | null => {
      const rule = RECOMMENDATION_BY_CODE[code];
      if (rule === undefined) return null;
      return {
        id: `rec:${code}:${item.entityId ?? 'global'}`,
        action: rule.action,
        reason: item.explanation,
        evidence: item.evidence.map((entry) => `${entry.label}: ${entry.value}`),
        priority: item.severity,
        area: rule.area,
        entityId: item.entityId,
        href: item.href,
        confidence: rule.confidence,
        score: PRIORITY_WEIGHT[item.severity] + Math.round(rule.confidence * 10),
        algorithmVersion: INTELLIGENCE_ALGORITHMS.recommendation,
      };
    })
    .filter((item): item is Recommendation => item !== null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_RECOMMENDATIONS);
  return recommendations;
}

export interface ProjectionPoint {
  readonly date: string;
  readonly value: number;
}

export interface ProjectionInput {
  readonly id: string;
  readonly label: string;
  readonly area: IntelligenceArea;
  readonly unit: string;
  readonly nowMs: number;
  readonly horizonDays: number;
  readonly points: readonly ProjectionPoint[];
}

export interface Projection {
  readonly id: string;
  readonly label: string;
  readonly area: IntelligenceArea;
  readonly unit: string;
  readonly status: 'available' | 'insufficient_data';
  readonly reason: string | null;
  readonly method: string;
  readonly window: DatePeriod | null;
  readonly horizonDays: number;
  readonly projectedValue: number | null;
  readonly dataPoints: number;
  readonly limitations: readonly string[];
  readonly confidence: number | null;
  readonly algorithmVersion: string;
}

function insufficientProjection(
  input: ProjectionInput,
  reason: string,
  limitations: readonly string[],
): Projection {
  return {
    id: input.id,
    label: input.label,
    area: input.area,
    unit: input.unit,
    status: 'insufficient_data',
    reason,
    method: 'linear_regression',
    window: null,
    horizonDays: input.horizonDays,
    projectedValue: null,
    dataPoints: input.points.length,
    limitations,
    confidence: null,
    algorithmVersion: INTELLIGENCE_ALGORITHMS.projection,
  };
}

/**
 * Regressão linear simples sobre os últimos PROJECTION_WINDOW_POINTS pontos.
 * A confiança é o R² do ajuste: transparente, determinística e sem promessa.
 * Com menos de PROJECTION_MIN_POINTS pontos o resultado é `insufficient_data`.
 */
export function buildProjection(input: ProjectionInput): Projection {
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 365) {
    throw validationError('Horizonte de projeção inválido.');
  }
  if (!Number.isFinite(input.nowMs)) throw validationError('Instante inválido.');
  for (const point of input.points) {
    if (!isLocalDate(point.date) || !Number.isFinite(point.value) || point.value < 0) {
      throw validationError('Ponto de projeção inválido.');
    }
  }
  const window = [...input.points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-PROJECTION_WINDOW_POINTS);
  if (window.length < PROJECTION_MIN_POINTS) {
    return insufficientProjection(
      { ...input, points: window },
      `São necessários pelo menos ${PROJECTION_MIN_POINTS} pontos; há ${window.length}.`,
      ['Histórico insuficiente para estimar ritmo.'],
    );
  }
  const xs = window.map((point) => dayNumber(point.date));
  const ys = window.map((point) => point.value);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = (xs[index] ?? 0) - meanX;
    const dy = (ys[index] ?? 0) - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }
  if (denominatorX === 0) {
    return insufficientProjection(
      { ...input, points: window },
      'Todos os pontos têm a mesma data.',
      ['Não é possível estimar ritmo sem variação de datas.'],
    );
  }
  const slope = numerator / denominatorX;
  const intercept = meanY - slope * meanX;
  const targetX = (xs[xs.length - 1] ?? 0) + input.horizonDays;
  const projectedValue = Math.max(0, Math.round((intercept + slope * targetX) * 100) / 100);
  const rSquared =
    denominatorY === 0
      ? 1
      : Math.max(0, Math.min(1, (numerator * numerator) / (denominatorX * denominatorY)));
  return {
    id: input.id,
    label: input.label,
    area: input.area,
    unit: input.unit,
    status: 'available',
    reason: null,
    method: 'linear_regression',
    window: {
      from: window[0]?.date ?? input.points[0]?.date ?? '',
      to: window[window.length - 1]?.date ?? '',
    },
    horizonDays: input.horizonDays,
    projectedValue,
    dataPoints: window.length,
    limitations: [
      'Projeção é uma estimativa determinística, não um compromisso.',
      'Não considera sazonalidade, feriados ou mudanças de comportamento.',
      `Últimos ${window.length} pontos de ${input.points.length} disponíveis.`,
    ],
    confidence: Math.round(rSquared * 1_000) / 1_000,
    algorithmVersion: INTELLIGENCE_ALGORITHMS.projection,
  };
}

function dayNumber(localDate: string): number {
  return Math.floor(Date.parse(`${localDate}T00:00:00.000Z`) / 86_400_000);
}

export interface CoverageSourceInput {
  readonly key: string;
  readonly label: string;
  readonly recordCount: number;
  readonly observedDays: number;
  readonly expectedDays: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly fields: readonly string[];
  readonly populatedFields: readonly string[];
}

export interface CoverageSource {
  readonly key: string;
  readonly label: string;
  readonly recordCount: number;
  readonly observedDays: number;
  readonly expectedDays: number;
  /** observedDays / expectedDays; 0 quando não há registros. */
  readonly coverageRatio: number;
  readonly period: DatePeriod | null;
  readonly missingFields: readonly string[];
}

export interface CoverageReport {
  readonly sources: readonly CoverageSource[];
  readonly unconnectedAreas: readonly string[];
  readonly formula: string;
  readonly algorithmVersion: string;
}

/**
 * Cobertura descreve disponibilidade de dados, não qualidade da pessoa.
 * Áreas sem fonte conectada aparecem em `unconnectedAreas`, nunca com valor zero.
 */
export function buildCoverageReport(
  sources: readonly CoverageSourceInput[],
  unconnectedAreas: readonly string[],
): CoverageReport {
  return {
    sources: sources.map((source) => {
      if (
        !Number.isInteger(source.recordCount) ||
        !Number.isInteger(source.observedDays) ||
        !Number.isInteger(source.expectedDays) ||
        source.observedDays < 0 ||
        source.expectedDays < 0 ||
        source.recordCount < 0 ||
        source.observedDays > source.expectedDays
      ) {
        throw validationError('Contagens de cobertura inválidas.');
      }
      if (
        (source.firstDate !== null && !isLocalDate(source.firstDate)) ||
        (source.lastDate !== null && !isLocalDate(source.lastDate))
      ) {
        throw validationError('Datas de cobertura inválidas.');
      }
      return {
        key: source.key,
        label: source.label,
        recordCount: source.recordCount,
        observedDays: source.observedDays,
        expectedDays: source.expectedDays,
        coverageRatio:
          source.expectedDays === 0
            ? 0
            : Math.round((source.observedDays / source.expectedDays) * 1_000) / 1_000,
        period:
          source.firstDate === null || source.lastDate === null
            ? null
            : { from: source.firstDate, to: source.lastDate },
        missingFields: source.fields.filter((field) => !source.populatedFields.includes(field)),
      } satisfies CoverageSource;
    }),
    unconnectedAreas: [...unconnectedAreas],
    formula: 'cobertura = dias com registro / dias esperados no período; 0 quando não há registros',
    algorithmVersion: INTELLIGENCE_ALGORITHMS.coverage,
  };
}

export interface ReviewFacts {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly studyMinutes: number;
  readonly studySessions: number;
  readonly studyObservedDays: number;
  readonly tasksCompleted: number;
  readonly tasksOverdue: number;
  readonly activeProjects: number;
  readonly movedProjects: number;
  readonly goalsUpdated: number;
  readonly milestonesCompleted: number;
}

export interface WeeklyReviewInput {
  readonly weekStart: string;
  readonly timezone: string;
  readonly generatedAt: string;
  readonly current: ReviewFacts;
  readonly previous: ReviewFacts;
  readonly metrics: readonly IntelligenceMetric[];
  readonly trends: readonly TrendAnalysis[];
  readonly alerts: readonly IntelligenceAlert[];
  readonly recommendations: readonly Recommendation[];
  readonly coverage: CoverageReport;
}

export interface ReviewSectionItem {
  readonly code: string;
  readonly label: string;
  readonly detail: string;
  readonly href: string | null;
}

export interface WeeklyReviewSnapshot {
  readonly schemaVersion: 1;
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly timezone: string;
  readonly generatedAt: string;
  readonly periods: { readonly current: DatePeriod; readonly previous: DatePeriod };
  readonly sections: {
    readonly happened: readonly ReviewSectionItem[];
    readonly advanced: readonly ReviewSectionItem[];
    readonly behind: readonly ReviewSectionItem[];
    readonly attention: readonly ReviewSectionItem[];
    readonly next: readonly ReviewSectionItem[];
  };
  readonly metrics: readonly IntelligenceMetric[];
  readonly trends: readonly TrendAnalysis[];
  readonly alerts: readonly IntelligenceAlert[];
  readonly recommendations: readonly Recommendation[];
  readonly coverage: CoverageReport;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

/**
 * Revisão semanal calculada agora. O snapshot é um valor puro e serializável;
 * a persistência fica na API. Semanas passadas só são recalculadas mediante
 * solicitação explícita — uma revisão salva nunca é reescrita silenciosamente.
 */
export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReviewSnapshot {
  const { current, previous } = input;
  assertPeriod({ from: input.weekStart, to: current.weekEnd });
  if (!isIanaTimezoneLike(input.timezone)) throw validationError('Timezone inválida.');
  if (weekStartFor(input.weekStart) !== input.weekStart) {
    throw validationError('A semana deve começar em uma segunda-feira local.');
  }
  if (
    current.weekStart !== input.weekStart ||
    previous.weekStart !== shiftLocalDate(input.weekStart, -7)
  ) {
    throw validationError('Períodos da revisão inconsistentes.');
  }

  const happened: ReviewSectionItem[] = [
    {
      code: 'STUDY_MINUTES',
      label: 'Estudos registrados',
      detail: `${current.studyMinutes} minutos em ${current.studySessions} sessões e ${current.studyObservedDays} dias com registro.`,
      href: '/estudos',
    },
    {
      code: 'TASKS_COMPLETED',
      label: 'Tarefas concluídas',
      detail: `${current.tasksCompleted} ${current.tasksCompleted === 1 ? 'tarefa concluída' : 'tarefas concluídas'} no período.`,
      href: '/tarefas',
    },
    {
      code: 'PROJECTS_MOVED',
      label: 'Projetos movimentados',
      detail: `${current.movedProjects} de ${current.activeProjects} projetos ativos com movimentação registrada.`,
      href: '/projetos',
    },
    {
      code: 'GOALS_UPDATED',
      label: 'Objetivos atualizados',
      detail: `${current.goalsUpdated} ${current.goalsUpdated === 1 ? 'objetivo atualizado' : 'objetivos atualizados'}; ${current.milestonesCompleted} marcos concluídos.`,
      href: '/objetivos',
    },
  ];

  const deltaMinutes = current.studyMinutes - previous.studyMinutes;
  const advanced: ReviewSectionItem[] = [];
  if (current.studyObservedDays >= 2 && previous.studyObservedDays >= 2 && deltaMinutes > 0) {
    advanced.push({
      code: 'STUDY_UP',
      label: 'Tempo de estudo aumentou',
      detail: `+${deltaMinutes} minutos em relação à semana anterior.`,
      href: '/estudos',
    });
  }
  if (current.tasksCompleted > previous.tasksCompleted) {
    advanced.push({
      code: 'TASKS_UP',
      label: 'Mais tarefas concluídas',
      detail: `${current.tasksCompleted} contra ${previous.tasksCompleted} na semana anterior.`,
      href: '/tarefas',
    });
  }
  for (const trend of input.trends) {
    if (trend.status === 'ok' && trend.direction === 'up') {
      advanced.push({
        code: `TREND_${trend.id.toUpperCase()}`,
        label: `Tendência de alta: ${trend.label}`,
        detail: `Variação absoluta de ${trend.absoluteChange ?? 0} no período analisado.`,
        href: '/inteligencia',
      });
    }
  }

  const behind: ReviewSectionItem[] = [];
  if (current.tasksOverdue > 0) {
    behind.push({
      code: 'TASKS_OVERDUE',
      label: 'Tarefas com prazo vencido',
      detail: `${current.tasksOverdue} ${current.tasksOverdue === 1 ? 'tarefa vencida' : 'tarefas vencidas'} na data de referência.`,
      href: '/tarefas',
    });
  }
  if (current.activeProjects > current.movedProjects) {
    behind.push({
      code: 'PROJECTS_UNMOVED',
      label: 'Projetos sem movimentação registrada',
      detail: `${current.activeProjects - current.movedProjects} projeto(s) ativo(s) sem registro na semana. Ausência de registro não prova paralisação.`,
      href: '/projetos',
    });
  }
  if (current.studyObservedDays < 2) {
    behind.push({
      code: 'STUDY_DATA_GAP',
      label: 'Estudos com poucos registros',
      detail: `${current.studyObservedDays} dia(s) com registro; não é possível avaliar Regularidade.`,
      href: '/estudos',
    });
  }

  const attention: ReviewSectionItem[] = input.alerts.map((item) => ({
    code: item.code,
    label: item.title,
    detail: item.explanation,
    href: item.href,
  }));
  const next: ReviewSectionItem[] = input.recommendations.map((item) => ({
    code: item.id,
    label: item.action,
    detail: item.reason,
    href: item.href,
  }));

  const limitations = [
    ...input.coverage.unconnectedAreas.map(
      (area) => `Sem fonte de dados conectada: ${area}. Nenhum valor foi assumido para esta área.`,
    ),
    ...input.trends
      .filter((trend) => trend.status === 'insufficient_data')
      .map((trend) => `${trend.label}: ${trend.reason ?? 'histórico insuficiente.'}`),
  ];

  return {
    schemaVersion: 1,
    weekStart: input.weekStart,
    weekEnd: current.weekEnd,
    timezone: input.timezone,
    generatedAt: input.generatedAt,
    periods: {
      current: { from: current.weekStart, to: current.weekEnd },
      previous: { from: previous.weekStart, to: previous.weekEnd },
    },
    sections: { happened, advanced, behind, attention, next },
    metrics: input.metrics,
    trends: input.trends,
    alerts: input.alerts,
    recommendations: input.recommendations,
    coverage: input.coverage,
    limitations,
    algorithmVersion: INTELLIGENCE_ALGORITHMS.weeklyReview,
  };
}

/** Aceita qualquer fuso IANA válido; a validação completa vive em `assertIanaTimezone`. */
function isIanaTimezoneLike(value: string): boolean {
  if (value.length < 1 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Resumo de janela usado pelos alertas; rejeita contagens inconsistentes. */
export function summarizeWindow(
  samples: readonly { readonly localDate: string; readonly value: number }[],
  period: DatePeriod,
): AlertStudyWindow {
  assertPeriod(period);
  const dates = new Set<string>();
  let minutes = 0;
  for (const sample of samples) {
    if (!isLocalDate(sample.localDate) || !Number.isFinite(sample.value) || sample.value < 0) {
      throw validationError('Amostra de estudo inválida.');
    }
    if (sample.localDate < period.from || sample.localDate > period.to) continue;
    minutes += sample.value;
    dates.add(sample.localDate);
  }
  return {
    minutes,
    sessions: samples.filter(
      (sample) => sample.localDate >= period.from && sample.localDate <= period.to,
    ).length,
    observedDays: dates.size,
  };
}

/** Janela ISO anterior, usada para comparação sem depender do fuso do servidor. */
export function previousPeriod(period: DatePeriod): DatePeriod {
  assertPeriod(period);
  const length = dayCount(period.from, period.to);
  const from = shiftLocalDate(period.from, -length);
  return { from, to: shiftLocalDate(period.from, -1) };
}

export function periodLength(period: DatePeriod): number {
  assertPeriod(period);
  return dayCount(period.from, period.to);
}
