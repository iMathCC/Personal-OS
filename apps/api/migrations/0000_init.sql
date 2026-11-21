CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `areas` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`source_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata_json` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "areas_key" CHECK("areas"."key" IN ('finance', 'studies', 'career', 'reading', 'training', 'health', 'activities', 'life')),
	CONSTRAINT "areas_is_active_boolean" CHECK("areas"."is_active" IN (0, 1)),
	CONSTRAINT "areas_version_positive" CHECK("areas"."version" > 0),
	CONSTRAINT "areas_token_length" CHECK(("areas"."color" IS NULL OR length("areas"."color") <= 32) AND ("areas"."icon" IS NULL OR length("areas"."icon") <= 32)),
	CONSTRAINT "areas_metadata_json_valid" CHECK("areas"."metadata_json" IS NULL OR json_valid("areas"."metadata_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `areas_key_unique` ON `areas` (`key`);--> statement-breakpoint
CREATE INDEX `idx_areas_active` ON `areas` (`sort_order`) WHERE "areas"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_areas_source` ON `areas` (`source_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_system` integer DEFAULT 0 NOT NULL,
	`config_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "sources_kind" CHECK("sources"."kind" IN ('manual', 'import', 'integration', 'inference', 'calculation')),
	CONSTRAINT "sources_is_system_boolean" CHECK("sources"."is_system" IN (0, 1)),
	CONSTRAINT "sources_config_json_valid" CHECK("sources"."config_json" IS NULL OR json_valid("sources"."config_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_name_unique` ON `sources` (`name`);--> statement-breakpoint
CREATE INDEX `idx_sources_kind` ON `sources` (`kind`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`timezone` text DEFAULT 'America/Sao_Paulo' NOT NULL,
	`locale` text DEFAULT 'pt-BR' NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`week_start` integer DEFAULT 1 NOT NULL,
	`horizon_short_days` integer DEFAULT 90 NOT NULL,
	`horizon_medium_days` integer DEFAULT 365 NOT NULL,
	`setup_completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "users_week_start_range" CHECK("users"."week_start" BETWEEN 0 AND 6),
	CONSTRAINT "users_horizons_positive" CHECK("users"."horizon_short_days" > 0 AND "users"."horizon_medium_days" > 0),
	CONSTRAINT "users_currency_length" CHECK(length("users"."currency") = 3)
);
--> statement-breakpoint
CREATE TABLE `auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`purpose` text,
	`challenge` text NOT NULL,
	`user_id` text,
	`user_handle` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_challenges_type" CHECK("auth_challenges"."type" IN ('registration', 'authentication')),
	CONSTRAINT "auth_challenges_purpose" CHECK("auth_challenges"."purpose" IS NULL OR "auth_challenges"."purpose" IN ('setup', 'login', 'recovery_register_passkey')),
	CONSTRAINT "auth_challenges_expiry_after_creation" CHECK("auth_challenges"."expires_at" > "auth_challenges"."created_at")
);
--> statement-breakpoint
CREATE INDEX `idx_auth_challenges_expiry` ON `auth_challenges` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_challenges_user` ON `auth_challenges` (`user_id`);--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports_json` text,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "passkeys_counter_non_negative" CHECK("passkeys"."counter" >= 0),
	CONSTRAINT "passkeys_transports_json_valid" CHECK("passkeys"."transports_json" IS NULL OR json_valid("passkeys"."transports_json"))
);
--> statement-breakpoint
CREATE INDEX `idx_passkeys_user` ON `passkeys` (`user_id`);--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recovery_codes_hash_length" CHECK(length("recovery_codes"."code_hash") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recovery_codes_hash` ON `recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `idx_recovery_codes_user` ON `recovery_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `recovery_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`purpose` text DEFAULT 'recovery_register_passkey' NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recovery_tokens_hash_length" CHECK(length("recovery_tokens"."token_hash") = 64),
	CONSTRAINT "recovery_tokens_purpose" CHECK("recovery_tokens"."purpose" = 'recovery_register_passkey'),
	CONSTRAINT "recovery_tokens_expiry_after_creation" CHECK("recovery_tokens"."expires_at" > "recovery_tokens"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recovery_tokens_hash` ON `recovery_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_recovery_tokens_user` ON `recovery_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_recovery_tokens_expiry` ON `recovery_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`user_agent_hash` text,
	`ip_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sessions_expiry_after_creation" CHECK("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_token_hash` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_lru` ON `sessions` (`user_id`,`last_seen_at`) WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`before_json` text,
	`after_json` text,
	`request_id` text,
	`ip_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "audit_log_action" CHECK("audit_log"."action" IN ('create', 'update', 'delete', 'restore', 'login', 'logout', 'export', 'import', 'purge', 'setup', 'recovery', 'passkey_add', 'session_revoke')),
	CONSTRAINT "audit_log_actor_type" CHECK("audit_log"."actor_type" IN ('user', 'system', 'job', 'integration')),
	CONSTRAINT "audit_log_before_json_valid" CHECK("audit_log"."before_json" IS NULL OR json_valid("audit_log"."before_json")),
	CONSTRAINT "audit_log_after_json_valid" CHECK("audit_log"."after_json" IS NULL OR json_valid("audit_log"."after_json")),
	CONSTRAINT "audit_log_ip_hash_length" CHECK("audit_log"."ip_hash" IS NULL OR length("audit_log"."ip_hash") = 64)
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`request_hash` text NOT NULL,
	`status_code` integer NOT NULL,
	`response_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "idempotency_keys_method" CHECK("idempotency_keys"."method" IN ('GET','POST','PUT','PATCH','DELETE')),
	CONSTRAINT "idempotency_keys_status" CHECK("idempotency_keys"."status_code" BETWEEN 100 AND 599),
	CONSTRAINT "idempotency_keys_expiry_after_creation" CHECK("idempotency_keys"."expires_at" > "idempotency_keys"."created_at"),
	CONSTRAINT "idempotency_keys_response_json_valid" CHECK("idempotency_keys"."response_json" IS NULL OR json_valid("idempotency_keys"."response_json")),
	CONSTRAINT "idempotency_keys_response_size" CHECK(length("idempotency_keys"."response_json") <= 65536)
);
--> statement-breakpoint
CREATE INDEX `idx_idempotency_expiry` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "rate_limits_count_non_negative" CHECK("rate_limits"."count" >= 0),
	CONSTRAINT "rate_limits_window_valid" CHECK("rate_limits"."expires_at" > "rate_limits"."window_start")
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expiry` ON `rate_limits` (`expires_at`);