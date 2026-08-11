import { load } from "cheerio";

const clean = (value) => String(value || "").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();

export function extractStructuredMarking(html) {
  const $=load(html);
  const items=[];
  $(".phors-table-markingscheme tbody").each((index,body) => {
    const rows=[];
    $(body).find("tr").each((_rowIndex,row) => {
      const cells=$(row).find("th,td").map((_cellIndex,cell) => clean($(cell).text())).get().filter(Boolean);
      if (!cells.length) return;
      const criterion=cells[0];
      const points=cells[1] || "";
      rows.push(points ? `${criterion} | ${points} points` : criterion);
    });
    if (rows.length) items.push({ordinal:index+1,text:rows.join("\n")});
  });
  return items.length ? JSON.stringify({version:1,items}) : null;
}

export function isStructuredMarking(value) {
  if (!value) return false;
  try {
    const parsed=JSON.parse(value);
    return parsed?.version===1 && Array.isArray(parsed.items) && parsed.items.length>0;
  } catch { return false; }
}

export function markingForPart(value,ordinal) {
  if (!isStructuredMarking(value) || !Number.isInteger(Number(ordinal))) return null;
  const parsed=JSON.parse(value);
  const item=parsed.items.find((candidate) => Number(candidate.ordinal)===Number(ordinal));
  return typeof item?.text==="string" && item.text.trim() ? item.text.trim() : null;
}