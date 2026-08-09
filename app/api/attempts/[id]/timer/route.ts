import { ensureDatabase, getD1 } from "../../../../../db/runtime";

type Action = "select_part" | "pause" | "resume" | "finish";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await params; const payload = await request.json() as { action?: Action; partId?: number };
  const db = getD1(); const attempt = await db.prepare("SELECT * FROM user_attempts WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!attempt || attempt.status !== "in_progress") return Response.json({ error: "Tentativa em andamento não encontrada" }, { status: 404 });
  const action = payload.action; const now = new Date().toISOString();
  const close = db.prepare("UPDATE user_time_segments SET ended_at=?, duration_seconds=MAX(0,CAST((julianday(?) - julianday(started_at))*86400 AS INTEGER)) WHERE attempt_id=? AND ended_at IS NULL").bind(now,now,id);
  if (action === "pause") {
    await db.batch([close, db.prepare("UPDATE user_attempts SET current_state='paused', updated_at=? WHERE id=?").bind(now,id)]);
  } else if (action === "resume") {
    const state = attempt.active_part_id ? "item_active" : "initial_reading";
    await db.batch([close, db.prepare("INSERT INTO user_time_segments (id,attempt_id,state,problem_part_id,started_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,state,attempt.active_part_id ?? null,now), db.prepare("UPDATE user_attempts SET current_state=?, updated_at=? WHERE id=?").bind(state,now,id)]);
  } else if (action === "select_part") {
    if (!Number.isInteger(payload.partId)) return Response.json({ error: "Item inválido" }, { status: 400 });
    const part = await db.prepare("SELECT pp.id FROM phors_problem_parts pp JOIN user_attempts a ON a.problem_id=pp.problem_id WHERE pp.id=? AND a.id=?").bind(payload.partId,id).first();
    if (!part) return Response.json({ error: "Item não pertence à questão" }, { status: 400 });
    await db.batch([close, db.prepare("INSERT INTO user_time_segments (id,attempt_id,state,problem_part_id,started_at) VALUES (?,?,'item_active',?,?)").bind(crypto.randomUUID(),id,payload.partId,now), db.prepare("UPDATE user_attempts SET current_state='item_active', active_part_id=?, updated_at=? WHERE id=?").bind(payload.partId,now,id)]);
  } else if (action === "finish") {
    await db.batch([close, db.prepare("UPDATE user_attempts SET status='completed', current_state='paused', finished_at=?, updated_at=? WHERE id=?").bind(now,now,id)]);
  } else return Response.json({ error: "Ação inválida" }, { status: 400 });
  return Response.json({ ok: true, action, at: now });
}
