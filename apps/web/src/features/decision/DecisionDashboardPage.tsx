import { useState } from 'react';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import { DecisionDashboardView } from './DecisionDashboardView';
import { DecisionPageHeader } from './DecisionPageHeader';
import { DecisionPeriodFilter, type DecisionPeriodSelection } from './DecisionPeriodFilter';
import { useDecisionDashboard } from './use-decision';

export function DecisionDashboardPage() {
  const [period, setPeriod] = useState<DecisionPeriodSelection>({
    comparison: undefined,
    from: '',
    to: '',
  });
  const dashboard = useDecisionDashboard(
    period.comparison,
    period.from === '' ? undefined : period.from,
    period.to === '' ? undefined : period.to,
  );

  return (
    <div className="space-y-8">
      <DecisionPageHeader
        eyebrow="Camada de decisão"
        title="Painel integrado de vida"
        description="Fatos, indicadores, próxima ação, comparações e relações entre domínios calculados pela API. Dados ausentes são identificados como dados insuficientes; nenhuma causalidade é afirmada."
      />
      <DecisionPeriodFilter value={period} onChange={setPeriod} />

      {dashboard.loading && <LoadingPanel label="Carregando painel integrado…" lines={5} />}
      {dashboard.message !== null && (
        <ErrorPanel
          title="Painel integrado indisponível"
          message={dashboard.message}
          onRetry={dashboard.reload}
        />
      )}
      {!dashboard.loading && dashboard.message === null && dashboard.data === null && (
        <EmptyState
          eyebrow="Sem dados"
          title="Nenhum painel disponível"
          description="A consulta não respondeu. Nenhum número foi assumido para preencher esta página."
        />
      )}
      {dashboard.data !== null && <DecisionDashboardView dashboard={dashboard.data} />}
    </div>
  );
}
