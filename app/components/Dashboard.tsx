"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatHoursMinutes, secondsFor, useClock, useTrainingData } from "./data";
import { Loading } from "./Loading";
import { dayKey, dayNumber, dayStart, fixedPeriodDays, isTheoryTag, parseDayKey, splitSegmentByDay } from "./training-view-model.mjs";

const STUDY_START = new Date(2026, 4, 2);
const TBF_DATE = new Date(2027, 1, 20);

type DailyEntry = {
  seconds: number;
  problems: Map<number, number>;
};

type HeatmapDay = {
  key: string;
  date: Date;
  seconds: number | null;
};

const formatDate = (date: Date) => date.toLocaleDateString("pt-BR");

export function Dashboard() {
  const { data, error, loading } = useTrainingData();
  const now = useClock(30_000);
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));

  const metrics = useMemo(() => {
    if (!data || !now) return null;

    const attemptsById = new Map(data.attempts.map((attempt) => [attempt.id, attempt]));
    const completed = data.attempts.filter((attempt) => attempt.status === "completed");
    const completedByProblem = new Map<number, number>();
    for (const attempt of completed) {
      completedByProblem.set(attempt.problem_id, (completedByProblem.get(attempt.problem_id) ?? 0) + 1);
    }

    const daily = new Map<string, DailyEntry>();
    let totalSeconds = 0;
    for (const segment of data.timeSegments) {
      const seconds = secondsFor(segment, now);
      const attempt = attemptsById.get(segment.attempt_id);
      if (!attempt) continue;
      totalSeconds += seconds;
      splitSegmentByDay(segment.started_at, seconds, attempt.problem_id, daily);
    }

    const todayKey = dayKey(new Date(now));
    const tags = data.tags.map((tag) => {
      const problemIds = new Set(data.problemTags.filter((row) => row.tag_id === tag.id).map((row) => row.problem_id));
      const resolved = [...problemIds].reduce((sum, problemId) => sum + (completedByProblem.get(problemId) ?? 0), 0);
      return { id: tag.id, name: tag.name_pt || tag.name, resolved };
    }).filter((tag) => isTheoryTag(tag.name) && tag.resolved > 0)
      .sort((a, b) => b.resolved - a.resolved || a.name.localeCompare(b.name, "pt-BR"));

    return {
      completed,
      daily,
      heatmap: fixedPeriodDays(STUDY_START, TBF_DATE, daily, now) as HeatmapDay[],
      tags,
      todaySeconds: daily.get(todayKey)?.seconds ?? 0,
      totalSeconds,
    };
  }, [data, now]);

  if (loading || !data || !metrics || !now) return <Loading error={error}/>;

  const today = dayStart(new Date(now));
  const daysRemaining = Math.max(0, dayNumber(TBF_DATE) - dayNumber(today));
  const periodLength = dayNumber(TBF_DATE) - dayNumber(STUDY_START);
  const progress = Math.min(100, Math.max(0, ((dayNumber(today) - dayNumber(STUDY_START)) / periodLength) * 100));
  const selectedDate = parseDayKey(selectedDay);
  const selectedEntry = metrics.daily.get(selectedDay);
  const selectedProblems = [...(selectedEntry?.problems.entries() ?? [])].map(([problemId, seconds]) => {
    const problem = data.problems.find((item) => item.id === problemId);
    const exam = data.exams.find((item) => item.id === problem?.exam_id);
    return { problem, exam, seconds };
  }).filter((item) => item.problem).sort((a, b) => b.seconds - a.seconds);
  const selectedIsFuture = selectedDate > today;

  return <>
    <section className="hero dashboard-hero">
      <div><p className="eyebrow">Treino de física</p><h1>Resumo</h1></div>
      <div className="days-left"><span>TBF</span><strong>{today > TBF_DATE ? "concluído" : `${daysRemaining} dias`}</strong><small>restantes</small></div>
    </section>

    <section className="panel tbf-progress" aria-label="Progresso entre o início dos estudos e o TBF">
      <div className="tbf-dates"><span>02/05/2026<small>início</small></span><span>20/02/2027<small>TBF</small></span></div>
      <div className="tbf-track"><div className="tbf-elapsed" style={{ width: `${progress}%` }}/><span className="tbf-today" style={{ left: `${progress}%` }} aria-label="Data atual"><i/></span></div>
    </section>

    {data.attempts.some((attempt) => attempt.status === "in_progress") && <section className="notice"><strong>Tentativa em andamento</strong>{data.attempts.filter((attempt) => attempt.status === "in_progress").map((attempt) => { const problem = data.problems.find((item) => item.id === attempt.problem_id); return <Link key={attempt.id} href={`/questao/${attempt.problem_id}`}>{problem?.code} · {problem?.title_pt || problem?.title}</Link>; })}</section>}

    <section className="metric-grid essentials"><Metric label="Questões resolvidas" value={String(metrics.completed.length)}/><Metric label="Tempo resolvendo" value={formatHoursMinutes(metrics.totalSeconds)}/><Metric label="Hoje" value={formatHoursMinutes(metrics.todaySeconds)}/></section>

    <section className="two-col dashboard-main">
      <div className="panel heatmap-panel">
        <div className="section-head"><div><p className="eyebrow">02/05/2026 — 20/02/2027</p><h2>Tempo resolvendo por dia</h2></div></div>
        <Heatmap days={metrics.heatmap} selected={selectedDay} onSelect={setSelectedDay}/>
        <div className="day-detail" aria-live="polite">
          <div className="day-detail-head"><div><strong>{formatDate(selectedDate)}</strong><span>{selectedIsFuture ? "Ainda não chegou" : formatHoursMinutes(selectedEntry?.seconds ?? 0)}</span></div></div>
          {!selectedIsFuture && selectedProblems.length > 0 ? <div className="day-problems">{selectedProblems.map(({ problem, exam, seconds }) => <Link href={`/questao/${problem!.id}`} key={problem!.id}><span><strong>{exam?.code} · {problem!.code}</strong><small>{problem!.title_pt || problem!.title}</small></span><b>{formatHoursMinutes(seconds)}</b></Link>)}</div> : !selectedIsFuture && <p className="muted">Nenhum treino registrado neste dia.</p>}
        </div>
      </div>

      <div className="panel"><div className="section-head"><div><p className="eyebrow">Simulados</p><h2>Notas ao longo do tempo</h2></div><Link href="/simulados">Cadastrar</Link></div>{data.mockExams.length ? <div className="score-list">{[...data.mockExams].reverse().map((mock) => <div key={mock.id}><span>{new Date(`${mock.date}T12:00:00`).toLocaleDateString("pt-BR")} · {mock.exam_name}</span><strong>{mock.total_score}</strong></div>)}</div> : <p className="muted">Nenhum simulado cadastrado.</p>}</div>
    </section>

    <section className="panel"><div className="section-head"><div><p className="eyebrow">Conteúdos</p><h2>Questões resolvidas por tag</h2></div><span className="muted">Uma tentativa conta em todas as tags da questão.</span></div>{metrics.tags.length ? <TagBars tags={metrics.tags}/> : <p className="muted">Os conteúdos aparecerão após a primeira questão finalizada.</p>}</section>

    {data.canEdit&&<section className="panel export-panel"><div><p className="eyebrow">Dados brutos</p><h2>Exportar tudo</h2><p className="muted">Catálogo, tags, tentativas, segmentos de tempo, simulados e laboratório.</p></div><div className="actions"><a className="button" href="/api/export/json">Baixar todos os dados</a></div></section>}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Heatmap({ days, selected, onSelect }: { days: HeatmapDay[]; selected: string; onSelect: (key: string) => void }) {
  const level = (seconds: number | null) => seconds == null ? "future" : seconds === 0 ? "zero" : seconds < 15 * 60 ? "one" : seconds < 45 * 60 ? "two" : seconds < 90 * 60 ? "three" : "four";
  const mondayOffset = (STUDY_START.getDay() + 6) % 7;
  const slots: Array<HeatmapDay | null> = [...Array<null>(mondayOffset).fill(null), ...days];
  return <div><div className="heatmap" aria-label="Tempo resolvendo em cada dia do período">{slots.map((day, index) => day ? <button type="button" className={`heat-cell heat-${level(day.seconds)} ${selected === day.key ? "selected" : ""}`} key={day.key} title={`${formatDate(day.date)}: ${day.seconds == null ? "ainda não chegou" : formatHoursMinutes(day.seconds)}`} aria-label={`${formatDate(day.date)}: ${day.seconds == null ? "ainda não chegou" : formatHoursMinutes(day.seconds)}`} aria-pressed={selected === day.key} onClick={() => onSelect(day.key)}/> : <span className="heat-cell heat-blank" key={`blank-${index}`}/>)}</div><div className="heat-legend"><span>menos</span>{["zero", "one", "two", "three", "four"].map((name) => <i className={`heat-cell heat-${name}`} key={name}/>)}<span>mais</span></div></div>;
}

function TagBars({ tags }: { tags: { id: number; name: string; resolved: number }[] }) {
  const maximum = Math.max(...tags.map((tag) => tag.resolved));
  return <div className="tag-bars">{tags.map((tag) => <div className="tag-bar-row" key={tag.id}><span title={tag.name}>{tag.name}</span><div className="tag-bar-track"><i style={{ width: `${(tag.resolved / maximum) * 100}%` }}/></div><strong>{tag.resolved}</strong></div>)}</div>;
}
