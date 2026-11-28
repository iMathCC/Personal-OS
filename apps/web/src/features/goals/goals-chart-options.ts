import type { GoalDashboardData } from '@personal-os/shared';
import type { EChartsCoreOption } from 'echarts/core';

/** Opções puras e testáveis; o runtime do ECharts é carregado somente no wrapper lazy. */
export function areaProgressOption(dashboard: GoalDashboardData): EChartsCoreOption {
  const areas = dashboard.byArea.filter((area) => area.active > 0);
  return {
    animation: false,
    grid: { left: 48, right: 16, top: 20, bottom: 44 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: areas.map((area) => area.areaName),
      axisLabel: { interval: 0, rotate: areas.length > 4 ? 30 : 0 },
    },
    yAxis: { type: 'value', min: 0, max: 100, name: '%' },
    series: [
      {
        name: 'Progresso médio conhecido',
        type: 'bar',
        barMaxWidth: 48,
        // Ausência de dados permanece null; não vira barra de zero.
        data: areas.map((area) => area.averageProgress),
      },
    ],
  };
}

export function attentionOption(dashboard: GoalDashboardData): EChartsCoreOption {
  const items = dashboard.attention.slice(0, 8);
  return {
    animation: false,
    grid: { left: 200, right: 24, top: 12, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', min: 0, max: 100, name: 'pontos' },
    yAxis: {
      type: 'category',
      data: items.map((item) => item.title),
      axisLabel: { width: 180, overflow: 'truncate' },
    },
    series: [
      {
        name: 'Prioridade registrada',
        type: 'bar',
        barMaxWidth: 20,
        data: items.map((item) => item.score),
      },
    ],
  };
}
