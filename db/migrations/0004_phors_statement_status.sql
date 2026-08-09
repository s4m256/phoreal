ALTER TABLE phors_problems ADD COLUMN statement_status TEXT NOT NULL DEFAULT 'not_fetched'
  CHECK (statement_status IN ('public', 'authentication_required', 'not_available', 'not_fetched'));
