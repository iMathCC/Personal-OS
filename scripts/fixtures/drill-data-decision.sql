-- Dados fictícios da Entrega 18. Nenhuma PII real, token, segredo ou dado de produção.
-- Apenas estado de alerta; o alerta em si é derivado deterministicamente.

INSERT INTO intelligence_alert_states (id, alert_id, state, rule_version, area, source_id, created_operation_id, updated_operation_id)
VALUES (
  '01f50000-0000-7000-8000-000000000001',
  'drill-alert-project-stalled',
  'acknowledged',
  'early-warning-v1',
  'projects',
  'src_manual',
  '01f50000-0000-7000-8000-000000000002',
  '01f50000-0000-7000-8000-000000000002'
);
