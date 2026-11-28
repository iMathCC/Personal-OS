import { Link } from 'react-router';
import type { DecisionAlertDto, DecisionAlertsQuery } from '@personal-os/shared';
import { EvidencePanel } from './EvidencePanel';
import {
  ALERT_STATE_LABELS,
  comparisonFromValue,
  INSUFFICIENT_DATA,
  SEVERITY_LABELS,
  type AlertFilters,
} from './format';

export interface DecisionAlertsViewProps {
  alerts: readonly DecisionAlertDto[];
  filters: AlertFilters;
  pendingIds: readonly string[];
  message: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  focusedAlertId?: string | null;
  onFiltersChange: (next: AlertFilters) => void;
  onAcknowledge: (alert: DecisionAlertDto) => void;
  onDismiss: (alert: DecisionAlertDto) => void;
  onLoadMore: () => void;
}

const SEVERITY_OPTIONS: readonly DecisionAlertDto['severity'][] = [
  'info',
  'attention',
  'risk',
  'critical',
];
const STATE_OPTIONS: readonly DecisionAlertDto['state'][] = ['open', 'acknowledged', 'dismissed'];
const COMPARISON_OPTIONS: readonly NonNullable<DecisionAlertsQuery['comparison']>[] = [
  'week',
  'month',
  'quarter',
  'custom',
];

function severityFrom(value: string): DecisionAlertDto['severity'] | undefined {
  return SEVERITY_OPTIONS.find((option) => option === value);
}

function stateFrom(value: string): DecisionAlertDto['state'] | undefined {
  return STATE_OPTIONS.find((option) => option === value);
}

const controlClass =
  'min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring';
const buttonClass =
  'min-h-11 rounded-md border border-border bg-background px-4 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export function DecisionAlertsView({
  alerts,
  filters,
  pendingIds,
  message,
  hasMore,
  loadingMore,
  focusedAlertId = null,
  onFiltersChange,
  onAcknowledge,
  onDismiss,
  onLoadMore,
}: DecisionAlertsViewProps) {
  return (
    <div className="space-y-6">
      <form
        role="search"
        aria-label="Filtros de alertas"
        onSubmit={(event) => event.preventDefault()}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="decision-alert-severity" className="text-sm font-medium">
            Gravidade
          </label>
          <select
            id="decision-alert-severity"
            className={controlClass}
            value={filters.severity ?? ''}
            onChange={(event) =>
              onFiltersChange({ ...filters, severity: severityFrom(event.target.value) })
            }
          >
            <option value="">Todas as gravidades</option>
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {SEVERITY_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="decision-alert-area" className="text-sm font-medium">
            Área
          </label>
          <input
            id="decision-alert-area"
            type="text"
            className={controlClass}
            value={filters.area}
            placeholder="Ex.: finance"
            onChange={(event) => onFiltersChange({ ...filters, area: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="decision-alert-state" className="text-sm font-medium">
            Estado
          </label>
          <select
            id="decision-alert-state"
            className={controlClass}
            value={filters.state ?? ''}
            onChange={(event) =>
              onFiltersChange({ ...filters, state: stateFrom(event.target.value) })
            }
          >
            <option value="">Todos os estados</option>
            {STATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {ALERT_STATE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="decision-alert-comparison" className="text-sm font-medium">
            Período de comparação
          </label>
          <select
            id="decision-alert-comparison"
            className={controlClass}
            value={filters.comparison ?? ''}
            onChange={(event) =>
              onFiltersChange({ ...filters, comparison: comparisonFromValue(event.target.value) })
            }
          >
            <option value="">Padrão</option>
            {COMPARISON_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="decision-alert-from" className="text-sm font-medium">
            De
          </label>
          <input
            id="decision-alert-from"
            type="date"
            className={controlClass}
            value={filters.from}
            onChange={(event) => onFiltersChange({ ...filters, from: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="decision-alert-to" className="text-sm font-medium">
            Até
          </label>
          <input
            id="decision-alert-to"
            type="date"
            className={controlClass}
            value={filters.to}
            onChange={(event) => onFiltersChange({ ...filters, to: event.target.value })}
          />
        </div>
      </form>

      {message !== null && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          {message}
        </p>
      )}

      {alerts.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
          Nenhum alerta corresponde aos filtros. Ausência de alerta não é ausência de atividade.
        </p>
      )}

      <ul className="space-y-4">
        {alerts.map((alert) => {
          const pending = pendingIds.includes(alert.id);
          const settled = alert.state !== 'open';
          const disabled = pending || settled;
          return (
            <li
              key={alert.id}
              id={`decision-alert-${alert.id}`}
              tabIndex={focusedAlertId === alert.id ? -1 : undefined}
              aria-current={focusedAlertId === alert.id ? 'true' : undefined}
              className={`rounded-xl border bg-card p-4 ${
                focusedAlertId === alert.id ? 'border-primary ring-2 ring-ring' : 'border-border'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">
                  {SEVERITY_LABELS[alert.severity]}
                </span>
                <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">
                  {ALERT_STATE_LABELS[alert.state]}
                </span>
                <h3 className="text-sm font-semibold">{alert.title}</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {alert.area} · detectado em {alert.detectedAt} · regra {alert.ruleVersion}
              </p>
              <p className="mt-2 text-sm text-foreground/85">{alert.reason}</p>
              {alert.evidence.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {alert.evidence.map((entry, index) => (
                    <li
                      key={`${entry.label}-${index}`}
                      className="rounded bg-muted px-2 py-1 text-[11px]"
                    >
                      {entry.label}: {entry.value}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Fontes: {alert.sources.join(', ') || INSUFFICIENT_DATA}
              </p>
              <div className="mt-3">
                <EvidencePanel explanation={alert.explanation} title="Explicação do alerta" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={`Reconhecer alerta ${alert.title}`}
                  className={buttonClass}
                  disabled={disabled}
                  onClick={() => onAcknowledge(alert)}
                >
                  {pending ? 'Registrando…' : 'Reconhecer'}
                </button>
                <button
                  type="button"
                  aria-label={`Dispensar alerta ${alert.title}`}
                  className={buttonClass}
                  disabled={disabled}
                  onClick={() => onDismiss(alert)}
                >
                  Dispensar
                </button>
                {alert.href !== null && (
                  <Link
                    to={alert.href}
                    className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Ver registro
                  </Link>
                )}
                {settled && (
                  <span className="text-[11px] text-muted-foreground">
                    Decisão registrada: versão {alert.stateVersion ?? INSUFFICIENT_DATA}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button type="button" className={buttonClass} disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Carregando…' : 'Carregar mais alertas'}
        </button>
      )}
    </div>
  );
}
