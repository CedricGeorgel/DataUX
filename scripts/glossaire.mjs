// Glossaire : relie automatiquement les termes du glossaire cités dans le texte des fiches.
//   node scripts/glossaire.mjs           → rapport : liste les liens qui seraient ajoutés, ne modifie rien
//   node scripts/glossaire.mjs --write   → ajoute les liens dans Notion
//   node scripts/glossaire.mjs export --log → écrit tout le texte des fiches dans le journal (pour un audit)
// Règles : un lien par terme et par fiche (la première fois qu'il apparaît), jamais dans un titre ni dans du code,
// jamais sur un texte déjà lié, jamais une fiche vers elle-même. Une fiche qui cite déjà le terme avec un lien est laissée telle quelle.
// Lancé par le workflow « Glossaire ». Le token vient du secret NOTION_TOKEN.
import fs from "node:fs/promises";
import { NOTION_API, NOTION_VERSION, BASES } from "./config.js";

// Formes cherchées pour chaque terme. Par défaut : le nom, et ce qui est entre parenthèses ou séparé par « / ».
// Ici on corrige les cas où ce serait trop large ou faux ([] = ne jamais relier automatiquement).
const FORMES = {
  "Maquette (mockup) basse et haute fidélité": ["Maquette", "mockup"],
  "Fossé d'exécution et fossé d'évaluation": ["fossé d'exécution", "fossé d'évaluation"],
  "Lapsus et méprise (slip et mistake)": ["lapsus", "méprise"],
  "UR (User Research)": ["User Research", "recherche utilisateur"],
  "UI (interface utilisateur)": [],          // trop fréquent pour être utile
  "UX (expérience utilisateur)": [],
  "Mapping (correspondance)": [],            // confusion avec story mapping et le sens courant
  "Wayfinding (orientation)": ["Wayfinding"],
  "Grille (grid)": [],                       // « grille d'évaluation », « grille de lecture »…
  "Rythme vertical (baseline)": ["Rythme vertical"],
  "Standards (design standards)": ["design standards"],
  "Contrainte": [],                          // sens courant trop fréquent
  "Build": [],
  "Pipeline": [],
  "Direction artistique (DA)": ["Direction artistique"],
  "Design doc (GDD)": ["Design doc", "GDD", "Game Design Document"],
};
const ZONES = new Set(["paragraph", "bulleted_list_item", "numbered_list_item", "quote", "callout", "toggle", "to_do"]);

const WRITE = process.argv.includes("--write");
const EXPORT = process.argv.includes("export");
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
const linkedId = r => {
  if (r.type === "mention" && r.mention && r.mention.type === "page") return nid(r.mention.page.id);
  const m = (r.href || "").replace(/-/g, "").match(/([0-9a-f]{32})/);
  return m ? m[1] : null;
};

async function blocks(id, depth = 0) {
  const out = []; let cursor = null;
  do {
    const r = await notion("GET", `/blocks/${id}/children?page_size=100` + (cursor ? "&start_cursor=" + encodeURIComponent(cursor) : ""));
    for (const b of r.results || []) {
      const v = b[b.type] || {};
      if (v.rich_text) out.push(b);
      if (b.has_children && depth < 3 && b.type !== "child_page" && b.type !== "child_database") out.push(...await blocks(b.id, depth + 1));
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}
async function pagesOf(base) {
  const all = []; let cursor = null;
  do {
    const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
    const r = await notion("POST", `/data_sources/${base.source}/query`, body);
    for (const page of r.results || []) if (!page.in_trash && !page.archived) all.push(page);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return all;
}
const titleOf = page => Object.values(page.properties || {}).filter(p => p.type === "title").map(p => (p.title || []).map(x => x.plain_text).join(""))[0] || "";

// ---------------------------------------------------------------- Export (audit)
if (EXPORT) {
  const runs = rich => (rich || []).map(r => ({ t: r.plain_text, h: r.href || null, m: r.type === "mention" ? 1 : 0 }));
  const lines = [];
  for (const base of BASES) {
    for (const page of await pagesOf(base)) {
      const props = {};
      for (const [pn, pr] of Object.entries(page.properties || {})) if (pr.type === "rich_text" && pr.rich_text.length) props[pn] = runs(pr.rich_text);
      let bl = []; try { bl = (await blocks(page.id)).map(b => ({ id: nid(b.id), type: b.type, runs: runs(b[b.type].rich_text) })); }
      catch (e) { console.warn("Fiche non lue :", titleOf(page), e.message); }
      lines.push(JSON.stringify({ id: nid(page.id), base: base.key, name: titleOf(page), props, blocks: bl }));
    }
    console.log(base.label, "lu");
  }
  await fs.writeFile("glossaire-export.jsonl", lines.join("\n"));
  if (process.argv.includes("--log")) for (const l of lines) console.log("@@" + l);
  console.log(lines.length, "fiches exportées");
  process.exit(0);
}

// ---------------------------------------------------------------- Liens automatiques
const glossBase = BASES.find(b => b.key === "glossaire");
const formes = name => {
  if (name in FORMES) return FORMES[name];
  const m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
  const parts = m ? [m[1], ...m[2].split(/,|\//)] : name.split(/\s\/\s/);
  return parts.map(s => s.trim()).filter(s => s.length >= 3);
};
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]").replace(/-/g, "[-‑ ]?");
const termes = [];
for (const page of await pagesOf(glossBase)) {
  const name = titleOf(page);
  for (const f of formes(name)) termes.push({ id: nid(page.id), name, forme: f,
    re: new RegExp(`(?<![\\p{L}\\p{N}-])(${reEsc(f)})(s|x)?(?![\\p{L}\\p{N}-])`, "iu") });
}
termes.sort((a, b) => b.forme.length - a.forme.length); // les formes longues d'abord
// Pages de toutes les bases, lues une fois. Les noms des autres fiches qui contiennent un terme sont protégés :
// « Design sprint » n'est pas relié à « Sprint », « Story mapping » pas à « Mapping ».
const PAGES = new Map();
for (const base of BASES) PAGES.set(base.key, await pagesOf(base));
const titres = [...PAGES].filter(([k]) => k !== "glossaire").flatMap(([, ps]) => ps.map(titleOf)).filter(Boolean).map(x => x.toLowerCase());
const protege = (texte, start, end, forme) => {
  const low = texte.toLowerCase(), f = forme.toLowerCase();
  return titres.some(ti => ti !== f && ti.includes(f) && (() => { let i = low.indexOf(ti); while (i >= 0) { if (i <= start && i + ti.length >= end) return true; i = low.indexOf(ti, i + 1); } return false; })());
};
console.log(`${new Set(termes.map(t => t.id)).size} termes, ${termes.length} formes cherchées`);

// Remplace une portion d'un texte simple par la même portion avec un lien
function couper(rich, i, start, end, url) {
  const r = rich[i], c = r.text.content;
  const part = (content, link) => ({ type: "text", text: { content, link: link ? { url: link } : null }, annotations: r.annotations });
  const out = [];
  if (start > 0) out.push(part(c.slice(0, start)));
  out.push(part(c.slice(start, end), url));
  if (end < c.length) out.push(part(c.slice(end)));
  rich.splice(i, 1, ...out);
}
// Format accepté par l'API pour réécrire un bloc
const propre = r => r.type === "text" ? { type: "text", text: { content: r.text.content, link: r.text.link || null }, annotations: r.annotations }
  : r.type === "mention" ? { type: "mention", mention: r.mention, annotations: r.annotations }
  : { type: "equation", equation: r.equation, annotations: r.annotations };

let ajout = 0, blocsModifies = 0, erreurs = 0;
for (const base of BASES) {
  if (base.key === "biblio") continue;
  for (const page of PAGES.get(base.key)) {
    const pid = nid(page.id), name = titleOf(page);
    let bl; try { bl = await blocks(page.id); } catch (e) { console.warn("Fiche non lue :", name, e.message); continue; }
    const fait = new Set([pid]);
    for (const b of bl) for (const r of b[b.type].rich_text) { const l = linkedId(r); if (l) fait.add(l); }
    for (const b of bl) {
      if (!ZONES.has(b.type)) continue;
      const rich = b[b.type].rich_text.map(propre);
      let modifie = false;
      for (const t of termes) {
        if (fait.has(t.id)) continue;
        for (let i = 0; i < rich.length; i++) {
          const r = rich[i];
          if (r.type !== "text" || r.text.link || r.annotations.code) continue;
          const m = t.re.exec(r.text.content);
          if (!m || protege(r.text.content, m.index, m.index + m[0].length, t.forme)) continue;
          couper(rich, i, m.index, m.index + m[0].length, "https://www.notion.so/" + t.id);
          fait.add(t.id); modifie = true; ajout++;
          console.log(`${base.label} › ${name} : « ${m[0]} » → ${t.name}`);
          break;
        }
      }
      if (modifie) {
        blocsModifies++;
        if (WRITE) {
          try { await notion("PATCH", `/blocks/${b.id}`, { [b.type]: { rich_text: rich } }); }
          catch (e) { erreurs++; console.warn("Écriture refusée :", name, e.message); }
        }
      }
    }
  }
}
console.log(`${ajout} lien(s) ${WRITE ? "ajouté(s)" : "à ajouter"} dans ${blocsModifies} bloc(s)${erreurs ? `, ${erreurs} erreur(s)` : ""}.`);
if (erreurs) process.exit(1);
