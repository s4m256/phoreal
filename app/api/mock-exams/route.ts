import { ensureDatabase, getD1 } from "../../../db/runtime";
import { requireSiteOwnerApi } from "../../chatgpt-auth";

type Score = { problemNumber?:number; problemLabel?:string; score?:number };

export async function POST(request:Request) {
  const forbidden=await requireSiteOwnerApi(); if (forbidden) return forbidden;
  await ensureDatabase();
  const payload = await request.json() as { examName?:string; date?:string; type?:string; totalScore?:number; driveUrl?:string; problemScores?:Score[] };
  const examName = payload.examName?.trim();
  if (!examName || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date ?? "") || !["theoretical","experimental"].includes(payload.type ?? "") || !(Number(payload.totalScore) >= 0)) return Response.json({ error:"Preencha os dados obrigatórios do simulado" },{status:400});
  const id=crypto.randomUUID(); const db=getD1();
  const statements:D1PreparedStatement[]=[db.prepare("INSERT INTO user_mock_exams_v2 (id,exam_name,date,type,total_score,drive_url) VALUES (?,?,?,?,?,?)").bind(id,examName,payload.date,payload.type,payload.totalScore,payload.driveUrl?.trim()||null)];
  for (const [index,row] of (payload.problemScores??[]).entries()) {
    const number=Number.isInteger(row.problemNumber)&&Number(row.problemNumber)>0?Number(row.problemNumber):index+1;
    if (!(Number(row.score)>=0)) continue;
    statements.push(db.prepare("INSERT INTO user_mock_exam_problem_scores_v2 (id,mock_exam_id,problem_number,problem_label,score) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,number,row.problemLabel?.trim()||`Questão ${number}`,row.score));
  }
  await db.batch(statements);
  return Response.json({ok:true,id},{status:201});
}
