CREATE TABLE `goal_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_date` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` text,
	`source_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "goal_milestones_status" CHECK("goal_milestones"."status" IN ('pending','in_progress','completed','cancelled')),
	CONSTRAINT "goal_milestones_title_length" CHECK(length("goal_milestones"."title") BETWEEN 1 AND 200),
	CONSTRAINT "goal_milestones_due_date_format" CHECK("goal_milestones"."due_date" IS NULL OR length("goal_milestones"."due_date") = 10),
	CONSTRAINT "goal_milestones_version_positive" CHECK("goal_milestones"."version" > 0),
	CONSTRAINT "goal_milestones_completed_consistency" CHECK(("goal_milestones"."status" = 'completed' AND "goal_milestones"."completed_at" IS NOT NULL) OR ("goal_milestones"."status" <> 'completed' AND "goal_milestones"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_goal_milestones_goal` ON `goal_milestones` (`goal_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_goal_milestones_due` ON `goal_milestones` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_goal_milestones_source` ON `goal_milestones` (`source_id`);