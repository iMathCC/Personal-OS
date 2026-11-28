import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyLifeMigration,
  applyLifeSchema,
  applyPlanningSchema,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const LIFE_TABLES: string[] = [
  'finance_accounts',
  'finance_categories',
  'finance_transactions',
  'finance_balance_items',
  'health_metrics',
  'health_observations',
  'training_sessions',
  'reading_materials',
  'reading_sessions',
  'reading_notes',
  'time_entries',
  'life_import_batches',
];

const ACCOUNT_ID = '01f20000-0000-7000-8000-000000000001';
const METRIC_ID = '01f20000-0000-7000-8000-000000000002';
const MATERIAL_ID = '01f20000-0000-7000-8000-000000000003';
const BATCH_ID = '01f20000-0000-7000-8000-000000000004';

describe('migração 0008 — camada de dados pessoais', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala as doze tabelas com índices de chaves estrangeiras e consultas', async () => {
    await applyLifeSchema();

    expect(await tableNames()).toEqual(expect.arrayContaining(LIFE_TABLES));
    expect(await indexNames('finance_transactions')).toEqual(
      expect.arrayContaining([
        'uq_finance_transactions_external',
        'idx_finance_transactions_source',
        'idx_finance_transactions_status',
        'idx_finance_transactions_superseded',
        'idx_finance_transactions_corrects',
        'idx_finance_transactions_account_date',
        'idx_finance_transactions_date_kind',
        'idx_finance_transactions_category',
        'idx_finance_transactions_transfer_pair',
        'idx_finance_transactions_import_batch',
      ]),
    );
    expect(await indexNames('time_entries')).toEqual(
      expect.arrayContaining([
        'idx_time_entries_date',
        'idx_time_entries_project_date',
        'idx_time_entries_task_date',
        'idx_time_entries_area_date',
        'idx_time_entries_start',
        'idx_time_entries_import_batch',
      ]),
    );
    expect(await indexNames('life_import_batches')).toEqual(
      expect.arrayContaining(['idx_life_import_batches_created', 'idx_life_import_batches_domain']),
    );
    expect(await indexNames('health_observations')).toContain(
      'idx_health_observations_metric_date',
    );
    expect(await indexNames('reading_sessions')).toContain('idx_reading_sessions_material_date');
    expect(await indexNames('training_sessions')).toContain('idx_training_sessions_date_activity');
  });

  it('faz upgrade a partir da 0007 preservando dados, auditoria e seeds', async () => {
    await applyPlanningSchema();
    await executeSql(seedSql);
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type)
       VALUES ('planning_cycle', 'cycle-upgrade', 'create', 'system')`,
    );

    await applyLifeMigration();
    await executeSql(seedSql);

    expect(await first<{ action: string }>('SELECT action FROM audit_log')).toEqual({
      action: 'create',
    });
    expect(await first<{ id: string }>("SELECT id FROM sources WHERE id = 'src_import'")).toEqual({
      id: 'src_import',
    });
    expect(
      await all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'finance_%'",
      ).then((rows) => rows.map((row) => row.name)),
    ).toEqual(expect.arrayContaining(['finance_accounts', 'finance_transactions']));
  });

  it('reforça proveniência, discrição de valores desconhecidos e correções versionadas', async () => {
    await applyLifeSchema();
    await executeSql(seedSql);

    const provenanceColumns = await all<{ name: string }>(
      "PRAGMA table_info('finance_transactions')",
    );
    expect(provenanceColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'source_id',
        'external_id',
        'origin_kind',
        'confidence',
        'algorithm_version',
        'status',
        'superseded_by',
        'corrects_id',
        'version',
        'import_batch_id',
      ]),
    );

    await run(
      `INSERT INTO finance_accounts (id, name, type) VALUES ('${ACCOUNT_ID}', 'Conta de teste', 'checking')`,
    );
    await expect(
      run(`INSERT INTO finance_accounts (id, name, type) VALUES ('bad', '', 'checking')`),
    ).rejects.toThrow(/CHECK constraint/i);
    await expect(
      run(`INSERT INTO finance_accounts (id, name, type) VALUES ('bad2', 'Conta', 'invalid')`),
    ).rejects.toThrow(/CHECK constraint/i);
    await expect(
      run(
        `INSERT INTO finance_accounts (id, name, type, origin_kind) VALUES ('bad3', 'Conta', 'checking', 'ai')`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    await run(
      `INSERT INTO life_import_batches (id, domain, format, total, imported, invalid, duplicates, report_json)
       VALUES ('${BATCH_ID}', 'finance_transactions', 'csv', 1, 1, 0, 0, '{"rows":[]}')`,
    );
    await expect(
      run(
        `INSERT INTO life_import_batches (id, domain, format, total, imported, invalid, duplicates)
         VALUES ('bad-batch', 'unknown', 'csv', 0, 0, 0, 0)`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    await run(
      `INSERT INTO finance_transactions (id, account_id, kind, amount_cents, date, description, import_batch_id)
       VALUES ('tx-1', '${ACCOUNT_ID}', 'expense', 1200, '2026-11-01', 'Despesa de teste', '${BATCH_ID}')`,
    );
    await expect(
      run(
        `INSERT INTO finance_transactions (id, account_id, kind, amount_cents, date, description, category_id)
         VALUES ('tx-bad', '${ACCOUNT_ID}', 'transfer', 100, '2026-11-01', 'Transferência inválida', 'cat')`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await expect(
      run(
        `INSERT INTO finance_transactions (id, account_id, kind, amount_cents, date, description)
         VALUES ('tx-fk', 'missing-account', 'expense', 100, '2026-11-01', 'Conta inexistente')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint/i);

    await run(
      `UPDATE finance_transactions SET status = 'superseded', superseded_by = 'tx-2', version = 2 WHERE id = 'tx-1'`,
    );
    await run(
      `INSERT INTO finance_transactions (id, account_id, kind, amount_cents, date, description, corrects_id, version, origin_kind)
       VALUES ('tx-2', '${ACCOUNT_ID}', 'expense', 1500, '2026-11-01', 'Despesa corrigida', 'tx-1', 2, 'corrected')`,
    );
    const versions = await all<{ id: string; status: string; version: number }>(
      'SELECT id, status, version FROM finance_transactions ORDER BY version',
    );
    expect(versions).toEqual([
      { id: 'tx-1', status: 'superseded', version: 2 },
      { id: 'tx-2', status: 'active', version: 2 },
    ]);

    await expect(
      run(`UPDATE finance_transactions SET superseded_by = id WHERE id = 'tx-2'`),
    ).rejects.toThrow(/CHECK constraint/i);
  });

  it('guarda saúde, leitura, treino e tempo com limites e intervalos válidos', async () => {
    await applyLifeSchema();
    await executeSql(seedSql);

    await run(
      `INSERT INTO health_metrics (id, key, label, unit) VALUES ('${METRIC_ID}', 'sleep_minutes', 'Sono', 'minutos')`,
    );
    await expect(
      run(
        `INSERT INTO health_metrics (id, key, label, unit) VALUES ('metric-bad', '', 'Sono', 'minutos')`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await run(
      `INSERT INTO health_observations (id, metric_id, date, value) VALUES ('obs-1', '${METRIC_ID}', '2026-11-01', 480)`,
    );
    await expect(
      run(
        `INSERT INTO health_observations (id, metric_id, date, value) VALUES ('obs-bad', '${METRIC_ID}', '2026-11-1', 480)`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    await run(
      `INSERT INTO reading_materials (id, title, reading_status, total_pages) VALUES ('${MATERIAL_ID}', 'Livro de teste', 'reading', 200)`,
    );
    await expect(
      run(
        `INSERT INTO reading_materials (id, title, reading_status) VALUES ('material-bad', 'Livro', 'unknown')`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await run(
      `INSERT INTO reading_sessions (id, material_id, date, minutes, pages_read) VALUES ('session-1', '${MATERIAL_ID}', '2026-11-01', 30, 40)`,
    );
    await expect(
      run(
        `INSERT INTO reading_sessions (id, material_id, date, minutes) VALUES ('session-bad', '${MATERIAL_ID}', '2026-11-01', 0)`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    await run(
      `INSERT INTO training_sessions (id, activity_type, date, duration_minutes) VALUES ('training-1', 'walk', '2026-11-01', 30)`,
    );
    await expect(
      run(
        `INSERT INTO training_sessions (id, activity_type, date, duration_minutes, intensity) VALUES ('training-bad', 'walk', '2026-11-01', 30, 11)`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    await run(
      `INSERT INTO time_entries (id, date, duration_minutes) VALUES ('time-1', '2026-11-01', 60)`,
    );
    await expect(
      run(
        `INSERT INTO time_entries (id, date, duration_minutes, start_at, end_at)
         VALUES ('time-bad', '2026-11-01', 60, '2026-11-01T10:00:00.000Z', '2026-11-01T09:00:00.000Z')`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
  });

  it('mantém integridade referencial após popular todas as tabelas', async () => {
    await applyLifeSchema();
    await executeSql(seedSql);

    const violations = await all<{ table: string; rowid: number; parent: string; fkid: number }>(
      'PRAGMA foreign_key_check',
    );
    expect(violations).toEqual([]);
  });
});
