import type { HealthResponse } from '@personal-os/shared';
import type { NavigationItem } from '@/lib/navigation';

export type AreaStatus =
  'active' | 'available' | 'no-data' | 'loading' | 'not-configured' | 'planned';

export interface AreaStatusContext {
  readonly health: HealthResponse | null;
  readonly counts: { passkeys: number; activeSessions: number };
  /** Sinal real de Estudos; ausente enquanto carrega ou em erro. */
  readonly studies?: { sessionCount: number };
  /** Sinal real de Objetivos; ausente enquanto carrega ou em erro. */
  readonly goals?: { total: number };
  /** Sinais reais de Execução; ausentes quando a consulta falha ou carrega. */
  readonly execution?: {
    activeProjects: number;
    taskSignals: number;
    projects: number;
  };
  /** Distingue o carregamento inicial de uma resposta válida sem dados. */
  readonly loading?: boolean;
}

/**
 * O status só pode subir para "active" quando existe dado real vindo da API.
 * Áreas sem endpoint recebem o estado previsto no roadmap — nunca "ativo".
 */
export function deriveAreaStatus(item: NavigationItem, context: AreaStatusContext): AreaStatus {
  if (item.availability === 'planned') return 'planned';
  if (item.availability === 'not-configured') return 'not-configured';

  if (item.key === 'overview') {
    if (context.loading === true) return 'loading';
    if (context.health === null) return 'no-data';
    return context.health.status === 'ok' && context.health.db === 'ok' ? 'active' : 'no-data';
  }

  if (item.key === 'goals') {
    if (context.loading === true) return 'loading';
    return (context.goals?.total ?? 0) > 0 ? 'active' : 'no-data';
  }

  if (item.key === 'projects') {
    if (context.loading === true) return 'loading';
    return (context.execution?.activeProjects ?? 0) > 0 ? 'active' : 'no-data';
  }

  if (item.key === 'tasks') {
    if (context.loading === true) return 'loading';
    return (context.execution?.taskSignals ?? 0) > 0 ? 'active' : 'no-data';
  }

  if (item.key === 'execution') {
    if (context.loading === true) return 'loading';
    const execution = context.execution;
    return execution !== undefined &&
      (execution.taskSignals > 0 || execution.activeProjects > 0 || execution.projects > 0)
      ? 'active'
      : 'no-data';
  }

  if (item.key === 'settings') {
    return context.counts.passkeys > 0 && context.counts.activeSessions > 0 ? 'active' : 'no-data';
  }

  if (item.key === 'studies') {
    if (context.loading === true) return 'loading';
    return (context.studies?.sessionCount ?? 0) > 0 ? 'active' : 'no-data';
  }

  /**
   * Módulos disponíveis sem sinal carregado nesta visão não são "sem dados":
   * a consulta do dashboard simplesmente não cobre essas áreas.
   */
  if (context.loading === true) return 'loading';
  return 'available';
}

export function areaStatusLabel(status: AreaStatus): string {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'available':
      return 'Disponível';
    case 'no-data':
      return 'Sem dados';
    case 'loading':
      return 'Carregando';
    case 'not-configured':
      return 'Não configurada';
    case 'planned':
      return 'Em preparação';
  }
}

export type CoverageState = 'loaded' | 'loading' | 'unavailable';

export interface DataCoverageItem {
  readonly key: 'api' | 'studies' | 'goals' | 'execution';
  readonly label: string;
  readonly state: CoverageState;
}

/**
 * Cobertura explícita das fontes usadas pela visão geral. `null` é indisponível,
 * nunca zero: ausência de resposta não é dado vazio.
 */
export function deriveDataCoverage(
  context: AreaStatusContext,
  executionLoading = false,
): DataCoverageItem[] {
  const loading = context.loading === true;
  function stateFor(present: boolean, areaLoading: boolean): CoverageState {
    if (loading || areaLoading) return 'loading';
    return present ? 'loaded' : 'unavailable';
  }
  return [
    { key: 'api', label: 'API', state: stateFor(context.health !== null, false) },
    { key: 'studies', label: 'Estudos', state: stateFor(context.studies !== undefined, false) },
    { key: 'goals', label: 'Objetivos', state: stateFor(context.goals !== undefined, false) },
    {
      key: 'execution',
      label: 'Execução',
      state: stateFor(context.execution !== undefined, executionLoading),
    },
  ];
}

export function coverageLabel(state: CoverageState): string {
  if (state === 'loaded') return 'Carregado';
  if (state === 'loading') return 'Carregando';
  return 'Indisponível';
}
