export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'sem estimativa';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatDate(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    planned: 'Planejado',
    active: 'Ativo',
    paused: 'Pausado',
    completed: 'Concluído',
    cancelled: 'Cancelado',
    draft: 'Rascunho',
    superseded: 'Substituído',
    archived: 'Arquivado',
    saved: 'Salvo',
    updated: 'Atualizado',
  };
  return labels[status] ?? status;
}

export function linesToArray(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function arrayToLines(values: readonly string[]): string {
  return values.join('\n');
}
