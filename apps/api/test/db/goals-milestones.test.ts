import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyCoreSchema,
  applyGoalsSchema,
  applyMilestonesMigration,
  executeSql,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const GOAL_ID = '0193a4d0-0000-7000-8000-000000000001';
const MILESTONE_ID = '0193a4d0-0000-7000-8000-000000000002';

async function seedGoal(): Promise<void> {
  await executeSql(seedSql);
  await run(
    `INSERT INTO goals (id, area_id, title, horizon, status, source_id)
     VALUES (?, ?, ?, 'medium', 'active', 'src_manual')`,
    GOAL_ID,
    '01a1fb52-074d-7043-a390-78a0731bdb52',
    'Objetivo de teste',
  );
}

describe('migração 0004 — marcos de objetivos', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala em banco vazio com índices nas FKs e filtros', async () => {
    await applyGoalsSchema();
    expect(await tableNames()).toContain('goal_milestones');
    expect(await indexNames('goal_milestones')).toEqual(
      expect.arrayContaining([
        'idx_goal_milestones_goal',
        'idx_goal_milestones_due',
        'idx_goal_milestones_source',
      ]),
    );
  });

  it('faz upgrade preservando objetivos e auditoria existentes', async () => {
    await applyCoreSchema();
    await executeSql(seedSql);
    await run(
      `INSERT INTO goals (id, area_id, title, horizon, status, source_id)
       VALUES (?, ?, ?, 'long', 'draft', 'src_manual')`,
      GOAL_ID,
      '01a1fb52-074d-7043-a390-78a0731bdb52',
      'Objetivo pré-existente',
    );
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type)
       VALUES ('goal', ?, 'create', 'system')`,
      GOAL_ID,
    );

    await applyMilestonesMigration();

    expect(await all<{ title: string }>('SELECT title FROM goals')).toEqual([
      { title: 'Objetivo pré-existente' },
    ]);
    expect(await all<{ action: string }>('SELECT action FROM audit_log')).toEqual([
      { action: 'create' },
    ]);
  });

  it('valida status, versão, consistência de conclusão e integridade referencial', async () => {
    await applyGoalsSchema();
    await seedGoal();

    await expect(
      run(
        `INSERT INTO goal_milestones (id, goal_id, title, status, source_id)
         VALUES (?, ?, ?, 'inexistente', 'src_manual')`,
        MILESTONE_ID,
        GOAL_ID,
        'Marco',
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    await expect(
      run(
        `INSERT INTO goal_milestones (id, goal_id, title, status, source_id)
         VALUES (?, ?, ?, 'completed', 'src_manual')`,
        MILESTONE_ID,
        GOAL_ID,
        'Marco',
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    await expect(
      run(
        `INSERT INTO goal_milestones (id, goal_id, title, status, source_id)
         VALUES (?, ?, ?, 'pending', 'src_manual')`,
        MILESTONE_ID,
        'objetivo-inexistente',
        'Marco',
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint/i);

    await run(
      `INSERT INTO goal_milestones (id, goal_id, title, status, source_id)
       VALUES (?, ?, ?, 'pending', 'src_manual')`,
      MILESTONE_ID,
      GOAL_ID,
      'Marco válido',
    );
    expect(await all<{ version: number }>('SELECT version FROM goal_milestones')).toEqual([
      { version: 1 },
    ]);
  });

  it('remove marcos em cascata ao remover o objetivo', async () => {
    await applyGoalsSchema();
    await seedGoal();
    await run(
      `INSERT INTO goal_milestones (id, goal_id, title, status, source_id)
       VALUES (?, ?, ?, 'pending', 'src_manual')`,
      MILESTONE_ID,
      GOAL_ID,
      'Marco',
    );

    await run('DELETE FROM goals WHERE id = ?', GOAL_ID);
    expect(await all<{ id: string }>('SELECT id FROM goal_milestones')).toEqual([]);
  });
});
