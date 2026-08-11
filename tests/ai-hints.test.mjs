import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { clampHintPenalty,parseHintModelOutput,safeHintHtml } from "../app/lib/ai-hints.mjs";

test("hint penalties are bounded and full solutions consume the remaining score",()=>{
  assert.equal(clampHintPenalty({suggested:0.02,remaining:1}),0.1);
  assert.equal(clampHintPenalty({suggested:0.9,remaining:1}),0.5);
  assert.equal(clampHintPenalty({suggested:0.3,remaining:0.2}),0.2);
  assert.equal(clampHintPenalty({suggested:0.1,remaining:0.7,fullSolution:true}),0.7);
  assert.equal(clampHintPenalty({suggested:0.4,remaining:null,hasReliableScore:false}),0);
});

test("structured model output is validated and escaped before rendering",()=>{
  const parsed=parseHintModelOutput({output_text:JSON.stringify({hint:"Use $F=ma$ <agora>",disclosure:"hint",revealed_steps:["segunda lei"],revealed_points:0.2})});
  assert.equal(parsed.revealedPoints,0.2);
  assert.deepEqual(parsed.revealedSteps,["segunda lei"]);
  assert.equal(safeHintHtml(parsed.hint),"Use $F=ma$ &lt;agora&gt;");
});

test("hint history is owned by a user and linked to an attempt item",()=>{
  const db=new DatabaseSync(":memory:");
  for (const file of ["0001_phors_catalog.sql","0002_personal_training.sql"]) db.exec(readFileSync(new URL(`../db/migrations/${file}`,import.meta.url),"utf8"));
  db.exec(readFileSync(new URL("../drizzle/0004_personal_training_v2.sql",import.meta.url),"utf8"));
  db.exec(readFileSync(new URL("../drizzle/0005_multi_user_accounts.sql",import.meta.url),"utf8"));
  db.exec(readFileSync(new URL("../db/migrations/0005_ai_hints.sql",import.meta.url),"utf8"));
  db.exec("INSERT INTO phors_competitions(id,source_key,name,source_url,source_host) VALUES(1,'xy','XY','https://xy.pho.rs','xy.pho.rs'); INSERT INTO phors_exams(id,competition_id,source_key,source_url,title,year,code,series,source_hash,imported_at) VALUES(1,1,'x','https://xy.pho.rs/X26','X26',2026,'X26','X','h','n'); INSERT INTO phors_problems(id,exam_id,source_id,source_url,title,kind,source_hash,imported_at) VALUES(1,1,'1','https://pho.rs/p/1','P','theoretical','h','n'); INSERT INTO phors_problem_parts(id,problem_id,source_key,code,ordinal,score,score_reliability,source_url) VALUES(1,1,'a','A1',1,1,'explicit_html','https://pho.rs/p/1#a'); INSERT INTO user_attempts(id,owner_id,problem_id,status,current_state,active_part_id,started_at) VALUES('a','u',1,'in_progress','item_active',1,'n');");
  db.prepare("INSERT INTO user_hint_events(id,owner_id,attempt_id,problem_part_id,answer_text,answer_html,penalty,model) VALUES(?,?,?,?,?,?,?,?)").run("h","u","a",1,"t","t",0.2,"terra");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM user_hint_events WHERE owner_id=? AND attempt_id=?").get("u","a").count,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM user_hint_events WHERE owner_id=?").get("other").count,0);
  db.close();
});
