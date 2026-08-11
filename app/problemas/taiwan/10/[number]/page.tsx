import Link from "next/link";
import { notFound } from "next/navigation";
import taiwanVolume10 from "../../../../../data/taiwan/volume-10.json";

export default async function TaiwanProblemPage({params}:{params:Promise<{number:string}>}) {
  const {number}=await params;
  const problem=taiwanVolume10.problems.find((item)=>item.id===Number(number));
  if (!problem) notFound();
  const previous=problem.id>1?problem.id-1:null;
  const next=problem.id<taiwanVolume10.problems.length?problem.id+1:null;
  const pages=problem.page_end===problem.page_start?`página ${problem.page_start}`:`páginas ${problem.page_start}–${problem.page_end}`;
  return <article className="taiwan-problem-page">
    <header className="taiwan-problem-header"><div><p>TAIWAN · VOLUME 10 · {String(problem.id).padStart(2,"0")}</p><h1>{problem.title_pt}</h1></div><a href={problem.source_url} target="_blank" rel="noreferrer">Original · {pages} ↗</a></header>
    <section className="panel taiwan-statement" aria-label="Enunciado em português">{problem.statement_pt.split(/\n{2,}/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>
    <nav className="taiwan-problem-nav" aria-label="Navegação entre problemas"><span>{previous&&<Link href={`/problemas/taiwan/10/${previous}`}>← Anterior</Link>}</span><Link href="/problemas#taiwan">Todos os problemas</Link><span>{next&&<Link href={`/problemas/taiwan/10/${next}`}>Próximo →</Link>}</span></nav>
  </article>;
}
