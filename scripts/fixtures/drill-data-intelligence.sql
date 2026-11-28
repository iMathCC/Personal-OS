-- Dados fictícios da Entrega 15. Nenhuma PII real, token, segredo ou dado de produção.

INSERT INTO weekly_reviews (id, week_start, week_end, timezone, snapshot_json, focus, source_id, version)
VALUES (
  '01f00000-0000-7000-8000-000000000200',
  '2026-01-12',
  '2026-01-18',
  'America/Sao_Paulo',
  '{"schemaVersion":1,"weekStart":"2026-01-12","weekEnd":"2026-01-18","sections":{"happened":[],"advanced":[],"behind":[],"attention":[],"next":[]}}',
  'Revisar a meta de estudos',
  'src_manual',
  1
);
