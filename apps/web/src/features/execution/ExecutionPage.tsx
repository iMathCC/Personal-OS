import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { Button } from '@/components/ui/button';
import type { AccountSummary } from '@/features/auth/use-session';
import { ExecutionSignals } from './ExecutionSignals';
import { timelineInstant, timelineKindLabel } from './format';
import { useExecution } from './use-execution';

interface ExecutionPageProps {
  account: AccountSummary;
}

const FIELD_CLASS = 'mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3';

export function ExecutionPage({ account }: ExecutionPageProps) {
  const {
    date,
    projectId,
    range,
    projects,
    dashboard,
    timeline,
    loadingMore,
    setDate,
    setProjectId,
    setRange,
    reloadTimeline,
    loadMoreTimeline,
  } = useExecution(account.user.timezone);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Núcleo operacional
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Execução</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Sinais determinísticos derivados de projetos, tarefas e marcos registrados. A próxima ação
          é explicada pelas regras aplicadas; a decisão e a execução continuam humanas. Fuso da
          conta: {account.user.timezone}.
        </p>
      </div>

      <section
        aria-label="Filtros de execução"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block text-sm">
          <span className="text-muted-foreground">Data do painel</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Projeto</span>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Todos os projetos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Linha do tempo de</span>
          <input
            type="date"
            value={range.from}
            onChange={(event) => setRange({ ...range, from: event.target.value })}
            className={FIELD_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Linha do tempo até</span>
          <input
            type="date"
            min={range.from}
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
            className={FIELD_CLASS}
          />
        </label>
      </section>

      <section aria-labelledby="execution-dashboard-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="execution-dashboard-title" className="text-base font-semibold">
            Painel de execução
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={dashboard.reload}
            className="min-h-11"
          >
            Atualizar
          </Button>
        </div>
        <div className="mt-3">
          {dashboard.loading && <LoadingPanel label="Carregando sinais de execução…" />}
          {!dashboard.loading && dashboard.data === null && (
            <EmptyState
              eyebrow="Indisponível"
              title="Sinais de execução indisponíveis"
              description="A consulta não retornou dados nesta tentativa. As demais áreas permanecem utilizáveis; nenhum sinal é inferido sem resposta da API."
              action={
                <Button type="button" onClick={dashboard.reload} className="min-h-11">
                  Tentar novamente
                </Button>
              }
            />
          )}
          {!dashboard.loading && dashboard.data !== null && (
            <ExecutionSignals data={dashboard.data} />
          )}
        </div>
      </section>

      <section aria-labelledby="execution-timeline-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="execution-timeline-title" className="text-base font-semibold">
            Linha do tempo
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reloadTimeline}
            className="min-h-11"
          >
            Atualizar
          </Button>
        </div>
        <div className="mt-3">
          {timeline.status === 'loading' && (
            <LoadingPanel label="Carregando linha do tempo…" lines={2} />
          )}
          {timeline.status === 'error' && (
            <ErrorPanel
              title="Linha do tempo indisponível"
              message={timeline.message ?? 'Não foi possível carregar os eventos.'}
              onRetry={reloadTimeline}
            />
          )}
          {timeline.status === 'ready' && timeline.page.items.length === 0 && (
            <EmptyState
              eyebrow="Sem dados"
              title="Nenhum evento no período"
              description="A linha do tempo mostra apenas eventos registrados pela API no filtro selecionado."
            />
          )}
          {timeline.status === 'ready' && timeline.page.items.length > 0 && (
            <>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {timeline.page.items.map((event) => (
                  <li key={event.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {timelineKindLabel(event.kind)} · {timelineInstant(event.occurredAt)}
                      </span>
                    </div>
                    {event.detail !== null && (
                      <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
                    )}
                    {event.status !== null && (
                      <p className="mt-1 text-xs text-muted-foreground">Situação: {event.status}</p>
                    )}
                  </li>
                ))}
              </ul>
              {timeline.page.nextCursor !== undefined && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore}
                  onClick={loadMoreTimeline}
                  className="mt-3 min-h-11"
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </Button>
              )}
              {timeline.message !== undefined && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {timeline.message}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
