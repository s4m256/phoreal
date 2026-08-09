import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { load } from "cheerio";

const db = new DatabaseSync(process.argv[2] ?? "data/phors-full.sqlite", { readOnly: true });
const rows = db.prepare(`
  SELECT p.* FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id
  WHERE e.code='X24' ORDER BY p.code
`).all();
assert.equal(rows.length, 9);

const math = /(\$\$.*?\$\$|(?<!\$)\$(?!\$).*?(?<!\$)\$(?!\$)|\\\[.*?\\\]|\\\(.*?\\\))/gs;
const numbers = /[+-]?\d+(?:[.,]\d+)*/g;
const structure = (value) => value.replace(/>[^<]*</gs, "><");
let originalCyrillic = 0;
let translatedCyrillic = 0;

for (const row of rows) {
  assert.ok(["draft", "verified"].includes(row.translation_status), `${row.code}: translation is not available`);
  assert.equal(row.translation_source_hash, row.statement_content_hash, `${row.code}: stale translation`);
  assert.ok(row.title_pt && row.statement_html_pt, `${row.code}: translation missing`);
  assert.equal(structure(row.statement_html_pt), structure(row.statement_html_original), `${row.code}: HTML structure changed`);
  assert.deepEqual(row.statement_html_pt.match(math) ?? [], row.statement_html_original.match(math) ?? [], `${row.code}: TeX changed`);
  assert.deepEqual(row.statement_html_pt.match(numbers) ?? [], row.statement_html_original.match(numbers) ?? [], `${row.code}: numbers changed`);
  const source = load(`<body>${row.statement_html_original}</body>`);
  const translated = load(`<body>${row.statement_html_pt}</body>`);
  assert.deepEqual(translated("img").map((_, image) => translated(image).attr("src")).get(), source("img").map((_, image) => source(image).attr("src")).get(), `${row.code}: images changed`);
  assert.deepEqual(translated(".statement-part-label").map((_, label) => translated(label).text().replace(/\s+/g, " ").trim()).get(), source(".statement-part-label").map((_, label) => source(label).text().replace(/\s+/g, " ").trim()).get(), `${row.code}: item labels changed`);
  originalCyrillic += (row.statement_html_original.match(/[А-Яа-яЁё]/g) ?? []).length;
  translatedCyrillic += (row.statement_html_pt.match(/[А-Яа-яЁё]/g) ?? []).length;
}

const partRows = db.prepare(`
  SELECT pp.source_key,pp.prompt_text,pp.prompt_text_pt
  FROM phors_problem_parts pp JOIN phors_problems p ON p.id=pp.problem_id
  JOIN phors_exams e ON e.id=p.exam_id WHERE e.code='X24'
  ORDER BY p.code,pp.ordinal
`).all();
const sourcePrompts = partRows.filter((part) => part.prompt_text !== null);
for (const part of sourcePrompts) {
  assert.ok(part.prompt_text_pt, `${part.source_key}: translated item prompt missing`);
  assert.deepEqual(part.prompt_text_pt.match(math) ?? [], part.prompt_text.match(math) ?? [], `${part.source_key}: item TeX changed`);
  assert.deepEqual(part.prompt_text_pt.match(numbers) ?? [], part.prompt_text.match(numbers) ?? [], `${part.source_key}: item numbers changed`);
}
const tags = db.prepare(`
  SELECT COUNT(DISTINCT t.id) total,
         COUNT(DISTINCT CASE WHEN t.name_pt IS NOT NULL AND TRIM(t.name_pt)<>'' THEN t.id END) translated
  FROM phors_tags t JOIN phors_problem_tags pt ON pt.tag_id=t.id
  JOIN phors_problems p ON p.id=pt.problem_id
  JOIN phors_exams e ON e.id=p.exam_id WHERE e.code='X24'
`).get();
assert.equal(tags.translated, tags.total, "not every X24 tag was translated");
assert.ok(translatedCyrillic / originalCyrillic < 0.03, "too much Russian text remains in the draft");

console.log(JSON.stringify({
  status: "structurally_valid_translations",
  exam: "X24",
  problems: rows.length,
  parts: partRows.length,
  translatedPrompts: sourcePrompts.length,
  translatedTags: tags.translated,
  verifiedProblems: rows.filter((row) => row.translation_status === "verified").length,
  remainingCyrillicRatio: Number((translatedCyrillic / originalCyrillic).toFixed(4)),
}, null, 2));
db.close();
