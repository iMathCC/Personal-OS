CREATE TABLE `intelligence_alert_states` (
	`id` text PRIMARY KEY NOT NULL,
	`alert_id` text NOT NULL,
	`state` text NOT NULL,
	`rule_version` text NOT NULL,
	`area` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "intelligence_alert_states_state" CHECK("intelligence_alert_states"."state" IN ('acknowledged','dismissed')),
	CONSTRAINT "intelligence_alert_states_alert_id_length" CHECK(length("intelligence_alert_states"."alert_id") BETWEEN 1 AND 120),
	CONSTRAINT "intelligence_alert_states_version_positive" CHECK("intelligence_alert_states"."version" > 0),
	CONSTRAINT "intelligence_alert_states_area_length" CHECK(length("intelligence_alert_states"."area") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_intelligence_alert_states_alert` ON `intelligence_alert_states` (`alert_id`);--> statement-breakpoint
CREATE INDEX `idx_intelligence_alert_states_area` ON `intelligence_alert_states` (`area`);--> statement-breakpoint
CREATE INDEX `idx_intelligence_alert_states_source` ON `intelligence_alert_states` (`source_id`);