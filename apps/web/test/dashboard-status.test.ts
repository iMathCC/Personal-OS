import type { HealthResponse } from '@personal-os/shared';
import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS } from '@/lib/navigation';
import { areaStatusLabel, deriveAreaStatus } from '@/features/dashboard/status';

const healthy: HealthResponse = {
  status: 'ok',
  db: 'ok',
  version: '0.1.0',
  time: '2026-11-21T12:00:00.000Z',
};

const counts = { passkeys: 1, activeSessions: 1 };

describe('status das áreas do dashboard', () => {
  it('só marca uma área como ativa quando há dado real da API', () => {
    const overview = NAVIGATION_ITEMS.find((item) => item.key === 'overview');
    const settings = NAVIGATION_ITEMS.find((item) => item.key === 'settings');
    expect(overview).toBeDefined();
    expect(settings).toBeDefined();
    if (!overview || !settings) return;

    expect(deriveAreaStatus(overview, { health: healthy, counts })).toBe('active');
    expect(deriveAreaStatus(settings, { health: healthy, counts })).toBe('active');
    expect(deriveAreaStatus(overview, { health: null, counts })).toBe('no-data');
    expect(
      deriveAreaStatus(settings, { health: healthy, counts: { passkeys: 0, activeSessions: 0 } }),
    ).toBe('no-data');
  });

  it('nunca inventa atividade em módulos sem endpoint', () => {
    const planned = NAVIGATION_ITEMS.filter((item) => item.availability === 'planned');
    const notConfigured = NAVIGATION_ITEMS.filter((item) => item.availability === 'not-configured');

    expect(planned).not.toHaveLength(0);
    expect(notConfigured).not.toHaveLength(0);
    for (const item of [...planned, ...notConfigured]) {
      expect(deriveAreaStatus(item, { health: healthy, counts })).not.toBe('active');
    }
  });

  it('reflete banco indisponível como ausência de dado', () => {
    const overview = NAVIGATION_ITEMS.find((item) => item.key === 'overview');
    expect(overview).toBeDefined();
    if (!overview) return;
    const degraded: HealthResponse = { ...healthy, status: 'degraded', db: 'unavailable' };
    expect(deriveAreaStatus(overview, { health: degraded, counts })).toBe('no-data');
  });

  it('oferece rótulos estáveis para cada estado', () => {
    expect([
      areaStatusLabel('active'),
      areaStatusLabel('no-data'),
      areaStatusLabel('not-configured'),
      areaStatusLabel('planned'),
    ]).toEqual(['Ativa', 'Sem dados', 'Não configurada', 'Em preparação']);
  });
});
