import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const splitMigration = (file) => readFileSync(file, "utf8").split("--> statement-breakpoint").map((sql) => sql.trim()).filter(Boolean);
const migrations = ["drizzle/0000_light_magik.sql", "drizzle/0001_broken_ikaris.sql", "drizzle/0002_seed_xy_2018_2026.sql"];
const migrationStatementBytes = splitMigration(migrations[2]).map((sql) => Buffer.byteLength(sql));
assert.ok(Math.max(...migrationStatementBytes) < 50000, "a site-data migration statement is too large for D1");
const run = (db, files = migrations) => {
  for (const file of files) for (const sql of splitMigration(file)) db.exec(sql.replace(/;\s*$/, ""));
};

const fresh = new DatabaseSync(":memory:");
run(fresh);
const counts = fresh.prepare(`
  SELECT COUNT(DISTINCT e.id) exams,COUNT(DISTINCT p.id) problems
  FROM phors_exams e JOIN phors_problems p ON p.exam_id=e.id
  WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026
`).get();
assert.equal(counts.exams, 18);
assert.equal(counts.problems, 165);
assert.equal(fresh.prepare("SELECT COUNT(*) count FROM phors_problem_parts").get().count, 2200);
assert.equal(fresh.prepare("SELECT COUNT(*) count FROM phors_tags").get().count, 233);
assert.equal(fresh.prepare("SELECT COUNT(*) count FROM phors_problem_tags").get().count, 797);
assert.equal(fresh.prepare("SELECT COUNT(*) count FROM phors_problems WHERE statement_status='public' AND statement_html_original IS NOT NULL").get().count, 164);
assert.equal(fresh.prepare("SELECT COUNT(*) count FROM phors_problems WHERE statement_status='public' AND translation_status IN ('draft','verified') AND statement_html_pt IS NOT NULL AND translation_source_hash=statement_content_hash").get().count, 164);
assert.equal(fresh.prepare("SELECT COUNT(*) count FROM phors_problems WHERE statement_status='authentication_required' AND statement_html_pt IS NULL").get().count, 1);
const source = new DatabaseSync("data/phors-full.sqlite", { readOnly:true });
const sourceRows = source.prepare("SELECT source_id,statement_html_source,statement_html_original,statement_text_original,statement_html_pt,translation_status,translation_source_hash FROM phors_problems ORDER BY source_id").all();
const migratedRows = fresh.prepare("SELECT source_id,statement_html_source,statement_html_original,statement_text_original,statement_html_pt,translation_status,translation_source_hash FROM phors_problems ORDER BY source_id").all();
assert.deepEqual(migratedRows,sourceRows,"chunked statement content did not round-trip exactly");
source.close();
fresh.close();

const existing = new DatabaseSync(":memory:");
run(existing, [migrations[0]]);
existing.exec(`
  INSERT INTO phors_competitions (id,source_key,name,source_url,source_host) VALUES (9001,'xy.pho.rs','old','https://xy.pho.rs/','xy.pho.rs');
  INSERT INTO phors_exams (id,competition_id,source_key,source_url,title,year,code,series,source_hash,imported_at) VALUES (9001,9001,'xy.pho.rs:X18','https://xy.pho.rs/X18','old',2018,'X18','X','old','old');
  INSERT INTO phors_problems (id,exam_id,source_id,source_url,code,title,source_hash,imported_at) VALUES (9001,9001,'309','https://pho.rs/p/309','old','old','old','old');
  INSERT INTO user_attempts (id,problem_id,status,current_state,started_at) VALUES ('preserved',9001,'in_progress','paused','2026-01-01T00:00:00Z');
`);
run(existing, [migrations[1], migrations[2]]);
assert.equal(existing.prepare("SELECT id FROM phors_problems WHERE source_id='309'").get().id, 9001);
assert.equal(existing.prepare("SELECT problem_id FROM user_attempts WHERE id='preserved'").get().problem_id, 9001);
assert.equal(existing.prepare(`SELECT COUNT(*) count FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id WHERE e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026`).get().count, 165);
existing.close();

console.log(JSON.stringify({ status: "valid", ...counts, parts: 2200, tags: 233, problemTags: 797, publicStatements: 164, maxMigrationStatementBytes:Math.max(...migrationStatementBytes), preservedExistingAttempt: true }, null, 2));
