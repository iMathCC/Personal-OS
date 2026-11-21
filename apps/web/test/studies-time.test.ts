import { describe, expect, it } from 'vitest';
import { localDateIn, shiftLocalDate, zonedDateTimeToIso } from '@/features/studies/time';

describe('conversão de horário local de estudos', () => {
  it('deriva a data local no fuso da conta, não no do servidor', () => {
    const instant = new Date('2026-11-21T02:30:00.000Z');
    expect(localDateIn('America/Sao_Paulo', instant)).toBe('2026-11-20');
    expect(localDateIn('UTC', instant)).toBe('2026-11-21');
  });

  it('desloca datas sem depender do fuso do servidor', () => {
    expect(shiftLocalDate('2026-11-21', -1)).toBe('2026-11-20');
    expect(shiftLocalDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftLocalDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('converte hora de parede para instante UTC com offset correto', () => {
    // Sem DST em 2026 no Brasil: -03:00 em novembro.
    expect(zonedDateTimeToIso('2026-11-20', '23:30', 'America/Sao_Paulo')).toBe(
      '2026-11-21T02:30:00.000Z',
    );
    expect(zonedDateTimeToIso('2026-11-21', '09:00', 'UTC')).toBe('2026-11-21T09:00:00.000Z');
  });

  it('aplica o offset de DST em fusos que observam horário de verão', () => {
    // Nova York em janeiro: -05:00.
    expect(zonedDateTimeToIso('2026-01-15', '09:00', 'America/New_York')).toBe(
      '2026-01-15T14:00:00.000Z',
    );
    // Nova York em julho: -04:00.
    expect(zonedDateTimeToIso('2026-07-15', '09:00', 'America/New_York')).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('rejeita entrada inválida', () => {
    expect(() => zonedDateTimeToIso('invalida', '09:00', 'UTC')).toThrow();
  });
});
