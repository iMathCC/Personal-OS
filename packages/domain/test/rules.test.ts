import { describe, expect, it } from 'vitest';
import {
  assertChallengeUsable,
  assertRecoveryTokenUsable,
  assertSetupAvailable,
  canRunSetup,
  classifyCounter,
  counterForVerification,
  counterFromAuthenticatorData,
  DomainError,
  evaluateRateLimit,
  formatRecoveryCode,
  hexToBytes,
  isRecoveryCode,
  nextRateLimitState,
  normalizeRecoveryCode,
  RATE_LIMIT_RULES,
  RECOVERY_CODE_BYTES,
  selectLruRevocations,
  shouldRefreshLastSeen,
  summarizeUserAgent,
  trustedCounter,
  windowStartFor,
  type SessionPolicyRecord,
} from '../src';

const NOW = Date.parse('2026-11-20T12:00:00.000Z');

function session(id: string, lastSeen: string, overrides: Partial<SessionPolicyRecord> = {}) {
  return {
    id,
    createdAt: '2026-11-01T12:00:00.000Z',
    lastSeenAt: lastSeen,
    expiresAt: '2026-12-01T12:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

describe('regras de sessão', () => {
  it('aceita sessão ativa dentro da absoluta e da inatividade', () => {
    const active = session('a', '2026-11-20T11:00:00.000Z');
    expect(selectLruRevocations([active], NOW)).toEqual([]);
    expect(shouldRefreshLastSeen(active, NOW)).toBe(true);
  });

  it('rejeita revogada, expirada, inativa e com datas inválidas', () => {
    const revoked = session('r', '2026-11-20T11:00:00.000Z', {
      revokedAt: '2026-11-20T11:30:00.000Z',
    });
    const expired = session('e', '2026-11-20T11:00:00.000Z', {
      expiresAt: '2026-11-20T11:59:00.000Z',
    });
    const idle = session('i', '2026-10-20T12:00:00.000Z');
    const invalid = session('x', 'not-a-date');

    expect(selectLruRevocations([revoked, expired, idle, invalid], NOW)).toEqual([]);
  });

  it('atualiza last_seen após uma hora', () => {
    expect(shouldRefreshLastSeen(session('a', '2026-11-20T10:59:59.000Z'), NOW)).toBe(true);
  });

  it('seleciona exatamente as sessões LRU excedentes', () => {
    const sessions = [
      session('newest', '2026-11-20T11:50:00.000Z'),
      session('oldest', '2026-11-20T09:00:00.000Z'),
      session('middle', '2026-11-20T10:00:00.000Z'),
    ];
    // Com 3 ativas e limite 2, duas precisam sair para abrir espaço à nova.
    expect(selectLruRevocations(sessions, NOW, 2)).toEqual(['oldest', 'middle']);
    expect(selectLruRevocations(sessions, NOW, 4)).toEqual([]);
  });

  it('desempata LRU por criação e ID', () => {
    const first = session('a', '2026-11-20T10:00:00.000Z', {
      createdAt: '2026-11-01T10:00:00.000Z',
    });
    const second = session('b', '2026-11-20T10:00:00.000Z', {
      createdAt: '2026-11-01T11:00:00.000Z',
    });
    expect(selectLruRevocations([second, first], NOW, 2)).toEqual(['a']);
  });

  it('resume user agent sem expor detalhes', () => {
    expect(summarizeUserAgent(null)).toBe('Dispositivo desconhecido');
    expect(summarizeUserAgent('')).toBe('Dispositivo desconhecido');
    expect(summarizeUserAgent('Mozilla/5.0 (iPhone) AppleWebKit/605.1 Safari/605.1')).toBe(
      'Safari · iOS',
    );
    expect(summarizeUserAgent('Mozilla/5.0 (Windows NT 10.0) Firefox/140.0')).toBe(
      'Firefox · Windows',
    );
    expect(summarizeUserAgent('curl/8.0')).toBe('Navegador · Outro');
  });
});

describe('classificação de contadores WebAuthn', () => {
  it('aceita zero, progresso e classifica igualdade/regressão como anomalia', () => {
    expect(classifyCounter(0, 0)).toBe('zero');
    expect(classifyCounter(5, 8)).toBe('advance');
    expect(classifyCounter(5, 5)).toBe('anomaly');
    expect(classifyCounter(5, 3)).toBe('anomaly');
    expect(classifyCounter(5, 0)).toBe('anomaly');
  });

  it('preserva o último contável confiável', () => {
    expect(trustedCounter(0, 0)).toBe(0);
    expect(trustedCounter(4, 9)).toBe(9);
    expect(trustedCounter(7, 7)).toBe(7);
    expect(trustedCounter(7, 2)).toBe(7);
  });

  it('calcula contador seguro apenas para a verificação criptográfica', () => {
    expect(counterForVerification(0, 0)).toBe(0);
    expect(counterForVerification(4, 9)).toBe(4);
    expect(counterForVerification(7, 7)).toBe(6);
    expect(counterForVerification(7, 2)).toBe(1);
    expect(counterForVerification(7, 0)).toBe(0);
  });

  it('lê contador de authenticatorData', () => {
    const data = new Uint8Array(37);
    const view = new DataView(data.buffer);
    view.setUint32(33, 258, false);
    expect(counterFromAuthenticatorData(data)).toBe(258);
    expect(counterFromAuthenticatorData(new Uint8Array(36))).toBeNull();
  });
});

describe('códigos e tokens', () => {
  it('formata e normaliza código de 128 bits', () => {
    const bytes = new Uint8Array(RECOVERY_CODE_BYTES).fill(0xab);
    const code = formatRecoveryCode(bytes);
    expect(code).toBe('abababab-abababab-abababab-abababab');
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(code);
    expect(normalizeRecoveryCode(` ${code.replaceAll('-', ' ')} `)).toBe(code);
    expect(isRecoveryCode(code)).toBe(true);
  });

  it('rejeita códigos malformados', () => {
    expect(normalizeRecoveryCode('abc')).toBeNull();
    expect(normalizeRecoveryCode('g'.repeat(32))).toBeNull();
    expect(isRecoveryCode('AAAA-AAAA')).toBe(false);
    expect(hexToBytes('abc')).toBeNull();
    expect(hexToBytes('zz')).toBeNull();
    expect(hexToBytes('0a')).toEqual(new Uint8Array([10]));
  });

  it('exige 16 bytes para formatar', () => {
    expect(() => formatRecoveryCode(new Uint8Array(8))).toThrow();
  });
});

describe('rate limiting', () => {
  it('usa janela fixa alinhada', () => {
    expect(windowStartFor(NOW, 60_000)).toBe(Math.floor(NOW / 60_000) * 60_000);
  });

  it('permite até o limite e bloqueia o próximo', () => {
    const rule = RATE_LIMIT_RULES.recoveryVerify;
    const state = { windowStart: windowStartFor(NOW, rule.windowMs), count: 5, failures: 0 };
    expect(evaluateRateLimit(state, rule, NOW)).toMatchObject({
      allowed: false,
      reason: 'request-limit',
    });
    expect(evaluateRateLimit({ ...state, count: 4 }, rule, NOW).allowed).toBe(true);
  });

  it('aplica limite de falhas quando configurado', () => {
    const rule = RATE_LIMIT_RULES.loginVerify;
    const state = { windowStart: windowStartFor(NOW, rule.windowMs), count: 2, failures: 5 };
    expect(evaluateRateLimit(state, rule, NOW).allowed).toBe(false);
  });

  it('reinicia a janela expirada e calcula próximo estado', () => {
    const rule = RATE_LIMIT_RULES.loginOptions;
    const expired = { windowStart: 0, count: 99, failures: 99 };
    expect(evaluateRateLimit(expired, rule, NOW)).toMatchObject({
      allowed: true,
      resetWindow: true,
    });
    expect(nextRateLimitState(expired, rule, NOW, true)).toEqual({
      windowStart: windowStartFor(NOW, rule.windowMs),
      count: 1,
      failures: 1,
    });
  });
});

describe('estados de autenticação', () => {
  it('só permite setup sem conclusão', () => {
    expect(canRunSetup(null)).toBe(true);
    expect(canRunSetup({ setupCompletedAt: null })).toBe(true);
    expect(canRunSetup({ setupCompletedAt: '2026-11-20T12:00:00.000Z' })).toBe(false);
    expect(() => assertSetupAvailable(null)).not.toThrow();
    expect(() => assertSetupAvailable({ setupCompletedAt: '2026-11-20T12:00:00.000Z' })).toThrow(
      DomainError,
    );
  });

  it('valida desafio por propósito, consumo e expiração', () => {
    const valid = {
      purpose: 'login' as const,
      consumedAt: null,
      expiresAt: '2026-11-20T12:10:00.000Z',
    };
    expect(() => assertChallengeUsable(valid, 'login', NOW)).not.toThrow();
    expect(() => assertChallengeUsable(null, 'login', NOW)).toThrow('inválido');
    expect(() => assertChallengeUsable({ ...valid, purpose: 'setup' }, 'login', NOW)).toThrow();
    expect(() =>
      assertChallengeUsable({ ...valid, consumedAt: '2026-11-20T12:01:00.000Z' }, 'login', NOW),
    ).toThrow();
    expect(() =>
      assertChallengeUsable({ ...valid, expiresAt: '2026-11-20T11:59:00.000Z' }, 'login', NOW),
    ).toThrow();
  });

  it('valida token de recuperação', () => {
    const valid = { consumedAt: null, expiresAt: '2026-11-20T12:10:00.000Z' };
    expect(() => assertRecoveryTokenUsable(valid, NOW)).not.toThrow();
    expect(() => assertRecoveryTokenUsable(null, NOW)).toThrow();
    expect(() =>
      assertRecoveryTokenUsable({ ...valid, consumedAt: '2026-11-20T12:01:00.000Z' }, NOW),
    ).toThrow();
    expect(() =>
      assertRecoveryTokenUsable({ ...valid, expiresAt: '2026-11-20T11:00:00.000Z' }, NOW),
    ).toThrow();
  });
});
