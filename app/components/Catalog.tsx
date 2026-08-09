"use client";
import Link from "next/link";
import { type TrainingData, useTrainingData } from "./data";
import { Loading } from "./Loading";
import { compareProblemCodes } from "./training-view-model.mjs";

export function Catalog() {
  const {data,error,loading}=useTrainingData();
  if (loading||!data) return <Loading error={error}/>;
  const series=["X","Y"] as const;
  return <>
    <section className="page-head"><h1>Catálogo XY</h1></section>
    <div className="catalog-series-grid">{series.map((seriesCode) => {
      const exams=data.exams.filter((exam) => exam.series===seriesCode).sort((a,b) => (b.year||0)-(a.year||0));
      return <section className="catalog-series" key={seriesCode} aria-labelledby={`series-${seriesCode}`}><div className="series-heading"><h2 id={`series-${seriesCode}`}>{seriesCode}</h2></div>{exams.map((exam) => <ExamBlock data={data} examId={exam.id} key={exam.id}/>)}</section>;
    })}</div>
  </>;
}

function ExamBlock({data,examId}:{data:TrainingData;examId:number}) {
  const exam=data.exams.find((item) => item.id===examId);
  if (!exam) return null;
  const problems=data.problems.filter((problem) => problem.exam_id===exam.id).sort((a,b) => compareProblemCodes(a.code,b.code));
  return <section className="panel exam"><div className="section-head"><strong className="exam-year">{exam.year}</strong></div><div className="problem-list">{problems.map((problem) => {
    const translated=problem.translation_status==="verified";
    const tags=data.problemTags.filter((row) => row.problem_id===problem.id).map((row) => {
      const tag=data.tags.find((item) => item.id===row.tag_id);
      return translated&&tag?.name_pt?tag.name_pt:tag?.name;
    }).filter(Boolean) as string[];
    const attempts=data.attempts.filter((attempt) => attempt.problem_id===problem.id);
    const completed=attempts.filter((attempt) => attempt.status==="completed").length;
    const inProgress=attempts.some((attempt) => attempt.status==="in_progress");
    const status=[inProgress?"em andamento":"",completed?`${completed}× concluída`:""].filter(Boolean).join(" · ");
    return <Link className="problem-row" href={`/questao/${problem.id}`} key={problem.id}><span className="problem-code">{problem.code}</span><span className="problem-main"><strong>{translated&&problem.title_pt?problem.title_pt:problem.title}</strong><span className="tag-line">{tags.map((tag) => <em key={tag}>{tag}</em>)}</span>{status&&<span className="problem-status">{status}</span>}</span></Link>;
  })}</div></section>;
}
