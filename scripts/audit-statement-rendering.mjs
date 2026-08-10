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
const remainingCyrillic = new Map();
let formulas = 0;
let translated = 0;
for (const row of rows) {
  const useTranslation = ["draft","verified"].includes(row.translation_status)
    && row.translation_source_hash===row.statement_content_hash
    && Boolean(row.statement_html_pt);
  if (useTranslation) translated++;
  const renderErrors = [];
  const rendered = renderStatementMath(useTranslation ? row.statement_html_pt : row.statement_html_original,{
    onError:(error)=>renderErrors.push(error),
    onFormula:({formula})=>{
      for (const token of formula.match(/[А-Яа-яЁё]+/gu)||[]) {
        const entry = remainingCyrillic.get(token)||{count:0,problems:new Set(),sample:formula.slice(0,240)};
        entry.count++; entry.problems.add(row.id); remainingCyrillic.set(token,entry);
      }
    },
  });
  const count = (rendered.match(/class="katex(?:-display)?"/g)||[]).length;
  formulas += count;
  if (renderErrors.length) failures.push({id:row.id,sourceId:row.source_id,code:row.code,errors:renderErrors});
}
const remainingCyrillicTokens = [...remainingCyrillic.entries()].map(([token,value])=>({token,count:value.count,problems:[...value.problems],sample:value.sample})).sort((a,b)=>b.count-a.count||a.token.localeCompare(b.token));
const catalogUnitTokens = new Set(["мкМ","дБ","дптр","См","эВ","Вб","кВт","кДж","МВт","мК","мПа","Мпа","нГн","пс","фс","ч","суток","руб","оборот","пк","кпк"]);
const untranslatedUnits = remainingCyrillicTokens.filter(({token})=>catalogUnitTokens.has(token));
console.log(JSON.stringify({problems:rows.length,translated,formulas,failures,untranslatedUnits,remainingCyrillicTokens},null,2));
if (failures.length || untranslatedUnits.length) process.exitCode = 1;
