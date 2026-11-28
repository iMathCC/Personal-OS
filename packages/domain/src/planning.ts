import { businessRule, validationError } from './errors';
import { dayCount, isLocalDate, shiftLocalDate } from './studies';

/** Versões explícitas: toda saída calculada informa qual regra a produziu. */
export const PLANNING_ALGORITHMS = Object.freeze({
  cycle: 'planning-cycle-v1',
  capacity: 'capacity-allocation-v1',
  prioritization: 'strategic-prioritization-v1',
  tradeoff: 'tradeoff-analysis-v1',
  scenario: 'scenario-simulation-v1',
  review: 'quarterly-review-v1',
});

export const CYCLE_STATUSES = ['planned', 'active', 'paused', 'completed', 'cancelled'] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const STRATEGIC_HORIZONS = ['short', 'medium', 'long'] as const;
export type StrategicHorizon = (typeof STRATEGIC_HORIZONS)[number];

export const SCENARIO_CHANGE_TYPES = [
  'set_goal_importance',
  'set_capacity',
  'defer_project',
  'set_area_focus',
  'exclude_task',
] as const;
export type ScenarioChangeType = (typeof SCENARIO_CHANGE_TYPES)[number];

export interface PlanningWeights {
  readonly importance: number;
  readonly urgency: number;
  readonly progressGap: number;
  readonly dependencies: number;
  readonly capacity: number;
  readonly risk: number;
  readonly contribution: number;
}

/** Pesos padrão: soma 100. Importância declarada nunca é sobrescrita. */
export const DEFAULT_PLANNING_WEIGHTS: PlanningWeights = Object.freeze({
  importance: 25,
  urgency: 15,
  progressGap: 10,
  dependencies: 10,
  capacity: 15,
  risk: 10,
  contribution: 15,
});

export function assertWeights(weights: PlanningWeights): PlanningWeights {
  const entries = Object.entries(weights);
  if (entries.length !== 7) throw validationError('Pesos de priorização incompletos.');
  for (const [key, value] of entries) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw validationError(`Peso inválido: ${key}.`);
    }
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) throw validationError('A soma dos pesos deve ser positiva.');
  return weights;
}

/** Ciclos são intervalos fechados em datas locais; a ordem é obrigatória. */
export function assertCyclePeriod(start: string, end: string): void {
  if (!isLocalDate(start) || !isLocalDate(end)) {
    throw validationError('Datas do ciclo inválidas.');
  }
  if (end < start) throw validationError('A data final não pode anteceder a inicial.');
  if (dayCount(start, end) > 366) {
    throw businessRule('Um ciclo de planejamento não pode exceder 366 dias.');
  }
}

export interface CycleInterval {
  readonly startDate: string;
  readonly endDate: string;
}

export function cyclesOverlap(a: CycleInterval, b: CycleInterval): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** Transições explícitas. Ciclos encerrados nunca voltam a estado mutável. */
export function assertCycleTransition(from: CycleStatus, to: CycleStatus): void {
  const allowed: Record<CycleStatus, readonly CycleStatus[]> = {
    planned: ['active', 'cancelled'],
    active: ['paused', 'completed', 'cancelled'],
    paused: ['active', 'completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  if (from === to) return;
  if (!allowed[from].includes(to)) {
    throw businessRule(`Transição de ciclo inválida: ${from} → ${to}.`);
  }
}

/** Semanas locais ancoradas na data inicial do ciclo, sem usar fuso do servidor. */
export function cycleWeeks(start: string, end: string): { from: string; to: string }[] {
  assertCyclePeriod(start, end);
  const weeks: { from: string; to: string }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const last = shiftLocalDate(cursor, 6);
    weeks.push({ from: cursor, to: last > end ? end : last });
    cursor = shiftLocalDate(cursor, 7);
  }
  return weeks;
}

export interface CapacityCommitment {
  readonly id: string;
  readonly title: string;
  readonly areaId: string;
  readonly projectId: string | null;
  readonly goalId: string | null;
  readonly estimateMinutes: number | null;
  readonly status: string;
  readonly blocked: boolean;
}

export interface CapacityAreaInput {
  readonly areaId: string;
  /** Percentual configurado; a soma não precisa ser 100 — a cobertura é explícita. */
  readonly percent: number;
}

export interface CapacityUnavailability {
  readonly from: string;
  readonly to: string;
  /** Minutos por dia indisponível. Sem estimativa, a faixa é sinalizada. */
  readonly minutesPerDay: number | null;
}

export interface CapacityInput {
  readonly weekStart: string;
  readonly configuredMinutes: number;
  readonly contingencyPercent: number;
  readonly allocations: readonly CapacityAreaInput[];
  readonly unavailability: readonly CapacityUnavailability[];
  readonly commitments: readonly CapacityCommitment[];
}

export interface CapacityAreaResult {
  readonly areaId: string;
  readonly allocatedMinutes: number;
  readonly committedMinutes: number;
  readonly remainingMinutes: number;
  readonly estimatedTaskCount: number;
  readonly unestimatedTaskCount: number;
}

export interface CapacityResult {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly configuredMinutes: number;
  readonly contingencyMinutes: number;
  readonly unavailableMinutes: number;
  readonly availableMinutes: number;
  readonly committedMinutes: number;
  readonly remainingMinutes: number;
  readonly overloadMinutes: number;
  readonly overloadRatio: number | null;
  readonly estimatedTaskCount: number;
  readonly unestimatedTaskCount: number;
  readonly coverage: number;
  readonly blockedTaskCount: number;
  readonly skippedCompletedCount: number;
  readonly skippedCancelledCount: number;
  readonly byArea: readonly CapacityAreaResult[];
  readonly warnings: readonly string[];
  readonly algorithmVersion: string;
}

const CLOSED_STATUSES = new Set(['completed', 'done', 'cancelled', 'canceled']);

/**
 * Capacidade configurada ≠ tempo observado. Estimativas ausentes reduzem a
 * cobertura, nunca viram zero. Tarefas duplicadas por join são contadas uma vez.
 */
export function calculateCapacity(input: CapacityInput): CapacityResult {
  if (!isLocalDate(input.weekStart)) throw validationError('Início da semana inválido.');
  if (!Number.isFinite(input.configuredMinutes) || input.configuredMinutes < 0) {
    throw validationError('Capacidade semanal inválida.');
  }
  if (
    !Number.isFinite(input.contingencyPercent) ||
    input.contingencyPercent < 0 ||
    input.contingencyPercent > 50
  ) {
    throw validationError('Reserva para imprevistos deve estar entre 0% e 50%.');
  }
  const weekEnd = shiftLocalDate(input.weekStart, 6);
  const seen = new Set<string>();
  let committedMinutes = 0;
  let estimatedTaskCount = 0;
  let unestimatedTaskCount = 0;
  let blockedTaskCount = 0;
  let skippedCompletedCount = 0;
  let skippedCancelledCount = 0;
  const warnings: string[] = [];
  const perArea = new Map<string, { minutes: number; estimated: number; unestimated: number }>();

  for (const task of input.commitments) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    if (task.status === 'cancelled') {
      skippedCancelledCount += 1;
      continue;
    }
    if (CLOSED_STATUSES.has(task.status)) {
      skippedCompletedCount += 1;
      continue;
    }
    if (task.blocked) {
      blockedTaskCount += 1;
      continue;
    }
    const bucket = perArea.get(task.areaId) ?? { minutes: 0, estimated: 0, unestimated: 0 };
    if (task.estimateMinutes === null || !Number.isFinite(task.estimateMinutes)) {
      unestimatedTaskCount += 1;
      bucket.unestimated += 1;
    } else {
      if (task.estimateMinutes < 0) throw validationError('Estimativa negativa.');
      committedMinutes += task.estimateMinutes;
      bucket.minutes += task.estimateMinutes;
      estimatedTaskCount += 1;
      bucket.estimated += 1;
    }
    perArea.set(task.areaId, bucket);
  }

  let unavailableMinutes = 0;
  for (const period of input.unavailability) {
    if (!isLocalDate(period.from) || !isLocalDate(period.to) || period.to < period.from) {
      throw validationError('Período de indisponibilidade inválido.');
    }
    const from = period.from > input.weekStart ? period.from : input.weekStart;
    const to = period.to < weekEnd ? period.to : weekEnd;
    if (from > to) continue;
    const days = dayCount(from, to);
    if (period.minutesPerDay === null) {
      warnings.push(`Indisponibilidade ${from} → ${to} sem minutos por dia: não foi deduzida.`);
      continue;
    }
    if (!Number.isFinite(period.minutesPerDay) || period.minutesPerDay < 0) {
      throw validationError('Minutos por dia de indisponibilidade inválidos.');
    }
    unavailableMinutes += days * period.minutesPerDay;
  }

  const contingencyMinutes = Math.round((input.configuredMinutes * input.contingencyPercent) / 100);
  const availableMinutes = Math.max(
    0,
    input.configuredMinutes - contingencyMinutes - unavailableMinutes,
  );
  const remainingMinutes = availableMinutes - committedMinutes;
  const totalTasks = estimatedTaskCount + unestimatedTaskCount;
  const coverage = totalTasks === 0 ? null : estimatedTaskCount / totalTasks;
  if (coverage !== null && coverage < 1) {
    warnings.push(`${unestimatedTaskCount} tarefa(s) sem estimativa: compromisso parcial.`);
  }
  if (blockedTaskCount > 0) {
    warnings.push(
      `${blockedTaskCount} tarefa(s) bloqueada(s) não contabilizadas como compromisso.`,
    );
  }
  if (input.configuredMinutes === 0) {
    warnings.push('Capacidade semanal não configurada: valores disponíveis são zero.');
  }

  const areaIds = new Set<string>([
    ...input.allocations.map((item) => item.areaId),
    ...perArea.keys(),
  ]);
  const byArea = Array.from(areaIds)
    .sort()
    .map((areaId): CapacityAreaResult => {
      const allocation = input.allocations.find((item) => item.areaId === areaId);
      const bucket = perArea.get(areaId) ?? { minutes: 0, estimated: 0, unestimated: 0 };
      const allocatedMinutes = Math.round((availableMinutes * (allocation?.percent ?? 0)) / 100);
      return {
        areaId,
        allocatedMinutes,
        committedMinutes: bucket.minutes,
        remainingMinutes: allocatedMinutes - bucket.minutes,
        estimatedTaskCount: bucket.estimated,
        unestimatedTaskCount: bucket.unestimated,
      };
    });

  return {
    weekStart: input.weekStart,
    weekEnd,
    configuredMinutes: input.configuredMinutes,
    contingencyMinutes,
    unavailableMinutes,
    availableMinutes,
    committedMinutes,
    remainingMinutes,
    overloadMinutes: Math.max(0, -remainingMinutes),
    overloadRatio: availableMinutes === 0 ? null : committedMinutes / availableMinutes,
    estimatedTaskCount,
    unestimatedTaskCount,
    coverage: coverage ?? 0,
    blockedTaskCount,
    skippedCompletedCount,
    skippedCancelledCount,
    byArea,
    warnings,
    algorithmVersion: PLANNING_ALGORITHMS.capacity,
  };
}

export interface PrioritizationItem {
  readonly id: string;
  readonly title: string;
  readonly kind: 'goal' | 'project';
  /** Prioridade declarada pelo usuário — preservada, nunca sobrescrita. */
  readonly declaredPriority: number;
  readonly importance: number;
  readonly dueDate: string | null;
  readonly today: string;
  readonly progressPercent: number | null;
  readonly pendingDependencies: number;
  readonly minutes: number | null;
  readonly availableMinutes: number;
  readonly risk: number;
  readonly contribution: number;
}

export interface PrioritizationReason {
  readonly code: string;
  readonly message: string;
}

export interface PrioritizedItem extends PrioritizationItem {
  readonly score: number;
  readonly suggestedPriority: number;
  readonly reasons: readonly PrioritizationReason[];
  readonly algorithmVersion: string;
}

function normalize(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Fórmula documentada: score = Σ(peso_i × fator_i) / Σ(pesos), com fatores
 * normalizados em [0,1]. `importance` e `contribution` são dados do usuário;
 * urgência vem de prazo real; risco/dependência/capacidade são sinais explícitos.
 * O resultado é uma sugestão explicável, não uma decisão nem previsão.
 */
export function prioritizeItems(
  items: readonly PrioritizationItem[],
  weights: PlanningWeights = DEFAULT_PLANNING_WEIGHTS,
): PrioritizedItem[] {
  const w = assertWeights(weights);
  const total = Object.values(w).reduce((sum, value) => sum + value, 0);
  return items
    .map((item): PrioritizedItem => {
      if (
        !Number.isInteger(item.declaredPriority) ||
        item.declaredPriority < 1 ||
        item.declaredPriority > 5
      ) {
        throw validationError('Prioridade declarada inválida.');
      }
      if (!isLocalDate(item.today)) throw validationError('Data atual inválida.');
      if (item.dueDate !== null && !isLocalDate(item.dueDate)) {
        throw validationError('Prazo de priorização inválido.');
      }
      const daysLeft = item.dueDate === null ? null : dayCount(item.today, item.dueDate);
      const urgency =
        daysLeft === null
          ? 0
          : daysLeft < 0
            ? 1
            : daysLeft === 0
              ? 0.9
              : Math.max(0, 1 - daysLeft / 90);
      const gap = item.progressPercent === null ? 0 : normalize((100 - item.progressPercent) / 100);
      const dependency = normalize(item.pendingDependencies / 3);
      const fit =
        item.minutes === null || item.availableMinutes <= 0
          ? 0
          : normalize(item.availableMinutes / item.minutes);
      const factors: [keyof PlanningWeights, number, string][] = [
        ['importance', normalize(item.importance / 5), 'Importância estratégica informada.'],
        [
          'urgency',
          urgency,
          daysLeft === null ? 'Sem prazo informado.' : `Prazo a ${daysLeft} dia(s).`,
        ],
        [
          'progressGap',
          gap,
          item.progressPercent === null
            ? 'Progresso sem dados.'
            : `Progresso ${item.progressPercent}%.`,
        ],
        ['dependencies', dependency, `${item.pendingDependencies} dependência(s) pendente(s).`],
        [
          'capacity',
          fit,
          item.minutes === null ? 'Sem estimativa de duração.' : 'Ajuste à capacidade disponível.',
        ],
        ['risk', normalize(item.risk / 5), 'Risco informado.'],
        [
          'contribution',
          normalize(item.contribution / 5),
          'Contribuição para resultados desejados.',
        ],
      ];
      const score = Math.round(
        (factors.reduce((sum, [key, value]) => sum + w[key] * value, 0) / total) * 100,
      );
      const suggestedPriority = Math.max(1, Math.min(5, Math.ceil((100 - score) / 20) || 1));
      const reasons = factors
        .filter(([key]) => w[key] > 0)
        .map(([, value, message]) => ({
          code: 'FACTOR',
          message: `${message} Fator ${value.toFixed(2)}.`,
        }));
      if (item.declaredPriority !== suggestedPriority) {
        reasons.push({
          code: 'DECLARED_PRIORITY_PRESERVED',
          message: `Prioridade declarada ${item.declaredPriority} mantida; sugestão é ${suggestedPriority}.`,
        });
      }
      return {
        ...item,
        score,
        suggestedPriority,
        reasons,
        algorithmVersion: PLANNING_ALGORITHMS.prioritization,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export interface TradeoffInput {
  readonly items: readonly PrioritizedItem[];
  readonly capacity: CapacityResult;
  readonly areas: readonly { areaId: string; name: string }[];
}

export interface Tradeoff {
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly itemIds: readonly string[];
}

/** Trade-offs são fatos sobre disputa de recursos, nunca recomendação de abandono. */
export function analyzeTradeoffs(input: TradeoffInput): Tradeoff[] {
  const output: Tradeoff[] = [];
  if (input.capacity.overloadMinutes > 0) {
    output.push({
      code: 'CAPACITY_OVERLOAD',
      title: 'Capacidade comprometida acima do disponível',
      detail: `${input.capacity.overloadMinutes} min acima da capacidade configurada, já descontada a reserva.`,
      itemIds: input.items.filter((item) => item.minutes !== null).map((item) => item.id),
    });
  }
  if (input.capacity.unestimatedTaskCount > 0 && input.capacity.coverage < 1) {
    output.push({
      code: 'PARTIAL_ESTIMATES',
      title: 'Cobertura parcial de estimativas',
      detail: `${Math.round(input.capacity.coverage * 100)}% das tarefas possuem estimativa; o restante não entra no total.`,
      itemIds: [],
    });
  }
  for (const area of input.capacity.byArea) {
    if (area.remainingMinutes < 0 && area.committedMinutes > 0) {
      output.push({
        code: 'AREA_COMPETITION',
        title: `Disputa em ${input.areas.find((candidate) => candidate.areaId === area.areaId)?.name ?? area.areaId}`,
        detail: `${-area.remainingMinutes} min acima da fatia configurada para a área.`,
        itemIds: input.items.filter((item) => item.kind === 'goal').map((item) => item.id),
      });
    }
  }
  if (input.capacity.unestimatedTaskCount > 0) {
    output.push({
      code: 'MISSING_DATA',
      title: 'Dados insuficientes para decidir',
      detail: 'Sem estimativas não é possível comparar o custo de adiar compromissos.',
      itemIds: [],
    });
  }
  return output;
}

export interface ScenarioChange {
  readonly type: ScenarioChangeType;
  readonly goalId?: string;
  readonly projectId?: string;
  readonly taskId?: string;
  readonly areaId?: string;
  readonly value?: number;
}

export interface ScenarioBase {
  readonly today: string;
  readonly weekStart: string;
  readonly weeklyMinutes: number;
  readonly contingencyPercent: number;
  readonly commitments: readonly CapacityCommitment[];
  readonly allocations: readonly CapacityAreaInput[];
  readonly unavailability: readonly CapacityUnavailability[];
  readonly items: readonly PrioritizationItem[];
}

export interface SimulationResult {
  readonly weeklyMinutes: number;
  readonly capacity: CapacityResult;
  readonly priorities: readonly PrioritizedItem[];
  readonly tradeoffs: readonly Tradeoff[];
  readonly ignored: readonly string[];
  readonly algorithmVersion: string;
}

type MutableScenarioBase = {
  -readonly [K in keyof ScenarioBase]: ScenarioBase[K] extends readonly (infer U)[]
    ? U[]
    : ScenarioBase[K];
};

function cloneBase(base: ScenarioBase): MutableScenarioBase {
  return {
    ...base,
    commitments: base.commitments.map((item) => ({ ...item })),
    allocations: base.allocations.map((item) => ({ ...item })),
    unavailability: base.unavailability.map((item) => ({ ...item })),
    items: base.items.map((item) => ({ ...item })),
  };
}

export const SCENARIO_LIMITATIONS = Object.freeze([
  'Simulação hipotética: nenhum dado real é alterado e nenhuma tarefa é executada.',
  'Ausência de registros não significa ausência de trabalho ou de capacidade.',
  'Estimativas vêm de dados informados; não há medição de tempo real.',
  'Resultados são comparações determinísticas, não previsões.',
]);

/**
 * Cópia lógica do estado: `changes` nunca é aplicado ao objeto de entrada.
 * Alterações desconhecidas ou sem alvo são ignoradas com aviso explícito.
 */
export function simulateScenario(
  base: ScenarioBase,
  changes: readonly ScenarioChange[],
  weights: PlanningWeights = DEFAULT_PLANNING_WEIGHTS,
): SimulationResult {
  const state = cloneBase(base);
  const ignored: string[] = [];
  let weeklyMinutes = state.weeklyMinutes;

  for (const change of changes) {
    switch (change.type) {
      case 'set_capacity': {
        if (change.value === undefined || change.value < 0) {
          ignored.push('set_capacity sem valor válido.');
          break;
        }
        weeklyMinutes = change.value;
        break;
      }
      case 'set_goal_importance': {
        const item = state.items.find((entry) => entry.id === change.goalId);
        if (item === undefined || change.value === undefined) {
          ignored.push('set_goal_importance sem alvo ou valor.');
          break;
        }
        Object.assign(item, { importance: normalize(change.value) * 5 });
        break;
      }
      case 'defer_project': {
        const projectId = change.projectId;
        if (projectId === undefined) {
          ignored.push('defer_project sem alvo.');
          break;
        }
        state.items = state.items.filter(
          (item) => item.kind !== 'project' || item.id !== projectId,
        );
        state.commitments = state.commitments.filter((task) => task.projectId !== projectId);
        break;
      }
      case 'exclude_task': {
        const taskId = change.taskId;
        if (taskId === undefined) {
          ignored.push('exclude_task sem alvo.');
          break;
        }
        state.commitments = state.commitments.filter((task) => task.id !== taskId);
        break;
      }
      case 'set_area_focus': {
        if (change.areaId === undefined || change.value === undefined) {
          ignored.push('set_area_focus sem alvo ou valor.');
          break;
        }
        const allocations = state.allocations.filter((item) => item.areaId !== change.areaId);
        allocations.push({
          areaId: change.areaId,
          percent: Math.max(0, Math.min(100, change.value)),
        });
        state.allocations = allocations;
        break;
      }
      default:
        ignored.push('Alteração desconhecida.');
    }
  }

  const weekStart = state.weekStart;
  const capacity = calculateCapacity({
    weekStart,
    configuredMinutes: weeklyMinutes,
    contingencyPercent: state.contingencyPercent,
    allocations: state.allocations,
    unavailability: state.unavailability,
    commitments: state.commitments,
  });
  const priorities = prioritizeItems(state.items, weights);
  const tradeoffs = analyzeTradeoffs({ items: priorities, capacity, areas: [] });
  return {
    weeklyMinutes,
    capacity,
    priorities,
    tradeoffs,
    ignored,
    algorithmVersion: PLANNING_ALGORITHMS.scenario,
  };
}

export interface ScenarioComparison {
  readonly base: SimulationResult;
  readonly scenario: SimulationResult;
  readonly deltas: {
    readonly committedMinutes: number;
    readonly remainingMinutes: number;
    readonly overloadMinutes: number;
    readonly coverage: number;
    readonly topPriorityIds: readonly string[];
  };
  readonly limitations: readonly string[];
}

export function compareScenarios(
  base: SimulationResult,
  scenario: SimulationResult,
): ScenarioComparison {
  return {
    base,
    scenario,
    deltas: {
      committedMinutes: scenario.capacity.committedMinutes - base.capacity.committedMinutes,
      remainingMinutes: scenario.capacity.remainingMinutes - base.capacity.remainingMinutes,
      overloadMinutes: scenario.capacity.overloadMinutes - base.capacity.overloadMinutes,
      coverage: scenario.capacity.coverage - base.capacity.coverage,
      topPriorityIds: scenario.priorities.slice(0, 3).map((item) => item.id),
    },
    limitations: SCENARIO_LIMITATIONS,
  };
}

export interface QuarterlyReviewInput {
  readonly cycle: CycleInterval & { readonly name: string; readonly theme: string | null };
  readonly items: readonly PrioritizedItem[];
  readonly capacity: CapacityResult;
  readonly tradeoffs: readonly Tradeoff[];
  readonly completedGoalIds: readonly string[];
  readonly pendingGoalIds: readonly string[];
  readonly changedGoalIds: readonly string[];
  readonly intelligence: {
    readonly alerts: number;
    readonly recommendations: number;
    readonly sourcesWithData: readonly string[];
    readonly truncated: boolean;
  } | null;
  readonly reflections: Record<string, string>;
  readonly generatedAt: string;
}

/** Snapshot congelado: reflexões ficam em colunas separadas e nunca recalculam o corpo. */
export function buildQuarterlyReviewSnapshot(input: QuarterlyReviewInput) {
  return {
    schemaVersion: 1,
    cycle: input.cycle,
    plannedItems: input.items.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      declaredPriority: item.declaredPriority,
      suggestedPriority: item.suggestedPriority,
      score: item.score,
    })),
    completedGoalIds: [...input.completedGoalIds],
    pendingGoalIds: [...input.pendingGoalIds],
    changedGoalIds: [...input.changedGoalIds],
    capacity: input.capacity,
    tradeoffs: input.tradeoffs,
    intelligence: input.intelligence,
    reflections: { ...input.reflections },
    limitations: SCENARIO_LIMITATIONS,
    algorithmVersion: PLANNING_ALGORITHMS.review,
    generatedAt: input.generatedAt,
  };
}
