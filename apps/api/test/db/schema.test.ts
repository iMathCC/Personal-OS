import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyFullSchema,
  applyInitialSchema,
  applyIntegrityMigration,
  all,
  AREA_ID,
  first,
  indexNames,
  insertArea,
  insertAudit,
  insertUser,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const TABLES = [
  'app_settings',
  'areas',
  'audit_log',
  'auth_challenges',
  'idempotency_keys',
  'passkeys',
  'rate_limits',
  'recovery_codes',
  'recovery_tokens',
  'sessions',
  'sources',
  'users',
];

type ForeignKey = {
  table: string;
  from: string;
  to: string;
  on_delete: string;
};

async function foreignKeys(table: string): Promise<ForeignKey[]> {
  return all<ForeignKey>(`PRAGMA foreign_key_list(${table})`);
}

beforeEach(async () => {
  await resetDatabase();
});

describe('migrações do schema', () => {
  it('cria as 12 tabelas a partir de um banco vazio', async () => {
    await applyFullSchema();

    expect(new Set(await tableNames())).toEqual(new Set(TABLES));
  });

  it('aplica as migrações em sequência e preserva dados no upgrade', async () => {
    await applyInitialSchema();
    await run("INSERT INTO sources (id, kind, name) VALUES ('src_manual', 'manual', 'Manual')");
    await insertUser();
    await insertArea();
    await insertAudit('create', 'req-upgrade');

    await applyIntegrityMigration();

    const audit = await first<{ request_id: string }>(
      'SELECT request_id FROM audit_log WHERE request_id = ?',
      'req-upgrade',
    );
    expect(audit.request_id).toBe('req-upgrade');
    expect(await first<{ name: string }>('SELECT name FROM areas WHERE id = ?', AREA_ID)).toEqual({
      name: 'Finanças',
    });

    await expect(
      run('UPDATE audit_log SET action = ? WHERE request_id = ?', 'update', 'req-upgrade'),
    ).rejects.toThrow();
  });

  it('usa timestamps UTC ISO-8601 com milissegundos por padrão', async () => {
    await applyFullSchema();
    await run("INSERT INTO sources (id, kind, name) VALUES ('src_manual', 'manual', 'Manual')");
    await insertArea();

    const area = await first<{ created_at: string }>(
      'SELECT created_at FROM areas WHERE id = ?',
      AREA_ID,
    );
    expect(area.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('cria todos os índices de consulta crítica e de FK', async () => {
    await applyFullSchema();

    const expected: Record<string, string[]> = {
      areas: ['areas_key_unique', 'idx_areas_active', 'idx_areas_source'],
      sources: ['idx_sources_kind', 'sources_name_unique'],
      sessions: [
        'idx_sessions_token_hash',
        'idx_sessions_user',
        'idx_sessions_expiry',
        'idx_sessions_lru',
      ],
      passkeys: ['idx_passkeys_user'],
      recovery_codes: ['idx_recovery_codes_hash', 'idx_recovery_codes_user'],
      recovery_tokens: [
        'idx_recovery_tokens_hash',
        'idx_recovery_tokens_user',
        'idx_recovery_tokens_expiry',
      ],
      auth_challenges: ['idx_auth_challenges_expiry', 'idx_auth_challenges_user'],
      audit_log: ['idx_audit_entity', 'idx_audit_created'],
      idempotency_keys: ['idx_idempotency_expiry'],
      rate_limits: ['idx_rate_limits_expiry'],
      app_settings: [],
      users: [],
    };

    for (const [table, names] of Object.entries(expected)) {
      expect(await indexNames(table), `índices de ${table}`).toEqual(expect.arrayContaining(names));
    }
  });

  it('define as foreign keys com a ação de exclusão correta', async () => {
    await applyFullSchema();

    expect(await foreignKeys('areas')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'sources',
          from: 'source_id',
          to: 'id',
          on_delete: 'RESTRICT',
        }),
      ]),
    );
    expect(await foreignKeys('passkeys')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'users',
          from: 'user_id',
          to: 'id',
          on_delete: 'RESTRICT',
        }),
      ]),
    );
    for (const table of ['sessions', 'recovery_codes', 'recovery_tokens', 'auth_challenges']) {
      expect(await foreignKeys(table)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: 'users',
            from: 'user_id',
            to: 'id',
            on_delete: 'CASCADE',
          }),
        ]),
      );
    }
  });
});
