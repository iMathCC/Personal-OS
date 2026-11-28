import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyExecutionSchema,
  applyReviewsMigration,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const REVIEW_ID = '0194a4d0-0000-7000-8000-000000000001';

function snapshotJson(weekStart = '2026-11-16'): string {
  return JSON.stringify({ schemaVersion: 1, weekStart, weekEnd: '2026-11-22' });
}

async function insertReview(weekStart: string, version = 1): Promise<void> {
  await run(
    `INSERT INTO weekly_reviews
      (id, week_start, week_end, timezone, snapshot_json, worked, source_id, version)
      VALUES (?, ?, ?, ?, ?, ?, 'src_manual', ?)`,
    REVIEW_ID,
    weekStart,
    '2026-11-22',
    'America/Sao_Paulo',
    snapshotJson(weekStart),
    null,
    version,
  );
}

describe('migração 0006 — revisões semanais', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala em banco vazio com índices da chave estrangeira e da busca por semana', async () => {
    await applyExecutionSchema();
    await applyReviewsMigration();

    expect(await tableNames()).toContain('weekly_reviews');
    expect(await indexNames('weekly_reviews')).toEqual(
      expect.arrayContaining([
        'uq_weekly_reviews_week',
        'idx_weekly_reviews_week_start',
        'idx_weekly_reviews_updated',
        'idx_weekly_reviews_source',
      ]),
    );
  });

  it('faz upgrade preservando registros e auditoria anteriores', async () => {
    await applyExecutionSchema();
    await executeSql(seedSql);
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type)
       VALUES ('task', '0194a4d0-0000-7000-8000-000000000099', 'create', 'system')`,
    );

    await applyReviewsMigration();
    await insertReview('2026-11-16');

    expect(await all<{ action: string }>('SELECT action FROM audit_log')).toEqual([
      { action: 'create' },
    ]);
    expect(await first<{ week_start: string }>('SELECT week_start FROM weekly_reviews')).toEqual({
      week_start: '2026-11-16',
    });
  });

  it('garante unicidade por semana, snapshot válido e limites das reflexões', async () => {
    await applyExecutionSchema();
    await executeSql(seedSql);
    await applyReviewsMigration();

    await insertReview('2026-11-16');
    await expect(insertReview('2026-11-16')).rejects.toThrow(/UNIQUE constraint/i);
    await expect(
      run(
        `INSERT INTO weekly_reviews
          (id, week_start, week_end, timezone, snapshot_json, source_id)
          VALUES (?, ?, ?, ?, ?, 'src_manual')`,
        '0194a4d0-0000-7000-8000-000000000002',
        '2026-11-09',
        '2026-11-15',
        'UTC',
        'nao-e-json',
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await expect(
      run(
        `INSERT INTO weekly_reviews
          (id, week_start, week_end, timezone, snapshot_json, worked, source_id)
          VALUES (?, ?, ?, ?, ?, ?, 'src_manual')`,
        '0194a4d0-0000-7000-8000-000000000003',
        '2026-11-02',
        '2026-11-08',
        'UTC',
        snapshotJson('2026-11-02'),
        'x'.repeat(2_001),
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await expect(
      run(
        `INSERT INTO weekly_reviews
          (id, week_start, week_end, timezone, snapshot_json, source_id, version)
          VALUES (?, ?, ?, ?, ?, 'src_manual', 0)`,
        '0194a4d0-0000-7000-8000-000000000004',
        '2026-10-26',
        '2026-11-01',
        'UTC',
        snapshotJson('2026-10-26'),
      ),
    ).rejects.toThrow(/CHECK constraint/i);
  });
});
