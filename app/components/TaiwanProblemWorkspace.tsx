"use client";

import Link from "next/link";
import { useCallback,useMemo,useState } from "react";
import { BrownNoiseButton } from "./BrownNoiseButton";
import { formatTime,postJson,useClock,useTrainingData } from "./data";
import { Loading } from "./Loading";
import { MathHtml } from "./MathContent";

type TaiwanPart={code:string;ordinal:number;score:number|null;prompt_text:string};
type TaiwanProblem={id:number;code:string;title_pt:string;page_start:number;page_end:number;source_url:string;statement_html:string;solution_html:string|null;parts:TaiwanPart[]};
const segmentSeconds=(segment:{started_at:string;duration_seconds:number|null},now:number)=>segment.duration_seconds==null?Math.max(0,Math.floor((now-Date.parse(segment.started_at))/1000)):Number(segment.duration_seconds);

export function TaiwanProblemWorkspace({problem,totalProblems}:{problem:TaiwanProblem;totalProblems:number}) {
  const {data,error,loading,refresh}=useTrainingData();
  const now=useClock();
  const [busy,setBusy]=useState(false);
  const [minimized,setMinimized]=useState(false);
  const [solutionOpen,setSolutionOpen]=useState(false);
  const [aiMinimized,setAiMinimized]=useState(false);
  const [question,setQuestion]=useState("");
  const [hintBusy,setHintBusy]=useState(false);
  const [hintError,setHintError]=useState<string|null>(null);
  const attempts=useMemo(()=>data?.taiwanAttempts.filter((attempt)=>attempt.volume===10&&attempt.problem_number===problem.id)||[],[data,problem.id]);
  const active=attempts.find((attempt)=>attempt.status==="in_progress");
  const segments=useMemo(()=>data?.taiwanTimeSegments.filter((segment)=>segment.attempt_id===active?.id)||[],[data,active]);
  const total=segments.reduce((sum,segment)=>sum+segmentSeconds(segment,now),0);
  const currentPart=problem.parts.find((part)=>part.code===active?.active_item_code);
  const currentPartTime=currentPart?segments.filter((segment)=>segment.item_code===currentPart.code).reduce((sum,segment)=>sum+segmentSeconds(segment,now),0):0;
  const hints=(data?.taiwanHintEvents||[]).filter((hint)=>hint.attempt_id===active?.id&&hint.item_code===currentPart?.code);
  const linkedParts=useMemo(()=>problem.parts.map((part)=>({id:part.ordinal,code:part.code})),[problem.parts]);

  const act=useCallback(async(action:string,itemCode?:string)=>{
    if(!active)return;
    setBusy(true);
    try{await postJson(`/api/taiwan/attempts/${active.id}/timer`,{action,itemCode});await refresh({silent:true});}
    finally{setBusy(false);}
  },[active,refresh]);

  if(loading||!data)return <Loading error={error}/>;

  async function selectPart(ordinal:number){
    if(!data.canEdit)return;
    const part=problem.parts.find((item)=>item.ordinal===ordinal);if(!part)return;
    setBusy(true);
    try{
      let attemptId=active?.id;
      if(!attemptId){const created=await postJson("/api/taiwan/attempts",{volume:10,problemNumber:problem.id}) as {attempt:{id:string}};attemptId=created.attempt.id;}
      await postJson(`/api/taiwan/attempts/${attemptId}/timer`,{action:"select_item",itemCode:part.code});
      await refresh({silent:true});
    }finally{setBusy(false);}
  }
  async function finish(){if(active&&confirm("Finalizar esta questão? Ela passará a contar como concluída."))await act("finish");}
  async function discard(){if(active&&currentPart&&confirm(`Descartar somente o intervalo atual de ${currentPart.code}? O tempo anterior será mantido.`))await act("discard_current");}
  async function requestHint(){
    if(!active||!currentPart||!question.trim()||hintBusy)return;
    setHintBusy(true);setHintError(null);
    try{await postJson(`/api/taiwan/attempts/${active.id}/hints`,{question:question.trim(),requestId:crypto.randomUUID()});setQuestion("");await refresh({silent:true});}
    catch(caught){setHintError(caught instanceof Error?caught.message:"Não foi possível pedir o hint");}
    finally{setHintBusy(false);}
  }
  return <div className="problem-page taiwan-problem-page">
    <section className="problem-header"><div><p className="eyebrow">Taiwan · volume 10</p><h1><span>{problem.code}</span> {problem.title_pt}</h1></div><div className="source-links">{problem.solution_html&&<button type="button" className="solution-toggle" onClick={()=>setSolutionOpen((value)=>!value)}>{solutionOpen?"Ocultar resposta":"Mostrar resposta"}</button>}</div></section>
    <div className="workspace"><div className="problem-main-column">
      <section className="panel statement-panel"><MathHtml className="statement-content" html={problem.statement_html} parts={linkedParts} activePartId={active?.current_state==="item_active"?currentPart?.ordinal:null} disabled={busy||!data.canEdit} onPartClick={selectPart}/></section>
      {solutionOpen&&problem.solution_html&&<section className="panel solution-panel" aria-label="Resposta"><MathHtml className="statement-content solution-content" html={problem.solution_html}/></section>}
      <nav className="taiwan-problem-nav" aria-label="Navegação entre problemas"><span>{problem.id>1&&<Link href={`/problemas/taiwan/10/${problem.id-1}`}>← Anterior</Link>}</span><Link href="/problemas#taiwan">Todos</Link><span>{problem.id<totalProblems&&<Link href={`/problemas/taiwan/10/${problem.id+1}`}>Próximo →</Link>}</span></nav>
    </div><aside className={`timer-card ${minimized?"minimized":""}`}>
      {!data.canEdit?<span className="timer-state">Entre para treinar</span>:minimized?<button type="button" className="timer-collapsed" onClick={()=>setMinimized(false)} aria-label="Expandir cronômetro">⏱</button>:<><div className="timer-top"><div><span className="timer-state">{!active?"Clique em um item":active.current_state==="paused"?currentPart?`Pausado · ${currentPart.code}`:"Pausado":`Item ${currentPart?.code||""}`}</span>{active&&<strong className="timer-total">{formatTime(total)}</strong>}</div>{active&&<button className="icon-button" onClick={()=>setMinimized(true)} aria-label="Minimizar cronômetro">—</button>}</div>{active&&<><div className="timer-details">{currentPart&&<div><dt>{currentPart.code}</dt><span className="timer-current-actions"><dd>{formatTime(currentPartTime)}</dd>{active.current_state==="item_active"&&<button type="button" className="timer-discard" disabled={busy} onClick={discard} title="Descartar somente o intervalo atual">↶</button>}</span></div>}</div><div className="timer-actions">{(active.current_state!=="paused"||active.active_item_code)&&<button className="button" disabled={busy} onClick={()=>act(active.current_state==="paused"?"resume":"pause")}>{active.current_state==="paused"?"Continuar":"Pausar"}</button>}<button className="button danger" disabled={busy} onClick={finish}>Finalizar</button></div></>}</>}
    </aside></div>
    <BrownNoiseButton/>
    {data.canUseAi&&<aside className={`ai-hint-card ${aiMinimized?"minimized":""}`}><button type="button" className="ai-hint-head" onClick={()=>setAiMinimized((value)=>!value)}><span>IA{currentPart?` · ${currentPart.code}`:""}</span><b>{aiMinimized?"+":"−"}</b></button>{!aiMinimized&&<div className="ai-hint-body">{!active||!currentPart?<p>Clique em um item para pedir um hint.</p>:<>{hints.length>0&&<div className="hint-history">{hints.map((hint)=><article key={hint.id}>{hint.question&&<small>Você: {hint.question}</small>}<MathHtml className="hint-answer" html={hint.answer_html}/></article>)}</div>}<textarea value={question} maxLength={600} rows={2} disabled={hintBusy} onChange={(event)=>setQuestion(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void requestHint();}}} placeholder={hintBusy?"Pensando…":"Escreva sua dúvida e pressione Enter"}/>{hintError&&<p className="hint-error">{hintError}</p>}</>}</div>}</aside>}
    <section className="panel history"><div className="section-head"><h2>Dados pessoais desta questão</h2><span>{attempts.length} tentativa(s)</span></div>{attempts.length?<div className="history-list">{attempts.map((attempt)=>{const seconds=data.taiwanTimeSegments.filter((segment)=>segment.attempt_id===attempt.id).reduce((sum,segment)=>sum+segmentSeconds(segment,now),0);return <div key={attempt.id}><span>{attempt.status==="completed"?"Concluída":"Em andamento"}</span><strong>{formatTime(seconds)}</strong><small>{new Date(attempt.started_at).toLocaleString("pt-BR")}</small></div>;})}</div>:<p className="muted">Ainda não há treino registrado.</p>}</section>
  </div>;
}
