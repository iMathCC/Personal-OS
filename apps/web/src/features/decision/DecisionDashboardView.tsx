import { Link } from 'react-router';
import type { DecisionDashboardDto } from '@personal-os/shared';
import { EvidencePanel } from './EvidencePanel';
import {
  ANALYSIS_STATUS_LABELS,
  AREA_STATUS_LABELS,
  COMPARISON_STATUS_LABELS,
  PLANNING_EXECUTION_STATE_LABELS,
  formatCents,
  formatDuration,
  formatNumber,
  formatPercent,
  formatPeriod,
  INSUFFICIENT_DATA,
} from './format';

interface FactField {
  readonly key: keyof DecisionDashboardDto['facts'];
  readonly label: string;
  readonly kind?: 'money' | 'duration';
}

const FACT_FIELDS: readonly FactField[] = [
  { key: 'goalsActive', label: 'Objetivos ativos' },
  { key: 'projectsActive', label: 'Projetos ativos' },
  { key: 'tasksOpen', label: 'Tarefas em aberto' },
  { key: 'tasksOverdue', label: 'Tarefas com prazo vencido' },
  { key: 'studyMinutes', label: 'Minutos de estudo', kind: 'duration' },
  { key: 'financeExpenses', label: 'Despesas registradas' },
  { key: 'financeExpenseCents', label: 'Valor das despesas', kind: 'money' },
  { key: 'healthObservations', label: 'Observações de saúde' },
  { key: 'trainingObservations', label: 'Sessões de treinamento' },
  { key: 'readingObservations', label: 'Registros de leitura' },
  { key: 'timeMinutes', label: 'Tempo registrado', kind: 'duration' },
  { key: 'capacityWeeklyMinutes', label: 'Capacidade semanal', kind: 'duration' },
  { key: 'capacityContingencyPercent', label: 'Reserva para imprevistos' },
  { key: 'activeCycleName', label: 'Ciclo ativo' },
];

function formatFact(value: string | number | null, kind: FactField['kind']): string {
  if (value === null) return INSUFFICIENT_DATA;
  if (typeof value === 'string') return value;
  if (kind === 'money') return formatCents(value);
  if (kind === 'duration') return formatDuration(value);
  return formatNumber(value);
}

function StatusBadge({ label, warning }: { label: string; warning: boolean }) {
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${
        warning ? 'bg-amber-500/15 text-amber-300' : 'bg-muted text-foreground/80'
      }`}
    >
      {label}
    </span>
  );
}

export function DecisionDashboardView({ dashboard }: { dashboard: DecisionDashboardDto }) {
  const nextAction = dashboard.nextAction;

  return (
    <div className="space-y-8">
      <section aria-labelledby="decision-dashboard-period">
        <h2 id="decision-dashboard-period" className="text-base font-semibold">
          Período e cobertura
        </h2>
        <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {dashboard.periods.label} · {formatPeriod(dashboard.periods.current)} · comparado com{' '}
          {formatPeriod(dashboard.periods.previous)} ({dashboard.timezone}). Gerado em{' '}
          {dashboard.generatedAt}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {dashboard.periods.equivalent
            ? 'Períodos de duração equivalente.'
            : 'Períodos com duração diferente: comparação limitada.'}
        </p>
      </section>

      <section aria-labelledby="decision-facts-title">
        <h2 id="decision-facts-title" className="text-base font-semibold">
          Fatos registrados
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Contagens lidas das fontes. Ausência aparece como “{INSUFFICIENT_DATA}”, nunca como zero.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {FACT_FIELDS.map((field) => (
            <div key={field.key} className="rounded-lg border border-border bg-card p-4">
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="mt-1 text-lg font-semibold break-words">
                {formatFact(dashboard.facts[field.key], field.kind)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="decision-areas-title">
        <h2 id="decision-areas-title" className="text-base font-semibold">
          Indicadores por área
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Áreas sem observações suficientes são identificadas como insufficient_data.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.areas.map((area) => (
            <li key={area.area} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{area.label}</h3>
                <StatusBadge
                  label={AREA_STATUS_LABELS[area.status]}
                  warning={area.status === 'insufficient_data'}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{area.summary}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {formatNumber(area.observations)} observações · cobertura{' '}
                {formatPercent(area.coverage)} · confiança {formatPercent(area.confidence)}
              </p>
              {area.missing.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Ausente: {area.missing.join(', ')}
                </p>
              )}
              {area.sources.length > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Fontes: {area.sources.join(', ')}
                </p>
              )}
              {area.href !== null && (
                <Link
                  to={area.href}
                  className="mt-3 inline-flex min-h-11 items-center text-xs font-medium text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Abrir área
                </Link>
              )}
            </li>
          ))}
        </ul>
        {dashboard.areas.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum indicador disponível: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>

      <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
        Período: {formatPeriod(dashboard.periods.current)} · gerado em {dashboard.generatedAt} ·
        fuso {dashboard.timezone}
      </p>

      <section aria-labelledby="decision-next-title" className="space-y-4">
        <div>
          <h2 id="decision-next-title" className="text-base font-semibold">
            Próxima melhor ação
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sugestão calculada com dados disponíveis; nenhuma ação é executada automaticamente.
          </p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h3 className="text-sm font-semibold">{nextAction.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{nextAction.why}</p>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-medium">Impacto esperado</dt>
              <dd className="text-muted-foreground">{nextAction.expectedImpact}</dd>
            </div>
            <div>
              <dt className="font-medium">Esforço</dt>
              <dd className="text-muted-foreground">{formatDuration(nextAction.effortMinutes)}</dd>
            </div>
            <div>
              <dt className="font-medium">Tipo</dt>
              <dd className="text-muted-foreground">
                {nextAction.kind === 'task' ? 'Tarefa' : 'Coleta de dados'}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Confiança</dt>
              <dd className="text-muted-foreground">{formatPercent(nextAction.confidence)}</dd>
            </div>
          </dl>
          {nextAction.blockers.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Obstáculos: {nextAction.blockers.join(', ')}
            </p>
          )}
          <div className="mt-4">
            <EvidencePanel explanation={nextAction.explanation} title="Evidência da próxima ação" />
          </div>
        </div>
      </section>

      <section aria-labelledby="decision-recommendations-title" className="space-y-4">
        <div>
          <h2 id="decision-recommendations-title" className="text-base font-semibold">
            Recomendações e prioridades
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sugestões explicáveis baseadas em dados disponíveis. A decisão é humana; nenhuma ação é
            executada automaticamente.
          </p>
        </div>
        {dashboard.recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma recomendação gerada com os dados disponíveis.
          </p>
        ) : (
          <ul className="space-y-3">
            {dashboard.recommendations.map((rec) => (
              <li key={rec.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{rec.title}</h3>
                  <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                    {rec.urgency === 'now'
                      ? 'Agora'
                      : rec.urgency === 'soon'
                        ? 'Em breve'
                        : 'Depois'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{rec.description}</p>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-medium">Por quê</dt>
                    <dd className="text-muted-foreground">{rec.reason}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Impacto esperado</dt>
                    <dd className="text-muted-foreground">{rec.expectedImpact}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Próxima ação</dt>
                    <dd className="text-muted-foreground">{rec.nextAction}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Esforço / confiança</dt>
                    <dd className="text-muted-foreground">
                      {formatDuration(rec.effortMinutes)} · {formatPercent(rec.confidence)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Fontes: {rec.sources.join(', ') || INSUFFICIENT_DATA}
                </p>
                {rec.limitations.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Incertezas: {rec.limitations.join(', ')}
                  </p>
                )}
                <div className="mt-3">
                  <EvidencePanel explanation={rec.explanation} title={`Evidência: ${rec.title}`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decision-alerts-title" className="space-y-4">
        <div>
          <h2 id="decision-alerts-title" className="text-base font-semibold">
            Alertas com evidência
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sinais que merecem atenção. Alertas não são diagnósticos e não executam ações.
          </p>
        </div>
        {dashboard.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta ativo no período.</p>
        ) : (
          <ul className="space-y-3">
            {dashboard.alerts.map((alert) => (
              <li key={alert.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{alert.title}</h3>
                  <StatusBadge
                    label={alert.severity}
                    warning={alert.severity === 'risk' || alert.severity === 'critical'}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{alert.reason}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Área: {alert.area} · estado: {alert.state} · fontes:{' '}
                  {alert.sources.join(', ') || INSUFFICIENT_DATA}
                </p>
                <div className="mt-3">
                  <EvidencePanel
                    explanation={alert.explanation}
                    title={`Evidência: ${alert.title}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decision-plan-exec-title" className="space-y-4">
        <div>
          <h2 id="decision-plan-exec-title" className="text-base font-semibold">
            Planejamento vs execução
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Comparação calculada no servidor com período explícito. Capacidade configurada é
            distinta de alocação planejada. Ausência de registro não significa ausência de
            atividade.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Período: {formatPeriod(dashboard.planningExecution.period)} · fuso{' '}
            {dashboard.planningExecution.timezone} · algoritmo{' '}
            {dashboard.planningExecution.algorithmVersion}
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.planningExecution.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{item.label}</h3>
                <StatusBadge
                  label={PLANNING_EXECUTION_STATE_LABELS[item.state] ?? item.state}
                  warning={
                    item.state === 'insufficient_evidence' ||
                    item.state === 'not_applicable' ||
                    item.state === 'planned_not_executed'
                  }
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{item.definition}</p>
              <dl className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                <div>
                  <dt className="inline font-medium text-foreground/80">Planejado: </dt>
                  <dd className="inline">{formatNumber(item.plannedValue)}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/80">Executado: </dt>
                  <dd className="inline">{formatNumber(item.executedValue)}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/80">
                    Capacidade configurada:{' '}
                  </dt>
                  <dd className="inline">{formatNumber(item.configuredCapacityValue)}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/80">Alocação planejada: </dt>
                  <dd className="inline">{formatNumber(item.allocatedPlannedValue)}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/80">Cumprimento: </dt>
                  <dd className="inline">
                    {item.fulfillmentPercent === null
                      ? INSUFFICIENT_DATA
                      : `${formatNumber(item.fulfillmentPercent)}%`}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/80">Unidade/período: </dt>
                  <dd className="inline">
                    {item.unit ?? INSUFFICIENT_DATA} · {formatPeriod(item.period)}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/80">Cobertura/confiança: </dt>
                  <dd className="inline">
                    {formatPercent(item.coverage)} · {formatPercent(item.confidence)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Fontes: {item.source.join(', ') || INSUFFICIENT_DATA}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Fórmula: {item.formula}</p>
              {item.missing.length > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Ausente: {item.missing.join(', ')}
                </p>
              )}
              {item.limitations.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
                  {item.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {dashboard.planningExecution.limitations.length > 0 && (
          <ul className="list-inside list-disc text-[11px] text-muted-foreground">
            {dashboard.planningExecution.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decision-longitudinal-title" className="space-y-4">
        <div>
          <h2 id="decision-longitudinal-title" className="text-base font-semibold">
            Evolução longitudinal por área
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Indicadores calculados no servidor a partir de séries históricas. Tendência só é exibida
            com pelo menos 4 observações semanais comparáveis; ausência não vira zero.
          </p>
        </div>
        {dashboard.longitudinalIndicators.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Histórico insuficiente para indicadores longitudinais: {INSUFFICIENT_DATA}.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dashboard.longitudinalIndicators.map((indicator) => {
              const trendSuppressed = indicator.direction === 'unknown';
              return (
                <li key={indicator.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{indicator.label}</h3>
                    <StatusBadge
                      label={indicator.status === 'unavailable' ? 'Indisponível' : 'Disponível'}
                      warning={indicator.status === 'unavailable' || trendSuppressed}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Atual: {formatNumber(indicator.currentValue)} {indicator.unit} · anterior:{' '}
                    {formatNumber(indicator.previousValue)} {indicator.unit}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Variação: {formatNumber(indicator.delta)} ·{' '}
                    {indicator.changePercent === null
                      ? INSUFFICIENT_DATA
                      : `${formatNumber(indicator.changePercent)}%`}{' '}
                    · direção:{' '}
                    {indicator.direction === 'up'
                      ? 'alta'
                      : indicator.direction === 'down'
                        ? 'queda'
                        : indicator.direction === 'stable'
                          ? 'estável'
                          : 'indisponível'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Observações: {formatNumber(indicator.observedPoints)} · cobertura{' '}
                    {formatPercent(indicator.coverage)} · confiança{' '}
                    {formatPercent(indicator.confidence)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Fonte: {indicator.source} · período {formatPeriod(indicator.period)}
                  </p>
                  {indicator.limitations.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-[11px] text-muted-foreground">
                      {indicator.limitations.slice(0, 3).map((limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="decision-comparisons-title">
        <h2 id="decision-comparisons-title" className="text-base font-semibold">
          Comparações entre períodos
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Valores ausentes impedem a comparação; nenhuma base é inventada.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.comparisons.map((comparison) => (
            <li key={comparison.metric} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{comparison.metric}</h3>
                <StatusBadge
                  label={COMPARISON_STATUS_LABELS[comparison.status]}
                  warning={comparison.status === 'insufficient_data'}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Atual {formatNumber(comparison.current)} · anterior{' '}
                {formatNumber(comparison.previous)} · variação absoluta{' '}
                {formatNumber(comparison.delta)} · variação percentual{' '}
                {formatPercent(comparison.changePercent)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Cobertura {formatPercent(comparison.coverage)}
              </p>
              {comparison.limitations.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-[11px] text-muted-foreground">
                  {comparison.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {dashboard.comparisons.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma comparação com dados suficientes: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>

      <section aria-labelledby="decision-cross-title" className="space-y-4">
        <div>
          <h2 id="decision-cross-title" className="text-base font-semibold">
            Resumo entre domínios
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Relações descritivas, sem causalidade: causality: not_claimed.
          </p>
        </div>
        {dashboard.crossDomainSummary.map((cross) => (
          <article key={cross.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{cross.label}</h3>
              <StatusBadge
                label={ANALYSIS_STATUS_LABELS[cross.status]}
                warning={cross.status !== 'ok'}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{cross.descriptive}</p>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="font-medium">Relação</dt>
                <dd className="text-muted-foreground">{cross.relation}</dd>
              </div>
              <div>
                <dt className="font-medium">Correlação</dt>
                <dd className="text-muted-foreground">{formatNumber(cross.correlation)}</dd>
              </div>
              <div>
                <dt className="font-medium">Confiança</dt>
                <dd className="text-muted-foreground">{formatPercent(cross.confidence)}</dd>
              </div>
              <div>
                <dt className="font-medium">Causalidade</dt>
                <dd className="text-muted-foreground">causality: {cross.causality}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {formatNumber(cross.observations)} observações · {formatNumber(cross.pairedPoints)}{' '}
              pontos pareados · cobertura {formatPercent(cross.coverage)} · fontes{' '}
              {cross.sources.join(', ') || INSUFFICIENT_DATA}
            </p>
            <div className="mt-4">
              <EvidencePanel
                explanation={cross.explanation}
                title={`Evidência de ${cross.label}`}
              />
            </div>
          </article>
        ))}
        {dashboard.crossDomainSummary.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma relação entre domínios estimada: {INSUFFICIENT_DATA}.
          </p>
        )}
      </section>

      <section aria-labelledby="decision-feedback-title" className="space-y-3">
        <h2 id="decision-feedback-title" className="text-base font-semibold">
          Feedback humano sobre adaptações
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{dashboard.humanFeedback.note}</p>
        <dl className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">Aceitas</dt>
            <dd className="text-lg font-semibold">
              {formatNumber(dashboard.humanFeedback.accepted)}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">Rejeitadas</dt>
            <dd className="text-lg font-semibold">
              {formatNumber(dashboard.humanFeedback.rejected)}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">Adiadas</dt>
            <dd className="text-lg font-semibold">
              {formatNumber(dashboard.humanFeedback.deferred)}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">Total no período</dt>
            <dd className="text-lg font-semibold">{formatNumber(dashboard.humanFeedback.total)}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-muted-foreground">
          Período: {formatPeriod(dashboard.humanFeedback.period)} · algoritmo{' '}
          {dashboard.humanFeedback.algorithmVersion}
        </p>
        {dashboard.humanFeedback.limitations.length > 0 && (
          <ul className="list-inside list-disc text-[11px] text-muted-foreground">
            {dashboard.humanFeedback.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decision-limits-title">
        <h2 id="decision-limits-title" className="text-base font-semibold">
          Limites do painel
        </h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted-foreground">
          {dashboard.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        {Object.entries(dashboard.algorithms).map(([name, version]) => (
          <p key={name} className="mt-1 text-[11px] text-muted-foreground">
            {name}: {version}
          </p>
        ))}
      </section>
    </div>
  );
}
