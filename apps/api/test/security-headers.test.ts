import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';

const ORIGIN = 'https://personal-os.test';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('headers de segurança da API', () => {
  it('jamais permite cache de respostas privadas', async () => {
    const response = await app.request(`${ORIGIN}/api/v1/health`, {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('x-request-id')).toMatch(/^req_/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=15552000; includeSubDomains',
    );
    expect(response.headers.get('strict-transport-security')).not.toContain('preload');
  });

  it('aplica as mesmas regras a respostas de erro autenticado', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    const response = await app.request(
      `${ORIGIN}/api/v1/auth/logout`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer SENSITIVE_MARKER',
          'Content-Type': 'application/json',
        },
      },
      env,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=15552000; includeSubDomains',
    );
    for (const line of logs) {
      expect(line).not.toContain('SENSITIVE_MARKER');
    }
  });

  it('mantém HSTS em rotas que caem no notFound', async () => {
    const response = await app.request(`${ORIGIN}/api/inexistente`, {}, env);

    expect(response.status).toBe(404);
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=15552000; includeSubDomains',
    );
  });
});
