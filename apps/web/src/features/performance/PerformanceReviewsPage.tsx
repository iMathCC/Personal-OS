import { useState } from 'react';
import type { PerformanceSelection } from './format';
import { PerformancePageFrame } from './PerformancePageFrame';
import { PerformanceReviewsView } from './PerformanceReviewsView';
import { usePerformanceDashboard } from './use-performance';

export function PerformanceReviewsPage() {
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
      title="Revisões mensais e trimestrais"
      description="Consolidação sob demanda com identificador estável e snapshot imutável. Nenhuma versão antiga é recalculada e a ausência de snapshot persistido é declarada explicitamente."
      selection={selection}
      onSelectionChange={setSelection}
      controller={dashboard}
      render={(data) => <PerformanceReviewsView dashboard={data} />}
    />
  );
}
