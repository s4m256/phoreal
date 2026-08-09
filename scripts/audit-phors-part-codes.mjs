import { DatabaseSync } from "node:sqlite";
import { load } from "cheerio";
import { normalizeItemCode } from "../lib/phors/parser.mjs";

const dbPath = process.argv[2] ?? "data/phors-full.sqlite";
const db = new DatabaseSync(dbPath, { readOnly: true });
const problems = db.prepare("SELECT id, source_id, code, statement_html_source FROM phors_problems WHERE statement_html_source IS NOT NULL").all();
const storedParts = db.prepare("SELECT code FROM phors_problem_parts WHERE problem_id = ?");
const missing = [];
const invalid = [];

for (const problem of problems) {
  const $ = load(problem.statement_html_source);
  const labels = [];
  $("span.label.label-lg.label-primary").each((_, element) => {
    const raw = $(element).clone().find("sup").remove().end().text().replace(/\s+/g, " ").trim();
    const code = normalizeItemCode(raw);
    if (/^(?:[A-Z]{1,4}\d+(?:\.\d+)*|\d+(?:\.\d+)*)$/.test(code)) labels.push({ raw, code });
    else invalid.push({ problem: problem.code, sourceId: problem.source_id, raw, normalized: code });
  });
  const stored = new Set(storedParts.all(problem.id).map(({ code }) => code));
  const absent = labels.filter(({ code }) => !stored.has(code));
  if (absent.length) missing.push({ problem: problem.code, sourceId: problem.source_id, absent });
}

const result = {
  problemsAudited: problems.length,
  problemsWithMissingParts: missing.length,
  missingParts: missing.reduce((count, problem) => count + problem.absent.length, 0),
  missing,
  invalidLabels: invalid,
};
console.log(JSON.stringify(result, null, 2));
db.close();
if (missing.length) process.exitCode = 1;
