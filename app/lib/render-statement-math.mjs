import katex from "katex";
import { normalizeLegacyLatex,normalizeMathMarkup,normalizePhysicsUnits } from "./physics-math.mjs";

const delimiters = [
  { left:"$$",right:"$$",display:true },
  { left:"\\[",right:"\\]",display:true },
  { left:"\\(",right:"\\)",display:false },
  { left:"\\begin{equation}",right:"\\end{equation}",display:true,environment:true },
  { left:"\\begin{align}",right:"\\end{align}",display:true,environment:true },
  { left:"\\begin{alignat}",right:"\\end{alignat}",display:true,environment:true },
  { left:"\\begin{gather}",right:"\\end{gather}",display:true,environment:true },
  { left:"\\begin{CD}",right:"\\end{CD}",display:true,environment:true },
  { left:"$",right:"$",display:false },
];

function isEscaped(text,index) {
  let slashes = 0;
  for (let cursor=index-1;cursor>=0 && text[cursor]==="\\";cursor--) slashes++;
  return slashes%2===1;
}

function nextDelimiter(text,start) {
  let best = null;
  for (const delimiter of delimiters) {
    let index = text.indexOf(delimiter.left,start);
    while (index>=0 && delimiter.left.includes("$") && isEscaped(text,index)) index = text.indexOf(delimiter.left,index+delimiter.left.length);
    if (index>=0 && (!best || index<best.index || (index===best.index && delimiter.left.length>best.delimiter.left.length))) best = { index,delimiter };
  }
  return best;
}

function closingDelimiter(text,delimiter,start) {
  let index = text.indexOf(delimiter.right,start);
  while (index>=0 && delimiter.right.includes("$") && isEscaped(text,index)) index = text.indexOf(delimiter.right,index+delimiter.right.length);
  return index;
}

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_match,entity) => {
    const lower = entity.toLowerCase();
    if (lower==="amp") return "&"; if (lower==="lt") return "<"; if (lower==="gt") return ">"; if (lower==="nbsp") return "~";
    if (lower==="quot") return "\""; if (lower==="apos") return "'";
    return String.fromCodePoint(Number.parseInt(lower.startsWith("#x") ? lower.slice(2) : lower.slice(1),lower.startsWith("#x") ? 16 : 10));
  });
}

function renderText(text,onError,onFormula) {
  let output = "";
  let cursor = 0;
  while (cursor<text.length) {
    const found = nextDelimiter(text,cursor);
    if (!found) return output+text.slice(cursor);
    const bodyStart = found.index+found.delimiter.left.length;
    const close = closingDelimiter(text,found.delimiter,bodyStart);
    if (close<0) return output+text.slice(cursor);
    output += text.slice(cursor,found.index);
    const raw = found.delimiter.environment
      ? text.slice(found.index,close+found.delimiter.right.length)
      : text.slice(bodyStart,close);
    try {
      const formula = normalizePhysicsUnits(normalizeLegacyLatex(decodeEntities(raw)));
      onFormula?.({formula,raw});
      output += katex.renderToString(formula,{
        displayMode:found.delimiter.display,throwOnError:true,strict:"ignore",trust:false,output:"htmlAndMathml",
      });
    } catch (error) {
      onError?.({formula:raw,error:error instanceof Error ? error.message : String(error)});
      output += text.slice(found.index,close+found.delimiter.right.length);
    }
    cursor = close+found.delimiter.right.length;
  }
  return output;
}

export function renderStatementMath(html,{onError,onFormula}={}) {
  const normalized = normalizeMathMarkup(html);
  const pieces = normalized.split(/(<[^>]+>)/g);
  let ignored = null;
  return pieces.map((piece) => {
    if (piece.startsWith("<")) {
      const close = piece.match(/^<\/\s*(script|style|textarea|pre|code|option)/i);
      const open = piece.match(/^<\s*(script|style|textarea|pre|code|option)(?:\s|>)/i);
      if (open) ignored = open[1].toLowerCase();
      if (close && close[1].toLowerCase()===ignored) ignored = null;
      return piece;
    }
    return ignored ? piece : renderText(piece,onError,onFormula);
  }).join("");
}
