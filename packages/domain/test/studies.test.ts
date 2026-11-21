import { describe, expect, it } from 'vitest';
import {
  assertClientKey,
  assertDateRange,
  assertIanaTimezone,
  assertResultSize,
  assertSnapshotField,
  buildDailySeries,
  buildWeeklySeries,
  canonicalIdempotencyKey,
  dayCount,
  decodeCursor,
  DomainError,
  encodeKeyPart,
  localDateFor,
  makeCursor,
  MAX_SERIES_DAYS,
  mirrorFor,
  summarizeStudyMinutes,
  weekStartFor,
  RESULT_BODY_MAX_BYTES,
} from '../src';

const NOW = Date.parse('2026-11-21T02:30:00.000Z');

describe('tempo local e timezone IANA', () => {
  it('calcula local_date no fuso do usuário, nunca no do servidor', () => {
    expect(localDateFor(NOW, 'America/Sao_Paulo')).toBe('2026-11-20');
    expect(localDateFor(NOW, 'UTC')).toBe('2026-11-21');
    expect(localDateFor(NOW, 'Asia/Tokyo')).toBe('2026-11-21');
  });

  it('rejeita timezone inválida', () => {
    expect(() => assertIanaTimezone('Marte/Fobos')).toThrow(DomainError);
    expect(assertIanaTimezone('Europe/Lisbon')).toBe('Europe/Lisbon');
  });

  it('conta dias inclusive e limita o intervalo', () => {
    expect(dayCount('2026-11-20', '2026-11-22')).toBe(3);
    expect(dayCount('2026-11-22', '2026-11-20')).toBe(0);
    expect(() => assertDateRange({ from: '2026-01-01', to: '2028-01-01' })).toThrow(/limite/);
    expect(MAX_SERIES_DAYS).toBe(366);
  });
});

describe('séries sob demanda', () => {
  const samples = [
    { localDate: '2026-11-18', valueNum: 30 },
    { localDate: '2026-11-18', valueNum: 15 },
    { localDate: '2026-11-20', valueNum: 50 },
    { localDate: '2026-11-25', valueNum: 10 },
  ];
  const range = { from: '2026-11-18', to: '2026-11-21' };

  it('preenche lacunas com null explícito e soma amostras do dia', () => {
    const points = buildDailySeries(samples, range);
    expect(points).toEqual([
      { date: '2026-11-18', value: 45, sampleCount: 2 },
      { date: '2026-11-19', value: null, sampleCount: 0 },
      { date: '2026-11-20', value: 50, sampleCount: 1 },
      { date: '2026-11-21', value: null, sampleCount: 0 },
    ]);
  });

  it('ignora amostras fora do intervalo e agrupa por semana iniciando na segunda', () => {
    expect(weekStartFor('2026-11-21')).toBe('2026-11-16');
    expect(weekStartFor('2026-11-22')).toBe('2026-11-16');
    expect(weekStartFor('2026-11-23')).toBe('2026-11-23');
    expect(buildWeeklySeries(samples, range)).toEqual([
      { date: '2026-11-16', value: 95, sampleCount: 3 },
    ]);
  });

  it('resume minutos, sessões, dias e média', () => {
    expect(summarizeStudyMinutes(samples)).toEqual({
      totalMinutes: 105,
      sessionCount: 4,
      daysStudied: 3,
      averageMinutes: 26.25,
    });
    expect(summarizeStudyMinutes([]).averageMinutes).toBeNull();
  });
});

describe('chave idempotente canônica', () => {
  it('codifica cada parte de forma injetiva', () => {
    expect(encodeKeyPart('a|b')).toBe('a%7Cb');
    expect(encodeKeyPart('100%')).toBe('100%25');
    expect(encodeKeyPart('a b')).toBe('a%20b');
  });

  it('gera chaves distintas para tuplos distintos', () => {
    const key = canonicalIdempotencyKey('user|1', 'post', '/api/v1/x', 'a b');
    expect(key).toBe('v1|user%7C1|POST|%2Fapi%2Fv1%2Fx|a%20b');
    expect(canonicalIdempotencyKey('user', '1|post', '/x', 'a')).not.toBe(key);
    expect(canonicalIdempotencyKey('user', 'POST', '/x', 'a')).not.toBe(key);
  });

  it('valida a chave do cliente', () => {
    expect(assertClientKey('chave-123')).toBe('chave-123');
    expect(() => assertClientKey('  espaços  ')).toThrow(DomainError);
    expect(() => assertClientKey('linha\nquebrada')).toThrow(DomainError);
    expect(() => assertClientKey(null)).toThrow(DomainError);
  });
});

describe('cursor e snapshots', () => {
  it('codifica e decodifica cursor opaco', () => {
    const cursor = makeCursor('2026-11-21T12:00:00.000Z', 'session-1');
    expect(cursor).not.toContain('session-1');
    expect(decodeCursor(cursor)).toBe('2026-11-21T12:00:00.000Z\u0000session-1');
    expect(() => decodeCursor('???')).toThrow(DomainError);
  });

  it('diferencia chave ausente de null explícito no snapshot', () => {
    const persisted = { courseId: null, durationMinutes: 30 };
    expect(() => assertSnapshotField({ durationMinutes: 30 }, persisted, 'courseId')).toThrow(
      /ausente/,
    );
    expect(() =>
      assertSnapshotField({ courseId: null, durationMinutes: 30 }, persisted, 'courseId'),
    ).not.toThrow();
    expect(() => assertSnapshotField({ courseId: null }, persisted, 'courseId')).not.toThrow();
  });

  it('rejeita snapshot divergente da entidade persistida', () => {
    expect(() =>
      assertSnapshotField({ durationMinutes: 31 }, { durationMinutes: 30 }, 'durationMinutes'),
    ).toThrow(/divergente/);
  });
});

describe('limites de resultado e espelho', () => {
  it('aborta quando o resultado excede o limite', () => {
    expect(() => assertResultSize('x'.repeat(RESULT_BODY_MAX_BYTES))).not.toThrow();
    expect(() => assertResultSize('x'.repeat(RESULT_BODY_MAX_BYTES + 1))).toThrow(
      /RESULT_STORE_TOO_LARGE/,
    );
  });

  it('omite somente o espelho quando o corpo é grande', () => {
    expect(mirrorFor('{"a":1}')).toEqual({ mirror: '{"a":1}', bodyOmitted: false });
    const large = 'x'.repeat(9000);
    expect(mirrorFor(large)).toEqual({ mirror: 'null', bodyOmitted: true });
  });
});
