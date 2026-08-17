import taiwanIndex from "../../../../data/taiwan/index.json";
import { readAllData } from "../../../../db/runtime";
import { requireSiteUserApi } from "../../../chatgpt-auth";

export const dynamic="force-dynamic";
type Row=Record<string,unknown>;
type AttemptTimes={total_seconds:number;items:Map<string,number>};

const WINDOW_DAYS=7;

function aggregateRecentSegments(rows:Row[],itemField:string,fromMs:number,toMs:number) {
  const byAttempt=new Map<string,AttemptTimes>();
  for(const row of rows) {
    const originalStart=Date.parse(String(row.started_at));
    if(!Number.isFinite(originalStart)) continue;
    const originalEnd=row.duration_seconds==null?toMs:originalStart+Math.max(0,Number(row.duration_seconds))*1000;
    const start=Math.max(fromMs,originalStart),end=Math.min(toMs,originalEnd);
    const seconds=Math.max(0,Math.floor((end-start)/1000));
    if(!seconds) continue;
    const attemptId=String(row.attempt_id),item=String(row[itemField]??"sem item");
    const entry=byAttempt.get(attemptId)??{total_seconds:0,items:new Map<string,number>()};
    entry.total_seconds+=seconds;
    entry.items.set(item,(entry.items.get(item)??0)+seconds);
    byAttempt.set(attemptId,entry);
  }
  return byAttempt;
}

const inWindow=(value:unknown,fromMs:number,toMs:number)=>{
  const time=Date.parse(String(value??""));
  return Number.isFinite(time)&&time>=fromMs&&time<=toMs;
};

export async function GET() {
  const user=await requireSiteUserApi();if(user instanceof Response)return user;
  const data=await readAllData(user.userId);
  const exportedAt=new Date(),toMs=exportedAt.getTime(),fromMs=toMs-WINDOW_DAYS*86_400_000;
  const problems=data.problems as Row[],exams=data.exams as Row[],parts=data.problemParts as Row[],tags=data.tags as Row[],problemTags=data.problemTags as Row[];
  const attempts=data.attempts as Row[],segments=data.timeSegments as Row[],hints=data.hintEvents as Row[];
  const taiwanAttempts=data.taiwanAttempts as Row[],taiwanSegments=data.taiwanTimeSegments as Row[],taiwanHints=data.taiwanHintEvents as Row[];
  const partById=new Map(parts.map((part)=>[Number(part.id),part]));
  const problemById=new Map(problems.map((problem)=>[Number(problem.id),problem]));
  const examById=new Map(exams.map((exam)=>[Number(exam.id),exam]));
  const tagById=new Map(tags.map((tag)=>[Number(tag.id),String(tag.name_pt||tag.name)]));
  const tagsByProblem=new Map<number,string[]>();
  for(const relation of problemTags){const name=tagById.get(Number(relation.tag_id));if(name){const id=Number(relation.problem_id);tagsByProblem.set(id,[...(tagsByProblem.get(id)||[]),name]);}}
  const recentHints=hints.filter((hint)=>inWindow(hint.created_at,fromMs,toMs));
  const recentTaiwanHints=taiwanHints.filter((hint)=>inWindow(hint.created_at,fromMs,toMs));
  const xyTimes=aggregateRecentSegments(segments,"problem_part_id",fromMs,toMs);
  const taiwanTimes=aggregateRecentSegments(taiwanSegments,"item_code",fromMs,toMs);
  const xy=attempts.map((attempt)=>{
    const problem=problemById.get(Number(attempt.problem_id)),exam=examById.get(Number(problem?.exam_id)),time=xyTimes.get(String(attempt.id));
    const assistance=recentHints.filter((hint)=>hint.attempt_id===attempt.id).map((hint)=>({item:partById.get(Number(hint.problem_part_id))?.code,question:hint.question,points_lost:hint.penalty,full_solution:Boolean(hint.full_solution),at:hint.created_at}));
    return {source:"xy",problem:`${String(exam?.code||"")} ${String(problem?.code||"")}`.trim(),title:problem?.title_pt||problem?.title,tags:tagsByProblem.get(Number(attempt.problem_id))||[],status:attempt.status,finished_at:attempt.finished_at,total_seconds:time?.total_seconds||0,item_seconds:Object.fromEntries([...(time?.items||new Map()).entries()].map(([id,seconds])=>[partById.get(Number(id))?.code||id,seconds])),hints:assistance};
  });
  const taiwan=taiwanAttempts.map((attempt)=>{
    const problem=taiwanIndex.volumes.find((item)=>item.volume===Number(attempt.volume))?.problems.find((item)=>item.id===Number(attempt.problem_number)),time=taiwanTimes.get(String(attempt.id));
    const assistance=recentTaiwanHints.filter((hint)=>hint.attempt_id===attempt.id).map((hint)=>({item:hint.item_code,question:hint.question,full_solution:Boolean(hint.full_solution),at:hint.created_at}));
    return {source:"taiwan",problem:`Taiwan ${attempt.volume} · ${problem?.code||attempt.problem_number}`,title:problem?.title_pt,tags:[],status:attempt.status,finished_at:attempt.finished_at,total_seconds:time?.total_seconds||0,item_seconds:Object.fromEntries(time?.items||[]),hints:assistance};
  });
  const recentAttempts=[...xy,...taiwan].filter((attempt)=>attempt.total_seconds>0||attempt.hints.length>0||inWindow(attempt.finished_at,fromMs,toMs));
  const payload={
    format_version:3,
    purpose:"análise semanal de treino",
    exported_at:exportedAt.toISOString(),
    period:{days:WINDOW_DAYS,from:new Date(fromMs).toISOString(),to:exportedAt.toISOString()},
    summary:{completed_attempts:recentAttempts.filter((attempt)=>attempt.status==="completed"&&inWindow(attempt.finished_at,fromMs,toMs)).length,total_seconds:recentAttempts.reduce((sum,attempt)=>sum+attempt.total_seconds,0),hints_requested:recentAttempts.reduce((sum,attempt)=>sum+attempt.hints.length,0)},
    attempts:recentAttempts,
  };
  return new Response(JSON.stringify(payload,null,2),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="dados-treino-7-dias-${exportedAt.toISOString().slice(0,10)}.json"`}});
}
