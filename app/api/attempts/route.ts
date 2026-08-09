import { ensureDatabase, getD1 } from "../../../db/runtime";

export async function POST(request: Request) {
  await ensureDatabase();
  const { problemId } = await request.json() as { problemId?: number };
  if (!Number.isInteger(problemId)) return Response.json({ error: "Problema inválido" }, { status: 400 });
  const db = getD1();
  const problem = await db.prepare("SELECT id FROM phors_problems WHERE id=?").bind(problemId).first();
  if (!problem) return Response.json({ error: "Problema não encontrado" }, { status: 404 });
  const existing = await db.prepare("SELECT * FROM user_attempts WHERE problem_id=? AND status='in_progress' LIMIT 1").bind(problemId).first();
  if (existing) return Response.json({ attempt: existing, resumed: true });
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare("INSERT INTO user_attempts (id,problem_id,status,current_state,started_at,updated_at) VALUES (?,?,'in_progress','paused',?,?)").bind(id,problemId,now,now).run();
  return Response.json({ attempt: { id, problem_id: problemId, status: "in_progress", current_state: "paused", active_part_id: null, started_at: now }, resumed: false }, { status: 201 });
}
