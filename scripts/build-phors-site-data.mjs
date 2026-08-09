import { mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = process.argv[2] ?? "data/phors-full.sqlite";
const catalogPath = process.argv[3] ?? "data/phors-catalog.json";
const migrationPath = process.argv[4] ?? "drizzle/0002_seed_xy_2018_2026.sql";
const db = new DatabaseSync(dbPath, { readOnly: true });

const all = (table) => db.prepare(`SELECT * FROM phors_${table} ORDER BY rowid`).all();
const competitions = all("competitions");
const exams = all("exams").filter((exam) => ["X", "Y"].includes(exam.series) && exam.year >= 2018 && exam.year <= 2026);
const examIds = new Set(exams.map((exam) => exam.id));
const problems = all("problems").filter((problem) => examIds.has(problem.exam_id));
const problemIds = new Set(problems.map((problem) => problem.id));
const problemParts = all("problem_parts").filter((part) => problemIds.has(part.problem_id));
const problemTags = all("problem_tags").filter((row) => problemIds.has(row.problem_id));
const tagIds = new Set(problemTags.map((row) => row.tag_id));
const tags = all("tags").filter((tag) => tagIds.has(tag.id));

if (exams.length !== 18 || problems.length !== 165) {
  throw new Error(`Expected 18 exams and 165 problems, found ${exams.length} and ${problems.length}`);
}

const omittedProblemFields = new Set(["statement_html_source", "statement_html_original", "statement_text_original", "statement_html_pt"]);
const compactProblems = problems.map((problem) => Object.fromEntries(Object.entries(problem).filter(([key]) => !omittedProblemFields.has(key))));
const compact = {
  schema_version: 1,
  source_scope: "xy.pho.rs X/Y 2018-2026 only",
  competitions,
  exams,
  problems: compactProblems,
  problem_parts: problemParts,
  tags,
  problem_tags: problemTags,
};
mkdirSync(path.dirname(path.resolve(catalogPath)), { recursive: true });
writeFileSync(catalogPath, `${JSON.stringify(compact)}\n`, "utf8");

const quote = (value) => value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const statement = (sql) => `${sql};\n--> statement-breakpoint`;
const examSourceById = new Map(exams.map((exam) => [exam.id, exam.source_url]));
const problemSourceById = new Map(problems.map((problem) => [problem.id, problem.source_id]));
const tagNameById = new Map(tags.map((tag) => [tag.id, tag.normalized_name]));
const sql = [];
const contentChunkSize = 24000;

function appendContent(sourceId, field, value, guard = "1=1") {
  if (value === null || value === undefined) {
    sql.push(statement(`UPDATE phors_problems SET ${field}=NULL WHERE source_id=${quote(sourceId)} AND ${guard}`));
    return;
  }
  sql.push(statement(`UPDATE phors_problems SET ${field}='' WHERE source_id=${quote(sourceId)} AND ${guard}`));
  for (let offset = 0; offset < value.length; offset += contentChunkSize) {
    sql.push(statement(`UPDATE phors_problems SET ${field}=${field}||${quote(value.slice(offset,offset+contentChunkSize))} WHERE source_id=${quote(sourceId)} AND ${guard}`));
  }
}

for (const row of competitions) {
  sql.push(statement(`INSERT INTO phors_competitions (source_key,name,source_url,source_host,created_at,updated_at) VALUES (${quote(row.source_key)},${quote(row.name)},${quote(row.source_url)},${quote(row.source_host)},${quote(row.created_at)},${quote(row.updated_at)}) ON CONFLICT(source_key) DO UPDATE SET name=excluded.name,source_url=excluded.source_url,source_host=excluded.source_host,updated_at=excluded.updated_at`));
}
for (const row of exams) {
  sql.push(statement(`INSERT INTO phors_exams (competition_id,source_key,source_url,title,title_pt,year,code,series,source_hash,imported_at,created_at,updated_at) VALUES ((SELECT id FROM phors_competitions WHERE source_key=${quote(competitions.find((item) => item.id === row.competition_id).source_key)}),${quote(row.source_key)},${quote(row.source_url)},${quote(row.title)},${quote(row.title_pt)},${quote(row.year)},${quote(row.code)},${quote(row.series)},${quote(row.source_hash)},${quote(row.imported_at)},${quote(row.created_at)},${quote(row.updated_at)}) ON CONFLICT(source_url) DO UPDATE SET competition_id=excluded.competition_id,source_key=excluded.source_key,title=excluded.title,title_pt=COALESCE(excluded.title_pt,phors_exams.title_pt),year=excluded.year,code=excluded.code,series=excluded.series,source_hash=excluded.source_hash,imported_at=excluded.imported_at,updated_at=excluded.updated_at`));
}
for (const row of problems) {
  sql.push(statement(`INSERT INTO phors_problems (exam_id,source_id,source_url,code,title,title_pt,kind,statement_url,solution_url,marking_scheme_url,statement_pdf_url,solution_pdf_url,attachments_json,statement_content_hash,statement_language,statement_status,translation_status,translation_source_hash,parts_status,source_hash,imported_at,created_at,updated_at) VALUES ((SELECT id FROM phors_exams WHERE source_url=${quote(examSourceById.get(row.exam_id))}),${quote(row.source_id)},${quote(row.source_url)},${quote(row.code)},${quote(row.title)},${quote(row.title_pt)},${quote(row.kind)},${quote(row.statement_url)},${quote(row.solution_url)},${quote(row.marking_scheme_url)},${quote(row.statement_pdf_url)},${quote(row.solution_pdf_url)},${quote(row.attachments_json)},${quote(row.statement_content_hash)},${quote(row.statement_language)},${quote(row.statement_status)},${quote(row.translation_status)},${quote(row.translation_source_hash)},${quote(row.parts_status)},${quote(row.source_hash)},${quote(row.imported_at)},${quote(row.created_at)},${quote(row.updated_at)}) ON CONFLICT(source_id) DO UPDATE SET exam_id=excluded.exam_id,source_url=excluded.source_url,code=excluded.code,title=excluded.title,title_pt=COALESCE(excluded.title_pt,phors_problems.title_pt),kind=excluded.kind,statement_url=excluded.statement_url,solution_url=excluded.solution_url,marking_scheme_url=excluded.marking_scheme_url,statement_pdf_url=excluded.statement_pdf_url,solution_pdf_url=excluded.solution_pdf_url,attachments_json=excluded.attachments_json,statement_content_hash=excluded.statement_content_hash,statement_language=excluded.statement_language,statement_status=excluded.statement_status,translation_status=CASE WHEN phors_problems.translation_status='verified' AND phors_problems.translation_source_hash=excluded.statement_content_hash THEN phors_problems.translation_status ELSE excluded.translation_status END,translation_source_hash=CASE WHEN phors_problems.translation_status='verified' AND phors_problems.translation_source_hash=excluded.statement_content_hash THEN phors_problems.translation_source_hash ELSE excluded.translation_source_hash END,parts_status=excluded.parts_status,source_hash=excluded.source_hash,imported_at=excluded.imported_at,updated_at=excluded.updated_at`));
  appendContent(row.source_id,"statement_html_source",row.statement_html_source);
  appendContent(row.source_id,"statement_html_original",row.statement_html_original);
  appendContent(row.source_id,"statement_text_original",row.statement_text_original);
  appendContent(row.source_id,"statement_html_pt",row.statement_html_pt,"NOT (translation_status='verified' AND translation_source_hash=statement_content_hash AND statement_html_pt IS NOT NULL AND statement_html_pt<>'')");
}
for (const row of tags) {
  sql.push(statement(`INSERT INTO phors_tags (name,name_pt,normalized_name) VALUES (${quote(row.name)},${quote(row.name_pt)},${quote(row.normalized_name)}) ON CONFLICT(normalized_name) DO UPDATE SET name=excluded.name,name_pt=COALESCE(excluded.name_pt,phors_tags.name_pt)`));
}
sql.push(statement(`DELETE FROM phors_problem_tags WHERE problem_id IN (SELECT p.id FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026)`));
for (const row of problemParts) {
  sql.push(statement(`INSERT INTO phors_problem_parts (problem_id,source_key,code,parent_code,ordinal,score,score_reliability,prompt_text,prompt_text_pt,source_url) VALUES ((SELECT id FROM phors_problems WHERE source_id=${quote(problemSourceById.get(row.problem_id))}),${quote(row.source_key)},${quote(row.code)},${quote(row.parent_code)},${quote(row.ordinal)},${quote(row.score)},${quote(row.score_reliability)},${quote(row.prompt_text)},${quote(row.prompt_text_pt)},${quote(row.source_url)}) ON CONFLICT(problem_id,source_key) DO UPDATE SET code=excluded.code,parent_code=excluded.parent_code,ordinal=excluded.ordinal,score=excluded.score,score_reliability=excluded.score_reliability,prompt_text=excluded.prompt_text,prompt_text_pt=COALESCE(excluded.prompt_text_pt,phors_problem_parts.prompt_text_pt),source_url=excluded.source_url`));
}
for (const row of problemTags) {
  sql.push(statement(`INSERT OR IGNORE INTO phors_problem_tags (problem_id,tag_id) VALUES ((SELECT id FROM phors_problems WHERE source_id=${quote(problemSourceById.get(row.problem_id))}),(SELECT id FROM phors_tags WHERE normalized_name=${quote(tagNameById.get(row.tag_id))}))`));
}

mkdirSync(path.dirname(path.resolve(migrationPath)), { recursive: true });
writeFileSync(migrationPath, `${sql.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ exams: exams.length, problems: problems.length, parts: problemParts.length, tags: tags.length, problemTags: problemTags.length, catalogPath, migrationPath }, null, 2));
db.close();
