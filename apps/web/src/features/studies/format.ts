import type { GoalProgressDto, PeriodDelta } from '@personal-os/shared';

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest} min`;
  return `${hours} h ${rest} min`;
}

export function formatDelta(delta: PeriodDelta): string {
  const signal = delta.difference > 0 ? '+' : '';
  const percent =
    delta.changePercent === null ? 'base sem dados' : `${signal}${delta.changePercent.toFixed(0)}%`;
  return `${signal}${delta.difference} (${percent})`;
}

export function goalBasisLabel(basis: GoalProgressDto['basis']): string {
  switch (basis) {
    case 'metrics':
      return 'calculado a partir de minutos registrados';
    case 'manual':
      return 'progresso informado manualmente';
    case 'status':
      return 'concluída';
    case 'unavailable':
      return 'sem dados suficientes';
  }
}
