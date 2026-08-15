import taiwanVolume10 from "../../../../data/taiwan/volume-10.json";
import { ensureDatabase, getD1 } from "../../../../db/runtime";
import { requireSiteUserApi } from "../../../chatgpt-auth";

export async function POST(request:Request) {
  const user=await requireSiteUserApi(); if (user instanceof Response) return user;
  await ensureDatabase();
  const body=await request.json() as {volume?:number;problemNumber?:number};
  if (body.volume!==10 || !taiwanVolume10.problems.some((problem)=>problem.id===body.problemNumber)) return Response.json({error:"Problema de Taiwan inválido"},{status:400});
  const db=getD1();
  const existing=await db.prepare("SELECT * FROM user_taiwan_attempts WHERE owner_id=? AND volume=? AND problem_number=? AND status='in_progress' LIMIT 1").bind(user.userId,body.volume,body.problemNumber).first();
  if (existing) return Response.json({attempt:existing,resumed:true});
  const id=crypto.randomUUID(); const now=new Date().toISOString();
  await db.prepare("INSERT INTO user_taiwan_attempts(id,owner_id,volume,problem_number,status,current_state,started_at,updated_at) VALUES(?,?,?,?,'in_progress','paused',?,?)").bind(id,user.userId,body.volume,body.problemNumber,now,now).run();
  return Response.json({attempt:{id,volume:body.volume,problem_number:body.problemNumber,status:"in_progress",current_state:"paused",active_item_code:null,started_at:now},resumed:false},{status:201});
}
