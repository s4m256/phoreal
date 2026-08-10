import { readAllData } from "../../../db/runtime";
import { isSiteOwner } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({...(await readAllData()),canEdit:await isSiteOwner()}); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar dados" }, { status: 500 }); }
}
