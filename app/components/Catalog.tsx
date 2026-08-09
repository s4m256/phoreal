"use client";
import Link from "next/link";
import { type TrainingData, useTrainingData } from "./data";
import { Loading } from "./Loading";

export function Catalog() {
  const {data,error,loading}=useTrainingData();
  if (loading||!data) return <Loading error={error}/>;
  const series=["X","Y"] as const;
  return <>
    <section className="page-head"><p className="eyebrow">xy.pho.rs</p><h1>Catálogo</h1><p className="muted">X e Y separados · anos em ordem decrescente · 165 problemas · 233 tags originais.</p></section>
    <div className="catalog-series-grid">{series.map((seriesCode) => {
      const exams=data.exams.filter((exam) => exam.series===seriesCode).sort((a,b) => (b.year||0)-(a.year||0));
      return <section className="catalog-series" key={seriesCode} aria-labelledby={`series-${seriesCode}`}><div className="series-heading"><span className={`series series-${seriesCode.toLowerCase()}`}>{seriesCode}</span><div><h2 id={`series-${seriesCode}`}>Série {seriesCode}</h2><p>{exams.reduce((sum,exam) => sum+data.problems.filter((problem) => problem.exam_id===exam.id).length,0)} problemas</p></div></div>{exams.map((exam) => <ExamBlock data={data} examId={exam.id} key={exam.id}/>)}</section>;
    })}</div>
  </>;
}

function ExamBlock({data,examId}:{data:TrainingData;examId:number}) {
  const exam=data.exams.find((item) => item.id===examId);
  if (!exam) return null;
  const problems=data.problems.filter((problem) => problem.exam_id===exam.id);
  return <section className="panel exam"><div className="section-head"><div><strong className="exam-year">{exam.year}</strong><h2>{exam.code}</h2></div><a href={exam.source_url} target="_blank" rel="noreferrer">Origem ↗</a></div><div className="problem-list">{problems.map((problem) => {
    const translated=problem.translation_status==="verified";
    const tags=data.problemTags.filter((row) => row.problem_id===problem.id).map((row) => {
      const tag=data.tags.find((item) => item.id===row.tag_id);
      return translated&&tag?.name_pt?tag.name_pt:tag?.name;
    }).filter(Boolean) as string[];
    const attempts=data.attempts.filter((attempt) => attempt.problem_id===problem.id);
    return <Link className="problem-row" href={`/questao/${problem.id}`} key={problem.id}><span className="problem-code">{problem.code}</span><span className="problem-main"><strong>{translated&&problem.title_pt?problem.title_pt:problem.title}</strong><span className="tag-line">{tags.map((tag) => <em key={tag}>{tag}</em>)}</span></span><span className="problem-status">{attempts.some((attempt) => attempt.status==="in_progress")?"Em andamento":attempts.some((attempt) => attempt.status==="completed")?`${attempts.length} resolvida(s)`:"Abrir"} →</span></Link>;
  })}</div></section>;
}
