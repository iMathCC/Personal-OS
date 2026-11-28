-- Dados fictícios inseridos após a migration 0003 (upgrade com dados preexistentes).
-- Nenhuma PII real, token, chave privada ou segredo.

INSERT INTO courses (id, area_id, title, status, planned_minutes, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000010',
  '01a1fb52-074d-7043-a390-78a0731bdb52',
  'Curso ficticio de algoritmos',
  'active',
  600,
  'src_manual'
);

INSERT INTO study_sessions (id, course_id, topic, started_at, local_date, timezone, duration_minutes, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000020',
  '01f00000-0000-7000-8000-000000000010',
  'Aula 1',
  '2026-01-11T13:00:00.000Z',
  '2026-01-11',
  'America/Sao_Paulo',
  45,
  'src_manual'
);

INSERT INTO metric_observations (
  id, metric_id, observed_at, local_date, timezone, value_num, source_id,
  algorithm_version, course_id, study_session_id
)
VALUES (
  '01f00000-0000-7000-8000-000000000030',
  '0193a4b0-0000-7000-8000-000000000001',
  '2026-01-11T13:45:00.000Z',
  '2026-01-11',
  'America/Sao_Paulo',
  45,
  'src_calculation',
  'study-minutes-v1',
  '01f00000-0000-7000-8000-000000000010',
  '01f00000-0000-7000-8000-000000000020'
);

INSERT INTO goals (id, area_id, title, horizon, status, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000040',
  '01a1fb52-074d-7043-a390-78a0731bdb52',
  'Estudar 10 horas',
  'short',
  'active',
  'src_manual'
);

INSERT INTO goal_metrics (goal_id, metric_id, target_value, direction)
VALUES (
  '01f00000-0000-7000-8000-000000000040',
  '0193a4b0-0000-7000-8000-000000000001',
  600,
  'increase'
);

-- Marco da Entrega 13: garante que o drill de backup/restauração cubra dados de Objetivos.
INSERT INTO goal_milestones (id, goal_id, title, due_date, status, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000070',
  '01f00000-0000-7000-8000-000000000040',
  'Marco ficticio de estudo',
  '2026-02-01',
  'pending',
  'src_manual'
);

INSERT INTO events (id, area_id, course_id, study_session_id, title, occurred_at, local_date, timezone, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000050',
  '01a1fb52-074d-7043-a390-78a0731bdb52',
  '01f00000-0000-7000-8000-000000000010',
  '01f00000-0000-7000-8000-000000000020',
  'Sessao registrada',
  '2026-01-11T13:45:00.000Z',
  '2026-01-11',
  'America/Sao_Paulo',
  'src_manual'
);

INSERT INTO idempotency_key_reservations (key, operation_id, request_hash)
VALUES (
  'drill-key-1',
  '01f00000-0000-7000-8000-000000000060',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);

INSERT INTO operation_results (key, operation_id, request_hash, status_code, body_json)
VALUES (
  'drill-key-1',
  '01f00000-0000-7000-8000-000000000060',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  201,
  '{"data":{"id":"01f00000-0000-7000-8000-000000000020"}}'
);
