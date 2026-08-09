import { ensureDatabase, getD1 } from "../../../db/runtime";

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await request.json() as { examId?: number; date?: string; type?: string; totalScore?: number; maxScore?: number; driveUrl?: string; problemScores?: Array<{ problemId: number; score: number; maxScore: number }> };
  if (!Number.isInteger(payload.examId) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date ?? "") || !["theoretical","experimental"].includes(payload.type ?? "") || !(Number(payload.maxScore) > 0) || Number(payload.totalScore) < 0) return Response.json({ error: "Preencha os dados obrigatórios do simulado" }, { status: 400 });
  const db = getD1(); const exam = await db.prepare("SELECT id FROM phors_exams WHERE id=?").bind(payload.examId).first();
  if (!exam) return Response.json({ error: "Prova não encontrada" }, { status: 404 });
  const id = crypto.randomUUID(); const statements: D1PreparedStatement[] = [db.prepare("INSERT INTO user_mock_exams (id,exam_id,date,type,total_score,max_score,drive_url) VALUES (?,?,?,?,?,?,?)").bind(id,payload.examId,payload.date,payload.type,payload.totalScore,payload.maxScore,payload.driveUrl?.trim() || null)];
  for (const score of payload.problemScores ?? []) {
    if (!(Number(score.maxScore) > 0) || Number(score.score) < 0) continue;
    const valid = await db.prepare("SELECT id FROM phors_problems WHERE id=? AND exam_id=?").bind(score.problemId,payload.examId).first();
    if (valid) statements.push(db.prepare("INSERT INTO user_mock_exam_problem_scores (id,mock_exam_id,problem_id,score,max_score) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,score.problemId,score.score,score.maxScore));
  }
  await db.batch(statements); return Response.json({ ok: true, id }, { status: 201 });
}
