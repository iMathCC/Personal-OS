import type { GoalAttentionDto, LifeGoalDto } from '@personal-os/shared';

export function formatPercent(value: number | null): string {
  return value === null ? 'Sem dados' : `${value.toFixed(1).replace(/\.0$/u, '')}%`;
}

export function formatGoalDate(value: string | null): string {
  if (value === null) return 'Sem prazo';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function statusLabel(status: LifeGoalDto['status']): string {
  switch (status) {
    case 'draft':
      return 'Rascunho';
    case 'active':
      return 'Ativo';
    case 'paused':
      return 'Pausado';
    case 'achieved':
      return 'Concluído';
    case 'cancelled':
      return 'Cancelado';
  }
}

export function horizonLabel(horizon: LifeGoalDto['horizon']): string {
  switch (horizon) {
    case 'short':
      return 'Curto prazo';
    case 'medium':
      return 'Médio prazo';
    case 'long':
      return 'Longo prazo';
  }
}

export function attentionLabel(level: GoalAttentionDto['level']): string {
  switch (level) {
    case 'none':
      return 'Sem sinal';
    case 'low':
      return 'Atenção baixa';
    case 'medium':
      return 'Atenção média';
    case 'high':
      return 'Atenção alta';
  }
}

export function progressBasisLabel(basis: LifeGoalDto['progress']['basis']): string {
  switch (basis) {
    case 'manual':
      return 'Registro manual';
    case 'metrics':
      return 'Métrica calculada';
    case 'status':
      return 'Estado do objetivo';
    case 'unavailable':
      return 'Sem dados suficientes';
  }
}
