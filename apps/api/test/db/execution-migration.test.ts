import seedSql from '../../../../packages/db/src/seed.sql?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  all,
  applyExecutionMigration,
  applyExecutionSchema,
  applyGoalsSchema,
  executeSql,
  first,
  indexNames,
  resetDatabase,
  run,
  tableNames,
} from './helpers';

const GOAL_ID = '0193a4d0-0000-7000-8000-000000000001';
const PROJECT_ID = '0193a4d0-0000-7000-8000-000000000010';
const MILESTONE_ID = '0193a4d0-0000-7000-8000-000000000011';
const TASK_A = '0193a4d0-0000-7000-8000-000000000012';
const TASK_B = '0193a4d0-0000-7000-8000-000000000013';

async function seedBase(): Promise<void> {
  await executeSql(seedSql);
  await run(
    `INSERT INTO goals (id, area_id, title, horizon, status, source_id)
     VALUES (?, ?, ?, 'medium', 'active', 'src_manual')`,
    GOAL_ID,
    '01a1fb52-074d-7043-a390-78a0731bdb52',
    'Objetivo pré-existente',
  );
}

async function seedExecution(): Promise<void> {
  await seedBase();
  await run(
    `INSERT INTO projects (id, title, status, priority, source_id)
     VALUES (?, ?, 'active', 'medium', 'src_manual')`,
    PROJECT_ID,
    'Projeto de teste',
  );
}

describe('migração 0005 — camada de execução', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('instala em banco vazio com tabelas, índices de FK e filtros', async () => {
    await applyExecutionSchema();
    expect(await tableNames()).toEqual(
      expect.arrayContaining([
        'projects',
        'project_goals',
        'project_milestones',
        'tasks',
        'task_dependencies',
      ]),
    );
    expect(await indexNames('projects')).toEqual(
      expect.arrayContaining([
        'idx_projects_status_updated',
        'idx_projects_priority',
        'idx_projects_target_date',
      ]),
    );
    expect(await indexNames('tasks')).toEqual(
      expect.arrayContaining([
        'idx_tasks_project_status',
        'idx_tasks_goal',
        'idx_tasks_milestone',
        'idx_tasks_due',
        'idx_tasks_status_priority',
      ]),
    );
    expect(await indexNames('task_dependencies')).toEqual(
      expect.arrayContaining(['idx_task_dependencies_task', 'idx_task_dependencies_depends_on']),
    );
  });

  it('faz upgrade preservando objetivos, auditoria e marcos existentes', async () => {
    await applyGoalsSchema();
    await seedBase();
    await run(
      `INSERT INTO goal_milestones (id, goal_id, title, status, source_id)
       VALUES ('0193a4d0-0000-7000-8000-000000000009', ?, 'Marco antigo', 'pending', 'src_manual')`,
      GOAL_ID,
    );
    await run(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type)
       VALUES ('goal', ?, 'create', 'system')`,
      GOAL_ID,
    );

    await applyExecutionMigration();

    expect(await all<{ title: string }>('SELECT title FROM goals')).toEqual([
      { title: 'Objetivo pré-existente' },
    ]);
    expect(await all<{ title: string }>('SELECT title FROM goal_milestones')).toEqual([
      { title: 'Marco antigo' },
    ]);
    expect(await all<{ action: string }>('SELECT action FROM audit_log')).toEqual([
      { action: 'create' },
    ]);
  });

  it('valida enums, versão, datas e consistência de conclusão', async () => {
    await applyExecutionSchema();
    await seedExecution();
    await expect(
      run(
        `INSERT INTO projects (id, title, status, priority, source_id)
         VALUES ('0193a4d0-0000-7000-8000-000000000020', 'Inválido', 'doing', 'medium', 'src_manual')`,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await expect(
      run(
        `INSERT INTO tasks (id, title, project_id, status, priority, source_id)
         VALUES (?, ?, ?, 'done', 'medium', 'src_manual')`,
        TASK_A,
        'Tarefa',
        PROJECT_ID,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await expect(
      run(
        `INSERT INTO tasks (id, title, project_id, status, priority, source_id)
         VALUES (?, ?, ?, 'completed', 'medium', 'src_manual')`,
        TASK_A,
        'Tarefa concluída sem data',
        PROJECT_ID,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await run(
      `INSERT INTO tasks (id, title, project_id, status, priority, completed_at, source_id)
       VALUES (?, ?, ?, 'completed', 'medium', '2026-11-22T10:00:00.000Z', 'src_manual')`,
      TASK_A,
      'Tarefa concluída',
      PROJECT_ID,
    );
    expect(
      await first<{ version: number }>('SELECT version FROM tasks WHERE id = ?', TASK_A),
    ).toMatchObject({
      version: 1,
    });
  });

  it('mantém integridade referencial, desvinculação segura e ausência de self-loop', async () => {
    await applyExecutionSchema();
    await seedExecution();
    await run(
      `INSERT INTO project_milestones (id, project_id, title, status, source_id)
       VALUES (?, ?, 'Marco', 'pending', 'src_manual')`,
      MILESTONE_ID,
      PROJECT_ID,
    );
    await run(
      `INSERT INTO tasks (id, title, project_id, milestone_id, status, priority, source_id)
       VALUES (?, ?, ?, ?, 'todo', 'medium', 'src_manual')`,
      TASK_A,
      'Tarefa A',
      PROJECT_ID,
      MILESTONE_ID,
    );
    await run(
      `INSERT INTO tasks (id, title, project_id, status, priority, source_id)
       VALUES (?, ?, ?, 'todo', 'medium', 'src_manual')`,
      TASK_B,
      'Tarefa B',
      PROJECT_ID,
    );
    await run(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`,
      TASK_B,
      TASK_A,
    );
    await expect(
      run(
        `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`,
        TASK_A,
        TASK_A,
      ),
    ).rejects.toThrow(/CHECK constraint/i);
    await expect(
      run(
        `INSERT INTO tasks (id, title, project_id, status, priority, source_id)
         VALUES ('0193a4d0-0000-7000-8000-000000000030', 'Órfã', 'projeto-inexistente', 'todo', 'medium', 'src_manual')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint/i);

    await run('DELETE FROM projects WHERE id = ?', PROJECT_ID);
    // A remoção interna de um projeto não apaga tarefas: desvincula project_id
    // e milestone_id, preservando histórico e dependências declaradas.
    expect(
      await all<{ project_id: string | null; milestone_id: string | null }>(
        'SELECT project_id, milestone_id FROM tasks ORDER BY id',
      ),
    ).toEqual([
      { project_id: null, milestone_id: null },
      { project_id: null, milestone_id: null },
    ]);
    expect(await all<{ id: string }>('SELECT id FROM project_milestones')).toEqual([]);
    expect(await all<{ task_id: string }>('SELECT task_id FROM task_dependencies')).toEqual([
      { task_id: TASK_B },
    ]);
  });
});
