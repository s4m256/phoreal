import { readAllData } from "../../../db/runtime";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await readAllData()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar dados" }, { status: 500 }); }
}
