import { ensureDatabase, getD1 } from "../../../db/runtime";
import { requireSiteUserApi } from "../../chatgpt-auth";

export async function POST(request: Request) {
  const user=await requireSiteUserApi(); if (user instanceof Response) return user;
  await ensureDatabase();
  const payload = await request.json() as { tbfDate?: string | null };
  const value = payload.tbfDate?.trim() || null;
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return Response.json({ error: "Data inválida" }, { status: 400 });
  await getD1().prepare("INSERT INTO user_settings_v2 (owner_id,tbf_date,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(owner_id) DO UPDATE SET tbf_date=excluded.tbf_date,updated_at=CURRENT_TIMESTAMP").bind(user.userId,value).run();
  return Response.json({ ok: true, tbfDate: value });
}
