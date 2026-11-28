import { useState } from 'react';
import { Link } from 'react-router';
import { LazyChart } from '@/components/charts/LazyChart';
import { intelligenceSeriesOption } from '@/components/charts/chart-options';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import type { IntelligenceAlertDto, IntelligenceSeriesDto } from '@personal-os/shared';
import { formatMetricValue, formatProjection, formatTrend, metricLabel } from './format';
import { useIntelligenceDashboard, useIntelligenceTimeline } from './use-intelligence';

interface IntelligencePageProps {
  timezone: string;
}

const WEEKS = [4, 6, 8] as const;
const MIN_CHART_POINTS = 3;

function enoughData(series: IntelligenceSeriesDto): boolean {
  return series.points.filter((point) => point.value !== null).length >= MIN_CHART_POINTS;
}

function AlertCard({ alert }: { alert: IntelligenceAlertDto }) {
  const severityLabel = { high: 'Alta', medium: 'Média', low: 'Baixa' }[alert.severity];
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${
            alert.severity === 'high'
              ? 'bg-destructive/15 text-destructive'
              : alert.severity === 'medium'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {severityLabel}
        </span>
        <h4 className="text-sm font-semibold">{alert.title}</h4>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{alert.explanation}</p>
      {alert.evidence.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {alert.evidence.map((entry, index) => (
            <li
              key={`${entry.label}-${index}`}
              className="rounded bg-muted px-2 py-1 text-[11px] text-foreground/80"
            >
              {entry.label}: {entry.value}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-foreground/80">Sugestão: {alert.recommendation}</p>
      {alert.href !== null && (
        <Link
          className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
          to={alert.href}
        >
          Ver registro
        </Link>
      )}
    </li>
  );
}

export function IntelligencePage({ timezone }: IntelligencePageProps) {
  const [weeks, setWeeks] = useWeeksState();
  void timezone;
  const dashboard = useIntelligenceDashboard(weeks);
  const timeline = useIntelligenceTimeline();
  const data = dashboard.data;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Inteligência pessoal
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Inteligência</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Análises determinísticas sobre registros reais de estudos, objetivos, projetos e tarefas.
          Fatos, tendências, alertas e projeções são apresentados separadamente. Dados ausentes
          nunca são tratados como zero.
        </p>
        <div
          className="mt-4 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Janela de análise"
        >
          {WEEKS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setWeeks(value)}
              aria-pressed={weeks === value}
              className={`min-h-11 rounded-md border px-3 text-sm ${
                weeks === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground'
              }`}
            >
              {value} semanas
            </button>
          ))}
          <Link
            className="min-h-11 rounded-md border border-border bg-background px-3 text-sm leading-[2.75rem] text-foreground"
            to="/revisao"
          >
            Revisão semanal
          </Link>
        </div>
      </section>

      {dashboard.loading && <LoadingPanel label="Calculando análises…" lines={4} />}
      {dashboard.message !== null && (
        <ErrorPanel
          title="Inteligência indisponível"
          message={dashboard.message}
          onRetry={dashboard.reload}
        />
      )}
      {!dashboard.loading && dashboard.message === null && data === null && (
        <EmptyState
          eyebrow="Sem dados"
          title="Nenhuma análise disponível"
          description="Registre dados reais nas áreas existentes para habilitar as análises."
        />
      )}

      {data !== null && (
        <>
          <section aria-labelledby="state-title">
            <h2 id="state-title" className="text-base font-semibold">
              Estado atual
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Janela de {data.window.from} a {data.window.to} (timezone {data.timezone}).
              {data.truncated ? ' Conjunto de dados truncado por limites de leitura.' : ''}
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StateCard
                label="Minutos de estudo (semana)"
                value={data.currentState.studyMinutes}
              />
              <StateCard
                label="Sessões de estudo (semana)"
                value={data.currentState.studySessions}
              />
              <StateCard label="Projetos ativos" value={data.currentState.activeProjects} />
              <StateCard label="Objetivos ativos" value={data.currentState.activeGoals} />
              <StateCard label="Tarefas em aberto" value={data.currentState.relevantTasks} />
            </dl>
          </section>

          <section aria-labelledby="metrics-title">
            <h2 id="metrics-title" className="text-base font-semibold">
              Métricas observadas
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Cada métrica declara fonte, período, cobertura e versão do algoritmo.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.metrics.map((metric) => (
                <div key={metric.id} className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-medium">{metricLabel(metric)}</h3>
                  <p className="mt-2 text-xl font-semibold">{formatMetricValue(metric)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {metric.kind} · fonte {metric.source} ·{' '}
                    {metric.coverage === null
                      ? 'cobertura indisponível'
                      : `cobertura ${Math.round(metric.coverage * 100)}%`}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="charts-title">
            <h2 id="charts-title" className="text-base font-semibold">
              Séries históricas
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Gráficos carregados sob demanda somente quando há pontos suficientes. Lacunas são
              exibidas como ausência de registro.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {data.series.map((series) =>
                enoughData(series) ? (
                  <div key={series.id} className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold">{series.label}</h3>
                    <div className="mt-2 h-56">
                      <LazyChart
                        option={intelligenceSeriesOption(series)}
                        ariaLabel={`Série de ${series.label}`}
                      />
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    key={series.id}
                    eyebrow="Dados insuficientes"
                    title={series.label}
                    description={`São necessários pelo menos ${MIN_CHART_POINTS} pontos observados; há ${series.points.filter((point) => point.value !== null).length}.`}
                  />
                ),
              )}
            </div>
          </section>

          <section aria-labelledby="trends-title" className="grid gap-4 lg:grid-cols-2">
            <div>
              <h2 id="trends-title" className="text-base font-semibold">
                Tendências
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Uma única observação nunca caracteriza tendência.
              </p>
              <ul className="mt-4 space-y-2">
                {data.trends.map((trend) => (
                  <li key={trend.id} className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-medium">{trend.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{formatTrend(trend)}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 id="consistency-title" className="text-base font-semibold">
                Consistência de registro
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Dias sem registro são informação ausente, não inatividade.
              </p>
              <ul className="mt-4 space-y-2">
                {data.consistency.map((item) => (
                  <li key={item.area} className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-medium">{item.area}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {item.observedDays} dias registrados de {item.period.from} a {item.period.to};
                      cobertura {Math.round(item.coverage * 100)}%.
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="alerts-title">
            <h2 id="alerts-title" className="text-base font-semibold">
              Alertas e recomendações
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Alertas vêm de fatos registrados. Recomendações são sugestões: nenhuma ação é
              executada automaticamente.
            </p>
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {data.alerts.map((alert) => (
                <AlertCard key={`${alert.code}-${alert.entityId ?? 'global'}`} alert={alert} />
              ))}
            </ul>
            {data.alerts.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhum alerta nos registros atuais.
              </p>
            )}
            {data.recommendations.length > 0 && (
              <ol className="mt-4 space-y-2">
                {data.recommendations.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-primary/30 bg-primary/5 p-4"
                  >
                    <h3 className="text-sm font-semibold">{item.action}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="projections-title">
            <h2 id="projections-title" className="text-base font-semibold">
              Projeções
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Estimativas lineares transparentes, não compromissos. Histórico insuficiente devolve
              explicitamente `insufficient_data`.
            </p>
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {data.projections.map((projection) => (
                <li key={projection.id} className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-medium">{projection.label}</h3>
                  <p className="mt-1 text-sm">{formatProjection(projection)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {projection.status} · {projection.method} · {projection.dataPoints} pontos
                  </p>
                  {projection.limitations.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-[11px] text-muted-foreground">
                      {projection.limitations.map((limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="coverage-title">
            <h2 id="coverage-title" className="text-base font-semibold">
              Cobertura de dados
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.coverage.sources.map((source) => (
                <li key={source.key} className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-medium">{source.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source.recordCount} registros · {source.observedDays}/{source.expectedDays}{' '}
                    dias · {Math.round(source.coverageRatio * 100)}%
                  </p>
                </li>
              ))}
            </ul>
            {data.coverage.unconnectedAreas.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Sem fonte conectada: {data.coverage.unconnectedAreas.join(', ')}. Nenhum valor foi
                assumido para essas áreas.
              </p>
            )}
          </section>

          <section aria-labelledby="timeline-title">
            <h2 id="timeline-title" className="text-base font-semibold">
              Linha do tempo de registros
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Eventos reais de auditoria, filtráveis e paginados. Nenhum texto livre é exibido.
            </p>
            <div className="mt-4">
              {timeline.status === 'loading' && (
                <LoadingPanel label="Carregando eventos…" lines={2} />
              )}
              {timeline.status === 'error' && (
                <ErrorPanel
                  title="Linha do tempo indisponível"
                  message={timeline.message ?? 'Falha ao carregar.'}
                  onRetry={timeline.reload}
                />
              )}
              {timeline.status === 'ready' && timeline.page.items.length === 0 && (
                <EmptyState
                  eyebrow="Sem eventos"
                  title="Nenhum evento registrado"
                  description="As alterações registradas aparecerão aqui."
                />
              )}
              {timeline.page.items.length > 0 && (
                <ul className="space-y-2">
                  {timeline.page.items.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{event.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {event.area} · {event.kind} · {event.detail}
                        </p>
                      </div>
                      <time className="text-[11px] text-muted-foreground">{event.occurredAt}</time>
                    </li>
                  ))}
                </ul>
              )}
              {timeline.page.hasMore && (
                <button
                  type="button"
                  onClick={timeline.loadMore}
                  disabled={timeline.loadingMore}
                  className="mt-4 min-h-11 rounded-md border border-border bg-background px-4 text-sm disabled:opacity-60"
                >
                  {timeline.loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StateCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{new Intl.NumberFormat('pt-BR').format(value)}</dd>
    </div>
  );
}

/** Preferência local de visualização; nenhum estado global é necessário. */
function useWeeksState(): [number, (value: number) => void] {
  const [weeks, setWeeks] = useState<number>(4);
  return [weeks, setWeeks];
}
