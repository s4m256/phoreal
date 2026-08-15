import { load } from "cheerio";
import { ensureDatabase,getD1 } from "../../../../../db/runtime";
import { renderStatementMath } from "../../../../lib/render-statement-math.mjs";
import { proxyStatementImages } from "../../../../lib/statement-images.mjs";

export const dynamic="force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  await ensureDatabase();
  const {id}=await params;
  const problemId=Number(id);
  if(!Number.isInteger(problemId)) return Response.json({error:"Problema inválido"},{status:400});
  const row=await getD1().prepare(`SELECT p.solution_url FROM phors_problems p JOIN phors_exams e ON e.id=p.exam_id WHERE p.id=? AND e.series IN ('X','Y') AND e.year BETWEEN 2018 AND 2026`).bind(problemId).first<{solution_url:string|null}>();
  if(!row) return Response.json({error:"Problema não encontrado"},{status:404});
  if(!row.solution_url) return Response.json({error:"Resposta oficial não disponível"},{status:404});
  const source=new URL(row.solution_url);
  if(!["pho.rs","xy.pho.rs"].includes(source.hostname)) return Response.json({error:"Fonte de resposta inválida"},{status:400});
  let response:Response;
  try { response=await fetch(source,{headers:{"user-agent":"TreinoFisicaXY/1.0 (personal study helper)"}}); }
  catch { return Response.json({error:"Não foi possível acessar a resposta oficial"},{status:502}); }
  if(!response.ok) return Response.json({error:"Resposta oficial indisponível agora"},{status:502});
  const $=load(await response.text());
  $("script,style,nav,header,footer,noscript,form,button,iframe").remove();
  const root=$("main").first().length?$("main").first():$("body");
  root.find("img[src]").each((_index,element)=>{
    const src=$(element).attr("src");
    if(src) try { $(element).attr("src",new URL(src,source).toString()); } catch {}
  });
  const html=root.html()?.trim();
  if(!html) return Response.json({error:"Resposta oficial vazia"},{status:502});
  return Response.json({html:proxyStatementImages(renderStatementMath(html))});
}
