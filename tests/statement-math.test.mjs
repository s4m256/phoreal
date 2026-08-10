import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhysicsUnits } from "../app/lib/physics-math.mjs";
import { renderStatementMath } from "../app/lib/render-statement-math.mjs";

test("renders split formulas and translates Cyrillic SI units",()=>{
  const html = renderStatementMath(String.raw`<p>$$<br>E=2~\text{Дж/м}^2<br>$$</p><p>$f=10~\text{кГц}$, $R=2~\text{МОм}$, $d=3~\mathrm{мкм}$</p>`);
  assert.match(html,/class="katex"/);
  assert.doesNotMatch(html,/katex-error|Дж|кГц|МОм|мкм|\$\$/);
});

test("does not nest math commands inside text mode",()=>{
  const normalized = normalizePhysicsUnits(String.raw`\text{Дж/м}^2+\text{Ом}^{-1}+\text г`);
  assert.doesNotMatch(normalized,/\\text\{\\mathrm|[А-Яа-я]/u);
  assert.match(normalized,/\\mathrm\{J\}/);
  assert.match(normalized,/\\Omega/);
});

test("preserves prose while rendering inline and display math",()=>{
  const html = renderStatementMath(String.raw`<p>Texto normal e $v=3~\text{м/с}$.</p><p>\[P=4~\text{мВт}\]</p>`);
  assert.match(html,/Texto normal e/);
  assert.equal((html.match(/class="katex"/g)||[]).length,2);
  assert.doesNotMatch(html,/[А-Яа-я]/u);
});

test("repairs legacy TeX forms used by the XY statements",()=>{
  const errors = [];
  const html = renderStatementMath(String.raw`<p>$15\text{%}$, $F_\max$, $560~^\circ\mbox{C}$, $g_0&nbsp;=9.81~\text{м/с}^2$</p>`,{onError:(error)=>errors.push(error)});
  assert.deepEqual(errors,[]);
  assert.equal((html.match(/class="katex"/g)||[]).length,4);
  assert.doesNotMatch(html,/\$|katex-error|[А-Яа-я]/u);
});

test("normalizes every unit family found in the XY catalog",()=>{
  const errors = [];
  const html = renderStatementMath(String.raw`<p>$L=1~\text{нГн}$, $c=200~мкМ$, $D=2~дБ$, $E=1~эВ$, $\Phi=3~\text{Вб}$, $\sigma=4~См$, $t=2~\text{фс}$, $d=10~\text{кпк}$, $P=30~\text{МВт}$</p>`,{onError:(error)=>errors.push(error)});
  assert.deepEqual(errors,[]);
  assert.equal((html.match(/class="katex"/g)||[]).length,9);
  assert.doesNotMatch(html,/[А-Яа-яЁё]/u);
});
