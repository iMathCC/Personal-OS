import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPrivateCaches, setCsrfToken } from '@/lib/api';

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe('limpeza de caches privados', () => {
  it('remove caches legados de API e mantém somente o precache de assets', async () => {
    const deleted: string[] = [];
    const names = [
      'workbox-precache-v2-personal-os',
      'api-get-v1',
      'private-studies',
      'outro-cache',
    ];
    vi.stubGlobal('caches', {
      keys: async () => names,
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    setCsrfToken('csrf');

    await clearPrivateCaches();

    expect(deleted.sort()).toEqual(['api-get-v1', 'outro-cache', 'private-studies']);
    expect(deleted).not.toContain('workbox-precache-v2-personal-os');
  });

  it('funciona em ambientes sem Cache Storage', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(clearPrivateCaches()).resolves.toBeUndefined();
  });
});
