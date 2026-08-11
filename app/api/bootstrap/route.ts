import { readAllData } from "../../../db/runtime";
import { canUsePrivateAi, getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";
export async function GET() {
  try { const user=await getChatGPTUser(); return Response.json({...(await readAllData(user?.userId??null)),canEdit:Boolean(user),canUseAi:canUsePrivateAi(user)}); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar dados" }, { status: 500 }); }
}
