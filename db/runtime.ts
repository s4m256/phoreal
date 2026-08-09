import { env } from "cloudflare:workers";
import sample from "../data/phors-sample.json";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS phors_competitions (id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, source_url TEXT NOT NULL, source_host TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS phors_exams (id INTEGER PRIMARY KEY AUTOINCREMENT, competition_id INTEGER NOT NULL REFERENCES phors_competitions(id) ON DELETE CASCADE, source_key TEXT NOT NULL, source_url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, year INTEGER, code TEXT, series TEXT, source_hash TEXT NOT NULL, imported_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS phors_problems (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL REFERENCES phors_exams(id) ON DELETE CASCADE, source_id TEXT NOT NULL UNIQUE, source_url TEXT NOT NULL UNIQUE, code TEXT, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'unknown', statement_url TEXT, solution_url TEXT, marking_scheme_url TEXT, statement_pdf_url TEXT, solution_pdf_url TEXT, attachments_json TEXT NOT NULL DEFAULT '[]', parts_status TEXT NOT NULL DEFAULT 'not_fetched', source_hash TEXT NOT NULL, imported_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS phors_problem_parts (id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id INTEGER NOT NULL REFERENCES phors_problems(id) ON DELETE CASCADE, source_key TEXT NOT NULL, code TEXT NOT NULL, parent_code TEXT, ordinal INTEGER NOT NULL, score REAL, score_reliability TEXT, prompt_text TEXT, source_url TEXT NOT NULL, UNIQUE(problem_id, source_key))`,
  `CREATE TABLE IF NOT EXISTS phors_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS phors_problem_tags (problem_id INTEGER NOT NULL REFERENCES phors_problems(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES phors_tags(id) ON DELETE CASCADE, PRIMARY KEY(problem_id, tag_id))`,
  `CREATE TABLE IF NOT EXISTS phors_sync_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT 'running', exam_urls_json TEXT NOT NULL, stats_json TEXT NOT NULL DEFAULT '{}', error_text TEXT)`,
  `CREATE TABLE IF NOT EXISTS user_settings (id INTEGER PRIMARY KEY, tbf_date TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS user_attempts (id TEXT PRIMARY KEY, problem_id INTEGER NOT NULL REFERENCES phors_problems(id), status TEXT NOT NULL CHECK(status IN ('in_progress','completed')), current_state TEXT NOT NULL CHECK(current_state IN ('initial_reading','item_active','paused')), active_part_id INTEGER REFERENCES phors_problem_parts(id), started_at TEXT NOT NULL, finished_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS user_attempts_problem_idx ON user_attempts(problem_id)`,
  `CREATE INDEX IF NOT EXISTS user_attempts_status_idx ON user_attempts(status)`,
  `CREATE TABLE IF NOT EXISTS user_time_segments (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES user_attempts(id) ON DELETE CASCADE, state TEXT NOT NULL CHECK(state IN ('initial_reading','item_active')), problem_part_id INTEGER REFERENCES phors_problem_parts(id), started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER)`,
  `CREATE INDEX IF NOT EXISTS user_time_segments_attempt_idx ON user_time_segments(attempt_id)`,
  `CREATE INDEX IF NOT EXISTS user_time_segments_part_idx ON user_time_segments(problem_part_id)`,
  `CREATE TABLE IF NOT EXISTS user_mock_exams (id TEXT PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES phors_exams(id), date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('theoretical','experimental')), total_score REAL NOT NULL, max_score REAL NOT NULL, drive_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS user_mock_exams_date_idx ON user_mock_exams(date)`,
  `CREATE TABLE IF NOT EXISTS user_mock_exam_problem_scores (id TEXT PRIMARY KEY, mock_exam_id TEXT NOT NULL REFERENCES user_mock_exams(id) ON DELETE CASCADE, problem_id INTEGER NOT NULL REFERENCES phors_problems(id), score REAL NOT NULL, max_score REAL NOT NULL, UNIQUE(mock_exam_id, problem_id))`,
  `CREATE INDEX IF NOT EXISTS user_mock_scores_problem_idx ON user_mock_exam_problem_scores(problem_id)`,
];

let initialization: Promise<void> | null = null;

export function getD1() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

async function runBatches(statements: D1PreparedStatement[]) {
  const db = getD1();
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
}

async function seedCatalog() {
  const db = getD1();
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM phors_problems").first<{ count: number }>();
  if (Number(existing?.count ?? 0) > 0) return;
  const statements: D1PreparedStatement[] = [];
  for (const row of sample.competitions) statements.push(db.prepare("INSERT OR IGNORE INTO phors_competitions (id,source_key,name,source_url,source_host,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(row.id,row.source_key,row.name,row.source_url,row.source_host,row.created_at,row.updated_at));
  for (const row of sample.exams) statements.push(db.prepare("INSERT OR IGNORE INTO phors_exams (id,competition_id,source_key,source_url,title,year,code,series,source_hash,imported_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(row.id,row.competition_id,row.source_key,row.source_url,row.title,row.year,row.code,row.series,row.source_hash,row.imported_at,row.created_at,row.updated_at));
  for (const row of sample.problems) statements.push(db.prepare("INSERT OR IGNORE INTO phors_problems (id,exam_id,source_id,source_url,code,title,kind,statement_url,solution_url,marking_scheme_url,statement_pdf_url,solution_pdf_url,attachments_json,parts_status,source_hash,imported_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(row.id,row.exam_id,row.source_id,row.source_url,row.code,row.title,row.kind,row.statement_url,row.solution_url,row.marking_scheme_url,row.statement_pdf_url,row.solution_pdf_url,row.attachments_json,row.parts_status,row.source_hash,row.imported_at,row.created_at,row.updated_at));
  for (const row of sample.problem_parts) statements.push(db.prepare("INSERT OR IGNORE INTO phors_problem_parts (id,problem_id,source_key,code,parent_code,ordinal,score,score_reliability,prompt_text,source_url) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(row.id,row.problem_id,row.source_key,row.code,row.parent_code,row.ordinal,row.score,row.score_reliability,row.prompt_text,row.source_url));
  for (const row of sample.tags) statements.push(db.prepare("INSERT OR IGNORE INTO phors_tags (id,name,normalized_name) VALUES (?,?,?)").bind(row.id,row.name,row.normalized_name));
  for (const row of sample.problem_tags) statements.push(db.prepare("INSERT OR IGNORE INTO phors_problem_tags (problem_id,tag_id) VALUES (?,?)").bind(row.problem_id,row.tag_id));
  await runBatches(statements);
}

export function ensureDatabase() {
  if (!initialization) initialization = (async () => {
    const db = getD1();
    await runBatches(schemaStatements.map((statement) => db.prepare(statement)));
    await seedCatalog();
    await db.prepare("INSERT OR IGNORE INTO user_settings (id) VALUES (1)").run();
  })().catch((error) => { initialization = null; throw error; });
  return initialization;
}

export async function readAllData() {
  await ensureDatabase();
  const db = getD1();
  const queries = [
    "SELECT * FROM phors_competitions ORDER BY id", "SELECT * FROM phors_exams ORDER BY year, code",
    "SELECT * FROM phors_problems ORDER BY exam_id, code", "SELECT * FROM phors_problem_parts ORDER BY problem_id, ordinal",
    "SELECT * FROM phors_tags ORDER BY name", "SELECT * FROM phors_problem_tags ORDER BY problem_id, tag_id",
    "SELECT * FROM user_attempts ORDER BY started_at DESC", "SELECT * FROM user_time_segments ORDER BY started_at",
    "SELECT * FROM user_mock_exams ORDER BY date DESC", "SELECT * FROM user_mock_exam_problem_scores ORDER BY mock_exam_id, problem_id",
    "SELECT * FROM user_settings WHERE id=1",
  ];
  const results = await db.batch(queries.map((query) => db.prepare(query)));
  return {
    competitions: results[0].results, exams: results[1].results, problems: results[2].results,
    problemParts: results[3].results, tags: results[4].results, problemTags: results[5].results,
    attempts: results[6].results, timeSegments: results[7].results, mockExams: results[8].results,
    mockExamProblemScores: results[9].results, settings: results[10].results[0] ?? { id: 1, tbf_date: null },
  };
}
