import { businessRule, validationError } from './errors';
import { dayCount, isLocalDate } from './studies';

/** Regras explícitas e versionadas — nenhuma recomendação opaca. */
export const GOAL_PRIORITIZATION_ALGORITHM = 'goal-attention-v1';
export const GOAL_STALE_DAYS = 14;
export const GOAL_VERY_STALE_DAYS = 30;
export const GOAL_DUE_SOON_DAYS = 7;
export const GOAL_LOW_PROGRESS_PERCENT = 50;
export const GOAL_LOW_PROGRESS_WINDOW_DAYS = 14;

export type GoalStatus = 'draft' | 'active' | 'paused' | 'achieved' | 'cancelled';
export type AttentionLevel = 'none' | 'low' | 'medium' | 'high';
export type AttentionReasonCode =
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_SOON'
  | 'HIGH_PRIORITY'
  | 'STALE'
  | 'LOW_PROGRESS_NEAR_DEADLINE'
  | 'PENDING_MILESTONES';

export interface AttentionReason {
  readonly code: AttentionReasonCode;
  readonly message: string;
}

export interface GoalAttentionInput {
  readonly id: string;
  readonly title: string;
  readonly priority: number;
  readonly status: GoalStatus;
  readonly targetDate: string | null;
  /** Instante ISO-8601 com ms; nunca é derivado do fuso do servidor. */
  readonly lastUpdatedAt: string;
  /** `null` significa ausência de dados, nunca zero. */
  readonly progressPercent: number | null;
  readonly pendingMilestones: number;
}

export interface GoalAttention extends GoalAttentionInput {
  readonly score: number;
  readonly level: AttentionLevel;
  readonly reasons: readonly AttentionReason[];
  readonly algorithmVersion: string;
}

export interface AttentionClock {
  /** Instante atual em ms desde a época; injetado pelo chamador. */
  readonly nowMs: number;
  /** `local_date` no fuso do usuário; nunca calculado aqui. */
  readonly today: string;
}

function assertAttentionInput(goal: GoalAttentionInput, today: string): void {
  if (!Number.isInteger(goal.priority) || goal.priority < 1 || goal.priority > 5) {
    throw validationError('Prioridade de objetivo inválida.');
  }
  if (goal.targetDate !== null && !isLocalDate(goal.targetDate)) {
    throw validationError('Prazo de objetivo inválido.');
  }
  if (!isLocalDate(today)) throw validationError('Data atual inválida.');
  if (Number.isNaN(Date.parse(goal.lastUpdatedAt))) {
    throw validationError('Data de atualização inválida.');
  }
  if (
    goal.progressPercent !== null &&
    (!Number.isFinite(goal.progressPercent) ||
      goal.progressPercent < 0 ||
      goal.progressPercent > 100)
  ) {
    throw validationError('Progresso de objetivo inválido.');
  }
  if (!Number.isInteger(goal.pendingMilestones) || goal.pendingMilestones < 0) {
    throw validationError('Contagem de marcos inválida.');
  }
}

/** Dias inteiros entre duas datas locais; resultado negativo se `to` antecede `from`. */
export function daysBetweenLocal(from: string, to: string): number {
  if (!isLocalDate(from) || !isLocalDate(to)) throw validationError('Data local inválida.');
  const forward = dayCount(from, to);
  if (forward > 0) return forward - 1;
  return -(dayCount(to, from) - 1);
}

/** Dias completos desde um instante, usando apenas o relógio injetado. */
export function daysSinceInstant(instant: string, nowMs: number): number {
  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed) || !Number.isFinite(nowMs)) {
    throw validationError('Instante inválido.');
  }
  return Math.max(0, Math.floor((nowMs - parsed) / 86_400_000));
}

function levelFor(score: number): AttentionLevel {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return score > 0 ? 'low' : 'none';
}

/**
 * Pontuação determinística: cada ponto vem de um fato registrado e de uma
 * regra declarada. O resultado é uma priorização, nunca um diagnóstico de risco.
 */
export function scoreGoalAttention(goal: GoalAttentionInput, clock: AttentionClock): GoalAttention {
  assertAttentionInput(goal, clock.today);
  const base: GoalAttention = {
    ...goal,
    score: 0,
    level: 'none',
    reasons: [],
    algorithmVersion: GOAL_PRIORITIZATION_ALGORITHM,
  };
  if (goal.status !== 'active' && goal.status !== 'paused') return base;

  let score = (goal.priority - 1) * 4;
  const reasons: AttentionReason[] = [];
  if (goal.priority >= 4) {
    reasons.push({
      code: 'HIGH_PRIORITY',
      message: `Prioridade ${goal.priority} definida por você.`,
    });
  }

  if (goal.targetDate !== null) {
    const remaining = daysBetweenLocal(clock.today, goal.targetDate);
    if (remaining < 0) {
      const overdueDays = -remaining;
      score += Math.min(40, overdueDays * 3);
      reasons.push({
        code: 'OVERDUE',
        message: `Prazo vencido há ${overdueDays} ${overdueDays === 1 ? 'dia' : 'dias'}.`,
      });
    } else if (remaining === 0) {
      score += 14;
      reasons.push({ code: 'DUE_TODAY', message: 'O prazo é hoje.' });
    } else if (remaining <= GOAL_DUE_SOON_DAYS) {
      score += 12;
      reasons.push({
        code: 'DUE_SOON',
        message: `Faltam ${remaining} ${remaining === 1 ? 'dia' : 'dias'} para o prazo.`,
      });
    }
    if (
      goal.progressPercent !== null &&
      goal.progressPercent < GOAL_LOW_PROGRESS_PERCENT &&
      remaining >= 0 &&
      remaining <= GOAL_LOW_PROGRESS_WINDOW_DAYS
    ) {
      score += 8;
      reasons.push({
        code: 'LOW_PROGRESS_NEAR_DEADLINE',
        message: `Progresso registrado de ${goal.progressPercent}% com prazo próximo.`,
      });
    }
  }

  const staleDays = daysSinceInstant(goal.lastUpdatedAt, clock.nowMs);
  if (staleDays >= GOAL_VERY_STALE_DAYS) {
    score += 16;
    reasons.push({
      code: 'STALE',
      message: `Sem atualização registrada há ${staleDays} dias.`,
    });
  } else if (staleDays >= GOAL_STALE_DAYS) {
    score += 8;
    reasons.push({
      code: 'STALE',
      message: `Sem atualização registrada há ${staleDays} dias.`,
    });
  }

  if (goal.pendingMilestones > 0) {
    score += Math.min(10, goal.pendingMilestones * 3);
    reasons.push({
      code: 'PENDING_MILESTONES',
      message: `${goal.pendingMilestones} ${goal.pendingMilestones === 1 ? 'marco pendente' : 'marcos pendentes'}.`,
    });
  }

  reasons.sort((a, b) => a.code.localeCompare(b.code));
  return {
    ...goal,
    score: Math.min(100, score),
    level: levelFor(score),
    reasons,
    algorithmVersion: GOAL_PRIORITIZATION_ALGORITHM,
  };
}

export interface GoalForOverview extends GoalAttentionInput {
  readonly areaKey: string;
  readonly areaName: string;
}

export interface AreaProgress {
  readonly areaKey: string;
  readonly areaName: string;
  readonly active: number;
  readonly achieved: number;
  readonly overdue: number;
  /** Média apenas dos objetivos com progresso conhecido; `null` se nenhum. */
  readonly averageProgress: number | null;
  readonly knownProgressCount: number;
}

export interface GoalOverview {
  readonly counts: {
    readonly active: number;
    readonly paused: number;
    readonly achieved: number;
    readonly cancelled: number;
    readonly draft: number;
    readonly inProgress: number;
    readonly overdue: number;
    readonly stale: number;
    readonly total: number;
  };
  readonly progress: {
    readonly overall: number | null;
    readonly knownCount: number;
    readonly activeCount: number;
  };
  readonly byArea: readonly AreaProgress[];
  readonly deadlines: readonly GoalForOverview[];
  readonly attention: readonly (GoalForOverview & GoalAttention)[];
  readonly truncated: boolean;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/** Consolida cada objetivo uma única vez; a lista de entrada já é exclusiva. */
export function buildGoalOverview(
  goals: readonly GoalForOverview[],
  clock: AttentionClock,
  truncated = false,
): GoalOverview {
  const seen = new Set<string>();
  for (const goal of goals) {
    if (seen.has(goal.id)) throw businessRule('Objetivo duplicado na consolidação.');
    seen.add(goal.id);
    assertAttentionInput(goal, clock.today);
  }

  const active = goals.filter((goal) => goal.status === 'active');
  const known = active.filter((goal) => goal.progressPercent !== null);
  const areaMap = new Map<
    string,
    {
      areaKey: string;
      areaName: string;
      active: number;
      achieved: number;
      overdue: number;
      progressSum: number;
      averageProgress: number | null;
      knownProgressCount: number;
    }
  >();
  for (const goal of goals) {
    const current = areaMap.get(goal.areaKey) ?? {
      areaKey: goal.areaKey,
      areaName: goal.areaName,
      active: 0,
      achieved: 0,
      overdue: 0,
      progressSum: 0,
      averageProgress: null,
      knownProgressCount: 0,
    };
    if (goal.status === 'active') current.active += 1;
    if (goal.status === 'achieved') current.achieved += 1;
    if (
      goal.status === 'active' &&
      goal.targetDate !== null &&
      daysBetweenLocal(clock.today, goal.targetDate) < 0
    ) {
      current.overdue += 1;
    }
    // A média já arredondada não pode ser reutilizada como soma: isso amplificaria o valor a cada meta.
    if (goal.progressPercent !== null && goal.status === 'active') {
      current.progressSum += goal.progressPercent;
      current.knownProgressCount += 1;
      current.averageProgress =
        Math.round((current.progressSum / current.knownProgressCount) * 10) / 10;
    }
    areaMap.set(goal.areaKey, current);
  }

  const deadlineCandidates = active.filter(
    (goal) => goal.targetDate !== null && daysBetweenLocal(clock.today, goal.targetDate) >= 0,
  );
  const deadlines = [...deadlineCandidates]
    .sort(
      (a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? '') || a.id.localeCompare(b.id),
    )
    .slice(0, 5)
    .map((goal) => ({ ...goal }));

  const attentionCandidates = goals
    .filter((goal) => goal.status === 'active' || goal.status === 'paused')
    .map((goal) => ({ ...goal, ...scoreGoalAttention(goal, clock) }));
  const attention = [...attentionCandidates]
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 8);

  return {
    counts: {
      active: active.length,
      paused: goals.filter((goal) => goal.status === 'paused').length,
      achieved: goals.filter((goal) => goal.status === 'achieved').length,
      cancelled: goals.filter((goal) => goal.status === 'cancelled').length,
      draft: goals.filter((goal) => goal.status === 'draft').length,
      inProgress: active.filter(
        (goal) =>
          goal.progressPercent !== null && goal.progressPercent > 0 && goal.progressPercent < 100,
      ).length,
      overdue: active.filter(
        (goal) => goal.targetDate !== null && daysBetweenLocal(clock.today, goal.targetDate) < 0,
      ).length,
      stale: active.filter(
        (goal) => daysSinceInstant(goal.lastUpdatedAt, clock.nowMs) >= GOAL_STALE_DAYS,
      ).length,
      total: goals.length,
    },
    progress: {
      overall: average(known.map((goal) => goal.progressPercent ?? 0)),
      knownCount: known.length,
      activeCount: active.length,
    },
    byArea: [...areaMap.values()].sort(
      (a, b) => b.active - a.active || a.areaKey.localeCompare(b.areaKey),
    ),
    deadlines,
    attention,
    truncated:
      truncated || deadlineCandidates.length > deadlines.length || attentionCandidates.length > 8,
  };
}

export interface MilestoneForTimeline {
  readonly id: string;
  readonly goalId: string;
  readonly title: string;
  readonly dueDate: string | null;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export interface UpcomingMilestone extends MilestoneForTimeline {
  readonly daysUntilDue: number | null;
}

export function buildMilestoneTimeline(
  milestones: readonly MilestoneForTimeline[],
  today: string,
  limit = 5,
): UpcomingMilestone[] {
  if (!isLocalDate(today)) throw validationError('Data atual inválida.');
  return milestones
    .filter(
      (milestone) =>
        (milestone.status === 'pending' || milestone.status === 'in_progress') &&
        milestone.dueDate !== null,
    )
    .map((milestone) => ({
      ...milestone,
      daysUntilDue: daysBetweenLocal(today, milestone.dueDate ?? today),
    }))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Conta cada objetivo uma única vez a partir da lista de marcos já filtrada. */
export function countPendingMilestones(
  milestones: readonly MilestoneForTimeline[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const milestone of milestones) {
    if (milestone.status !== 'pending' && milestone.status !== 'in_progress') continue;
    counts.set(milestone.goalId, (counts.get(milestone.goalId) ?? 0) + 1);
  }
  return counts;
}

export interface StudySignalSample {
  readonly localDate: string;
  readonly valueNum: number;
}

export interface StudySignal {
  readonly minutes: number;
  readonly sessionCount: number;
  readonly lastActivityDate: string | null;
}

/** Soma observações já filtradas e não contabiliza o mesmo registro duas vezes. */
export function summarizeStudySignal(
  samples: readonly StudySignalSample[],
  range: { from: string; to: string },
): StudySignal {
  let minutes = 0;
  let sessionCount = 0;
  let lastActivityDate: string | null = null;
  for (const sample of samples) {
    if (!isLocalDate(sample.localDate)) throw validationError('Data de observação inválida.');
    if (!Number.isFinite(sample.valueNum) || sample.valueNum < 0) {
      throw businessRule('Valor de observação inválido.');
    }
    if (sample.localDate < range.from || sample.localDate > range.to) continue;
    minutes += sample.valueNum;
    sessionCount += 1;
    if (lastActivityDate === null || sample.localDate > lastActivityDate) {
      lastActivityDate = sample.localDate;
    }
  }
  return { minutes, sessionCount, lastActivityDate };
}
