import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("OpenAI translation transport is review-only and preserves protected pipeline boundaries", async () => {
  const source = await readFile(new URL("../scripts/run-openai-phors-translation.py", import.meta.url), "utf8");
  assert.match(source, /gpt-5\.6-terra/);
  assert.match(source, /"effort": "low"/);
  assert.match(source, /Preserve every marker exactly once/);
  assert.match(source, /translated_review_required/);
  assert.match(source, /math_translations/);
  assert.match(source, /ZXQMATH/);
  assert.doesNotMatch(source, /sqlite3|UPDATE phors_|INSERT INTO phors_/);
});

test("protected-value restoration allows Portuguese word order but rejects missing markers", async () => {
  const source = await readFile(new URL("../scripts/external-phors-translation.py", import.meta.url), "utf8");
  assert.match(source, /if sorted\(found\) != expected/);
  assert.match(source, /missing, duplicated or changed/);
  assert.match(source, /validate_math_translation/);
  assert.match(source, /Math translations do not exactly cover/);
  assert.match(source, /canonicalize_math_translation/);
  assert.match(source, /Formulas are source evidence/);
  assert.match(source, /restore_source_math/);
  assert.match(source, /translated\.replace\("\{ress\}", "\{res\}"\)/);
  assert.match(source, /for command in \("\\\\text", "\\\\mathrm"\)/);
  assert.match(source, /\("\\\\mu", "μ"\)/);
});

test("fragment translation and result audits preserve formulas and reject stray scripts", async () => {
  const fragmentSource = await readFile(new URL("../scripts/run-openai-phors-math-fragments.py", import.meta.url), "utf8");
  const auditSource = await readFile(new URL("../scripts/audit-openai-phors-result-markers.py", import.meta.url), "utf8");
  const validatorSource = await readFile(new URL("../scripts/validate-phors-translations.mjs", import.meta.url), "utf8");
  assert.match(fragmentSource, /fragment/);
  assert.match(fragmentSource, /gpt-5\.6-terra/);
  assert.match(auditSource, /protected markers changed/);
  assert.match(validatorSource, /unexpectedForeignScript/);
});
