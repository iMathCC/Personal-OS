CREATE TABLE `weekly_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`timezone` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`worked` text,
	`didnt_work` text,
	`learned` text,
	`change` text,
	`focus` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "weekly_reviews_week_format" CHECK(length("weekly_reviews"."week_start") = 10),
	CONSTRAINT "weekly_reviews_week_order" CHECK("weekly_reviews"."week_end" >= "weekly_reviews"."week_start"),
	CONSTRAINT "weekly_reviews_snapshot_json_valid" CHECK(json_valid("weekly_reviews"."snapshot_json")),
	CONSTRAINT "weekly_reviews_snapshot_size" CHECK(length("weekly_reviews"."snapshot_json") <= 200000),
	CONSTRAINT "weekly_reviews_timezone_length" CHECK(length("weekly_reviews"."timezone") BETWEEN 1 AND 80),
	CONSTRAINT "weekly_reviews_reflection_size" CHECK((
      ("weekly_reviews"."worked" IS NULL OR length("weekly_reviews"."worked") <= 2000) AND
      ("weekly_reviews"."didnt_work" IS NULL OR length("weekly_reviews"."didnt_work") <= 2000) AND
      ("weekly_reviews"."learned" IS NULL OR length("weekly_reviews"."learned") <= 2000) AND
      ("weekly_reviews"."change" IS NULL OR length("weekly_reviews"."change") <= 2000) AND
      ("weekly_reviews"."focus" IS NULL OR length("weekly_reviews"."focus") <= 2000)
    )),
	CONSTRAINT "weekly_reviews_version_positive" CHECK("weekly_reviews"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_weekly_reviews_week` ON `weekly_reviews` (`week_start`);--> statement-breakpoint
CREATE INDEX `idx_weekly_reviews_week_start` ON `weekly_reviews` (`week_start`);--> statement-breakpoint
CREATE INDEX `idx_weekly_reviews_updated` ON `weekly_reviews` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_weekly_reviews_source` ON `weekly_reviews` (`source_id`);