import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
test("replaces the starter with the training product shell",async()=>{const [layout,page,css,pkg]=await Promise.all([read("app/layout.tsx"),read("app/page.tsx"),read("app/globals.css"),read("package.json")]);assert.match(layout,/Treino de Física/);assert.match(layout,/Catálogo XY/);assert.match(page,/Dashboard/);assert.match(css,/timer-card/);assert.doesNotMatch(`${layout}${page}${pkg}`,/codex-preview|react-loading-skeleton|SkeletonPreview/)});
test("contains the complete MVP routes",async()=>{const files=await Promise.all(["app/components/ProblemWorkspace.tsx","app/components/MockExams.tsx","app/api/attempts/route.ts","app/api/attempts/[id]/timer/route.ts","app/api/export/json/route.ts","app/api/export/csv/route.ts"].map(read));const source=files.join("\n");for(const marker of ["initial_reading","item_active","FINALIZAR QUESTÃO","problemScores","timeSegments","text/csv"])assert.match(source,new RegExp(marker));assert.doesNotMatch(source,/hint|ChatGPT API|mastery|streak/i)});
