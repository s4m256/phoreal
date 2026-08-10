CREATE TABLE IF NOT EXISTS `user_mock_exams_v2` (`id` text PRIMARY KEY NOT NULL,`exam_name` text NOT NULL,`date` text NOT NULL,`type` text NOT NULL CHECK(`type` IN ('theoretical','experimental')),`total_score` real NOT NULL,`drive_url` text,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_mock_exams_v2_date_idx` ON `user_mock_exams_v2` (`date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_mock_exam_problem_scores_v2` (`id` text PRIMARY KEY NOT NULL,`mock_exam_id` text NOT NULL REFERENCES `user_mock_exams_v2`(`id`) ON DELETE CASCADE,`problem_number` integer NOT NULL,`problem_label` text,`score` real NOT NULL,UNIQUE(`mock_exam_id`,`problem_number`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_experiments` (`id` text PRIMARY KEY NOT NULL,`title` text NOT NULL,`date` text,`image_url` text,`notes` text,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_experiments_date_idx` ON `user_experiments` (`date`);
--> statement-breakpoint
DELETE FROM `user_time_segments`;
--> statement-breakpoint
DELETE FROM `user_attempts`;
--> statement-breakpoint
DELETE FROM `user_mock_exam_problem_scores`;
--> statement-breakpoint
DELETE FROM `user_mock_exams`;
--> statement-breakpoint
DELETE FROM `user_mock_exam_problem_scores_v2`;
--> statement-breakpoint
DELETE FROM `user_mock_exams_v2`;
