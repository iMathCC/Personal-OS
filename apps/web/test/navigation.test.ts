import { describe, expect, it } from 'vitest';
import {
  availabilityLabel,
  findNavigationItem,
  isPathActive,
  NAVIGATION_GROUPS,
  NAVIGATION_ITEMS,
} from '@/lib/navigation';

describe('navegação principal', () => {
  it('expõe áreas com caminhos únicos e grupos conhecidos', () => {
    expect(NAVIGATION_ITEMS.length).toBeGreaterThan(0);
    expect(new Set(NAVIGATION_ITEMS.map((item) => item.path)).size).toBe(NAVIGATION_ITEMS.length);
    expect(new Set(NAVIGATION_ITEMS.map((item) => item.key)).size).toBe(NAVIGATION_ITEMS.length);
    expect(NAVIGATION_GROUPS.map((group) => group.id)).toEqual(['core', 'life', 'system']);
  });

  it('inclui as rotas principais do D36/D37 como disponíveis', () => {
    const available = new Set(
      NAVIGATION_ITEMS.filter((item) => item.availability === 'available').map((item) => item.key),
    );
    const keys = [
      'overview',
      'today',
      'dailyReview',
      'observations',
      'studies',
      'settings',
    ] as const;
    for (const key of keys) {
      expect(available.has(key)).toBe(true);
    }
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
