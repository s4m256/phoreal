import { parseArgs } from "node:util";
import { catalogCounts, exportCatalog, finishSyncRun, openCatalog, startSyncRun, upsertExamCatalog } from "../lib/phors/database.mjs";
import { fetchPublicHtml } from "../lib/phors/http.mjs";
import { hashText, parseExamPage, parseProblemPage } from "../lib/phors/parser.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    db: { type: "string", default: "data/phors.sqlite" }, export: { type: "string" },
    "limit-per-exam": { type: "string" }, "delay-ms": { type: "string", default: "1200" },
    refresh: { type: "boolean", default: false },
  },
});
if (!positionals.length) throw new Error("Provide one or more XY exam URLs, for example https://xy.pho.rs/Y25");
for (const rawUrl of positionals) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== "xy.pho.rs" || !/^\/[WXY]\d{2}\/?$/i.test(url.pathname)) throw new Error(`Only XY exam URLs are accepted: ${rawUrl}`);
}
const limit = values["limit-per-exam"] == null ? Infinity : Number(values["limit-per-exam"]);
if (!(limit >= 0)) throw new Error("--limit-per-exam must be a non-negative number");
const delayMs = Number(values["delay-ms"]);
if (!(delayMs >= 1000)) throw new Error("--delay-ms must be at least 1000");

const db = openCatalog(values.db);
const startedAt = new Date().toISOString();
const runId = startSyncRun(db, positionals, startedAt);
const stats = { examPagesFetched: 0, problemPagesFetched: 0, importedProblems: 0 };
try {
  for (const examUrl of positionals) {
    const examHtml = await fetchPublicHtml(examUrl, { delayMs, refresh: values.refresh });
    stats.examPagesFetched += 1;
    const catalog = parseExamPage(examHtml, examUrl);
    catalog.problems = catalog.problems.slice(0, limit);
    for (const problem of catalog.problems) {
      if (!problem.statementUrl) continue;
      const problemHtml = await fetchPublicHtml(problem.statementUrl, { delayMs, refresh: values.refresh });
      stats.problemPagesFetched += 1;
      const details = parseProblemPage(problemHtml, problem.sourceUrl);
      Object.assign(problem, {
        statementUrl: details.statementUrl ?? problem.statementUrl,
        solutionUrl: details.solutionUrl ?? problem.solutionUrl,
        markingSchemeUrl: details.markingSchemeUrl ?? problem.markingSchemeUrl,
        parts: details.parts, partsStatus: details.partsStatus,
        sourceHash: hashText(`${problem.sourceHash}:${details.sourceHash}`),
      });
    }
    upsertExamCatalog(db, catalog, startedAt);
    stats.importedProblems += catalog.problems.length;
  }
  Object.assign(stats, catalogCounts(db));
  finishSyncRun(db, runId, "succeeded", stats);
  if (values.export) exportCatalog(db, values.export);
  console.log(JSON.stringify({ status: "succeeded", db: values.db, export: values.export ?? null, stats }, null, 2));
} catch (error) {
  finishSyncRun(db, runId, "failed", stats, error instanceof Error ? error.message : String(error));
  throw error;
} finally {
  db.close();
}
