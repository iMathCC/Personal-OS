CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`start_date` text,
	`target_date` text,
	`completed_at` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "projects_title_length" CHECK(length("projects"."title") BETWEEN 1 AND 180),
	CONSTRAINT "projects_description_length" CHECK("projects"."description" IS NULL OR length("projects"."description") <= 2000),
	CONSTRAINT "projects_status" CHECK("projects"."status" IN ('planned','active','paused','completed','cancelled','archived')),
	CONSTRAINT "projects_priority" CHECK("projects"."priority" IN ('low','medium','high','critical')),
	CONSTRAINT "projects_start_date_format" CHECK("projects"."start_date" IS NULL OR length("projects"."start_date") = 10),
	CONSTRAINT "projects_target_date_format" CHECK("projects"."target_date" IS NULL OR length("projects"."target_date") = 10),
	CONSTRAINT "projects_date_order" CHECK("projects"."target_date" IS NULL OR "projects"."start_date" IS NULL OR "projects"."target_date" >= "projects"."start_date"),
	CONSTRAINT "projects_version_positive" CHECK("projects"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_projects_status_updated` ON `projects` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_projects_priority` ON `projects` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_projects_target_date` ON `projects` (`target_date`);--> statement-breakpoint
CREATE INDEX `idx_projects_source` ON `projects` (`source_id`);--> statement-breakpoint
CREATE TABLE `project_goals` (
	`project_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`project_id`, `goal_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_goals_goal` ON `project_goals` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_project_goals_project` ON `project_goals` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "project_milestones_title_length" CHECK(length("project_milestones"."title") BETWEEN 1 AND 180),
	CONSTRAINT "project_milestones_due_date_format" CHECK("project_milestones"."due_date" IS NULL OR length("project_milestones"."due_date") = 10),
	CONSTRAINT "project_milestones_status" CHECK("project_milestones"."status" IN ('pending','in_progress','completed','cancelled')),
	CONSTRAINT "project_milestones_position_non_negative" CHECK("project_milestones"."position" >= 0),
	CONSTRAINT "project_milestones_version_positive" CHECK("project_milestones"."version" > 0),
	CONSTRAINT "project_milestones_completed_consistency" CHECK(("project_milestones"."status" = 'completed' AND "project_milestones"."completed_at" IS NOT NULL) OR ("project_milestones"."status" <> 'completed' AND "project_milestones"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_project_milestones_project_position` ON `project_milestones` (`project_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_project_milestones_due` ON `project_milestones` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_project_milestones_source` ON `project_milestones` (`source_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`project_id` text,
	`milestone_id` text,
	`goal_id` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`due_date` text,
	`estimate_minutes` integer,
	`completed_at` text,
	`source_id` text DEFAULT 'src_manual' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_operation_id` text,
	`updated_operation_id` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`milestone_id`) REFERENCES `project_milestones`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tasks_title_length" CHECK(length("tasks"."title") BETWEEN 1 AND 180),
	CONSTRAINT "tasks_description_length" CHECK("tasks"."description" IS NULL OR length("tasks"."description") <= 2000),
	CONSTRAINT "tasks_status" CHECK("tasks"."status" IN ('todo','in_progress','blocked','completed','cancelled')),
	CONSTRAINT "tasks_priority" CHECK("tasks"."priority" IN ('low','medium','high','critical')),
	CONSTRAINT "tasks_due_date_format" CHECK("tasks"."due_date" IS NULL OR length("tasks"."due_date") = 10),
	CONSTRAINT "tasks_estimate_minutes" CHECK("tasks"."estimate_minutes" IS NULL OR ("tasks"."estimate_minutes" >= 0 AND "tasks"."estimate_minutes" <= 100000)),
	CONSTRAINT "tasks_version_positive" CHECK("tasks"."version" > 0),
	CONSTRAINT "tasks_completed_consistency" CHECK(("tasks"."status" = 'completed' AND "tasks"."completed_at" IS NOT NULL) OR ("tasks"."status" <> 'completed' AND "tasks"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_project_status` ON `tasks` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_goal` ON `tasks` (`goal_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_milestone` ON `tasks` (`milestone_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status_priority` ON `tasks` (`status`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_tasks_updated` ON `tasks` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_source` ON `tasks` (`source_id`);--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`task_id` text NOT NULL,
	`depends_on_task_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`task_id`, `depends_on_task_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`depends_on_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "task_dependencies_no_self" CHECK("task_dependencies"."task_id" <> "task_dependencies"."depends_on_task_id")
);
--> statement-breakpoint
CREATE INDEX `idx_task_dependencies_task` ON `task_dependencies` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_dependencies_depends_on` ON `task_dependencies` (`depends_on_task_id`);
