CREATE TABLE `capacity_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`weekly_minutes` integer NOT NULL,
	`contingency_percent` integer DEFAULT 10 NOT NULL,
	`allocations_json` text DEFAULT '[]' NOT NULL,
	`preferences_json` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "capacity_profiles_weekly_minutes" CHECK("capacity_profiles"."weekly_minutes" BETWEEN 0 AND 10000),
	CONSTRAINT "capacity_profiles_contingency" CHECK("capacity_profiles"."contingency_percent" BETWEEN 0 AND 50),
	CONSTRAINT "capacity_profiles_allocations_json" CHECK(json_valid("capacity_profiles"."allocations_json")),
	CONSTRAINT "capacity_profiles_preferences_json" CHECK(json_valid("capacity_profiles"."preferences_json")),
	CONSTRAINT "capacity_profiles_is_active_boolean" CHECK("capacity_profiles"."is_active" IN (0,1)),
	CONSTRAINT "capacity_profiles_version_positive" CHECK("capacity_profiles"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_capacity_profiles_active` ON `capacity_profiles` (`is_active`) WHERE "capacity_profiles"."is_active" = 1;--> statement-breakpoint
CREATE INDEX `idx_capacity_profiles_source` ON `capacity_profiles` (`source_id`);--> statement-breakpoint
CREATE TABLE `capacity_unavailability` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`reason` text,
	`minutes_per_day` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `capacity_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "capacity_unavailability_date_format" CHECK(length("capacity_unavailability"."from_date") = 10 AND length("capacity_unavailability"."to_date") = 10),
	CONSTRAINT "capacity_unavailability_date_order" CHECK("capacity_unavailability"."to_date" >= "capacity_unavailability"."from_date"),
	CONSTRAINT "capacity_unavailability_minutes" CHECK("capacity_unavailability"."minutes_per_day" IS NULL OR "capacity_unavailability"."minutes_per_day" BETWEEN 0 AND 1440),
	CONSTRAINT "capacity_unavailability_reason_size" CHECK("capacity_unavailability"."reason" IS NULL OR length("capacity_unavailability"."reason") <= 500)
);
--> statement-breakpoint
CREATE INDEX `idx_capacity_unavailability_profile` ON `capacity_unavailability` (`profile_id`,`from_date`);--> statement-breakpoint
CREATE TABLE `life_vision_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`statement` text,
	`horizon_years` integer,
	`principles_json` text DEFAULT '[]' NOT NULL,
	`outcomes_json` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`change_note` text,
	`superseded_by` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version_row` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`superseded_by`) REFERENCES `life_vision_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "life_vision_versions_status" CHECK("life_vision_versions"."status" IN ('draft','active','superseded')),
	CONSTRAINT "life_vision_versions_version_positive" CHECK("life_vision_versions"."version" > 0),
	CONSTRAINT "life_vision_versions_version_row_positive" CHECK("life_vision_versions"."version_row" > 0),
	CONSTRAINT "life_vision_versions_horizon" CHECK("life_vision_versions"."horizon_years" IS NULL OR "life_vision_versions"."horizon_years" BETWEEN 1 AND 50),
	CONSTRAINT "life_vision_versions_principles_json" CHECK(json_valid("life_vision_versions"."principles_json")),
	CONSTRAINT "life_vision_versions_outcomes_json" CHECK(json_valid("life_vision_versions"."outcomes_json")),
	CONSTRAINT "life_vision_versions_no_self_reference" CHECK("life_vision_versions"."superseded_by" IS NULL OR "life_vision_versions"."superseded_by" <> "life_vision_versions"."id"),
	CONSTRAINT "life_vision_versions_statement_size" CHECK("life_vision_versions"."statement" IS NULL OR length("life_vision_versions"."statement") <= 4000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_life_vision_active` ON `life_vision_versions` (`status`) WHERE "life_vision_versions"."status" = 'active';--> statement-breakpoint
CREATE INDEX `idx_life_vision_version` ON `life_vision_versions` (`version`);--> statement-breakpoint
CREATE INDEX `idx_life_vision_source` ON `life_vision_versions` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_life_vision_superseded` ON `life_vision_versions` (`superseded_by`);--> statement-breakpoint
CREATE TABLE `planning_cycle_objectives` (
	`cycle_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`is_priority` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `planning_cycles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "planning_cycle_objectives_priority_boolean" CHECK("planning_cycle_objectives"."is_priority" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_planning_cycle_objectives` ON `planning_cycle_objectives` (`cycle_id`,`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_planning_cycle_objectives_goal` ON `planning_cycle_objectives` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_planning_cycle_objectives_priority` ON `planning_cycle_objectives` (`cycle_id`,`is_priority`);--> statement-breakpoint
CREATE TABLE `planning_cycle_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`reflections_json` text DEFAULT '{}' NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `planning_cycles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "planning_cycle_reviews_snapshot_json" CHECK(json_valid("planning_cycle_reviews"."snapshot_json")),
	CONSTRAINT "planning_cycle_reviews_snapshot_size" CHECK(length("planning_cycle_reviews"."snapshot_json") <= 200000),
	CONSTRAINT "planning_cycle_reviews_reflections_json" CHECK(json_valid("planning_cycle_reviews"."reflections_json")),
	CONSTRAINT "planning_cycle_reviews_version_positive" CHECK("planning_cycle_reviews"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_planning_cycle_reviews_cycle` ON `planning_cycle_reviews` (`cycle_id`);--> statement-breakpoint
CREATE INDEX `idx_planning_cycle_reviews_updated` ON `planning_cycle_reviews` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_planning_cycle_reviews_source` ON `planning_cycle_reviews` (`source_id`);--> statement-breakpoint
CREATE TABLE `planning_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`theme` text,
	`expected_results_json` text DEFAULT '[]' NOT NULL,
	`priority_projects_json` text DEFAULT '[]' NOT NULL,
	`success_criteria_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "planning_cycles_name_length" CHECK(length("planning_cycles"."name") BETWEEN 1 AND 200),
	CONSTRAINT "planning_cycles_date_format" CHECK(length("planning_cycles"."start_date") = 10 AND length("planning_cycles"."end_date") = 10),
	CONSTRAINT "planning_cycles_date_order" CHECK("planning_cycles"."end_date" >= "planning_cycles"."start_date"),
	CONSTRAINT "planning_cycles_status" CHECK("planning_cycles"."status" IN ('planned','active','paused','completed','cancelled')),
	CONSTRAINT "planning_cycles_expected_results_json" CHECK(json_valid("planning_cycles"."expected_results_json")),
	CONSTRAINT "planning_cycles_priority_projects_json" CHECK(json_valid("planning_cycles"."priority_projects_json")),
	CONSTRAINT "planning_cycles_success_criteria_json" CHECK(json_valid("planning_cycles"."success_criteria_json")),
	CONSTRAINT "planning_cycles_version_positive" CHECK("planning_cycles"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_planning_cycles_status` ON `planning_cycles` (`status`);--> statement-breakpoint
CREATE INDEX `idx_planning_cycles_dates` ON `planning_cycles` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_planning_cycles_source` ON `planning_cycles` (`source_id`);--> statement-breakpoint
CREATE TABLE `planning_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hypotheses` text,
	`changes_json` text NOT NULL,
	`week_start` text NOT NULL,
	`result_json` text NOT NULL,
	`limitations_json` text DEFAULT '[]' NOT NULL,
	`algorithm_version` text NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "planning_scenarios_name_length" CHECK(length("planning_scenarios"."name") BETWEEN 1 AND 200),
	CONSTRAINT "planning_scenarios_week_format" CHECK(length("planning_scenarios"."week_start") = 10),
	CONSTRAINT "planning_scenarios_changes_json" CHECK(json_valid("planning_scenarios"."changes_json")),
	CONSTRAINT "planning_scenarios_result_json" CHECK(json_valid("planning_scenarios"."result_json")),
	CONSTRAINT "planning_scenarios_limitations_json" CHECK(json_valid("planning_scenarios"."limitations_json")),
	CONSTRAINT "planning_scenarios_result_size" CHECK(length("planning_scenarios"."result_json") <= 200000),
	CONSTRAINT "planning_scenarios_version_positive" CHECK("planning_scenarios"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_planning_scenarios_created` ON `planning_scenarios` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_planning_scenarios_source` ON `planning_scenarios` (`source_id`);--> statement-breakpoint
CREATE TABLE `strategic_area_profiles` (
	`area_id` text PRIMARY KEY NOT NULL,
	`description` text,
	`importance` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "strategic_area_profiles_importance" CHECK("strategic_area_profiles"."importance" BETWEEN 1 AND 5),
	CONSTRAINT "strategic_area_profiles_status" CHECK("strategic_area_profiles"."status" IN ('active','archived')),
	CONSTRAINT "strategic_area_profiles_version_positive" CHECK("strategic_area_profiles"."version" > 0),
	CONSTRAINT "strategic_area_profiles_description_size" CHECK("strategic_area_profiles"."description" IS NULL OR length("strategic_area_profiles"."description") <= 2000)
);
--> statement-breakpoint
CREATE INDEX `idx_strategic_area_profiles_status` ON `strategic_area_profiles` (`status`);--> statement-breakpoint
CREATE INDEX `idx_strategic_area_profiles_source` ON `strategic_area_profiles` (`source_id`);--> statement-breakpoint
CREATE TABLE `strategic_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`vision_id` text,
	`horizon` text NOT NULL,
	`importance` integer DEFAULT 3 NOT NULL,
	`review_cadence_days` integer DEFAULT 90 NOT NULL,
	`results_json` text DEFAULT '[]' NOT NULL,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`vision_id`) REFERENCES `life_vision_versions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "strategic_goals_horizon" CHECK("strategic_goals"."horizon" IN ('short','medium','long')),
	CONSTRAINT "strategic_goals_importance" CHECK("strategic_goals"."importance" BETWEEN 1 AND 5),
	CONSTRAINT "strategic_goals_cadence" CHECK("strategic_goals"."review_cadence_days" BETWEEN 7 AND 365),
	CONSTRAINT "strategic_goals_results_json" CHECK(json_valid("strategic_goals"."results_json")),
	CONSTRAINT "strategic_goals_version_positive" CHECK("strategic_goals"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_strategic_goals_goal` ON `strategic_goals` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_strategic_goals_vision` ON `strategic_goals` (`vision_id`);--> statement-breakpoint
CREATE INDEX `idx_strategic_goals_importance` ON `strategic_goals` (`importance`);--> statement-breakpoint
CREATE INDEX `idx_strategic_goals_source` ON `strategic_goals` (`source_id`);