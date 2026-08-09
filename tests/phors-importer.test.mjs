import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { catalogCounts, openCatalog, upsertExamCatalog } from "../lib/phors/database.mjs";
import { parseCatalogIndex, parseExamPage, parseProblemPage } from "../lib/phors/parser.mjs";

const examHtml = `
<html><head><title>Pho.rs XY</title></head><body>
<h3>Квалификационные сборы X24, август 2023</h3>
<table><tbody><tr>
  <td><span class="label">T1</span></td><td></td>
  <td><a href="//pho.rs/p/4001">Физика дождевых капель</a>
    <span class="text-muted font-weight-bold d-block">
      Термодинамика <span class="label label-dot"></span>
      Явления переноса <span class="label label-dot"></span>
      X <span class="label label-dot"></span>
    </span>
  </td>
  <td><a href="//pho.rs/p/4001">T</a><a href="//pho.rs/p/4001/s">S</a><a href="//pho.rs/p/4001/m">M</a></td>
  <td><a href="//pho.rs/b/p/10/pdf">Условие</a></td>
</tr></tbody></table></body></html>`;

const problemHtml = `
<html><body><main class="content"><div class="card card-custom gutter-b"><div class="card-body">
<a class="navi-link" href="/p/4001"><span class="label">T</span></a>
<a class="navi-link" href="/p/4001/s"><span class="label">S</span></a>
<p><a name="row10"></a><span class="label label-lg label-primary">A1<sup>&nbsp;0.70</sup></span> Рассчитайте силу $F$.</p>
<p><a name="row11"></a><span class="label label-lg label-primary">B1</span> Explique o resultado.</p>
<p><img src=" //pho.rs/p/img/10/task " onerror="alert(1)" style="width:300px"></p>
</div></div></main><script>alert(1)</script></body></html>`;

const indexHtml = `
<div class="card card-custom gutter-b">
  <div class="card-header"><a href="//xy.pho.rs/X23">X23</a></div>
  <div class="card-body"><div class="tab-content"><div class="form">
    <div class="d-flex align-items-center pb-9">
      <span class="label label-primary">E2</span>
      <div><a href="//pho.rs/p/3155">Чёткая оптика</a></div>
    </div>
  </div></div></div>
</div>`;

test("parses XY round metadata and preserves every tag", () => {
  const parsed = parseExamPage(examHtml, "https://xy.pho.rs/X24");
  assert.equal(parsed.exam.code, "X24");
  assert.equal(parsed.exam.series, "X");
  assert.equal(parsed.exam.year, 2024);
  assert.equal(parsed.problems[0].sourceId, "4001");
  assert.equal(parsed.problems[0].kind, "theoretical");
  assert.deepEqual(parsed.problems[0].tags, ["Термодинамика", "Явления переноса", "X"]);
  assert.equal(parsed.problems[0].solutionUrl, "https://pho.rs/p/4001/s");
  assert.equal(parsed.problems[0].statementPdfUrl, "https://pho.rs/b/p/10/pdf");
});

test("rejects non-XY exam pages", () => {
  assert.throws(() => parseExamPage(examHtml, "https://pho.rs/p/4001"), /Expected one XY exam URL/);
});

test("uses the XY index to retain catalog entries omitted from a round page", () => {
  const index = parseCatalogIndex(indexHtml);
  assert.deepEqual(index.get("X23").map((problem) => ({
    code: problem.code,
    sourceId: problem.sourceId,
    title: problem.title,
    sourceUrl: problem.sourceUrl,
  })), [{ code: "E2", sourceId: "3155", title: "Чёткая оптика", sourceUrl: "https://pho.rs/p/3155" }]);
});

test("reads complete content, structured parts, and only explicit scores", () => {
  const parsed = parseProblemPage(problemHtml, "https://pho.rs/p/4001");
  assert.equal(parsed.partsStatus, "structured");
  assert.deepEqual(parsed.parts.map((part) => [part.code, part.score, part.scoreReliability]), [
    ["A1", 0.7, "explicit_html"], ["B1", null, null],
  ]);
  assert.match(parsed.statementHtmlSource, /Рассчитайте силу/);
  assert.match(parsed.statementHtmlOriginal, /https:\/\/pho\.rs\/p\/img\/10\/task/);
  assert.doesNotMatch(parsed.statementHtmlOriginal, /onerror|style=|<script/);
  assert.equal(parsed.imageCount, 1);
  assert.equal(parsed.statementLanguage, "ru");
  assert.match(parsed.statementContentHash, /^[a-f0-9]{64}$/);
});

test("database upserts are idempotent without replacing stable part ids", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "phors-xy-"));
  const db = openCatalog(path.join(directory, "catalog.sqlite"));
  try {
    const catalog = parseExamPage(examHtml, "https://xy.pho.rs/X24");
    Object.assign(catalog.problems[0], parseProblemPage(problemHtml, catalog.problems[0].sourceUrl));
    upsertExamCatalog(db, catalog, "2026-08-08T00:00:00.000Z");
    const partId = db.prepare("SELECT id FROM phors_problem_parts WHERE source_key='row10'").get().id;
    upsertExamCatalog(db, catalog, "2026-08-08T00:01:00.000Z");
    assert.equal(db.prepare("SELECT id FROM phors_problem_parts WHERE source_key='row10'").get().id, partId);
    assert.deepEqual(catalogCounts(db), { competitions: 1, exams: 1, problems: 1, problemParts: 2, tags: 3, problemTags: 3 });
    const saved = db.prepare("SELECT statement_content_hash, statement_html_original FROM phors_problems").get();
    assert.equal(saved.statement_content_hash, catalog.problems[0].statementContentHash);
    assert.match(saved.statement_html_original, /Рассчитайте силу/);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
