import { useState } from 'react';
import type { PerformanceSelection } from './format';
import { PerformanceDomainsView } from './PerformanceDomainsView';
import { PerformancePageFrame } from './PerformancePageFrame';
import { usePerformanceDashboard } from './use-performance';

export function PerformanceDomainsPage() {
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
      title="Evolução por domínio"
      description="Séries construídas somente com observações reais. Domínios sem amostra mínima aparecem como indisponíveis; lacunas não são preenchidas e a tendência vem do motor existente."
      selection={selection}
      onSelectionChange={setSelection}
      controller={dashboard}
      render={(data) => <PerformanceDomainsView dashboard={data} />}
    />
  );
}
