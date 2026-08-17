import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderStatementMath } from "../app/lib/render-statement-math.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const catalog=JSON.parse(await readFile(path.join(root,"data/taiwan/catalog.json"),"utf8"));
const manifest=JSON.parse(await readFile(path.join(root,"data/taiwan/import-manifest.json"),"utf8"));
const expected={problems:296,parts:1747,images:349,solutions:291};
const totals={problems:0,parts:0,images:0,solutions:0,formulas:0};
const mathErrors=[];
const imageRefs=[];

assert.equal(catalog.schema_version,1);
assert.equal(catalog.volumes.length,10);
assert.deepEqual(catalog.volumes.map((volume)=>volume.volume),[1,2,3,4,5,6,7,8,9,10]);

for(const volume of catalog.volumes){
  const ids=new Set(),codes=new Set();
  for(const problem of volume.problems){
    totals.problems++;
    assert.ok(problem.title_pt?.trim(),`Título ausente: Taiwan ${volume.volume}/${problem.id}`);
    assert.ok(problem.statement_html?.trim(),`Enunciado ausente: Taiwan ${volume.volume}/${problem.id}`);
    assert.ok(problem.page_start>0&&problem.page_end>=problem.page_start,`Páginas inválidas: Taiwan ${volume.volume}/${problem.id}`);
    assert.ok(!ids.has(problem.id)&&!codes.has(problem.code),`Problema duplicado: Taiwan ${volume.volume}/${problem.id}`);
    ids.add(problem.id);codes.add(problem.code);
    assert.ok(problem.parts.length>0,`Sem itens: Taiwan ${volume.volume}/${problem.id}`);
    const partCodes=new Set();
    for(const [index,part] of problem.parts.entries()){
      totals.parts++;
      assert.equal(part.ordinal,index+1,`Ordem de item inválida: Taiwan ${volume.volume}/${problem.id}`);
      assert.ok(part.code&&!partCodes.has(part.code),`Item duplicado: Taiwan ${volume.volume}/${problem.id}/${part.code}`);
      partCodes.add(part.code);
    }
    if(problem.solution_html)totals.solutions++;
    const statementImages=[...problem.statement_html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match)=>match[1]);
    const solutionImages=[...(problem.solution_html||"").matchAll(/<img[^>]+src="([^"]+)"/g)].map((match)=>match[1]);
    for(const image of statementImages){assert.ok(!solutionImages.includes(image),`Imagem duplicada entre enunciado e solução: ${image}`);}
    imageRefs.push(...statementImages,...solutionImages);totals.images+=statementImages.length+solutionImages.length;
    const raw=`${problem.statement_html}\n${problem.solution_html||""}`;
    assert.doesNotMatch(raw,/<p>\s*<(?:h[1-6]|section|figure|ul|ol)|<\/(?:h[1-6]|section|figure|ul|ol)>\s*<\/p>|@@(?:BLOCK|MATH)|\\(?:sourcefig|begin\{questionitem\}|begin\{solutionitem\}|begin\{tabular\})/);
    renderStatementMath(raw,{onFormula:()=>totals.formulas++,onError:(error)=>mathErrors.push({volume:volume.volume,problem:problem.id,...error})});
  }
}

assert.deepEqual({...totals,formulas:undefined},{...expected,formulas:undefined});
assert.equal(manifest.volumes.reduce((sum,volume)=>sum+volume.problems,0),expected.problems);
assert.equal(manifest.volumes.reduce((sum,volume)=>sum+volume.parts,0),expected.parts);
assert.equal(manifest.volumes.reduce((sum,volume)=>sum+volume.images,0),expected.images);
assert.equal(manifest.volumes.reduce((sum,volume)=>sum+volume.solutions,0),expected.solutions);
for(const image of imageRefs)await access(path.join(root,"public",image.replace(/^\//,"")));
assert.deepEqual(mathErrors,[],`Erros de LaTeX:\n${JSON.stringify(mathErrors.slice(0,20),null,2)}`);
console.log(JSON.stringify({status:"ok",...expected,formulas:totals.formulas}));
