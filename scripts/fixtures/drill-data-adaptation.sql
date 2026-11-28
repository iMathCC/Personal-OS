-- Dados fictícios da Entrega 27. Nenhuma PII real, token, segredo ou dado de produção.
-- Apenas a decisão explícita do usuário sobre uma proposta determinística.

INSERT INTO adaptation_decisions (
  id, proposal_id, action, status, note, proposal_kind, proposal_title,
  severity, confidence, period_from, period_to, algorithm_version,
  proposal_snapshot_json, version, source_id, created_operation_id, updated_operation_id,
  created_at, updated_at
) VALUES (
  '01f60000-0000-7000-8000-000000000001',
  'drill-adaptation-proposal-1',
  'accept',
  'accepted',
  'Drill: decisão explícita registrada.',
  'execution',
  'Adaptar execução para reduzir atrito',
  'attention',
  'medium',
  '2026-11-01',
  '2026-11-30',
  'adaptation-proposal-v1',
  '{"id":"drill-adaptation-proposal-1","status":"accepted","kind":"execution","title":"Adaptar execução para reduzir atrito","summary":"Resumo fictício.","reason":"Motivo fictício.","recommendedAction":"Focar no crítico","severity":"attention","confidence":"medium","confidenceScore":0.7,"period":{"from":"2026-11-01","to":"2026-11-30"},"deviationIds":[],"impactIds":[],"constraints":[],"alternatives":[],"simulations":[],"evidence":[],"sources":["tasks"],"limitations":["Dado fictício de drill."],"cannotConclude":[],"algorithmVersion":"adaptation-proposal-v1"}',
  1,
  'src_manual',
  '01f60000-0000-7000-8000-000000000002',
  '01f60000-0000-7000-8000-000000000002',
  '2026-11-25T00:00:00.000Z',
  '2026-11-25T00:00:00.000Z'
);
