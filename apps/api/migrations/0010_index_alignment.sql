-- Entrega 21 — alinhamento aditivo de índices.
-- `idx_audit_request_entity` já existe no SQL aplicado 0003; a forma IDÊNTICA
-- evita falha em bancos onde ele foi criado. `idx_life_import_batches_source_id`
-- faltava no Drizzle, no snapshot e na migration 0008.
CREATE INDEX IF NOT EXISTS `idx_audit_request_entity` ON `audit_log` (`request_id`,`entity_type`,`entity_id`,`action`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_life_import_batches_source_id` ON `life_import_batches` (`source_id`);
