"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTime, postJson, secondsFor, useClock, useTrainingData } from "./data";
import { Loading } from "./Loading";
import { MathHtml } from "./MathContent";
import { isTheoryTag } from "./training-view-model.mjs";

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
  const [brownNoise,setBrownNoise] = useState(false);
  const noiseRef = useRef<{ context:AudioContext; source:AudioBufferSourceNode }|null>(null);
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
  const workedParts = parts.filter((part) => (partTimes.get(part.id) || 0) > 0);

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

  useEffect(() => () => {
    noiseRef.current?.source.stop();
    void noiseRef.current?.context.close();
  },[]);

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

  async function toggleBrownNoise() {
    if (noiseRef.current) {
      noiseRef.current.source.stop();
      await noiseRef.current.context.close();
      noiseRef.current = null;
      setBrownNoise(false);
      return;
    }
    const context = new AudioContext();
    const seconds = 8;
    const buffer = context.createBuffer(2,context.sampleRate*seconds,context.sampleRate);
    for (let channel=0;channel<buffer.numberOfChannels;channel++) {
      const samples = buffer.getChannelData(channel);
      let last = 0;
      for (let index=0;index<samples.length;index++) {
        const white = Math.random()*2-1;
        last = (last+0.02*white)/1.02;
        samples[index] = last*3.2;
      }
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0.12;
    source.connect(gain).connect(context.destination);
    source.start();
    noiseRef.current = { context,source };
    setBrownNoise(true);
  }

  return <div className="problem-page">
    <section className="problem-header">
      <div>
        <p className="eyebrow">{data.exams.find((exam) => exam.id === problem.exam_id)?.code} · {problem.kind === "experimental" ? "Experimental" : "Teórica"}</p>
        <h1><span>{problem.code}</span> {title}</h1>
        <div className="tag-line">{tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
      </div>
      <div className="source-links">
        {problem.statement_url && <a href={problem.statement_url} target="_blank" rel="noreferrer">Enunciado ↗</a>}
        {problem.solution_url && <a href={problem.solution_url} target="_blank" rel="noreferrer">Solução ↗</a>}
        {problem.marking_scheme_url && <a href={problem.marking_scheme_url} target="_blank" rel="noreferrer">Pontuação ↗</a>}
      </div>
    </section>
    <div className="workspace">
      <div className="problem-main-column">
        <section className="panel statement-panel">
          <p className="eyebrow statement-label">Enunciado</p>
          {statementError ? <p className="muted">{statementError}</p>
            : !statement ? <p className="muted">Carregando enunciado…</p>
            : statement.html ? <MathHtml className="statement-content" html={statement.html} parts={parts} activePartId={active?.current_state === "item_active" ? active.active_part_id : null} disabled={busy || !data.canEdit} onPartClick={selectPart}/>
            : statement.statementStatus === "authentication_required" ? <p className="muted">Este problema existe no índice XY, mas o enunciado público redireciona para autenticação. Nenhuma proteção foi contornada.</p>
            : <p className="muted">Enunciado não disponível no catálogo público.</p>}
        </section>
      </div>
      <aside className={`timer-card ${minimized ? "minimized" : ""}`}>
        {!data.canEdit ? <><span className="timer-state">Entre para treinar</span><p className="timer-instruction">Faça login para registrar seu próprio tempo.</p></> : <>
        <div className="timer-top"><div><span className="timer-state">{!active ? "Sem tentativa" : active.current_state === "paused" ? currentPart ? `Pausado · ${currentPart.code}` : "Selecione um item" : `Item ${currentPart?.code || ""}`}</span><strong className="timer-total">{formatTime(total)}</strong>{minimized && currentPart && <small className="timer-mini-time">{currentPart.code} · {formatTime(currentPartTime)}</small>}</div>{active && <button className="icon-button" onClick={() => setMinimized((value) => !value)} aria-label={minimized ? "Expandir cronômetro" : "Minimizar cronômetro"}>{minimized ? "□" : "—"}</button>}</div>
        {!minimized && <>{active ? <><div className="timer-details">{currentPart ? <div><dt>{active.current_state === "paused" ? "Último item" : "Item atual"} · {currentPart.code}</dt><span className="timer-current-actions"><dd>{formatTime(currentPartTime)}</dd>{active.current_state === "item_active" && <button type="button" className="timer-discard" disabled={busy} onClick={discardCurrent} aria-label={`Descartar intervalo atual de ${currentPart.code}`} title="Descartar somente o intervalo atual">↶</button>}</span></div> : <p className="timer-instruction">Clique em um item para começar.</p>}{workedParts.length > 0 && <div className="timer-part-times"><span>Tempo por item</span>{workedParts.map((part) => <small key={part.id}><b>{part.code}</b>{formatTime(partTimes.get(part.id) || 0)}</small>)}</div>}</div><div className="timer-actions">{(active.current_state !== "paused" || active.active_part_id) && <button className="button" disabled={busy} onClick={() => act(active.current_state === "paused" ? "resume" : "pause")}>{active.current_state === "paused" ? "Continuar" : "Pausar"}</button>}<button className="button danger" disabled={busy} onClick={finish}>FINALIZAR QUESTÃO</button></div><p className="shortcuts"><kbd>Espaço</kbd>/<kbd>P</kbd> pausa · <kbd>M</kbd> minimiza</p></> : <p className="timer-instruction">Clique em qualquer item para iniciar uma tentativa e contar o tempo.</p>}</>}
        </>}
        <button type="button" className={`noise-toggle ${brownNoise ? "active" : ""}`} aria-label={brownNoise ? "Parar brown noise" : "Ativar brown noise"} title={brownNoise ? "Parar brown noise" : "Ativar brown noise"} aria-pressed={brownNoise} onClick={toggleBrownNoise}><span aria-hidden="true">◖</span></button>
      </aside>
    </div>
    <section className="panel history"><div className="section-head"><h2>Dados pessoais desta questão</h2><span>{attempts.length} tentativa(s)</span></div>{attempts.length ? <div className="history-list">{attempts.map((attempt) => { const seconds = data.timeSegments.filter((segment) => segment.attempt_id === attempt.id).reduce((sum,segment) => sum + secondsFor(segment,now),0); return <div key={attempt.id}><span>{attempt.status === "completed" ? "Concluída" : "Em andamento"}</span><strong>{formatTime(seconds)}</strong><small>{new Date(attempt.started_at).toLocaleString("pt-BR")}</small></div>; })}</div> : <p className="muted">Ainda não há treino registrado.</p>}</section>
  </div>;
}
