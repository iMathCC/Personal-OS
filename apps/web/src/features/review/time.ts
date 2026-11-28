/** Segunda-feira ISO de uma data local, sem usar o fuso do navegador. */
export function weekStartFor(localDate: string): string {
  const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const instant = new Date(`${localDate}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() - offset);
  return instant.toISOString().slice(0, 10);
}

export function previousWeekStart(weekStart: string): string {
  const instant = new Date(`${weekStart}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() - 7);
  return instant.toISOString().slice(0, 10);
}
