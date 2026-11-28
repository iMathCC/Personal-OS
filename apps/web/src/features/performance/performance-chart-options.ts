import type { PerformanceIndicatorDto } from '@personal-os/shared';
import { intelligenceSeriesOption } from '@/components/charts/chart-options';
import type { EChartsCoreOption } from 'echarts/core';

/**
 * Reaproveita o builder de séries de inteligência: nenhuma lógica de gráfico é
 * duplicada e `null` permanece lacuna (`connectNulls: false` no builder).
 */
export function performanceSeriesOption(indicator: PerformanceIndicatorDto): EChartsCoreOption {
  return intelligenceSeriesOption({
    id: indicator.id,
    label: indicator.label,
    unit: indicator.unit,
    points: indicator.points.map((point) => ({
      date: point.date,
      value: point.value,
      sampleCount: point.sampleCount ?? (point.value === null ? 0 : 1),
    })),
  });
}

export function performanceComparisonOption(
  indicators: readonly PerformanceIndicatorDto[],
): EChartsCoreOption {
  const usable = indicators
    .filter((indicator) => indicator.currentValue !== null || indicator.previousValue !== null)
    .slice(0, 8);
  return {
    animation: false,
    grid: { left: 48, right: 12, top: 28, bottom: 72 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: usable.map((indicator) => indicator.label),
      axisLabel: { interval: 0, rotate: 30 },
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'Período anterior',
        type: 'bar',
        barMaxWidth: 36,
        data: usable.map((indicator) => indicator.previousValue),
      },
      {
        name: 'Período corrente',
        type: 'bar',
        barMaxWidth: 36,
        data: usable.map((indicator) => indicator.currentValue),
      },
    ],
  };
}
