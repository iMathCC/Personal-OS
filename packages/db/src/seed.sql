-- Seeds mínimos e idempotentes para o Personal OS.
-- Fontes de sistema usam IDs fixos previstos em docs/DATA_MODEL.md (exceção
-- documentada à regra de UUIDv7 para entidades de domínio). Áreas usam UUIDv7.
-- Nenhuma métrica, objetivo ou dado financeiro é semeado.

INSERT INTO sources (id, kind, name, description, is_system, config_json)
VALUES
  ('src_manual', 'manual', 'Entrada manual', 'Dados informados diretamente pelo usuário.', 1, NULL),
  ('src_import', 'import', 'Importação', 'Arquivos CSV/JSON importados pelo usuário.', 1, NULL),
  ('src_calculation', 'calculation', 'Cálculo determinístico', 'Valores derivados por algoritmo versionado.', 1, NULL),
  ('src_inference', 'inference', 'Inferência', 'Estimativas com confidence explícita.', 1, NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO areas (id, key, name, sort_order, is_active, source_id, version)
VALUES
  ('01a1fb52-074d-7043-a390-755bd43bc886', 'finance', 'Finanças', 1, 1, 'src_manual', 1),
  ('01a1fb52-074d-7043-a390-78a0731bdb52', 'studies', 'Estudos', 2, 1, 'src_manual', 1),
  ('01a1fb52-074d-7043-a390-7ce33d475268', 'career', 'Carreira', 3, 1, 'src_manual', 1),
  ('01a1fb52-074f-7276-9b76-2f14673252fa', 'reading', 'Leitura', 4, 1, 'src_manual', 1),
  ('01a1fb52-074f-7276-9b76-30aedaa5de9f', 'training', 'Treinos', 5, 1, 'src_manual', 1),
  ('01a1fb52-0750-73ea-8d9f-13be8d67d2ac', 'health', 'Saúde', 6, 1, 'src_manual', 1),
  ('01a1fb52-0750-73ea-8d9f-16ea692f671a', 'activities', 'Atividades', 7, 1, 'src_manual', 1),
  ('01a1fb52-0750-73ea-8d9f-1b7d1a616075', 'life', 'Vida', 8, 1, 'src_manual', 1)
ON CONFLICT(key) DO NOTHING;
