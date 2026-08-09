import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { load } from "cheerio";

const db = new DatabaseSync(process.argv[2] ?? "data/phors-full.sqlite", { readOnly: true });
const selectedIds = (process.argv[3] ?? "").split(",").filter(Boolean).map(Number);
const where = selectedIds.length ? `p.id IN (${selectedIds.map(() => "?").join(",")})` : "e.code='X24'";
const rows = db.prepare(`
  SELECT p.*,e.code AS exam_code FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id
  WHERE ${where} ORDER BY e.code,p.code
`).all(...selectedIds);
assert.ok(rows.length, "no translated problems selected");
if (!selectedIds.length) assert.equal(rows.length, 9);

const math = /(\$\$.*?\$\$|(?<!\$)\$(?!\$).*?(?<!\$)\$(?!\$)|\\\[.*?\\\]|\\\(.*?\\\))/gs;
const numbers = /[+-]?\d+(?:[.,]\d+)*/g;
const structure = (value) => value.replace(/>[^<]*</gs, "><");
const texCommands = (value) => value.match(/\\[A-Za-z]+/g) ?? [];
const delimiter = (value) => value.startsWith("$$") ? "$$" : value.startsWith("$") ? "$" : value.startsWith("\\[") ? "\\[]" : "\\()";
function assertSafeMath(source, translated, label) {
  const sourceMath = source.match(math) ?? [];
  const translatedMath = translated.match(math) ?? [];
  assert.equal(translatedMath.length, sourceMath.length, `${label}: TeX expression count changed`);
  const signature = (value) => JSON.stringify({
    delimiter: delimiter(value),
    commands: texCommands(value),
    numbers: value.match(numbers) ?? [],
    grouping: Object.fromEntries(Array.from("{}[]()", (character) => [character, value.split(character).length - 1])),
  });
  assert.deepEqual(translatedMath.map(signature).sort(), sourceMath.map(signature).sort(), `${label}: TeX structure changed`);
}
let originalCyrillic = 0;
let translatedCyrillic = 0;

for (const row of rows) {
  assert.ok(["draft", "verified"].includes(row.translation_status), `${row.code}: translation is not available`);
  assert.equal(row.translation_source_hash, row.statement_content_hash, `${row.code}: stale translation`);
  assert.ok(row.title_pt && row.statement_html_pt, `${row.code}: translation missing`);
  assert.equal(structure(row.statement_html_pt), structure(row.statement_html_original), `${row.code}: HTML structure changed`);
  assertSafeMath(row.statement_html_original, row.statement_html_pt, `${row.exam_code}-${row.code}`);
  assert.deepEqual(row.statement_html_pt.match(numbers) ?? [], row.statement_html_original.match(numbers) ?? [], `${row.code}: numbers changed`);
  const source = load(`<body>${row.statement_html_original}</body>`);
  const translated = load(`<body>${row.statement_html_pt}</body>`);
  assert.deepEqual(translated("img").map((_, image) => translated(image).attr("src")).get(), source("img").map((_, image) => source(image).attr("src")).get(), `${row.code}: images changed`);
  assert.deepEqual(translated(".statement-part-label").map((_, label) => translated(label).text().replace(/\s+/g, " ").trim()).get(), source(".statement-part-label").map((_, label) => source(label).text().replace(/\s+/g, " ").trim()).get(), `${row.code}: item labels changed`);
  originalCyrillic += (row.statement_html_original.match(/[А-Яа-яЁё]/g) ?? []).length;
  translatedCyrillic += (row.statement_html_pt.match(/[А-Яа-яЁё]/g) ?? []).length;
}

const problemIds = rows.map((row) => row.id);
const partRows = db.prepare(`
  SELECT pp.source_key,pp.prompt_text,pp.prompt_text_pt
  FROM phors_problem_parts pp JOIN phors_problems p ON p.id=pp.problem_id
  WHERE p.id IN (${problemIds.map(() => "?").join(",")})
  ORDER BY p.code,pp.ordinal
`).all(...problemIds);
const sourcePrompts = partRows.filter((part) => part.prompt_text !== null);
for (const part of sourcePrompts) {
  assert.ok(part.prompt_text_pt, `${part.source_key}: translated item prompt missing`);
  assertSafeMath(part.prompt_text, part.prompt_text_pt, part.source_key);
  assert.deepEqual(part.prompt_text_pt.match(numbers) ?? [], part.prompt_text.match(numbers) ?? [], `${part.source_key}: item numbers changed`);
}
const tags = db.prepare(`
  SELECT DISTINCT t.id,t.name,t.name_pt
  FROM phors_tags t JOIN phors_problem_tags pt ON pt.tag_id=t.id
  JOIN phors_problems p ON p.id=pt.problem_id
  WHERE p.id IN (${problemIds.map(() => "?").join(",")})
`).all(...problemIds).filter((tag) => /[\u0400-\u04ff]/.test(tag.name));
assert.ok(tags.every((tag) => tag.name_pt?.trim()), "not every selected Russian tag was translated");
assert.ok(translatedCyrillic / originalCyrillic < 0.03, "too much Russian text remains in the draft");

console.log(JSON.stringify({
  status: "structurally_valid_translations",
  exams: [...new Set(rows.map((row) => row.exam_code))],
  problems: rows.length,
  parts: partRows.length,
  translatedPrompts: sourcePrompts.length,
  translatedTags: tags.length,
  verifiedProblems: rows.filter((row) => row.translation_status === "verified").length,
  remainingCyrillicRatio: Number((translatedCyrillic / originalCyrillic).toFixed(4)),
}, null, 2));
db.close();
