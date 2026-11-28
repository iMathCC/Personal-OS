import { businessRule, validationError } from './errors';
import { isLocalDate, shiftLocalDate } from './studies';
import { stableHash } from './life';
import {
  analyzeConsistency,
  analyzeTrend,
  buildProjection,
  previousPeriod,
  type ConsistencyAnalysis,
  type DatePeriod,
  type IntelligenceArea,
} from './intelligence';
import {
  analyzeCrossDomain,
  assessDataSufficiency,
  comparePeriodMetric,
  decisionPeriods,
  MIN_OBSERVED_DAYS,
  type CrossDomainAnalysis,
  type CrossDomainCandidate,
  type DecisionComparisonMode,
  type DecisionDatePeriod,
  type DecisionPeriods,
  type DecisionReview,
} from './decision';

/**
 * Camada longitudinal de desempenho. Não consulta infraestrutura, relógio ou
 * fuso do servidor: recebe séries e fatos observados e devolve conclusões
 * versionadas. Nenhuma função aqui cria um segundo motor de tendência,
 * projeção, consistência, suficiência, comparação ou explicação — todas
 * delegam aos motores já existentes e testados.
 */

export const PERFORMANCE_ALGORITHMS = Object.freeze({
  period: 'performance-period-v1',
  evolution: 'performance-evolution-v1',
  pattern: 'performance-pattern-v1',
  association: 'performance-association-v1',
  projection: 'performance-projection-v1',
  execution: 'performance-execution-v1',
  goals: 'performance-goals-v1',
  snapshot: 'performance-snapshot-v1',
});

/** Amostra mínima para chamar uma variação recorrente de padrão. */
export const PERFORMANCE_PATTERN_MIN_POINTS = 6;
/** Máximo de pontos enviados por série ao cliente (limite explícito, não paginação). */
export const PERFORMANCE_MAX_SERIES_POINTS = 200;

export const PERFORMANCE_DOMAINS = Object.freeze([
  { id: 'finance', label: 'Finanças', unit: 'centavos', source: 'finance_transactions' },
  { id: 'studies', label: 'Estudos', unit: 'minutos', source: 'study_sessions' },
  { id: 'health', label: 'Saúde e bem-estar', unit: 'observações', source: 'health_observations' },
  { id: 'training', label: 'Treinamento', unit: 'sessões', source: 'training_sessions' },
  { id: 'reading', label: 'Leitura e conhecimento', unit: 'minutos', source: 'reading_sessions' },
  { id: 'time', label: 'Tempo', unit: 'minutos registrados', source: 'time_entries' },
  { id: 'projects', label: 'Projetos e execução', unit: 'tarefas concluídas', source: 'tasks' },
  { id: 'goals', label: 'Objetivos', unit: 'objetivos concluídos', source: 'goals' },
  {
    id: 'strategy',
    label: 'Estratégia pessoal',
    unit: 'objetivos do ciclo',
    source: 'planning_cycle_objectives',
  },
] as const);

export type PerformanceDomainId = (typeof PERFORMANCE_DOMAINS)[number]['id'];

const DOMAIN_TO_AREA: Record<PerformanceDomainId, IntelligenceArea> = {
  finance: 'execution',
  studies: 'studies',
  health: 'execution',
  training: 'execution',
  reading: 'studies',
  time: 'execution',
  projects: 'tasks',
  goals: 'goals',
  strategy: 'goals',
};

export interface PerformanceSeriesPoint {
  readonly date: string;
  /** `null` é informação ausente; nunca é convertido em zero. */
  readonly value: number | null;
  readonly sampleCount?: number;
}

export type PerformanceCompleteness = 'complete' | 'incomplete' | 'unknown';

export interface PerformancePeriods extends DecisionPeriods {
  readonly currentCompleteness: PerformanceCompleteness;
  readonly previousCompleteness: PerformanceCompleteness;
  readonly comparable: boolean;
  readonly limitations: readonly string[];
}

function assertLocalPeriod(period: DatePeriod, field: string): void {
  if (!isLocalDate(period.from) || !isLocalDate(period.to)) {
    throw validationError(`${field} inválido.`);
  }
  if (period.from > period.to) throw validationError(`${field} invertido.`);
}

function completeness(
  period: DatePeriod,
  expectedEnd: string | undefined,
): PerformanceCompleteness {
  if (expectedEnd === undefined) return 'unknown';
  if (!isLocalDate(expectedEnd)) throw validationError('Fim esperado do período inválido.');
  if (period.to > expectedEnd) throw businessRule('Período observado ultrapassa o fim esperado.');
  return period.to === expectedEnd ? 'complete' : 'incomplete';
}

/** Fim natural da janela cheia, calculado apenas com datas locais. */
export function expectedPeriodEnd(today: string, comparison: 'week' | 'month' | 'quarter'): string {
  if (!isLocalDate(today)) throw validationError('Data local inválida.');
  const [year, month, day] = today.split('-').map(Number);
  if (comparison === 'week') {
    const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
    const mondayOffset = weekday === 0 ? 6 : weekday - 1;
    return shiftLocalDate(today, 6 - mondayOffset);
  }
  const lastMonth =
    comparison === 'month' ? (month ?? 1) : Math.floor(((month ?? 1) - 1) / 3) * 3 + 3;
  const lastDay = new Date(Date.UTC(year ?? 0, lastMonth, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Fim natural da janela anterior equivalente. */
export function expectedPreviousPeriodEnd(
  today: string,
  comparison: 'week' | 'month' | 'quarter',
): string {
  const currentEnd = expectedPeriodEnd(today, comparison);
  if (comparison === 'week') return shiftLocalDate(currentEnd, -7);
  const [year, month] = currentEnd.split('-').map(Number);
  const endYear = year ?? 0;
  const endMonth = month ?? 1;
  const previousEndMonth =
    comparison === 'quarter'
      ? endMonth === 3
        ? 12
        : endMonth - 3
      : endMonth === 1
        ? 12
        : endMonth - 1;
  const previousEndYear =
    comparison === 'quarter' && endMonth === 3
      ? endYear - 1
      : endMonth === 1
        ? endYear - 1
        : endYear;
  const lastDay = new Date(Date.UTC(previousEndYear, previousEndMonth, 0)).getUTCDate();
  return `${String(previousEndYear).padStart(4, '0')}-${String(previousEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function observedValues(points: readonly PerformanceSeriesPoint[]): readonly number[] {
  return points
    .filter((point) => point.value !== null && Number.isFinite(point.value))
    .map((point) => point.value as number);
}

/**
 * Períodos locais derivados de `decisionPeriods`. O chamador informa o fim
 * natural (quando conhecido) para que uma janela parcial nunca seja comparada
 * como se fosse completa.
 */
export function buildPerformancePeriods(input: {
  readonly today: string;
  readonly comparison: DecisionComparisonMode;
  readonly explicit?: DecisionDatePeriod;
  readonly currentExpectedEnd?: string;
  readonly previousExpectedEnd?: string;
}): PerformancePeriods {
  const periods = decisionPeriods(input.today, input.comparison, input.explicit);
  const currentCompleteness = completeness(periods.current, input.currentExpectedEnd);
  const previousCompleteness = completeness(periods.previous, input.previousExpectedEnd);
  const limitations: string[] = [];
  if (currentCompleteness === 'incomplete') {
    limitations.push('Período corrente incompleto; totais ainda podem aumentar.');
  }
  if (previousCompleteness === 'incomplete') {
    limitations.push('Período anterior incompleto; a comparação não é definitiva.');
  }
  if (!periods.equivalent) {
    limitations.push('Janelas com quantidades diferentes de dias; compare com cautela.');
  }
  if (currentCompleteness === 'unknown' || previousCompleteness === 'unknown') {
    limitations.push('Não foi informado o fim natural de ao menos uma janela.');
  }
  return {
    ...periods,
    currentCompleteness,
    previousCompleteness,
    comparable:
      periods.equivalent &&
      (currentCompleteness === previousCompleteness ||
        currentCompleteness === 'unknown' ||
        previousCompleteness === 'unknown'),
    limitations,
    algorithmVersion: PERFORMANCE_ALGORITHMS.period,
  };
}

export interface PerformanceIndicatorsInput {
  readonly id: string;
  readonly label: string;
  readonly domain: PerformanceDomainId;
  readonly unit: string;
  readonly source: string;
  readonly period: DatePeriod;
  readonly current: readonly PerformanceSeriesPoint[];
  readonly previous: readonly PerformanceSeriesPoint[];
  readonly history: readonly PerformanceSeriesPoint[];
  readonly expectedDays: number;
  readonly observedDays: number;
  readonly requiredObservations: number;
  readonly missing?: readonly string[];
  readonly limitations?: readonly string[];
  readonly stableEpsilon?: number;
  readonly periodComplete?: boolean;
}

export interface PerformanceIndicator {
  readonly id: string;
  readonly label: string;
  readonly domain: PerformanceDomainId;
  readonly unit: string;
  readonly source: string;
  /** `observed` = valor lido; `calculated` = comparação derivada; `unavailable` = sem base. */
  readonly status: 'observed' | 'calculated' | 'unavailable';
  readonly currentValue: number | null;
  readonly previousValue: number | null;
  readonly delta: number | null;
  readonly changePercent: number | null;
  readonly direction: 'up' | 'down' | 'stable' | 'unknown';
  readonly observedPoints: number;
  /** Pontos ordenados por data; `null` permanece lacuna no gráfico. */
  readonly points: readonly PerformanceSeriesPoint[];
  readonly coverage: number | null;
  readonly confidence: number | null;
  readonly period: DatePeriod;
  readonly previousPeriod: DatePeriod;
  /** Composição explícita de origem, período, método e limitações. */
  readonly evidence: {
    readonly source: string;
    readonly period: DatePeriod;
    readonly method: string;
    readonly limitations: readonly string[];
  };
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

function assertSeries(points: readonly PerformanceSeriesPoint[], field: string): void {
  if (points.length > PERFORMANCE_MAX_SERIES_POINTS) {
    throw businessRule(`${field} excede o limite de ${PERFORMANCE_MAX_SERIES_POINTS} pontos.`);
  }
  for (const point of points) {
    if (!isLocalDate(point.date)) throw validationError(`${field} com data local inválida.`);
    if (!(
      point.sampleCount === undefined ||
      (Number.isInteger(point.sampleCount) && point.sampleCount >= 0)
    )) {
      throw validationError(`${field} com contagem de amostra inválida.`);
    }
    if (point.value !== null && !Number.isFinite(point.value)) {
      throw validationError(`${field} com valor não finito.`);
    }
  }
}

/**
 * Evolução de um indicador com origem real. Somas de janelas, tendência e
 * cobertura vêm dos motores existentes; nenhum valor ausente é preenchido.
 */
export function buildDomainEvolution(input: PerformanceIndicatorsInput): PerformanceIndicator {
  assertLocalPeriod(input.period, 'Período do indicador');
  assertLocalPeriod(previousPeriod(input.period), 'Período anterior');
  assertSeries(input.current, 'Série corrente');
  assertSeries(input.previous, 'Série anterior');
  assertSeries(input.history, 'Histórico');
  if (!Number.isInteger(input.expectedDays) || input.expectedDays < 0) {
    throw validationError('Dias esperados inválidos.');
  }
  if (
    !Number.isInteger(input.observedDays) ||
    input.observedDays < 0 ||
    input.observedDays > input.expectedDays
  ) {
    throw validationError('Dias observados inválidos.');
  }
  if (!Number.isInteger(input.requiredObservations) || input.requiredObservations <= 0) {
    throw validationError('Observações mínimas inválidas.');
  }

  const currentPoints = observedValues(input.current);
  const sufficiency = assessDataSufficiency({
    observations: currentPoints.length,
    observedDays: input.observedDays,
    expectedDays: input.expectedDays,
    requiredObservations: input.requiredObservations,
    missing: input.missing ?? [],
    sources: [input.source],
  });
  const comparison = comparePeriodMetric({
    metric: input.id,
    current: input.current,
    previous: input.previous,
    coverage: sufficiency.coverage,
  });
  const trend = analyzeTrend({
    id: input.id,
    label: input.label,
    area: DOMAIN_TO_AREA[input.domain],
    window: input.period,
    stableEpsilon: input.stableEpsilon,
    points: [...input.history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((point) => ({
        date: point.date,
        value: point.value,
        sampleCount: point.sampleCount ?? (point.value === null ? 0 : 1),
      })),
  });
  const limitations = [
    ...new Set([
      ...(input.limitations ?? []),
      ...sufficiency.limitations,
      ...comparison.limitations,
      ...(trend.status === 'insufficient_data' ? [trend.reason ?? 'Tendência insuficiente.'] : []),
      ...(input.periodComplete === false
        ? ['Período corrente incompleto; totais ainda podem aumentar.']
        : []),
      'Séries ausentes não foram preenchidas com zero.',
    ]),
  ];
  const status =
    sufficiency.status === 'insufficient'
      ? 'unavailable'
      : comparison.status === 'ok' && trend.status === 'ok' && sufficiency.status === 'sufficient'
        ? 'calculated'
        : 'observed';
  return {
    id: input.id,
    label: input.label,
    domain: input.domain,
    unit: input.unit,
    source: input.source,
    status,
    currentValue: comparison.current,
    previousValue: comparison.previous,
    delta: comparison.delta,
    changePercent: comparison.changePercent,
    direction: trend.direction,
    observedPoints: trend.observedPoints,
    points: [...input.history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-PERFORMANCE_MAX_SERIES_POINTS)
      .map((point) => ({ date: point.date, value: point.value })),
    coverage: sufficiency.coverage,
    confidence: sufficiency.confidence,
    period: { ...input.period },
    previousPeriod: { ...previousPeriod(input.period) },
    evidence: {
      source: input.source,
      period: { ...input.period },
      method:
        'soma das observações reais da janela; tendência e cobertura reutilizam os motores versionados',
      limitations,
    },
    limitations,
    algorithmVersion: PERFORMANCE_ALGORITHMS.evolution,
  };
}

export interface PerformancePatternInput {
  readonly id: string;
  readonly label: string;
  readonly domain: PerformanceDomainId;
  readonly source: string;
  readonly window: DatePeriod;
  readonly points: readonly PerformanceSeriesPoint[];
  readonly minimumObservations?: number;
  readonly descriptive?: string;
}

export interface PerformancePattern {
  readonly id: string;
  readonly label: string;
  readonly domain: PerformanceDomainId;
  readonly source: string;
  readonly window: DatePeriod;
  readonly status: 'identified' | 'hypothesis' | 'inconclusive';
  readonly classification: 'pattern' | 'hypothesis' | 'inconclusive';
  readonly shape: 'decline' | 'improvement' | 'oscillation' | 'stable' | 'unknown';
  readonly observations: number;
  readonly recurrentSteps: number;
  readonly confidence: number | null;
  readonly evidence: string;
  readonly causality: 'not_claimed';
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

/**
 * Um padrão exige amostra mínima e repetição de sinais. Variação isolada vira
 * hipótese ou inconclusiva; correlação nunca é tratada como causa.
 */
export function detectRecurringPatterns(input: PerformancePatternInput): PerformancePattern {
  assertLocalPeriod(input.window, 'Janela do padrão');
  assertSeries(input.points, 'Série do padrão');
  const minimum = input.minimumObservations ?? PERFORMANCE_PATTERN_MIN_POINTS;
  if (!Number.isInteger(minimum) || minimum < MIN_OBSERVED_DAYS) {
    throw validationError('Amostra mínima de padrão inválida.');
  }
  const values = [...observedValues(input.points)];
  const trend = analyzeTrend({
    id: input.id,
    label: input.label,
    area: DOMAIN_TO_AREA[input.domain],
    window: input.window,
    points: input.points.map((point) => ({
      date: point.date,
      value: point.value,
      sampleCount: point.sampleCount ?? (point.value === null ? 0 : 1),
    })),
  });
  let downSteps = 0;
  let upSteps = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = (values[index] ?? 0) - (values[index - 1] ?? 0);
    if (delta < 0) downSteps += 1;
    if (delta > 0) upSteps += 1;
  }
  const steps = values.length - 1;
  const threshold = Math.ceil(steps / 2);
  const shape: PerformancePattern['shape'] =
    values.length < 2
      ? 'unknown'
      : downSteps > 0 && upSteps > 0 && downSteps < threshold && upSteps < threshold
        ? 'oscillation'
        : downSteps >= threshold
          ? 'decline'
          : upSteps >= threshold
            ? 'improvement'
            : 'stable';
  const recurrentSteps = shape === 'decline' ? downSteps : shape === 'improvement' ? upSteps : 0;
  const enough = values.length >= minimum;
  const repeated = recurrentSteps >= threshold && shape !== 'unknown' && shape !== 'stable';
  const status: PerformancePattern['status'] =
    enough && repeated
      ? 'identified'
      : values.length >= MIN_OBSERVED_DAYS
        ? 'hypothesis'
        : 'inconclusive';
  const limitations = [
    ...new Set([
      `Amostra: ${values.length} observação(ões) em ${input.window.from}..${input.window.to}; mínimo para padrão: ${minimum}.`,
      `Origem: ${input.source}.`,
      ...(enough ? [] : [`Amostra insuficiente para afirmar padrão (mínimo ${minimum}).`]),
      ...(trend.status === 'insufficient_data' ? [trend.reason ?? 'Tendência insuficiente.'] : []),
      'Associação observada não estabelece causalidade.',
      'Nenhuma causa psicológica, médica ou externa foi inferida.',
    ]),
  ];
  return {
    id: input.id,
    label: input.label,
    domain: input.domain,
    source: input.source,
    window: { ...input.window },
    status,
    classification:
      status === 'identified' ? 'pattern' : status === 'hypothesis' ? 'hypothesis' : 'inconclusive',
    shape,
    observations: values.length,
    recurrentSteps,
    confidence: enough ? round3(clamp(values.length / Math.max(1, minimum), 0, 1)) : null,
    evidence:
      input.descriptive ??
      `${values.length} observações; ${recurrentSteps} passos na direção ${shape}; origem ${input.source}.`,
    causality: 'not_claimed',
    limitations,
    algorithmVersion: PERFORMANCE_ALGORITHMS.pattern,
  };
}

export interface PerformanceAssociation {
  readonly id: string;
  readonly label: string;
  readonly status: 'ok' | 'insufficient_data' | 'incompatible';
  readonly relation: 'positive' | 'negative' | 'none' | 'not_estimated';
  readonly correlation: number | null;
  readonly observations: number;
  readonly pairedPoints: number;
  readonly coverage: number | null;
  readonly confidence: number;
  readonly causality: 'not_claimed';
  readonly descriptive: string;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

/** Converte análises já calculadas pelo motor de decisão, sem recalculá-las. */
export function toPerformanceAssociations(
  analyses: readonly CrossDomainAnalysis[],
): PerformanceAssociation[] {
  return analyses.map((item) => ({
    id: item.id,
    label: item.label,
    status: item.status,
    relation: item.relation,
    correlation: item.correlation,
    observations: item.observations,
    pairedPoints: item.pairedPoints,
    coverage: item.coverage,
    confidence: item.confidence,
    causality: 'not_claimed',
    descriptive: item.descriptive,
    limitations: [...item.explanation.limitations],
    algorithmVersion: PERFORMANCE_ALGORITHMS.association,
  }));
}

/** Associações entre domínios reutilizam `analyzeCrossDomain`, sem causalidade. */
export function buildPerformanceAssociations(input: {
  readonly period: DatePeriod;
  readonly candidates: readonly CrossDomainCandidate[];
}): PerformanceAssociation[] {
  assertLocalPeriod(input.period, 'Período das associações');
  return analyzeCrossDomain({ period: input.period, candidates: input.candidates }).map((item) => ({
    id: item.id,
    label: item.label,
    status: item.status,
    relation: item.relation,
    correlation: item.correlation,
    observations: item.observations,
    pairedPoints: item.pairedPoints,
    coverage: item.coverage,
    confidence: item.confidence,
    causality: 'not_claimed',
    descriptive: item.descriptive,
    limitations: [...item.explanation.limitations],
    algorithmVersion: PERFORMANCE_ALGORITHMS.association,
  }));
}

export interface PerformanceProjectionInput {
  readonly id: string;
  readonly label: string;
  readonly domain: PerformanceDomainId;
  readonly source: string;
  readonly unit: string;
  readonly nowMs: number;
  readonly horizonDays: number;
  readonly points: readonly { readonly date: string; readonly value: number }[];
  readonly assumptions: readonly string[];
}

export interface PerformanceProjection {
  readonly id: string;
  readonly label: string;
  readonly area: IntelligenceArea;
  readonly domain: PerformanceDomainId;
  readonly source: string;
  readonly unit: string;
  readonly status: 'available' | 'insufficient_data';
  readonly reason: string | null;
  readonly method: string;
  readonly window: DatePeriod | null;
  readonly horizonDays: number;
  readonly projectedValue: number | null;
  readonly dataPoints: number;
  readonly classification: 'simulation';
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  readonly confidence: number | null;
  readonly algorithmVersion: string;
}

/** Projeção matemática transparente; nunca grava nem altera dados reais. */
export function buildPerformanceProjection(
  input: PerformanceProjectionInput,
): PerformanceProjection {
  const projection = buildProjection({
    id: input.id,
    label: input.label,
    area: DOMAIN_TO_AREA[input.domain],
    unit: input.unit,
    nowMs: input.nowMs,
    horizonDays: input.horizonDays,
    points: input.points,
  });
  return {
    ...projection,
    domain: input.domain,
    source: input.source,
    classification: 'simulation' as const,
    assumptions: [...input.assumptions],
    limitations: [
      ...projection.limitations,
      'Projeção é simulação determinística, não previsão nem compromisso.',
      'Nenhum dado real foi alterado ao simular.',
    ],
    algorithmVersion: PERFORMANCE_ALGORITHMS.projection,
  };
}

export interface PerformanceExecutionInput {
  readonly period: DatePeriod;
  readonly plannedTasks: number;
  readonly completedTasks: number;
  readonly overdueTasks: number;
  readonly blockedTasks: number;
  /** Estimativas declaradas; `null` permanece ausente e nunca vira zero. */
  readonly estimateMinutes: readonly (number | null)[];
  /** Tempo efetivamente registrado; `null` quando não foi medido. */
  readonly measuredMinutes: number | null;
  /** Capacidade declarada pelo usuário, não tempo observado. */
  readonly declaredCapacityMinutes: number | null;
  readonly observedDays: number;
  readonly activeDays: number;
  readonly totalDays: number;
  readonly source: string;
  readonly limitations?: readonly string[];
}

export interface PerformanceExecution {
  readonly period: DatePeriod;
  readonly completionRate: number | null;
  readonly plannedTasks: number;
  readonly completedTasks: number;
  readonly overdueTasks: number;
  readonly blockedTasks: number;
  readonly estimatedMinutes: number | null;
  readonly unestimatedCount: number;
  readonly measuredMinutes: number | null;
  readonly declaredCapacityMinutes: number | null;
  readonly capacityGapMinutes: number | null;
  readonly consistency: ConsistencyAnalysis;
  readonly source: string;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

/** Planejado versus executado com separação explícita entre estimativa e medição. */
export function buildExecutionLongitudinal(input: PerformanceExecutionInput): PerformanceExecution {
  assertLocalPeriod(input.period, 'Período de execução');
  const counts = [input.plannedTasks, input.completedTasks, input.overdueTasks, input.blockedTasks];
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
    throw validationError('Contagens de execução inválidas.');
  }
  if (input.completedTasks + input.blockedTasks > input.plannedTasks) {
    throw businessRule('Concluídas e bloqueadas excedem tarefas planejadas.');
  }
  if (input.measuredMinutes !== null && !Number.isFinite(input.measuredMinutes)) {
    throw validationError('Tempo medido inválido.');
  }
  if (input.declaredCapacityMinutes !== null && !Number.isFinite(input.declaredCapacityMinutes)) {
    throw validationError('Capacidade declarada inválida.');
  }
  const estimates = input.estimateMinutes.filter(
    (value): value is number => value !== null && Number.isFinite(value) && value >= 0,
  );
  const unestimatedCount = input.estimateMinutes.length - estimates.length;
  const estimatedMinutes =
    estimates.length > 0 ? estimates.reduce((sum, value) => sum + value, 0) : null;
  const consistency = analyzeConsistency({
    area: 'execution',
    period: input.period,
    observedDays: input.observedDays,
    activeDays: input.activeDays,
    totalDays: input.totalDays,
    source: input.source,
  });
  const limitations = [
    ...new Set([
      ...(input.plannedTasks === 0
        ? ['Sem tarefas planejadas: taxa de conclusão não é zero, é indefinida.']
        : []),
      ...(unestimatedCount > 0
        ? [`${unestimatedCount} tarefa(s) sem estimativa não foram contadas como zero.`]
        : []),
      ...(input.measuredMinutes === null
        ? ['Tempo efetivo não registrado; estimativas não são medições.']
        : []),
      ...(input.declaredCapacityMinutes === null ? ['Capacidade declarada não informada.'] : []),
      ...(input.limitations ?? []),
      consistency.note,
    ]),
  ];
  return {
    period: { ...input.period },
    completionRate:
      input.plannedTasks > 0 ? round3(input.completedTasks / input.plannedTasks) : null,
    plannedTasks: input.plannedTasks,
    completedTasks: input.completedTasks,
    overdueTasks: input.overdueTasks,
    blockedTasks: input.blockedTasks,
    estimatedMinutes,
    unestimatedCount,
    measuredMinutes: input.measuredMinutes,
    declaredCapacityMinutes: input.declaredCapacityMinutes,
    capacityGapMinutes:
      estimatedMinutes !== null && input.declaredCapacityMinutes !== null
        ? round3(input.declaredCapacityMinutes - estimatedMinutes)
        : null,
    consistency,
    source: input.source,
    limitations,
    algorithmVersion: PERFORMANCE_ALGORITHMS.execution,
  };
}

export interface PerformanceTrackedEntity {
  readonly id: string;
  readonly kind: 'goal' | 'project' | 'milestone';
  readonly title: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly targetDate: string | null;
}

export interface PerformanceGoalEvolutionInput {
  readonly period: DatePeriod;
  readonly entities: readonly PerformanceTrackedEntity[];
  readonly activeCycles: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly startDate: string;
    readonly endDate: string;
  }[];
}

export interface PerformanceGoalEvolution {
  readonly period: DatePeriod;
  readonly advanced: number;
  readonly stagnant: number;
  readonly completed: number;
  readonly activeCycles: number;
  readonly linkedEntities: number;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

/** Só conta mudanças registradas; estados passados nunca são reconstruídos. */
export function buildGoalProjectEvolution(
  input: PerformanceGoalEvolutionInput,
): PerformanceGoalEvolution {
  assertLocalPeriod(input.period, 'Período de objetivos');
  for (const entity of input.entities) {
    if (Number.isNaN(Date.parse(entity.updatedAt))) {
      throw validationError('Data de atualização inválida.');
    }
    if (entity.completedAt !== null && Number.isNaN(Date.parse(entity.completedAt))) {
      throw validationError('Data de conclusão inválida.');
    }
    if (entity.targetDate !== null && !isLocalDate(entity.targetDate)) {
      throw validationError('Data-alvo inválida.');
    }
  }
  for (const cycle of input.activeCycles) {
    assertLocalPeriod({ from: cycle.startDate, to: cycle.endDate }, 'Ciclo');
  }
  let advanced = 0;
  let stagnant = 0;
  let completed = 0;
  for (const entity of input.entities) {
    if (
      entity.completedAt !== null &&
      entity.completedAt.slice(0, 10) >= input.period.from &&
      entity.completedAt.slice(0, 10) <= input.period.to
    ) {
      completed += 1;
    }
    if (
      entity.updatedAt.slice(0, 10) >= input.period.from &&
      entity.updatedAt.slice(0, 10) <= input.period.to
    ) {
      advanced += 1;
    } else {
      stagnant += 1;
    }
  }
  return {
    period: { ...input.period },
    advanced,
    stagnant,
    completed,
    activeCycles: input.activeCycles.filter((cycle) => cycle.status === 'active').length,
    linkedEntities: input.entities.filter((entity) => entity.targetDate !== null).length,
    limitations: [
      'Apenas atualizações registradas no período contam como avanço observado.',
      'Nenhum estado histórico foi reconstruído retroativamente.',
      ...(input.activeCycles.length === 0 ? ['Nenhum ciclo estratégico ativo informado.'] : []),
    ],
    algorithmVersion: PERFORMANCE_ALGORITHMS.goals,
  };
}

export interface PerformanceSnapshotInput {
  readonly kind: 'monthly' | 'quarterly';
  readonly createdAt: string;
  readonly periods: PerformancePeriods;
  readonly review: DecisionReview;
  readonly indicators: readonly PerformanceIndicator[];
  readonly patterns: readonly PerformancePattern[];
  readonly associations: readonly PerformanceAssociation[];
  readonly projections: readonly ReturnType<typeof buildPerformanceProjection>[];
  readonly execution: readonly PerformanceExecution[];
  readonly goals: PerformanceGoalEvolution | null;
  readonly persistedSnapshot: boolean;
}

export interface PerformanceSnapshotItem {
  readonly label: string;
  readonly value: string;
  readonly kind: 'observed' | 'calculated' | 'insufficient' | 'simulation';
  readonly sources: readonly string[];
}

export interface PerformanceSnapshot {
  readonly id: string;
  readonly immutable: true;
  readonly kind: 'monthly' | 'quarterly';
  readonly createdAt: string;
  readonly period: DatePeriod;
  readonly previous: DatePeriod;
  readonly sections: readonly {
    readonly title: string;
    readonly items: readonly PerformanceSnapshotItem[];
  }[];
  readonly limitations: readonly string[];
  readonly persistedSnapshot: boolean;
  readonly algorithmVersion: string;
}

function item(
  label: string,
  value: string,
  kind: PerformanceSnapshotItem['kind'],
  sources: readonly string[],
): PerformanceSnapshotItem {
  return { label, value, kind, sources: [...sources] };
}

/**
 * Consolidação imutável: o ID é um hash estável do conteúdo. A persistência
 * permanece no serviço, reaproveitando snapshots versionados já existentes;
 * esta função nunca sobrescreve nem recalcula snapshot antigo.
 */
export function buildPerformanceSnapshot(input: PerformanceSnapshotInput): PerformanceSnapshot {
  if (Number.isNaN(Date.parse(input.createdAt)))
    throw validationError('Instante de criação inválido.');
  const limitations = [
    ...new Set([
      ...input.periods.limitations,
      ...input.review.limitations,
      ...input.indicators.flatMap((indicator) => indicator.limitations),
      ...input.patterns.flatMap((pattern) => pattern.limitations),
      ...input.associations.flatMap((association) => association.limitations),
      ...input.projections.flatMap((projection) => projection.limitations),
      ...input.execution.flatMap((execution) => execution.limitations),
      ...(input.goals?.limitations ?? []),
      ...(input.persistedSnapshot
        ? []
        : ['Nenhum snapshot persistido foi encontrado; esta é uma consolidação sob demanda.']),
      'Snapshots encerrados não são recalculados.',
    ]),
  ].slice(0, 20);
  const byStatus = (status: PerformanceIndicator['status']) =>
    input.indicators.filter((indicator) => indicator.status === status);
  const results = [
    ...byStatus('calculated')
      .filter((indicator) => indicator.direction === 'up' || indicator.direction === 'stable')
      .map((indicator) =>
        item(
          indicator.label,
          `${indicator.direction} · ${indicator.currentValue ?? 'indisponível'} ${indicator.unit}`,
          'calculated',
          [indicator.source],
        ),
      ),
    ...byStatus('calculated')
      .filter((indicator) => indicator.direction === 'down')
      .map((indicator) =>
        item(
          indicator.label,
          `queda · ${indicator.currentValue ?? 'indisponível'} ${indicator.unit}`,
          'calculated',
          [indicator.source],
        ),
      ),
    ...byStatus('unavailable').map((indicator) =>
      item(indicator.label, 'sem evidência suficiente', 'insufficient', [indicator.source]),
    ),
  ];
  const executionItems: PerformanceSnapshotItem[] = input.execution.flatMap((execution) => [
    item(
      `Conclusão ${execution.period.from}..${execution.period.to}`,
      execution.completionRate === null
        ? 'indefinida'
        : `${Math.round(execution.completionRate * 100)}%`,
      execution.completionRate === null ? 'insufficient' : 'calculated',
      ['tasks'],
    ),
    item(
      `Consistência ${execution.period.from}..${execution.period.to}`,
      execution.consistency.status === 'available'
        ? `${Math.round(execution.consistency.coverage * 100)}% de cobertura`
        : 'cobertura insuficiente',
      execution.consistency.status === 'available' ? 'calculated' : 'insufficient',
      [execution.source],
    ),
    item(
      `Tempo medido ${execution.period.from}..${execution.period.to}`,
      execution.measuredMinutes === null ? 'não registrado' : `${execution.measuredMinutes} min`,
      execution.measuredMinutes === null ? 'insufficient' : 'observed',
      ['time_entries'],
    ),
  ]);
  const patternItems = [
    ...input.patterns.map((pattern) =>
      item(
        pattern.label,
        `${pattern.classification} · ${pattern.observations} observações · sem causalidade`,
        pattern.classification === 'pattern' ? 'calculated' : 'insufficient',
        [pattern.source],
      ),
    ),
    ...input.associations
      .filter((association) => association.status === 'ok')
      .map((association) =>
        item(
          association.label,
          `associação ${association.relation} · r=${association.correlation ?? 'não estimado'}`,
          'calculated',
          [],
        ),
      ),
  ];
  const nextPeriod = [
    ...input.projections.map((projection) =>
      item(
        projection.label,
        projection.status === 'available'
          ? `projeção ${projection.projectedValue ?? 'indisponível'} ${projection.unit} · horizonte ${projection.horizonDays}d`
          : 'dados insuficientes para projetar',
        'simulation',
        [projection.source],
      ),
    ),
    ...(input.goals === null
      ? [item('Objetivos e projetos', 'sem histórico informado', 'insufficient', [])]
      : [
          item('Objetivos atualizados no período', String(input.goals.advanced), 'observed', [
            'goals',
            'projects',
          ]),
        ]),
  ];
  const sections = [
    { title: 'Resultados', items: results.slice(0, 24) },
    { title: 'Execução', items: executionItems.slice(0, 24) },
    { title: 'Padrões e associações', items: patternItems.slice(0, 24) },
    { title: 'Próximo período', items: nextPeriod.slice(0, 24) },
    {
      title: 'Limitações',
      items: limitations.slice(0, 24).map((text) => item(text, 'limitação', 'insufficient', [])),
    },
  ];
  const fingerprint = JSON.stringify({
    kind: input.kind,
    period: input.periods.current,
    previous: input.periods.previous,
    sections,
  });
  return {
    id: `snap_${stableHash(fingerprint)}`,
    immutable: true,
    kind: input.kind,
    createdAt: input.createdAt,
    period: { ...input.periods.current },
    previous: { ...input.periods.previous },
    sections,
    limitations,
    persistedSnapshot: input.persistedSnapshot,
    algorithmVersion: PERFORMANCE_ALGORITHMS.snapshot,
  };
}
