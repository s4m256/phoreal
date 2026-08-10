"use client";

import renderMathInElement from "katex/contrib/auto-render";
import { memo, useEffect, useLayoutEffect, useRef } from "react";

const delimiters = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

type LinkedPart = { id:number; code:string };

function addPartButtons(root:HTMLElement, parts:LinkedPart[], disabled:boolean) {
  const byCode = new Map(parts.map((part) => [part.code.toUpperCase(),part]));
  const codes = [...byCode.keys()].sort((a,b) => b.length-a.length).map((code) => code.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
  if (!codes.length) return;
  const matcher = new RegExp(`^(\\s*)(${codes.join("|")})(?=$|[\\s.:;)\\]\\-\\u2212])`,"i");

  for (const block of root.querySelectorAll<HTMLElement>("p, li, .statement-row")) {
    const walker = document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text|null;
    while (node && !(node.textContent || "").trim()) node = walker.nextNode() as Text|null;
    if (!node) continue;
    const match = (node.textContent || "").match(matcher);
    if (!match) continue;
    const part = byCode.get(match[2].toUpperCase());
    if (!part) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "statement-part-button";
    button.dataset.partId = String(part.id);
    button.disabled = disabled;
    button.textContent = match[2];
    button.title = disabled ? "Entre para registrar seu tempo" : `Contar tempo no item ${part.code}`;
    node.replaceWith(document.createTextNode(match[1]),button,document.createTextNode((node.textContent || "").slice(match[0].length)));
  }
}

export const MathHtml = memo(function MathHtml({
  html,className,parts=[],activePartId=null,disabled=false,onPartClick,
}:{
  html:string; className?:string; parts?:LinkedPart[]; activePartId?:number|null;
  disabled?:boolean; onPartClick?:(partId:number)=>void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onPartClick);
  clickRef.current = onPartClick;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.innerHTML = html;
    addPartButtons(root,parts,disabled);
    renderMathInElement(root,{ delimiters,throwOnError:false,strict:"ignore",trust:false });
    const handleClick = (event:MouseEvent) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(".statement-part-button");
      if (!button || button.disabled) return;
      const partId = Number(button.dataset.partId);
      if (Number.isInteger(partId)) clickRef.current?.(partId);
    };
    root.addEventListener("click",handleClick);
    return () => root.removeEventListener("click",handleClick);
  },[html,parts,disabled]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const button of root.querySelectorAll<HTMLButtonElement>(".statement-part-button")) {
      button.classList.toggle("active",Number(button.dataset.partId) === activePartId);
    }
  },[activePartId]);

  return <div ref={ref} className={className}/>;
});

export const MathText = memo(function MathText({ children,className }:{ children:string; className?:string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.textContent = children;
    renderMathInElement(ref.current,{ delimiters,throwOnError:false,strict:"ignore",trust:false });
  },[children]);
  return <div ref={ref} className={className}/>;
});
