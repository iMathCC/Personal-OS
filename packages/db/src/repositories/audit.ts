/**
 * Minimização aplicada a TODO snapshot gravado por `auditStatement`.
 *
 * A auditoria precisa de identificadores, estados e metadados estruturados.
 * Texto livre (descrições, notas, nomes, tópicos e motivos) não é necessário
 * para reconstruir a operação e pode conter dados pessoais. `title` é mantido
 * com limite porque a linha do tempo usa esse campo para rotular eventos.
 */

const MAX_TITLE_LENGTH = 200;
const MAX_STRING_LENGTH = 512;

const FREE_TEXT_KEYS = new Set([
  'authorization',
  'body',
  'changenote',
  'comment',
  'comments',
  'cookie',
  'description',
  'hypotheses',
  'justification',
  'name',
  'note',
  'notes',
  'password',
  'payload',
  'rawbody',
  'reason',
  'requestbody',
  'secret',
  'statement',
  'successcriteria',
  'token',
  'topic',
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function boundedString(value: string, maxLength: number): string {
  // Remove controles (inclusive quebras) sem alterar o conteúdo legível.
  let cleaned = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    cleaned += codePoint < 32 || codePoint === 127 ? ' ' : character;
  }
  const clean = cleaned.trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return boundedString(value, MAX_STRING_LENGTH);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value !== 'object' || value === null) return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (FREE_TEXT_KEYS.has(normalizedKey(key))) continue;
    output[key] =
      key === 'title' && typeof item === 'string'
        ? boundedString(item, MAX_TITLE_LENGTH)
        : sanitizeValue(item);
  }
  return output;
}

/** Retorna JSON seguro para `audit_log`; snapshots inválidos são descartados. */
export function sanitizeAuditJson(json: string | null | undefined): string | null {
  if (json === null || json === undefined) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  return JSON.stringify(sanitizeValue(value));
}
