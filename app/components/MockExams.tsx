"use client";

import { FormEvent, useState } from "react";
import { postJson, useTrainingData } from "./data";
import { Loading } from "./Loading";

type ScoreDraft = { label:string; score:string };

export function MockExams() {
  const { data, error, loading, refresh } = useTrainingData();
  const [scores,setScores] = useState<ScoreDraft[]>([{ label:"Questão 1", score:"" }]);
  const [busy,setBusy] = useState(false);
  if (loading || !data) return <Loading error={error}/>;

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await postJson("/api/mock-exams",{
        examName:form.get("examName"), date:form.get("date"), type:form.get("type"),
        totalScore:Number(form.get("totalScore")), driveUrl:form.get("driveUrl"),
        problemScores:scores.map((row,index) => ({ problemNumber:index+1, problemLabel:row.label.trim() || `Questão ${index+1}`, score:Number(row.score) })).filter((row) => Number.isFinite(row.score)),
      });
      setScores([{ label:"Questão 1", score:"" }]);
      event.currentTarget.reset();
      await refresh();
    } finally { setBusy(false); }
  }

  return <>
    <section className="page-head"><p className="eyebrow">Provas feitas offline</p><h1>Simulados</h1><p className="muted">Cadastre provas como IPhO e APhO. Elas ficam separadas das questões isoladas do catálogo XY.</p></section>
    {data.canEdit&&<section className="panel"><form className="mock-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="span-2">Prova<input required name="examName" placeholder="IPhO 2022"/></label>
        <label>Data<input required name="date" type="date"/></label>
        <label>Tipo<select name="type"><option value="theoretical">Teórico</option><option value="experimental">Experimental</option></select></label>
        <label>Nota total<input required name="totalScore" type="number" step="0.01" min="0"/></label>
        <label className="span-2">Link da prova ou correção no Google Drive<input name="driveUrl" type="url" placeholder="https://drive.google.com/…"/></label>
      </div>
      <div className="problem-scores"><div className="section-head"><h2>Notas por questão</h2><button className="button ghost" type="button" onClick={() => setScores([...scores,{label:`Questão ${scores.length+1}`,score:""}])}>Adicionar questão</button></div>
        {scores.map((row,index) => <div className="score-row" key={index}><input aria-label={`Nome da questão ${index+1}`} value={row.label} onChange={(event) => setScores(scores.map((item,i) => i===index?{...item,label:event.target.value}:item))}/><input aria-label={`Nota da questão ${index+1}`} type="number" step="0.01" min="0" placeholder="nota" value={row.score} onChange={(event) => setScores(scores.map((item,i) => i===index?{...item,score:event.target.value}:item))}/>{scores.length>1&&<button className="remove-row" type="button" aria-label={`Remover questão ${index+1}`} onClick={() => setScores(scores.filter((_,i) => i!==index))}>×</button>}</div>)}
      </div>
      <button disabled={busy} className="button" type="submit">Salvar simulado</button>
    </form></section>}
    <section className="panel"><div className="section-head"><h2>Histórico</h2><span>{data.mockExams.length} registro(s)</span></div>{data.mockExams.length?<div className="mock-history">{data.mockExams.map((mock) => { const rows=data.mockExamProblemScores.filter((score)=>score.mock_exam_id===mock.id).sort((a,b)=>a.problem_number-b.problem_number); return <article key={mock.id}><div><span>{new Date(`${mock.date}T12:00:00`).toLocaleDateString("pt-BR")} · {mock.type==="theoretical"?"Teórico":"Experimental"}</span><h3>{mock.exam_name}</h3></div><strong>{mock.total_score}</strong><p>{rows.map((row)=>`${row.problem_label || `Questão ${row.problem_number}`}: ${row.score}`).join(" · ")||"Sem notas por questão"}</p>{mock.drive_url&&<a href={mock.drive_url} target="_blank" rel="noreferrer">Abrir no Drive ↗</a>}</article> })}</div>:<p className="muted">Nenhum simulado cadastrado.</p>}</section>
  </>;
}
