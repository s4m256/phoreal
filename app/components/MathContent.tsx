"use client";

import renderMathInElement from "katex/contrib/auto-render";
import { useEffect, useRef } from "react";

const delimiters = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

function useMath(content: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    renderMathInElement(ref.current, { delimiters, throwOnError: false, strict: "ignore", trust: false });
  }, [content]);
  return ref;
}

export function MathHtml({ html, className }: { html: string; className?: string }) {
  const ref = useMath(html);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }}/>
}

export function MathText({ children, className }: { children: string; className?: string }) {
  const ref = useMath(children);
  const escaped = children.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{__html:escaped}}/>;
}
