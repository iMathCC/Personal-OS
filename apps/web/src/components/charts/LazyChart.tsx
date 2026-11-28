import { lazy, Suspense } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { LoadingPanel } from '@/components/states';

const EChartImpl = lazy(() => import('./EChartImpl'));

interface LazyChartProps {
  option: EChartsCoreOption;
  ariaLabel: string;
}

/** Wrapper lazy: mantém o bundle inicial livre do runtime do ECharts. */
export function LazyChart({ option, ariaLabel }: LazyChartProps) {
  return (
    <Suspense fallback={<LoadingPanel label="Carregando gráfico…" lines={2} />}>
      <EChartImpl option={option} ariaLabel={ariaLabel} />
    </Suspense>
  );
}
