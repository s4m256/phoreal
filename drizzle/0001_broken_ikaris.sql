ALTER TABLE `phors_exams` ADD `title_pt` text;--> statement-breakpoint
ALTER TABLE `phors_problem_parts` ADD `prompt_text_pt` text;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `title_pt` text;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `statement_html_source` text;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `statement_html_original` text;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `statement_text_original` text;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `statement_content_hash` text;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `statement_language` text DEFAULT 'ru' NOT NULL;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `statement_status` text DEFAULT 'not_fetched' NOT NULL;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `statement_html_pt` text;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `translation_status` text DEFAULT 'missing' NOT NULL;--> statement-breakpoint
ALTER TABLE `phors_problems` ADD `translation_source_hash` text;--> statement-breakpoint
ALTER TABLE `phors_tags` ADD `name_pt` text;