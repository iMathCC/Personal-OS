import { useMemo } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Icon } from '@/components/icons';
import type { AccountSummary } from '@/features/auth/use-session';
import { NAVIGATION_ITEMS } from '@/lib/navigation';
import { AreaCard } from './AreaCard';
import { formatClock, formatToday } from './format';
import { deriveAreaStatus } from './status';
import { useDashboard } from './use-dashboard';

interface DashboardPageProps {
  account: AccountSummary;
}

const CYCLE = 'Coletar → Integrar → Analisar → Projetar → Decidir → Executar → Avaliar';

export function DashboardPage({ account }: DashboardPageProps) {
  const { state, reload } = useDashboard(account.user.timezone);
  const today = useMemo(() => new Date(), []);
  const health = state.status === 'ready' ? state.health : null;
  const studies = state.status === 'ready' ? state.studies : null;
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
            <AreaCard
              key={item.key}
              item={item}
              status={deriveAreaStatus(item, {
                health,
                counts: account.counts,
                ...(studies === null ? {} : { studies: { sessionCount: studies.sessionCount } }),
                loading: state.status === 'loading',
              })}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="goals-title" className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 id="goals-title" className="text-base font-semibold">
            Objetivos
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O que você está construindo e por quê.
          </p>
          <div className="mt-4">
            <EmptyState
              eyebrow="Estrutura indisponível"
              title="Nenhum objetivo para mostrar"
              description="Ainda não existe estrutura funcional de objetivos nesta fase. Quando o módulo existir, esta área mostrará horizontes, prazos, critérios de sucesso e progresso — sempre a partir de dados registrados, nunca de exemplos."
              action={
                <Link
                  to="/objetivos"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ver área planejada
                  <Icon name="arrow" size={15} />
                </Link>
              }
            />
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold">Atividade de estudos</h2>
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
          {health !== null && health.status === 'ok' && health.db === 'ok' && (
            <EmptyState
              eyebrow="Sem sinais"
              title="Nada a destacar com os dados disponíveis"
              description="A API respondeu normalmente e os registros de estudos estão disponíveis, mas nenhuma recomendação ou prioridade é gerada automaticamente a partir deles. Alertas exigirão uma decisão explícita de regras em uma entrega futura."
            />
          )}
        </div>
      </section>
    </div>
  );
}
