"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatHoursMinutes, formatTime, median, postJson, secondsFor, useClock, useTrainingData } from "./data";
import { Loading } from "./Loading";

const dayKey = (date:Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const dayStart = (date:Date) => new Date(date.getFullYear(),date.getMonth(),date.getDate());

function dailySeconds(startedAt:string,seconds:number,target:Map<string,number>) {
  let cursor = new Date(startedAt);
  const finish = new Date(cursor.getTime()+seconds*1000);
  while (cursor < finish) {
    const next = new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1);
    const boundary = next < finish ? next : finish;
    const slice = Math.max(0,Math.floor((boundary.getTime()-cursor.getTime())/1000));
    const key = dayKey(cursor);
    target.set(key,(target.get(key)||0)+slice);
    cursor = boundary;
  }
}

export function Dashboard() {
  const {data,error,loading,refresh}=useTrainingData();
  const [date,setDate]=useState("");
  const [saving,setSaving]=useState(false);
  const now=useClock(30000);
  const metrics=useMemo(() => {
    if (!data || !now) return null;
    const completed=data.attempts.filter((attempt) => attempt.status==="completed");
    const attemptSeconds=new Map<string,number>();
    const itemSeconds=new Map<string,number>();
    const daily=new Map<string,number>();
    let totalSeconds=0;
    for (const segment of data.timeSegments) {
      const seconds=secondsFor(segment,now);
      totalSeconds+=seconds;
      attemptSeconds.set(segment.attempt_id,(attemptSeconds.get(segment.attempt_id)||0)+seconds);
      if (segment.problem_part_id) {
        const key=`${segment.attempt_id}:${segment.problem_part_id}`;
        itemSeconds.set(key,(itemSeconds.get(key)||0)+seconds);
      }
      dailySeconds(segment.started_at,seconds,daily);
    }
    const todayKey=dayKey(new Date(now));
    const start=dayStart(new Date(now));
    start.setDate(start.getDate()-((start.getDay()+6)%7)-25*7);
    const heatmap=Array.from({length:26*7},(_,index) => {
      const value=new Date(start);
      value.setDate(start.getDate()+index);
      const key=dayKey(value);
      const seconds=value.getTime()>dayStart(new Date(now)).getTime()?null:(daily.get(key)||0);
      return {key,date:value,seconds};
    });
    const tags=data.tags.map((tag) => {
      const problemIds=new Set(data.problemTags.filter((row) => row.tag_id===tag.id).map((row) => row.problem_id));
      const resolved=completed.filter((attempt) => problemIds.has(attempt.problem_id)).length;
      const attemptIds=new Set(data.attempts.filter((attempt) => problemIds.has(attempt.problem_id)).map((attempt) => attempt.id));
      const seconds=[...attemptSeconds].filter(([attemptId]) => attemptIds.has(attemptId)).reduce((sum,[,value]) => sum+value,0);
      const partIds=new Set(data.problemParts.filter((part) => problemIds.has(part.problem_id)).map((part) => part.id));
      const itemSamples=[...itemSeconds].filter(([key]) => partIds.has(Number(key.split(":")[1]))).map(([,value]) => value);
      return {name:tag.name_pt||tag.name,resolved,seconds,items:itemSamples.length,median:median(itemSamples)};
    }).filter((tag) => tag.resolved||tag.seconds).sort((a,b) => b.seconds-a.seconds);
    return {completed,totalSeconds,todaySeconds:daily.get(todayKey)||0,heatmap,tags};
  },[data,now]);

  if (loading||!data||!metrics||!now) return <Loading error={error}/>;
  const configured=data.settings.tbf_date;
  const days=configured?Math.ceil((Date.parse(`${configured}T23:59:59`)-now)/86400000):null;
  async function saveDate(){setSaving(true);try{await postJson("/api/settings",{tbfDate:date||configured});await refresh();setDate("");}finally{setSaving(false);}}

  return <>
    <section className="hero"><div><p className="eyebrow">Treino de física</p><h1>Resumo</h1><p className="muted">Tempo efetivo e questões finalizadas.</p></div><div className="countdown"><span>TBF</span><strong>{days==null?"—":days<0?"já ocorreu":`${days} dias`}</strong><div className="inline-form"><input aria-label="Data do TBF" type="date" value={date||configured||""} onChange={(event) => setDate(event.target.value)}/><button className="button ghost" onClick={saveDate} disabled={saving}>Salvar</button></div></div></section>
    {data.attempts.some((attempt) => attempt.status==="in_progress")&&<section className="notice"><strong>Tentativa em andamento</strong>{data.attempts.filter((attempt) => attempt.status==="in_progress").map((attempt) => {const problem=data.problems.find((item) => item.id===attempt.problem_id);return <Link key={attempt.id} href={`/questao/${attempt.problem_id}`}>{problem?.code} · {problem?.title_pt||problem?.title} →</Link>;})}</section>}
    <section className="metric-grid essentials"><Metric label="Questões resolvidas" value={String(metrics.completed.length)}/><Metric label="Tempo resolvendo" value={formatHoursMinutes(metrics.totalSeconds)}/><Metric label="Hoje" value={formatHoursMinutes(metrics.todaySeconds)}/></section>
    <section className="two-col dashboard-main"><div className="panel"><div className="section-head"><div><p className="eyebrow">Últimos 6 meses</p><h2>Tempo resolvendo por dia</h2></div><span className="muted">{formatHoursMinutes(metrics.totalSeconds)} no total</span></div><Heatmap days={metrics.heatmap}/></div><div className="panel"><div className="section-head"><div><p className="eyebrow">Simulados</p><h2>Notas ao longo do tempo</h2></div><Link href="/simulados">Cadastrar</Link></div>{data.mockExams.length?<div className="score-list">{[...data.mockExams].reverse().map((mock) => <div key={mock.id}><span>{new Date(`${mock.date}T12:00:00`).toLocaleDateString("pt-BR")}</span><strong>{mock.total_score}/{mock.max_score}</strong><meter min="0" max="100" value={(mock.total_score/mock.max_score)*100}/></div>)}</div>:<p className="muted">Nenhum simulado cadastrado.</p>}</div></section>
    <section className="panel"><div className="section-head"><div><p className="eyebrow">Conteúdos</p><h2>Tempo e volume por tag</h2></div><span className="muted">Uma questão pode aparecer em várias tags.</span></div>{metrics.tags.length?<div className="table-wrap"><table><thead><tr><th>Tag</th><th>Resolvidas</th><th>Tempo</th><th>Itens (n)</th><th>Mediana/item</th></tr></thead><tbody>{metrics.tags.map((tag) => <tr key={tag.name}><td>{tag.name}</td><td>{tag.resolved}</td><td>{formatHoursMinutes(tag.seconds)}</td><td>{tag.items}</td><td>{tag.median==null?"—":formatTime(tag.median)}</td></tr>)}</tbody></table></div>:<p className="muted">As métricas por tag aparecerão após o primeiro treino.</p>}</section>
    <section className="panel export-panel"><div><p className="eyebrow">Dados brutos</p><h2>Exportar tudo</h2><p className="muted">Catálogo, tags, tentativas, segmentos de tempo e simulados em um único arquivo.</p></div><div className="actions"><a className="button" href="/api/export/json">Baixar todos os dados</a></div></section>
  </>;
}

function Metric({label,value}:{label:string;value:string}) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }

function Heatmap({days}:{days:{key:string;date:Date;seconds:number|null}[]}) {
  const level=(seconds:number|null) => seconds==null?"future":seconds===0?"zero":seconds<15*60?"one":seconds<45*60?"two":seconds<90*60?"three":"four";
  return <div><div className="heatmap" role="img" aria-label="Tempo resolvendo por dia nos últimos seis meses">{days.map((day) => <span className={`heat-cell heat-${level(day.seconds)}`} key={day.key} title={day.seconds==null?day.date.toLocaleDateString("pt-BR"):`${day.date.toLocaleDateString("pt-BR")}: ${formatHoursMinutes(day.seconds)}`}/>)}</div><div className="heat-legend"><span>menos</span>{["zero","one","two","three","four"].map((name) => <i className={`heat-cell heat-${name}`} key={name}/>)}<span>mais</span></div></div>;
}
