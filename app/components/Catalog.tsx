"use client";
import Link from "next/link";
import { useTrainingData } from "./data";
import { Loading } from "./Loading";

export function Catalog() {
  const { data,error,loading } = useTrainingData();
  if (loading || !data) return <Loading error={error}/>;
  return <>
    <section className="page-head">
      <p className="eyebrow">xy.pho.rs</p>
      <h1>Questões X e Y</h1>
      <p className="muted">18 provas · 165 problemas · 2018–2026. Os títulos permanecem no idioma original enquanto a tradução não estiver verificada.</p>
    </section>
    <div className="exam-list">{data.exams.map((exam) => <section className="panel exam" key={exam.id}>
      <div className="section-head"><div><span className={`series series-${exam.series?.toLowerCase()}`}>{exam.code}</span><h2>{exam.title_pt || exam.title}</h2></div><a href={exam.source_url} target="_blank" rel="noreferrer">Origem ↗</a></div>
      <div className="problem-list">{data.problems.filter((problem) => problem.exam_id === exam.id).map((problem) => {
        const translated = problem.translation_status === "verified";
        const tags = data.problemTags.filter((row) => row.problem_id === problem.id).map((row) => {
          const tag = data.tags.find((item) => item.id === row.tag_id);
          return translated && tag?.name_pt ? tag.name_pt : tag?.name;
        }).filter(Boolean) as string[];
        const attempts = data.attempts.filter((attempt) => attempt.problem_id === problem.id);
        return <Link className="problem-row" href={`/questao/${problem.id}`} key={problem.id}>
          <span className="problem-code">{problem.code}</span>
          <span className="problem-main"><strong>{translated && problem.title_pt ? problem.title_pt : problem.title}</strong><span className="tag-line">{tags.map((tag) => <em key={tag}>{tag}</em>)}</span></span>
          <span className="problem-status">{attempts.some((attempt) => attempt.status === "in_progress") ? "Em andamento" : attempts.some((attempt) => attempt.status === "completed") ? `${attempts.length} tentativa(s)` : "Abrir"} →</span>
        </Link>;
      })}</div>
    </section>)}</div>
  </>;
}
