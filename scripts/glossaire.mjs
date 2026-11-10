// Glossaire : repère les termes du glossaire cités dans les fiches.
//   node scripts/glossaire.mjs export   → écrit tout le texte des fiches (avec les liens existants) dans glossaire-export.jsonl
// Lancé par le workflow « Glossaire » (bouton Run workflow). Le token vient du secret NOTION_TOKEN.
import fs from "node:fs/promises";
import { NOTION_API, NOTION_VERSION, BASES } from "./config.js";

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) { console.error("NOTION_TOKEN manquant."); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;
async function notion(method, p, body) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const wait = last + 350 - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now();
    let res;
    try {
      res = await fetch(NOTION_API + p, { method, signal: AbortSignal.timeout(30000),
        headers: { Authorization: "Bearer " + TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { await sleep(1000 * (attempt + 1)); continue; }
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * Math.min(30, (+res.headers.get("retry-after") || 2) * (attempt + 1))); continue; }
    const data = await res.json().catch(() => ({}));
    if (res.status >= 400) { const e = new Error(data.message || "erreur " + res.status); e.status = res.status; throw e; }
    return data;
  }
  throw new Error("Notion ne répond pas : " + p);
}
const nid = id => String(id || "").replace(/-/g, "").toLowerCase();
const runs = rich => (rich || []).map(r => ({ t: r.plain_text, h: r.href || null, m: r.type === "mention" ? 1 : 0 }));

async function blocks(id, depth = 0) {
  const out = []; let cursor = null;
  do {
    const r = await notion("GET", `/blocks/${id}/children?page_size=100` + (cursor ? "&start_cursor=" + encodeURIComponent(cursor) : ""));
    for (const b of r.results || []) {
      const v = b[b.type] || {};
      if (v.rich_text) out.push({ id: nid(b.id), type: b.type, runs: runs(v.rich_text) });
      if (b.has_children && depth < 3 && b.type !== "child_page" && b.type !== "child_database") out.push(...await blocks(b.id, depth + 1));
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

const lines = [];
for (const base of BASES) {
  let cursor = null;
  do {
    const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
    const r = await notion("POST", `/data_sources/${base.source}/query`, body);
    for (const page of r.results || []) {
      if (page.in_trash || page.archived) continue;
      const props = {};
      let name = "";
      for (const [pn, pr] of Object.entries(page.properties || {})) {
        if (pr.type === "title") name = (pr.title || []).map(x => x.plain_text).join("");
        if (pr.type === "rich_text" && pr.rich_text.length) props[pn] = runs(pr.rich_text);
      }
      let bl = []; try { bl = await blocks(page.id); } catch (e) { console.warn("Fiche non lue :", name, e.message); }
      lines.push(JSON.stringify({ id: nid(page.id), base: base.key, name, props, blocks: bl }));
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  console.log(base.label, "lu");
}
await fs.writeFile("glossaire-export.jsonl", lines.join("\n"));
if (process.argv.includes("--log")) for (const l of lines) console.log("@@" + l);
console.log(lines.length, "fiches exportées");
