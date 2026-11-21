import type { HealthResponse } from '@personal-os/shared';
import type { NavigationItem } from '@/lib/navigation';

export type AreaStatus = 'active' | 'no-data' | 'loading' | 'not-configured' | 'planned';

export interface AreaStatusContext {
  readonly health: HealthResponse | null;
  readonly counts: { passkeys: number; activeSessions: number };
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

  if (item.key === 'settings') {
    return context.counts.passkeys > 0 && context.counts.activeSessions > 0 ? 'active' : 'no-data';
  }

  return 'no-data';
}

export function areaStatusLabel(status: AreaStatus): string {
  switch (status) {
    case 'active':
      return 'Ativa';
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
