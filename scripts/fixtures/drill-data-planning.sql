-- Dados fictícios da Entrega 16. Nenhuma PII real, token, segredo ou dado de produção.

INSERT INTO life_vision_versions (id, version, statement, horizon_years, principles_json, outcomes_json, status, superseded_by, source_id)
VALUES
  (
    '01f00000-0000-7000-8000-000000000300',
    1,
    'Visão inicial de teste',
    5,
    '["Aprender continuamente"]',
    '["Ter autonomia"]',
    'superseded',
    '01f00000-0000-7000-8000-000000000301',
    'src_manual'
  ),
  (
    '01f00000-0000-7000-8000-000000000301',
    2,
    'Visão revisada de teste',
    10,
    '["Aprender continuamente","Cuidar da saúde"]',
    '["Ter autonomia","Produzir conhecimento"]',
    'active',
    NULL,
    'src_manual'
  );

INSERT INTO strategic_area_profiles (area_id, description, importance, status, source_id)
VALUES ('01a1fb52-074d-7043-a390-78a0731bdb52', 'Área de estudos do drill', 4, 'active', 'src_manual');

INSERT INTO strategic_goals (id, goal_id, vision_id, horizon, importance, review_cadence_days, results_json, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000310',
  '01f00000-0000-7000-8000-000000000040',
  '01f00000-0000-7000-8000-000000000301',
  'short',
  4,
  90,
  '["Concluir 10 horas de estudo"]',
  'src_manual'
);

INSERT INTO planning_cycles (id, name, start_date, end_date, theme, expected_results_json, priority_projects_json, success_criteria_json, status, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000320',
  'Ciclo de teste',
  '2026-01-01',
  '2026-03-31',
  'Aprendizado',
  '["10 horas registradas"]',
  '[]',
  '["Meta concluída"]',
  'completed',
  'src_manual'
);

INSERT INTO planning_cycle_objectives (cycle_id, goal_id, is_priority)
VALUES ('01f00000-0000-7000-8000-000000000320', '01f00000-0000-7000-8000-000000000040', 1);

INSERT INTO capacity_profiles (id, weekly_minutes, contingency_percent, allocations_json, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000330',
  600,
  10,
  '[{"areaId":"01a1fb52-074d-7043-a390-78a0731bdb52","percent":50}]',
  'src_manual'
);

INSERT INTO capacity_unavailability (id, profile_id, from_date, to_date, reason, minutes_per_day)
VALUES (
  '01f00000-0000-7000-8000-000000000331',
  '01f00000-0000-7000-8000-000000000330',
  '2026-01-05',
  '2026-01-07',
  'Viagem fictícia',
  480
);

INSERT INTO planning_scenarios (id, name, hypotheses, changes_json, week_start, result_json, limitations_json, algorithm_version, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000340',
  'Cenário de teste',
  'Aumentar capacidade semanal',
  '[{"type":"set_capacity","value":720}]',
  '2026-01-05',
  '{"weeklyMinutes":720,"capacity":{"weekStart":"2026-01-05","availableMinutes":648}}',
  '["Simulação hipotética: nenhum dado real é alterado."]',
  'scenario-simulation-v1',
  'src_manual'
);

INSERT INTO planning_cycle_reviews (id, cycle_id, snapshot_json, reflections_json, source_id)
VALUES (
  '01f00000-0000-7000-8000-000000000350',
  '01f00000-0000-7000-8000-000000000320',
  '{"schemaVersion":1,"cycle":{"name":"Ciclo de teste","startDate":"2026-01-01","endDate":"2026-03-31"},"completedGoalIds":[],"pendingGoalIds":[],"changedGoalIds":[]}',
  '{"learned":"Reflexão fictícia de teste"}',
  'src_manual'
);
