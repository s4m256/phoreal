import { DatabaseSync } from "node:sqlite";
import { parseProblemParts } from "../lib/phors/parser.mjs";

const dbPath = process.argv[2] ?? "data/phors-full.sqlite";
const db = new DatabaseSync(dbPath);
const problems = db.prepare("SELECT id, source_url, statement_html_source FROM phors_problems WHERE statement_html_source IS NOT NULL").all();
const before = Number(db.prepare("SELECT COUNT(*) AS count FROM phors_problem_parts").get().count);
const upsert = db.prepare(`
  INSERT INTO phors_problem_parts
    (problem_id, source_key, code, parent_code, ordinal, score, score_reliability, prompt_text, prompt_text_pt, source_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  ON CONFLICT(problem_id, source_key) DO UPDATE SET
    code=excluded.code,
    parent_code=excluded.parent_code,
    ordinal=excluded.ordinal,
    score=excluded.score,
    score_reliability=excluded.score_reliability,
    prompt_text=excluded.prompt_text,
    prompt_text_pt=COALESCE(phors_problem_parts.prompt_text_pt, excluded.prompt_text_pt),
    source_url=excluded.source_url
`);

db.exec("BEGIN");
try {
  for (const problem of problems) {
    for (const part of parseProblemParts(problem.statement_html_source, problem.source_url)) {
      upsert.run(problem.id, part.sourceKey, part.code, part.parentCode, part.ordinal, part.score, part.scoreReliability, part.promptText, part.sourceUrl);
    }
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const after = Number(db.prepare("SELECT COUNT(*) AS count FROM phors_problem_parts").get().count);
console.log(JSON.stringify({ db: dbPath, problemsProcessed: problems.length, before, after, recovered: after - before }, null, 2));
db.close();
