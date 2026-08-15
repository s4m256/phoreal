"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatHoursMinutes, secondsFor, useClock, useTrainingData } from "./data";
import { Loading } from "./Loading";
import { dayKey, dayNumber, dayStart, fixedPeriodDays, isTheoryTag, parseDayKey, splitSegmentByDay } from "./training-view-model.mjs";
import taiwanVolume10 from "../../data/taiwan/volume-10.json";

const STUDY_START = new Date(2026, 4, 2);
const TBF_DATE = new Date(2027, 1, 19);

type DailyEntry = {
  seconds: number;
  problems: Map<string, number>;
  completed: number;
};

type HeatmapDay = {
  key: string;
  date: Date;
  seconds: number | null;
  questions: number | null;
};

const formatDate = (date: Date) => date.toLocaleDateString("pt-BR");
const xyProblemKey = (problemId: number) => `xy:${problemId}`;
const taiwanProblemKey = (volume: number, problemNumber: number) => `taiwan:${volume}:${problemNumber}`;

export function Dashboard() {
  const { data, error, loading } = useTrainingData();
  const now = useClock(30_000);
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));

  const metrics = useMemo(() => {
    if (!data || !now) return null;

    const attemptsById = new Map(data.attempts.map((attempt) => [attempt.id, attempt]));
    const taiwanAttemptsById = new Map(data.taiwanAttempts.map((attempt) => [attempt.id, attempt]));
    const completed = data.attempts.filter((attempt) => attempt.status === "completed");
    const taiwanCompleted = data.taiwanAttempts.filter((attempt) => attempt.status === "completed");
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
      splitSegmentByDay(segment.started_at, seconds, xyProblemKey(attempt.problem_id), daily);
    }
    for (const segment of data.taiwanTimeSegments) {
      const seconds = secondsFor(segment, now);
      const attempt = taiwanAttemptsById.get(segment.attempt_id);
      if (!attempt) continue;
      totalSeconds += seconds;
      splitSegmentByDay(segment.started_at, seconds, taiwanProblemKey(attempt.volume, attempt.problem_number), daily);
    }
    for (const attempt of completed) {
      const finishedAt = attempt.finished_at ?? attempt.started_at;
      const key = dayKey(new Date(finishedAt));
      const entry = daily.get(key) ?? { seconds: 0, problems: new Map<string, number>(), completed: 0 };
      entry.completed = (entry.completed ?? 0) + 1;
      const problemKey = xyProblemKey(attempt.problem_id);
      if (!entry.problems.has(problemKey)) entry.problems.set(problemKey, 0);
      daily.set(key, entry);
    }
    for (const attempt of taiwanCompleted) {
      const finishedAt = attempt.finished_at ?? attempt.started_at;
      const key = dayKey(new Date(finishedAt));
      const entry = daily.get(key) ?? { seconds: 0, problems: new Map<string, number>(), completed: 0 };
      entry.completed = (entry.completed ?? 0) + 1;
      const problemKey = taiwanProblemKey(attempt.volume, attempt.problem_number);
      if (!entry.problems.has(problemKey)) entry.problems.set(problemKey, 0);
      daily.set(key, entry);
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
      completedCount: completed.length + taiwanCompleted.length,
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
  const selectedProblems = [...(selectedEntry?.problems.entries() ?? [])].map(([key, seconds]) => {
    if (key.startsWith("xy:")) {
      const problemId = Number(key.slice(3));
      const problem = data.problems.find((item) => item.id === problemId);
      const exam = data.exams.find((item) => item.id === problem?.exam_id);
      return problem ? { key, href: `/questao/${problem.id}`, code: `${exam?.code ?? "XY"} · ${problem.code}`, title: problem.title_pt || problem.title, seconds } : null;
    }
    const [, volumeText, problemNumberText] = key.split(":");
    const volume = Number(volumeText), problemNumber = Number(problemNumberText);
    const problem = volume === 10 ? taiwanVolume10.problems.find((item) => item.id === problemNumber) : null;
    return problem ? { key, href: `/problemas/taiwan/${volume}/${problem.id}`, code: `Taiwan ${volume} · ${problem.code}`, title: problem.title_pt, seconds } : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)).sort((a, b) => b.seconds - a.seconds);
  const selectedIsFuture = selectedDate > today;

  return <>
    <section className="hero dashboard-hero">
      <div><p className="eyebrow">PhoReal · física olímpica</p><h1>Resumo</h1></div>
      <div className="days-left"><span>TBF</span><strong>{today > TBF_DATE ? "concluído" : `${daysRemaining} dias`}</strong><small>restantes</small></div>
    </section>

    <section className="panel tbf-progress" aria-label="Progresso entre o início dos estudos e o TBF">
      <div className="tbf-dates"><span>02/05/2026<small>início</small></span><span>19/02/2027<small>TBF</small></span></div>
      <div className="tbf-track"><div className="tbf-elapsed" style={{ width: `${progress}%` }}/><span className="tbf-today" style={{ left: `${progress}%` }} aria-label="Data atual"><i/></span></div>
    </section>

    {(data.attempts.some((attempt) => attempt.status === "in_progress") || data.taiwanAttempts.some((attempt) => attempt.status === "in_progress")) && <section className="notice"><strong>Tentativa em andamento</strong>{data.attempts.filter((attempt) => attempt.status === "in_progress").map((attempt) => { const problem = data.problems.find((item) => item.id === attempt.problem_id); return <Link key={attempt.id} href={`/questao/${attempt.problem_id}`}>{problem?.code} · {problem?.title_pt || problem?.title}</Link>; })}{data.taiwanAttempts.filter((attempt) => attempt.status === "in_progress").map((attempt) => { const problem = attempt.volume===10?taiwanVolume10.problems.find((item)=>item.id===attempt.problem_number):null; return <Link key={attempt.id} href={`/problemas/taiwan/${attempt.volume}/${attempt.problem_number}`}>Taiwan {attempt.volume} · {problem?.code} · {problem?.title_pt}</Link>; })}</section>}

    <section className="metric-grid essentials"><Metric label="Questões resolvidas" value={String(metrics.completedCount)}/><Metric label="Tempo resolvendo" value={formatHoursMinutes(metrics.totalSeconds)}/><Metric label="Hoje" value={formatHoursMinutes(metrics.todaySeconds)}/></section>

    <section className="two-col dashboard-main">
      <div className="panel heatmap-panel">
        <div className="section-head"><div><p className="eyebrow">02/05/2026 — 19/02/2027</p><h2>Questões resolvidas por dia</h2></div></div>
        <Heatmap days={metrics.heatmap} selected={selectedDay} onSelect={setSelectedDay}/>
        <div className="day-detail" aria-live="polite">
          <div className="day-detail-head"><div><strong>{formatDate(selectedDate)}</strong><span>{selectedIsFuture ? "Ainda não chegou" : `${formatQuestionCount(selectedEntry?.completed ?? 0)} · ${formatHoursMinutes(selectedEntry?.seconds ?? 0)}`}</span></div></div>
          {!selectedIsFuture && selectedProblems.length > 0 ? <div className="day-problems">{selectedProblems.map((problem) => <Link href={problem.href} key={problem.key}><span><strong>{problem.code}</strong><small>{problem.title}</small></span><b>{formatHoursMinutes(problem.seconds)}</b></Link>)}</div> : !selectedIsFuture && <p className="muted">Nenhum treino registrado neste dia.</p>}
        </div>
      </div>

      <div className="panel"><div className="section-head"><div><p className="eyebrow">Simulados</p><h2>Notas ao longo do tempo</h2></div><Link href="/simulados">Cadastrar</Link></div>{data.mockExams.length ? <div className="score-list">{[...data.mockExams].reverse().map((mock) => <div key={mock.id}><span>{new Date(`${mock.date}T12:00:00`).toLocaleDateString("pt-BR")} · {mock.exam_name}</span><strong>{mock.total_score}</strong></div>)}</div> : <p className="muted">Nenhum simulado cadastrado.</p>}</div>
    </section>

    <section className="panel"><div className="section-head"><div><p className="eyebrow">Conteúdos</p><h2>Questões resolvidas por tag</h2></div><span className="muted">Uma tentativa conta em todas as tags da questão.</span></div>{metrics.tags.length ? <TagBars tags={metrics.tags}/> : <p className="muted">Os conteúdos aparecerão após a primeira questão finalizada.</p>}</section>

    {data.canEdit&&<section className="panel export-panel"><div><p className="eyebrow">Feedback</p><h2>Exportar para análise</h2><p className="muted">Treinos, tempos por item, uso de hints, simulados e laboratório — sem enunciados nem o catálogo inteiro.</p></div><div className="actions"><a className="button" href="/api/export/json">Baixar dados para IA</a></div></section>}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Heatmap({ days, selected, onSelect }: { days: HeatmapDay[]; selected: string; onSelect: (key: string) => void }) {
  const level = (questions: number | null) => questions == null ? "future" : questions === 0 ? "zero" : questions === 1 ? "one" : questions === 2 ? "two" : questions === 3 ? "three" : "four";
  const mondayOffset = (STUDY_START.getDay() + 6) % 7;
  const slots: Array<HeatmapDay | null> = [...Array<null>(mondayOffset).fill(null), ...days];
  return <div><div className="heatmap" aria-label="Questões resolvidas em cada dia do período">{slots.map((day, index) => { const label = day?.questions == null ? "ainda não chegou" : formatQuestionCount(day.questions); return day ? <button type="button" className={`heat-cell heat-${level(day.questions)} ${selected === day.key ? "selected" : ""}`} key={day.key} title={`${formatDate(day.date)}: ${label}`} aria-label={`${formatDate(day.date)}: ${label}`} aria-pressed={selected === day.key} onClick={() => onSelect(day.key)}/> : <span className="heat-cell heat-blank" key={`blank-${index}`}/>; })}</div><div className="heat-legend" aria-label="Escala de questões resolvidas">{[["zero","0"],["one","1"],["two","2"],["three","3"],["four","4+"]].map(([name,label]) => <span key={name}><i className={`heat-cell heat-${name}`}/>{label}</span>)}</div></div>;
}

function formatQuestionCount(count: number) {
  return `${count} ${count === 1 ? "questão resolvida" : "questões resolvidas"}`;
}

function TagBars({ tags }: { tags: { id: number; name: string; resolved: number }[] }) {
  const maximum = Math.max(...tags.map((tag) => tag.resolved));
  return <div className="tag-bars">{tags.map((tag) => <div className="tag-bar-row" key={tag.id}><span title={tag.name}>{tag.name}</span><div className="tag-bar-track"><i style={{ width: `${(tag.resolved / maximum) * 100}%` }}/></div><strong>{tag.resolved}</strong></div>)}</div>;
}
