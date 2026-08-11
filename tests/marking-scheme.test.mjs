import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractStructuredMarking,isStructuredMarking,markingForPart } from "../app/lib/marking-scheme.mjs";

const html=`
<table class="phors-table-markingscheme">
  <tbody>
    <tr><td>Primeiro critério de A1</td><td>0.20</td></tr>
    <tr><td>Segundo critério de A1</td><td>0.30</td></tr>
  </tbody>
  <tbody>
    <tr><td>Único critério de A2</td><td>0.50</td></tr>
  </tbody>
</table>`;

test("marking scheme tbodies map one-to-one to problem part ordinals",()=>{
  const structured=extractStructuredMarking(html);
  assert.equal(isStructuredMarking(structured),true);
  assert.match(markingForPart(structured,1),/Primeiro critério de A1[\s\S]*Segundo critério de A1/);
  assert.doesNotMatch(markingForPart(structured,1),/A2/);
  assert.equal(markingForPart(structured,2),"Único critério de A2 | 0.50 points");
  assert.equal(markingForPart(structured,3),null);
});

test("hint route sends only the active item marking scheme for ordinary hints",async()=>{
  const route=await readFile(new URL("../app/api/attempts/[id]/hints/route.ts",import.meta.url),"utf8");
  assert.match(route,/markingForPart\(source\.marking_text,part\.ordinal\)/);
  assert.match(route,/MARKING SCHEME EXCLUSIVO DO ITEM \$\{part\.code\}:\\n\$\{itemMarking\}/);
  assert.match(route,/solutionReference=asksFull \?/);
  assert.doesNotMatch(route,/\$\{source\.marking_text\}/);
  assert.match(route,/requireAiOwnerApi\(\)/);
  assert.match(route,/Number\(recentHints\?\.count\)>=30/);
});