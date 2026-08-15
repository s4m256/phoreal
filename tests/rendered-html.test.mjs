import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("keeps the dashboard essential and exports compact AI feedback",async()=>{
  const [dashboard,route]=await Promise.all([read("app/components/Dashboard.tsx"),read("app/api/export/json/route.ts")]);
  assert.match(dashboard,/Questões resolvidas/);assert.match(dashboard,/Questões resolvidas por dia/);assert.match(dashboard,/Questões resolvidas por tag/);
  assert.match(dashboard,/STUDY_START = new Date\(2026, 4, 2\)/);assert.match(dashboard,/TBF_DATE = new Date\(2027, 1, 19\)/);assert.match(dashboard,/Baixar dados para IA/);
  assert.match(route,/purpose:"feedback de treino por IA"/);assert.match(route,/item_seconds/);assert.doesNotMatch(route,/readFullExportData|statement_html|solution_html/);
});

test("separates X and Y and shows compact completion states",async()=>{
  const catalog=await read("app/components/Catalog.tsx");assert.match(catalog,/\["X","Y"\]/);assert.match(catalog,/compareProblemCodes/);assert.match(catalog,/completed===1\?"concluída"/);assert.match(catalog,/data\.taiwanAttempts/);assert.doesNotMatch(catalog,/Abrir|Página original/);
});

test("uses the personal training shell",async()=>{
  const [layout,page,pkg]=await Promise.all([read("app/layout.tsx"),read("app/page.tsx"),read("package.json")]);assert.match(layout,/Treino de Física/);assert.match(layout,/href="\/problemas">Problemas/);assert.match(layout,/Entrar com ChatGPT/);assert.match(page,/Dashboard/);assert.doesNotMatch(`${layout}${page}${pkg}`,/codex-preview|SkeletonPreview/);
});

test("loads corrected Taiwan 10 with figures, parts and full training UI",async()=>{
  const [page,workspace,raw]=await Promise.all([read("app/problemas/taiwan/10/[number]/page.tsx"),read("app/components/TaiwanProblemWorkspace.tsx"),read("data/taiwan/volume-10.json")]);const data=JSON.parse(raw);
  assert.equal(data.schema_version,2);assert.equal(data.problems.length,31);assert.equal(data.problems.reduce((sum,problem)=>sum+problem.parts.length,0),184);assert.equal(data.problems.reduce((sum,problem)=>sum+((problem.statement_html+(problem.solution_html||"")).match(/taiwan-figure/g)||[]).length,0),72);
  assert.ok(data.problems.every((problem)=>problem.title_pt&&problem.statement_html));assert.doesNotMatch(raw,/<br><br>tial/);assert.match(page,/TaiwanProblemWorkspace/);assert.match(workspace,/onPartClick=\{selectPart\}/);assert.match(workspace,/Mostrar resposta/);assert.match(workspace,/api\/taiwan\/attempts/);
});

test("clicking an XY item creates or resumes an attempt",async()=>{
  const [workspace,attempts,timer,math]=await Promise.all([read("app/components/ProblemWorkspace.tsx"),read("app/api/attempts/route.ts"),read("app/api/attempts/[id]/timer/route.ts"),read("app/components/MathContent.tsx")]);assert.match(attempts,/'in_progress','paused'/);assert.match(timer,/Selecione um item para começar/);assert.match(workspace,/postJson\("\/api\/attempts",\{problemId\}\)/);assert.match(workspace,/onPartClick=\{selectPart\}/);assert.match(math,/statement-part-button/);assert.doesNotMatch(workspace,/parts-panel|Selecione o que está trabalhando|Página original|Leitura inicial/);
});

test("keeps math, answer and brown-noise controls isolated",async()=>{
  const [workspace,noise,math,renderer,solutionRoute,css]=await Promise.all([read("app/components/ProblemWorkspace.tsx"),read("app/components/BrownNoiseButton.tsx"),read("app/components/MathContent.tsx"),read("app/lib/render-statement-math.mjs"),read("app/api/problems/[id]/solution/route.ts"),read("app/problem-focus.css")]);
  assert.match(math,/normalizeMathMarkup/);assert.match(renderer,/katex\.renderToString/);assert.match(workspace,/Mostrar resposta/);assert.match(solutionRoute,/renderStatementMath/);assert.match(noise,/gain\.gain\.value=0\.3/);assert.match(noise,/ambient-noise-toggle/);assert.match(css,/\.ambient-noise-toggle/);assert.doesNotMatch(workspace,/createBuffer|noise-toggle/);
});

test("keeps timer and hint controls concise",async()=>{
  const [workspace,timer,math]=await Promise.all([read("app/components/ProblemWorkspace.tsx"),read("app/api/attempts/[id]/timer/route.ts"),read("app/components/MathContent.tsx")]);assert.match(workspace,/Descartar somente o intervalo atual/);assert.match(workspace,/className="timer-discard"/);assert.match(workspace,/Escreva sua dúvida e pressione Enter/);assert.match(workspace,/className="timer-collapsed"/);assert.match(timer,/action === "discard_current"/);assert.match(math,/isStatementPartHeading/);assert.doesNotMatch(workspace,/PROBLEM_TIME_BUDGET|allocatePartTimeLimits|Pedir hint|hint-rule|className="shortcuts"/);
});

test("mock exams start with three questions and support editing",async()=>{
  const [component,route]=await Promise.all([read("app/components/MockExams.tsx"),read("app/api/mock-exams/route.ts")]);assert.match(component,/\[1,2,3\]/);assert.match(component,/editingId \? "PATCH" : "POST"/);assert.match(component,/Notas brutas; as escalas podem variar/);assert.match(route,/export async function PATCH/);assert.match(route,/WHERE id=\? AND owner_id=\?/);
});
