import { useMemo } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { formatClock, formatToday } from '@/features/dashboard/format';
import { ExecutionSignals } from '@/features/execution/ExecutionSignals';
import {
  deriveCapacityRows,
  deriveDayIndicators,
  derivePriorityItems,
  greetingFor,
  safeInternalHref,
} from './model';
import { QuickCapture } from './QuickCapture';
import { currentCycleFrom, useQuickTaskActions, useToday } from './use-today';

interface TodayPageProps {
  readonly timezone: string;
}

const ACTION_CLASS =
  'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

function stateLabel(value: number | null, state: string): string {
  if (state === 'loading') return '…';
  if (state === 'unavailable') return '—';
  return new Intl.NumberFormat('pt-BR').format(value ?? 0);
}

export function TodayPage({ timezone }: TodayPageProps) {
  const today = useToday(timezone);
  const taskActions = useQuickTaskActions(today.reload);
  const now = useMemo(() => new Date(), []);
  const cycle = currentCycleFrom(today.strategy.data);

  const indicators = useMemo(
    () =>
      deriveDayIndicators({
        execution: today.execution.data,
        executionLoading: today.execution.loading,
        capacity: today.strategy.data?.capacity ?? null,
        capacityLoading: today.strategy.loading,
        alertCount: today.alerts.page.items.length,
        alertsLoading: today.alerts.loading,
      }),
    [
      today.execution.data,
      today.execution.loading,
      today.strategy.data,
      today.strategy.loading,
      today.alerts.page.items.length,
      today.alerts.loading,
    ],
  );
  const priorities = useMemo(
    () =>
      derivePriorityItems({
        execution: today.execution.data,
        tasks: today.tasks.data?.items ?? [],
        nextActions: today.nextActions.page.items,
        alerts: today.alerts.page.items,
        intelligence: today.intelligence.data,
      }),
    [
      today.execution.data,
      today.tasks.data,
      today.nextActions.page.items,
      today.alerts.page.items,
      today.intelligence.data,
    ],
  );
  const nextAction = priorities[0] ?? null;
  const otherPriorities = priorities.slice(1);
  const capacity = useMemo(
    () =>
      deriveCapacityRows(
        today.strategy.data?.capacity ?? null,
        today.profile.data ?? null,
        today.strategy.loading || today.profile.loading,
      ),
    [today.strategy.data, today.profile.data, today.strategy.loading, today.profile.loading],
  );

  const projects = today.execution.data?.projects ?? [];
  const goals = today.strategy.data?.availableGoals ?? [];

  return (
    <div className="space-y-8">
      <section aria-labelledby="today-title">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Centro de operação diário
        </p>
        <h2 id="today-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {greetingFor(timezone, now)}.
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Icon name="clock" size={15} />
          {formatToday(timezone, now)} · fuso {timezone}
        </p>
        {cycle !== null && (
          <p className="mt-2 text-sm text-muted-foreground">
            Ciclo ativo: <span className="text-foreground">{cycle.name}</span> · {cycle.startDate} a{' '}
            {cycle.endDate}
            {cycle.theme === null ? '' : ` · ${cycle.theme}`}
          </p>
        )}
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {today.updatedAt === null
            ? 'Atualização: aguardando resposta das fontes.'
            : `Dados atualizados às ${formatClock(today.updatedAt, timezone)} (fuso da conta).`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={today.reload}>
            <Icon name="refresh" size={16} />
            Atualizar
          </Button>
          <Link className={ACTION_CLASS} to="/revisao-diaria">
            Encerrar o dia
            <Icon name="arrow" size={15} />
          </Link>
        </div>
      </section>

      {today.strategy.message !== null && (
        <ErrorPanel
          title="Capacidade e ciclo"
          message={today.strategy.message}
          onRetry={today.strategy.reload}
        />
      )}
      {today.alerts.message !== null && (
        <ErrorPanel title="Alertas" message={today.alerts.message} onRetry={today.alerts.reload} />
      )}
      {today.intelligence.message !== null && (
        <ErrorPanel
          title="Inteligência"
          message={today.intelligence.message}
          onRetry={today.intelligence.reload}
        />
      )}

      <section aria-labelledby="day-indicators-title">
        <h3 id="day-indicators-title" className="text-base font-semibold">
          Visão geral do dia
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Indicadores sobre registros reais. Ausência de dado nunca aparece como zero.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {indicators.map((indicator) => (
            <li key={indicator.id} className="rounded-lg border border-border bg-card p-3">
              <span className="block text-xs text-muted-foreground">{indicator.label}</span>
              <span className="mt-1 block text-lg font-semibold tabular-nums">
                {stateLabel(indicator.value, indicator.state)}
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                {indicator.hint}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="today-next-action-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="today-next-action-title" className="text-base font-semibold">
              Próxima ação recomendada
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sugestão explicável baseada em dados disponíveis. Você decide o que fazer; nada é
              executado automaticamente.
            </p>
          </div>
          <Link className={ACTION_CLASS} to="/inteligencia/decisoes">
            Ver decisões
          </Link>
        </div>
        {taskActions.message !== null && (
          <p
            role="status"
            className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
          >
            {taskActions.message}
          </p>
        )}
        {taskActions.error !== null && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {taskActions.error}
          </p>
        )}
        {nextAction === null ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">Sem recomendação automática no momento</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Não encontrei evidência suficiente para priorizar uma ação específica. Você pode
              escolher manualmente uma tarefa, registrar uma atividade ou revisar seus objetivos.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className={ACTION_CLASS} to="/tarefas">
                Abrir tarefas
              </Link>
              <Link className={ACTION_CLASS} to="/objetivos">
                Abrir objetivos
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">
              Sugestão principal
            </p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-base font-medium">{nextAction.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{nextAction.source}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {nextAction.declaredPriority !== null && (
                  <span>Declarada: {nextAction.declaredPriority}</span>
                )}
                {nextAction.calculatedScore !== null && (
                  <span>Pontuação calculada: {nextAction.calculatedScore}</span>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {nextAction.detail}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className={ACTION_CLASS} to={safeInternalHref(nextAction.href, '/execucao')}>
                Abrir
                <Icon name="arrow" size={15} />
              </Link>
              {nextAction.taskId !== null &&
                nextAction.version !== null &&
                nextAction.taskStatus !== 'completed' &&
                nextAction.taskStatus !== 'cancelled' && (
                  <>
                    {nextAction.taskStatus === 'todo' && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={taskActions.busy}
                        onClick={() => {
                          const p = nextAction;
                          if (p != null && p.taskId != null && p.version != null)
                            void taskActions.start(p.taskId, p.version);
                        }}
                      >
                        Iniciar
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={taskActions.busy}
                      onClick={() => {
                        const p = nextAction;
                        if (p != null && p.taskId != null && p.version != null)
                          void taskActions.complete(p.taskId, p.version);
                      }}
                    >
                      Concluir
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={taskActions.busy}
                      onClick={() => {
                        const p = nextAction;
                        if (p != null && p.taskId != null && p.version != null)
                          void taskActions.postpone(p.taskId, p.version, today.today);
                      }}
                    >
                      Adiar 1 dia
                    </Button>
                  </>
                )}
              {nextAction.taskId !== null && nextAction.version === null && (
                <span className="self-center text-[11px] text-muted-foreground">
                  Versão indisponível: use o módulo de tarefas.
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="today-priorities-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="today-priorities-title" className="text-base font-semibold">
              Outras prioridades e sinais
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Itens adicionais com origem explícita. Prioridade declarada e pontuação calculada são
              campos distintos.
            </p>
          </div>
        </div>
        {otherPriorities.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {nextAction === null
              ? 'Nenhum sinal adicional no momento.'
              : 'Sem outras prioridades além da sugestão principal.'}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {otherPriorities.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.source}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {item.declaredPriority !== null && (
                      <span>Declarada: {item.declaredPriority}</span>
                    )}
                    {item.calculatedScore !== null && (
                      <span>Pontuação calculada: {item.calculatedScore}</span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className={ACTION_CLASS} to={safeInternalHref(item.href, '/execucao')}>
                    Abrir
                    <Icon name="arrow" size={15} />
                  </Link>
                  {item.taskId !== null &&
                    item.version !== null &&
                    item.taskStatus !== 'completed' &&
                    item.taskStatus !== 'cancelled' && (
                      <>
                        {item.taskStatus === 'todo' && (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={taskActions.busy}
                            onClick={() => {
                              if (item.taskId && item.version)
                                void taskActions.start(item.taskId, item.version);
                            }}
                          >
                            Iniciar
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={taskActions.busy}
                          onClick={() => {
                            if (item.taskId && item.version)
                              void taskActions.complete(item.taskId, item.version);
                          }}
                        >
                          Concluir
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={taskActions.busy}
                          onClick={() => {
                            if (item.taskId && item.version)
                              void taskActions.postpone(item.taskId, item.version, today.today);
                          }}
                        >
                          Adiar 1 dia
                        </Button>
                      </>
                    )}
                  {item.taskId !== null && item.version === null && (
                    <span className="self-center text-[11px] text-muted-foreground">
                      Versão indisponível: use o módulo de tarefas.
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="today-execution-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 id="today-execution-title" className="text-base font-semibold">
            Execução e dependências
          </h3>
          <Link className={ACTION_CLASS} to="/execucao">
            Abrir execução
          </Link>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          {today.execution.loading && today.execution.data === null ? (
            <LoadingPanel label="Carregando sinais de execução…" lines={3} />
          ) : today.execution.data === null ? (
            <EmptyState
              eyebrow="Indisponível"
              title="Sinais de execução indisponíveis"
              description="A consulta de execução não respondeu. Nenhum sinal foi assumido."
            />
          ) : (
            <ExecutionSignals data={today.execution.data} compact />
          )}
        </div>
      </section>

      <section aria-labelledby="today-capacity-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="today-capacity-title" className="text-base font-semibold">
              Capacidade da semana
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Declarado pelo usuário versus compromisso derivado de estimativas. Nenhum horário foi
              agendado automaticamente.
            </p>
          </div>
          <Link className={ACTION_CLASS} to="/capacidade">
            Configurar capacidade
          </Link>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          {capacity.limitation !== null ? (
            <p className="text-sm text-muted-foreground">{capacity.limitation}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {capacity.rows.map((row) => (
                <li key={row.label} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="mt-1 text-base font-semibold tabular-nums">{row.value}</p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {row.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {capacity.warnings.length > 0 && (
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {capacity.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="today-capture-title">
        <h3 id="today-capture-title" className="text-base font-semibold">
          Registro rápido
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Contratos existentes de tarefas e estudos. Proveniência, timezone, validação e auditoria
          permanecem na API.
        </p>
        <div className="mt-4">
          <QuickCapture
            today={today.today}
            timezone={timezone}
            projects={projects}
            goals={goals}
            onCreated={today.reload}
          />
        </div>
      </section>

      <section aria-labelledby="today-context-title">
        <h3 id="today-context-title" className="text-base font-semibold">
          Contexto e histórico
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className={ACTION_CLASS} to="/revisao">
            Revisão semanal
          </Link>
          <Link className={ACTION_CLASS} to="/planejamento">
            Planejamento
          </Link>
          <Link className={ACTION_CLASS} to="/inteligencia/alertas">
            Alertas de decisão
          </Link>
          <Link className={ACTION_CLASS} to="/tarefas">
            Todas as tarefas
          </Link>
        </div>
      </section>
    </div>
  );
}
