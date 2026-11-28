import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyIntelligenceSchema,
  applyPlanningMigration,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const GOAL_ID = '0194a4d0-0000-7000-8000-000000000071';
const CYCLE_ID = '0194a4d0-0000-7000-8000-000000000072';
const VISION_ID = '0194a4d0-0000-7000-8000-000000000073';
const AREA_ID = '01a1fb52-074d-7043-a390-7ce33d475268';

async function insertGoal(): Promise<void> {
  await run(
    `INSERT INTO goals (id, area_id, title, horizon, status, source_id)
     VALUES (?, ?, ?, 'medium', 'active', 'src_manual')`,
    GOAL_ID,
    AREA_ID,
    'Meta de teste',
  );
}

describe('migração 0007 — planejamento estratégico', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala as nove tabelas com índices das chaves estrangeiras e buscas', async () => {
    await applyIntelligenceSchema();
    await applyPlanningMigration();

    const tables = await tableNames();
    expect(tables).toEqual(
      expect.arrayContaining([
        'life_vision_versions',
        'strategic_area_profiles',
        'strategic_goals',
        'planning_cycles',
        'planning_cycle_objectives',
        'planning_cycle_reviews',
        'capacity_profiles',
        'capacity_unavailability',
        'planning_scenarios',
      ]),
    );
    expect(await indexNames('planning_cycle_objectives')).toEqual(
      expect.arrayContaining([
        'uq_planning_cycle_objectives',
        'idx_planning_cycle_objectives_goal',
        'idx_planning_cycle_objectives_priority',
      ]),
    );
    expect(await indexNames('capacity_profiles')).toContain('uq_capacity_profiles_active');
    expect(await indexNames('strategic_goals')).toContain('uq_strategic_goals_goal');
  });

  it('faz upgrade preservando metas, áreas e auditoria anteriores', async () => {
    await applyIntelligenceSchema();
    await executeSql(seedSql);
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type)
       VALUES ('goal', '${GOAL_ID}', 'create', 'system')`,
    );

    await applyPlanningMigration();
    await run(
      `INSERT INTO life_vision_versions (id, version, statement, status)
       VALUES ('${VISION_ID}', 1, 'Visão de teste', 'active')`,
    );

    expect(await first<{ action: string }>('SELECT action FROM audit_log')).toEqual({
      action: 'create',
    });
    expect(
      await first<{ statement: string }>('SELECT statement FROM life_vision_versions'),
    ).toEqual({
      statement: 'Visão de teste',
    });
  });

  it('garante integridade, proveniência e limites das estruturas', async () => {
    await applyIntelligenceSchema();
    await executeSql(seedSql);
    await applyPlanningMigration();
    await insertGoal();

    await run(
      `INSERT INTO life_vision_versions (id, version, statement, status)
       VALUES ('${VISION_ID}', 1, 'Visão', 'active')`,
    );
    await expect(
      run(`INSERT INTO life_vision_versions (id, version, status) VALUES ('other', 1, 'active')`),
    ).rejects.toThrow(/UNIQUE constraint/i);
    await expect(
      run(
        `INSERT INTO life_vision_versions (id, version, status, principles_json)
         VALUES ('invalid', 1, 'draft', 'nao-e-json')`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    await run(
      `INSERT INTO planning_cycles (id, name, start_date, end_date)
       VALUES ('${CYCLE_ID}', 'Ciclo 1', '2026-11-23', '2026-12-20')`,
    );
    await run(
      `INSERT INTO planning_cycle_objectives (cycle_id, goal_id) VALUES ('${CYCLE_ID}', '${GOAL_ID}')`,
    );
    await expect(
      run(
        `INSERT INTO planning_cycle_objectives (cycle_id, goal_id) VALUES ('${CYCLE_ID}', '${GOAL_ID}')`,
      ),
    ).rejects.toThrow(/UNIQUE constraint/i);

    await run(`INSERT INTO capacity_profiles (id, weekly_minutes) VALUES ('profile-1', 600)`);
    await expect(
      run(`INSERT INTO capacity_profiles (id, weekly_minutes) VALUES ('profile-2', 600)`),
    ).rejects.toThrow(/UNIQUE constraint/i);
    await expect(
      run(
        `INSERT INTO capacity_profiles (id, weekly_minutes, preferences_json)
         VALUES ('profile-3', 600, 'invalido')`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);

    const columns = await all<{ name: string }>("PRAGMA table_info('capacity_profiles')");
    expect(columns.map((column) => column.name)).toContain('preferences_json');
  });
});
