import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyFullSchema,
  applyInitialSchema,
  applyIntegrityMigration,
  applyReplaceGuardMigration,
  AREA_ID,
  first,
  insertArea,
  insertAudit,
  insertUser,
  resetDatabase,
  run,
  testDb,
  USER_ID,
} from './helpers';

const FUTURE = '2099-01-01T00:00:00.000Z';
const REVOKED_AT = '2026-11-20T23:00:00.000Z';
const HASH = 'a'.repeat(64);

beforeEach(async () => {
  await resetDatabase();
});

describe('integridade no banco', () => {
  it('mantém audit_log append-only', async () => {
    await applyFullSchema();
    await insertAudit('login', 'req-audit');

    const row = await first<{ id: number }>(
      'SELECT id FROM audit_log WHERE request_id = ?',
      'req-audit',
    );

    await expect(
      run('UPDATE audit_log SET action = ? WHERE id = ?', 'delete', row.id),
    ).rejects.toThrow();
    await expect(run('DELETE FROM audit_log WHERE id = ?', row.id)).rejects.toThrow();
    await expect(
      run(
        'INSERT OR REPLACE INTO audit_log (id, entity_type, entity_id, action, actor_type, request_id) VALUES (?, ?, ?, ?, ?, ?)',
        row.id,
        'area',
        AREA_ID,
        'update',
        'system',
        'req-audit',
      ),
    ).rejects.toThrow();

    const rows = await all<{ action: string }>('SELECT action FROM audit_log');
    expect(rows).toEqual([{ action: 'login' }]);
  });

  it('aceita apenas hashes de 64 caracteres e impede reuso de segredos', async () => {
    await applyFullSchema();
    await insertUser();

    await run(
      'INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)',
      '01a1fb52-074d-7043-a390-78a0731bdb52',
      USER_ID,
      HASH,
    );

    await expect(
      run(
        'INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)',
        '01a1fb52-074d-7043-a390-7ce33d475268',
        USER_ID,
        'hash-curto',
      ),
    ).rejects.toThrow();

    await expect(
      run(
        'INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)',
        '01a1fb52-074d-7043-a390-7ce33d475268',
        USER_ID,
        HASH,
      ),
    ).rejects.toThrow();

    await run(
      'INSERT INTO recovery_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      '01a1fb52-074f-7276-9b76-2f14673252fa',
      USER_ID,
      'b'.repeat(64),
      FUTURE,
    );

    await expect(
      run(
        'INSERT INTO recovery_tokens (id, user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?, ?)',
        '01a1fb52-074f-7276-9b76-30aedaa5de9f',
        USER_ID,
        'c'.repeat(64),
        'login',
        FUTURE,
      ),
    ).rejects.toThrow();
  });

  it('garante no máximo 10 sessões ativas por usuário no estado final', async () => {
    await applyFullSchema();
    await insertUser();

    for (let index = 0; index < 10; index += 1) {
      await run(
        'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
        `sess-${index}`,
        USER_ID,
        `token-${index}`,
        FUTURE,
      );
    }

    await expect(
      run(
        'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
        'sess-10',
        USER_ID,
        'token-10',
        FUTURE,
      ),
    ).rejects.toThrow();

    await run('UPDATE sessions SET revoked_at = ? WHERE id = ?', REVOKED_AT, 'sess-0');
    await run(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      'sess-10',
      USER_ID,
      'token-10',
      FUTURE,
    );

    const active = await first<{ total: number }>(
      'SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NULL',
      USER_ID,
    );
    expect(active.total).toBe(10);
  });

  it('não interrompe um batch após uma escrita condicional que afeta zero linhas', async () => {
    await applyFullSchema();
    await run("INSERT INTO sources (id, kind, name) VALUES ('src_manual', 'manual', 'Manual')");
    await insertArea();

    const database = testDb();
    await database.batch([
      database
        .prepare('UPDATE areas SET name = ?, version = ? WHERE id = ? AND version = ?')
        .bind('Novo nome', 2, AREA_ID, 1),
      database
        .prepare(
          "INSERT INTO audit_log (entity_type, entity_id, action, actor_type, after_json) SELECT 'area', ?, 'update', 'system', ? WHERE changes() = 1",
        )
        .bind(AREA_ID, JSON.stringify({ name: 'Novo nome' })),
      database
        .prepare('UPDATE areas SET name = ? WHERE id = ? AND version = ?')
        .bind('Ignorado', AREA_ID, 1),
      database
        .prepare(
          "INSERT INTO audit_log (entity_type, entity_id, action, actor_type, after_json) SELECT 'area', ?, 'update', 'system', ? WHERE changes() = 1",
        )
        .bind(AREA_ID, JSON.stringify({ name: 'Ignorado' })),
      database
        .prepare(
          'INSERT INTO audit_log (entity_type, entity_id, action, actor_type, request_id) VALUES (?, ?, ?, ?, ?)',
        )
        .bind('area', AREA_ID, 'update', 'system', 'batch-marker'),
    ]);

    const audit = await all<{ request_id: string | null; after_json: string | null }>(
      'SELECT request_id, after_json FROM audit_log ORDER BY id',
    );
    expect(audit).toHaveLength(2);
    expect(audit[0]?.after_json).toContain('Novo nome');
    expect(audit[1]?.request_id).toBe('batch-marker');

    expect(
      await first<{ name: string; version: number }>(
        'SELECT name, version FROM areas WHERE id = ?',
        AREA_ID,
      ),
    ).toEqual({
      name: 'Novo nome',
      version: 2,
    });
  });

  it('desfaz o batch inteiro quando uma constraint é violada', async () => {
    await applyFullSchema();
    await run("INSERT INTO sources (id, kind, name) VALUES ('src_manual', 'manual', 'Manual')");
    await insertArea();
    await insertUser();

    const database = testDb();
    await expect(
      database.batch([
        database.prepare('UPDATE areas SET name = ? WHERE id = ?').bind('Nome temporário', AREA_ID),
        database
          .prepare('INSERT INTO passkeys (id, user_id, public_key, name) VALUES (?, ?, ?, ?)')
          .bind('credencial', 'usuario-inexistente', 'chave', 'Passkey'),
      ]),
    ).rejects.toThrow();

    expect(await first<{ name: string }>('SELECT name FROM areas WHERE id = ?', AREA_ID)).toEqual({
      name: 'Finanças',
    });
  });

  it('aplica os triggers tanto no schema inicial quanto no upgrade', async () => {
    await applyInitialSchema();
    await insertAudit('create');
    await expect(run('DELETE FROM audit_log')).resolves.toBeUndefined();

    await applyIntegrityMigration();
    await insertAudit('create');
    await expect(run('DELETE FROM audit_log')).rejects.toThrow();

    await applyReplaceGuardMigration();
    const row = await first<{ id: number }>('SELECT id FROM audit_log LIMIT 1');
    await expect(
      run(
        'INSERT OR REPLACE INTO audit_log (id, entity_type, entity_id, action, actor_type) VALUES (?, ?, ?, ?, ?)',
        row.id,
        'area',
        AREA_ID,
        'update',
        'system',
      ),
    ).rejects.toThrow();
  });
});
