import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { selectedProblemArea, selectedProblemSourceIds } from "../app/lib/selected-problems.mjs";

test("the three study materials select 31 XY catalog problems", () => {
  const ids = selectedProblemSourceIds();
  assert.equal(ids.length, 31);
  assert.equal(new Set(ids).size, 31);
  assert.equal(selectedProblemArea(3148), "Mecânica");
  assert.equal(selectedProblemArea(4222), "Eletromagnetismo");
  assert.equal(selectedProblemArea(4557), "Termodinâmica");

  const catalog = JSON.parse(fs.readFileSync(new URL("../data/phors-catalog.json", import.meta.url), "utf8"));
  const catalogIds = new Set(catalog.problems.map((problem) => String(problem.source_id)));
  assert.deepEqual(ids.filter((id) => !catalogIds.has(id)), []);
});
