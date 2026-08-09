import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeTag } from "./parser.mjs";

export function openCatalog(dbPath) {
  mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(readFileSync(new URL("../../db/migrations/0001_phors_catalog.sql", import.meta.url), "utf8"));
  return db;
}

export function startSyncRun(db, examUrls, startedAt) {
  return Number(db.prepare("INSERT INTO phors_sync_runs (started_at, exam_urls_json) VALUES (?, ?)").run(startedAt, JSON.stringify(examUrls)).lastInsertRowid);
}

export function finishSyncRun(db, runId, status, stats, errorText = null) {
  db.prepare("UPDATE phors_sync_runs SET finished_at = ?, status = ?, stats_json = ?, error_text = ? WHERE id = ?")
    .run(new Date().toISOString(), status, JSON.stringify(stats), errorText, runId);
}

export function upsertExamCatalog(db, catalog, importedAt) {
  db.exec("BEGIN");
  try {
    const c = catalog.competition;
    db.prepare("INSERT INTO phors_competitions (source_key,name,source_url,source_host,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(source_key) DO UPDATE SET name=excluded.name,source_url=excluded.source_url,source_host=excluded.source_host,updated_at=CURRENT_TIMESTAMP")
      .run(c.sourceKey, c.name, c.sourceUrl, c.sourceHost);
    const competitionId = Number(db.prepare("SELECT id FROM phors_competitions WHERE source_key=?").get(c.sourceKey).id);
    const e = catalog.exam;
    db.prepare("INSERT INTO phors_exams (competition_id,source_key,source_url,title,year,code,series,source_hash,imported_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(source_url) DO UPDATE SET competition_id=excluded.competition_id,source_key=excluded.source_key,title=excluded.title,year=excluded.year,code=excluded.code,series=excluded.series,source_hash=excluded.source_hash,imported_at=excluded.imported_at,updated_at=CURRENT_TIMESTAMP")
      .run(competitionId, e.sourceKey, e.sourceUrl, e.title, e.year, e.code, e.series, e.sourceHash, importedAt);
    const examId = Number(db.prepare("SELECT id FROM phors_exams WHERE source_url=?").get(e.sourceUrl).id);
    for (const p of catalog.problems) {
      db.prepare("INSERT INTO phors_problems (exam_id,source_id,source_url,code,title,kind,statement_url,solution_url,marking_scheme_url,statement_pdf_url,solution_pdf_url,attachments_json,parts_status,source_hash,imported_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(source_id) DO UPDATE SET exam_id=excluded.exam_id,source_url=excluded.source_url,code=excluded.code,title=excluded.title,kind=excluded.kind,statement_url=COALESCE(excluded.statement_url,phors_problems.statement_url),solution_url=COALESCE(excluded.solution_url,phors_problems.solution_url),marking_scheme_url=COALESCE(excluded.marking_scheme_url,phors_problems.marking_scheme_url),statement_pdf_url=excluded.statement_pdf_url,solution_pdf_url=excluded.solution_pdf_url,attachments_json=excluded.attachments_json,parts_status=CASE WHEN excluded.parts_status='not_fetched' THEN phors_problems.parts_status ELSE excluded.parts_status END,source_hash=excluded.source_hash,imported_at=excluded.imported_at,updated_at=CURRENT_TIMESTAMP")
        .run(examId, p.sourceId, p.sourceUrl, p.code, p.title, p.kind, p.statementUrl, p.solutionUrl, p.markingSchemeUrl, p.statementPdfUrl, p.solutionPdfUrl, JSON.stringify(p.attachments), p.partsStatus, p.sourceHash, importedAt);
      const problemId = Number(db.prepare("SELECT id FROM phors_problems WHERE source_id=?").get(p.sourceId).id);
      db.prepare("DELETE FROM phors_problem_tags WHERE problem_id=?").run(problemId);
      for (const tag of p.tags) {
        const normalized = normalizeTag(tag);
        db.prepare("INSERT INTO phors_tags (name,normalized_name) VALUES (?,?) ON CONFLICT(normalized_name) DO UPDATE SET name=excluded.name").run(tag, normalized);
        const tagId = Number(db.prepare("SELECT id FROM phors_tags WHERE normalized_name=?").get(normalized).id);
        db.prepare("INSERT OR IGNORE INTO phors_problem_tags (problem_id,tag_id) VALUES (?,?)").run(problemId, tagId);
      }
      if (p.partsStatus !== "not_fetched") {
        db.prepare("DELETE FROM phors_problem_parts WHERE problem_id=?").run(problemId);
        for (const part of p.parts) {
          db.prepare("INSERT INTO phors_problem_parts (problem_id,source_key,code,parent_code,ordinal,score,score_reliability,prompt_text,source_url) VALUES (?,?,?,?,?,?,?,?,?)")
            .run(problemId, part.sourceKey, part.code, part.parentCode, part.ordinal, part.score, part.scoreReliability, part.promptText, part.sourceUrl);
        }
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function catalogCounts(db) {
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  return { competitions: count("phors_competitions"), exams: count("phors_exams"), problems: count("phors_problems"), problemParts: count("phors_problem_parts"), tags: count("phors_tags"), problemTags: count("phors_problem_tags") };
}

export function exportCatalog(db, outputPath) {
  const tables = ["competitions", "exams", "problems", "problem_parts", "tags", "problem_tags", "sync_runs"];
  const result = { exported_at: new Date().toISOString(), source_scope: "xy.pho.rs only" };
  for (const table of tables) result[table] = db.prepare(`SELECT * FROM phors_${table} ORDER BY rowid`).all();
  mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
