import { CSRF_TOKEN_BYTES, SESSION_COOKIE_MAX_AGE_SECONDS } from '@personal-os/domain';
import type { Env } from '../../env';

export const SESSION_COOKIE = '__Host-pos_session';
export const CSRF_COOKIE = 'pos_csrf';
export const VID_COOKIE = 'pos_vid';
export const SESSION_MAX_AGE_SECONDS = SESSION_COOKIE_MAX_AGE_SECONDS;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, '0');
  }
  return output;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashWithSalt(value: string | null, salt: string): Promise<string | null> {
  return value === null || value.length === 0 ? null : sha256Hex(`${salt}:${value}`);
}

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)
  );
}

function isIpv6(value: string): boolean {
  if (value.includes('%')) return false;
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) return false;
  try {
    const parsed = new URL(`http://[${value}]/`);
    return parsed.hostname.toLowerCase() === `[${value.toLowerCase()}]`;
  } catch {
    return false;
  }
}

/**
 * Somente o cabeçalho injetado pelo runtime Cloudflare é confiável. Valores
 * arbitrários (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`) são ignorados,
 * assim como valores vazios ou que não sejam um literal IP válido.
 */
export function trustedClientIp(headers: Headers): string | null {
  const value = headers.get('CF-Connecting-IP');
  if (value === null || value.length === 0 || value.length > 45 || value.trim() !== value) {
    return null;
  }
  return isIpv4(value) || isIpv6(value) ? value : null;
}

export type RequestOriginKind = 'trusted-ip' | 'local-test' | 'unavailable';

export function allowedOrigins(env: Env): string[] {
  return env.ORIGIN.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => origin.length > 0);
}

export function requestOrigin(headers: Headers): string | null {
  const origin = headers.get('Origin');
  if (origin !== null && origin.length > 0) {
    return origin.replace(/\/$/, '');
  }

  const referer = headers.get('Referer');
  if (referer === null) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(signature));
}

export function csrfSubject(sessionTokenHash: string | null, posVid: string): string {
  return sessionTokenHash === null ? `anon:${posVid}` : `session:${sessionTokenHash}`;
}

export async function createCsrfToken(secret: string, subject: string): Promise<string> {
  const nonce = randomToken(CSRF_TOKEN_BYTES);
  const signature = await hmacHex(secret, `${subject}.${nonce}`);
  return `${nonce}.${signature}`;
}

export async function verifyCsrfToken(
  secret: string,
  subject: string,
  token: string,
): Promise<boolean> {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    return false;
  }
  const nonce = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = await hmacHex(secret, `${subject}.${nonce}`);
  return constantTimeEqual(expected, signature);
}

export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (header === null) {
    return cookies;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

export function csrfCookie(token: string): string {
  return `${CSRF_COOKIE}=${encodeURIComponent(token)}; Max-Age=86400; Secure; SameSite=Lax; Path=/`;
}

export function deviceCookie(posVid: string): string {
  return `${VID_COOKIE}=${encodeURIComponent(posVid)}; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax; Path=/`;
}
