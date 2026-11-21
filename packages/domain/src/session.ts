export const MAX_ACTIVE_SESSIONS = 10;
export const SESSION_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const SESSION_INACTIVITY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000;
export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_ABSOLUTE_TTL_MS / 1000;

export interface SessionPolicyRecord {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

function parsed(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isSessionActive(session: SessionPolicyRecord, now: number): boolean {
  if (session.revokedAt !== null) {
    return false;
  }

  const createdAt = parsed(session.createdAt);
  const lastSeenAt = parsed(session.lastSeenAt);
  const expiresAt = parsed(session.expiresAt);
  if (createdAt === null || lastSeenAt === null || expiresAt === null) {
    return false;
  }

  return (
    now < expiresAt &&
    now < createdAt + SESSION_ABSOLUTE_TTL_MS &&
    now < lastSeenAt + SESSION_INACTIVITY_TTL_MS
  );
}

export function shouldRefreshLastSeen(session: SessionPolicyRecord, now: number): boolean {
  const lastSeenAt = parsed(session.lastSeenAt);
  return lastSeenAt !== null && now - lastSeenAt >= LAST_SEEN_REFRESH_MS;
}

/**
 * Quantas sessões revogar ANTES de inserir a nova para terminar com no máximo
 * `maxActive`. Ordena por último uso (LRU) e desempata por criação e ID.
 */
export function selectLruRevocations(
  sessions: readonly SessionPolicyRecord[],
  now: number,
  maxActive = MAX_ACTIVE_SESSIONS,
): string[] {
  const active = sessions.filter((session) => isSessionActive(session, now));
  const excess = active.length - maxActive + 1;
  if (excess <= 0) {
    return [];
  }

  return [...active]
    .sort((left, right) => {
      const byLastSeen = Date.parse(left.lastSeenAt) - Date.parse(right.lastSeenAt);
      if (byLastSeen !== 0) {
        return byLastSeen;
      }
      const byCreation = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      return byCreation !== 0 ? byCreation : left.id.localeCompare(right.id);
    })
    .slice(0, excess)
    .map((session) => session.id);
}

export function summarizeUserAgent(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim().length === 0) {
    return 'Dispositivo desconhecido';
  }

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Navegador';
  const platform = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'Outro';

  return `${browser} · ${platform}`;
}
