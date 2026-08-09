import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { load } from "cheerio";

const dbPath = process.argv[2] ?? "data/phors-full.sqlite";
const db = new DatabaseSync(dbPath, { readOnly: true });
const expectedByExam = new Map([
  ["X18", 8], ["Y18", 6], ["X19", 8], ["Y19", 6], ["X20", 11], ["Y20", 11],
  ["X21", 10], ["Y21", 10], ["X22", 9], ["Y22", 10], ["X23", 10], ["Y23", 11],
  ["X24", 9], ["Y24", 9], ["X25", 10], ["Y25", 9], ["X26", 9], ["Y26", 9],
]);

const exams = db.prepare(`
  SELECT e.code, e.year, COUNT(p.id) AS problem_count
  FROM phors_exams e LEFT JOIN phors_problems p ON p.exam_id=e.id
  GROUP BY e.id ORDER BY e.year, e.series
`).all();
assert.equal(exams.length, 18, "expected exactly 18 X/Y exams");
for (const exam of exams) {
  assert.equal(exam.year, 2000 + Number(exam.code.slice(1)), `${exam.code}: edition year mismatch`);
  assert.equal(exam.problem_count, expectedByExam.get(exam.code), `${exam.code}: problem count mismatch`);
}
assert.deepEqual(new Set(exams.map((exam) => exam.code)), new Set(expectedByExam.keys()), "exam codes differ from X/Y 2018-2026");

const totals = db.prepare(`
  SELECT COUNT(*) AS problems,
         COUNT(DISTINCT source_id) AS source_ids,
         COUNT(DISTINCT source_url) AS source_urls,
         SUM(statement_status='public') AS public_statements,
         SUM(statement_status='authentication_required') AS authentication_required,
         SUM(statement_status='public' AND statement_html_source IS NOT NULL AND statement_html_original IS NOT NULL AND statement_content_hash IS NOT NULL) AS complete_public_statements
  FROM phors_problems
`).get();
assert.deepEqual({ ...totals }, {
  problems: 165,
  source_ids: 165,
  source_urls: 165,
  public_statements: 164,
  authentication_required: 1,
  complete_public_statements: 164,
});

const restricted = db.prepare(`
  SELECT e.code AS exam_code, p.code, p.source_id, p.title, p.source_url
  FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id
  WHERE p.statement_status='authentication_required'
`).all();
assert.deepEqual(restricted.map((row) => ({ ...row })), [{
  exam_code: "X23",
  code: "E2",
  source_id: "3155",
  title: "Чёткая оптика",
  source_url: "https://pho.rs/p/3155",
}]);

const mojibake = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM phors_exams WHERE title LIKE '%Ð%' OR title LIKE '%Ã%') +
    (SELECT COUNT(*) FROM phors_problems WHERE title LIKE '%Ð%' OR title LIKE '%Ã%' OR statement_text_original LIKE '%Ð%' OR statement_text_original LIKE '%Ã%') +
    (SELECT COUNT(*) FROM phors_tags WHERE name LIKE '%Ð%' OR name LIKE '%Ã%') AS count
`).get();
assert.equal(mojibake.count, 0, "mojibake detected in imported UTF-8 text");

const publicProblems = db.prepare(`
  SELECT source_id, statement_html_source, statement_html_original
  FROM phors_problems WHERE statement_status='public'
`).all();
let images = 0;
let formulas = 0;
for (const problem of publicProblems) {
  const source = load(`<body>${problem.statement_html_source}</body>`);
  const rendered = load(`<body>${problem.statement_html_original}</body>`);
  const normalize = (value) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(normalize(rendered("body").text()), normalize(source("body").text()), `${problem.source_id}: visible text changed during sanitization`);
  assert.equal(rendered("script,style,iframe,object,embed,form,input,button,textarea,select,noscript").length, 0, `${problem.source_id}: unsafe element retained`);
  assert.equal(rendered("[onerror],[onclick],[onload],[style]").length, 0, `${problem.source_id}: unsafe attribute retained`);
  assert.equal(rendered("img").length, source("img").length, `${problem.source_id}: image count changed`);
  images += rendered("img").length;
  formulas += (problem.statement_html_original.match(/\$/g) ?? []).length;
}
assert.ok(images > 0, "expected preserved statement images");
assert.ok(formulas > 0, "expected preserved TeX formulas");

const relational = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM phors_problem_parts) AS parts,
    (SELECT COUNT(*) FROM phors_tags) AS tags,
    (SELECT COUNT(*) FROM phors_problem_tags) AS problem_tags,
    (SELECT COUNT(*) FROM phors_problem_parts pp LEFT JOIN phors_problems p ON p.id=pp.problem_id WHERE p.id IS NULL) AS orphan_parts,
    (SELECT COUNT(*) FROM phors_problem_tags pt LEFT JOIN phors_problems p ON p.id=pt.problem_id LEFT JOIN phors_tags t ON t.id=pt.tag_id WHERE p.id IS NULL OR t.id IS NULL) AS orphan_tags
`).get();
assert.equal(relational.orphan_parts, 0);
assert.equal(relational.orphan_tags, 0);

console.log(JSON.stringify({
  status: "valid",
  db: dbPath,
  exams: exams.length,
  problems: totals.problems,
  publicStatements: totals.public_statements,
  authenticationRequired: totals.authentication_required,
  parts: relational.parts,
  tags: relational.tags,
  problemTags: relational.problem_tags,
  preservedImages: images,
  texDelimiterCharacters: formulas,
}, null, 2));
db.close();
