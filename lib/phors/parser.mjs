import { createHash } from "node:crypto";
import { load } from "cheerio";

export const normalizeSpace = (value = "") => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
export const hashText = (value) => createHash("sha256").update(value).digest("hex");
export const normalizeTag = (value) => normalizeSpace(value).toLocaleLowerCase("ru-RU");

function absoluteUrl(value, base) {
  if (!value) return null;
  return new URL(value, base).href;
}

function inferKind(code = "") {
  const normalized = code.toUpperCase();
  if (/^(?:PE|E)/.test(normalized)) return "experimental";
  if (/^T/.test(normalized)) return "theoretical";
  return "unknown";
}

function collectTags($, titleAnchor) {
  const container = $(titleAnchor).closest("td").find("span.text-muted.font-weight-bold.d-block").first();
  const tags = [];
  container.contents().each((_, node) => {
    if (node.type !== "text") return;
    const value = normalizeSpace($(node).text());
    if (value) tags.push(value);
  });
  return [...new Map(tags.map((tag) => [normalizeTag(tag), tag])).values()];
}

function componentLinks($, row, problemId, baseUrl) {
  const found = { statementUrl: null, solutionUrl: null, markingSchemeUrl: null };
  $(row).find("a[href]").each((_, anchor) => {
    const label = normalizeSpace($(anchor).text()).toUpperCase();
    const href = absoluteUrl($(anchor).attr("href"), baseUrl);
    if (!href) return;
    const path = new URL(href).pathname.replace(/\/$/, "");
    if (label === "T" && path === `/p/${problemId}`) found.statementUrl = href;
    if (label === "S" && path === `/p/${problemId}/s`) found.solutionUrl = href;
    if (label === "M" && path === `/p/${problemId}/m`) found.markingSchemeUrl = href;
  });
  return found;
}

export function parseExamPage(html, examUrl) {
  const $ = load(html);
  const url = new URL(examUrl);
  if (url.protocol !== "https:" || url.hostname !== "xy.pho.rs" || !/^\/[WXY]\d{2}\/?$/i.test(url.pathname)) {
    throw new Error(`Expected one XY exam URL such as https://xy.pho.rs/Y25: ${examUrl}`);
  }
  const headings = $("h3").map((_, el) => normalizeSpace($(el).text())).get().filter(Boolean);
  const title = headings.find((heading) => !/may the pho\.rs/i.test(heading)) ?? normalizeSpace($("title").text()) ?? url.pathname;
  const yearMatch = title.match(/(?:19|20)\d{2}/);
  const code = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "index");
  const competition = {
    sourceKey: "xy.pho.rs",
    name: "Pho.rs XY — квалификационные сборы",
    sourceUrl: `${url.protocol}//${url.host}/`,
    sourceHost: url.hostname.toLowerCase(),
  };
  const problems = [];
  $("table tbody tr").each((_, row) => {
    const anchors = $(row).find("a[href]").toArray();
    const titleAnchor = anchors.find((anchor) => /^\/p\/\d+\/?$/.test(new URL($(anchor).attr("href"), examUrl).pathname));
    if (!titleAnchor) return;
    const sourceUrl = absoluteUrl($(titleAnchor).attr("href"), examUrl);
    const sourceId = new URL(sourceUrl).pathname.match(/^\/p\/(\d+)/)?.[1];
    if (!sourceId) return;
    const cells = $(row).find("td");
    const problemCode = normalizeSpace($(cells[0]).text()) || null;
    const attachments = [];
    $(row).find("a[href]").each((__, anchor) => {
      const href = absoluteUrl($(anchor).attr("href"), examUrl);
      if (!href || !/\/b\/p\/\d+\/(?:pdf|download)/.test(new URL(href).pathname)) return;
      attachments.push({ label: normalizeSpace($(anchor).text()), url: href });
    });
    const statementPdf = attachments.find((item) => /условие|statement/i.test(item.label))?.url ?? null;
    const solutionPdf = attachments.find((item) => /решение|solution/i.test(item.label))?.url ?? null;
    problems.push({
      sourceId, sourceUrl, code: problemCode, title: normalizeSpace($(titleAnchor).text()),
      kind: inferKind(problemCode), tags: collectTags($, titleAnchor),
      ...componentLinks($, row, sourceId, examUrl),
      statementPdfUrl: statementPdf, solutionPdfUrl: solutionPdf, attachments,
      partsStatus: "not_fetched", parts: [], sourceHash: hashText($.html(row) ?? ""),
    });
  });
  return {
    competition,
    exam: { sourceKey: `${competition.sourceKey}:${code.toUpperCase()}`, sourceUrl: url.href, title, year: yearMatch ? Number(yearMatch[0]) : null, code: code.toUpperCase(), series: code[0].toUpperCase(), sourceHash: hashText(html) },
    problems,
  };
}

function parentCode(code) {
  return code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? (code.includes(".") ? code.split(".")[0] : null);
}

export function parseProblemPage(html, problemUrl) {
  const $ = load(html);
  const links = { statementUrl: null, solutionUrl: null, markingSchemeUrl: null };
  $("a.navi-link[href]").each((_, anchor) => {
    const label = normalizeSpace($(anchor).find(".label").first().text()).toUpperCase();
    const href = absoluteUrl($(anchor).attr("href"), problemUrl);
    if (label === "T") links.statementUrl = href;
    if (label === "S") links.solutionUrl = href;
    if (label === "M") links.markingSchemeUrl = href;
  });
  const parts = [];
  $("span.label.label-lg.label-primary").each((_, label) => {
    const scoreRaw = normalizeSpace($(label).find("sup").first().text()).replace(",", ".");
    const code = normalizeSpace($(label).clone().find("sup").remove().end().text()).toUpperCase();
    if (!/^(?:[A-Z]{1,4}\d+(?:\.\d+)*|\d+(?:\.\d+)*)$/.test(code)) return;
    const scoreMatch = scoreRaw.match(/\d+(?:\.\d+)?/);
    const paragraph = $(label).closest("p");
    const prompt = normalizeSpace(paragraph.clone().find("span.label, a[name]").remove().end().text());
    const anchor = paragraph.find("a[name]").first().attr("name");
    const sourceKey = anchor || code;
    parts.push({
      sourceKey, code, parentCode: parentCode(code), ordinal: parts.length + 1,
      score: scoreMatch ? Number(scoreMatch[0]) : null,
      scoreReliability: scoreMatch ? "explicit_html" : null,
      promptText: prompt || null,
      sourceUrl: `${problemUrl}#${encodeURIComponent(sourceKey)}`,
    });
  });
  return { ...links, parts, partsStatus: parts.length ? "structured" : "not_available", sourceHash: hashText(html) };
}
