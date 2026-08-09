import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "PhoRsXYPersonalSync/0.1 (personal physics-olympiad catalog; conservative public-page sync)";
let lastNetworkRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validateSourceUrl(rawUrl) {
  const url = new URL(rawUrl);
  const isCatalogIndex = url.hostname === "xy.pho.rs" && /^\/?$/.test(url.pathname);
  const isExam = url.hostname === "xy.pho.rs" && /^\/[WXY]\d{2}\/?$/i.test(url.pathname);
  const isDiscoveredProblem = url.hostname === "pho.rs" && /^\/p\/\d+\/?$/i.test(url.pathname);
  if (url.protocol !== "https:" || (!isCatalogIndex && !isExam && !isDiscoveredProblem)) {
    throw new Error(`URL outside the XY import surface: ${rawUrl}`);
  }
  return url;
}

export async function fetchPublicHtml(rawUrl, options = {}) {
  const url = validateSourceUrl(rawUrl);
  const cacheDir = options.cacheDir ?? path.join("work", "phors-cache");
  const delayMs = options.delayMs ?? 1200;
  const ttlHours = options.ttlHours ?? 24;
  const key = createHash("sha256").update(url.href).digest("hex");
  const htmlPath = path.join(cacheDir, `${key}.html`);
  const metaPath = path.join(cacheDir, `${key}.json`);
  await mkdir(cacheDir, { recursive: true });
  let meta = {};
  try { meta = JSON.parse(await readFile(metaPath, "utf8")); } catch {}
  if (!options.refresh) {
    try {
      const info = await stat(htmlPath);
      if (Date.now() - info.mtimeMs < ttlHours * 3600_000) return await readFile(htmlPath, "utf8");
    } catch {}
  }
  const headers = { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" };
  if (meta.etag) headers["If-None-Match"] = meta.etag;
  if (meta.lastModified) headers["If-Modified-Since"] = meta.lastModified;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const waitMs = Math.max(0, delayMs - (Date.now() - lastNetworkRequestAt));
    if (waitMs) await sleep(waitMs);
    lastNetworkRequestAt = Date.now();
    const response = await fetch(url, { headers, redirect: "follow" });
    const finalUrl = new URL(response.url);
    if (response.redirected && (finalUrl.hostname !== url.hostname || finalUrl.pathname !== url.pathname)) {
      const error = new Error(`Public content unavailable after redirect: ${url.href}`);
      error.code = finalUrl.pathname.startsWith("/accounts/login/") ? "AUTHENTICATION_REQUIRED" : "UNEXPECTED_REDIRECT";
      throw error;
    }
    if (response.status === 304) return await readFile(htmlPath, "utf8");
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 2) throw new Error(`${response.status} while fetching ${url.href}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 30_000) : 1000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} while fetching ${url.href}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) throw new Error(`Unexpected content type for ${url.href}: ${contentType}`);
    const html = await response.text();
    await writeFile(htmlPath, html, "utf8");
    await writeFile(metaPath, JSON.stringify({ url: url.href, etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), fetchedAt: new Date().toISOString() }, null, 2), "utf8");
    return html;
  }
  throw new Error(`Unable to fetch ${url.href}`);
}
