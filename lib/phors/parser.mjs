import { createHash } from "node:crypto";
import { load } from "cheerio";

export const normalizeSpace = (value = "") => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
export const hashText = (value) => createHash("sha256").update(value).digest("hex");
export const normalizeTag = (value) => normalizeSpace(value).toLocaleLowerCase("ru-RU");

const ITEM_CODE_LOOKALIKES = new Map([
  ["А", "A"], ["В", "B"], ["С", "C"], ["Е", "E"], ["Т", "T"],
]);

export function normalizeItemCode(value = "") {
  return Array.from(normalizeSpace(value).toUpperCase(), (character) => ITEM_CODE_LOOKALIKES.get(character) ?? character).join("");
}

const CONTENT_TAGS = new Set([
  "a", "b", "blockquote", "br", "div", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "i", "img", "li", "ol", "p", "span", "strong", "sub", "sup", "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
]);

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

function safeContentUrl(value, baseUrl) {
  const compact = normalizeSpace(value);
  if (!compact) return null;
  try {
    const url = new URL(compact, baseUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function extractStatementContent($, problemUrl) {
  const preferred = $(".content .card.card-custom.gutter-b > .card-body").first();
  const root = preferred.length ? preferred : $(".col-lg-6.col-xl-10 > .card.card-custom.gutter-b > .card-body").first();
  if (!root.length) return { statementHtmlSource: null, statementHtmlOriginal: null, statementTextOriginal: null, statementContentHash: null, imageCount: 0 };
  const source = (root.html() ?? "").trim();
  const rendered = root.clone();
  rendered.find("script,style,iframe,object,embed,form,input,button,textarea,select,noscript").remove();
  rendered.find("*").each((_, element) => {
    const node = $(element);
    const tag = String(element.tagName ?? element.name ?? "").toLowerCase();
    if (!CONTENT_TAGS.has(tag)) {
      node.replaceWith(node.contents());
      return;
    }
    const sourceClasses = String(node.attr("class") ?? "").split(/\s+/);
    const mappedClasses = [];
    if (sourceClasses.includes("row")) mappedClasses.push("statement-row");
    if (sourceClasses.some((name) => /^col-(?:sm|md|lg|xl)-/.test(name))) mappedClasses.push("statement-column");
    if (sourceClasses.includes("font-weight-boldest")) mappedClasses.push("statement-section");
    if (sourceClasses.includes("label-primary")) mappedClasses.push("statement-part-label");
    const keep = {};
    if (mappedClasses.length) keep.class = mappedClasses.join(" ");
    for (const name of ["name", "id", "alt", "title", "colspan", "rowspan"]) {
      const value = node.attr(name);
      if (value) keep[name] = normalizeSpace(value);
    }
    for (const name of ["href", "src"]) {
      const value = safeContentUrl(node.attr(name), problemUrl);
      if (value) keep[name] = value;
    }
    for (const attribute of Object.keys(element.attribs ?? {})) node.removeAttr(attribute);
    for (const [name, value] of Object.entries(keep)) node.attr(name, value);
    if (tag === "a" && keep.href) node.attr("rel", "noreferrer").attr("target", "_blank");
    if (tag === "img") node.attr("loading", "lazy");
  });
  return {
    statementHtmlSource: source,
    statementHtmlOriginal: (rendered.html() ?? "").trim(),
    statementTextOriginal: normalizeSpace(root.text()),
    statementContentHash: hashText(source),
    imageCount: rendered.find("img[src]").length,
  };
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
  const code = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "index");
  const editionYear = /^\D(\d{2})$/i.exec(code)?.[1];
  const competition = {
    sourceKey: "xy.pho.rs",
    name: "Pho.rs XY — Квалификационные сборы",
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
    exam: { sourceKey: `${competition.sourceKey}:${code.toUpperCase()}`, sourceUrl: url.href, title, year: editionYear ? 2000 + Number(editionYear) : null, code: code.toUpperCase(), series: code[0].toUpperCase(), sourceHash: hashText(html) },
    problems,
  };
}

export function parseCatalogIndex(html, catalogUrl = "https://xy.pho.rs/") {
  const $ = load(html);
  const result = new Map();
  $(".card.card-custom.gutter-b").each((_, card) => {
    const examAnchor = $(card).find(".card-header a[href]").filter((__, anchor) => /^[XY]\d{2}$/i.test(normalizeSpace($(anchor).text()))).first();
    const examCode = normalizeSpace(examAnchor.text()).toUpperCase();
    if (!/^[XY](?:1[89]|2[0-6])$/.test(examCode)) return;
    const problems = [];
    $(card).find("a[href]").each((__, anchor) => {
      const sourceUrl = absoluteUrl($(anchor).attr("href"), catalogUrl);
      const sourceId = sourceUrl ? new URL(sourceUrl).pathname.match(/^\/p\/(\d+)\/?$/)?.[1] : null;
      if (!sourceId || problems.some((problem) => problem.sourceId === sourceId)) return;
      const item = $(anchor).closest(".d-flex.align-items-center.pb-9");
      const code = normalizeSpace(item.find("span.label-primary").first().text()).toUpperCase() || null;
      problems.push({
        sourceId,
        sourceUrl,
        code,
        title: normalizeSpace($(anchor).text()),
        kind: inferKind(code),
        tags: [],
        statementUrl: sourceUrl,
        solutionUrl: `${sourceUrl}/s`,
        markingSchemeUrl: `${sourceUrl}/m`,
        statementPdfUrl: null,
        solutionPdfUrl: null,
        attachments: [],
        partsStatus: "not_fetched",
        parts: [],
        statementStatus: "not_fetched",
        sourceHash: hashText($.html(item) ?? ""),
      });
    });
    result.set(examCode, problems);
  });
  return result;
}

function parentCode(code) {
  return code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? (code.includes(".") ? code.split(".")[0] : null);
}

function extractProblemParts($, problemUrl) {
  const parts = [];
  $("span.label.label-lg.label-primary").each((_, label) => {
    const scoreRaw = normalizeSpace($(label).find("sup").first().text()).replace(",", ".");
    const code = normalizeItemCode($(label).clone().find("sup").remove().end().text());
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
  return parts;
}

export function parseProblemParts(html, problemUrl) {
  return extractProblemParts(load(html), problemUrl);
}

export function parseProblemPage(html, problemUrl) {
  const $ = load(html);
  const content = extractStatementContent($, problemUrl);
  const links = { statementUrl: null, solutionUrl: null, markingSchemeUrl: null };
  $("a.navi-link[href]").each((_, anchor) => {
    const label = normalizeSpace($(anchor).find(".label").first().text()).toUpperCase();
    const href = absoluteUrl($(anchor).attr("href"), problemUrl);
    if (label === "T") links.statementUrl = href;
    if (label === "S") links.solutionUrl = href;
    if (label === "M") links.markingSchemeUrl = href;
  });
  const parts = extractProblemParts($, problemUrl);
  return {
    ...links,
    ...content,
    statementLanguage: "ru",
    statementStatus: content.statementHtmlOriginal ? "public" : "not_available",
    parts,
    partsStatus: parts.length ? "structured" : "not_available",
    sourceHash: hashText(html),
  };
}
