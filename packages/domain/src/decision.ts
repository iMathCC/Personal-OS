import { businessRule, validationError } from './errors';
import { dayCount, isLocalDate, shiftLocalDate } from './studies';
import { daysSinceInstant } from './goals';
import { stableHash } from './life';
import type { NextAction } from './execution';

/**
 * Motor de inteligência pessoal da Entrega 18. Toda saída é determinística,
 * versionada e acompanhada de evidência; nenhuma recomendação é executada.
 */
export const DECISION_ALGORITHMS = Object.freeze({
  sufficiency: 'decision-sufficiency-v1',
  period: 'decision-period-v1',
  crossDomain: 'cross-domain-analysis-v1',
  earlyWarning: 'early-warning-v1',
  alertDedupe: 'alert-dedupe-v1',
  recommendation: 'decision-recommendation-v1',
  priority: 'decision-priority-v1',
  nextAction: 'next-best-action-v1',
  review: 'performance-review-v1',
  explainability: 'decision-explainability-v1',
});

export const DECISION_PRIORITY_FORMULA =
  'score = severidade(40/30/20/10) + confiança×10 + urgência(15/8/0) − min(10, esforço_em_horas×2); sugestão = ceil((100−score)/20), limitada a 1..5';
export const DECISION_PRIORITY_WEIGHTS = Object.freeze({
  severity: Object.freeze({ critical: 40, risk: 30, attention: 20, info: 10 }),
  confidence: 10,
  urgency: Object.freeze({ now: 15, soon: 8, later: 0 }),
  effortPenaltyPerHour: 2,
  maxEffortPenalty: 10,
});
export const MIN_CORRELATION_POINTS = 6;
export const MIN_OBSERVED_DAYS = 3;
export const MAX_DECISION_ALERTS = 20;
export const MAX_DECISION_RECOMMENDATIONS = 8;
export const MAX_DECISION_PERIOD_DAYS = 366;

export const DECISION_SEVERITIES = ['info', 'attention', 'risk', 'critical'] as const;
export type DecisionSeverity = (typeof DECISION_SEVERITIES)[number];
export type DecisionComparisonMode = 'week' | 'month' | 'quarter' | 'custom';
export type DecisionAlertState = 'open' | 'acknowledged' | 'dismissed';

export interface DecisionDatePeriod {
  readonly from: string;
  readonly to: string;
}

export interface DecisionPeriods {
  readonly comparison: DecisionComparisonMode;
  readonly label: string;
  readonly current: DecisionDatePeriod;
  readonly previous: DecisionDatePeriod;
  readonly currentDays: number;
  readonly previousDays: number;
  readonly equivalent: boolean;
  readonly algorithmVersion: string;
}

export interface DecisionExplanation {
  readonly identified: string;
  readonly dataUsed: readonly string[];
  readonly calculation: string;
  readonly missing: readonly string[];
  readonly period: DecisionDatePeriod;
  readonly algorithmVersion: string;
  readonly confidence: number;
  readonly cannotConclude: string;
  readonly limitations: readonly string[];
  readonly sources: readonly string[];
}

export interface DecisionSufficiencyInput {
  readonly observations: number;
  readonly observedDays: number;
  readonly expectedDays: number;
  readonly requiredObservations: number;
  readonly sources: readonly string[];
  readonly missing?: readonly string[];
}

export interface DecisionSufficiency {
  readonly status: 'sufficient' | 'partial' | 'insufficient';
  readonly observations: number;
  readonly observedDays: number;
  readonly expectedDays: number;
  readonly requiredObservations: number;
  readonly coverage: number | null;
  readonly confidence: number;
  readonly missing: readonly string[];
  readonly limitations: readonly string[];
  readonly sources: readonly string[];
  readonly algorithmVersion: string;
}

export const CROSS_DOMAIN_CATALOG = Object.freeze([
  {
    id: 'study_time_vs_academic_progress',
    label: 'Tempo de estudo versus evolução acadêmica',
    sources: ['study_sessions', 'goals', 'metric_observations'],
    minimumObservations: 6,
    correlationAllowed: true,
    condition: 'Pelo menos 6 pontos pareados, com variação nas duas séries.',
  },
  {
    id: 'execution_time_vs_project_progress',
    label: 'Tempo registrado versus avanço de projetos',
    sources: ['time_entries', 'projects', 'tasks'],
    minimumObservations: 6,
    correlationAllowed: true,
    condition: 'Pelo menos 6 pontos pareados; tempo em minutos e progresso em percentual.',
  },
  {
    id: 'time_distribution_vs_strategic_goals',
    label: 'Distribuição de tempo versus objetivos estratégicos',
    sources: ['time_entries', 'planning_cycle_objectives', 'strategic_goals'],
    minimumObservations: 6,
    correlationAllowed: false,
    condition: 'Ciclo ativo, objetivos vinculados e pelo menos 6 dias com tempo registrado.',
  },
  {
    id: 'finance_vs_commitments',
    label: 'Fluxo financeiro versus compromissos registrados',
    sources: ['finance_transactions', 'tasks', 'projects'],
    minimumObservations: 6,
    correlationAllowed: false,
    condition: 'Despesas observadas e compromissos ativos no mesmo período.',
  },
  {
    id: 'training_consistency',
    label: 'Consistência de treinamento',
    sources: ['training_sessions'],
    minimumObservations: 6,
    correlationAllowed: false,
    condition: 'Pelo menos 6 sessões ou 3 dias observados em cada janela comparável.',
  },
  {
    id: 'reading_vs_knowledge_goals',
    label: 'Leitura versus objetivos de conhecimento',
    sources: ['reading_sessions', 'reading_materials', 'goals'],
    minimumObservations: 6,
    correlationAllowed: false,
    condition: 'Sessões de leitura e material vinculado a objetivo/curso.',
  },
  {
    id: 'capacity_vs_logged_time',
    label: 'Capacidade configurada versus tempo efetivamente registrado',
    sources: ['capacity_profiles', 'time_entries'],
    minimumObservations: 3,
    correlationAllowed: false,
    condition: 'Perfil de capacidade ativo e pelo menos 3 dias observados.',
  },
]);

export interface DecisionSeriesPoint {
  readonly date: string;
  readonly value: number | null;
}

export interface CrossDomainCandidate {
  readonly id: string;
  readonly seriesA: readonly DecisionSeriesPoint[];
  readonly seriesB: readonly DecisionSeriesPoint[];
  readonly sources: readonly string[];
  readonly missing: readonly string[];
  readonly compatible: boolean;
  readonly descriptive: string;
}

export interface CrossDomainAnalysis {
  readonly id: string;
  readonly label: string;
  readonly status: 'ok' | 'insufficient_data' | 'incompatible';
  readonly sources: readonly string[];
  readonly period: DecisionDatePeriod;
  readonly observations: number;
  readonly pairedPoints: number;
  readonly coverage: number | null;
  readonly correlation: number | null;
  readonly relation: 'positive' | 'negative' | 'none' | 'not_estimated';
  readonly descriptive: string;
  readonly confidence: number;
  readonly causality: 'not_claimed';
  readonly explanation: DecisionExplanation;
  readonly algorithmVersion: string;
}

export interface DecisionGoal {
  readonly id: string;
  readonly area: string;
  readonly status: string;
  readonly priority: number;
  readonly targetDate: string | null;
  readonly manualProgress: number | null;
  readonly updatedAt: string;
  readonly declaredPriority?: number | null;
}

export interface DecisionProject {
  readonly id: string;
  readonly title?: string;
  readonly status: string;
  readonly priority: string;
  readonly targetDate: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string;
  readonly declaredPriority?: number | null;
}

export interface DecisionTask {
  readonly id: string;
  readonly status: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly projectId: string | null;
  readonly goalId: string | null;
  readonly dueDate: string | null;
  readonly estimateMinutes: number | null;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly dependencyIds: readonly string[];
}

export interface DecisionMilestone {
  readonly id: string;
  readonly projectId: string | null;
  readonly status: string;
  readonly dueDate: string | null;
  readonly completedAt: string | null;
}

export interface DecisionFacts {
  readonly goalsActive: number;
  readonly goalsCompleted: number;
  readonly strategicGoals: number;
  readonly projectsActive: number;
  readonly projectsCompleted: number;
  readonly tasksOpen: number;
  readonly tasksOverdue: number;
  readonly tasksBlocked: number;
  readonly tasksCompleted: number;
  readonly cycleObjectives: number;
  readonly weeklyReviewCount: number;
  readonly quarterlyReviewCount: number;
  readonly importBatches: number;
  readonly financeExpenseCents: number;
  readonly financeExpenses: number;
  readonly healthObservations: number;
  readonly trainingObservations: number;
  readonly readingObservations: number;
  readonly timeObservations: number;
  readonly timeMinutes: number;
  readonly studySessions: number;
  readonly studyMinutes: number;
  readonly capacityWeeklyMinutes: number | null;
  readonly capacityContingencyPercent: number | null;
  readonly activeCycleId: string | null;
  readonly activeCycleName: string | null;
  readonly linkedReadingMaterials: number;
}

export interface StoredAlertState {
  readonly state: 'acknowledged' | 'dismissed';
  readonly version: number;
}

export interface StudyTrendFact {
  readonly status: 'ok' | 'insufficient_data';
  readonly direction: 'up' | 'down' | 'stable' | 'unknown';
  readonly changePercent: number | null;
  readonly observedPoints: number;
}

export interface DecisionAlertInput {
  readonly period: DecisionDatePeriod;
  readonly periods: DecisionPeriods;
  readonly now: string;
  /** Data local do usuário; `now` é um instante UTC e não define o "hoje" local. */
  readonly today: string;
  readonly goals: readonly DecisionGoal[];
  readonly projects: readonly DecisionProject[];
  readonly tasks: readonly DecisionTask[];
  readonly milestones: readonly DecisionMilestone[];
  readonly facts: DecisionFacts;
  readonly sufficiency: Readonly<Record<string, DecisionSufficiency>>;
  readonly crossDomain: readonly CrossDomainAnalysis[];
  readonly states: Readonly<Record<string, StoredAlertState>>;
  readonly studyTrend: StudyTrendFact;
  readonly timeMinutesByProject: Readonly<Record<string, number>>;
  readonly financeLimitCents: number | null;
}

export interface DecisionAlert {
  readonly id: string;
  readonly type: string;
  readonly severity: DecisionSeverity;
  readonly area: string;
  readonly title: string;
  readonly reason: string;
  readonly detectedAt: string;
  readonly state: DecisionAlertState;
  readonly stateVersion: number | null;
  readonly ruleVersion: string;
  readonly entityId: string | null;
  readonly declaredPriority: number | null;
  readonly sources: readonly string[];
  readonly evidence: readonly { readonly label: string; readonly value: string }[];
  readonly explanation: DecisionExplanation;
  readonly href: string | null;
}

export interface DecisionRecommendation {
  readonly id: string;
  readonly alertId: string;
  readonly title: string;
  readonly description: string;
  readonly reason: string;
  readonly expectedImpact: string;
  readonly urgency: 'now' | 'soon' | 'later';
  readonly effortMinutes: number | null;
  readonly sources: readonly string[];
  readonly confidence: number;
  readonly score: number;
  readonly declaredPriority: number | null;
  readonly suggestedPriority: number;
  readonly limitations: readonly string[];
  readonly nextAction: string;
  readonly explanation: DecisionExplanation;
  readonly algorithmVersion: string;
}

export interface DecisionNextAction {
  readonly id: string;
  readonly kind: 'task' | 'data_collection';
  readonly title: string;
  readonly why: string;
  readonly goalId: string | null;
  readonly projectId: string | null;
  readonly expectedImpact: string;
  readonly effortMinutes: number | null;
  readonly blockers: readonly string[];
  readonly sources: readonly string[];
  readonly confidence: number;
  readonly explanation: DecisionExplanation;
  readonly algorithmVersion: string;
}

export interface DecisionReviewItem {
  readonly label: string;
  readonly value: string;
  readonly kind: 'observed' | 'calculated' | 'insufficient';
  readonly sources: readonly string[];
}

export interface DecisionComparison {
  readonly metric: string;
  readonly current: number | null;
  readonly previous: number | null;
  readonly delta: number | null;
  readonly changePercent: number | null;
  readonly status: 'ok' | 'insufficient_data';
  readonly coverage: number | null;
  readonly limitations: readonly string[];
}

export interface DecisionReview {
  readonly kind: 'weekly' | 'monthly' | 'quarterly';
  readonly period: DecisionDatePeriod;
  readonly previous: DecisionDatePeriod;
  readonly sections: readonly {
    readonly title: string;
    readonly items: readonly DecisionReviewItem[];
  }[];
  readonly comparisons: readonly DecisionComparison[];
  readonly persistedSnapshot: boolean;
  readonly limitations: readonly string[];
  readonly explanation: DecisionExplanation;
  readonly algorithmVersion: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) throw validationError(`${field} deve ser finito.`);
  return value;
}

function assertNonNegative(value: number, field: string): number {
  assertFinite(value, field);
  if (value < 0) throw validationError(`${field} não pode ser negativo.`);
  return value;
}

function partsOf(localDate: string): { year: number; month: number; day: number } {
  if (!isLocalDate(localDate)) throw validationError('Data local inválida.');
  const segments = localDate.split('-').map(Number);
  const year = segments[0] ?? 0;
  const month = segments[1] ?? 0;
  const day = segments[2] ?? 0;
  return { year, month, day };
}

function localDateFromParts(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function quarterStart(year: number, month: number): string {
  const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return localDateFromParts(year, quarterMonth, 1);
}

function previousMonthStart(year: number, month: number): string {
  return month === 1 ? localDateFromParts(year - 1, 12, 1) : localDateFromParts(year, month - 1, 1);
}

function previousQuarterStart(year: number, month: number): string {
  const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return quarterMonth <= 3
    ? localDateFromParts(year - 1, 10, 1)
    : localDateFromParts(year, quarterMonth - 3, 1);
}

export function decisionPeriods(
  today: string,
  comparison: DecisionComparisonMode,
  explicit?: DecisionDatePeriod,
): DecisionPeriods {
  assertFinite(Date.parse(`${today}T00:00:00.000Z`), 'today');
  const { year, month, day } = partsOf(today);
  let current: DecisionDatePeriod;
  let label: string;

  if (explicit !== undefined) {
    if (!isLocalDate(explicit.from) || !isLocalDate(explicit.to)) {
      throw validationError('Período explícito inválido.');
    }
    const length = dayCount(explicit.from, explicit.to);
    if (length <= 0 || length > MAX_DECISION_PERIOD_DAYS) {
      throw validationError('Período explícito fora do limite.');
    }
    current = explicit;
    label = 'Período informado';
  } else if (comparison === 'week') {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    current = { from: shiftLocalDate(today, -mondayOffset), to: today };
    label = 'Semana corrente';
  } else if (comparison === 'month') {
    current = { from: localDateFromParts(year, month, 1), to: today };
    label = 'Mês corrente';
  } else if (comparison === 'quarter') {
    current = { from: quarterStart(year, month), to: today };
    label = 'Trimestre corrente';
  } else {
    throw validationError('comparison é obrigatório quando o período não é explícito.');
  }

  const length = dayCount(current.from, current.to);
  if (length <= 0 || length > MAX_DECISION_PERIOD_DAYS) {
    throw businessRule('Período analisado fora do limite.');
  }
  const previousEnd = shiftLocalDate(current.from, -1);
  const previousStart = shiftLocalDate(previousEnd, -(length - 1));

  let previous: DecisionDatePeriod;
  if (explicit !== undefined) {
    previous = { from: previousStart, to: previousEnd };
  } else if (comparison === 'week') {
    const monday = partsOf(current.from);
    const todayParts = partsOf(today);
    const todayWeekday = new Date(
      Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day),
    ).getUTCDay();
    const priorMonday = new Date(Date.UTC(monday.year, monday.month - 1, monday.day - 7));
    const currentElapsed = todayWeekday === 0 ? 6 : todayWeekday - 1;
    const start = localDateFromParts(
      priorMonday.getUTCFullYear(),
      priorMonday.getUTCMonth() + 1,
      priorMonday.getUTCDate(),
    );
    previous = { from: start, to: shiftLocalDate(start, currentElapsed) };
  } else if (comparison === 'month') {
    const start = previousMonthStart(year, month);
    previous = { from: start, to: shiftLocalDate(start, length - 1) };
  } else if (comparison === 'quarter') {
    const start = previousQuarterStart(year, month);
    previous = { from: start, to: shiftLocalDate(start, length - 1) };
  } else {
    previous = { from: previousStart, to: previousEnd };
  }

  const previousDays = dayCount(previous.from, previous.to);
  return {
    comparison: explicit === undefined ? comparison : 'custom',
    label,
    current,
    previous,
    currentDays: length,
    previousDays,
    equivalent: length === previousDays,
    algorithmVersion: DECISION_ALGORITHMS.period,
  };
}

export function assessDataSufficiency(input: DecisionSufficiencyInput): DecisionSufficiency {
  assertNonNegative(input.observations, 'observations');
  assertNonNegative(input.observedDays, 'observedDays');
  assertNonNegative(input.expectedDays, 'expectedDays');
  assertNonNegative(input.requiredObservations, 'requiredObservations');
  if (input.requiredObservations <= 0)
    throw validationError('requiredObservations deve ser positivo.');
  const coverage =
    input.expectedDays > 0 ? clamp(input.observedDays / input.expectedDays, 0, 1) : null;
  const observationRatio = clamp(input.observations / input.requiredObservations, 0, 1);
  const confidence = round3(coverage === null ? observationRatio : observationRatio * coverage);
  const missing = [...new Set(input.missing ?? [])];
  const limitations: string[] = [];
  if (input.observedDays < MIN_OBSERVED_DAYS) {
    limitations.push(`Mínimo de ${MIN_OBSERVED_DAYS} dias observados não atingido.`);
  }
  if (missing.length > 0) limitations.push(`Ausentes: ${missing.join(', ')}.`);
  const status =
    input.observations >= input.requiredObservations && input.observedDays >= MIN_OBSERVED_DAYS
      ? 'sufficient'
      : input.observations > 0 || input.observedDays > 0
        ? 'partial'
        : 'insufficient';
  return {
    status,
    observations: input.observations,
    observedDays: input.observedDays,
    expectedDays: input.expectedDays,
    requiredObservations: input.requiredObservations,
    coverage: coverage === null ? null : round3(coverage),
    confidence,
    missing,
    limitations,
    sources: [...new Set(input.sources)],
    algorithmVersion: DECISION_ALGORITHMS.sufficiency,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pearson(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < MIN_CORRELATION_POINTS) return null;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const deltaA = (a[index] ?? 0) - meanA;
    const deltaB = (b[index] ?? 0) - meanB;
    covariance += deltaA * deltaB;
    varianceA += deltaA * deltaA;
    varianceB += deltaB * deltaB;
  }
  if (varianceA === 0 || varianceB === 0) return null;
  return clamp(covariance / Math.sqrt(varianceA * varianceB), -1, 1);
}

function valueByDate(series: readonly DecisionSeriesPoint[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const point of series) {
    if (point.value === null || !Number.isFinite(point.value)) continue;
    map.set(point.date, point.value);
  }
  return map;
}

function makeExplanation(input: {
  identified: string;
  dataUsed: readonly string[];
  calculation: string;
  missing: readonly string[];
  period: DecisionDatePeriod;
  confidence: number;
  cannotConclude: string;
  limitations: readonly string[];
  sources: readonly string[];
}): DecisionExplanation {
  return {
    identified: input.identified,
    dataUsed: [...new Set(input.dataUsed)],
    calculation: input.calculation,
    missing: [...new Set(input.missing)],
    period: input.period,
    algorithmVersion: DECISION_ALGORITHMS.explainability,
    confidence: round3(clamp(input.confidence, 0, 1)),
    cannotConclude: input.cannotConclude,
    limitations: [...new Set(input.limitations)],
    sources: [...new Set(input.sources)],
  };
}

export function analyzeCrossDomain(input: {
  period: DecisionDatePeriod;
  candidates: readonly CrossDomainCandidate[];
}): CrossDomainAnalysis[] {
  return CROSS_DOMAIN_CATALOG.map((catalog) => {
    const candidate = input.candidates.find((item) => item.id === catalog.id);
    const missing = candidate === undefined ? ['série não fornecida'] : [...candidate.missing];
    const sources = candidate?.sources ?? [...catalog.sources];
    const a = valueByDate(candidate?.seriesA ?? []);
    const b = valueByDate(candidate?.seriesB ?? []);
    const dates = [...a.keys()].filter((date) => b.has(date)).sort();
    const paired: { a: number; b: number }[] = dates.map((date) => ({
      a: a.get(date) ?? 0,
      b: b.get(date) ?? 0,
    }));
    const observations = new Set([
      ...(candidate?.seriesA.filter((point) => point.value !== null).map((point) => point.date) ??
        []),
      ...(candidate?.seriesB.filter((point) => point.value !== null).map((point) => point.date) ??
        []),
    ]).size;
    const coverage =
      input.period.from <= input.period.to
        ? clamp(observations / Math.max(1, dayCount(input.period.from, input.period.to)), 0, 1)
        : null;
    const enough =
      paired.length >= catalog.minimumObservations && observations >= catalog.minimumObservations;
    const correlation =
      enough && catalog.correlationAllowed && candidate?.compatible === true
        ? pearson(
            paired.map((point) => point.a),
            paired.map((point) => point.b),
          )
        : null;
    const status: CrossDomainAnalysis['status'] =
      candidate === undefined || !enough
        ? 'insufficient_data'
        : catalog.correlationAllowed && candidate.compatible === false
          ? 'incompatible'
          : 'ok';
    const relation: CrossDomainAnalysis['relation'] =
      correlation === null
        ? 'not_estimated'
        : Math.abs(correlation) < 0.2
          ? 'none'
          : correlation > 0
            ? 'positive'
            : 'negative';
    const confidence =
      status === 'ok'
        ? round3(
            clamp(
              (paired.length / Math.max(1, catalog.minimumObservations)) * (coverage ?? 1),
              0,
              1,
            ),
          )
        : 0;
    const descriptive =
      candidate?.descriptive ?? 'Análise indisponível: série ou condição mínima não fornecida.';
    const calculation = catalog.correlationAllowed
      ? 'Correlação de Pearson somente com séries compatíveis, pontos pareados e variância não nula.'
      : 'Comparação descritiva; nenhuma correlação estimada porque as unidades não são comparáveis.';
    return {
      id: catalog.id,
      label: catalog.label,
      status,
      sources: [...sources],
      period: input.period,
      observations,
      pairedPoints: paired.length,
      coverage: coverage === null ? null : round3(coverage),
      correlation: correlation === null ? null : round3(correlation),
      relation,
      descriptive,
      confidence,
      causality: 'not_claimed',
      explanation: makeExplanation({
        identified: status === 'ok' ? descriptive : 'Evidência insuficiente para esta análise.',
        dataUsed: paired.length > 0 ? [`${paired.length} pontos pareados`, ...sources] : sources,
        calculation,
        missing,
        period: input.period,
        confidence,
        cannotConclude:
          'Não é possível afirmar causalidade, necessidade ou desempenho a partir desta relação.',
        limitations: [
          ...missing,
          'Séries incompletas não são tratadas como zeros.',
          ...(paired.length < catalog.minimumObservations
            ? [`Mínimo de ${catalog.minimumObservations} pontos pareados não atingido.`]
            : []),
        ],
        sources,
      }),
      algorithmVersion: DECISION_ALGORITHMS.crossDomain,
    };
  });
}

function severityRank(severity: DecisionSeverity): number {
  return DECISION_SEVERITIES.indexOf(severity);
}

function alertExplanation(input: {
  period: DecisionDatePeriod;
  identified: string;
  calculation: string;
  confidence: number;
  missing: readonly string[];
  limitations: readonly string[];
  sources: readonly string[];
}): DecisionExplanation {
  return makeExplanation({
    identified: input.identified,
    dataUsed: input.sources,
    calculation: input.calculation,
    missing: input.missing,
    period: input.period,
    confidence: input.confidence,
    cannotConclude: 'Alerta não é diagnóstico, ordem nem prova de causalidade.',
    limitations: input.limitations,
    sources: input.sources,
  });
}

export function detectDecisionAlerts(input: DecisionAlertInput): DecisionAlert[] {
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(nowMs)) throw validationError('Instante da requisição inválido.');
  if (!isLocalDate(input.today)) throw validationError('Data local de referência inválida.');
  const today = input.today;
  const alerts: DecisionAlert[] = [];
  const seen = new Set<string>();

  const push = (draft: {
    type: string;
    severity: DecisionSeverity;
    area: string;
    title: string;
    reason: string;
    sources: readonly string[];
    evidence: readonly { readonly label: string; readonly value: string }[];
    calculation: string;
    missing?: readonly string[];
    limitations?: readonly string[];
    entityId?: string | null;
    declaredPriority?: number | null;
    href?: string | null;
    confidence?: number;
    ruleVersion?: string;
  }): void => {
    const ruleVersion = draft.ruleVersion ?? DECISION_ALGORITHMS.earlyWarning;
    const entity = draft.entityId ?? 'global';
    const id = stableHash(
      `${ruleVersion}|${draft.type}|${entity}|${input.period.from}|${input.period.to}`,
    );
    if (seen.has(id)) return;
    seen.add(id);
    const stored = input.states[id];
    const state: DecisionAlertState =
      stored?.state === 'acknowledged' || stored?.state === 'dismissed' ? stored.state : 'open';
    alerts.push({
      id,
      type: draft.type,
      severity: draft.severity,
      area: draft.area,
      title: draft.title,
      reason: draft.reason,
      detectedAt: input.now,
      state,
      stateVersion: stored?.version ?? null,
      ruleVersion,
      entityId: draft.entityId ?? null,
      declaredPriority: draft.declaredPriority ?? null,
      sources: [...draft.sources],
      evidence: draft.evidence.map((item) => ({ label: item.label, value: item.value })),
      explanation: alertExplanation({
        period: input.period,
        identified: draft.reason,
        calculation: draft.calculation,
        confidence: draft.confidence ?? 0.7,
        missing: draft.missing ?? [],
        limitations: draft.limitations ?? [],
        sources: draft.sources,
      }),
      href: draft.href ?? null,
    });
  };

  for (const goal of input.goals) {
    const age = daysSinceInstant(goal.updatedAt, nowMs);
    if (goal.status !== 'active' && goal.status !== 'paused') continue;
    if (age < 30) continue;
    const noProgress = goal.manualProgress === null || goal.manualProgress === 0;
    if (!noProgress) continue;
    push({
      type: 'GOAL_STALE_NO_PROGRESS',
      severity: 'risk',
      area: goal.area,
      title: 'Objetivo sem progresso registrado',
      reason: `Objetivo sem atualização há ${age} dias e sem progresso informado.`,
      sources: ['goals'],
      evidence: [
        { label: 'Dias sem atualização', value: String(age) },
        { label: 'Progresso informado', value: 'não' },
      ],
      calculation: 'Idade desde updatedAt ≥ 30 dias e manual_progress ausente.',
      entityId: goal.id,
      declaredPriority: goal.declaredPriority ?? goal.priority,
      href: '/objetivos',
    });
  }

  for (const project of input.projects) {
    if (project.status !== 'active') continue;
    const age = daysSinceInstant(project.updatedAt, nowMs);
    if (age < 14) continue;
    const logged = input.timeMinutesByProject[project.id] ?? 0;
    const completed = input.tasks.some(
      (task) => task.projectId === project.id && task.completedAt !== null,
    );
    if (logged < 240 || completed) continue;
    push({
      type: 'PROJECT_EFFORT_WITHOUT_DELIVERY',
      severity: 'attention',
      area: 'projects',
      title: 'Esforço registrado sem entrega observada',
      reason: 'Projeto ativo com tempo registrado no período e nenhuma conclusão observada.',
      sources: ['projects', 'tasks', 'time_entries'],
      evidence: [
        { label: 'Minutos registrados', value: String(logged) },
        { label: 'Dias sem atualização', value: String(age) },
      ],
      calculation:
        'Projeto ativo, ≥ 14 dias sem atualização, ≥ 240 minutos registrados e zero tarefas concluídas.',
      entityId: project.id,
      declaredPriority: project.declaredPriority ?? null,
      href: '/projetos',
    });
  }

  const overdue = input.tasks.filter(
    (task) =>
      task.status !== 'completed' &&
      task.status !== 'cancelled' &&
      task.dueDate !== null &&
      task.dueDate < today,
  );
  if (overdue.length >= 5) {
    push({
      type: 'TASK_OVERDUE_ACCUMULATION',
      severity: 'risk',
      area: 'tasks',
      title: 'Acúmulo de prazos vencidos',
      reason: `${overdue.length} tarefas não concluídas com prazo vencido.`,
      sources: ['tasks'],
      evidence: [
        { label: 'Tarefas vencidas', value: String(overdue.length) },
        { label: 'Tarefas bloqueadas', value: String(input.facts.tasksBlocked) },
      ],
      calculation: 'Contagem de tarefas não concluídas com due_date anterior à data atual.',
      limitations: ['Prazos sem registro não entram na contagem.'],
      href: '/tarefas',
    });
  }

  const blocked = input.tasks.filter(
    (task) => task.status === 'blocked' || task.dependencyIds.length > 0,
  );
  if (blocked.length >= 5) {
    push({
      type: 'TASK_BLOCKED_ACCUMULATION',
      severity: 'attention',
      area: 'execution',
      title: 'Dependências acumuladas',
      reason: `${blocked.length} tarefas têm bloqueio ou dependência registrada.`,
      sources: ['tasks', 'task_dependencies'],
      evidence: [{ label: 'Tarefas com dependência', value: String(blocked.length) }],
      calculation: 'Contagem de tarefas bloqueadas ou com aresta em task_dependencies.',
      href: '/execucao',
    });
  }

  const dueSoon = input.tasks.filter(
    (task) =>
      task.status !== 'completed' &&
      task.status !== 'cancelled' &&
      task.dueDate !== null &&
      task.dueDate >= today &&
      dayCount(today, task.dueDate) <= 7,
  );
  if (dueSoon.length >= 3) {
    push({
      type: 'DEADLINE_CLUSTER',
      severity: 'attention',
      area: 'tasks',
      title: 'Múltiplos prazos próximos',
      reason: `${dueSoon.length} tarefas vencem nos próximos 7 dias.`,
      sources: ['tasks'],
      evidence: [{ label: 'Prazos em 7 dias', value: String(dueSoon.length) }],
      calculation: 'Contagem de tarefas abertas com prazo entre hoje e 7 dias.',
      href: '/tarefas',
    });
  }

  const capacity = input.facts.capacityWeeklyMinutes;
  const weeks = Math.max(1, input.periods.currentDays / 7);
  const weeklyLogged = input.facts.timeMinutes / weeks;
  if (capacity !== null && capacity > 0 && input.sufficiency.time?.status !== 'insufficient') {
    if (weeklyLogged > capacity * 1.15) {
      push({
        type: 'CAPACITY_OVERCOMMITTED',
        severity: 'risk',
        area: 'planning',
        title: 'Tempo registrado acima da capacidade',
        reason: `Média semanal registrada equivale a ${Math.round((weeklyLogged / capacity) * 100)}% da capacidade configurada.`,
        sources: ['capacity_profiles', 'time_entries'],
        evidence: [
          { label: 'Capacidade semanal', value: `${capacity} min` },
          { label: 'Média registrada', value: `${Math.round(weeklyLogged)} min/semana` },
        ],
        calculation:
          'total_de_minutos / (dias_do_período / 7) comparado à capacidade semanal ativa × 1,15.',
        confidence: input.sufficiency.time?.confidence ?? 0.5,
        href: '/capacidade',
      });
    }
  } else if (capacity !== null && capacity > 0 && input.facts.tasksOpen > 0) {
    push({
      type: 'CAPACITY_UNMEASURED',
      severity: 'info',
      area: 'planning',
      title: 'Capacidade sem evidência de execução',
      reason:
        'Há capacidade configurada e compromissos ativos, mas tempo insuficiente para comparar.',
      sources: ['capacity_profiles', 'time_entries', 'tasks'],
      evidence: [
        { label: 'Compromissos ativos', value: String(input.facts.tasksOpen) },
        { label: 'Dias observados', value: String(input.sufficiency.time?.observedDays ?? 0) },
      ],
      calculation:
        'Capacidade ativa presente, tarefas abertas presentes e sufficiency.time ≠ sufficient.',
      missing: input.sufficiency.time?.missing ?? ['registros de tempo'],
      confidence: 0.4,
      href: '/tempo',
    });
  }

  if (
    input.studyTrend.status === 'ok' &&
    input.studyTrend.direction === 'down' &&
    input.studyTrend.changePercent !== null &&
    input.studyTrend.changePercent <= -30 &&
    input.studyTrend.observedPoints >= 3
  ) {
    push({
      type: 'STUDY_TIME_DROP',
      severity: 'attention',
      area: 'studies',
      title: 'Queda sustentada no tempo de estudo',
      reason: `Tempo de estudo caiu ${Math.abs(Math.round(input.studyTrend.changePercent))}% entre janelas comparáveis.`,
      sources: ['study_sessions', 'metric_observations'],
      evidence: [
        { label: 'Variação', value: `${Math.round(input.studyTrend.changePercent)}%` },
        { label: 'Pontos observados', value: String(input.studyTrend.observedPoints) },
      ],
      calculation:
        'Tendência das Entregas 14/15: direção down, variação ≤ −30% e ≥ 3 pontos observados.',
      confidence: 0.8,
      limitations: ['Tendência não é previsão nem explica causa.'],
      href: '/estudos',
    });
  }

  if (
    input.financeLimitCents !== null &&
    input.financeLimitCents > 0 &&
    input.facts.financeExpenseCents > input.financeLimitCents
  ) {
    push({
      type: 'FINANCE_LIMIT_EXCEEDED',
      severity: 'risk',
      area: 'finance',
      title: 'Limite financeiro informado excedido',
      reason: 'Despesas observadas no período ultrapassam o limite definido pelo usuário.',
      sources: ['finance_transactions'],
      evidence: [
        { label: 'Limite (centavos)', value: String(input.financeLimitCents) },
        { label: 'Despesas (centavos)', value: String(input.facts.financeExpenseCents) },
      ],
      calculation: 'soma de amount_cents com kind=expense e transfer_pair_id nulo no período.',
      limitations: ['Nenhum limite é assumido quando o usuário não o informou.'],
      href: '/financas',
    });
  }

  const strategicAreas = new Set(input.goals.map((goal) => goal.area));
  const areaCounts: Record<string, number> = {
    finance: input.facts.financeExpenses,
    health: input.facts.healthObservations,
    training: input.facts.trainingObservations,
    reading: input.facts.readingObservations,
    time: input.facts.timeObservations,
  };
  for (const [area, count] of Object.entries(areaCounts)) {
    if (count > 0 || !strategicAreas.has(area)) continue;
    push({
      type: 'STRATEGIC_AREA_WITHOUT_DATA',
      severity: 'info',
      area,
      title: 'Área estratégica sem dados no período',
      reason: 'Existe objetivo estratégico na área, mas não há observações no período analisado.',
      sources: ['goals', 'life_import_batches'],
      evidence: [
        { label: 'Área', value: area },
        { label: 'Observações', value: '0' },
      ],
      calculation: 'Objetivo ativo na área e zero registros na tabela de domínio correspondente.',
      missing: [`observações de ${area}`],
      limitations: ['Ausência de registro não significa ausência de atividade.'],
      confidence: 0.5,
    });
  }

  const divergences = input.crossDomain.find(
    (analysis) => analysis.id === 'execution_time_vs_project_progress' && analysis.status === 'ok',
  );
  if (divergences !== undefined && input.projects.some((project) => project.status === 'active')) {
    const stalledWithTime = input.projects.filter(
      (project) =>
        project.status === 'active' &&
        (input.timeMinutesByProject[project.id] ?? 0) >= 240 &&
        !input.tasks.some((task) => task.projectId === project.id && task.completedAt !== null),
    );
    if (stalledWithTime.length > 0) {
      push({
        type: 'CROSS_DOMAIN_DIVERGENCE',
        severity: 'attention',
        area: 'planning',
        title: 'Capacidade aplicada sem resultado observável',
        reason:
          'Tempo registrado e progresso observado apontam em direções diferentes em projetos ativos.',
        sources: ['time_entries', 'projects', 'tasks'],
        evidence: [
          { label: 'Projetos divergententes', value: String(stalledWithTime.length) },
          { label: 'Análise', value: divergences.id },
        ],
        calculation:
          'Projetos ativos com ≥ 240 minutos registrados e nenhuma tarefa concluída, somente quando a análise entre domínios tem evidência suficiente.',
        confidence: divergences.confidence,
        limitations: ['Diferença observada não estabelece causa.'],
        href: '/integracao',
      });
    }
  }

  return alerts
    .sort((a, b) => {
      const severity = severityRank(b.severity) - severityRank(a.severity);
      if (severity !== 0) return severity;
      return a.id.localeCompare(b.id);
    })
    .slice(0, MAX_DECISION_ALERTS);
}

interface RecommendationTemplate {
  readonly title: string;
  readonly description: string;
  readonly expectedImpact: string;
  readonly urgency: 'now' | 'soon' | 'later';
  readonly effortMinutes: number | null;
  readonly nextAction: string;
  readonly limitations: readonly string[];
}

const RECOMMENDATION_TEMPLATES: Readonly<Record<string, RecommendationTemplate>> = {
  GOAL_STALE_NO_PROGRESS: {
    title: 'Reavaliar objetivo sem progresso',
    description: 'Revise critérios, próxima ação e continuidade do objetivo.',
    expectedImpact: 'Restaurar evidência de avanço ou encerrar objetivo sem evidência.',
    urgency: 'soon',
    effortMinutes: 20,
    nextAction: 'Abrir o objetivo e registrar progresso ou uma próxima ação.',
    limitations: ['A recomendação não altera prioridade nem status automaticamente.'],
  },
  PROJECT_EFFORT_WITHOUT_DELIVERY: {
    title: 'Revisar projeto com esforço sem entrega',
    description:
      'Compare o tempo registrado com entregas observadas antes de alocar mais capacidade.',
    expectedImpact: 'Reduzir esforço sem resultado observável.',
    urgency: 'soon',
    effortMinutes: 30,
    nextAction: 'Revisar marcos e tarefas do projeto.',
    limitations: ['Ausência de entrega registrada não prova ausência de trabalho.'],
  },
  TASK_OVERDUE_ACCUMULATION: {
    title: 'Reduzir acúmulo de prazos',
    description: 'Revise prazos vencidos e decida quais podem ser renegociados.',
    expectedImpact: 'Diminuir atraso acumulado e liberar capacidade.',
    urgency: 'now',
    effortMinutes: 25,
    nextAction: 'Listar tarefas vencidas e escolher as próximas ações.',
    limitations: ['Prazos ausentes não entram na lista.'],
  },
  TASK_BLOCKED_ACCUMULATION: {
    title: 'Resolver dependências acumuladas',
    description: 'Identifique dependências que impedem execução e registre a resolução.',
    expectedImpact: 'Desbloquear tarefas prontas para execução.',
    urgency: 'soon',
    effortMinutes: 20,
    nextAction: 'Revisar o painel de execução e as dependências.',
    limitations: ['Nenhuma dependência é removida automaticamente.'],
  },
  DEADLINE_CLUSTER: {
    title: 'Redistribuir prazos próximos',
    description: 'Compare os prazos próximos com a capacidade restante antes de comprometer tempo.',
    expectedImpact: 'Evitar sobrecarga concentrada.',
    urgency: 'soon',
    effortMinutes: 15,
    nextAction: 'Abrir a lista de tarefas com prazo nos próximos 7 dias.',
    limitations: ['Não altera datas automaticamente.'],
  },
  CAPACITY_OVERCOMMITTED: {
    title: 'Reavaliar compromissos frente à capacidade',
    description: 'O tempo registrado ultrapassa a capacidade configurada no período.',
    expectedImpact: 'Reduzir sobrecarga e alinhar compromissos ao tempo disponível.',
    urgency: 'now',
    effortMinutes: 30,
    nextAction: 'Revisar capacidade e prioridades do ciclo ativo.',
    limitations: ['Capacidade é configuração do usuário, não medição clínica ou contratual.'],
  },
  CAPACITY_UNMEASURED: {
    title: 'Registrar execução real',
    description: 'Sem tempo registrado não é possível comparar capacidade e execução.',
    expectedImpact: 'Permitir decisões baseadas em evidência de execução.',
    urgency: 'soon',
    effortMinutes: null,
    nextAction: 'Registrar tempo real das tarefas executadas.',
    limitations: ['Ausência de registro não significa ausência de trabalho.'],
  },
  STUDY_TIME_DROP: {
    title: 'Investigar queda de tempo de estudo',
    description: 'A queda é sustentada em janelas comparáveis, mas a causa é desconhecida.',
    expectedImpact: 'Entender se há mudança de prioridade, capacidade ou registro.',
    urgency: 'soon',
    effortMinutes: 20,
    nextAction: 'Comparar sessões das duas janelas.',
    limitations: ['Tendência não explica causa.'],
  },
  FINANCE_LIMIT_EXCEEDED: {
    title: 'Revisar despesas acima do limite informado',
    description: 'Há despesa observada acima do limite definido pelo próprio usuário.',
    expectedImpact: 'Ajustar decisões financeiras com evidência do período.',
    urgency: 'now',
    effortMinutes: null,
    nextAction: 'Abrir o resumo financeiro do período.',
    limitations: ['Nenhuma categoria é classificada automaticamente.'],
  },
  STRATEGIC_AREA_WITHOUT_DATA: {
    title: 'Coletar dados do área estratégica',
    description: 'A área possui objetivo, mas não há observação no período.',
    expectedImpact: 'Permitir avaliar a área sem inventar valores.',
    urgency: 'later',
    effortMinutes: null,
    nextAction: 'Registrar manualmente ou importar dados da área.',
    limitations: ['Área sem dados permanece não avaliável.'],
  },
  CROSS_DOMAIN_DIVERGENCE: {
    title: 'Reavaliar capacidade aplicada',
    description: 'Esforço e resultado observável divergem, sem conclusão causal.',
    expectedImpact: 'Decidir se o projeto merece mais capacidade ou revisão de escopo.',
    urgency: 'soon',
    effortMinutes: 30,
    nextAction: 'Comparar tempo registrado e entregas do projeto.',
    limitations: ['Divergência não estabelece causalidade.'],
  },
};

export function buildDecisionRecommendations(input: {
  alerts: readonly DecisionAlert[];
  period: DecisionDatePeriod;
}): DecisionRecommendation[] {
  return input.alerts
    .filter((alert) => alert.state !== 'dismissed')
    .map((alert) => {
      const template = RECOMMENDATION_TEMPLATES[alert.type];
      if (template === undefined) return null;
      const severity = DECISION_PRIORITY_WEIGHTS.severity[alert.severity];
      const confidence = alert.explanation.confidence;
      const effortPenalty =
        template.effortMinutes === null
          ? 0
          : Math.min(
              DECISION_PRIORITY_WEIGHTS.maxEffortPenalty,
              (template.effortMinutes / 60) * DECISION_PRIORITY_WEIGHTS.effortPenaltyPerHour,
            );
      const score = Math.max(
        0,
        Math.round(
          severity +
            confidence * DECISION_PRIORITY_WEIGHTS.confidence +
            DECISION_PRIORITY_WEIGHTS.urgency[template.urgency] -
            effortPenalty -
            (alert.state === 'acknowledged' ? 5 : 0),
        ),
      );
      const suggestedPriority = clamp(Math.ceil((100 - score) / 20), 1, 5);
      const limitations = [
        ...template.limitations,
        ...alert.explanation.limitations,
        'Prioridade sugerida não substitui prioridade declarada.',
      ];
      const recommendation: DecisionRecommendation = {
        id: stableHash(`recommendation|${alert.id}`),
        alertId: alert.id,
        title: template.title,
        description: template.description,
        reason: alert.reason,
        expectedImpact: template.expectedImpact,
        urgency: template.urgency,
        effortMinutes: template.effortMinutes,
        sources: [...alert.sources],
        confidence: round3(confidence),
        score,
        declaredPriority: alert.declaredPriority,
        suggestedPriority,
        limitations: [...new Set(limitations)],
        nextAction: template.nextAction,
        explanation: makeExplanation({
          identified: alert.reason,
          dataUsed: alert.sources,
          calculation: DECISION_PRIORITY_FORMULA,
          missing: alert.explanation.missing,
          period: input.period,
          confidence,
          cannotConclude: 'Recomendação não é ordem e não executa mudanças.',
          limitations,
          sources: alert.sources,
        }),
        algorithmVersion: DECISION_ALGORITHMS.recommendation,
      };
      return recommendation;
    })
    .filter((item): item is DecisionRecommendation => item !== null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_DECISION_RECOMMENDATIONS);
}

export function buildNextBestAction(input: {
  period: DecisionDatePeriod;
  next: NextAction | null;
  blockedTaskIds: readonly string[];
  goalIdByTask: Readonly<Record<string, string | null>>;
  estimateByTask: Readonly<Record<string, number | null>>;
  sufficiency: Readonly<Record<string, DecisionSufficiency>>;
  alerts: readonly DecisionAlert[];
  recommendations: readonly DecisionRecommendation[];
  activeCycleId: string | null;
}): DecisionNextAction {
  if (input.next !== null) {
    const blocking = input.alerts.filter(
      (alert) => alert.severity === 'risk' || alert.severity === 'critical',
    );
    const blockers = [
      ...(input.blockedTaskIds.includes(input.next.taskId) ? ['dependências não resolvidas'] : []),
      ...(blocking.length > 0 ? [`${blocking.length} alerta(s) de risco`] : []),
    ];
    const sources = [
      'tasks',
      'projects',
      ...(input.activeCycleId === null ? [] : ['planning_cycles']),
      ...new Set(input.recommendations.flatMap((item) => item.sources)),
    ];
    return {
      id: `task:${input.next.taskId}`,
      kind: 'task',
      title: input.next.taskTitle,
      why: input.next.explanation,
      goalId: input.goalIdByTask[input.next.taskId] ?? null,
      projectId: input.next.projectId,
      expectedImpact: `Avançar ${input.next.taskTitle} é a ação executável de maior prioridade segundo as regras vigentes.`,
      effortMinutes: input.estimateByTask[input.next.taskId] ?? null,
      blockers,
      sources: [...new Set(sources)],
      confidence: 0.8,
      explanation: makeExplanation({
        identified: 'Próxima ação executável selecionada',
        dataUsed: sources,
        calculation:
          'Reutiliza chooseNextAction da camada de execução; tarefas bloqueadas são excluídas antes do ranking.',
        missing: input.estimateByTask[input.next.taskId] === null ? ['estimativa de esforço'] : [],
        period: input.period,
        confidence: 0.8,
        cannotConclude: 'A escolha final pertence ao usuário.',
        limitations: [
          ...(input.estimateByTask[input.next.taskId] === null
            ? ['Esforço não estimado: nenhum valor foi inventado.']
            : []),
          ...blockers,
        ],
        sources,
      }),
      algorithmVersion: DECISION_ALGORITHMS.nextAction,
    };
  }

  const insufficient = Object.values(input.sufficiency).filter(
    (item) => item.status === 'insufficient' || item.status === 'partial',
  );
  const missing = [...new Set(insufficient.flatMap((item) => item.missing))];
  const sources = [...new Set(insufficient.flatMap((item) => item.sources))];
  return {
    id: 'data:collect-evidence',
    kind: 'data_collection',
    title: 'Registrar dados antes de decidir',
    why:
      insufficient.length > 0
        ? 'Não há evidência suficiente para escolher uma ação executável confiável.'
        : 'Não há tarefa executável disponível no período.',
    goalId: null,
    projectId: null,
    expectedImpact: 'Aumentar cobertura para permitir decisões baseadas em evidência.',
    effortMinutes: null,
    blockers: [],
    sources: sources.length > 0 ? sources : ['tasks', 'goals'],
    confidence: 0.3,
    explanation: makeExplanation({
      identified: 'Ação de coleta de dados',
      dataUsed: sources,
      calculation:
        'Sem ação executável ou com cobertura insuficiente, a sugestão é coletar evidência.',
      missing: missing.length > 0 ? missing : ['tarefas executáveis'],
      period: input.period,
      confidence: 0.3,
      cannotConclude: 'Nenhuma prioridade, cancelamento ou execução é automática.',
      limitations: ['Nenhum esforço foi estimado porque não há dado do usuário.'],
      sources: sources.length > 0 ? sources : ['tasks', 'goals'],
    }),
    algorithmVersion: DECISION_ALGORITHMS.nextAction,
  };
}

function sumSeries(series: readonly DecisionSeriesPoint[]): number | null {
  const values = series.filter((point) => point.value !== null).map((point) => point.value ?? 0);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function observedDays(series: readonly DecisionSeriesPoint[]): number {
  return new Set(series.filter((point) => point.value !== null).map((point) => point.date)).size;
}

export function comparePeriodMetric(input: {
  metric: string;
  current: readonly DecisionSeriesPoint[];
  previous: readonly DecisionSeriesPoint[];
  coverage: number | null;
}): DecisionComparison {
  const currentValue = sumSeries(input.current);
  const previousValue = sumSeries(input.previous);
  const currentDays = observedDays(input.current);
  const previousDays = observedDays(input.previous);
  const enough = currentDays >= MIN_OBSERVED_DAYS && previousDays >= MIN_OBSERVED_DAYS;
  const delta =
    enough && currentValue !== null && previousValue !== null ? currentValue - previousValue : null;
  const changePercent =
    delta !== null && previousValue !== null && previousValue !== 0
      ? (delta / previousValue) * 100
      : null;
  const limitations: string[] = [];
  if (!enough) limitations.push('Cada janela precisa de pelo menos 3 dias observados.');
  if (delta !== null && changePercent === null)
    limitations.push('Base anterior zero: variação percentual não exibida.');
  return {
    metric: input.metric,
    current: currentValue === null ? null : round3(currentValue),
    previous: previousValue === null ? null : round3(previousValue),
    delta: delta === null ? null : round3(delta),
    changePercent: changePercent === null ? null : round3(changePercent),
    status: enough ? 'ok' : 'insufficient_data',
    coverage: input.coverage,
    limitations,
  };
}

export function buildPerformanceReview(input: {
  kind: 'weekly' | 'monthly' | 'quarterly';
  periods: DecisionPeriods;
  facts: DecisionFacts;
  sufficiency: Readonly<Record<string, DecisionSufficiency>>;
  crossDomain: readonly CrossDomainAnalysis[];
  alerts: readonly DecisionAlert[];
  recommendations: readonly DecisionRecommendation[];
  comparisons: readonly DecisionComparison[];
  series: Readonly<Record<string, readonly DecisionSeriesPoint[]>>;
  previousSeries: Readonly<Record<string, readonly DecisionSeriesPoint[]>>;
  persistedSnapshot: boolean;
}): DecisionReview {
  const current = input.periods.current;
  const previous = input.periods.previous;
  const items = (
    entries: readonly {
      label: string;
      value: string;
      kind: DecisionReviewItem['kind'];
      sources: readonly string[];
    }[],
  ) => entries.map((entry) => ({ ...entry, sources: [...entry.sources] }));
  const alertItems = items(
    input.alerts.slice(0, 5).map((alert) => ({
      label: alert.title,
      value: `${alert.severity} · ${alert.state}`,
      kind: 'calculated' as const,
      sources: alert.sources,
    })),
  );
  const recommendationItems = items(
    input.recommendations.slice(0, 5).map((recommendation) => ({
      label: recommendation.title,
      value: `score ${recommendation.score} · prioridade sugerida ${recommendation.suggestedPriority}`,
      kind: 'calculated' as const,
      sources: recommendation.sources,
    })),
  );
  const sufficiencyItems = items(
    Object.entries(input.sufficiency).map(([key, value]) => ({
      label: key,
      value: `${value.status} · cobertura ${value.coverage === null ? 'desconhecida' : value.coverage}`,
      kind: value.status === 'sufficient' ? ('observed' as const) : ('insufficient' as const),
      sources: value.missing.length > 0 ? value.missing : ['observações do período'],
    })),
  );
  const crossDomainItems = items(
    input.crossDomain.map((analysis) => ({
      label: analysis.label,
      value:
        analysis.status === 'ok'
          ? `relação ${analysis.relation}${analysis.correlation === null ? '' : ` · r=${analysis.correlation}`}`
          : 'insufficient_data',
      kind: analysis.status === 'ok' ? ('calculated' as const) : ('insufficient' as const),
      sources: analysis.sources,
    })),
  );

  let sections: { title: string; items: readonly DecisionReviewItem[] }[];
  if (input.kind === 'weekly') {
    sections = [
      {
        title: 'Avanços e execução',
        items: items([
          {
            label: 'Tarefas concluídas',
            value: String(input.facts.tasksCompleted),
            kind: 'observed',
            sources: ['tasks'],
          },
          {
            label: 'Projetos movimentados',
            value: String(input.facts.projectsActive),
            kind: 'observed',
            sources: ['projects'],
          },
          {
            label: 'Minutos de estudo',
            value: String(input.facts.studyMinutes),
            kind: 'observed',
            sources: ['study_sessions'],
          },
        ]),
      },
      { title: 'Alertas e recomendações', items: [...alertItems, ...recommendationItems] },
      { title: 'Cobertura', items: sufficiencyItems },
    ];
  } else if (input.kind === 'monthly') {
    sections = [
      { title: 'Evolução por área', items: crossDomainItems },
      {
        title: 'Execução versus planejamento',
        items: items([
          {
            label: 'Objetivos do ciclo',
            value: String(input.facts.cycleObjectives),
            kind: 'observed',
            sources: ['planning_cycle_objectives'],
          },
          {
            label: 'Objetivos concluídos',
            value: String(input.facts.goalsCompleted),
            kind: 'observed',
            sources: ['goals'],
          },
          {
            label: 'Capacidade configurada',
            value:
              input.facts.capacityWeeklyMinutes === null
                ? 'não informada'
                : `${input.facts.capacityWeeklyMinutes} min/semana`,
            kind: input.facts.capacityWeeklyMinutes === null ? 'insufficient' : 'observed',
            sources: ['capacity_profiles'],
          },
        ]),
      },
      { title: 'Comparações', items: [] },
      { title: 'Alertas e recomendações', items: [...alertItems, ...recommendationItems] },
    ];
  } else {
    sections = [
      {
        title: 'Planejado versus realizado',
        items: items([
          {
            label: 'Ciclo',
            value: input.facts.activeCycleName ?? 'sem ciclo ativo',
            kind: input.facts.activeCycleName === null ? 'insufficient' : 'observed',
            sources: ['planning_cycles'],
          },
          {
            label: 'Objetivos planejados',
            value: String(input.facts.cycleObjectives),
            kind: 'observed',
            sources: ['planning_cycle_objectives'],
          },
          {
            label: 'Objetivos concluídos',
            value: String(input.facts.goalsCompleted),
            kind: 'observed',
            sources: ['goals'],
          },
          {
            label: 'Projetos concluídos',
            value: String(input.facts.projectsCompleted),
            kind: 'observed',
            sources: ['projects'],
          },
          {
            label: 'Capacidade utilizada',
            value: `${input.facts.timeMinutes} min registrados`,
            kind: input.sufficiency.time?.status === 'sufficient' ? 'observed' : 'insufficient',
            sources: ['time_entries'],
          },
        ]),
      },
      { title: 'Riscos observados', items: alertItems },
      { title: 'Decisões para o próximo ciclo', items: recommendationItems },
      { title: 'Hipóteses e limitações', items: sufficiencyItems },
    ];
  }

  const limitations = [
    ...new Set([
      ...Object.values(input.sufficiency).flatMap((item) => item.limitations),
      ...input.comparisons.flatMap((item) => item.limitations),
      'Snapshot encerrado existente não é recalculado; esta é uma consolidação sob demanda.',
      ...(input.persistedSnapshot
        ? []
        : ['Nenhum snapshot persistido foi encontrado para este período.']),
    ]),
  ];
  const confidence =
    Object.values(input.sufficiency).length > 0
      ? round3(
          Object.values(input.sufficiency).reduce((sum, item) => sum + item.confidence, 0) /
            Object.values(input.sufficiency).length,
        )
      : 0;

  return {
    kind: input.kind,
    period: current,
    previous,
    sections,
    comparisons: input.comparisons,
    persistedSnapshot: input.persistedSnapshot,
    limitations,
    explanation: makeExplanation({
      identified: `Revisão ${input.kind} consolidada`,
      dataUsed: [...new Set(Object.values(input.sufficiency).flatMap((item) => item.sources))],
      calculation:
        'Consolidação determinística de séries, fatos, análises entre domínios, alertas e recomendações existentes.',
      missing: [...new Set(Object.values(input.sufficiency).flatMap((item) => item.missing))],
      period: current,
      confidence,
      cannotConclude: 'Revisões não aprovam decisões nem apagam snapshots anteriores.',
      limitations,
      sources: [...new Set(Object.values(input.sufficiency).flatMap((item) => item.sources))],
    }),
    algorithmVersion: DECISION_ALGORITHMS.review,
  };
}
