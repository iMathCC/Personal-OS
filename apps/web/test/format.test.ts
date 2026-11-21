import { describe, expect, it } from 'vitest';
import { formatClock, formatToday } from '@/features/dashboard/format';

describe('formatação no fuso do usuário', () => {
  const now = new Date('2026-11-21T02:30:00.000Z');

  it('usa o fuso configurado para definir o dia', () => {
    expect(formatToday('America/Sao_Paulo', now)).toBe('Sexta-feira, 20 de novembro');
    expect(formatToday('UTC', now)).toBe('Sábado, 21 de novembro');
  });

  it('cai para o fuso padrão quando o valor é inválido', () => {
    expect(formatToday('Fuso/Que/Nao/Existe', now)).toBe('Sexta-feira, 20 de novembro');
  });

  it('formata horários com o mesmo fuso', () => {
    expect(formatClock('2026-11-21T02:30:00.000Z', 'America/Sao_Paulo')).toBe('23:30');
  });
});
