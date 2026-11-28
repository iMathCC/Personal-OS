import type { PerformanceDashboardDto, PerformanceIndicatorDto } from '@personal-os/shared';
import { LazyChart } from '@/components/charts/LazyChart';
import { EmptyState } from '@/components/states';
import {
  DIRECTION_LABELS,
  formatCents,
  formatChange,
  formatConfidence,
  formatPercent,
  formatPeriod,
  formatValue,
  observedPointCount,
  STATUS_LABELS,
} from './format';
import { LimitationList, PerformanceEvidence, StatusBadge } from './PerformanceEvidence';
import { performanceSeriesOption } from './performance-chart-options';

const MIN_CHART_POINTS = 3;

function formatIndicatorValue(value: number | null, unit: string): string {
  return unit === 'centavos' ? formatCents(value) : formatValue(value, unit);
}

function IndicatorCard({ indicator }: { indicator: PerformanceIndicatorDto }) {
  const sufficient = observedPointCount(indicator) >= MIN_CHART_POINTS;
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{indicator.label}</h3>
        <StatusBadge
          label={STATUS_LABELS[indicator.status]}
          warning={indicator.status === 'unavailable'}
        />
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Valor corrente</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatIndicatorValue(indicator.currentValue, indicator.unit)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Valor anterior</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatIndicatorValue(indicator.previousValue, indicator.unit)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Variação</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatChange(indicator.changePercent)} · {DIRECTION_LABELS[indicator.direction]}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cobertura / confiança</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatPercent(indicator.coverage)} / {formatConfidence(indicator.confidence)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {formatPeriod(indicator.period)} · comparado com {formatPeriod(indicator.previousPeriod)} ·{' '}
        {indicator.observedPoints} pontos observados.
      </p>
      {sufficient ? (
        <div className="mt-3 h-60 w-full">
          <LazyChart
            option={performanceSeriesOption(indicator)}
            ariaLabel={`Série de ${indicator.label}`}
          />
        </div>
      ) : (
        <p role="status" className="mt-3 text-xs text-amber-300">
          Série com menos de {MIN_CHART_POINTS} pontos observados: tendência não exibida.
        </p>
      )}
      <PerformanceEvidence evidence={indicator.evidence} confidence={indicator.confidence} />
      <div className="mt-3">
        <LimitationList items={indicator.limitations} />
      </div>
    </li>
  );
}

export function PerformanceDomainsView({ dashboard }: { dashboard: PerformanceDashboardDto }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="performance-domains-catalog-title">
        <h2 id="performance-domains-catalog-title" className="text-base font-semibold">
          Catálogo de domínios
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fontes e contagens lidas pela API. Domínios sem registro não produzem indicador.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <caption className="sr-only">Disponibilidade dos domínios longitudinais</caption>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Domínio
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Fonte
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Registros
                </th>
                <th scope="col" className="py-2 font-medium">
                  Disponibilidade
                </th>
              </tr>
            </thead>
            <tbody>
              {dashboard.domains.map((domain) => (
                <tr key={domain.id} className="border-b border-border/60">
                  <td className="py-2 pr-3">{domain.label}</td>
                  <td className="py-2 pr-3 break-words">{domain.source}</td>
                  <td className="py-2 pr-3 tabular-nums">{domain.recordCount}</td>
                  <td className="py-2">
                    <StatusBadge
                      label={domain.available ? 'Disponível' : 'Sem registros'}
                      warning={!domain.available}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="performance-domains-indicators-title">
        <h2 id="performance-domains-indicators-title" className="text-base font-semibold">
          Evolução por domínio
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tendência, comparação e suficiência calculadas na API; nenhum número é inferido no
          cliente.
        </p>
        {dashboard.indicators.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              eyebrow="Indisponível"
              title="Nenhum indicador longitudinal"
              description="Não há séries observadas suficientes para descrever a evolução dos domínios."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {dashboard.indicators.map((indicator) => (
              <IndicatorCard key={indicator.id} indicator={indicator} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="performance-domains-limitations-title">
        <h2 id="performance-domains-limitations-title" className="text-base font-semibold">
          Limitações do painel
        </h2>
        <div className="mt-3">
          <LimitationList items={dashboard.limitations} />
        </div>
      </section>
    </div>
  );
}
