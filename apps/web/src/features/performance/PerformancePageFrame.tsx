import type { ReactNode } from 'react';
import type { PerformanceDashboardDto } from '@personal-os/shared';
import { EmptyState, ErrorPanel, LoadingPanel } from '@/components/states';
import type { DecisionRequestController } from '../decision/use-decision';
import type { PerformanceSelection } from './format';
import { PerformancePageHeader } from './PerformancePageHeader';
import { PerformancePeriodFilter } from './PerformancePeriodFilter';

/** Estado explícito para todas as páginas: carregando, erro, vazio e pronto. */
export function PerformancePageFrame({
  eyebrow,
  title,
  description,
  selection,
  onSelectionChange,
  controller,
  render,
}: {
  eyebrow: string;
  title: string;
  description: string;
  selection: PerformanceSelection;
  onSelectionChange: (next: PerformanceSelection) => void;
  controller: DecisionRequestController<PerformanceDashboardDto>;
  render: (dashboard: PerformanceDashboardDto) => ReactNode;
}) {
  return (
    <div className="space-y-8">
      <PerformancePageHeader eyebrow={eyebrow} title={title} description={description} />
      <PerformancePeriodFilter value={selection} onChange={onSelectionChange} />

      {controller.loading && <LoadingPanel label="Carregando análise longitudinal…" lines={5} />}
      {controller.message !== null && (
        <ErrorPanel
          title="Desempenho indisponível"
          message={controller.message}
          onRetry={controller.reload}
        />
      )}
      {!controller.loading && controller.message === null && controller.data === null && (
        <EmptyState
          eyebrow="Sem dados"
          title="Nenhuma análise disponível"
          description="A consulta não respondeu. Nenhum número foi assumido para preencher esta página."
        />
      )}
      {controller.data !== null && render(controller.data)}
    </div>
  );
}
