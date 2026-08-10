import { DatabaseSync } from "node:sqlite";
import { renderStatementMath } from "../app/lib/render-statement-math.mjs";

const path = process.argv[2] || "data/phors-full.sqlite";
const db = new DatabaseSync(path,{readOnly:true});
const rows = db.prepare(`
  SELECT id,source_id,code,statement_html_original,statement_html_pt,
         statement_content_hash,translation_source_hash,translation_status
  FROM phors_problems
  WHERE (statement_html_pt IS NOT NULL AND statement_html_pt<>'')
     OR (statement_html_original IS NOT NULL AND statement_html_original<>'')
  ORDER BY id
`).all();
const failures = [];
let formulas = 0;
let translated = 0;
for (const row of rows) {
  const useTranslation = ["draft","verified"].includes(row.translation_status)
    && row.translation_source_hash===row.statement_content_hash
    && Boolean(row.statement_html_pt);
  if (useTranslation) translated++;
  const renderErrors = [];
  const rendered = renderStatementMath(useTranslation ? row.statement_html_pt : row.statement_html_original,{onError:(error)=>renderErrors.push(error)});
  const count = (rendered.match(/class="katex(?:-display)?"/g)||[]).length;
  formulas += count;
  if (renderErrors.length) failures.push({id:row.id,sourceId:row.source_id,code:row.code,errors:renderErrors});
}
console.log(JSON.stringify({problems:rows.length,translated,formulas,failures},null,2));
if (failures.length) process.exitCode = 1;
