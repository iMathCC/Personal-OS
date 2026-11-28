import { useState } from 'react';
import type { PerformanceSelection } from './format';
import { PerformancePageFrame } from './PerformancePageFrame';
import { PerformancePatternsView } from './PerformancePatternsView';
import { usePerformanceDashboard } from './use-performance';

export function PerformancePatternsPage() {
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
      title="Padrões, associações e cenários"
      description="Padrões exigem amostra mínima; associações são descritivas e nunca causais; projeções são simulações com premissas explícitas e nenhuma recomendação é executada automaticamente."
      selection={selection}
      onSelectionChange={setSelection}
      controller={dashboard}
      render={(data) => <PerformancePatternsView dashboard={data} />}
    />
  );
}
