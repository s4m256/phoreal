CREATE TABLE IF NOT EXISTS `phors_hint_sources` (`problem_id` integer PRIMARY KEY NOT NULL REFERENCES `phors_problems`(`id`) ON DELETE CASCADE, `marking_text` text, `solution_text` text, `fetched_at` text NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_hint_events` (`id` text PRIMARY KEY NOT NULL, `owner_id` text NOT NULL, `attempt_id` text NOT NULL REFERENCES `user_attempts`(`id`) ON DELETE CASCADE, `problem_part_id` integer NOT NULL REFERENCES `phors_problem_parts`(`id`), `question` text, `answer_text` text NOT NULL, `answer_html` text NOT NULL, `revealed_steps_json` text DEFAULT '[]' NOT NULL, `penalty` real NOT NULL, `full_solution` integer DEFAULT 0 NOT NULL, `model` text NOT NULL, `input_tokens` integer, `output_tokens` integer, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_hint_events_attempt_part_idx` ON `user_hint_events` (`attempt_id`,`problem_part_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_hint_events_owner_idx` ON `user_hint_events` (`owner_id`);
