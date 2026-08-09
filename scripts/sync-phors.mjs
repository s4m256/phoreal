import { parseArgs } from "node:util";
import { catalogCounts, exportCatalog, finishSyncRun, openCatalog, startSyncRun, upsertExamCatalog } from "../lib/phors/database.mjs";
import { fetchPublicHtml } from "../lib/phors/http.mjs";
import { hashText, parseCatalogIndex, parseExamPage, parseProblemPage } from "../lib/phors/parser.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    db: { type: "string", default: "data/phors.sqlite" }, export: { type: "string" },
    "limit-per-exam": { type: "string" }, "delay-ms": { type: "string", default: "1200" },
    refresh: { type: "boolean", default: false },
    "xy-2018-2026": { type: "boolean", default: false },
  },
});
const requestedUrls = values["xy-2018-2026"]
  ? Array.from({ length: 9 }, (_, index) => 18 + index).flatMap((year) => [`https://xy.pho.rs/X${year}`, `https://xy.pho.rs/Y${year}`])
  : positionals;
if (!requestedUrls.length) throw new Error("Provide one or more XY exam URLs, for example https://xy.pho.rs/Y25");
for (const rawUrl of requestedUrls) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== "xy.pho.rs" || !/^\/[WXY]\d{2}\/?$/i.test(url.pathname)) throw new Error(`Only XY exam URLs are accepted: ${rawUrl}`);
}
const limit = values["limit-per-exam"] == null ? Infinity : Number(values["limit-per-exam"]);
if (!(limit >= 0)) throw new Error("--limit-per-exam must be a non-negative number");
const delayMs = Number(values["delay-ms"]);
if (!(delayMs >= 1000)) throw new Error("--delay-ms must be at least 1000");

const db = openCatalog(values.db);
const startedAt = new Date().toISOString();
const runId = startSyncRun(db, requestedUrls, startedAt);
const stats = { examPagesFetched: 0, problemPagesFetched: 0, importedProblems: 0, publicStatements: 0, authenticationRequired: 0 };
try {
  const catalogIndex = values["xy-2018-2026"]
    ? parseCatalogIndex(await fetchPublicHtml("https://xy.pho.rs/", { delayMs, refresh: values.refresh }))
    : new Map();
  for (const examUrl of requestedUrls) {
    const examHtml = await fetchPublicHtml(examUrl, { delayMs, refresh: values.refresh });
    stats.examPagesFetched += 1;
    const catalog = parseExamPage(examHtml, examUrl);
    for (const indexed of catalogIndex.get(catalog.exam.code) ?? []) {
      if (!catalog.problems.some((problem) => problem.sourceId === indexed.sourceId)) catalog.problems.push(indexed);
    }
    catalog.problems = catalog.problems.slice(0, limit);
    for (const problem of catalog.problems) {
      if (!problem.statementUrl) continue;
      let problemHtml;
      try {
        problemHtml = await fetchPublicHtml(problem.statementUrl, { delayMs, refresh: values.refresh });
      } catch (error) {
        if (error?.code !== "AUTHENTICATION_REQUIRED") throw error;
        problem.statementStatus = "authentication_required";
        problem.partsStatus = "not_available";
        stats.authenticationRequired += 1;
        continue;
      }
      stats.problemPagesFetched += 1;
      const details = parseProblemPage(problemHtml, problem.sourceUrl);
      Object.assign(problem, {
        statementUrl: details.statementUrl ?? problem.statementUrl,
        solutionUrl: details.solutionUrl ?? problem.solutionUrl,
        markingSchemeUrl: details.markingSchemeUrl ?? problem.markingSchemeUrl,
        parts: details.parts, partsStatus: details.partsStatus,
        statementHtmlSource: details.statementHtmlSource,
        statementHtmlOriginal: details.statementHtmlOriginal,
        statementTextOriginal: details.statementTextOriginal,
        statementContentHash: details.statementContentHash,
        statementLanguage: details.statementLanguage,
        statementStatus: details.statementStatus,
        sourceHash: hashText(`${problem.sourceHash}:${details.sourceHash}`),
      });
      if (details.statementStatus === "public") stats.publicStatements += 1;
    }
    upsertExamCatalog(db, catalog, startedAt);
    stats.importedProblems += catalog.problems.length;
    console.log(`${catalog.exam.code}: ${catalog.problems.length} problemas importados`);
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
