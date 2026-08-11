export function clampHintPenalty({suggested,remaining,fullSolution=false,hasReliableScore=true}) {
  if (!hasReliableScore || remaining == null) return 0;
  const available = Math.max(0,Number(remaining));
  if (!available) return 0;
  if (fullSolution) return available;
  const value = Number.isFinite(Number(suggested)) ? Number(suggested) : 0.1;
  return Math.min(available,Math.max(0.1,Math.min(0.5,value)));
}

export function parseHintModelOutput(payload) {
  const raw = payload?.output_text ?? payload?.output?.flatMap((item) => item?.content ?? []).find((item) => item?.type === "output_text")?.text;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("A IA n\u00e3o retornou um hint v\u00e1lido");
  const parsed = JSON.parse(raw);
  if (typeof parsed.hint !== "string" || !parsed.hint.trim()) throw new Error("A IA n\u00e3o retornou um hint v\u00e1lido");
  return {
    hint:parsed.hint.trim(),
    disclosure:["hint","substantial","full_solution"].includes(parsed.disclosure) ? parsed.disclosure : "hint",
    revealedSteps:Array.isArray(parsed.revealed_steps) ? parsed.revealed_steps.filter((item) => typeof item === "string").slice(0,12) : [],
    revealedPoints:Number(parsed.revealed_points),
  };
}

export function safeHintHtml(text) {
  return String(text).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;").replace(/\r?\n/g,"<br>");
}
