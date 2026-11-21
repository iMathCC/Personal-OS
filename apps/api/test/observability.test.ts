import { describe, expect, it } from 'vitest';
import { requestLogFields, securityLogFields } from '../src/middleware/observability';

describe('logs estruturados', () => {
  it('remove a query e não inclui campos sensíveis', () => {
    const fields = requestLogFields({
      requestId: 'req_1',
      method: 'get',
      path: '/api/v1/studies/sessions?token=SEGREDO&from=2026-01-01',
      status: 200,
      durationMs: 4,
      errorCode: null,
    });

    expect(fields).toEqual({
      level: 'info',
      event: 'api_request',
      requestId: 'req_1',
      method: 'GET',
      path: '/api/v1/studies/sessions',
      status: 200,
      durationMs: 4,
    });
    expect(JSON.stringify(fields)).not.toContain('SEGREDO');
  });

  it('classifica falhas de autenticação e indisponibilidade sem conteúdo privado', () => {
    const auth = securityLogFields('auth_failure', {
      requestId: 'req_2',
      path: '/api/v1/auth/login/verify?code=SEGREDO',
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    const db = securityLogFields('dependency_unavailable', {
      requestId: 'req_3',
      path: '/api/v1/studies/series?notes=SEGREDO',
      status: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
    });

    expect(auth).toMatchObject({ event: 'auth_failure', path: '/api/v1/auth/login/verify' });
    expect(db).toMatchObject({ event: 'dependency_unavailable', level: 'error' });
    for (const line of [JSON.stringify(auth), JSON.stringify(db)]) {
      expect(line).not.toContain('SEGREDO');
      expect(Object.keys(JSON.parse(line) as object)).not.toContain('cookie');
    }
  });
});
