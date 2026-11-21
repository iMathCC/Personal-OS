-- Entrega 5 — modelo central, módulo de Estudos e infraestrutura de operações.
-- Migração aditiva: funciona em banco vazio e em banco com auth/auditoria existentes.
-- Nenhuma migração anterior é alterada; FKs permanecem habilitadas.

-- ---------------------------------------------------------------------------
-- 1. Estado operacional da idempotência (colunas aditivas).
-- Linhas já existentes representam respostas concluídas, daí o default 'done'.
-- ---------------------------------------------------------------------------
ALTER TABLE `idempotency_keys` ADD COLUMN `subject` text;
--> statement-breakpoint
ALTER TABLE `idempotency_keys` ADD COLUMN `op_id` text;
--> statement-breakpoint
ALTER TABLE `idempotency_keys` ADD COLUMN `state` text DEFAULT 'done' NOT NULL;
--> statement-breakpoint
ALTER TABLE `idempotency_keys` ADD COLUMN `attempt` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `idempotency_keys` ADD COLUMN `error_json` text;
--> statement-breakpoint
CREATE INDEX `idx_idempotency_subject` ON `idempotency_keys` (`subject`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_idempotency_op` ON `idempotency_keys` (`op_id`);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Reserva permanente da identidade da chave (append-only).
-- Criada ANTES de qualquer mutação de domínio; sobrevive à limpeza da chave
-- operacional e à expiração de `idempotency_keys`.
-- ---------------------------------------------------------------------------
CREATE TABLE `idempotency_key_reservations` (
	`key` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "idempotency_key_reservations_op_format" CHECK(length("operation_id") = 36),
	CONSTRAINT "idempotency_key_reservations_hash_format" CHECK(length("request_hash") = 64)
);
--> statement-breakpoint
CREATE TRIGGER `idempotency_key_reservations_no_update`
BEFORE UPDATE ON `idempotency_key_reservations`
BEGIN
  SELECT RAISE(ABORT, 'idempotency_key_reservations is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `idempotency_key_reservations_no_delete`
BEFORE DELETE ON `idempotency_key_reservations`
BEGIN
  SELECT RAISE(ABORT, 'idempotency_key_reservations is append-only');
END;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Resultados imutáveis das operações concluídas (append-only).
-- A recuperação lê daqui, nunca reconstrói a resposta a partir de entidades
-- que podem ter mudado desde a operação original.
-- ---------------------------------------------------------------------------
CREATE TABLE `operation_results` (
	`key` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`status_code` integer NOT NULL,
	`body_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "operation_results_op_format" CHECK(length("operation_id") = 36),
	CONSTRAINT "operation_results_hash_format" CHECK(length("request_hash") = 64),
	CONSTRAINT "operation_results_status" CHECK("status_code" BETWEEN 100 AND 599),
	CONSTRAINT "operation_results_body_json_valid" CHECK(json_valid("body_json")),
	CONSTRAINT "operation_results_body_size" CHECK(length(CAST("body_json" AS BLOB)) <= 32768)
);
--> statement-breakpoint
CREATE TRIGGER `operation_results_no_update`
BEFORE UPDATE ON `operation_results`
BEGIN
  SELECT RAISE(ABORT, 'operation_results is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `operation_results_no_delete`
BEFORE DELETE ON `operation_results`
BEGIN
  SELECT RAISE(ABORT, 'operation_results is append-only');
END;
--> statement-breakpoint
CREATE INDEX `idx_operation_results_op` ON `operation_results` (`operation_id`);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Definições de métricas.
-- ---------------------------------------------------------------------------
CREATE TABLE `metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`unit` text NOT NULL,
	`value_type` text NOT NULL,
	`aggregation` text NOT NULL,
	`direction` text NOT NULL,
	`cadence` text NOT NULL,
	`target_value` real,
	`precision` integer DEFAULT 2 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`source_id` text NOT NULL REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "metrics_value_type" CHECK("value_type" IN ('number','integer','duration','currency','boolean','rating')),
	CONSTRAINT "metrics_aggregation" CHECK("aggregation" IN ('sum','avg','last','min','max','count')),
	CONSTRAINT "metrics_direction" CHECK("direction" IN ('higher_better','lower_better','neutral')),
	CONSTRAINT "metrics_cadence" CHECK("cadence" IN ('daily','weekly','monthly','ad_hoc')),
	CONSTRAINT "metrics_precision" CHECK("precision" BETWEEN 0 AND 6),
	CONSTRAINT "metrics_is_active_boolean" CHECK("is_active" IN (0,1)),
	CONSTRAINT "metrics_version_positive" CHECK("version" > 0),
	CONSTRAINT "metrics_key_length" CHECK(length("key") BETWEEN 1 AND 120),
	CONSTRAINT "metrics_unit_length" CHECK(length("unit") BETWEEN 1 AND 16),
	CONSTRAINT "metrics_metadata_json_valid" CHECK("metadata_json" IS NULL OR json_valid("metadata_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metrics_key_unique` ON `metrics` (`key`);
--> statement-breakpoint
CREATE INDEX `idx_metrics_area` ON `metrics` (`area_id`);
--> statement-breakpoint
CREATE INDEX `idx_metrics_source` ON `metrics` (`source_id`);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Objetivos e vínculo com métricas.
-- ---------------------------------------------------------------------------
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text NOT NULL REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict,
	`parent_goal_id` text REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE restrict,
	`title` text NOT NULL,
	`description` text,
	`horizon` text NOT NULL,
	`status` text NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`start_date` text,
	`target_date` text,
	`success_criteria` text,
	`progress_mode` text DEFAULT 'manual' NOT NULL,
	`manual_progress` real,
	`achieved_at` text,
	`archived_at` text,
	`source_id` text NOT NULL REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`deleted_at` text,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "goals_horizon" CHECK("horizon" IN ('short','medium','long')),
	CONSTRAINT "goals_status" CHECK("status" IN ('draft','active','paused','achieved','cancelled')),
	CONSTRAINT "goals_priority" CHECK("priority" BETWEEN 1 AND 5),
	CONSTRAINT "goals_progress_mode" CHECK("progress_mode" IN ('manual','metrics','tasks','hybrid')),
	CONSTRAINT "goals_manual_progress" CHECK("manual_progress" IS NULL OR "manual_progress" BETWEEN 0 AND 100),
	CONSTRAINT "goals_title_length" CHECK(length("title") BETWEEN 1 AND 200),
	CONSTRAINT "goals_date_order" CHECK("target_date" IS NULL OR "start_date" IS NULL OR "target_date" >= "start_date"),
	CONSTRAINT "goals_version_positive" CHECK("version" > 0),
	CONSTRAINT "goals_metadata_json_valid" CHECK("metadata_json" IS NULL OR json_valid("metadata_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goals_area_title_unique` ON `goals` (`area_id`,`title`) WHERE "goals"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_goals_area_status` ON `goals` (`area_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_goals_parent` ON `goals` (`parent_goal_id`);
--> statement-breakpoint
CREATE INDEX `idx_goals_target` ON `goals` (`target_date`) WHERE "goals"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_goals_source` ON `goals` (`source_id`);
--> statement-breakpoint

CREATE TABLE `goal_metrics` (
	`goal_id` text NOT NULL REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	`metric_id` text NOT NULL REFERENCES `metrics`(`id`) ON UPDATE no action ON DELETE restrict,
	`baseline_value` real,
	`target_value` real NOT NULL,
	`target_date` text,
	`direction` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY (`goal_id`,`metric_id`),
	CONSTRAINT "goal_metrics_direction" CHECK("direction" IN ('increase','decrease','maintain')),
	CONSTRAINT "goal_metrics_weight_positive" CHECK("weight" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_goal_metrics_metric` ON `goal_metrics` (`metric_id`);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. Estudos: cursos e sessões. Relações tipadas, sem colunas polimórficas.
-- `timezone` é capturado junto com `local_date` (decisão local da Entrega 5).
-- ---------------------------------------------------------------------------
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text NOT NULL REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict,
	`title` text NOT NULL,
	`provider` text,
	`url` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`start_date` text,
	`target_end_date` text,
	`completed_at` text,
	`planned_minutes` integer,
	`notes` text,
	`source_id` text NOT NULL REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`deleted_at` text,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "courses_status" CHECK("status" IN ('planned','active','paused','completed','dropped')),
	CONSTRAINT "courses_title_length" CHECK(length("title") BETWEEN 1 AND 200),
	CONSTRAINT "courses_planned_minutes" CHECK("planned_minutes" IS NULL OR "planned_minutes" >= 0),
	CONSTRAINT "courses_date_order" CHECK("target_end_date" IS NULL OR "start_date" IS NULL OR "target_end_date" >= "start_date"),
	CONSTRAINT "courses_version_positive" CHECK("version" > 0),
	CONSTRAINT "courses_metadata_json_valid" CHECK("metadata_json" IS NULL OR json_valid("metadata_json"))
);
--> statement-breakpoint
CREATE INDEX `idx_courses_area_status` ON `courses` (`area_id`,`status`) WHERE "courses"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_courses_source` ON `courses` (`source_id`);
--> statement-breakpoint

CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null,
	`topic` text NOT NULL,
	`started_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`units_completed` real,
	`notes` text,
	`external_ref` text,
	`dedupe_key` text,
	`source_id` text NOT NULL REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`deleted_at` text,
	`created_operation_id` text,
	`updated_operation_id` text,
	`delete_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "study_sessions_topic_length" CHECK(length("topic") BETWEEN 1 AND 200),
	CONSTRAINT "study_sessions_duration_positive" CHECK("duration_minutes" > 0),
	CONSTRAINT "study_sessions_units_non_negative" CHECK("units_completed" IS NULL OR "units_completed" >= 0),
	CONSTRAINT "study_sessions_version_positive" CHECK("version" > 0),
	CONSTRAINT "study_sessions_metadata_json_valid" CHECK("metadata_json" IS NULL OR json_valid("metadata_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_sessions_dedupe_unique` ON `study_sessions` (`dedupe_key`) WHERE "study_sessions"."dedupe_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_study_date` ON `study_sessions` (`local_date`);
--> statement-breakpoint
CREATE INDEX `idx_study_course` ON `study_sessions` (`course_id`);
--> statement-breakpoint
CREATE INDEX `idx_study_source` ON `study_sessions` (`source_id`);
--> statement-breakpoint
CREATE INDEX `idx_study_active_date` ON `study_sessions` (`local_date`,`id`) WHERE "study_sessions"."deleted_at" IS NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 7. Observações de métricas: fonte canônica de fatos escalares.
-- Correção preserva a original e cria nova versão vinculada por superseded_by.
-- ---------------------------------------------------------------------------
CREATE TABLE `metric_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`metric_id` text NOT NULL REFERENCES `metrics`(`id`) ON UPDATE no action ON DELETE restrict,
	`observed_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`value_num` real,
	`value_text` text,
	`sample_marker` text,
	`dimension_json` text,
	`source_id` text NOT NULL REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	`source_ref` text,
	`dedupe_key` text,
	`confidence` real,
	`algorithm_version` text,
	`superseded_by` text REFERENCES `metric_observations`(`id`) ON UPDATE no action ON DELETE restrict,
	`course_id` text REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null,
	`study_session_id` text REFERENCES `study_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	`created_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "metric_observations_single_value" CHECK((`value_num` IS NULL) <> (`value_text` IS NULL)),
	CONSTRAINT "metric_observations_confidence" CHECK("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1),
	CONSTRAINT "metric_observations_dimension_json_valid" CHECK("dimension_json" IS NULL OR json_valid("dimension_json")),
	CONSTRAINT "metric_observations_source_requirements" CHECK(
	  ("source_id" <> 'src_inference' OR "confidence" IS NOT NULL)
	  AND ("source_id" <> 'src_calculation' OR "algorithm_version" IS NOT NULL)
	),
	CONSTRAINT "metric_observations_no_self_reference" CHECK("superseded_by" IS NULL OR "superseded_by" <> "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metric_observations_dedupe_unique` ON `metric_observations` (`dedupe_key`) WHERE "metric_observations"."dedupe_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_obs_metric_time` ON `metric_observations` (`metric_id`,`observed_at`);
--> statement-breakpoint
CREATE INDEX `idx_obs_metric_date` ON `metric_observations` (`metric_id`,`local_date`);
--> statement-breakpoint
CREATE INDEX `idx_obs_source` ON `metric_observations` (`source_id`);
--> statement-breakpoint
CREATE INDEX `idx_obs_superseded` ON `metric_observations` (`superseded_by`);
--> statement-breakpoint
CREATE INDEX `idx_obs_session` ON `metric_observations` (`study_session_id`);
--> statement-breakpoint
CREATE INDEX `idx_obs_course` ON `metric_observations` (`course_id`);
--> statement-breakpoint
CREATE INDEX `idx_obs_active_metric_date` ON `metric_observations` (`metric_id`,`local_date`) WHERE "metric_observations"."superseded_by" IS NULL;
--> statement-breakpoint

-- O valor observado é imutável; apenas o vínculo de correção pode mudar.
CREATE TRIGGER `metric_observations_immutable_values`
BEFORE UPDATE ON `metric_observations`
WHEN NEW.`value_num` IS NOT OLD.`value_num`
  OR NEW.`value_text` IS NOT OLD.`value_text`
  OR NEW.`metric_id` IS NOT OLD.`metric_id`
  OR NEW.`observed_at` IS NOT OLD.`observed_at`
  OR NEW.`local_date` IS NOT OLD.`local_date`
  OR NEW.`source_id` IS NOT OLD.`source_id`
  OR NEW.`algorithm_version` IS NOT OLD.`algorithm_version`
BEGIN
  SELECT RAISE(ABORT, 'metric_observations values are immutable');
END;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 8. Eventos com relações tipadas (nunca from_type/from_id).
-- ---------------------------------------------------------------------------
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict,
	`goal_id` text REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	`course_id` text REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null,
	`study_session_id` text REFERENCES `study_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	`title` text NOT NULL,
	`description` text,
	`event_type` text DEFAULT 'note' NOT NULL,
	`occurred_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`duration_minutes` integer,
	`payload_json` text,
	`source_id` text NOT NULL REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`deleted_at` text,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "events_title_length" CHECK(length("title") BETWEEN 1 AND 200),
	CONSTRAINT "events_duration_non_negative" CHECK("duration_minutes" IS NULL OR "duration_minutes" >= 0),
	CONSTRAINT "events_version_positive" CHECK("version" > 0),
	CONSTRAINT "events_payload_json_valid" CHECK("payload_json" IS NULL OR json_valid("payload_json")),
	CONSTRAINT "events_metadata_json_valid" CHECK("metadata_json" IS NULL OR json_valid("metadata_json"))
);
--> statement-breakpoint
CREATE INDEX `idx_events_date` ON `events` (`local_date`);
--> statement-breakpoint
CREATE INDEX `idx_events_area_date` ON `events` (`area_id`,`local_date`);
--> statement-breakpoint
CREATE INDEX `idx_events_goal` ON `events` (`goal_id`);
--> statement-breakpoint
CREATE INDEX `idx_events_course` ON `events` (`course_id`);
--> statement-breakpoint
CREATE INDEX `idx_events_session` ON `events` (`study_session_id`);
--> statement-breakpoint
CREATE INDEX `idx_events_source` ON `events` (`source_id`);
--> statement-breakpoint

-- Índice de dedupe estável para auditoria (request_id + entidade + ação).
CREATE INDEX `idx_audit_request_entity` ON `audit_log` (`request_id`,`entity_type`,`entity_id`,`action`);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 9. Guardas de transição de estado (concorrência no D1 serial).
-- Correção e exclusão lógica são operações de idade única: o segundo
-- `UPDATE` vê o estado já mutado e aborta o batch inteiro, sem órfãos.
-- ---------------------------------------------------------------------------
CREATE TRIGGER `metric_observations_supersede_once`
BEFORE UPDATE OF `superseded_by` ON `metric_observations`
WHEN OLD.`superseded_by` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'observation already superseded');
END;
--> statement-breakpoint
CREATE TRIGGER `study_sessions_delete_once`
BEFORE UPDATE OF `deleted_at` ON `study_sessions`
WHEN OLD.`deleted_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'session already deleted');
END;
--> statement-breakpoint
