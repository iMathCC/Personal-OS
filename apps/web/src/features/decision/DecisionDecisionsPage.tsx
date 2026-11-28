import { useState } from 'react';
import { ErrorPanel, LoadingPanel } from '@/components/states';
import { DecisionDecisionsView } from './DecisionDecisionsView';
import { DecisionPageHeader } from './DecisionPageHeader';
import { DecisionPeriodFilter, type DecisionPeriodSelection } from './DecisionPeriodFilter';
import { useDecisionDecisions } from './use-decision';

export function DecisionDecisionsPage() {
  const [period, setPeriod] = useState<DecisionPeriodSelection>({
    comparison: undefined,
    from: '',
    to: '',
  });
  const from = period.from === '' ? undefined : period.from;
  const to = period.to === '' ? undefined : period.to;
  const decisions = useDecisionDecisions(period.comparison, from, to);
  const crossDomain = decisions.crossDomain.data;

  return (
    <div className="space-y-8">
      <DecisionPageHeader
        eyebrow="Camada de decisão"
        title="Decisões e recomendações"
        description="Recomendações ordenadas por pontuação explícita, com prioridade declarada versus sugerida, impacto esperado, limitações e evidência linkada ao alerta de origem."
      />
      <DecisionPeriodFilter value={period} onChange={setPeriod} />

      {(decisions.recommendations.loading ||
        decisions.nextActions.loading ||
        decisions.crossDomain.loading ||
        decisions.catalog.loading) && <LoadingPanel label="Carregando decisões…" lines={4} />}

      {decisions.recommendations.message !== null && (
        <ErrorPanel
          title="Recomendações indisponíveis"
          message={decisions.recommendations.message}
          onRetry={decisions.recommendations.reload}
        />
      )}
      {decisions.nextActions.message !== null && (
        <ErrorPanel
          title="Próximas ações indisponíveis"
          message={decisions.nextActions.message}
          onRetry={decisions.nextActions.reload}
        />
      )}
      {decisions.crossDomain.message !== null && (
        <ErrorPanel
          title="Relações entre domínios indisponíveis"
          message={decisions.crossDomain.message}
          onRetry={decisions.crossDomain.reload}
        />
      )}
      {decisions.catalog.message !== null && (
        <ErrorPanel
          title="Catálogo indisponível"
          message={decisions.catalog.message}
          onRetry={decisions.catalog.reload}
        />
      )}

      {!decisions.recommendations.loading &&
      !decisions.nextActions.loading &&
      !decisions.crossDomain.loading &&
      !decisions.catalog.loading ? (
        <DecisionDecisionsView
          recommendations={decisions.recommendations.page.items}
          nextActions={decisions.nextActions.page.items}
          crossDomain={crossDomain?.items ?? []}
          catalog={decisions.catalog.data ?? []}
        />
      ) : null}

      {(decisions.recommendations.page.hasMore || decisions.nextActions.page.hasMore) && (
        <div className="flex flex-wrap gap-2">
          {decisions.recommendations.page.hasMore && (
            <button
              type="button"
              onClick={decisions.recommendations.loadMore}
              disabled={decisions.recommendations.loadingMore}
              className="min-h-11 rounded-md border border-border bg-background px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              Mais recomendações
            </button>
          )}
          {decisions.nextActions.page.hasMore && (
            <button
              type="button"
              onClick={decisions.nextActions.loadMore}
              disabled={decisions.nextActions.loadingMore}
              className="min-h-11 rounded-md border border-border bg-background px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              Mais próximas ações
            </button>
          )}
        </div>
      )}
    </div>
  );
}
