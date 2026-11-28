-- Dados fictícios da Entrega 14. Nenhuma PII real, token, segredo ou dado de produção.

INSERT INTO projects (id, title, status, priority, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000100',
  'Projeto ficticio de execução',
  'active',
  'high',
  'src_manual'
);

INSERT INTO project_goals (project_id, goal_id)
VALUES (
  '01f00000-0000-7000-8000-000000000100',
  '01f00000-0000-7000-8000-000000000040'
);

INSERT INTO project_milestones (id, project_id, title, due_date, status, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000101',
  '01f00000-0000-7000-8000-000000000100',
  'Marco ficticio de projeto',
  '2026-02-15',
  'pending',
  'src_manual'
);

INSERT INTO tasks (id, title, project_id, milestone_id, status, priority, due_date, completed_at, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000102',
  'Tarefa ficticia A',
  '01f00000-0000-7000-8000-000000000100',
  '01f00000-0000-7000-8000-000000000101',
  'completed',
  'medium',
  '2026-01-15',
  '2026-01-15T18:00:00.000Z',
  'src_manual'
);

INSERT INTO tasks (id, title, project_id, status, priority, due_date, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000103',
  'Tarefa ficticia B',
  '01f00000-0000-7000-8000-000000000100',
  'todo',
  'high',
  '2026-01-20',
  'src_manual'
);

INSERT INTO task_dependencies (task_id, depends_on_task_id)
VALUES (
  '01f00000-0000-7000-8000-000000000103',
  '01f00000-0000-7000-8000-000000000102'
);
