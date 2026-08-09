"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTime, postJson, secondsFor, useClock, useTrainingData } from "./data";
import { Loading } from "./Loading";

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
  const problem = data?.problems.find((item) => item.id === problemId);
  const parts = useMemo(() => data?.problemParts.filter((part) => part.problem_id === problemId) || [], [data,problemId]);
  const attempts = useMemo(() => data?.attempts.filter((attempt) => attempt.problem_id === problemId) || [], [data,problemId]);
  const active = attempts.find((attempt) => attempt.status === "in_progress");
  const segments = useMemo(() => data?.timeSegments.filter((segment) => segment.attempt_id === active?.id) || [], [data,active]);
  const total = segments.reduce((sum,segment) => sum + secondsFor(segment,now), 0);
  const initial = segments.filter((segment) => segment.state === "initial_reading").reduce((sum,segment) => sum + secondsFor(segment,now), 0);
  const partTimes = new Map<number,number>();
  for (const segment of segments) if (segment.problem_part_id) partTimes.set(segment.problem_part_id,(partTimes.get(segment.problem_part_id) || 0) + secondsFor(segment,now));

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
    try { await postJson(`/api/attempts/${active.id}/timer`,{action,partId}); await refresh(); }
    finally { setBusy(false); }
  }, [active,refresh]);

  useEffect(() => {
    function key(event:KeyboardEvent) {
      if (!active || busy || ["INPUT","TEXTAREA","SELECT"].includes((event.target as HTMLElement).tagName)) return;
      if (event.code === "KeyM") { setMinimized((value) => !value); return; }
      if (event.code === "KeyP" || event.code === "Space") { event.preventDefault(); void act(active.current_state === "paused" ? "resume" : "pause"); return; }
      const number = Number(event.key);
      if (number >= 1 && number <= 9 && parts[number-1]) void act("select_part",parts[number-1].id);
    }
    window.addEventListener("keydown",key);
    return () => window.removeEventListener("keydown",key);
  }, [active,busy,parts,act]);

  if (loading || !data) return <Loading error={error}/>;
  if (!problem) return <section className="empty"><strong>Questão não encontrada</strong></section>;
  const translated = problem.translation_status === "verified";
  const title = translated && problem.title_pt ? problem.title_pt : problem.title;
  const tags = data.problemTags.filter((row) => row.problem_id === problem.id).map((row) => {
    const tag = data.tags.find((item) => item.id === row.tag_id);
    return translated && tag?.name_pt ? tag.name_pt : tag?.name;
  }).filter(Boolean) as string[];

  async function start() {
    setBusy(true);
    try { await postJson("/api/attempts",{problemId}); await refresh(); }
    finally { setBusy(false); }
  }
  async function finish() {
    if (!active || !confirm("Finalizar esta questão? Ela passará a contar como concluída.")) return;
    await act("finish");
  }

  return <>
    <section className="problem-header">
      <div>
        <p className="eyebrow">{data.exams.find((exam) => exam.id === problem.exam_id)?.code} · {problem.kind === "experimental" ? "Experimental" : "Teórica"}</p>
        <h1><span>{problem.code}</span> {title}</h1>
        <div className="tag-line">{tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
      </div>
      <div className="source-links">
        <a href={problem.source_url} target="_blank" rel="noreferrer">Página original ↗</a>
        {problem.statement_url && <a href={problem.statement_url} target="_blank" rel="noreferrer">Enunciado ↗</a>}
        {problem.solution_url && <a href={problem.solution_url} target="_blank" rel="noreferrer">Solução ↗</a>}
        {problem.marking_scheme_url && <a href={problem.marking_scheme_url} target="_blank" rel="noreferrer">Pontuação ↗</a>}
      </div>
    </section>
    <div className="workspace">
      <div className="problem-main-column">
        <section className="panel statement-panel">
          <div className="section-head">
            <div><p className="eyebrow">Enunciado</p><h2>{statement?.language === "pt-BR" ? "Português verificado" : "Original do pho.rs"}</h2></div>
            {statement?.hasDraft && <span className="review-badge">Tradução em revisão</span>}
          </div>
          {statementError ? <p className="muted">{statementError}</p>
            : !statement ? <p className="muted">Carregando enunciado…</p>
            : statement.html ? <div className="statement-content" lang={statement.language} dangerouslySetInnerHTML={{__html:statement.html}}/>
            : statement.statementStatus === "authentication_required" ? <p className="muted">Este problema existe no índice XY, mas o enunciado público redireciona para autenticação. Nenhuma proteção foi contornada.</p>
            : <p className="muted">Enunciado não disponível no catálogo público.</p>}
        </section>
        <section className="panel parts-panel">
          <div className="section-head"><div><p className="eyebrow">Itens</p><h2>Selecione o que está trabalhando</h2></div><span className="muted">A atividade vem do timer.</span></div>
          <div className="part-list">{parts.map((part,index) => <button disabled={!active || busy} className={`part-card ${active?.active_part_id === part.id && active.current_state !== "paused" ? "active" : ""}`} onClick={() => act("select_part",part.id)} key={part.id}>
            <span className="part-code">{part.code}<small>{index < 9 ? index+1 : ""}</small></span>
            <span className="part-prompt">{translated && part.prompt_text_pt ? part.prompt_text_pt : part.prompt_text || "Item sem descrição importada"}</span>
            <strong>{formatTime(partTimes.get(part.id) || 0)}</strong>
          </button>)}</div>
        </section>
      </div>
      <aside className={`timer-card ${minimized ? "minimized" : ""}`}>
        <div className="timer-top"><div><span className="timer-state">{!active ? "Sem tentativa" : active.current_state === "paused" ? "Pausado" : active.current_state === "initial_reading" ? "Leitura inicial" : `Item ${parts.find((part) => part.id === active.active_part_id)?.code || ""}`}</span><strong className="timer-total">{formatTime(total)}</strong></div>{active && <button className="icon-button" onClick={() => setMinimized((value) => !value)} aria-label={minimized ? "Expandir cronômetro" : "Minimizar cronômetro"}>{minimized ? "□" : "—"}</button>}</div>
        {!minimized && <>{active ? <><dl className="timer-details"><div><dt>Leitura inicial</dt><dd>{formatTime(initial)}</dd></div><div><dt>Itens ativos</dt><dd>{formatTime(total-initial)}</dd></div></dl><div className="timer-actions"><button className="button" disabled={busy} onClick={() => act(active.current_state === "paused" ? "resume" : "pause")}>{active.current_state === "paused" ? "Continuar" : "Pausar"}</button><button className="button danger" disabled={busy} onClick={finish}>FINALIZAR QUESTÃO</button></div><p className="shortcuts"><kbd>Espaço</kbd>/<kbd>P</kbd> pausa · <kbd>1–9</kbd> item · <kbd>M</kbd> minimiza</p></> : <button className="button wide" disabled={busy} onClick={start}>{attempts.length ? "Refazer — nova tentativa" : "Iniciar tentativa"}</button>}</>}
      </aside>
    </div>
    <section className="panel history"><div className="section-head"><h2>Dados pessoais desta questão</h2><span>{attempts.length} tentativa(s)</span></div>{attempts.length ? <div className="history-list">{attempts.map((attempt) => { const seconds = data.timeSegments.filter((segment) => segment.attempt_id === attempt.id).reduce((sum,segment) => sum + secondsFor(segment,now),0); return <div key={attempt.id}><span>{attempt.status === "completed" ? "Concluída" : "Em andamento"}</span><strong>{formatTime(seconds)}</strong><small>{new Date(attempt.started_at).toLocaleString("pt-BR")}</small></div>; })}</div> : <p className="muted">Ainda não há treino registrado.</p>}</section>
  </>;
}
