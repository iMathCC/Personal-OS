import type { StudiesDashboardData } from '@personal-os/shared';
import type { IntelligenceSeriesDto } from '@personal-os/shared';
import type { EChartsCoreOption } from 'echarts/core';

/** Opções puras: nenhum componente ECharts é carregado para construí-las. */
export function evolutionOption(dashboard: StudiesDashboardData): EChartsCoreOption {
  return {
    animation: false,
    grid: { left: 44, right: 12, top: 20, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dashboard.series.map((point) => point.date.slice(5)),
    },
    yAxis: { type: 'value', name: 'min' },
    series: [
      {
        name: 'Minutos',
        type: 'line',
        data: dashboard.series.map((point) => point.value),
        connectNulls: false,
        showSymbol: false,
        lineStyle: { width: 2 },
      },
    ],
  };
}

/** Série de inteligência: pontos `null` permanecem lacunas, nunca viram zero. */
export function intelligenceSeriesOption(series: IntelligenceSeriesDto): EChartsCoreOption {
  return {
    animation: false,
    grid: { left: 48, right: 12, top: 20, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: series.points.map((point) => point.date.slice(5)),
    },
    yAxis: { type: 'value', name: series.unit },
    series: [
      {
        name: series.label,
        type: 'line',
        data: series.points.map((point) => point.value),
        connectNulls: false,
        showSymbol: true,
        lineStyle: { width: 2 },
      },
    ],
  };
}

export function comparisonOption(dashboard: StudiesDashboardData): EChartsCoreOption {
  return {
    animation: false,
    grid: { left: 44, right: 12, top: 20, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: [
        `Anterior (${dashboard.period.previousFrom.slice(5)})`,
        `Atual (${dashboard.period.from.slice(5)})`,
      ],
    },
    yAxis: { type: 'value', name: 'min' },
    series: [
      {
        name: 'Minutos estudados',
        type: 'bar',
        barMaxWidth: 48,
        data: [
          dashboard.comparison.totalMinutes.previous,
          dashboard.comparison.totalMinutes.current,
        ],
      },
    ],
  };
}
