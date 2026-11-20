import { healthResponseSchema } from '@personal-os/shared';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';

describe('GET /api/v1/health', () => {
  it('responde 200 com o banco acessível', async () => {
    const response = await app.request('https://personal-os.test/api/v1/health', {}, env);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toMatch(/^req_[0-9a-f-]{36}$/);

    const body = healthResponseSchema.parse(await response.json());

    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.version).toBe('0.1.0');
    expect(new Date(body.time).toString()).not.toBe('Invalid Date');
  });

  it('retorna erro estável para rota inexistente', async () => {
    const response = await app.request('https://personal-os.test/api/v1/nao-existe', {}, env);
    const body = (await response.json()) as {
      error: { code: string; requestId: string };
    };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toMatch(/^req_/);
  });
});
