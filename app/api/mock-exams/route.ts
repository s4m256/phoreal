import { ensureDatabase, getD1 } from "../../../db/runtime";
import { requireSiteUserApi } from "../../chatgpt-auth";

type Score = { problemNumber?:number; problemLabel?:string; score?:number };
type Payload = { id?:string|null; examName?:string; date?:string; type?:string; totalScore?:number; driveUrl?:string; problemScores?:Score[] };

function validPayload(payload:Payload) {
  const examName=payload.examName?.trim();
  if (!examName || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date??"") || !["theoretical","experimental"].includes(payload.type??"") || !Number.isFinite(payload.totalScore) || Number(payload.totalScore)<0) return null;
  return {examName,date:payload.date!,type:payload.type!,totalScore:Number(payload.totalScore),driveUrl:payload.driveUrl?.trim()||null};
}

function scoreStatements(db:D1Database,mockExamId:string,rows:Score[]) {
  const statements:D1PreparedStatement[]=[];
  for (const [index,row] of rows.entries()) {
    if (typeof row.score!=="number" || !Number.isFinite(row.score) || row.score<0) continue;
    const number=Number.isInteger(row.problemNumber)&&Number(row.problemNumber)>0?Number(row.problemNumber):index+1;
    statements.push(db.prepare("INSERT INTO user_mock_exam_problem_scores_v2 (id,mock_exam_id,problem_number,problem_label,score) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),mockExamId,number,row.problemLabel?.trim()||`Questão ${number}`,row.score));
  }
  return statements;
}

export async function POST(request:Request) {
  const user=await requireSiteUserApi(); if (user instanceof Response) return user;
  await ensureDatabase();
  const payload=await request.json() as Payload; const parsed=validPayload(payload);
  if (!parsed) return Response.json({error:"Preencha os dados obrigatórios do simulado"},{status:400});
  const id=crypto.randomUUID(); const db=getD1();
  await db.batch([
    db.prepare("INSERT INTO user_mock_exams_v2 (id,owner_id,exam_name,date,type,total_score,drive_url) VALUES (?,?,?,?,?,?,?)").bind(id,user.userId,parsed.examName,parsed.date,parsed.type,parsed.totalScore,parsed.driveUrl),
    ...scoreStatements(db,id,payload.problemScores??[]),
  ]);
  return Response.json({ok:true,id},{status:201});
}

export async function PATCH(request:Request) {
  const user=await requireSiteUserApi(); if (user instanceof Response) return user;
  await ensureDatabase();
  const payload=await request.json() as Payload; const parsed=validPayload(payload);
  if (!payload.id || !parsed) return Response.json({error:"Preencha os dados obrigatórios do simulado"},{status:400});
  const db=getD1();
  const existing=await db.prepare("SELECT id FROM user_mock_exams_v2 WHERE id=? AND owner_id=?").bind(payload.id,user.userId).first();
  if (!existing) return Response.json({error:"Simulado não encontrado"},{status:404});
  await db.batch([
    db.prepare("UPDATE user_mock_exams_v2 SET exam_name=?,date=?,type=?,total_score=?,drive_url=? WHERE id=? AND owner_id=?").bind(parsed.examName,parsed.date,parsed.type,parsed.totalScore,parsed.driveUrl,payload.id,user.userId),
    db.prepare("DELETE FROM user_mock_exam_problem_scores_v2 WHERE mock_exam_id=?").bind(payload.id),
    ...scoreStatements(db,payload.id,payload.problemScores??[]),
  ]);
  return Response.json({ok:true,id:payload.id});
}
