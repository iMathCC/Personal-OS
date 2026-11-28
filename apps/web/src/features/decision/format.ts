import type {
  DecisionAlertsQuery,
  DecisionAlertDto,
  DecisionCrossDomainDto,
  DecisionDashboardDto,
  DecisionPeriodDto,
  DecisionRecommendationDto,
  DecisionReviewDto,
} from '@personal-os/shared';

/** Texto único para ausência: nenhum número é assumido quando o dado falta. */
export const INSUFFICIENT_DATA = 'dados insuficientes';

export type DecisionComparison = NonNullable<DecisionAlertsQuery['comparison']>;

const COMPARISON_VALUES: readonly DecisionComparison[] = ['week', 'month', 'quarter', 'custom'];

export function comparisonFromValue(value: string): DecisionComparison | undefined {
  return COMPARISON_VALUES.find((option) => option === value);
}

const numberFormat = new Intl.NumberFormat('pt-BR');
const currencyFormat = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export interface AlertFilters {
  readonly severity: DecisionAlertsQuery['severity'];
  readonly area: string;
  readonly state: DecisionAlertsQuery['state'];
  readonly comparison: DecisionAlertsQuery['comparison'];
  readonly from: string;
  readonly to: string;
}

export const EMPTY_ALERT_FILTERS: AlertFilters = {
  severity: undefined,
  area: '',
  state: undefined,
  comparison: undefined,
  from: '',
  to: '',
};

/** Filtros vazios não viram parâmetros; datas incompletas são descartadas juntas. */
export function buildAlertsQuery(
  filters: AlertFilters,
  cursor?: string,
): Partial<DecisionAlertsQuery> {
  const completePeriod = filters.from !== '' && filters.to !== '';
  return {
    ...(filters.severity === undefined ? {} : { severity: filters.severity }),
    ...(filters.area.trim() === '' ? {} : { area: filters.area.trim() }),
    ...(filters.state === undefined ? {} : { state: filters.state }),
    ...(filters.comparison === undefined ? {} : { comparison: filters.comparison }),
    ...(completePeriod ? { from: filters.from, to: filters.to } : {}),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

export type AlertFocusResult = 'none' | 'found' | 'load-more' | 'unavailable';

/**
 * resolve um deep link `?alert=<id>` sem confiar em filtro do servidor: procura
 * nas páginas já carregadas e, no máximo, percorre mais algumas páginas.
 */
export function resolveAlertFocus(
  focusedAlertId: string | null,
  visibleAlertIds: readonly string[],
  hasMore: boolean,
  pagesLoaded: number,
  maxPages = 10,
): AlertFocusResult {
  if (focusedAlertId === null || focusedAlertId === '') return 'none';
  if (visibleAlertIds.includes(focusedAlertId)) return 'found';
  if (hasMore && pagesLoaded < maxPages) return 'load-more';
  return 'unavailable';
}

/** Alertas sem versão persistida ainda não sofreram transição de estado. */
export function versionForMutation(stateVersion: number | null): number {
  return stateVersion ?? 1;
}

export function createIdempotencyKey(): string {
  const runtimeCrypto = globalThis.crypto;
  if (runtimeCrypto !== undefined && typeof runtimeCrypto.randomUUID === 'function') {
    return runtimeCrypto.randomUUID();
  }
  return `decision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatNumber(value: number | null): string {
  return value === null ? INSUFFICIENT_DATA : numberFormat.format(value);
}

export function formatPercent(value: number | null): string {
  return value === null ? INSUFFICIENT_DATA : `${numberFormat.format(Math.round(value * 100))}%`;
}

export function formatCents(value: number | null): string {
  return value === null ? INSUFFICIENT_DATA : currencyFormat.format(value / 100);
}

export function formatDuration(minutes: number | null): string {
  return minutes === null ? INSUFFICIENT_DATA : `${numberFormat.format(minutes)} min`;
}

export function formatPeriod(period: DecisionPeriodDto): string {
  return `${period.from} a ${period.to}`;
}

export const SEVERITY_LABELS: Record<DecisionAlertDto['severity'], string> = {
  info: 'Informação',
  attention: 'Atenção',
  risk: 'Risco',
  critical: 'Crítico',
};

export const ALERT_STATE_LABELS: Record<DecisionAlertDto['state'], string> = {
  open: 'Aberto',
  acknowledged: 'Reconhecido',
  dismissed: 'Dispensado',
};

export const URGENCY_LABELS: Record<DecisionRecommendationDto['urgency'], string> = {
  now: 'Agora',
  soon: 'Em breve',
  later: 'Depois',
};

export const AREA_STATUS_LABELS: Record<DecisionDashboardDto['areas'][number]['status'], string> = {
  available: 'Disponível',
  insufficient_data: 'Dados insuficientes (insufficient_data)',
};

export const ANALYSIS_STATUS_LABELS: Record<DecisionCrossDomainDto['status'], string> = {
  ok: 'Disponível',
  insufficient_data: 'Dados insuficientes (insufficient_data)',
  incompatible: 'Incompatível',
};

export const COMPARISON_STATUS_LABELS: Record<
  DecisionDashboardDto['comparisons'][number]['status'],
  string
> = {
  ok: 'Comparável',
  insufficient_data: 'Dados insuficientes (insufficient_data)',
};

export const REVIEW_ITEM_KIND_LABELS: Record<
  DecisionReviewDto['sections'][number]['items'][number]['kind'],
  string
> = {
  observed: 'Observado',
  calculated: 'Calculado',
  insufficient: 'Dados insuficientes',
};

export const REVIEW_KIND_LABELS: Record<DecisionReviewDto['kind'], string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
};

export const PLANNING_EXECUTION_STATE_LABELS: Record<string, string> = {
  not_planned: 'Sem planejamento explícito',
  planned_not_executed: 'Planejado, não executado',
  partially_executed: 'Parcialmente executado',
  fully_executed: 'Totalmente executado',
  insufficient_evidence: 'Evidência insuficiente',
  not_applicable: 'Não aplicável / não comparável',
};

/** Prioridade declarada pode faltar; a sugerida sempre vem calculada pela API. */
export function formatPriority(value: number | null): string {
  return value === null ? INSUFFICIENT_DATA : `${value} de 5`;
}
