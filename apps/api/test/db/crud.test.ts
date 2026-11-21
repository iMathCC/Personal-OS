import { beforeEach, describe, expect, it } from 'vitest';
import seedSql from '../../../../packages/db/src/seed.sql?raw';
import {
  all,
  applyFullSchema,
  type Binding,
  executeSql,
  AREA_ID,
  first,
  insertArea,
  insertUser,
  OTHER_USER_ID,
  queryPlan,
  resetDatabase,
  run,
  SOURCE_ID,
  USER_ID,
} from './helpers';

const FUTURE = '2099-01-01T00:00:00.000Z';
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(async () => {
  await resetDatabase();
});

async function insertSource(): Promise<void> {
  await run('INSERT INTO sources (id, kind, name) VALUES (?, ?, ?)', SOURCE_ID, 'manual', 'Manual');
}

describe('operações e regras do modelo', () => {
  it('insere, atualiza com version e aplica soft delete em áreas', async () => {
    await applyFullSchema();
    await insertSource();
    await insertArea();

    await run(
      'UPDATE areas SET name = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?',
      'Finanças pessoais',
      2,
      '2026-11-20T23:00:00.000Z',
      AREA_ID,
      1,
    );
    const updated = await first<{ name: string; version: number; updated_at: string }>(
      'SELECT name, version, updated_at FROM areas WHERE id = ?',
      AREA_ID,
    );
    expect(updated).toEqual({
      name: 'Finanças pessoais',
      version: 2,
      updated_at: '2026-11-20T23:00:00.000Z',
    });

    await expect(
      run('UPDATE areas SET name = ? WHERE id = ? AND version = ?', 'Conflito', AREA_ID, 1),
    ).resolves.toBeUndefined();

    await run('UPDATE areas SET deleted_at = ? WHERE id = ?', '2026-11-20T23:10:00.000Z', AREA_ID);
    const active = await all<{ id: string }>('SELECT id FROM areas WHERE deleted_at IS NULL');
    expect(active).toEqual([]);
  });

  it('protege o histórico com RESTRICT e remove filhos com CASCADE', async () => {
    await applyFullSchema();
    await insertSource();
    await insertArea();
    await insertUser();

    await expect(run('DELETE FROM sources WHERE id = ?', SOURCE_ID)).rejects.toThrow();

    await run(
      'INSERT INTO passkeys (id, user_id, public_key, name) VALUES (?, ?, ?, ?)',
      'credencial-1',
      USER_ID,
      'chave-publica',
      'Passkey principal',
    );
    await expect(run('DELETE FROM users WHERE id = ?', USER_ID)).rejects.toThrow();

    await insertUser(OTHER_USER_ID);
    await run(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      'sess-filha',
      OTHER_USER_ID,
      'hash-filha',
      FUTURE,
    );
    await run(
      'INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)',
      '01a1fb52-074d-7043-a390-7ce33d475268',
      OTHER_USER_ID,
      'd'.repeat(64),
    );
    await run('DELETE FROM users WHERE id = ?', OTHER_USER_ID);

    expect(
      await all<{ id: string }>('SELECT id FROM sessions WHERE user_id = ?', OTHER_USER_ID),
    ).toEqual([]);
    expect(
      await all<{ id: string }>('SELECT id FROM recovery_codes WHERE user_id = ?', OTHER_USER_ID),
    ).toEqual([]);
  });

  it('aplica constraints de unicidade', async () => {
    await applyFullSchema();
    await insertSource();
    await insertArea();
    await insertUser();

    await expect(
      run(
        'INSERT INTO areas (id, key, name, source_id) VALUES (?, ?, ?, ?)',
        '01a1fb52-074d-7043-a390-78a0731bdb52',
        'finance',
        'Duplicada',
        SOURCE_ID,
      ),
    ).rejects.toThrow();

    await run(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      'sess-1',
      USER_ID,
      'token-unico',
      FUTURE,
    );
    await expect(
      run(
        'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
        'sess-2',
        USER_ID,
        'token-unico',
        FUTURE,
      ),
    ).rejects.toThrow();

    await run(
      'INSERT INTO idempotency_keys (key, method, path, request_hash, status_code, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      'idem-1',
      'POST',
      '/api/v1/tasks',
      'hash',
      201,
      FUTURE,
    );
    await expect(
      run(
        'INSERT INTO idempotency_keys (key, method, path, request_hash, status_code, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        'idem-1',
        'POST',
        '/api/v1/tasks',
        'hash',
        201,
        FUTURE,
      ),
    ).rejects.toThrow();
  });

  it('rejeita dados inválidos e enums fora da allowlist', async () => {
    await applyFullSchema();

    const invalidCases: Array<[string, Binding[]]> = [
      ['INSERT INTO users (display_name) VALUES (NULL)', []],
      ["INSERT INTO sources (id, kind, name) VALUES ('src_bad', 'unknown', 'Fonte')", []],
      [
        "INSERT INTO sources (id, kind, name, config_json) VALUES ('src_bad', 'manual', 'Fonte', '{')",
        [],
      ],
      [
        'INSERT INTO users (id, display_name, week_start) VALUES (?, ?, ?)',
        ['usr-bad', 'Teste', 7],
      ],
      [
        "INSERT INTO areas (id, key, name, source_id) VALUES ('area-bad', 'unknown', 'X', 'src_manual')",
        [],
      ],
      [
        "INSERT INTO rate_limits (key, window_start, count, expires_at) VALUES ('rl', '2026-11-20T00:00:00.000Z', -1, '2099-01-01T00:00:00.000Z')",
        [],
      ],
      [
        "INSERT INTO idempotency_keys (key, method, path, request_hash, status_code, expires_at) VALUES ('ik', 'TRACE', '/x', 'h', 200, '2099-01-01T00:00:00.000Z')",
        [],
      ],
      [
        "INSERT INTO auth_challenges (id, type, challenge, expires_at) VALUES ('ch', 'magic', 'c', '2099-01-01T00:00:00.000Z')",
        [],
      ],
      [
        "INSERT INTO auth_challenges (id, type, purpose, challenge, expires_at) VALUES ('ch', 'registration', 'invalid', 'c', '2099-01-01T00:00:00.000Z')",
        [],
      ],
      [
        "INSERT INTO audit_log (entity_type, entity_id, action, actor_type) VALUES ('area', 'a', 'tap', 'system')",
        [],
      ],
      [
        "INSERT INTO audit_log (entity_type, entity_id, action, actor_type, ip_hash) VALUES ('area', 'a', 'create', 'system', 'short')",
        [],
      ],
    ];

    for (const [sql, values] of invalidCases) {
      await expect(run(sql, ...values)).rejects.toThrow();
    }
  });

  it('usa índices nas consultas críticas', async () => {
    await applyFullSchema();

    const plans: Array<[string, string, Binding[]]> = [
      ['SELECT id FROM sessions WHERE token_hash = ?', 'idx_sessions_token_hash', ['hash']],
      [
        'SELECT id FROM sessions WHERE user_id = ? ORDER BY expires_at',
        'idx_sessions_user',
        [USER_ID],
      ],
      [
        'SELECT id FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at',
        'idx_audit_entity',
        ['area', AREA_ID],
      ],
      [
        'SELECT id FROM recovery_tokens WHERE token_hash = ?',
        'idx_recovery_tokens_hash',
        ['h'.repeat(64)],
      ],
      ['SELECT id FROM passkeys WHERE user_id = ?', 'idx_passkeys_user', [USER_ID]],
      ['SELECT id FROM areas WHERE source_id = ?', 'idx_areas_source', [SOURCE_ID]],
    ];

    for (const [query, index, values] of plans) {
      expect(await queryPlan(query, ...values), query).toContain(index);
    }
  });

  it('aplica seeds mínimos e idempotentes', async () => {
    await applyFullSchema();

    await executeSql(seedSql);
    await executeSql(seedSql);

    expect(await all<{ id: string }>('SELECT id FROM sources ORDER BY id')).toEqual([
      { id: 'src_calculation' },
      { id: 'src_import' },
      { id: 'src_inference' },
      { id: 'src_manual' },
    ]);

    const areas = await all<{ id: string; key: string }>(
      'SELECT id, key FROM areas ORDER BY sort_order',
    );
    expect(areas).toHaveLength(8);
    expect(areas.map((area) => area.key)).toEqual([
      'finance',
      'studies',
      'career',
      'reading',
      'training',
      'health',
      'activities',
      'life',
    ]);
    for (const area of areas) {
      expect(area.id).toMatch(UUIDV7);
    }
  });
});
