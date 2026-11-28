CREATE TABLE `finance_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`initial_balance_cents` integer DEFAULT 0 NOT NULL,
	`include_in_patrimony` integer DEFAULT 1 NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_accounts_name_length" CHECK(length("finance_accounts"."name") BETWEEN 1 AND 200),
	CONSTRAINT "finance_accounts_type" CHECK("finance_accounts"."type" IN ('checking','savings','cash','investment')),
	CONSTRAINT "finance_accounts_currency" CHECK(length("finance_accounts"."currency") = 3),
	CONSTRAINT "finance_accounts_patrimony_boolean" CHECK("finance_accounts"."include_in_patrimony" IN (0,1)),
	CONSTRAINT "finance_accounts_origin_kind" CHECK("finance_accounts"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "finance_accounts_status" CHECK("finance_accounts"."status" IN ('active','superseded','archived')),
	CONSTRAINT "finance_accounts_confidence" CHECK("finance_accounts"."confidence" IS NULL OR "finance_accounts"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "finance_accounts_version_positive" CHECK("finance_accounts"."version" > 0),
	CONSTRAINT "finance_accounts_no_self_reference" CHECK(("finance_accounts"."superseded_by" IS NULL OR "finance_accounts"."superseded_by" <> "finance_accounts"."id") AND ("finance_accounts"."corrects_id" IS NULL OR "finance_accounts"."corrects_id" <> "finance_accounts"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_finance_accounts_external` ON `finance_accounts` (`external_id`) WHERE "finance_accounts"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_finance_accounts_source` ON `finance_accounts` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_accounts_status` ON `finance_accounts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_finance_accounts_superseded` ON `finance_accounts` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_finance_accounts_corrects` ON `finance_accounts` (`corrects_id`);--> statement-breakpoint
CREATE TABLE `finance_balance_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`account_id` text,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`date` text NOT NULL,
	`import_batch_id` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`import_batch_id`) REFERENCES `life_import_batches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_balance_items_kind" CHECK("finance_balance_items"."kind" IN ('asset','debt')),
	CONSTRAINT "finance_balance_items_amount" CHECK("finance_balance_items"."amount_cents" >= 0),
	CONSTRAINT "finance_balance_items_currency" CHECK(length("finance_balance_items"."currency") = 3),
	CONSTRAINT "finance_balance_items_date_format" CHECK(length("finance_balance_items"."date") = 10),
	CONSTRAINT "finance_balance_items_name_length" CHECK(length("finance_balance_items"."name") BETWEEN 1 AND 200),
	CONSTRAINT "finance_balance_items_origin_kind" CHECK("finance_balance_items"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "finance_balance_items_status" CHECK("finance_balance_items"."status" IN ('active','superseded','archived')),
	CONSTRAINT "finance_balance_items_confidence" CHECK("finance_balance_items"."confidence" IS NULL OR "finance_balance_items"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "finance_balance_items_version_positive" CHECK("finance_balance_items"."version" > 0),
	CONSTRAINT "finance_balance_items_no_self_reference" CHECK(("finance_balance_items"."superseded_by" IS NULL OR "finance_balance_items"."superseded_by" <> "finance_balance_items"."id") AND ("finance_balance_items"."corrects_id" IS NULL OR "finance_balance_items"."corrects_id" <> "finance_balance_items"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_finance_balance_items_external` ON `finance_balance_items` (`external_id`) WHERE "finance_balance_items"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_finance_balance_items_source` ON `finance_balance_items` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_balance_items_status` ON `finance_balance_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_finance_balance_items_superseded` ON `finance_balance_items` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_finance_balance_items_corrects` ON `finance_balance_items` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_balance_items_date_kind` ON `finance_balance_items` (`date`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_finance_balance_items_account` ON `finance_balance_items` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_balance_items_import_batch` ON `finance_balance_items` (`import_batch_id`);--> statement-breakpoint
CREATE TABLE `finance_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_categories_name_length" CHECK(length("finance_categories"."name") BETWEEN 1 AND 120),
	CONSTRAINT "finance_categories_kind" CHECK("finance_categories"."kind" IN ('income','expense')),
	CONSTRAINT "finance_categories_origin_kind" CHECK("finance_categories"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "finance_categories_status" CHECK("finance_categories"."status" IN ('active','superseded','archived')),
	CONSTRAINT "finance_categories_confidence" CHECK("finance_categories"."confidence" IS NULL OR "finance_categories"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "finance_categories_version_positive" CHECK("finance_categories"."version" > 0),
	CONSTRAINT "finance_categories_no_self_reference" CHECK(("finance_categories"."superseded_by" IS NULL OR "finance_categories"."superseded_by" <> "finance_categories"."id") AND ("finance_categories"."corrects_id" IS NULL OR "finance_categories"."corrects_id" <> "finance_categories"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_finance_categories_external` ON `finance_categories` (`external_id`) WHERE "finance_categories"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_finance_categories_source` ON `finance_categories` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_categories_status` ON `finance_categories` (`status`);--> statement-breakpoint
CREATE INDEX `idx_finance_categories_superseded` ON `finance_categories` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_finance_categories_corrects` ON `finance_categories` (`corrects_id`);--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`notes` text,
	`transfer_pair_id` text,
	`import_batch_id` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`import_batch_id`) REFERENCES `life_import_batches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_transactions_kind" CHECK("finance_transactions"."kind" IN ('income','expense','transfer')),
	CONSTRAINT "finance_transactions_amount" CHECK("finance_transactions"."amount_cents" >= 0),
	CONSTRAINT "finance_transactions_currency" CHECK(length("finance_transactions"."currency") = 3),
	CONSTRAINT "finance_transactions_date_format" CHECK(length("finance_transactions"."date") = 10),
	CONSTRAINT "finance_transactions_description_length" CHECK(length("finance_transactions"."description") BETWEEN 1 AND 300),
	CONSTRAINT "finance_transactions_notes_length" CHECK("finance_transactions"."notes" IS NULL OR length("finance_transactions"."notes") <= 1000),
	CONSTRAINT "finance_transactions_category_kind" CHECK("finance_transactions"."kind" <> 'transfer' OR "finance_transactions"."category_id" IS NULL),
	CONSTRAINT "finance_transactions_origin_kind" CHECK("finance_transactions"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "finance_transactions_status" CHECK("finance_transactions"."status" IN ('active','superseded','archived')),
	CONSTRAINT "finance_transactions_confidence" CHECK("finance_transactions"."confidence" IS NULL OR "finance_transactions"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "finance_transactions_version_positive" CHECK("finance_transactions"."version" > 0),
	CONSTRAINT "finance_transactions_no_self_reference" CHECK(("finance_transactions"."superseded_by" IS NULL OR "finance_transactions"."superseded_by" <> "finance_transactions"."id") AND ("finance_transactions"."corrects_id" IS NULL OR "finance_transactions"."corrects_id" <> "finance_transactions"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_finance_transactions_external` ON `finance_transactions` (`external_id`) WHERE "finance_transactions"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_source` ON `finance_transactions` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_status` ON `finance_transactions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_superseded` ON `finance_transactions` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_corrects` ON `finance_transactions` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_account_date` ON `finance_transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_date_kind` ON `finance_transactions` (`date`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_category` ON `finance_transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_transfer_pair` ON `finance_transactions` (`transfer_pair_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_import_batch` ON `finance_transactions` (`import_batch_id`);--> statement-breakpoint
CREATE TABLE `health_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`unit` text NOT NULL,
	`value_kind` text DEFAULT 'integer' NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "health_metrics_key_length" CHECK(length("health_metrics"."key") BETWEEN 1 AND 64),
	CONSTRAINT "health_metrics_label_length" CHECK(length("health_metrics"."label") BETWEEN 1 AND 120),
	CONSTRAINT "health_metrics_unit_length" CHECK(length("health_metrics"."unit") BETWEEN 1 AND 20),
	CONSTRAINT "health_metrics_value_kind" CHECK("health_metrics"."value_kind" IN ('integer','scale')),
	CONSTRAINT "health_metrics_origin_kind" CHECK("health_metrics"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "health_metrics_status" CHECK("health_metrics"."status" IN ('active','superseded','archived')),
	CONSTRAINT "health_metrics_confidence" CHECK("health_metrics"."confidence" IS NULL OR "health_metrics"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "health_metrics_version_positive" CHECK("health_metrics"."version" > 0),
	CONSTRAINT "health_metrics_no_self_reference" CHECK(("health_metrics"."superseded_by" IS NULL OR "health_metrics"."superseded_by" <> "health_metrics"."id") AND ("health_metrics"."corrects_id" IS NULL OR "health_metrics"."corrects_id" <> "health_metrics"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_health_metrics_external` ON `health_metrics` (`external_id`) WHERE "health_metrics"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_health_metrics_source` ON `health_metrics` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_health_metrics_status` ON `health_metrics` (`status`);--> statement-breakpoint
CREATE INDEX `idx_health_metrics_superseded` ON `health_metrics` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_health_metrics_corrects` ON `health_metrics` (`corrects_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_health_metrics_key_active` ON `health_metrics` (`key`) WHERE "health_metrics"."status" = 'active';--> statement-breakpoint
CREATE TABLE `health_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`metric_id` text NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`note` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`metric_id`) REFERENCES `health_metrics`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "health_observations_date_format" CHECK(length("health_observations"."date") = 10),
	CONSTRAINT "health_observations_note_length" CHECK("health_observations"."note" IS NULL OR length("health_observations"."note") <= 1000),
	CONSTRAINT "health_observations_origin_kind" CHECK("health_observations"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "health_observations_status" CHECK("health_observations"."status" IN ('active','superseded','archived')),
	CONSTRAINT "health_observations_confidence" CHECK("health_observations"."confidence" IS NULL OR "health_observations"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "health_observations_version_positive" CHECK("health_observations"."version" > 0),
	CONSTRAINT "health_observations_no_self_reference" CHECK(("health_observations"."superseded_by" IS NULL OR "health_observations"."superseded_by" <> "health_observations"."id") AND ("health_observations"."corrects_id" IS NULL OR "health_observations"."corrects_id" <> "health_observations"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_health_observations_external` ON `health_observations` (`external_id`) WHERE "health_observations"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_health_observations_source` ON `health_observations` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_health_observations_status` ON `health_observations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_health_observations_superseded` ON `health_observations` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_health_observations_corrects` ON `health_observations` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_health_observations_metric_date` ON `health_observations` (`metric_id`,`date`);--> statement-breakpoint
CREATE TABLE `life_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`format` text NOT NULL,
	`file_name` text,
	`total` integer NOT NULL,
	`imported` integer NOT NULL,
	`invalid` integer NOT NULL,
	`duplicates` integer NOT NULL,
	`report_json` text DEFAULT '{}' NOT NULL,
	`source_id` text DEFAULT 'src_import' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "life_import_batches_domain" CHECK("life_import_batches"."domain" IN ('finance_accounts','finance_categories','finance_transactions','finance_balance_items','health_metrics','health_observations','training_sessions','reading_materials','reading_sessions','reading_notes','time_entries')),
	CONSTRAINT "life_import_batches_format" CHECK("life_import_batches"."format" IN ('csv','json')),
	CONSTRAINT "life_import_batches_counts" CHECK("life_import_batches"."total" >= 0 AND "life_import_batches"."imported" >= 0 AND "life_import_batches"."invalid" >= 0 AND "life_import_batches"."duplicates" >= 0),
	CONSTRAINT "life_import_batches_report_json" CHECK(json_valid("life_import_batches"."report_json")),
	CONSTRAINT "life_import_batches_file_name_size" CHECK("life_import_batches"."file_name" IS NULL OR length("life_import_batches"."file_name") <= 120)
);
--> statement-breakpoint
CREATE INDEX `idx_life_import_batches_created` ON `life_import_batches` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_life_import_batches_domain` ON `life_import_batches` (`domain`);--> statement-breakpoint
CREATE TABLE `reading_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`kind` text DEFAULT 'book' NOT NULL,
	`reading_status` text DEFAULT 'planned' NOT NULL,
	`total_pages` integer,
	`goal_id` text,
	`course_id` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reading_materials_title_length" CHECK(length("reading_materials"."title") BETWEEN 1 AND 300),
	CONSTRAINT "reading_materials_author_length" CHECK("reading_materials"."author" IS NULL OR length("reading_materials"."author") <= 200),
	CONSTRAINT "reading_materials_kind" CHECK("reading_materials"."kind" IN ('book','article','material')),
	CONSTRAINT "reading_materials_reading_status" CHECK("reading_materials"."reading_status" IN ('planned','reading','finished','paused')),
	CONSTRAINT "reading_materials_pages" CHECK("reading_materials"."total_pages" IS NULL OR "reading_materials"."total_pages" BETWEEN 1 AND 20000),
	CONSTRAINT "reading_materials_origin_kind" CHECK("reading_materials"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "reading_materials_status" CHECK("reading_materials"."status" IN ('active','superseded','archived')),
	CONSTRAINT "reading_materials_confidence" CHECK("reading_materials"."confidence" IS NULL OR "reading_materials"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "reading_materials_version_positive" CHECK("reading_materials"."version" > 0),
	CONSTRAINT "reading_materials_no_self_reference" CHECK(("reading_materials"."superseded_by" IS NULL OR "reading_materials"."superseded_by" <> "reading_materials"."id") AND ("reading_materials"."corrects_id" IS NULL OR "reading_materials"."corrects_id" <> "reading_materials"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reading_materials_external` ON `reading_materials` (`external_id`) WHERE "reading_materials"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_reading_materials_source` ON `reading_materials` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_materials_status` ON `reading_materials` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reading_materials_superseded` ON `reading_materials` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_reading_materials_corrects` ON `reading_materials` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_materials_goal` ON `reading_materials` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_materials_course` ON `reading_materials` (`course_id`);--> statement-breakpoint
CREATE TABLE `reading_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`content` text NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `reading_materials`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reading_notes_date_format" CHECK(length("reading_notes"."date") = 10),
	CONSTRAINT "reading_notes_kind" CHECK("reading_notes"."kind" IN ('note','learning')),
	CONSTRAINT "reading_notes_content_length" CHECK(length("reading_notes"."content") BETWEEN 1 AND 4000),
	CONSTRAINT "reading_notes_origin_kind" CHECK("reading_notes"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "reading_notes_status" CHECK("reading_notes"."status" IN ('active','superseded','archived')),
	CONSTRAINT "reading_notes_confidence" CHECK("reading_notes"."confidence" IS NULL OR "reading_notes"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "reading_notes_version_positive" CHECK("reading_notes"."version" > 0),
	CONSTRAINT "reading_notes_no_self_reference" CHECK(("reading_notes"."superseded_by" IS NULL OR "reading_notes"."superseded_by" <> "reading_notes"."id") AND ("reading_notes"."corrects_id" IS NULL OR "reading_notes"."corrects_id" <> "reading_notes"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reading_notes_external` ON `reading_notes` (`external_id`) WHERE "reading_notes"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_reading_notes_source` ON `reading_notes` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_notes_status` ON `reading_notes` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reading_notes_superseded` ON `reading_notes` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_reading_notes_corrects` ON `reading_notes` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_notes_material_date` ON `reading_notes` (`material_id`,`date`);--> statement-breakpoint
CREATE TABLE `reading_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`date` text NOT NULL,
	`minutes` integer,
	`pages_read` integer,
	`note` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `reading_materials`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reading_sessions_date_format" CHECK(length("reading_sessions"."date") = 10),
	CONSTRAINT "reading_sessions_minutes" CHECK("reading_sessions"."minutes" IS NULL OR "reading_sessions"."minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "reading_sessions_pages" CHECK("reading_sessions"."pages_read" IS NULL OR "reading_sessions"."pages_read" >= 0),
	CONSTRAINT "reading_sessions_note_length" CHECK("reading_sessions"."note" IS NULL OR length("reading_sessions"."note") <= 1000),
	CONSTRAINT "reading_sessions_origin_kind" CHECK("reading_sessions"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "reading_sessions_status" CHECK("reading_sessions"."status" IN ('active','superseded','archived')),
	CONSTRAINT "reading_sessions_confidence" CHECK("reading_sessions"."confidence" IS NULL OR "reading_sessions"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "reading_sessions_version_positive" CHECK("reading_sessions"."version" > 0),
	CONSTRAINT "reading_sessions_no_self_reference" CHECK(("reading_sessions"."superseded_by" IS NULL OR "reading_sessions"."superseded_by" <> "reading_sessions"."id") AND ("reading_sessions"."corrects_id" IS NULL OR "reading_sessions"."corrects_id" <> "reading_sessions"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reading_sessions_external` ON `reading_sessions` (`external_id`) WHERE "reading_sessions"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_reading_sessions_source` ON `reading_sessions` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_sessions_status` ON `reading_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reading_sessions_superseded` ON `reading_sessions` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_reading_sessions_corrects` ON `reading_sessions` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_reading_sessions_material_date` ON `reading_sessions` (`material_id`,`date`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`project_id` text,
	`area_id` text,
	`date` text NOT NULL,
	`start_at` text,
	`end_at` text,
	`duration_minutes` integer NOT NULL,
	`note` text,
	`import_batch_id` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `life_import_batches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "time_entries_date_format" CHECK(length("time_entries"."date") = 10),
	CONSTRAINT "time_entries_duration" CHECK("time_entries"."duration_minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "time_entries_interval" CHECK(("time_entries"."start_at" IS NULL AND "time_entries"."end_at" IS NULL) OR ("time_entries"."start_at" IS NOT NULL AND "time_entries"."end_at" IS NOT NULL AND "time_entries"."end_at" > "time_entries"."start_at")),
	CONSTRAINT "time_entries_note_length" CHECK("time_entries"."note" IS NULL OR length("time_entries"."note") <= 1000),
	CONSTRAINT "time_entries_origin_kind" CHECK("time_entries"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "time_entries_status" CHECK("time_entries"."status" IN ('active','superseded','archived')),
	CONSTRAINT "time_entries_confidence" CHECK("time_entries"."confidence" IS NULL OR "time_entries"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "time_entries_version_positive" CHECK("time_entries"."version" > 0),
	CONSTRAINT "time_entries_no_self_reference" CHECK(("time_entries"."superseded_by" IS NULL OR "time_entries"."superseded_by" <> "time_entries"."id") AND ("time_entries"."corrects_id" IS NULL OR "time_entries"."corrects_id" <> "time_entries"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_time_entries_external` ON `time_entries` (`external_id`) WHERE "time_entries"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_time_entries_source` ON `time_entries` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_status` ON `time_entries` (`status`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_superseded` ON `time_entries` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_corrects` ON `time_entries` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_date` ON `time_entries` (`date`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_project_date` ON `time_entries` (`project_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_task_date` ON `time_entries` (`task_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_area_date` ON `time_entries` (`area_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_start` ON `time_entries` (`start_at`);--> statement-breakpoint
CREATE INDEX `idx_time_entries_import_batch` ON `time_entries` (`import_batch_id`);--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_type` text NOT NULL,
	`date` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`volume` integer,
	`distance_meters` integer,
	`intensity` integer,
	`note` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`external_id` text,
	`origin_kind` text DEFAULT 'observed' NOT NULL,
	`confidence` integer,
	`algorithm_version` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "training_sessions_activity_length" CHECK(length("training_sessions"."activity_type") BETWEEN 1 AND 80),
	CONSTRAINT "training_sessions_date_format" CHECK(length("training_sessions"."date") = 10),
	CONSTRAINT "training_sessions_duration" CHECK("training_sessions"."duration_minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "training_sessions_volume" CHECK("training_sessions"."volume" IS NULL OR "training_sessions"."volume" >= 0),
	CONSTRAINT "training_sessions_distance" CHECK("training_sessions"."distance_meters" IS NULL OR "training_sessions"."distance_meters" >= 0),
	CONSTRAINT "training_sessions_intensity" CHECK("training_sessions"."intensity" IS NULL OR "training_sessions"."intensity" BETWEEN 1 AND 10),
	CONSTRAINT "training_sessions_note_length" CHECK("training_sessions"."note" IS NULL OR length("training_sessions"."note") <= 1000),
	CONSTRAINT "training_sessions_origin_kind" CHECK("training_sessions"."origin_kind" IN ('observed','estimated','derived','imported','corrected')),
	CONSTRAINT "training_sessions_status" CHECK("training_sessions"."status" IN ('active','superseded','archived')),
	CONSTRAINT "training_sessions_confidence" CHECK("training_sessions"."confidence" IS NULL OR "training_sessions"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "training_sessions_version_positive" CHECK("training_sessions"."version" > 0),
	CONSTRAINT "training_sessions_no_self_reference" CHECK(("training_sessions"."superseded_by" IS NULL OR "training_sessions"."superseded_by" <> "training_sessions"."id") AND ("training_sessions"."corrects_id" IS NULL OR "training_sessions"."corrects_id" <> "training_sessions"."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_training_sessions_external` ON `training_sessions` (`external_id`) WHERE "training_sessions"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_training_sessions_source` ON `training_sessions` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_training_sessions_status` ON `training_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_training_sessions_superseded` ON `training_sessions` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_training_sessions_corrects` ON `training_sessions` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_training_sessions_date_activity` ON `training_sessions` (`date`,`activity_type`);