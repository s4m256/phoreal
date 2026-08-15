"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTime, postJson, secondsFor, useClock, useTrainingData } from "./data";
import { Loading } from "./Loading";
import { MathHtml } from "./MathContent";
import { isTheoryTag } from "./training-view-model.mjs";
import { selectedProblemArea } from "../lib/selected-problems.mjs";
import { BrownNoiseButton } from "./BrownNoiseButton";

type Statement = {
  html:string|null;
  language:"pt-BR"|"ru";
  statementStatus:string;
  translationStatus:"missing"|"draft"|"verified";
  hasDraft:boolean;
};

export function ProblemWorkspace() {
  const params = useParams<{id:string}>();
  const problemId = Number(params.id);
  const { data, error, loading, refresh } = useTrainingData();
  const now = useClock();
  const [busy,setBusy] = useState(false);
  const [minimized,setMinimized] = useState(false);
  const [statement,setStatement] = useState<Statement|null>(null);
  const [statementError,setStatementError] = useState<string|null>(null);
  const [solutionOpen,setSolutionOpen]=useState(false);
  const [solutionHtml,setSolutionHtml]=useState<string|null>(null);
  const [solutionBusy,setSolutionBusy]=useState(false);
  const [solutionError,setSolutionError]=useState<string|null>(null);
  const [aiMinimized,setAiMinimized] = useState(false);
  const [hintQuestion,setHintQuestion] = useState("");
  const [hintBusy,setHintBusy] = useState(false);
  const [hintError,setHintError] = useState<string|null>(null);
  const problem = data?.problems.find((item) => item.id === problemId);
  const parts = useMemo(() => data?.problemParts.filter((part) => part.problem_id === problemId) || [], [data,problemId]);
  const attempts = useMemo(() => data?.attempts.filter((attempt) => attempt.problem_id === problemId) || [], [data,problemId]);
  const active = attempts.find((attempt) => attempt.status === "in_progress");
  const segments = useMemo(() => data?.timeSegments.filter((segment) => segment.attempt_id === active?.id) || [], [data,active]);
  const total = segments.reduce((sum,segment) => sum + secondsFor(segment,now), 0);
  const partTimes = new Map<number,number>();
  for (const segment of segments) if (segment.problem_part_id) partTimes.set(segment.problem_part_id,(partTimes.get(segment.problem_part_id) || 0) + secondsFor(segment,now));
  const currentPart = parts.find((part) => part.id === active?.active_part_id);
  const currentPartTime = currentPart ? partTimes.get(currentPart.id) || 0 : 0;
  const hintEvents = (data?.hintEvents || []).filter((hint) => hint.attempt_id === active?.id);
  const currentHints = hintEvents.filter((hint) => hint.problem_part_id === currentPart?.id);
  const currentPenalty = currentHints.reduce((sum,hint) => sum+Number(hint.penalty||0),0);
  const currentAutonomy = currentPart?.score == null ? null : Math.max(0,currentPart.score-currentPenalty);
  const formatPoints = (value:number) => Number(value.toFixed(2)).toLocaleString("pt-BR");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/problems/${problemId}/statement`, { cache:"no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Falha ao carregar o enunciado");
        if (!cancelled) setStatement(payload);
      })
      .catch((fetchError) => { if (!cancelled) setStatementError(fetchError instanceof Error ? fetchError.message : "Falha ao carregar o enunciado"); });
    return () => { cancelled = true; };
  }, [problemId]);

  const act = useCallback(async (action:string,partId?:number) => {
    if (!active) return;
    setBusy(true);
    try { await postJson(`/api/attempts/${active.id}/timer`,{action,partId}); await refresh({silent:true}); }
    finally { setBusy(false); }
  }, [active,refresh]);

  useEffect(() => {
    function key(event:KeyboardEvent) {
      if (!data?.canEdit || !active || busy || ["INPUT","TEXTAREA","SELECT"].includes((event.target as HTMLElement).tagName)) return;
      if (event.code === "KeyM") { setMinimized((value) => !value); return; }
      if (event.code === "KeyP" || event.code === "Space") { event.preventDefault(); if (active.current_state !== "paused" || active.active_part_id) void act(active.current_state === "paused" ? "resume" : "pause"); }
    }
    window.addEventListener("keydown",key);
    return () => window.removeEventListener("keydown",key);
  }, [active,busy,act,data?.canEdit]);

  if (loading || !data) return <Loading error={error}/>;
  if (!problem) return <section className="empty"><strong>Questão não encontrada</strong></section>;
  const translated = problem.translation_status === "draft" || problem.translation_status === "verified";
  const title = translated && problem.title_pt ? problem.title_pt : problem.title;
  const tags = data.problemTags.filter((row) => row.problem_id === problem.id).map((row) => {
    const tag = data.tags.find((item) => item.id === row.tag_id);
    return translated && tag?.name_pt ? tag.name_pt : tag?.name;
  }).filter((tag): tag is string => Boolean(tag) && isTheoryTag(tag));
  const selectedArea = selectedProblemArea(problem.source_id);

  async function selectPart(partId:number) {
    if (!data.canEdit) return;
    setBusy(true);
    try {
      let attemptId = active?.id;
      if (!attemptId) {
        const created = await postJson("/api/attempts",{problemId}) as { attempt:{ id:string } };
        attemptId = created.attempt.id;
      }
      await postJson(`/api/attempts/${attemptId}/timer`,{action:"select_part",partId});
      await refresh({silent:true});
    }
    finally { setBusy(false); }
  }
  async function finish() {
    if (!active || !confirm("Finalizar esta questão? Ela passará a contar como concluída.")) return;
    await act("finish");
  }

  async function discardCurrent() {
    if (!active || active.current_state !== "item_active" || !currentPart) return;
    if (!confirm(`Descartar somente o intervalo atual de ${currentPart.code}? O tempo anterior será mantido.`)) return;
    await act("discard_current");
  }

  async function toggleSolution() {
    if (solutionOpen) { setSolutionOpen(false); return; }
    setSolutionOpen(true);
    if (solutionHtml || solutionBusy) return;
    setSolutionBusy(true); setSolutionError(null);
    try {
      const response=await fetch(`/api/problems/${problemId}/solution`,{cache:"no-store"});
      const payload=await response.json() as {html?:string|null;error?:string};
      if(!response.ok) throw new Error(payload.error||"Não foi possível carregar a resposta");
      setSolutionHtml(payload.html||null);
    } catch(error) { setSolutionError(error instanceof Error?error.message:"Não foi possível carregar a resposta"); }
    finally { setSolutionBusy(false); }
  }

  async function requestHint() {
    if (!active || !currentPart || hintBusy || !hintQuestion.trim()) return;
    setHintBusy(true); setHintError(null);
    try {
      await postJson(`/api/attempts/${active.id}/hints`,{
        question:hintQuestion.trim() || undefined,
        requestId:crypto.randomUUID(),
      });
      setHintQuestion("");
      await refresh({silent:true});
    } catch(error) {
      setHintError(error instanceof Error ? error.message : "N\u00e3o foi poss\u00edvel pedir o hint");
    } finally { setHintBusy(false); }
  }
  return <div className="problem-page">
    <section className="problem-header">
      <div>
        <p className="eyebrow">{data.exams.find((exam) => exam.id === problem.exam_id)?.code} · {problem.kind === "experimental" ? "Experimental" : "Teórica"}</p>
        <h1><span>{problem.code}</span> {title}{selectedArea&&<span className="selected-star problem-selected-star" title={`Selecionada em ${selectedArea}`} aria-label={`Selecionada em ${selectedArea}`}>★</span>}</h1>
        <div className="tag-line">{tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
      </div>
      <div className="source-links">{problem.solution_url&&<button type="button" className="solution-toggle" onClick={toggleSolution}>{solutionOpen?"Ocultar resposta":"Mostrar resposta"}</button>}</div>
    </section>
    <div className="workspace">
      <div className="problem-main-column">
        <section className="panel statement-panel">
          {statementError ? <p className="muted">{statementError}</p>
            : !statement ? <p className="muted">Carregando enunciado…</p>
            : statement.html ? <MathHtml className="statement-content" html={statement.html} parts={parts} activePartId={active?.current_state === "item_active" ? active.active_part_id : null} disabled={busy || !data.canEdit} onPartClick={selectPart}/>
            : statement.statementStatus === "authentication_required" ? <p className="muted">Este problema existe no índice XY, mas o enunciado público redireciona para autenticação. Nenhuma proteção foi contornada.</p>
            : <p className="muted">Enunciado não disponível no catálogo público.</p>}
        </section>
        {solutionOpen&&<section className="panel solution-panel" aria-label="Resposta oficial">{solutionBusy?<p className="muted">Carregando resposta…</p>:solutionError?<p className="muted">{solutionError}</p>:solutionHtml?<MathHtml className="statement-content solution-content" html={solutionHtml}/>:<p className="muted">Resposta oficial não disponível.</p>}</section>}
      </div>
      <aside className={`timer-card ${minimized ? "minimized" : ""}`}>
        {!data.canEdit ? <><span className="timer-state">Entre para treinar</span><p className="timer-instruction">Faça login para registrar seu próprio tempo.</p></> : minimized ?
          <button type="button" className="timer-collapsed" onClick={() => setMinimized(false)} aria-label="Expandir cronômetro" title="Expandir cronômetro">⏱</button>
          : <>
            <div className="timer-top"><div><span className="timer-state">{!active ? "Clique em um item" : active.current_state === "paused" ? currentPart ? `Pausado · ${currentPart.code}` : "Pausado" : `Item ${currentPart?.code || ""}`}</span>{active && <strong className="timer-total">{formatTime(total)}</strong>}</div>{active && <button className="icon-button" onClick={() => setMinimized(true)} aria-label="Minimizar cronômetro">—</button>}</div>
            {active && <><div className="timer-details">{currentPart && <div><dt>{currentPart.code}</dt><span className="timer-current-actions"><dd>{formatTime(currentPartTime)}</dd>{active.current_state === "item_active" && <button type="button" className="timer-discard" disabled={busy} onClick={discardCurrent} aria-label={`Descartar intervalo atual de ${currentPart.code}`} title="Descartar somente o intervalo atual">↶</button>}</span></div>}</div><div className="timer-actions">{(active.current_state !== "paused" || active.active_part_id) && <button className="button" disabled={busy} onClick={() => act(active.current_state === "paused" ? "resume" : "pause")}>{active.current_state === "paused" ? "Continuar" : "Pausar"}</button>}<button className="button danger" disabled={busy} onClick={finish}>Finalizar</button></div></>}
          </>}
      </aside>
    </div>
    <BrownNoiseButton/>
    {data.canUseAi && <aside className={`ai-hint-card ${aiMinimized ? "minimized" : ""}`}>
      <button type="button" className="ai-hint-head" onClick={() => setAiMinimized((value) => !value)} aria-expanded={!aiMinimized}>
        <span>IA{currentPart ? ` · ${currentPart.code}` : ""}</span><b>{aiMinimized ? "+" : "−"}</b>
      </button>
      {!aiMinimized && <div className="ai-hint-body">
        {!data.canEdit ? <p>Entre para usar hints.</p>
          : !active || !currentPart ? <p>{"Clique em um item da quest\u00e3o para pedir um hint."}</p>
          : <>
            <div className="autonomy-line">
              <span>Autonomia do item</span>
              <strong>{currentAutonomy == null ? "sem pontua\u00e7\u00e3o" : `${formatPoints(currentAutonomy)} / ${formatPoints(Number(currentPart.score))}`}</strong>
            </div>
            {currentHints.length > 0 && <div className="hint-history">{currentHints.map((hint) => <article key={hint.id}>
              {hint.question && <small>Você: {hint.question}</small>}
              <MathHtml className="hint-answer" html={hint.answer_html}/>
              <span>{hint.full_solution ? "solu\u00e7\u00e3o completa" : `-${formatPoints(Number(hint.penalty))} ponto${Number(hint.penalty)===1?"":"s"}`}</span>
            </article>)}</div>}
            <textarea value={hintQuestion} maxLength={600} rows={2} disabled={hintBusy} onChange={(event) => setHintQuestion(event.target.value)} onKeyDown={(event) => { if (event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing) { event.preventDefault(); void requestHint(); } }} placeholder={hintBusy ? "Pensando…" : "Escreva sua dúvida e pressione Enter"}/>
            {hintError && <p className="hint-error">{hintError}</p>}
          </>}
      </div>}
    </aside>}
    <section className="panel history"><div className="section-head"><h2>Dados pessoais desta questão</h2><span>{attempts.length} tentativa(s)</span></div>{attempts.length ? <div className="history-list">{attempts.map((attempt) => { const seconds = data.timeSegments.filter((segment) => segment.attempt_id === attempt.id).reduce((sum,segment) => sum + secondsFor(segment,now),0); return <div key={attempt.id}><span>{attempt.status === "completed" ? "Concluída" : "Em andamento"}</span><strong>{formatTime(seconds)}</strong><small>{new Date(attempt.started_at).toLocaleString("pt-BR")}</small></div>; })}</div> : <p className="muted">Ainda não há treino registrado.</p>}</section>
  </div>;
}
