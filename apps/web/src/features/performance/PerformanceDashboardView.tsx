import { Link } from 'react-router';
import type { PerformanceDashboardDto } from '@personal-os/shared';
import { LazyChart } from '@/components/charts/LazyChart';
import { EmptyState } from '@/components/states';
import {
  formatChange,
  formatCents,
  formatConfidence,
  formatPeriod,
  formatValue,
  observedPointCount,
  COMPLETENESS_LABELS,
  DIRECTION_LABELS,
  STATUS_LABELS,
} from './format';
import { LimitationList, StatusBadge } from './PerformanceEvidence';
import { performanceComparisonOption, performanceSeriesOption } from './performance-chart-options';

const MIN_CHART_POINTS = 3;

function formatIndicatorValue(value: number | null, unit: string): string {
  return unit === 'centavos' ? formatCents(value) : formatValue(value, unit);
}

export function PerformanceDashboardView({ dashboard }: { dashboard: PerformanceDashboardDto }) {
  const chartIndicators = dashboard.indicators.filter(
    (indicator) => observedPointCount(indicator) >= MIN_CHART_POINTS,
  );
  const firstChart = chartIndicators[0];
  const hasComparison = dashboard.indicators.some(
    (indicator) => indicator.currentValue !== null || indicator.previousValue !== null,
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="performance-dashboard-period">
        <h2 id="performance-dashboard-period" className="text-base font-semibold">
          Janelas e comparabilidade
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Corrente: {formatPeriod(dashboard.periods.current)} (
          {COMPLETENESS_LABELS[dashboard.periods.currentCompleteness] ?? 'Não informado'}) ·
          anterior: {formatPeriod(dashboard.periods.previous)} (
          {COMPLETENESS_LABELS[dashboard.periods.previousCompleteness] ?? 'Não informado'}) ·{' '}
          {dashboard.timezone}. Gerado em {dashboard.generatedAt}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {dashboard.periods.comparable
            ? 'Janelas comparáveis dentro das limitações declaradas; a consolidação não é definitiva.'
            : 'Janelas não declaradas comparáveis: nenhuma conclusão forte foi tirada.'}
        </p>
        <LimitationList items={dashboard.periods.limitations} />
      </section>

      <section aria-labelledby="performance-dashboard-domains-title">
        <h2 id="performance-dashboard-domains-title" className="text-base font-semibold">
          Domínios observados
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Disponibilidade derivada de registros reais; nenhum domínio recebeu valor inventado.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.domains.map((domain) => (
            <li key={domain.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{domain.label}</h3>
                <StatusBadge
                  label={domain.available ? 'Com registros' : 'Sem registros'}
                  warning={!domain.available}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {domain.recordCount} registros em {domain.source}
              </p>
            </li>
          ))}
        </ul>
        <Link
          to="/desempenho/domínios"
          className="mt-3 inline-flex min-h-11 items-center text-xs font-medium text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver evolução detalhada por domínio
        </Link>
      </section>

      <section aria-labelledby="performance-dashboard-series-title" className="space-y-3">
        <div>
          <h2 id="performance-dashboard-series-title" className="text-base font-semibold">
            Evolução observada
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Lacunas permanecem lacunas; nenhum ponto ausente foi preenchido com zero.
          </p>
        </div>
        {firstChart === undefined ? (
          <EmptyState
            eyebrow="Indisponível"
            title="Sem série suficiente"
            description={`Nenhum domínio atingiu ${MIN_CHART_POINTS} pontos observados no período.`}
          />
        ) : (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">{firstChart.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatIndicatorValue(firstChart.currentValue, firstChart.unit)} ·{' '}
              {DIRECTION_LABELS[firstChart.direction]} · confiança{' '}
              {formatConfidence(firstChart.confidence)}
            </p>
            <div className="mt-2 h-60 w-full">
              <LazyChart
                option={performanceSeriesOption(firstChart)}
                ariaLabel={`Série de ${firstChart.label}`}
              />
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="performance-dashboard-comparison-title" className="space-y-3">
        <div>
          <h2 id="performance-dashboard-comparison-title" className="text-base font-semibold">
            Período corrente versus anterior
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Comparação calculada pela API; janelas incompletas não são tratadas como definitivas.
          </p>
        </div>
        {hasComparison ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="h-60 w-full">
              <LazyChart
                option={performanceComparisonOption(dashboard.indicators)}
                ariaLabel="Comparação entre período corrente e anterior por domínio"
              />
            </div>
          </div>
        ) : (
          <EmptyState
            eyebrow="Indisponível"
            title="Sem comparação"
            description="Não há valores observados nas duas janelas para comparar."
          />
        )}
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {dashboard.indicators.slice(0, 6).map((indicator) => (
            <li key={indicator.id} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold">{indicator.label}</p>
              <p className="mt-1 text-sm tabular-nums">
                {formatIndicatorValue(indicator.currentValue, indicator.unit)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {STATUS_LABELS[indicator.status]} · variação {formatChange(indicator.changePercent)}{' '}
                · {DIRECTION_LABELS[indicator.direction]}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="performance-dashboard-signals-title">
        <h2 id="performance-dashboard-signals-title" className="text-base font-semibold">
          Sinais e consolidação
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <li className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Padrões com amostra mínima</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{dashboard.patterns.length}</p>
          </li>
          <li className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Associações descriptivas</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {dashboard.associations.length}
            </p>
          </li>
          <li className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Simulações explícitas</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {dashboard.projections.length}
            </p>
          </li>
          <li className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Snapshot imutável</p>
            <p className="mt-1 text-sm break-words">
              {dashboard.snapshot === null ? 'Indisponível' : dashboard.snapshot.id}
            </p>
          </li>
        </ul>
        <nav aria-label="Detalhes do desempenho" className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/desempenho/execução"
            className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Execução planejada vs. executada
          </Link>
          <Link
            to="/desempenho/padrões"
            className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Padrões, associações e simulações
          </Link>
          <Link
            to="/desempenho/revisões"
            className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Consolidação mensal e trimestral
          </Link>
        </nav>
      </section>

      <section aria-labelledby="performance-dashboard-limitations-title">
        <h2 id="performance-dashboard-limitations-title" className="text-base font-semibold">
          Limitações e classificações
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ausência de registro nunca é zero; estimativa nunca é tempo medido; correlação nunca é
          causalidade; simulação nunca é previsão.
        </p>
        <div className="mt-3">
          <LimitationList items={dashboard.limitations} />
        </div>
        {dashboard.truncated && (
          <p role="status" className="mt-2 text-xs text-amber-300">
            Algumas séries foram recortadas no limite de pontos; totais podem estar subestimados.
          </p>
        )}
      </section>
    </div>
  );
}
