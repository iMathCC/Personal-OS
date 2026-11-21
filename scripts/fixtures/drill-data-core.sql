-- Dados fictícios inseridos após as migrations 0000-0002 (schema inicial).
-- Usado para provar que a migration 0003 funciona como upgrade com dados.

INSERT INTO users (id, display_name, setup_completed_at)
VALUES ('01f00000-0000-7000-8000-000000000001', 'Usuário de teste', '2026-01-10T12:00:00.000Z');

INSERT INTO app_settings (key, value_json)
VALUES ('theme', '"dark"');

INSERT INTO audit_log (id, entity_type, entity_id, action, actor_type, request_id, after_json)
VALUES (
  1,
  'user',
  '01f00000-0000-7000-8000-000000000001',
  'setup',
  'user',
  'req_drill_0001',
  '{"displayName":"Usuario de teste"}'
);

INSERT INTO passkeys (id, user_id, public_key, name)
VALUES (
  '01f00000-0000-7000-8000-000000000070',
  '01f00000-0000-7000-8000-000000000001',
  'ZmFrZS1wdWJsaWMta2V5LW5vdC1hLWNyZWRlbnRpYWw',
  'Chave fictícia'
);

-- Tabelas excluídas do backup: preenchidas para provar que NÃO são restauradas.
INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
VALUES (
  '01f00000-0000-7000-8000-000000000080',
  '01f00000-0000-7000-8000-000000000001',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '2026-01-12T00:00:00.000Z',
  '2026-01-11T12:00:00.000Z',
  '2026-01-11T12:00:00.000Z'
);

INSERT INTO recovery_codes (id, user_id, code_hash)
VALUES (
  '01f00000-0000-7000-8000-000000000090',
  '01f00000-0000-7000-8000-000000000001',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
);

INSERT INTO rate_limits (key, window_start, count, expires_at)
VALUES ('drill:rate', '2026-01-11T00:00:00.000Z', 1, '2026-01-12T00:00:00.000Z');

INSERT INTO idempotency_keys (key, method, path, request_hash, status_code, created_at, expires_at)
VALUES (
  'drill-cached',
  'POST',
  '/api/v1/studies/sessions',
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  201,
  '2026-01-11T12:00:00.000Z',
  '2026-01-12T00:00:00.000Z'
);
