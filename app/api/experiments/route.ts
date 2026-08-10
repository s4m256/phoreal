import { ensureDatabase, getD1 } from "../../../db/runtime";
import { requireSiteUserApi } from "../../chatgpt-auth";

export async function POST(request:Request) {
  const user=await requireSiteUserApi(); if (user instanceof Response) return user;
  await ensureDatabase();
  const payload=await request.json() as {title?:string;date?:string;imageUrl?:string;notes?:string}; const title=payload.title?.trim();
  if (!title || (payload.date && !/^\d{4}-\d{2}-\d{2}$/.test(payload.date))) return Response.json({error:"Informe um título válido"},{status:400});
  const id=crypto.randomUUID(); await getD1().prepare("INSERT INTO user_experiments (id,owner_id,title,date,image_url,notes) VALUES (?,?,?,?,?,?)").bind(id,user.userId,title,payload.date||null,payload.imageUrl?.trim()||null,payload.notes?.trim()||null).run();
  return Response.json({ok:true,id},{status:201});
}
