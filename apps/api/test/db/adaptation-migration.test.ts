import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyAdaptationMigration,
  applyAdaptationSchema,
  applyCurrentSchema,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const TABLE = 'adaptation_decisions';

describe('migração 0012 — decisões de adaptação', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala a tabela aditiva com índices e restrições', async () => {
    await applyAdaptationSchema();

    expect(await tableNames()).toContain(TABLE);
    expect(await indexNames(TABLE)).toEqual(
      expect.arrayContaining([
        'uq_adaptation_decisions_proposal',
        'idx_adaptation_decisions_created',
        'idx_adaptation_decisions_status',
        'idx_adaptation_decisions_source',
      ]),
    );

    await expect(
      run(
        `INSERT INTO ${TABLE} (
          id, proposal_id, action, status, note, proposal_kind, proposal_title,
          severity, confidence, period_from, period_to, algorithm_version,
          proposal_snapshot_json, version, source_id, created_at, updated_at
        ) VALUES (
          'd1', 'p1', 'bad', 'accepted', NULL, 'execution', 'T', 'info', 'high',
          '2026-11-01', '2026-11-30', 'adaptation-proposal-v1', '{}', 1, 'src_manual',
          '2026-11-25T00:00:00.000Z', '2026-11-25T00:00:00.000Z'
        )`,
      ),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('faz upgrade a partir do schema atual anterior preservando dados e seeds', async () => {
    await applyCurrentSchema();
    // applyCurrentSchema já inclui 0012; para teste de upgrade real, aplicamos até 0011.
    // Reconstruímos o cenário: reset, aplicar até 0011, inserir dado, aplicar 0012.
    await resetDatabase();
    const { applyDecisionSchema, applyIndexAlignmentMigration, applyIdempotencyGuardMigration } =
      await import('./helpers');
    await applyDecisionSchema();
    await applyIndexAlignmentMigration();
    await applyIdempotencyGuardMigration();
    await executeSql(seedSql);
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type)
       VALUES ('adaptation_upgrade', 'upgrade-1', 'create', 'system')`,
    );

    await applyAdaptationMigration();
    await executeSql(seedSql);

    expect(
      await first<{ action: string }>(
        'SELECT action FROM audit_log WHERE entity_type = ?',
        'adaptation_upgrade',
      ),
    ).toEqual({
      action: 'create',
    });
    await run(
      `INSERT INTO ${TABLE} (
        id, proposal_id, action, status, note, proposal_kind, proposal_title,
        severity, confidence, period_from, period_to, algorithm_version,
        proposal_snapshot_json, version, source_id, created_at, updated_at
      ) VALUES (
        'd-up', 'p-up', 'accept', 'accepted', NULL, 'execution', 'Título',
        'attention', 'medium', '2026-11-01', '2026-11-30', 'adaptation-proposal-v1',
        '{"id":"p-up"}', 1, 'src_manual', '2026-11-25T00:00:00.000Z', '2026-11-25T00:00:00.000Z'
      )`,
    );
    expect(await all<{ status: string }>(`SELECT status FROM ${TABLE}`)).toEqual([
      { status: 'accepted' },
    ]);
  });
});
