import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { catalogCounts, openCatalog, upsertExamCatalog } from "../lib/phors/database.mjs";
import { parseExamPage, parseProblemPage } from "../lib/phors/parser.mjs";

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
<html><body>
<a class="navi-link" href="/p/4001"><span class="label">T</span></a>
<a class="navi-link" href="/p/4001/s"><span class="label">S</span></a>
<p><a name="row10"></a><span class="label label-lg label-primary">A1<sup>&nbsp;0.70</sup></span> Calcule a força.</p>
<p><a name="row11"></a><span class="label label-lg label-primary">B1</span> Explique o resultado.</p>
</body></html>`;

test("parses XY round metadata and preserves every tag", () => {
  const parsed = parseExamPage(examHtml, "https://xy.pho.rs/X24");
  assert.equal(parsed.exam.code, "X24");
  assert.equal(parsed.exam.series, "X");
  assert.equal(parsed.exam.year, 2023);
  assert.equal(parsed.problems[0].sourceId, "4001");
  assert.equal(parsed.problems[0].kind, "theoretical");
  assert.deepEqual(parsed.problems[0].tags, ["Термодинамика", "Явления переноса", "X"]);
  assert.equal(parsed.problems[0].solutionUrl, "https://pho.rs/p/4001/s");
  assert.equal(parsed.problems[0].statementPdfUrl, "https://pho.rs/b/p/10/pdf");
});

test("rejects non-XY exam pages", () => {
  assert.throws(() => parseExamPage(examHtml, "https://pho.rs/p/4001"), /Expected one XY exam URL/);
});

test("reads structured parts and only trusts explicit sup scores", () => {
  const parsed = parseProblemPage(problemHtml, "https://pho.rs/p/4001");
  assert.equal(parsed.partsStatus, "structured");
  assert.deepEqual(parsed.parts.map((part) => [part.code, part.score, part.scoreReliability]), [
    ["A1", 0.7, "explicit_html"], ["B1", null, null],
  ]);
});

test("database upserts are idempotent", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "phors-xy-"));
  const db = openCatalog(path.join(directory, "catalog.sqlite"));
  try {
    const catalog = parseExamPage(examHtml, "https://xy.pho.rs/X24");
    Object.assign(catalog.problems[0], parseProblemPage(problemHtml, catalog.problems[0].sourceUrl));
    upsertExamCatalog(db, catalog, "2026-08-08T00:00:00.000Z");
    upsertExamCatalog(db, catalog, "2026-08-08T00:01:00.000Z");
    assert.deepEqual(catalogCounts(db), { competitions: 1, exams: 1, problems: 1, problemParts: 2, tags: 3, problemTags: 3 });
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
