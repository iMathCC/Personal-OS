import type {
  IntelligenceAlertDto,
  IntelligenceMetricDto,
  ProjectionDto,
  TrendDto,
} from '@personal-os/shared';

const METRIC_LABELS: Record<string, string> = {
  study_minutes: 'Minutos de estudo',
  study_sessions: 'Sessões de estudo',
  active_projects: 'Projetos ativos',
  active_goals: 'Objetivos ativos',
  open_tasks: 'Tarefas em aberto',
  overdue_tasks: 'Tarefas vencidas',
};

export function metricLabel(metric: IntelligenceMetricDto): string {
  return METRIC_LABELS[metric.id] ?? metric.name;
}

export function formatMetricValue(metric: IntelligenceMetricDto): string {
  if (metric.value === null || metric.kind === 'unavailable') return 'Sem dados';
  const formatted = new Intl.NumberFormat('pt-BR').format(metric.value);
  return `${formatted} ${metric.unit}`;
}

export function formatTrend(trend: TrendDto): string {
  if (trend.status === 'insufficient_data') {
    return trend.reason ?? 'Histórico insuficiente.';
  }
  const direction: Record<TrendDto['direction'], string> = {
    up: 'alta',
    down: 'queda',
    stable: 'estável',
    unknown: 'indeterminada',
  };
  const absolute =
    trend.absoluteChange === null
      ? 'variação indisponível'
      : `variação absoluta de ${new Intl.NumberFormat('pt-BR').format(trend.absoluteChange)}`;
  const percent =
    trend.changePercent === null
      ? 'variação percentual indefinida'
      : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(trend.changePercent)}%`;
  return `${direction[trend.direction]} — ${absolute}; ${percent}. ${trend.observedPoints} pontos observados.`;
}

export function formatProjection(projection: ProjectionDto): string {
  if (projection.status === 'insufficient_data') {
    return projection.reason ?? 'Histórico insuficiente.';
  }
  if (projection.projectedValue === null) return 'Valor indisponível.';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(projection.projectedValue)} ${projection.unit} em ${projection.horizonDays} dias (R² ${projection.confidence ?? 0}).`;
}

export function alertHref(alert: IntelligenceAlertDto): string | undefined {
  return alert.href ?? undefined;
}
