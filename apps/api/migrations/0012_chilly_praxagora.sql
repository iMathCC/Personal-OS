CREATE TABLE `adaptation_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`proposal_kind` text NOT NULL,
	`proposal_title` text NOT NULL,
	`severity` text NOT NULL,
	`confidence` text NOT NULL,
	`period_from` text NOT NULL,
	`period_to` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`proposal_snapshot_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "adaptation_decisions_action" CHECK("adaptation_decisions"."action" IN ('accept','reject','defer')),
	CONSTRAINT "adaptation_decisions_status" CHECK("adaptation_decisions"."status" IN ('accepted','rejected','deferred')),
	CONSTRAINT "adaptation_decisions_severity" CHECK("adaptation_decisions"."severity" IN ('info','attention','risk','critical')),
	CONSTRAINT "adaptation_decisions_confidence" CHECK("adaptation_decisions"."confidence" IN ('low','medium','high')),
	CONSTRAINT "adaptation_decisions_version_positive" CHECK("adaptation_decisions"."version" > 0),
	CONSTRAINT "adaptation_decisions_proposal_id_length" CHECK(length("adaptation_decisions"."proposal_id") BETWEEN 1 AND 120),
	CONSTRAINT "adaptation_decisions_note_length" CHECK("adaptation_decisions"."note" IS NULL OR length("adaptation_decisions"."note") <= 1000),
	CONSTRAINT "adaptation_decisions_snapshot_json" CHECK(json_valid("adaptation_decisions"."proposal_snapshot_json")),
	CONSTRAINT "adaptation_decisions_snapshot_size" CHECK(length("adaptation_decisions"."proposal_snapshot_json") <= 50000),
	CONSTRAINT "adaptation_decisions_period_format" CHECK(length("adaptation_decisions"."period_from") = 10 AND length("adaptation_decisions"."period_to") = 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_adaptation_decisions_proposal` ON `adaptation_decisions` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `idx_adaptation_decisions_created` ON `adaptation_decisions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_adaptation_decisions_status` ON `adaptation_decisions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_adaptation_decisions_source` ON `adaptation_decisions` (`source_id`);