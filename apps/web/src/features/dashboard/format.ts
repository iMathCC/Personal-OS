const LOCALE = 'pt-BR';
const FALLBACK_TIMEZONE = 'America/Sao_Paulo';

function safeTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** "Hoje" vem do fuso do usuário, nunca do fuso do servidor. */
export function formatToday(timezone: string, now: Date): string {
  const value = new Intl.DateTimeFormat(LOCALE, {
    timeZone: safeTimezone(timezone),
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatClock(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: safeTimezone(timezone),
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant));
}
