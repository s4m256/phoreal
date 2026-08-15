import taiwanVolume10 from "../../../../data/taiwan/volume-10.json";
import { readAllData } from "../../../../db/runtime";
import { requireSiteUserApi } from "../../../chatgpt-auth";

export const dynamic="force-dynamic";
type Row=Record<string,unknown>;

function aggregateSegments(rows:Row[],itemField:string) {
  const byAttempt=new Map<string,{total_seconds:number;items:Map<string,number>}>();
  const now=Date.now();
  for(const row of rows) {
    const attemptId=String(row.attempt_id);
    const seconds=row.duration_seconds==null?Math.max(0,Math.floor((now-Date.parse(String(row.started_at)))/1000)):Number(row.duration_seconds);
    const entry=byAttempt.get(attemptId)??{total_seconds:0,items:new Map<string,number>()};
    entry.total_seconds+=seconds;
    const item=String(row[itemField]??"sem item");
    entry.items.set(item,(entry.items.get(item)??0)+seconds);
    byAttempt.set(attemptId,entry);
  }
  return byAttempt;
}

export async function GET() {
  const user=await requireSiteUserApi();if(user instanceof Response)return user;
  const data=await readAllData(user.userId);
  const problems=data.problems as Row[],exams=data.exams as Row[],parts=data.problemParts as Row[],tags=data.tags as Row[],problemTags=data.problemTags as Row[];
  const attempts=data.attempts as Row[],segments=data.timeSegments as Row[],hints=data.hintEvents as Row[];
  const taiwanAttempts=data.taiwanAttempts as Row[],taiwanSegments=data.taiwanTimeSegments as Row[],taiwanHints=data.taiwanHintEvents as Row[];
  const partById=new Map(parts.map((part)=>[Number(part.id),part]));
  const problemById=new Map(problems.map((problem)=>[Number(problem.id),problem]));
  const examById=new Map(exams.map((exam)=>[Number(exam.id),exam]));
  const tagById=new Map(tags.map((tag)=>[Number(tag.id),String(tag.name_pt||tag.name)]));
  const tagsByProblem=new Map<number,string[]>();
  for(const relation of problemTags){const name=tagById.get(Number(relation.tag_id));if(name){const id=Number(relation.problem_id);tagsByProblem.set(id,[...(tagsByProblem.get(id)||[]),name]);}}
  const xyTimes=aggregateSegments(segments,"problem_part_id"),twTimes=aggregateSegments(taiwanSegments,"item_code");
  const xy=attempts.map((attempt)=>{
    const problem=problemById.get(Number(attempt.problem_id)),exam=examById.get(Number(problem?.exam_id)),time=xyTimes.get(String(attempt.id));
    return {source:"xy",problem:`${String(exam?.code||"")} ${String(problem?.code||"")}`.trim(),title:problem?.title_pt||problem?.title,tags:tagsByProblem.get(Number(attempt.problem_id))||[],status:attempt.status,started_at:attempt.started_at,finished_at:attempt.finished_at,total_seconds:time?.total_seconds||0,item_seconds:Object.fromEntries([...(time?.items||new Map()).entries()].map(([id,seconds])=>[partById.get(Number(id))?.code||id,seconds])),assistance:hints.filter((hint)=>hint.attempt_id===attempt.id).map((hint)=>({item:partById.get(Number(hint.problem_part_id))?.code,question:hint.question,points_lost:hint.penalty,full_solution:Boolean(hint.full_solution),at:hint.created_at}))};
  });
  const taiwan=taiwanAttempts.map((attempt)=>{
    const problem=taiwanVolume10.problems.find((item)=>item.id===Number(attempt.problem_number)),time=twTimes.get(String(attempt.id));
    return {source:"taiwan",problem:`Taiwan 10 · ${problem?.code||attempt.problem_number}`,title:problem?.title_pt,status:attempt.status,started_at:attempt.started_at,finished_at:attempt.finished_at,total_seconds:time?.total_seconds||0,item_seconds:Object.fromEntries(time?.items||[]),assistance:taiwanHints.filter((hint)=>hint.attempt_id===attempt.id).map((hint)=>({item:hint.item_code,question:hint.question,full_solution:Boolean(hint.full_solution),at:hint.created_at}))};
  });
  const allAttempts=[...xy,...taiwan];
  const mockScores=data.mockExamProblemScores as Row[];
  const payload={
    format_version:2,purpose:"feedback de treino por IA",exported_at:new Date().toISOString(),period:{study_start:"2026-05-02",tbf:"2027-02-19"},
    summary:{completed_attempts:allAttempts.filter((attempt)=>attempt.status==="completed").length,total_seconds:allAttempts.reduce((sum,attempt)=>sum+attempt.total_seconds,0),hints:hints.length+taiwanHints.length,full_solutions:[...hints,...taiwanHints].filter((hint)=>Boolean(hint.full_solution)).length},
    attempts:allAttempts,
    mock_exams:(data.mockExams as Row[]).map((mock)=>({exam:mock.exam_name,date:mock.date,type:mock.type,total_score:mock.total_score,problem_scores:mockScores.filter((score)=>score.mock_exam_id===mock.id).map((score)=>({problem:score.problem_label||score.problem_number,score:score.score}))})),
    experiments:(data.experiments as Row[]).map((experiment)=>({title:experiment.title,date:experiment.date,notes:experiment.notes})),
  };
  return new Response(JSON.stringify(payload,null,2),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="feedback-treino-${new Date().toISOString().slice(0,10)}.json"`}});
}
