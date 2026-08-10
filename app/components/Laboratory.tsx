"use client";

import { FormEvent, useState } from "react";
import { postJson, useTrainingData } from "./data";
import { Loading } from "./Loading";

export function Laboratory() {
  const {data,error,loading,refresh}=useTrainingData(); const [busy,setBusy]=useState(false);
  if (loading||!data) return <Loading error={error}/>;
  async function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); const form=new FormData(event.currentTarget); setBusy(true); try { await postJson("/api/experiments",{title:form.get("title"),date:form.get("date"),imageUrl:form.get("imageUrl"),notes:form.get("notes")}); event.currentTarget.reset(); await refresh(); } finally { setBusy(false); } }
  return <><section className="page-head"><p className="eyebrow">Laboratório</p><h1>Experimentos</h1><p className="muted">Seu arquivo pessoal de montagens, medições e observações experimentais.</p></section>
    {data.canEdit&&<section className="panel"><form className="experiment-form" onSubmit={submit}><label>Título<input required name="title" placeholder="Pêndulo físico"/></label><label>Data<input name="date" type="date"/></label><label className="span-2">URL da foto<input name="imageUrl" type="url" placeholder="https://…"/></label><label className="span-2">Anotações<textarea name="notes" rows={4} placeholder="Montagem, objetivo, resultado…"/></label><button className="button" disabled={busy}>Adicionar experimento</button></form></section>}
    {data.experiments.length?<section className="experiment-grid">{data.experiments.map((experiment)=><article className="experiment-card" key={experiment.id}>{experiment.image_url?<ExperimentImage url={experiment.image_url}/>:<div className="experiment-placeholder">sem foto</div>}<div><small>{experiment.date?new Date(`${experiment.date}T12:00:00`).toLocaleDateString("pt-BR"):"sem data"}</small><h2>{experiment.title}</h2>{experiment.notes&&<p>{experiment.notes}</p>}</div></article>)}</section>:<section className="empty-lab"><strong>Nenhum experimento ainda.</strong><span>Adicione o primeiro acima.</span></section>}
  </>;
}

function ExperimentImage({url}:{url:string}) {
  // User-provided URLs can point to any image host, so an optimized allowlist is intentionally not used here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt=""/>;
}
