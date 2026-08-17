import { load } from "cheerio";
import { env } from "cloudflare:workers";
import taiwanCatalog from "../../../../../../data/taiwan/catalog.json";
import { ensureDatabase, getD1 } from "../../../../../../db/runtime";
import { requireAiOwnerApi } from "../../../../../chatgpt-auth";
import { parseHintModelOutput,safeHintHtml } from "../../../../../lib/ai-hints.mjs";
import { renderStatementMath } from "../../../../../lib/render-statement-math.mjs";

export const dynamic="force-dynamic";
const MODEL="gpt-5.6-terra";
const textFromHtml=(value:string)=>{const $=load(value);return $.root().text().replace(/\s+/g," ").trim().slice(0,50000)};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await requireAiOwnerApi(); if (user instanceof Response) return user;
  await ensureDatabase(); const {id}=await params; const db=getD1();
  const body=await request.json() as {question?:string;requestId?:string};
  const requestId=typeof body.requestId==="string"&&/^[a-zA-Z0-9-]{10,80}$/.test(body.requestId)?body.requestId:crypto.randomUUID();
  const existing=await db.prepare("SELECT * FROM user_taiwan_hint_events WHERE id=? AND owner_id=?").bind(requestId,user.userId).first();
  if (existing) return Response.json({hint:existing,replayed:true});
  const question=(body.question||"").trim().slice(0,600);
  if (!question) return Response.json({error:"Escreva uma dúvida específica"},{status:400});
  const attempt=await db.prepare("SELECT * FROM user_taiwan_attempts WHERE id=? AND owner_id=?").bind(id,user.userId).first<Record<string,unknown>>();
  if (!attempt||attempt.status!=="in_progress"||!attempt.active_item_code) return Response.json({error:"Inicie a tentativa e selecione um item antes de pedir uma dica"},{status:400});
  const volume=taiwanCatalog.volumes.find((item)=>item.volume===Number(attempt.volume));
  const problem=volume?.problems.find((item)=>item.id===Number(attempt.problem_number));
  const part=problem?.parts.find((item)=>item.code===attempt.active_item_code);
  if (!problem||!part) return Response.json({error:"Item de Taiwan não encontrado"},{status:404});
  if (!problem.solution_html) return Response.json({error:"Este problema não possui solução no material corrigido"},{status:503});
  const [worked,previous,recent]=await Promise.all([
    db.prepare("SELECT COUNT(*) count FROM user_taiwan_time_segments WHERE attempt_id=? AND item_code=?").bind(id,part.code).first<{count:number}>(),
    db.prepare("SELECT question,answer_text,full_solution FROM user_taiwan_hint_events WHERE attempt_id=? AND item_code=? AND owner_id=? ORDER BY created_at").bind(id,part.code,user.userId).all(),
    db.prepare("SELECT COUNT(*) count FROM user_taiwan_hint_events WHERE owner_id=? AND created_at>=?").bind(user.userId,new Date(Date.now()-3600000).toISOString()).first<{count:number}>(),
  ]);
  if (!Number(worked?.count)) return Response.json({error:"Comece a contar o tempo deste item antes de pedir uma dica"},{status:400});
  if (Number(recent?.count)>=30) return Response.json({error:"Limite de segurança atingido. Tente novamente em alguns minutos."},{status:429});
  const key=(env as unknown as {OPENAI_API_KEY?:string}).OPENAI_API_KEY;
  if (!key) return Response.json({error:"A chave da IA ainda não está configurada"},{status:503});
  const asksFull=/\b(solu[cç][aã]o completa|resolu[cç][aã]o completa|resolva (?:tudo|o item)|full solution)\b/i.test(question);
  const history=previous.results.slice(-8).map((row)=>({question:(row as {question:string|null}).question,answer:(row as {answer_text:string}).answer_text}));
  const solution=textFromHtml(problem.solution_html);
  const instructions="Você orienta olimpíadas de física em português do Brasil. Use exclusivamente a solução corrigida fornecida. Dê o menor passo necessário para destravar o item ativo, sem antecipar passos posteriores nem inventar informações. Só entregue a solução completa se ela for pedida explicitamente. Use LaTeX entre $...$ ou $$...$$. Responda no JSON solicitado; revealed_points deve ser sempre 0 porque este material não tem marking scheme confiável.";
  const input=`PROBLEMA: ${problem.title_pt}\nITEM ATIVO: ${part.code}\nTEXTO DO ITEM: ${part.prompt_text}\n\nSOLUÇÃO CORRIGIDA DE REFERÊNCIA:\n${solution}\n\nHISTÓRICO:\n${JSON.stringify(history)}\n\nDÚVIDA:\n${question}`;
  let response:Response;
  try { response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({model:MODEL,reasoning:{effort:"low"},max_output_tokens:1000,store:false,instructions,input,text:{format:{type:"json_schema",name:"physics_hint",strict:true,schema:{type:"object",additionalProperties:false,properties:{hint:{type:"string"},disclosure:{type:"string",enum:["hint","substantial","full_solution"]},revealed_steps:{type:"array",items:{type:"string"}},revealed_points:{type:"number"}},required:["hint","disclosure","revealed_steps","revealed_points"]}}}})}); }
  catch { return Response.json({error:"Não foi possível conectar à IA"},{status:502}); }
  const payload=await response.json() as Record<string,unknown>;
  if (!response.ok) return Response.json({error:"A IA não respondeu agora"},{status:502});
  let result:{hint:string;disclosure:string};
  try { result=parseHintModelOutput(payload); } catch { return Response.json({error:"A resposta da IA veio incompleta"},{status:502}); }
  const fullSolution=asksFull||result.disclosure==="full_solution";
  const answerHtml=renderStatementMath(safeHintHtml(result.hint)); const now=new Date().toISOString();
  await db.prepare("INSERT INTO user_taiwan_hint_events(id,owner_id,attempt_id,item_code,question,answer_text,answer_html,full_solution,model,input_tokens,output_tokens,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(requestId,user.userId,id,part.code,question,result.hint,answerHtml,fullSolution?1:0,MODEL,(payload.usage as {input_tokens?:number}|undefined)?.input_tokens??null,(payload.usage as {output_tokens?:number}|undefined)?.output_tokens??null,now).run();
  return Response.json({hint:{id:requestId,attempt_id:id,item_code:part.code,question,answer_html:answerHtml,full_solution:fullSolution?1:0,created_at:now}});
}
