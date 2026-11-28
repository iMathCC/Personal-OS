import type { DecisionDatePeriod, DecisionPeriods, DecisionTask } from './decision';

export const PLANNING_EXECUTION_ALGORITHM_VERSION = 'planning-execution-v1';

export type PlanningExecutionState =
  | 'not_planned'
  | 'planned_not_executed'
  | 'partially_executed'
  | 'fully_executed'
  | 'insufficient_evidence'
  | 'not_applicable';

export interface PlanningExecutionItem {
  readonly id: string;
  readonly label: string;
  readonly definition: string;
  readonly state: PlanningExecutionState;
  readonly plannedValue: number | null;
  readonly executedValue: number | null;
  readonly unit: string | null;
  readonly period: DecisionDatePeriod;
  readonly source: readonly string[];
  readonly formula: string;
  readonly coverage: number | null;
  readonly confidence: number | null;
  readonly missing: readonly string[];
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
  readonly configuredCapacityValue: number | null;
  readonly allocatedPlannedValue: number | null;
  readonly hasExplicitPlan: boolean;
  readonly hasExecutionRecord: boolean;
  readonly comparable: boolean;
  readonly fulfillmentPercent: number | null;
}

export interface PlanningExecutionResult {
  readonly period: DecisionDatePeriod;
  readonly timezone: string;
  readonly items: readonly PlanningExecutionItem[];
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

export interface PlanningExecutionInput {
  readonly periods: DecisionPeriods;
  readonly timezone: string;
  readonly tasks: readonly DecisionTask[];
  readonly facts: {
    readonly tasksOpen: number;
    readonly tasksCompleted: number;
    readonly goalsActive: number;
    readonly goalsCompleted: number;
    readonly projectsActive: number;
    readonly projectsCompleted: number;
    readonly studyMinutes: number;
    readonly studySessions: number;
    readonly timeMinutes: number;
    readonly timeObservations: number;
    readonly capacityWeeklyMinutes: number | null;
    readonly capacityContingencyPercent: number | null;
    readonly weeklyReviewCount: number;
  };
}

function inPeriod(date: string | null, period: DecisionDatePeriod): boolean {
  return date !== null && date >= period.from && date <= period.to;
}

function pct(executed: number, planned: number): number | null {
  if (planned <= 0) return null;
  return Math.round((executed / planned) * 1000) / 10;
}

function stateFromPlanExec(input: {
  hasExplicitPlan: boolean;
  hasExecutionRecord: boolean;
  comparable: boolean;
  planned: number | null;
  executed: number | null;
}): PlanningExecutionState {
  if (!input.hasExplicitPlan && !input.hasExecutionRecord) return 'insufficient_evidence';
  if (!input.hasExplicitPlan) return 'not_planned';
  if (!input.hasExecutionRecord || input.executed === null) return 'insufficient_evidence';
  if (!input.comparable || input.planned === null) return 'not_applicable';
  if (input.planned <= 0) return 'not_applicable';
  if (input.executed <= 0) return 'planned_not_executed';
  if (input.executed >= input.planned) return 'fully_executed';
  return 'partially_executed';
}

export function buildPlanningExecution(input: PlanningExecutionInput): PlanningExecutionResult {
  const { periods, facts, tasks, timezone } = input;
  const period = periods.current;
  const limitations: string[] = [];

  // Tarefas: compromisso planejado = tarefa com vencimento no período (planejamento explícito).
  // Execução = tarefas com vencimento no período concluídas.
  const dueInPeriod = tasks.filter((t) => inPeriod(t.dueDate, period));
  const dueCompleted = dueInPeriod.filter((t) => t.status === 'completed');
  const hasTaskPlan = dueInPeriod.length > 0;
  const taskPlanned = hasTaskPlan ? dueInPeriod.length : null;
  const hasTaskExecRecord = hasTaskPlan || facts.tasksCompleted > 0;
  // Se não há tarefas com vencimento no período, não inferimos plano; reportamos execução observada separadamente.
  const taskItem: PlanningExecutionItem = {
    id: 'tasks-due-period',
    label: 'Compromissos com prazo no período',
    definition:
      'Tarefas com data de vencimento dentro do período (planejamento explícito) comparadas às concluídas entre elas.',
    state: stateFromPlanExec({
      hasExplicitPlan: hasTaskPlan,
      hasExecutionRecord: hasTaskExecRecord,
      comparable: hasTaskPlan,
      planned: taskPlanned,
      executed: hasTaskPlan ? dueCompleted.length : null,
    }),
    plannedValue: taskPlanned,
    executedValue: hasTaskPlan ? dueCompleted.length : null,
    unit: 'tarefas',
    period,
    source: ['tasks'],
    formula:
      'planejado = count(tasks where due_date between period.from and period.to); executado = count(subset where status=completed)',
    coverage: periods.currentDays > 0 ? 1 : null,
    confidence: hasTaskPlan ? 0.9 : 0.4,
    missing: hasTaskPlan ? [] : ['tarefas com vencimento explícito no período'],
    limitations: [
      'Tarefas sem vencimento no período não são contadas como planejamento explícito.',
      'Conclusão de tarefa não significa automaticamente resultado do objetivo.',
      ...(hasTaskPlan
        ? []
        : ['Sem compromissos com prazo no período; execução não é inferida como zero.']),
    ],
    algorithmVersion: PLANNING_EXECUTION_ALGORITHM_VERSION,
    configuredCapacityValue: null,
    allocatedPlannedValue: taskPlanned,
    hasExplicitPlan: hasTaskPlan,
    hasExecutionRecord: hasTaskExecRecord,
    comparable: hasTaskPlan,
    fulfillmentPercent: hasTaskPlan ? pct(dueCompleted.length, dueInPeriod.length) : null,
  };

  // Capacidade: configurada, não alocação planejada explícita para período arbitrário.
  const capWeekly = facts.capacityWeeklyMinutes;
  const hasCap = capWeekly !== null;
  const periodDays = periods.currentDays;
  // Normalização proporcional só quando período for múltiplo de 7 dias e capacidade declarada.
  // Para evitar falsa precisão, reportamos capacidade semanal declarada e tempo do período sem percentual por padrão,
  // exceto quando período tem exatamente 7 dias.
  const capComparable = hasCap && periodDays === 7;
  const capPlanned = capComparable ? capWeekly : null;
  const capItem: PlanningExecutionItem = {
    id: 'capacity-vs-time',
    label: 'Capacidade configurada vs tempo registrado',
    definition:
      'Capacidade semanal configurada pelo usuário comparada ao tempo efetivamente registrado. Capacidade configurada não é alocação planejada por compromisso.',
    state: !hasCap
      ? 'insufficient_evidence'
      : !facts.timeObservations
        ? 'insufficient_evidence'
        : capComparable
          ? stateFromPlanExec({
              hasExplicitPlan: true,
              hasExecutionRecord: true,
              comparable: true,
              planned: capPlanned,
              executed: facts.timeMinutes,
            })
          : 'not_applicable',
    plannedValue: capPlanned,
    executedValue: facts.timeObservations > 0 ? facts.timeMinutes : null,
    unit: 'minutos',
    period,
    source: ['capacity_profiles', 'time_entries'],
    formula: capComparable
      ? 'planejado = capacity_profiles.weekly_minutes (período de 7 dias); executado = sum(time_entries.duration_minutes in period)'
      : 'capacidade declarada = capacity_profiles.weekly_minutes (semanal); executado = sum(time_entries.duration_minutes in period); percentual suprimido por base/período não equivalente',
    coverage: hasCap
      ? facts.timeObservations > 0
        ? Math.min(1, facts.timeObservations / Math.max(1, periodDays))
        : 0
      : null,
    confidence: hasCap && facts.timeObservations > 0 ? 0.7 : 0.3,
    missing: [
      ...(hasCap ? [] : ['capacidade configurada']),
      ...(facts.timeObservations > 0 ? [] : ['registros de tempo no período']),
    ],
    limitations: [
      'Capacidade configurada é distinta de alocação planejada; não assume compromissos explícitos.',
      'Tempo registrado é observação de execução, não resultado.',
      ...(capComparable
        ? []
        : ['Período diferente de 7 dias: percentual suprimido para evitar comparação enganosa.']),
    ],
    algorithmVersion: PLANNING_EXECUTION_ALGORITHM_VERSION,
    configuredCapacityValue: capWeekly,
    allocatedPlannedValue: null,
    hasExplicitPlan: false,
    hasExecutionRecord: facts.timeObservations > 0,
    comparable: capComparable,
    fulfillmentPercent:
      capComparable && capWeekly !== null && capWeekly > 0
        ? pct(facts.timeMinutes, capWeekly)
        : null,
  };

  // Estudos: sem meta/plano explícito no DTO atual -> not_planned/insufficient_evidence.
  const studyHasExec = facts.studySessions > 0 || facts.studyMinutes > 0;
  const studyItem: PlanningExecutionItem = {
    id: 'study-recorded',
    label: 'Estudo registrado no período',
    definition:
      'Minutos de estudo observados no período. Sem meta explícita registrada, não se classifica como planejado ou não executado.',
    state: studyHasExec ? 'not_planned' : 'insufficient_evidence',
    plannedValue: null,
    executedValue: studyHasExec ? facts.studyMinutes : null,
    unit: 'minutos',
    period,
    source: ['study_sessions'],
    formula:
      'executado = sum(study_sessions.duration_minutes in period); planejado = ausente (sem meta explícita)',
    coverage: studyHasExec ? Math.min(1, facts.studySessions / Math.max(1, periodDays)) : 0,
    confidence: studyHasExec ? 0.8 : 0.2,
    missing: [
      ...(studyHasExec ? [] : ['sessões de estudo no período']),
      'meta de estudo explícita',
    ],
    limitations: [
      'Sem planejamento explícito, não há base para percentual de cumprimento.',
      'Ausência de registro não significa ausência de estudo.',
    ],
    algorithmVersion: PLANNING_EXECUTION_ALGORITHM_VERSION,
    configuredCapacityValue: null,
    allocatedPlannedValue: null,
    hasExplicitPlan: false,
    hasExecutionRecord: studyHasExec,
    comparable: false,
    fulfillmentPercent: null,
  };

  // Revisões semanais: execução observada, plano explícito ausente.
  const reviewHasExec = facts.weeklyReviewCount > 0;
  const reviewItem: PlanningExecutionItem = {
    id: 'weekly-reviews',
    label: 'Revisões semanais registradas',
    definition:
      'Revisões semanais observadas no período. Sem meta explícita, planejamento não é inferido.',
    state: reviewHasExec ? 'not_planned' : 'insufficient_evidence',
    plannedValue: null,
    executedValue: reviewHasExec ? facts.weeklyReviewCount : null,
    unit: 'registros',
    period,
    source: ['weekly_reviews'],
    formula: 'executado = count(weekly_reviews in period); planejado = ausente',
    coverage: reviewHasExec ? 1 : 0,
    confidence: reviewHasExec ? 0.8 : 0.2,
    missing: [
      ...(reviewHasExec ? [] : ['revisões semanais no período']),
      'meta explícita de revisões',
    ],
    limitations: ['Sem meta explícita, não se calcula cumprimento.'],
    algorithmVersion: PLANNING_EXECUTION_ALGORITHM_VERSION,
    configuredCapacityValue: null,
    allocatedPlannedValue: null,
    hasExplicitPlan: false,
    hasExecutionRecord: reviewHasExec,
    comparable: false,
    fulfillmentPercent: null,
  };

  limitations.push(
    'Planejamento explícito só é considerado quando há compromisso/meta registrada; capacidade configurada é tratada separadamente.',
    'Percentuais são suprimidos quando bases/períodos/unidades não são equivalentes.',
    'Ausência de registro não é convertida em zero quando a cobertura é desconhecida.',
  );

  return {
    period,
    timezone,
    items: [taskItem, capItem, studyItem, reviewItem],
    limitations: [...new Set(limitations)],
    algorithmVersion: PLANNING_EXECUTION_ALGORITHM_VERSION,
  };
}
