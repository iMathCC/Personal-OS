import { useState } from 'react';
import type { PerformanceSelection } from './format';
import { PerformanceDashboardView } from './PerformanceDashboardView';
import { PerformancePageFrame } from './PerformancePageFrame';
import { usePerformanceDashboard } from './use-performance';

export function PerformancePage() {
  const [selection, setSelection] = useState<PerformanceSelection>({
    comparison: undefined,
    from: '',
    to: '',
    reviewKind: 'monthly',
  });
  const dashboard = usePerformanceDashboard(selection);
  return (
    <PerformancePageFrame
      eyebrow="Desempenho longitudinal"
      title="Visão longitudinal de desempenho"
      description="Evolução real por domínio, comparação entre janelas, padrões com amostra mínima e consolidação versionada. Fatos, cálculos, hipóteses, recomendações e simulações permanecem separados; ausência de registro nunca é zero."
      selection={selection}
      onSelectionChange={setSelection}
      controller={dashboard}
      render={(data) => <PerformanceDashboardView dashboard={data} />}
    />
  );
}
