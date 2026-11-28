CREATE TABLE `personal_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`observed_at` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text NOT NULL,
	`value_num` real,
	`value_text` text,
	`unit` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`confidence` real,
	`algorithm_version` text,
	`evidence_json` text,
	`related_task_id` text,
	`related_project_id` text,
	`related_goal_id` text,
	`related_study_session_id` text,
	`related_course_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`superseded_by` text,
	`corrects_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`delete_operation_id` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`related_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`related_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`related_goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`related_study_session_id`) REFERENCES `study_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`related_course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`superseded_by`) REFERENCES `personal_observations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`corrects_id`) REFERENCES `personal_observations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "personal_obs_kind" CHECK("personal_observations"."kind" IN ('intention','planning','executed','observed_result','confirmed_result','inference')),
	CONSTRAINT "personal_obs_title_length" CHECK(length("personal_observations"."title") BETWEEN 1 AND 200),
	CONSTRAINT "personal_obs_content_length" CHECK("personal_observations"."content" IS NULL OR length("personal_observations"."content") <= 5000),
	CONSTRAINT "personal_obs_value_text_length" CHECK("personal_observations"."value_text" IS NULL OR length("personal_observations"."value_text") <= 500),
	CONSTRAINT "personal_obs_unit_length" CHECK("personal_observations"."unit" IS NULL OR length("personal_observations"."unit") <= 32),
	CONSTRAINT "personal_obs_confidence" CHECK("personal_observations"."confidence" IS NULL OR "personal_observations"."confidence" BETWEEN 0 AND 1),
	CONSTRAINT "personal_obs_inference_confidence" CHECK("personal_observations"."kind" <> 'inference' OR "personal_observations"."confidence" IS NOT NULL),
	CONSTRAINT "personal_obs_source_requirements" CHECK(("personal_observations"."source_id" <> 'src_inference' OR "personal_observations"."confidence" IS NOT NULL) AND ("personal_observations"."source_id" <> 'src_calculation' OR "personal_observations"."algorithm_version" IS NOT NULL)),
	CONSTRAINT "personal_obs_evidence_json_valid" CHECK("personal_observations"."evidence_json" IS NULL OR json_valid("personal_observations"."evidence_json")),
	CONSTRAINT "personal_obs_status" CHECK("personal_observations"."status" IN ('active','superseded','archived')),
	CONSTRAINT "personal_obs_no_self_supersede" CHECK("personal_observations"."superseded_by" IS NULL OR "personal_observations"."superseded_by" <> "personal_observations"."id"),
	CONSTRAINT "personal_obs_no_self_correct" CHECK("personal_observations"."corrects_id" IS NULL OR "personal_observations"."corrects_id" <> "personal_observations"."id"),
	CONSTRAINT "personal_obs_version_positive" CHECK("personal_observations"."version" > 0),
	CONSTRAINT "personal_obs_local_date_format" CHECK(length("personal_observations"."local_date") = 10)
);
--> statement-breakpoint
CREATE INDEX `idx_personal_obs_date` ON `personal_observations` (`local_date`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_area_date` ON `personal_observations` (`area_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_kind_date` ON `personal_observations` (`kind`,`local_date`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_status_date` ON `personal_observations` (`status`,`local_date`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_source` ON `personal_observations` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_superseded` ON `personal_observations` (`superseded_by`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_corrects` ON `personal_observations` (`corrects_id`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_task` ON `personal_observations` (`related_task_id`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_project` ON `personal_observations` (`related_project_id`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_goal` ON `personal_observations` (`related_goal_id`);--> statement-breakpoint
CREATE INDEX `idx_personal_obs_study_session` ON `personal_observations` (`related_study_session_id`);