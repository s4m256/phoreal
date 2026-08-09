import { readFullExportData } from "../../../../db/runtime";

export const dynamic = "force-dynamic";
export async function GET() {
  const data = await readFullExportData();
  return new Response(JSON.stringify({ format_version: 1, exported_at: new Date().toISOString(), source_scope: "xy.pho.rs only", ...data }, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="treino-fisica-${new Date().toISOString().slice(0,10)}.json"` } });
}
