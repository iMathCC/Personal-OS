import { useState } from 'react';
import type { PerformanceSelection } from './format';
import { PerformanceExecutionView } from './PerformanceExecutionView';
import { PerformancePageFrame } from './PerformancePageFrame';
import { usePerformanceDashboard } from './use-performance';

export function PerformanceExecutionPage() {
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
      title="Planejado versus executado"
      description="Conclusão de tarefas, consistência de registro, estimativas, tempo medido e capacidade declarada são exibidos como grandezas distintas. Capacidade extrapolada não é tempo medido."
      selection={selection}
      onSelectionChange={setSelection}
      controller={dashboard}
      render={(data) => <PerformanceExecutionView dashboard={data} />}
    />
  );
}
