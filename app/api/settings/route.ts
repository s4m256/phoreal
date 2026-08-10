import { ensureDatabase, getD1 } from "../../../db/runtime";
import { requireSiteOwnerApi } from "../../chatgpt-auth";

export async function POST(request: Request) {
  const forbidden=await requireSiteOwnerApi(); if (forbidden) return forbidden;
  await ensureDatabase();
  const payload = await request.json() as { tbfDate?: string | null };
  const value = payload.tbfDate?.trim() || null;
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return Response.json({ error: "Data inválida" }, { status: 400 });
  await getD1().prepare("UPDATE user_settings SET tbf_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=1").bind(value).run();
  return Response.json({ ok: true, tbfDate: value });
}
