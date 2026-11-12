// Génère le site à partir de Notion : site/data/graph.json, une fiche JSON par page, les images.
// Lancé par GitHub Actions. Le token vient du secret NOTION_TOKEN et n'est jamais écrit dans le site.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { NOTION_API, NOTION_VERSION, BASES, CONFUSION, IGNORE, NOMS_GROUPES, CONTRIB_PROPERTY, CONTRIBUTEURS, FORMULAIRES, RESSOURCES } from "./config.js";

const OUT = path.resolve(process.argv[2] || "site/data");
const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) { console.error("NOTION_TOKEN manquant (Settings › Secrets and variables › Actions)."); process.exit(1); }

// Les identifiants Notion ne sont jamais publiés : chaque fiche reçoit un identifiant public,
// calculé à partir de son identifiant Notion et d'un secret. On ne peut pas revenir en arrière.
const SALT = process.env.PUBLIC_ID_SALT || TOKEN;
const pub = id => createHash("sha256").update(SALT + ":" + id).digest("hex").slice(0, 16);

// ---------------------------------------------------------------- API Notion (environ 3 appels par seconde)
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0, calls = 0;
const GAP = +process.env.NOTION_GAP_MS || 350; // délai minimal entre deux appels
async function notion(method, p, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = last + GAP - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now(); calls++;
    let res;
    try {
      res = await fetch(NOTION_API + p, {
        method, signal: AbortSignal.timeout(30000),
        headers: { Authorization: "Bearer " + TOKEN, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) { await sleep(1000 * (attempt + 1)); continue; }
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * Math.min(10, +res.headers.get("retry-after") || 2)); continue; }
    const data = await res.json().catch(() => ({}));
    if (res.status >= 400) { const e = new Error(data.message || "erreur " + res.status); e.status = res.status; throw e; }
    return data;
  }
  throw new Error("Notion ne répond pas : " + p);
}
const nid = id => String(id || "").replace(/-/g, "").toLowerCase();
const plain = rich => (rich || []).map(r => r.plain_text || "").join("").trim();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^(https?:\/\/|mailto:)/i.test(u || "");
function propText(p) {
  switch (p && p.type) {
    case "title": return plain(p.title);
    case "rich_text": return plain(p.rich_text);
    case "select": return p.select ? p.select.name : "";
    case "status": return p.status ? p.status.name : "";
    case "multi_select": return (p.multi_select || []).map(o => o.name).join(", ");
    case "number": return p.number == null ? "" : String(p.number).replace(".", ",");
    case "url": return p.url || "";
    case "email": return p.email || "";
    case "checkbox": return p.checkbox ? "Oui" : "";
    case "date": return p.date ? p.date.start : "";
  }
  return "";
}

// ---------------------------------------------------------------- Lecture des bases
async function sourceId(base) {
  try { await notion("GET", "/data_sources/" + base.source); return base.source; }
  catch (e) { if (e.status !== 404 && e.status !== 400) throw e; }
  const db = await notion("GET", "/databases/" + base.database);
  if (!db.data_sources || !db.data_sources[0]) throw new Error("Base introuvable : " + base.label);
  return db.data_sources[0].id;
}
async function relationIds(pageId, prop) {
  if (!prop.has_more) return (prop.relation || []).map(r => nid(r.id));
  const ids = []; let cursor = null;
  do {
    const r = await notion("GET", `/pages/${pageId}/properties/${encodeURIComponent(prop.id)}?page_size=100` + (cursor ? "&start_cursor=" + encodeURIComponent(cursor) : ""));
    for (const it of r.results || []) if (it.relation && it.relation.id) ids.push(nid(it.relation.id));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return ids;
}
async function readBase(base, pages, contrib) {
  const src = await sourceId(base);
  const nodes = [], rels = [];
  let cursor = null;
  do {
    const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
    const r = await notion("POST", `/data_sources/${src}/query`, body);
    for (const page of r.results || []) {
      if (page.in_trash || page.archived) continue;
      const id = nid(page.id); let name = "", cat = "";
      for (const [pname, p] of Object.entries(page.properties || {})) {
        if (p.type === "title") name = plain(p.title);
        if (pname === base.cat) cat = propText(p);
        if (p.type === "relation" && pname === CONTRIB_PROPERTY) contrib.set(id, await relationIds(page.id, p));
        if (p.type === "relation" && !IGNORE.includes(pname)) {
          const kind = pname === CONFUSION ? "conf" : "link";
          for (const t of await relationIds(page.id, p)) rels.push([id, t, kind]);
        }
      }
      if (!name) continue;
      nodes.push({ id, name, type: base.key, cat });
      pages.set(id, page);
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  console.log(`${base.label} : ${nodes.length} fiches`);
  return { nodes, rels };
}

// ---------------------------------------------------------------- Groupes (méthode de Louvain, déterministe)
function communities(nodes, edges) {
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b); adj.get(b).add(a);
  }
  const ids = [...adj.keys()].sort();
  if (!ids.length) return { comm: {}, comms: [], stats: { mod: 0, density: 0, comps: 0, giant: 0, diam: 0 } };
  const idx = new Map(ids.map((id, i) => [id, i]));
  let W = ids.map(id => { const row = new Map(); for (const o of adj.get(id)) row.set(idx.get(o), 1); return row; });
  const member = ids.map((_, i) => i);
  for (;;) {
    const N = W.length; const k = W.map(row => { let s = 0; for (const w of row.values()) s += w; return s; });
    const m2 = k.reduce((a, b) => a + b, 0); if (!m2) break;
    const c = W.map((_, i) => i), tot = k.slice();
    let moved = false;
    for (let pass = 0; pass < 50; pass++) {
      let changed = false;
      for (let i = 0; i < N; i++) {
        const ci = c[i]; const kin = new Map();
        for (const [j, w] of W[i]) if (j !== i) kin.set(c[j], (kin.get(c[j]) || 0) + w);
        tot[ci] -= k[i];
        let best = ci, bestGain = (kin.get(ci) || 0) - tot[ci] * k[i] / m2;
        for (const cc of [...kin.keys()].sort((x, y) => x - y)) {
          const g = kin.get(cc) - tot[cc] * k[i] / m2;
          if (g > bestGain + 1e-12) { bestGain = g; best = cc; }
        }
        tot[best] += k[i];
        if (best !== ci) { c[i] = best; changed = true; moved = true; }
      }
      if (!changed) break;
    }
    if (!moved) break;
    const ren = new Map(); for (const cc of c) if (!ren.has(cc)) ren.set(cc, ren.size);
    const W2 = Array.from({ length: ren.size }, () => new Map());
    W.forEach((row, i) => { for (const [j, w] of row) { const a = ren.get(c[i]), b = ren.get(c[j]); W2[a].set(b, (W2[a].get(b) || 0) + w); } });
    for (let o = 0; o < member.length; o++) member[o] = ren.get(c[member[o]]);
    W = W2;
  }
  const byGroup = new Map();
  member.forEach((g, o) => { if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(ids[o]); });
  const groups = [...byGroup.values()].sort((x, y) => y.length - x.length || (x[0] < y[0] ? -1 : 1));
  const comm = {}; groups.forEach((g, gi) => g.forEach(id => { comm[id] = gi; }));
  const m2 = 2 * edges.length; let Q = 0;
  groups.forEach((g, gi) => { let inn = 0, tt = 0; for (const id of g) { tt += adj.get(id).size; for (const o of adj.get(id)) if (comm[o] === gi) inn++; } Q += inn / m2 - (tt / m2) ** 2; });
  const name = Object.fromEntries(nodes.map(x => [x.id, x.name]));
  const used = new Set();
  const comms = groups.map((g, gi) => {
    const deg = new Map(g.map(id => [id, [...adj.get(id)].filter(o => comm[o] === gi).length]));
    const order = g.slice().sort((x, y) => deg.get(y) - deg.get(x) || adj.get(y).size - adj.get(x).size || name[x].localeCompare(name[y]));
    let label = null;
    for (const id of order.slice(0, Math.max(3, Math.ceil(order.length / 4)))) {
      const l = NOMS_GROUPES[name[id]]; if (l && !used.has(l)) { label = l; used.add(l); break; }
    }
    const small = g.length <= 2;
    if (!label) label = small ? order.map(id => name[id]).join(" · ") : name[order[0]];
    return { name: label, size: g.length, top: order.slice(0, 3), small };
  });
  const seen = new Set(), comps = [];
  for (const s of ids) { if (seen.has(s)) continue; const q = [s], comp = []; seen.add(s);
    while (q.length) { const v = q.pop(); comp.push(v); for (const o of adj.get(v)) if (!seen.has(o)) { seen.add(o); q.push(o); } }
    comps.push(comp); }
  comps.sort((x, y) => y.length - x.length);
  let diam = 0;
  for (const s of comps[0]) { const dist = new Map([[s, 0]]); const q = [s];
    for (let h = 0; h < q.length; h++) { const v = q[h]; for (const o of adj.get(v)) if (!dist.has(o)) { dist.set(o, dist.get(v) + 1); q.push(o); } }
    for (const d of dist.values()) if (d > diam) diam = d; }
  const total = nodes.length;
  return { comm, comms, stats: { mod: Math.round(Q * 100) / 100, density: total > 1 ? Math.round(edges.length / (total * (total - 1) / 2) * 1000) / 1000 : 0, comps: comps.length, giant: comps[0].length, diam } };
}

// ---------------------------------------------------------------- Contenu des fiches, en HTML sûr
function richHtml(rich) {
  let h = "";
  for (const r of rich || []) {
    let t = esc(r.plain_text).replace(/\n/g, "<br>");
    const a = r.annotations || {};
    if (a.code) t = `<code>${t}</code>`;
    if (a.bold) t = `<strong>${t}</strong>`;
    if (a.italic) t = `<em>${t}</em>`;
    if (a.strikethrough) t = `<s>${t}</s>`;
    if (a.underline) t = `<u>${t}</u>`;
    let pid = null;
    if (r.type === "mention" && r.mention && r.mention.type === "page") pid = nid(r.mention.page.id);
    else if (r.href) {
      const flat = r.href.replace(/-/g, "");
      const m = flat.match(/^\/([0-9a-f]{32})/) || flat.match(/notion\.(?:so|site|com)\/[^?#]*?([0-9a-f]{32})(?:[?#]|$)/);
      if (m) pid = m[1];
    }
    if (pid) t = `<button class="lnk" data-id="${pid}">${t}</button>`;
    else if (r.href && safeUrl(r.href)) t = `<a href="${esc(r.href)}" target="_blank" rel="noopener noreferrer">${t}</a>`;
    h += t;
  }
  return h;
}
async function children(id, depth, budget) {
  const all = []; let cursor = null;
  do {
    if (budget.calls-- <= 0) break;
    const r = await notion("GET", `/blocks/${id}/children?page_size=100` + (cursor ? "&start_cursor=" + encodeURIComponent(cursor) : ""));
    for (const b of r.results || []) {
      if (b.has_children && depth < 4 && b.type !== "child_page" && b.type !== "child_database") b._children = await children(b.id, depth + 1, budget);
      all.push(b);
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return all;
}
const fileUrl = v => (v && (v.type === "external" ? v.external && v.external.url : v.file && v.file.url)) || "";
function blocksHtml(blocks, imgs) {
  let h = "", list = null;
  for (const b of blocks) {
    const t = b.type, v = b[t] || {};
    const tag = t === "bulleted_list_item" ? "ul" : t === "numbered_list_item" ? "ol" : null;
    if (list !== tag) { if (list) h += `</${list}>`; if (tag) h += `<${tag}>`; list = tag; }
    const txt = richHtml(v.rich_text);
    const kids = b._children ? blocksHtml(b._children, imgs) : "";
    switch (t) {
      case "paragraph": if (txt || kids) h += `<p>${txt}</p>${kids}`; break;
      case "heading_1": h += `<h3>${txt}</h3>${kids ? `<div>${kids}</div>` : ""}`; break;
      case "heading_2": h += `<h4>${txt}</h4>${kids ? `<div>${kids}</div>` : ""}`; break;
      case "heading_3": h += `<h5>${txt}</h5>${kids ? `<div>${kids}</div>` : ""}`; break;
      case "bulleted_list_item": case "numbered_list_item": h += `<li>${txt}${kids}</li>`; break;
      case "to_do": h += `<p class="todo"><input type="checkbox" disabled${v.checked ? " checked" : ""}> ${txt}</p>${kids}`; break;
      case "toggle": h += `<details><summary>${txt}</summary>${kids}</details>`; break;
      case "quote": h += `<blockquote>${txt}${kids}</blockquote>`; break;
      case "callout": { const ic = v.icon && v.icon.type === "emoji" ? esc(v.icon.emoji) + " " : ""; h += `<div class="callout">${ic}${txt}${kids}</div>`; break; }
      case "divider": h += "<hr>"; break;
      case "code": h += `<pre><code>${esc(plain(v.rich_text))}</code></pre>`; break;
      case "equation": h += `<pre class="eq">${esc(v.expression)}</pre>`; break;
      case "image": { const src = fileUrl(v);
        // L'image est copiée dans le site (les liens Notion expirent après 1 h)
        if (/^https:\/\//i.test(src)) { const k = imgs.length; imgs.push({ src, id: pub(nid(b.id)) });
          const cap = richHtml(v.caption);
          h += `<!--img${k}--><figure><img src="@@IMG${k}@@" alt="${esc(plain(v.caption))}" loading="lazy">${cap ? `<figcaption>${cap}</figcaption>` : ""}</figure><!--/img${k}-->`; }
        break; }
      case "bookmark": case "embed": case "link_preview":
        if (safeUrl(v.url)) h += `<p><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${esc(v.url)}</a></p>`; break;
      case "video": case "file": case "pdf": case "audio": { const u = fileUrl(v);
        // Fichiers hébergés par Notion : lien vers la fiche (leur adresse expire)
        if (v.type === "external" && safeUrl(u)) h += `<p><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(v.name || u)}</a></p>`;
        else h += `<p class="muted">Fichier joint : ${esc(v.name || "à ouvrir dans Notion")}</p>`; break; }
      case "table": {
        const rows = (b._children || []).map((row, i) => "<tr>" + ((row.table_row && row.table_row.cells) || []).map(cell =>
          i === 0 && v.has_column_header ? `<th>${richHtml(cell)}</th>` : `<td>${richHtml(cell)}</td>`).join("") + "</tr>").join("");
        h += `<div class="tbl"><table>${rows}</table></div>`; break; }
      case "column_list": h += `<div class="cols">${kids}</div>`; break;
      case "column": h += `<div>${kids}</div>`; break;
      case "synced_block": h += kids; break;
      case "child_page": h += `<p class="muted">${esc(v.title)}</p>`; break;
      case "child_database": h += `<p class="muted">Base : ${esc(v.title)}</p>`; break;
    }
  }
  if (list) h += `</${list}>`;
  return h;
}
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif" };
async function saveImage(img) {
  try {
    const res = await fetch(img.src, { signal: AbortSignal.timeout(20000), redirect: "follow" });
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!res.ok || !EXT[type]) return null; // pas de SVG : il pourrait contenir du code
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return null;
    const name = img.id + "." + EXT[type];
    await fs.writeFile(path.join(OUT, "img", name), buf);
    return "data/img/" + name;
  } catch (e) { return null; }
}
const SKIP = new Set(["title", "relation", "rollup", "formula", "created_time", "last_edited_time", "created_by", "last_edited_by", "people", "files", "button", "unique_id", "verification"]);
async function fiche(id, page, contributors) {
  const props = [];
  for (const [pname, pr] of Object.entries(page.properties || {})) {
    if (SKIP.has(pr.type) || /ancien/i.test(pname)) continue;
    let html;
    if (pr.type === "rich_text") { html = richHtml(pr.rich_text); if (!html.replace(/<[^>]+>/g, "").trim()) continue; }
    else if (pr.type === "url") { if (!safeUrl(pr.url)) continue; html = `<a href="${esc(pr.url)}" target="_blank" rel="noopener noreferrer">${esc(pr.url.replace(/^https?:\/\/(www\.)?/, ""))}</a>`; }
    else { const s = propText(pr); if (!s) continue; html = esc(s); }
    props.push({ name: pname, html });
  }
  const imgs = [];
  let html = blocksHtml(await children(id, 0, { calls: 25 }), imgs);
  for (let k = 0; k < imgs.length; k++) {
    const local = await saveImage(imgs[k]);
    html = local ? html.replace(`@@IMG${k}@@`, local).replace(`<!--img${k}-->`, "").replace(`<!--/img${k}-->`, "")
                 : html.replace(new RegExp(`<!--img${k}-->[\\s\\S]*?<!--/img${k}-->`), "");
  }
  return { id, props, html, contributors };
}

// ---------------------------------------------------------------- Génération
const t0 = Date.now();
// Numéro de version dans les pages : après chaque publication, les navigateurs rechargent le code
const V = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 8);
for (const f of ["index.html", "embed.html"]) {
  const file = path.join(OUT, "..", f);
  const html = await fs.readFile(file, "utf8").catch(() => null);
  if (html) await fs.writeFile(file, html.replace(/(assets\/[\w.-]+\.(?:js|css))(\?v=[\w]+)?/g, `$1?v=${V}`));
}
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, "fiches"), { recursive: true });
await fs.mkdir(path.join(OUT, "img"), { recursive: true });

// Noms des contributeurs
const people = new Map();
try {
  const src = await sourceId(CONTRIBUTEURS);
  let cursor = null;
  do {
    const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
    const r = await notion("POST", `/data_sources/${src}/query`, body);
    for (const page of r.results || []) {
      const t = Object.values(page.properties || {}).find(p => p.type === "title");
      if (!t || page.in_trash || page.archived) continue;
      // Fiche contributeur : tout ce qui présente la personne. Les fiches relues viennent des relations.
      const person = { name: plain(t.title), job: "", formation: "", bio: "", tags: [], since: page.created_time || "", photo: "", links: [] };
      const props = Object.entries(page.properties || {});
      // Case « Profil public » (ou « Affichage », « Consentement ») décochée : on ne publie que le nom
      const consent = props.find(([n, pr]) => pr.type === "checkbox" && /public|affich|consent/i.test(n));
      const open = !consent || consent[1].checkbox;
      const texts = [];
      for (const [pname, pr] of open ? props : []) {
        if (pr.type === "rich_text" && plain(pr.rich_text)) {
          if (!person.job && /job|m[ée]tier|poste|fonction/i.test(pname)) person.job = plain(pr.rich_text);
          else if (!person.formation && /formation|[ée]cole|[ée]tudes/i.test(pname)) person.formation = plain(pr.rich_text);
          else texts.push(richHtml(pr.rich_text));
        }
        if ((pr.type === "select" || pr.type === "multi_select" || pr.type === "status")) person.tags.push(...propText(pr).split(", ").filter(Boolean));
        if (pr.type === "url" && pr.url) {
          const u = /^[a-z]+:/i.test(pr.url) ? pr.url : "https://" + pr.url.replace(/^\/+/, "");
          if (/^https:\/\/[^\s"'<>]+$/.test(u)) person.links.push({ label: pname.trim(), url: u });
        }
        if (pr.type === "files" && !person.photo) {
          const f = (pr.files || []).find(x => x.file || x.external);
          if (f) person.photo = await saveImage({ id: "p" + pub(nid(page.id)), src: (f.file || f.external).url }) || "";
        }
      }
      if (open) {
        // Photo : l'image de couverture de la page, sinon une propriété Fichiers, sinon l'icône si c'est une image
        const cv = page.cover && (page.cover.file || page.cover.external);
        if (cv) person.photo = await saveImage({ id: "p" + pub(nid(page.id)), src: cv.url }) || person.photo;
        const ic = page.icon && (page.icon.file || page.icon.external);
        if (!person.photo && ic) person.photo = await saveImage({ id: "p" + pub(nid(page.id)), src: ic.url }) || "";
        // Description : textes des propriétés puis contenu de la page (sans images)
        let body = "";
        try { body = blocksHtml(await children(page.id, 0, { calls: 5 }), []).replace(/<!--img\d+-->[\s\S]*?<!--\/img\d+-->/g, ""); } catch (e) {}
        person.bio = texts.map(x => `<p>${x}</p>`).join("") + body;
      }
      // LinkedIn en premier
      person.links.sort((x, y) => /linkedin/i.test(y.url) - /linkedin/i.test(x.url));
      people.set(nid(page.id), person);
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  console.log(`Contributeurs : ${people.size}`);
} catch (e) { console.warn("Contributeurs illisibles :", e.message); }

const pages = new Map(), nodes = new Map(), rels = [], contrib = new Map();
for (const b of BASES) {
  const r = await readBase(b, pages, contrib);
  for (const x of r.nodes) nodes.set(x.id, x);
  rels.push(...r.rels);
}
const edges = new Map(), conf = new Map();
for (const [a, b, kind] of rels) {
  if (a === b || !nodes.has(a) || !nodes.has(b)) continue;
  const key = a < b ? a + "|" + b : b + "|" + a;
  (kind === "conf" ? conf : edges).set(key, key.split("|"));
}
const list = [...nodes.values()], E = [...edges.values()];
const { comm, comms, stats } = communities(list, E);
list.forEach(x => { x.comm = comm[x.id] ?? -1; });
const graph = {
  generated: new Date().toISOString(),
  bases: BASES.map(b => ({ key: b.key, label: b.label, one: b.one, color: b.color, count: list.filter(x => x.type === b.key).length })),
  nodes: list, edges: E, conf: [...conf.values()], comms, stats,
  // Seuls des liens https sont acceptés pour les formulaires
  forms: Object.fromEntries(Object.entries(FORMULAIRES).filter(([, u]) => /^https:\/\/[^\s"'<>]+$/.test(u || ""))),
};
// Ressources validées (lien rempli) : liste à part, reliée aux fiches par leurs relations
const ressources = [];
try {
  const src = await sourceId(RESSOURCES);
  let cursor = null;
  do {
    const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
    const r = await notion("POST", `/data_sources/${src}/query`, body);
    for (const page of r.results || []) {
      if (page.in_trash || page.archived) continue;
      let name = "", kind = "", url = "", liees = [];
      for (const [pname, p] of Object.entries(page.properties || {})) {
        if (p.type === "title") name = plain(p.title);
        if (pname === RESSOURCES.type) kind = propText(p);
        if (pname === RESSOURCES.lien && p.type === "url") url = p.url || "";
        if (p.type === "relation") liees.push(...(await relationIds(page.id, p)).filter(t => nodes.has(t)));
      }
      if (!name || !/^https:\/\/[^\s"'<>]+$/.test(url)) continue;
      ressources.push({ id: nid(page.id), page, name, kind, url, liees: [...new Set(liees)] });
    }
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  console.log(`Ressources : ${ressources.length} publiées`);
} catch (e) { console.warn("Ressources illisibles :", e.message); }

// Publication : identifiants Notion remplacés par les identifiants publics
const pubGraph = {
  ...graph,
  nodes: list.map(x => ({ ...x, id: pub(x.id) })),
  edges: graph.edges.map(([a, b]) => [pub(a), pub(b)]),
  conf: graph.conf.map(([a, b]) => [pub(a), pub(b)]),
  comms: comms.map(c => ({ ...c, top: c.top.map(pub) })),
  // Contributeurs : profil public et fiches relues
  people: [...people].map(([cid, p]) => ({ id: pub(cid), ...p,
    fiches: [...contrib].filter(([fid, cs]) => nodes.has(fid) && cs.includes(cid)).map(([fid]) => pub(fid)) }))
    .filter(p => p.fiches.length).sort((a, b) => b.fiches.length - a.fiches.length || a.name.localeCompare(b.name, "fr")),
  ressources: ressources.map(r => ({ id: pub(r.id), name: r.name, kind: r.kind, url: r.url, liees: r.liees.map(pub) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr")),
};
await fs.writeFile(path.join(OUT, "graph.json"), JSON.stringify(pubGraph));
console.log(`Graphe : ${list.length} fiches, ${E.length} liens, ${graph.conf.length} confusions, ${comms.length} groupes`);

let n = 0, failed = 0;
for (const [id, page] of pages) {
  const who = [...new Set(contrib.get(id) || [])].filter(c => people.has(c)).map(c => ({ id: pub(c), name: people.get(c).name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  try {
    const f = await fiche(id, page, who);
    f.id = pub(id);
    // Liens vers d'autres fiches : identifiant public. Liens vers une page hors des 8 bases : simple texte.
    f.html = f.html.replace(/<button class="lnk" data-id="([0-9a-f]{32})">([\s\S]*?)<\/button>/g,
      (m, pid, inner) => nodes.has(pid) ? `<button class="lnk" data-id="${pub(pid)}">${inner}</button>` : inner);
    f.props = f.props.map(p => ({ ...p, html: p.html.replace(/<button class="lnk" data-id="([0-9a-f]{32})">([\s\S]*?)<\/button>/g,
      (m, pid, inner) => nodes.has(pid) ? `<button class="lnk" data-id="${pub(pid)}">${inner}</button>` : inner) }));
    await fs.writeFile(path.join(OUT, "fiches", pub(id) + ".json"), JSON.stringify(f));
  }
  catch (e) { failed++; console.warn("Fiche non générée :", nodes.get(id).name, e.message); }
  if (++n % 50 === 0) console.log(`${n}/${pages.size} fiches`);
}
// Fiches des ressources : même format que les autres, sans la propriété du lien (affiché en bouton)
for (const r of ressources) {
  try {
    const f = await fiche(r.id, r.page, []);
    f.id = pub(r.id);
    const relink = h => h.replace(/<button class="lnk" data-id="([0-9a-f]{32})">([\s\S]*?)<\/button>/g,
      (m, pid, inner) => nodes.has(pid) ? `<button class="lnk" data-id="${pub(pid)}">${inner}</button>` : inner);
    f.html = relink(f.html);
    f.props = f.props.filter(p => p.name !== RESSOURCES.lien).map(p => ({ ...p, html: relink(p.html) }));
    await fs.writeFile(path.join(OUT, "fiches", f.id + ".json"), JSON.stringify(f));
  } catch (e) { failed++; console.warn("Ressource non générée :", r.name, e.message); }
}
console.log(`Terminé en ${Math.round((Date.now() - t0) / 1000)} s, ${calls} appels à Notion, ${failed} fiche(s) en échec.`);
