import taiwanIndex from "../../../../../../data/taiwan/index.json";
import { ensureDatabase, getD1 } from "../../../../../../db/runtime";
import { requireSiteUserApi } from "../../../../../chatgpt-auth";

type Action="select_item"|"pause"|"resume"|"discard_current"|"finish";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await requireSiteUserApi(); if (user instanceof Response) return user;
  await ensureDatabase(); const {id}=await params;
  const body=await request.json() as {action?:Action;itemCode?:string};
  const db=getD1();
  const attempt=await db.prepare("SELECT * FROM user_taiwan_attempts WHERE id=? AND owner_id=?").bind(id,user.userId).first<Record<string,unknown>>();
  if (!attempt || attempt.status!=="in_progress") return Response.json({error:"Tentativa em andamento não encontrada"},{status:404});
  const problem=taiwanIndex.volumes.find((item)=>item.volume===Number(attempt.volume))?.problems.find((item)=>item.id===Number(attempt.problem_number));
  if (!problem) return Response.json({error:"Problema de Taiwan não encontrado"},{status:404});
  const now=new Date().toISOString();
  const close=db.prepare("UPDATE user_taiwan_time_segments SET ended_at=?,duration_seconds=MAX(0,CAST((julianday(?)-julianday(started_at))*86400 AS INTEGER)) WHERE attempt_id=? AND ended_at IS NULL").bind(now,now,id);
  if (body.action==="pause") {
    await db.batch([close,db.prepare("UPDATE user_taiwan_attempts SET current_state='paused',updated_at=? WHERE id=?").bind(now,id)]);
  } else if (body.action==="resume") {
    if (!attempt.active_item_code) return Response.json({error:"Selecione um item para começar"},{status:400});
    await db.batch([close,db.prepare("INSERT INTO user_taiwan_time_segments(id,attempt_id,item_code,started_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,attempt.active_item_code,now),db.prepare("UPDATE user_taiwan_attempts SET current_state='item_active',updated_at=? WHERE id=?").bind(now,id)]);
  } else if (body.action==="select_item") {
    const code=String(body.itemCode||"");
    if (!problem.parts.some((part)=>part.code===code)) return Response.json({error:"Item inválido"},{status:400});
    await db.batch([close,db.prepare("INSERT INTO user_taiwan_time_segments(id,attempt_id,item_code,started_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,code,now),db.prepare("UPDATE user_taiwan_attempts SET current_state='item_active',active_item_code=?,updated_at=? WHERE id=?").bind(code,now,id)]);
  } else if (body.action==="discard_current") {
    if (attempt.current_state!=="item_active") return Response.json({error:"Nenhum intervalo em andamento"},{status:400});
    const segment=await db.prepare("SELECT id FROM user_taiwan_time_segments WHERE attempt_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1").bind(id).first<{id:string}>();
    if (!segment) return Response.json({error:"Nenhum intervalo em andamento"},{status:400});
    await db.batch([db.prepare("DELETE FROM user_taiwan_time_segments WHERE id=? AND attempt_id=? AND ended_at IS NULL").bind(segment.id,id),db.prepare("UPDATE user_taiwan_attempts SET current_state='paused',updated_at=? WHERE id=?").bind(now,id)]);
  } else if (body.action==="finish") {
    await db.batch([close,db.prepare("UPDATE user_taiwan_attempts SET status='completed',current_state='paused',finished_at=?,updated_at=? WHERE id=?").bind(now,now,id)]);
  } else return Response.json({error:"Ação inválida"},{status:400});
  return Response.json({ok:true,action:body.action,at:now});
}
