import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Reuse the checked-in, chunked imports. Do not migrate personal training tables.
const sources = ['0002_seed_xy_2018_2026.sql', '0003_translate_xy_2018_2026.sql'];
const statements = sources.flatMap(name => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8')
  .split('--> statement-breakpoint').map(sql => sql.trim())
  .filter(sql => /^UPDATE phors_problems SET (statement_html_(original|pt)|title_pt)=/.test(sql)));
assert.ok(statements.length > 0, 'No statement imports found');
const catalog = JSON.parse(readFileSync(new URL('../data/phors-catalog.json', import.meta.url), 'utf8'));
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE phors_problems (source_id TEXT PRIMARY KEY, statement_content_hash TEXT, statement_html_original TEXT, statement_html_pt TEXT, title_pt TEXT, translation_status TEXT, translation_source_hash TEXT)');
const insert = db.prepare('INSERT INTO phors_problems (source_id,statement_content_hash) VALUES (?,?)');
for (const row of catalog.problems) insert.run(row.source_id, row.statement_content_hash);
for (const sql of statements) db.exec(sql);
const counts = db.prepare('SELECT COUNT(*) AS problems, SUM(length(statement_html_original)>0) AS originals, SUM(length(statement_html_pt)>0) AS translations FROM phors_problems').get();
assert.equal(counts.originals, catalog.problems.filter(row => row.statement_status === 'public').length);
assert.ok(counts.translations > 0);
db.close();
mkdirSync('work', { recursive: true });
writeFileSync('work/public-statements.sql', statements.join('\n'));
console.log(JSON.stringify({ output: 'work/public-statements.sql', statements: statements.length, ...counts }, null, 2));
