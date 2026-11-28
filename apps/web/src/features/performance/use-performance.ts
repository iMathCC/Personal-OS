import { useCallback, useMemo } from 'react';
import type { PerformanceDashboardDto } from '@personal-os/shared';
import { performanceApi } from '@/lib/api';
import { useDecisionRequest, type DecisionRequestController } from '../decision/use-decision';
import { buildPerformanceQuery, performanceQueryKey, type PerformanceSelection } from './format';

/**
 * Uma consulta ao painel por página. O cálculo inteiro acontece na API; aqui
 * apenas se controla carregamento, erro e abortamento da requisição.
 */
export function usePerformanceDashboard(
  selection: PerformanceSelection,
): DecisionRequestController<PerformanceDashboardDto> {
  const query = useMemo(() => buildPerformanceQuery(selection), [selection]);
  const load = useCallback(
    (signal: AbortSignal) => performanceApi.dashboard(query, signal),
    [query],
  );
  return useDecisionRequest(
    load,
    performanceQueryKey(selection),
    'Falha ao carregar o painel longitudinal de desempenho.',
  );
}
