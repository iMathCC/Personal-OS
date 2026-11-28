import { useMemo } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Icon } from '@/components/icons';
import type { AccountSummary } from '@/features/auth/use-session';
import { DecisionDashboardView } from '@/features/decision/DecisionDashboardView';
import { ExecutionSignals } from '@/features/execution/ExecutionSignals';
import { useExecutionDashboard } from '@/features/execution/use-execution';
import { NAVIGATION_ITEMS } from '@/lib/navigation';
import { AreaCard } from './AreaCard';
import { formatClock, formatToday } from './format';
import { coverageLabel, deriveAreaStatus, deriveDataCoverage } from './status';
import { useDashboard } from './use-dashboard';

interface DashboardPageProps {
  account: AccountSummary;
}

const CYCLE = 'Coletar → Integrar → Analisar → Projetar → Decidir → Executar → Avaliar';

export function DashboardPage({ account }: DashboardPageProps) {
  const { state, reload } = useDashboard(account.user.timezone);
  // Consulta separada: uma falha de Execução não altera o estado do dashboard central.
  const execution = useExecutionDashboard(account.user.timezone);
  const today = useMemo(() => new Date(), []);
  const health = state.status === 'ready' ? state.health : null;
  const studies = state.status === 'ready' ? state.studies : null;
  const goals = state.status === 'ready' ? state.goals : null;
  const life = state.status === 'ready' ? state.life : null;
  const executionData = execution.data;
  const executionContext =
    executionData === null
      ? {}
      : {
          execution: {
            activeProjects: executionData.signals.activeProjects,
            taskSignals:
              executionData.signals.executableTasks +
              executionData.signals.overdueTasks +
              executionData.signals.blockedTasks +
              executionData.signals.completedTasksToday +
              executionData.signals.dueToday,
            projects: executionData.projects.length,
          },
        };
  const areaContext = {
    health,
    counts: account.counts,
    ...(studies === null ? {} : { studies: { sessionCount: studies.sessionCount } }),
    ...(goals === null ? {} : { goals: { total: goals.summary.total } }),
    ...executionContext,
    loading: state.status === 'loading',
  };
  const coverage = deriveDataCoverage(areaContext, execution.loading);
  const firstName = account.user.displayName.trim().split(/\s+/u)[0] || account.user.displayName;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Visão geral
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Olá, {firstName}.
        </h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="clock" size={15} />
          {formatToday(account.user.timezone, today)}
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Entenda onde você está, de onde veio e qual é o próximo passo. Uma área para fechar o
          ciclo: <span className="text-foreground/80">{CYCLE}</span>.
        </p>
      </section>

      <section aria-labelledby="areas-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="areas-title" className="text-base font-semibold">
              Áreas do sistema
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Estado derivado dos módulos disponíveis e dos dados realmente carregados.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {NAVIGATION_ITEMS.map((item) => (
            <AreaCard key={item.key} item={item} status={deriveAreaStatus(item, areaContext)} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="coverage-title"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2 id="coverage-title" className="text-sm font-semibold">
          Cobertura dos dados
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fontes consultadas nesta visão. Indisponível nunca é exibido como zero.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {coverage.map((item) => (
            <li
              key={item.key}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
            >
              {item.label}:{' '}
              <span className="font-medium text-foreground">{coverageLabel(item.state)}</span>
            </li>
          ))}
          <li className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
            Painel integrado:{' '}
            <span className="font-medium text-foreground">
              {state.status === 'loading'
                ? 'carregando'
                : life !== null
                  ? 'disponível'
                  : 'indisponível'}
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="integrated-title" className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            Visão integrada
          </p>
          <h2 id="integrated-title" className="mt-2 text-base font-semibold">
            Situação pessoal com evidência
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Dados observados, valores calculados, inferências e ausências são identificados
            explicitamente. Nenhuma causalidade é afirmada.
          </p>
        </div>
        {state.status === 'loading' && (
          <LoadingPanel label="Carregando visão integrada…" lines={4} />
        )}
        {state.status === 'ready' && life === null && (
          <EmptyState
            eyebrow="Indisponível"
            title="Visão integrada indisponível"
            description="O painel integrado não respondeu. Os resumos por módulo continuam disponíveis abaixo quando houver dados."
          />
        )}
        {life !== null && <DecisionDashboardView dashboard={life} />}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="goals-title">
          <h2 id="goals-title" className="text-base font-semibold">
            Objetivos
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O que você está construindo e por quê.
          </p>
          <div className="mt-4">
            {state.status === 'loading' && <LoadingPanel label="Carregando objetivos…" lines={2} />}
            {state.status === 'error' && (
              <ErrorPanel
                title="Objetivos indisponíveis"
                message={state.message}
                onRetry={reload}
              />
            )}
            {goals === null && state.status === 'ready' && (
              <EmptyState
                eyebrow="Indisponível"
                title="Não foi possível consultar os objetivos"
                description="O restante da visão geral continua disponível. Tente novamente para carregar o painel de objetivos."
              />
            )}
            {goals !== null && goals.summary.total === 0 && (
              <EmptyState
                eyebrow="Sem dados"
                title="Nenhum objetivo registrado"
                description="Cadastre um objetivo para acompanhar horizontes, prazos e progresso a partir de dados reais."
                action={
                  <Link
                    to="/objetivos"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Abrir Objetivos
                    <Icon name="arrow" size={15} />
                  </Link>
                }
              />
            )}
            {goals !== null && goals.summary.total > 0 && (
              <>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {goals.attention.slice(0, 3).map((item) => (
                    <li key={item.id} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{item.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          prioridade {item.score}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.reasons[0]?.message ?? 'Sem sinais registrados.'}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {goals.summary.active} ativos · {goals.summary.achieved} concluídos ·{' '}
                  {goals.summary.overdue} com prazo vencido.
                </p>
                <Link
                  to="/objetivos"
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ver objetivos
                  <Icon name="arrow" size={15} />
                </Link>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby="studies-title">
          <h2 id="studies-title" className="text-base font-semibold">
            Atividade de estudos
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sessões registradas nos últimos 30 dias, vindas da API.
          </p>
          <div className="mt-4">
            {state.status === 'loading' && <LoadingPanel label="Carregando atividade…" lines={2} />}
            {state.status === 'error' && (
              <ErrorPanel title="Atividade indisponível" message={state.message} onRetry={reload} />
            )}
            {studies !== null && studies.recentSessions.length === 0 && (
              <EmptyState
                eyebrow="Sem dados"
                title="Nenhuma sessão registrada"
                description="Nenhuma sessão de estudo foi registrada nos últimos 30 dias. Esta área mostra apenas registros reais."
              />
            )}
            {studies !== null && studies.recentSessions.length > 0 && (
              <>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {studies.recentSessions.map((session) => (
                    <li key={session.id} className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-medium">{session.topic}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{session.localDate}</p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-foreground/80">
                        {session.durationMinutes} min
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {studies.sessionCount} sessões · {studies.daysStudied} dias ·{' '}
                  {studies.totalMinutes} min no período.
                </p>
                <Link
                  to="/estudos"
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ver estudos
                  <Icon name="arrow" size={15} />
                </Link>
              </>
            )}
          </div>
        </section>
      </div>

      <section aria-labelledby="execution-title">
        <h2 id="execution-title" className="text-base font-semibold">
          Execução
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sinais calculados pela API a partir de projetos e tarefas. Exibidos apenas quando a
          consulta responde; nenhuma ação é recomendada automaticamente.
        </p>
        <div className="mt-4">
          {execution.loading && <LoadingPanel label="Carregando sinais de execução…" lines={2} />}
          {!execution.loading && executionData === null && (
            <EmptyState
              eyebrow="Indisponível"
              title="Sinais de execução não carregados"
              description="A consulta de Execução não respondeu. As demais áreas da visão geral continuam disponíveis."
            />
          )}
          {!execution.loading && executionData !== null && (
            <>
              <ExecutionSignals data={executionData} compact />
              <Link
                to="/execucao"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver execução
                <Icon name="arrow" size={15} />
              </Link>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="attention-title">
        <h2 id="attention-title" className="text-base font-semibold">
          Atenção e prioridades
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sinais que merecem decisão, com origem e contexto explícitos.
        </p>
        <div className="mt-4">
          {state.status === 'loading' && <LoadingPanel label="Consultando o estado da API…" />}
          {state.status === 'error' && (
            <ErrorPanel
              title="Não foi possível carregar o estado da API"
              message={state.message}
              onRetry={reload}
            />
          )}
          {health !== null && (health.status !== 'ok' || health.db !== 'ok') && (
            <div
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-5"
              role="alert"
            >
              <h3 className="text-sm font-semibold text-destructive">API em estado degradado</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                O banco de dados respondeu como indisponível na última verificação às{' '}
                {formatClock(health.time, account.user.timezone)}. Nenhuma recomendação é gerada a
                partir deste sinal.
              </p>
            </div>
          )}
          {health !== null &&
            health.status === 'ok' &&
            health.db === 'ok' &&
            goals !== null &&
            goals.attention.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {goals.attention.slice(0, 5).map((item) => (
                  <li key={item.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <span className="text-xs text-muted-foreground">
                        nível {item.level} · pontuação {item.score}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {item.reasons.map((reason) => (
                        <li key={reason.code} className="text-xs text-muted-foreground">
                          {reason.message}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Regra {goals.algorithms.attention}. Priorização determinística, não
                      diagnóstico.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          {health !== null &&
            health.status === 'ok' &&
            health.db === 'ok' &&
            (goals === null || goals.attention.length === 0) && (
              <EmptyState
                eyebrow="Sem sinais"
                title="Nada a destacar com os dados disponíveis"
                description={
                  goals === null
                    ? 'Os dados de Objetivos não puderam ser carregados nesta consulta. Nenhuma prioridade é inferida sem dados.'
                    : 'Não há objetivos ativos ou pausados com sinais registrados. Nenhuma recomendação é inventada a partir de dados ausentes.'
                }
              />
            )}
        </div>
        <Link
          to="/inteligencia/alertas"
          className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver alertas e recomendações de decisão
          <Icon name="arrow" size={15} />
        </Link>
      </section>
    </div>
  );
}
