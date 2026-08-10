ALTER TABLE `user_attempts` ADD `owner_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_attempts_owner_idx` ON `user_attempts` (`owner_id`);
--> statement-breakpoint
ALTER TABLE `user_mock_exams_v2` ADD `owner_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_mock_exams_v2_owner_idx` ON `user_mock_exams_v2` (`owner_id`);
--> statement-breakpoint
ALTER TABLE `user_experiments` ADD `owner_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_experiments_owner_idx` ON `user_experiments` (`owner_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_settings_v2` (`owner_id` text PRIMARY KEY NOT NULL,`tbf_date` text,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
