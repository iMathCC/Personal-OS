import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorPanel, LoadingPanel } from '@/components/states';
import type { DecisionAlertDto, DecisionAlertStateResultDto } from '@personal-os/shared';
import { DecisionAlertsView } from './DecisionAlertsView';
import { DecisionPageHeader } from './DecisionPageHeader';
import { EMPTY_ALERT_FILTERS, resolveAlertFocus, type AlertFilters } from './format';
import { useAlertStateMutation, useDecisionAlerts } from './use-decision';

type AlertOverride = Pick<DecisionAlertDto, 'state' | 'stateVersion'>;

function alertDomId(alertId: string): string {
  return `decision-alert-${alertId}`;
}

export function DecisionAlertsPage() {
  const [filters, setFilters] = useState<AlertFilters>(EMPTY_ALERT_FILTERS);
  const [overrides, setOverrides] = useState<Record<string, AlertOverride>>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [handledFocusId, setHandledFocusId] = useState<string | null>(null);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const alerts = useDecisionAlerts(filters);
  const mutation = useAlertStateMutation();
  const { loadMore, loading, loadingMore, page } = alerts;

  const visibleAlerts = page.items.map((alert) => {
    const override = overrides[alert.id];
    return override === undefined ? alert : { ...alert, ...override };
  });

  const requestedFocusId = searchParams.get('alert');
  const activeFocusId = requestedFocusId === handledFocusId ? null : requestedFocusId;
  const focusResult = resolveAlertFocus(
    activeFocusId,
    visibleAlerts.map((alert) => alert.id),
    page.hasMore,
    pagesLoaded,
  );

  /* eslint-disable react-hooks/set-state-in-effect -- deep link sincroniza foco/URL após carregar páginas */
  useEffect(() => {
    if (focusResult === 'load-more') {
      if (loading || loadingMore) return;
      setPagesLoaded((value) => value + 1);
      loadMore();
      return;
    }
    if (focusResult !== 'found' || activeFocusId === null) return;
    const element = document.getElementById(alertDomId(activeFocusId));
    if (element === null) return;
    element.scrollIntoView({ block: 'center' });
    element.focus();
    setHandledFocusId(activeFocusId);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('alert');
        return next;
      },
      { replace: true },
    );
  }, [activeFocusId, focusResult, loadMore, loading, loadingMore, page.items, setSearchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { changeState } = mutation;
  const register = useCallback(
    async (alert: DecisionAlertDto, action: 'acknowledged' | 'dismissed') => {
      const result: DecisionAlertStateResultDto | null = await changeState(alert, action);
      if (result === null) return;
      setOverrides((current) => ({
        ...current,
        [result.alert.id]: { state: result.alert.state, stateVersion: result.alert.version },
      }));
      setHandledFocusId(null);
      alerts.reload();
    },
    [alerts, changeState],
  );
  const acknowledge = useCallback(
    (alert: DecisionAlertDto) => void register(alert, 'acknowledged'),
    [register],
  );
  const dismiss = useCallback(
    (alert: DecisionAlertDto) => void register(alert, 'dismissed'),
    [register],
  );
  const changeFilters = useCallback((next: AlertFilters) => {
    setFilters(next);
    setOverrides({});
    setHandledFocusId(null);
    setPagesLoaded(1);
  }, []);

  return (
    <div className="space-y-8">
      <DecisionPageHeader
        eyebrow="Camada de decisão"
        title="Alertas com evidência"
        description="Filtre sinais por gravidade, área, estado e período. Reconhecer ou dispensar exige decisão explícita: a versão atual e uma chave de idempotência são enviadas a cada mutação."
      />

      {focusResult === 'unavailable' && (
        <p role="status" className="rounded-lg border border-border bg-card p-4 text-sm">
          O alerta apontado pelo link não está entre as páginas carregadas. Ajuste os filtros para
          localizá-lo.
        </p>
      )}
      {alerts.loading && <LoadingPanel label="Carregando alertas…" lines={4} />}
      {alerts.message !== null && (
        <ErrorPanel
          title="Alertas indisponíveis"
          message={alerts.message}
          onRetry={alerts.reload}
        />
      )}
      {!alerts.loading && alerts.message === null && (
        <DecisionAlertsView
          alerts={visibleAlerts}
          filters={filters}
          pendingIds={mutation.pendingIds}
          message={mutation.message}
          hasMore={alerts.page.hasMore}
          loadingMore={alerts.loadingMore}
          focusedAlertId={activeFocusId}
          onFiltersChange={changeFilters}
          onAcknowledge={acknowledge}
          onDismiss={dismiss}
          onLoadMore={alerts.loadMore}
        />
      )}
    </div>
  );
}
