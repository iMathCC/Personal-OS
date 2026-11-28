import type {
  PerformanceAssociationDto,
  PerformanceIndicatorDto,
  PerformancePatternDto,
  PerformanceQuery,
} from '@personal-os/shared';

/** Texto único para ausência: nenhum dado faltante é exibido como zero. */
export const INSUFFICIENT_DATA = 'dados insuficientes';

export type PerformanceComparison = NonNullable<PerformanceQuery['comparison']>;
export type PerformanceReviewKind = NonNullable<PerformanceQuery['reviewKind']>;

export interface PerformanceSelection {
  readonly comparison: PerformanceComparison | undefined;
  readonly from: string;
  readonly to: string;
  readonly reviewKind: PerformanceReviewKind;
}

export const COMPARISON_LABELS: Record<PerformanceComparison, string> = {
  week: 'Semana',
  month: 'Mês',
  quarter: 'Trimestre',
  custom: 'Personalizado',
};

export const REVIEW_KIND_LABELS: Record<PerformanceReviewKind, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
};

export const COMPLETENESS_LABELS: Record<string, string> = {
  complete: 'Completo',
  incomplete: 'Incompleto',
  unknown: 'Não informado',
};

export const STATUS_LABELS: Record<PerformanceIndicatorDto['status'], string> = {
  observed: 'Observado',
  calculated: 'Calculado',
  unavailable: 'Indisponível',
};

export const DIRECTION_LABELS: Record<PerformanceIndicatorDto['direction'], string> = {
  up: 'Alta',
  down: 'Queda',
  stable: 'Estável',
  unknown: 'Sem direção',
};

export const PATTERN_STATUS_LABELS: Record<PerformancePatternDto['status'], string> = {
  identified: 'Padrão identificado',
  hypothesis: 'Hipótese',
  inconclusive: 'Inconclusivo',
};

export const ASSOCIATION_RELATION_LABELS: Record<PerformanceAssociationDto['relation'], string> = {
  positive: 'Positiva',
  negative: 'Negativa',
  none: 'Sem relação detectada',
  not_estimated: 'Não estimada',
};

export function comparisonFromValue(value: string): PerformanceComparison | undefined {
  return value === 'week' || value === 'month' || value === 'quarter' || value === 'custom'
    ? value
    : undefined;
}

export function reviewKindFromValue(value: string): PerformanceReviewKind {
  return value === 'quarterly' ? 'quarterly' : 'monthly';
}

/** Datas só entram na consulta quando as duas extremidades foram informadas. */
export function buildPerformanceQuery(selection: PerformanceSelection): Partial<PerformanceQuery> {
  return {
    reviewKind: selection.reviewKind,
    ...(selection.comparison === undefined ? {} : { comparison: selection.comparison }),
    ...(selection.from === '' || selection.to === ''
      ? {}
      : { from: selection.from, to: selection.to }),
  };
}

export function performanceQueryKey(selection: PerformanceSelection): string {
  return `${selection.reviewKind}|${selection.comparison ?? ''}|${selection.from}|${selection.to}`;
}

export function formatValue(value: number | null, unit?: string): string {
  if (value === null || !Number.isFinite(value)) return INSUFFICIENT_DATA;
  const formatted = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
  return unit === undefined || unit === '' ? formatted : `${formatted} ${unit}`;
}

export function formatCents(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return INSUFFICIENT_DATA;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return INSUFFICIENT_DATA;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

/** `changePercent` já vem em pontos percentuais do domínio; não é razão 0..1. */
export function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return INSUFFICIENT_DATA;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatPeriod(period: { readonly from: string; readonly to: string }): string {
  return `${period.from} a ${period.to}`;
}

/** Dias corridos inclusive, derivados de datas locais — sem fuso do navegador. */
export function periodDays(period: { readonly from: string; readonly to: string }): number {
  const from = Date.parse(`${period.from}T00:00:00.000Z`);
  const to = Date.parse(`${period.to}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

export function formatConfidence(value: number | null): string {
  return formatPercent(value);
}

export function observedPointCount(indicator: PerformanceIndicatorDto): number {
  return indicator.points.filter((point) => point.value !== null).length;
}

export function isWarningStatus(status: PerformanceIndicatorDto['status']): boolean {
  return status === 'unavailable';
}
