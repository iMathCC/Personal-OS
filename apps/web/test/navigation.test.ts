import { describe, expect, it } from 'vitest';
import {
  availabilityLabel,
  findNavigationItem,
  isPathActive,
  NAVIGATION_GROUPS,
  NAVIGATION_ITEMS,
} from '@/lib/navigation';

describe('navegação principal', () => {
  it('expõe as dez áreas previstas, com caminhos únicos', () => {
    expect(NAVIGATION_ITEMS).toHaveLength(10);
    expect(new Set(NAVIGATION_ITEMS.map((item) => item.path)).size).toBe(10);
    expect(NAVIGATION_GROUPS.map((group) => group.id)).toEqual(['core', 'life', 'system']);
  });

  it('marca apenas visão geral e configurações como disponíveis', () => {
    const available = NAVIGATION_ITEMS.filter((item) => item.availability === 'available').map(
      (item) => item.key,
    );
    expect(available).toEqual(['overview', 'settings']);
    expect(NAVIGATION_ITEMS.some((item) => item.availability === 'not-configured')).toBe(true);
    expect(NAVIGATION_ITEMS.some((item) => item.availability === 'planned')).toBe(true);
  });

  it('resolve a rota ativa sem confundir a raiz com os demais caminhos', () => {
    expect(isPathActive('/', '/')).toBe(true);
    expect(isPathActive('/configuracoes', '/')).toBe(false);
    expect(isPathActive('/objetivos/novo', '/objetivos')).toBe(true);
    expect(findNavigationItem('/financas')?.key).toBe('finance');
  });

  it('retorna indefinido para rotas inexistentes e rótulos honestos para estados', () => {
    expect(findNavigationItem('/inexistente')).toBeUndefined();
    expect(availabilityLabel('available')).toBe('Disponível');
    expect(availabilityLabel('not-configured')).toBe('Não configurada');
    expect(availabilityLabel('planned')).toBe('Em preparação');
  });
});
