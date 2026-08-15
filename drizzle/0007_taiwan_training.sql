CREATE TABLE IF NOT EXISTS user_taiwan_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  volume INTEGER NOT NULL,
  problem_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('in_progress','completed')),
  current_state TEXT NOT NULL CHECK(current_state IN ('item_active','paused')),
  active_item_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS user_taiwan_attempts_owner_problem_idx ON user_taiwan_attempts(owner_id,volume,problem_number);
CREATE INDEX IF NOT EXISTS user_taiwan_attempts_status_idx ON user_taiwan_attempts(status);

CREATE TABLE IF NOT EXISTS user_taiwan_time_segments (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES user_taiwan_attempts(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER
);
CREATE INDEX IF NOT EXISTS user_taiwan_segments_attempt_idx ON user_taiwan_time_segments(attempt_id);
CREATE INDEX IF NOT EXISTS user_taiwan_segments_item_idx ON user_taiwan_time_segments(item_code);

CREATE TABLE IF NOT EXISTS user_taiwan_hint_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL REFERENCES user_taiwan_attempts(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  question TEXT,
  answer_text TEXT NOT NULL,
  answer_html TEXT NOT NULL,
  full_solution INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS user_taiwan_hints_attempt_item_idx ON user_taiwan_hint_events(attempt_id,item_code);
CREATE INDEX IF NOT EXISTS user_taiwan_hints_owner_idx ON user_taiwan_hint_events(owner_id);

PRAGMA optimize;
