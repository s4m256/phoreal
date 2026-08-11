import test from "node:test";
import assert from "node:assert/strict";
import { isStatementPartHeading } from "../app/lib/statement-headings.mjs";

test("recognizes both short and descriptive part headings", () => {
  for (const heading of ["Parte B", "Parte A.", "Parte C: Óptica", "Parte D. Processo de avalanche (2.5 pontos)"]) {
    assert.equal(isStatementPartHeading(heading), true, heading);
  }
  for (const prose of ["Parte baixa do aparato", "A parte B da resposta", "Partes A e B"]) {
    assert.equal(isStatementPartHeading(prose), false, prose);
  }
});
