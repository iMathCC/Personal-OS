const LOCALE = 'pt-BR';

function safeTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    return 'UTC';
  }
}

/** `YYYY-MM-DD` no fuso informado — nunca no fuso do servidor. */
export function localDateIn(timezone: string, instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Subtrai N dias de uma data local sem usar fuso do servidor. */
export function shiftLocalDate(localDate: string, days: number): string {
  const instant = new Date(`${localDate}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

/**
 * Converte hora de parede em um fuso IANA para instante UTC sem biblioteca de
 * timezone. A iteração resolve o offset (inclusive trocas de DST) porque o
 * `Intl` devolve a hora local do instante candidato.
 */
export function zonedDateTimeToIso(localDate: string, localTime: string, timezone: string): string {
  const target = Date.parse(`${localDate}T${localTime}:00.000Z`);
  if (Number.isNaN(target)) throw new Error('Data e hora inválidas.');
  const zone = safeTimezone(timezone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(instant));
    const value = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');
    const hour = value('hour') === 24 ? 0 : value('hour');
    const wallAsUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      hour,
      value('minute'),
      value('second'),
    );
    const correction = target - wallAsUtc;
    instant += correction;
    if (correction === 0) break;
  }
  return new Date(instant).toISOString();
}
