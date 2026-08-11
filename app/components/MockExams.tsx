"use client";

import { FormEvent, useRef, useState } from "react";
import { type MockExam, postJson, useTrainingData } from "./data";
import { Loading } from "./Loading";

type ScoreDraft = { label:string; score:string };
type FormDraft = { examName:string; date:string; type:"theoretical"|"experimental"; totalScore:string; driveUrl:string };

const freshScores = ():ScoreDraft[] => [1,2,3].map((number) => ({label:`Questão ${number}`,score:""}));
const freshForm = ():FormDraft => ({examName:"",date:"",type:"theoretical",totalScore:"",driveUrl:""});

export function MockExams() {
  const { data, error, loading, refresh } = useTrainingData();
  const [form,setForm] = useState<FormDraft>(freshForm);
  const [scores,setScores] = useState<ScoreDraft[]>(freshScores);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const formRef = useRef<HTMLElement|null>(null);
  if (loading || !data) return <Loading error={error}/>;

  function resetForm() {
    setForm(freshForm());
    setScores(freshScores());
    setEditingId(null);
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await postJson("/api/mock-exams",{
        id:editingId, examName:form.examName, date:form.date, type:form.type,
        totalScore:Number(form.totalScore), driveUrl:form.driveUrl,
        problemScores:scores.flatMap((row,index) => row.score.trim()==="" ? [] : [{problemNumber:index+1,problemLabel:row.label.trim() || `Questão ${index+1}`,score:Number(row.score)}]),
      },editingId ? "PATCH" : "POST");
      resetForm();
      await refresh();
    } finally { setBusy(false); }
  }

  function editMock(mock:MockExam) {
    const rows=data.mockExamProblemScores.filter((score)=>score.mock_exam_id===mock.id).sort((a,b)=>a.problem_number-b.problem_number);
    setEditingId(mock.id);
    setForm({examName:mock.exam_name,date:mock.date,type:mock.type,totalScore:String(mock.total_score),driveUrl:mock.drive_url||""});
    setScores(rows.length ? rows.map((row)=>({label:row.problem_label||`Questão ${row.problem_number}`,score:String(row.score)})) : freshScores());
    requestAnimationFrame(()=>formRef.current?.scrollIntoView({block:"start"}));
  }

  const chronological=[...data.mockExams].sort((a,b)=>a.date.localeCompare(b.date));
  const chartMax=Math.max(1,...chronological.map((mock)=>Number(mock.total_score)));

  return <>
    <section className="page-head"><p className="eyebrow">Provas feitas offline</p><h1>Simulados</h1><p className="muted">Cadastre provas como IPhO e APhO. Elas ficam separadas das questões isoladas do catálogo XY.</p></section>
    {data.canEdit&&<section className="panel" ref={formRef}><form className="mock-form" onSubmit={submit}>
      <div className="section-head"><h2>{editingId?"Editar simulado":"Novo simulado"}</h2>{editingId&&<button className="text-button" type="button" onClick={resetForm}>cancelar</button>}</div>
      <div className="form-grid">
        <label className="span-2">Prova<input required value={form.examName} onChange={(event)=>setForm({...form,examName:event.target.value})}/></label>
        <label>Data<input required type="date" value={form.date} onChange={(event)=>setForm({...form,date:event.target.value})}/></label>
        <label>Tipo<select value={form.type} onChange={(event)=>setForm({...form,type:event.target.value as FormDraft["type"]})}><option value="theoretical">Teórico</option><option value="experimental">Experimental</option></select></label>
        <label>Nota total<input required type="number" step="0.01" min="0" value={form.totalScore} onChange={(event)=>setForm({...form,totalScore:event.target.value})}/></label>
        <label className="span-2">Link da prova ou correção no Google Drive<input type="url" value={form.driveUrl} onChange={(event)=>setForm({...form,driveUrl:event.target.value})}/></label>
      </div>
      <div className="problem-scores"><div className="section-head"><h2>Notas por questão</h2><button className="button ghost" type="button" onClick={() => setScores([...scores,{label:`Questão ${scores.length+1}`,score:""}])}>Adicionar questão</button></div>
        {scores.map((row,index) => <div className="score-row" key={index}><input aria-label={`Nome da questão ${index+1}`} value={row.label} onChange={(event) => setScores(scores.map((item,i) => i===index?{...item,label:event.target.value}:item))}/><input aria-label={`Nota da questão ${index+1}`} type="number" step="0.01" min="0" value={row.score} onChange={(event) => setScores(scores.map((item,i) => i===index?{...item,score:event.target.value}:item))}/>{scores.length>1&&<button className="remove-row" type="button" aria-label={`Remover questão ${index+1}`} onClick={() => setScores(scores.filter((_,i) => i!==index))}>×</button>}</div>)}
      </div>
      <button disabled={busy} className="button" type="submit">{editingId?"Salvar alterações":"Salvar simulado"}</button>
    </form></section>}

    {chronological.length>0&&<section className="panel mock-chart-panel"><div className="section-head"><div><p className="eyebrow">Desempenho</p><h2>Notas dos simulados</h2></div><span className="muted">Notas brutas; as escalas podem variar.</span></div><div className="mock-score-chart">{chronological.map((mock)=><div className="mock-score-column" key={mock.id} title={`${mock.exam_name}: ${mock.total_score}`}><strong>{mock.total_score}</strong><i className={mock.type} style={{height:`${Math.max(4,(Number(mock.total_score)/chartMax)*100)}%`}}/><span>{mock.exam_name}</span><small>{new Date(`${mock.date}T12:00:00`).toLocaleDateString("pt-BR",{month:"2-digit",year:"2-digit"})}</small></div>)}</div></section>}

    <section className="panel"><div className="section-head"><h2>Histórico</h2><span>{data.mockExams.length} registro(s)</span></div>{data.mockExams.length?<div className="mock-history">{data.mockExams.map((mock) => { const rows=data.mockExamProblemScores.filter((score)=>score.mock_exam_id===mock.id).sort((a,b)=>a.problem_number-b.problem_number); const rowMax=Math.max(1,...rows.map((row)=>Number(row.score))); return <article key={mock.id}><div><span>{new Date(`${mock.date}T12:00:00`).toLocaleDateString("pt-BR")} · {mock.type==="theoretical"?"Teórico":"Experimental"}</span><h3>{mock.exam_name}</h3></div><div className="mock-total"><strong>{mock.total_score}</strong>{data.canEdit&&<button className="text-button" type="button" onClick={()=>editMock(mock)}>editar</button>}</div>{rows.length?<div className="mock-problem-bars">{rows.map((row)=><div key={row.id}><span>{row.problem_label||`Questão ${row.problem_number}`}</span><i><b style={{width:`${(Number(row.score)/rowMax)*100}%`}}/></i><strong>{row.score}</strong></div>)}</div>:<p>Sem notas por questão</p>}{mock.drive_url&&<a href={mock.drive_url} target="_blank" rel="noreferrer">Abrir no Drive ↗</a>}</article> })}</div>:<p className="muted">Nenhum simulado cadastrado.</p>}</section>
  </>;
}
