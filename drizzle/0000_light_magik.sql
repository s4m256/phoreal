CREATE TABLE `user_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`problem_id` integer NOT NULL,
	`status` text NOT NULL,
	`current_state` text NOT NULL,
	`active_part_id` integer,
	`started_at` text NOT NULL,
	`finished_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `phors_problems`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`active_part_id`) REFERENCES `phors_problem_parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_attempts_problem_idx` ON `user_attempts` (`problem_id`);--> statement-breakpoint
CREATE INDEX `user_attempts_status_idx` ON `user_attempts` (`status`);--> statement-breakpoint
CREATE TABLE `phors_competitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_key` text NOT NULL,
	`name` text NOT NULL,
	`source_url` text NOT NULL,
	`source_host` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phors_competitions_source_key_uq` ON `phors_competitions` (`source_key`);--> statement-breakpoint
CREATE TABLE `phors_exams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competition_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`code` text,
	`series` text,
	`source_hash` text NOT NULL,
	`imported_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `phors_competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phors_exams_source_url_uq` ON `phors_exams` (`source_url`);--> statement-breakpoint
CREATE INDEX `phors_exams_competition_idx` ON `phors_exams` (`competition_id`);--> statement-breakpoint
CREATE TABLE `user_mock_exam_problem_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`mock_exam_id` text NOT NULL,
	`problem_id` integer NOT NULL,
	`score` real NOT NULL,
	`max_score` real NOT NULL,
	FOREIGN KEY (`mock_exam_id`) REFERENCES `user_mock_exams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `phors_problems`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_mock_problem_uq` ON `user_mock_exam_problem_scores` (`mock_exam_id`,`problem_id`);--> statement-breakpoint
CREATE INDEX `user_mock_scores_problem_idx` ON `user_mock_exam_problem_scores` (`problem_id`);--> statement-breakpoint
CREATE TABLE `user_mock_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` integer NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`total_score` real NOT NULL,
	`max_score` real NOT NULL,
	`drive_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `phors_exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_mock_exams_date_idx` ON `user_mock_exams` (`date`);--> statement-breakpoint
CREATE TABLE `phors_problem_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`problem_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`code` text NOT NULL,
	`parent_code` text,
	`ordinal` integer NOT NULL,
	`score` real,
	`score_reliability` text,
	`prompt_text` text,
	`source_url` text NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `phors_problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phors_problem_parts_problem_source_uq` ON `phors_problem_parts` (`problem_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `phors_problem_parts_problem_idx` ON `phors_problem_parts` (`problem_id`);--> statement-breakpoint
CREATE TABLE `phors_problem_tags` (
	`problem_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `tag_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `phors_problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `phors_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `phors_problem_tags_tag_idx` ON `phors_problem_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `phors_problems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text NOT NULL,
	`code` text,
	`title` text NOT NULL,
	`kind` text DEFAULT 'unknown' NOT NULL,
	`statement_url` text,
	`solution_url` text,
	`marking_scheme_url` text,
	`statement_pdf_url` text,
	`solution_pdf_url` text,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`parts_status` text DEFAULT 'not_fetched' NOT NULL,
	`source_hash` text NOT NULL,
	`imported_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `phors_exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phors_problems_source_id_uq` ON `phors_problems` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `phors_problems_source_url_uq` ON `phors_problems` (`source_url`);--> statement-breakpoint
CREATE INDEX `phors_problems_exam_idx` ON `phors_problems` (`exam_id`);--> statement-breakpoint
CREATE TABLE `phors_sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`exam_urls_json` text NOT NULL,
	`stats_json` text DEFAULT '{}' NOT NULL,
	`error_text` text
);
--> statement-breakpoint
CREATE TABLE `phors_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phors_tags_normalized_name_uq` ON `phors_tags` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `user_time_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`state` text NOT NULL,
	`problem_part_id` integer,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_seconds` integer,
	FOREIGN KEY (`attempt_id`) REFERENCES `user_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_part_id`) REFERENCES `phors_problem_parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_time_segments_attempt_idx` ON `user_time_segments` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `user_time_segments_part_idx` ON `user_time_segments` (`problem_part_id`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`tbf_date` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
