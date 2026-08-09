import { env } from "cloudflare:workers";
import catalog from "../data/phors-catalog.json";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS phors_competitions (id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, source_url TEXT NOT NULL, source_host TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS phors_exams (id INTEGER PRIMARY KEY AUTOINCREMENT, competition_id INTEGER NOT NULL REFERENCES phors_competitions(id) ON DELETE CASCADE, source_key TEXT NOT NULL, source_url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, title_pt TEXT, year INTEGER, code TEXT, series TEXT, source_hash TEXT NOT NULL, imported_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS phors_problems (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL REFERENCES phors_exams(id) ON DELETE CASCADE, source_id TEXT NOT NULL UNIQUE, source_url TEXT NOT NULL UNIQUE, code TEXT, title TEXT NOT NULL, title_pt TEXT, kind TEXT NOT NULL DEFAULT 'unknown', statement_url TEXT, solution_url TEXT, marking_scheme_url TEXT, statement_pdf_url TEXT, solution_pdf_url TEXT, attachments_json TEXT NOT NULL DEFAULT '[]', statement_html_source TEXT, statement_html_original TEXT, statement_text_original TEXT, statement_content_hash TEXT, statement_language TEXT NOT NULL DEFAULT 'ru', statement_status TEXT NOT NULL DEFAULT 'not_fetched', statement_html_pt TEXT, translation_status TEXT NOT NULL DEFAULT 'missing', translation_source_hash TEXT, parts_status TEXT NOT NULL DEFAULT 'not_fetched', source_hash TEXT NOT NULL, imported_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS phors_problem_parts (id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id INTEGER NOT NULL REFERENCES phors_problems(id) ON DELETE CASCADE, source_key TEXT NOT NULL, code TEXT NOT NULL, parent_code TEXT, ordinal INTEGER NOT NULL, score REAL, score_reliability TEXT, prompt_text TEXT, prompt_text_pt TEXT, source_url TEXT NOT NULL, UNIQUE(problem_id, source_key))`,
  `CREATE TABLE IF NOT EXISTS phors_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_pt TEXT, normalized_name TEXT NOT NULL UNIQUE)`,
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
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026").first<{ count: number }>();
  if (Number(existing?.count ?? 0) === 165) return;

  await runBatches(catalog.competitions.map((row) => db.prepare("INSERT INTO phors_competitions (source_key,name,source_url,source_host,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET name=excluded.name,source_url=excluded.source_url,source_host=excluded.source_host,updated_at=excluded.updated_at").bind(row.source_key,row.name,row.source_url,row.source_host,row.created_at,row.updated_at)));
  const competitionRows = await db.prepare("SELECT id,source_key FROM phors_competitions").all<{ id:number; source_key:string }>();
  const competitionIds = new Map(competitionRows.results.map((row) => [row.source_key, Number(row.id)]));
  const sourceCompetition = new Map(catalog.competitions.map((row) => [row.id, row.source_key]));

  await runBatches(catalog.exams.map((row) => db.prepare("INSERT INTO phors_exams (competition_id,source_key,source_url,title,title_pt,year,code,series,source_hash,imported_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_url) DO UPDATE SET competition_id=excluded.competition_id,source_key=excluded.source_key,title=excluded.title,title_pt=COALESCE(excluded.title_pt,phors_exams.title_pt),year=excluded.year,code=excluded.code,series=excluded.series,source_hash=excluded.source_hash,imported_at=excluded.imported_at,updated_at=excluded.updated_at").bind(competitionIds.get(sourceCompetition.get(row.competition_id)!)!,row.source_key,row.source_url,row.title,row.title_pt,row.year,row.code,row.series,row.source_hash,row.imported_at,row.created_at,row.updated_at)));
  const examRows = await db.prepare("SELECT id,source_url FROM phors_exams").all<{ id:number; source_url:string }>();
  const examIds = new Map(examRows.results.map((row) => [row.source_url, Number(row.id)]));
  const sourceExams = new Map(catalog.exams.map((row) => [row.id, row.source_url]));

  await runBatches(catalog.problems.map((row) => db.prepare("INSERT INTO phors_problems (exam_id,source_id,source_url,code,title,title_pt,kind,statement_url,solution_url,marking_scheme_url,statement_pdf_url,solution_pdf_url,attachments_json,statement_content_hash,statement_language,statement_status,translation_status,translation_source_hash,parts_status,source_hash,imported_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET exam_id=excluded.exam_id,source_url=excluded.source_url,code=excluded.code,title=excluded.title,title_pt=COALESCE(excluded.title_pt,phors_problems.title_pt),kind=excluded.kind,statement_url=excluded.statement_url,solution_url=excluded.solution_url,marking_scheme_url=excluded.marking_scheme_url,statement_pdf_url=excluded.statement_pdf_url,solution_pdf_url=excluded.solution_pdf_url,attachments_json=excluded.attachments_json,statement_content_hash=excluded.statement_content_hash,statement_language=excluded.statement_language,statement_status=excluded.statement_status,parts_status=excluded.parts_status,source_hash=excluded.source_hash,imported_at=excluded.imported_at,updated_at=excluded.updated_at").bind(examIds.get(sourceExams.get(row.exam_id)!)!,row.source_id,row.source_url,row.code,row.title,row.title_pt,row.kind,row.statement_url,row.solution_url,row.marking_scheme_url,row.statement_pdf_url,row.solution_pdf_url,row.attachments_json,row.statement_content_hash,row.statement_language,row.statement_status,row.translation_status,row.translation_source_hash,row.parts_status,row.source_hash,row.imported_at,row.created_at,row.updated_at)));
  const problemRows = await db.prepare("SELECT id,source_id FROM phors_problems").all<{ id:number; source_id:string }>();
  const problemIds = new Map(problemRows.results.map((row) => [row.source_id, Number(row.id)]));
  const sourceProblems = new Map(catalog.problems.map((row) => [row.id, row.source_id]));

  await runBatches(catalog.problem_parts.map((row) => db.prepare("INSERT INTO phors_problem_parts (problem_id,source_key,code,parent_code,ordinal,score,score_reliability,prompt_text,prompt_text_pt,source_url) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(problem_id,source_key) DO UPDATE SET code=excluded.code,parent_code=excluded.parent_code,ordinal=excluded.ordinal,score=excluded.score,score_reliability=excluded.score_reliability,prompt_text=excluded.prompt_text,prompt_text_pt=COALESCE(excluded.prompt_text_pt,phors_problem_parts.prompt_text_pt),source_url=excluded.source_url").bind(problemIds.get(sourceProblems.get(row.problem_id)!)!,row.source_key,row.code,row.parent_code,row.ordinal,row.score,row.score_reliability,row.prompt_text,row.prompt_text_pt,row.source_url)));
  await runBatches(catalog.tags.map((row) => db.prepare("INSERT INTO phors_tags (name,name_pt,normalized_name) VALUES (?,?,?) ON CONFLICT(normalized_name) DO UPDATE SET name=excluded.name,name_pt=COALESCE(excluded.name_pt,phors_tags.name_pt)").bind(row.name,row.name_pt,row.normalized_name)));
  const tagRows = await db.prepare("SELECT id,normalized_name FROM phors_tags").all<{ id:number; normalized_name:string }>();
  const tagIds = new Map(tagRows.results.map((row) => [row.normalized_name, Number(row.id)]));
  const sourceTags = new Map(catalog.tags.map((row) => [row.id, row.normalized_name]));
  const catalogProblemIds = [...sourceProblems.values()].map((sourceId) => problemIds.get(sourceId)!);
  await runBatches(catalogProblemIds.map((id) => db.prepare("DELETE FROM phors_problem_tags WHERE problem_id=?").bind(id)));
  await runBatches(catalog.problem_tags.map((row) => db.prepare("INSERT OR IGNORE INTO phors_problem_tags (problem_id,tag_id) VALUES (?,?)").bind(problemIds.get(sourceProblems.get(row.problem_id)!)!,tagIds.get(sourceTags.get(row.tag_id)!)!)));
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
    "SELECT DISTINCT c.* FROM phors_competitions c JOIN phors_exams e ON e.competition_id=c.id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY c.id",
    "SELECT * FROM phors_exams WHERE series IN ('X','Y') AND year BETWEEN 2018 AND 2026 ORDER BY year DESC, code",
    "SELECT p.id,p.exam_id,p.source_id,p.source_url,p.code,p.title,p.title_pt,p.kind,p.statement_url,p.solution_url,p.marking_scheme_url,p.statement_pdf_url,p.parts_status,p.statement_status,p.translation_status FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY p.exam_id,p.code",
    "SELECT pp.id,pp.problem_id,pp.source_key,pp.code,pp.parent_code,pp.ordinal,pp.score,pp.score_reliability,pp.prompt_text,pp.prompt_text_pt,pp.source_url FROM phors_problem_parts pp JOIN phors_problems p ON p.id=pp.problem_id JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY pp.problem_id,pp.ordinal",
    "SELECT DISTINCT t.* FROM phors_tags t JOIN phors_problem_tags pt ON pt.tag_id=t.id JOIN phors_problems p ON p.id=pt.problem_id JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY t.name",
    "SELECT pt.* FROM phors_problem_tags pt JOIN phors_problems p ON p.id=pt.problem_id JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY pt.problem_id,pt.tag_id",
    "SELECT a.* FROM user_attempts a JOIN phors_problems p ON p.id=a.problem_id JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY a.started_at DESC",
    "SELECT s.* FROM user_time_segments s JOIN user_attempts a ON a.id=s.attempt_id JOIN phors_problems p ON p.id=a.problem_id JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY s.started_at",
    "SELECT m.* FROM user_mock_exams m JOIN phors_exams e ON e.id=m.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY m.date DESC",
    "SELECT ms.* FROM user_mock_exam_problem_scores ms JOIN user_mock_exams m ON m.id=ms.mock_exam_id JOIN phors_exams e ON e.id=m.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026 ORDER BY ms.mock_exam_id,ms.problem_id",
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

export async function readFullExportData() {
  const data = await readAllData();
  const db = getD1();
  const scope = "e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026";
  const results = await db.batch([
    db.prepare(`SELECT p.* FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id WHERE ${scope} ORDER BY p.exam_id,p.code`),
    db.prepare(`SELECT pp.* FROM phors_problem_parts pp JOIN phors_problems p ON p.id=pp.problem_id JOIN phors_exams e ON e.id=p.exam_id WHERE ${scope} ORDER BY pp.problem_id,pp.ordinal`),
    db.prepare(`SELECT DISTINCT t.* FROM phors_tags t JOIN phors_problem_tags pt ON pt.tag_id=t.id JOIN phors_problems p ON p.id=pt.problem_id JOIN phors_exams e ON e.id=p.exam_id WHERE ${scope} ORDER BY t.name`),
    db.prepare(`SELECT pt.* FROM phors_problem_tags pt JOIN phors_problems p ON p.id=pt.problem_id JOIN phors_exams e ON e.id=p.exam_id WHERE ${scope} ORDER BY pt.problem_id,pt.tag_id`),
  ]);
  return { ...data, problems:results[0].results, problemParts:results[1].results, tags:results[2].results, problemTags:results[3].results };
}
