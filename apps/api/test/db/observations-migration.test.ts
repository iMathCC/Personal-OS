import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyAdaptationSchema,
  applyObservationsMigration,
  applyObservationsSchema,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const TABLE = 'personal_observations';

describe('migração 0013 — observações pessoais', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala a tabela aditiva com índices e restrições', async () => {
    await applyObservationsSchema();
    expect(await tableNames()).toContain(TABLE);
    expect(await indexNames(TABLE)).toEqual(
      expect.arrayContaining([
        'idx_personal_obs_date',
        'idx_personal_obs_kind_date',
        'idx_personal_obs_status_date',
        'idx_personal_obs_source',
      ]),
    );

    await expect(
      run(
        `INSERT INTO ${TABLE} (
          id, kind, title, observed_at, local_date, timezone, source_id, status, version
        ) VALUES (
          'obs-bad', 'bad_kind', 'Título', '2026-11-10T12:00:00.000Z', '2026-11-10',
          'America/Sao_Paulo', 'src_manual', 'active', 1
        )`,
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('faz upgrade a partir do schema 0012 preservando dados e seeds', async () => {
    await resetDatabase();
    await applyAdaptationSchema();
    await executeSql(seedSql);
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type)
       VALUES ('obs_upgrade', 'upgrade-1', 'create', 'system')`,
    );

    await applyObservationsMigration();
    await executeSql(seedSql);

    expect(
      await first<{ action: string }>(
        'SELECT action FROM audit_log WHERE entity_type = ?',
        'obs_upgrade',
      ),
    ).toEqual({ action: 'create' });

    await run(
      `INSERT INTO ${TABLE} (
        id, kind, title, observed_at, local_date, timezone, source_id, status, version,
        created_at, updated_at
      ) VALUES (
        'obs-ok', 'executed', 'Registro', '2026-11-10T12:00:00.000Z', '2026-11-10',
        'America/Sao_Paulo', 'src_manual', 'active', 1,
        '2026-11-10T12:00:00.000Z', '2026-11-10T12:00:00.000Z'
      )`,
    );
    expect(await all<{ status: string }>(`SELECT status FROM ${TABLE}`)).toEqual([
      { status: 'active' },
    ]);
  });
});
