-- Dados fictícios da Entrega 17. Nenhuma PII real, token, segredo ou dado de produção.
-- Ordem de inserção respeita as FKs: lote antes dos registros que o referenciam.

INSERT INTO life_import_batches (id, domain, format, file_name, total, imported, invalid, duplicates, report_json, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000001',
  'finance_transactions',
  'csv',
  'extrato-ficticio.csv',
  2,
  1,
  1,
  0,
  '{"total":2,"imported":1,"invalid":1,"duplicates":0,"issueCodes":["invalid_row"]}',
  'src_import'
);

INSERT INTO finance_accounts (id, name, type, currency, initial_balance_cents, include_in_patrimony, external_id, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000010',
  'Conta fictícia de teste',
  'checking',
  'BRL',
  100000,
  1,
  'drill-account-1',
  'observed',
  'finance-summary-v1',
  'src_manual'
);

INSERT INTO finance_categories (id, name, kind, external_id, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000011',
  'Categoria fictícia de teste',
  'expense',
  'drill-category-1',
  'observed',
  'finance-summary-v1',
  'src_manual'
);

INSERT INTO finance_transactions (id, account_id, category_id, kind, amount_cents, date, description, external_id, origin_kind, algorithm_version, import_batch_id, source_id)
VALUES
  (
    '01f40000-0000-7000-8000-000000000020',
    '01f40000-0000-7000-8000-000000000010',
    '01f40000-0000-7000-8000-000000000011',
    'expense',
    2500,
    '2026-11-02',
    'Despesa fictícia de teste',
    'drill-tx-1',
    'observed',
    'finance-summary-v1',
    NULL,
    'src_manual'
  ),
  (
    '01f40000-0000-7000-8000-000000000021',
    '01f40000-0000-7000-8000-000000000010',
    NULL,
    'income',
    10000,
    '2026-11-03',
    'Receita fictícia importada',
    'drill-tx-2',
    'imported',
    'finance-summary-v1',
    '01f40000-0000-7000-8000-000000000001',
    'src_import'
  );

INSERT INTO finance_balance_items (id, account_id, kind, name, amount_cents, date, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000030',
  '01f40000-0000-7000-8000-000000000010',
  'asset',
  'Composição fictícia de teste',
  100000,
  '2026-11-30',
  'observed',
  'finance-summary-v1',
  'src_manual'
);

INSERT INTO health_metrics (id, key, label, unit, value_kind, external_id, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000040',
  'sleep_minutes',
  'Sono (minutos)',
  'minutos',
  'integer',
  'drill-metric-1',
  'observed',
  'health-summary-v1',
  'src_manual'
);

INSERT INTO health_observations (id, metric_id, date, value, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000041',
  '01f40000-0000-7000-8000-000000000040',
  '2026-11-02',
  480,
  'observed',
  'health-summary-v1',
  'src_manual'
);

INSERT INTO training_sessions (id, activity_type, date, duration_minutes, intensity, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000050',
  'walk',
  '2026-11-02',
  30,
  5,
  'observed',
  'training-summary-v1',
  'src_manual'
);

INSERT INTO reading_materials (id, title, author, kind, reading_status, total_pages, external_id, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000060',
  'Livro fictício de teste',
  'Autor fictício',
  'book',
  'reading',
  200,
  'drill-material-1',
  'observed',
  'reading-summary-v1',
  'src_manual'
);

INSERT INTO reading_sessions (id, material_id, date, minutes, pages_read, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000061',
  '01f40000-0000-7000-8000-000000000060',
  '2026-11-02',
  30,
  40,
  'observed',
  'reading-summary-v1',
  'src_manual'
);

INSERT INTO reading_notes (id, material_id, date, kind, content, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000062',
  '01f40000-0000-7000-8000-000000000060',
  '2026-11-02',
  'note',
  'Anotação fictícia de teste',
  'observed',
  'reading-summary-v1',
  'src_manual'
);

INSERT INTO time_entries (id, date, duration_minutes, note, origin_kind, algorithm_version, source_id)
VALUES (
  '01f40000-0000-7000-8000-000000000070',
  '2026-11-02',
  60,
  'Registro fictício de tempo',
  'observed',
  'time-summary-v1',
  'src_manual'
);
