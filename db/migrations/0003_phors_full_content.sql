ALTER TABLE phors_exams ADD COLUMN title_pt TEXT;

ALTER TABLE phors_problems ADD COLUMN title_pt TEXT;
ALTER TABLE phors_problems ADD COLUMN statement_html_source TEXT;
ALTER TABLE phors_problems ADD COLUMN statement_html_original TEXT;
ALTER TABLE phors_problems ADD COLUMN statement_text_original TEXT;
ALTER TABLE phors_problems ADD COLUMN statement_content_hash TEXT;
ALTER TABLE phors_problems ADD COLUMN statement_language TEXT NOT NULL DEFAULT 'ru';
ALTER TABLE phors_problems ADD COLUMN statement_html_pt TEXT;
ALTER TABLE phors_problems ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'missing'
  CHECK (translation_status IN ('missing', 'draft', 'verified'));
ALTER TABLE phors_problems ADD COLUMN translation_source_hash TEXT;

ALTER TABLE phors_problem_parts ADD COLUMN prompt_text_pt TEXT;
ALTER TABLE phors_tags ADD COLUMN name_pt TEXT;
