import { useCallback, useMemo, useState } from 'react';
import type {
  CapacityProfileDto,
  DecisionAlertDto,
  DecisionNextActionDto,
  IntelligenceDashboardData,
  PlanningCycleDto,
  StrategyDashboardDto,
  TaskDto,
} from '@personal-os/shared';
import { decisionApi, intelligenceApi, planningApi, tasksApi, type Page } from '@/lib/api';
import {
  useDecisionPage,
  useDecisionRequest,
  type DecisionPageController,
  type DecisionRequestController,
} from '@/features/decision/use-decision';
import {
  useExecutionDashboard,
  type ExecutionDashboardController,
} from '@/features/execution/use-execution';
import { localDateIn } from '@/features/studies/time';
import { weekStartFor } from '@/features/review/time';
import { addLocalDays } from './model';

function latestInstant(values: readonly (string | null | undefined)[]): string | null {
  const instants = values.filter((value): value is string => typeof value === 'string');
  if (instants.length === 0) return null;
  return instants.reduce((latest, value) => (value > latest ? value : latest));
}

export interface TodayController {
  /** Data local da conta, nunca a data UTC do servidor. */
  readonly today: string;
  readonly weekStart: string;
  readonly execution: ExecutionDashboardController;
  readonly intelligence: DecisionRequestController<IntelligenceDashboardData>;
  readonly strategy: DecisionRequestController<StrategyDashboardDto>;
  readonly profile: DecisionRequestController<CapacityProfileDto | null>;
  readonly tasks: DecisionRequestController<Page<TaskDto>>;
  readonly alerts: DecisionPageController<DecisionAlertDto>;
  readonly nextActions: DecisionPageController<DecisionNextActionDto>;
  readonly updatedAt: string | null;
  readonly reload: () => void;
}

/** Compõe leituras existentes; nenhum endpoint, cálculo ou dado novo é criado. */
export function useToday(timezone: string): TodayController {
  const today = useMemo(() => localDateIn(timezone, new Date()), [timezone]);
  const weekStart = weekStartFor(today);
  const execution = useExecutionDashboard(timezone, { date: today });

  const loadIntelligence = useCallback(
    (signal: AbortSignal) => intelligenceApi.dashboard({}, signal),
    [],
  );
  const loadStrategy = useCallback((signal: AbortSignal) => planningApi.dashboard(signal), []);
  const loadProfile = useCallback((signal: AbortSignal) => planningApi.capacityProfile(signal), []);
  const loadTasks = useCallback((signal: AbortSignal) => tasksApi.list({ limit: 200 }, signal), []);
  const loadAlerts = useCallback(
    (cursor: string | undefined, signal?: AbortSignal) =>
      decisionApi.alerts({ limit: 20, ...(cursor === undefined ? {} : { cursor }) }, signal),
    [],
  );
  const loadNextActions = useCallback(
    (cursor: string | undefined, signal?: AbortSignal) =>
      decisionApi.nextActions({ limit: 10, ...(cursor === undefined ? {} : { cursor }) }, signal),
    [],
  );

  const intelligence = useDecisionRequest(
    loadIntelligence,
    `today:intelligence:${weekStart}`,
    'Não foi possível carregar inteligência para o dia.',
  );
  const strategy = useDecisionRequest(
    loadStrategy,
    `today:strategy:${weekStart}`,
    'Não foi possível carregar capacidade e ciclo.',
  );
  const profile = useDecisionRequest(
    loadProfile,
    `today:profile:${weekStart}`,
    'Não foi possível carregar o perfil de capacidade.',
  );
  const tasks = useDecisionRequest(
    loadTasks,
    `today:tasks:${today}`,
    'Não foi possível carregar tarefas para execução rápida.',
  );
  const alerts = useDecisionPage(
    loadAlerts,
    `today:alerts:${today}`,
    'Não foi possível carregar alertas.',
  );
  const nextActions = useDecisionPage(
    loadNextActions,
    `today:actions:${today}`,
    'Não foi possível carregar próximas ações.',
  );

  const reload = useCallback(() => {
    execution.reload();
    intelligence.reload();
    strategy.reload();
    profile.reload();
    tasks.reload();
    alerts.reload();
    nextActions.reload();
  }, [execution, intelligence, strategy, profile, tasks, alerts, nextActions]);

  const updatedAt = useMemo(
    () =>
      latestInstant([
        execution.data?.generatedAt,
        intelligence.data?.generatedAt,
        strategy.data?.generatedAt,
      ]),
    [execution.data, intelligence.data, strategy.data],
  );

  return {
    today,
    weekStart,
    execution,
    intelligence,
    strategy,
    profile,
    tasks,
    alerts,
    nextActions,
    updatedAt,
    reload,
  };
}

export function currentCycleFrom(strategy: StrategyDashboardDto | null): PlanningCycleDto | null {
  return strategy?.currentCycle ?? null;
}

export interface QuickTaskActionsController {
  readonly busy: boolean;
  readonly message: string | null;
  readonly error: string | null;
  readonly complete: (taskId: string, version: number) => Promise<void>;
  readonly start: (taskId: string, version: number) => Promise<void>;
  readonly postpone: (taskId: string, version: number, today: string) => Promise<void>;
}

/** Ações rápidas por contratos existentes: Idempotency-Key e If-Match preservados. */
export function useQuickTaskActions(onSuccess: () => void): QuickTaskActionsController {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>): Promise<void> => {
      setBusy(true);
      setMessage(null);
      setError(null);
      try {
        await fn();
        setMessage(label);
        onSuccess();
      } catch (cause: unknown) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'A ação não foi concluída. Recarregue os dados e tente novamente.',
        );
      } finally {
        setBusy(false);
      }
    },
    [onSuccess],
  );

  const complete = useCallback(
    (taskId: string, version: number) =>
      run('Tarefa concluída. Os indicadores foram atualizados.', () =>
        tasksApi.complete(taskId, version, crypto.randomUUID()).then(() => undefined),
      ),
    [run],
  );

  const start = useCallback(
    (taskId: string, version: number) =>
      run('Tarefa iniciada. O status foi atualizado.', () =>
        tasksApi
          .update(taskId, { status: 'in_progress', version }, crypto.randomUUID(), version)
          .then(() => undefined),
      ),
    [run],
  );

  const postpone = useCallback(
    (taskId: string, version: number, today: string) =>
      run(`Tarefa adiada para ${addLocalDays(today, 1)}.`, () =>
        tasksApi
          .update(
            taskId,
            { dueDate: addLocalDays(today, 1), version },
            crypto.randomUUID(),
            version,
          )
          .then(() => undefined),
      ),
    [run],
  );

  return { busy, message, error, complete, start, postpone };
}

/** Compatibilidade: conclusão rápida isolada. */
export function useQuickComplete(onSuccess: () => void) {
  const actions = useQuickTaskActions(onSuccess);
  return {
    busy: actions.busy,
    message: actions.message,
    error: actions.error,
    complete: actions.complete,
  };
}
