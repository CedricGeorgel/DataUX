// Réseau des fiches. Une seule base de code pour les deux pages :
// <body data-mode="full"> = page complète, <body data-mode="embed"> = nuage seul pour Notion.
(function () {
"use strict";
const MODE = document.body.dataset.mode || "full";
const FULL = MODE === "full";
const API_GRAPH = "data/graph.json";
const API_FICHE = id => "data/fiches/" + id + ".json";
const BIG = "index.html";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
                set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
// Thème choisi dans le panneau (clair ou sombre). Sans choix, le site suit le réglage de l'appareil.
const savedTheme = store.get("reseau-theme");
if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;

// ---------------------------------------------------------------- Écrans de chargement, d'erreur et de premier lancement
const screen = document.createElement("div"); screen.className = "screen"; document.body.appendChild(screen);
function showScreen(html) { screen.style.display = "flex"; screen.innerHTML = `<div class="box">${html}</div>`; }
function hideScreen() { screen.style.display = "none"; screen.innerHTML = ""; }
function showLoading() { showScreen(`<p class="loading" role="status">Chargement des fiches<span class="dots"></span></p>`); }
function showError(msg) {
  showScreen(`<h1>Les fiches ne se chargent pas</h1><p>${esc(msg)}</p><button class="btn" id="retry">Réessayer</button>`);
  $("retry").onclick = start;
}
async function start() {
  showLoading();
  let r, j;
  try { r = await fetch(API_GRAPH, { cache: "no-cache" }); }
  catch (e) { return showError("Le site ne répond pas. Vérifie ta connexion, puis réessaie."); }
  if (r.status === 404) return showError("Les données ne sont pas encore publiées. Elles arrivent à la prochaine mise à jour.");
  try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok || !j || !j.nodes) return showError("Les données sont illisibles (erreur " + r.status + ").");
  hideScreen();
  init(j);
}
start();

// ---------------------------------------------------------------- Le graphe
function init(G) {
  const TYPES = {}; G.bases.forEach(b => { TYPES[b.key] = { label: b.label, color: b.color }; });
  const typeKeys = Object.keys(TYPES);
  const byId = new Map(G.nodes.map(n => [n.id, n]));
  G.nodes.forEach(n => { n.nb = new Set(); n.sug = new Set(); });
  G.edges.forEach(([a, b]) => { byId.get(a).nb.add(b); byId.get(b).nb.add(a); });
  G.conf.forEach(([a, b]) => { byId.get(a).sug.add(b); byId.get(b).sug.add(a); });
  G.nodes.forEach(n => n.deg = n.nb.size);

  // ---------- Densité des liens selon le zoom
  // Chaque fiche classe ses liens du plus fort au plus faible : voisins communs, même groupe,
  // puis la notion la plus spécifique. Au dézoom on ne garde que les meilleurs liens de chaque fiche.
  const eKey = (a, b) => a < b ? a + "|" + b : b + "|" + a;
  const eId = x => x.id || x;
  const eNode = x => x.id ? x : byId.get(x);
  const eForce = new Map(G.edges.map(([a, b]) => { const A = byId.get(a), B = byId.get(b); let s = 0;
    A.nb.forEach(x => { if (B.nb.has(x)) s++; }); return [eKey(a, b), s + (A.comm === B.comm && A.comm >= 0 ? 2 : 0)]; }));
  const eRank = new Map();
  G.nodes.forEach(n => [...n.nb].sort((x, y) => eForce.get(eKey(n.id, y)) - eForce.get(eKey(n.id, x)) || byId.get(x).deg - byId.get(y).deg)
    .forEach((m, i) => { const k = eKey(n.id, m); eRank.set(k, Math.min(eRank.get(k) ?? Infinity, i)); }));
  // Même principe pour « À ne pas confondre » : rang min (le meilleur des 2 fiches) et rang max (le pire).
  const cForce = ([a, b]) => { const A = byId.get(a), B = byId.get(b); let s = 0; A.nb.forEach(x => { if (B.nb.has(x)) s++; }); return s; };
  const cRank = new Map();
  G.nodes.forEach(n => [...n.sug].sort((x, y) => cForce([n.id, y]) - cForce([n.id, x]) || byId.get(x).deg - byId.get(y).deg)
    .forEach((m, i) => { const k = eKey(n.id, m), r = cRank.get(k) || [Infinity, -1]; cRank.set(k, [Math.min(r[0], i), Math.max(r[1], i)]); }));
  // Très loin : seules les confusions principales des 2 fiches restent nettes. Puis la principale d'une fiche, puis 2, puis toutes.
  // On ne garde nettes aussi que celles dont une des 2 fiches a son nom affiché à ce niveau de zoom (même seuil que les noms).
  const labelMin = k => k < 0.55 ? 9 : k < 0.8 ? 6 : k < 1.1 ? 4 : 0;
  const confShown = (r, k, d) => k >= 1.1 || (Math.max(eNode(d.source).deg, eNode(d.target).deg) >= labelMin(k)
    && (k < .45 ? r[1] < 1 : k < .7 ? r[0] < 1 : r[0] < 2));
  // Les liens ne disparaissent pas : ils s'estompent selon leur rang et reprennent de la netteté en zoomant.
  // Nombre de liens nets par fiche : 1 de loin, environ 2 à k = 0,7, 4 à k = 1, 11 à k = 1,4.
  function edgeVis(k) {
    if (!edgeSel) return;
    const c = Math.max(1, Math.pow(2, (k - .45) / .27));
    edgeSel.style("--f", d => { const key = eKey(eId(d.source), eId(d.target));
      if (d.sug) return confShown(cRank.get(key) || [0, 0], k, d) ? 1 : Math.max(.08, Math.min(1, k - .15)).toFixed(3);
      const r = eRank.get(key); return r < c ? 1 : Math.max(.05, Math.pow(c / (r + 1), 1.5)).toFixed(3); });
  }
  // Glossaire et bibliographie masqués au départ : ce sont des fiches de référence, pas des notions à explorer
  const HIDDEN = ["glossaire", "biblio"];
  const state = { ring: false, types: new Set(typeKeys.filter(t => !HIDDEN.includes(t))), showIso: true, showSug: true, focus: null, panel: null };
  const color = n => TYPES[n.type].color;
  // Ressources (templates à imprimer) : hors carte, ouvertes depuis l'encart « Ressources »
  const RES = G.ressources || [], resById = new Map(RES.map(r => [r.id, r]));

  // ---------- Barre de filtres (page complète)
  // Mobile : le panneau et la fiche deviennent des feuilles en bas d'écran
  const MOB = () => FULL && innerWidth <= 760;
  const sideW = () => !FULL || document.body.classList.contains("nopanel") || innerWidth <= 760 ? 0 : 360;
  const topH = FULL ? 70 : 20;
  // Zone libre de l'écran : sans la barre, le panneau et la fenêtre de fiche
  function viewArea() {
    let x0 = 0, x1 = innerWidth - sideW(), y0 = topH, y1 = innerHeight;
    if (MOB()) { const b = document.body.classList, w = $("win");
      const sheet = b.contains("hasfiche") ? (w.classList.contains("collapsed") ? w.offsetHeight : innerHeight * .62) : (b.contains("nopanel") ? $("panel").offsetHeight : innerHeight * .6);
      y1 = innerHeight - sheet - 8; }
    const w = FULL && $("win");
    if (w && w.classList.contains("open") && !w.classList.contains("collapsed") && innerWidth > 760) {
      const r = w.getBoundingClientRect();
      if (r.left + r.width / 2 < (x0 + x1) / 2) { if (x1 - r.right > 300) x0 = r.right; }
      else if (r.left - x0 > 300) x1 = r.left;
    }
    return { x0, x1, y0, y1, W: x1 - x0, H: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  let chips = null, isoBtn = null, fitBar = () => {};
  const isoCount = G.nodes.filter(n => n.deg === 0).length;
  if (FULL) {
    const filterBtn = $("filterBtn"), pop = $("filters");
    const bar = document.querySelector(".bar");
    const closePop = () => { pop.classList.remove("open"); bar.classList.remove("popopen"); filterBtn.setAttribute("aria-expanded", "false"); };
    filterBtn.onclick = e => { e.stopPropagation(); const o = pop.classList.toggle("open"); bar.classList.toggle("popopen", o); filterBtn.setAttribute("aria-expanded", o); };
    // Filtres en ligne dans la barre quand ils tiennent sur une ligne, sinon dans le menu « Filtres »
    fitBar = () => { closePop(); if (MOB()) return bar.classList.remove("inline"); bar.classList.add("inline"); if (bar.offsetHeight > 48) bar.classList.remove("inline"); };
    document.addEventListener("click", e => { if (pop.classList.contains("open") && !pop.contains(e.target) && !filterBtn.contains(e.target)) closePop(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && pop.classList.contains("open")) { closePop(); filterBtn.focus(); } });
    const panelBtn = $("panelBtn");
    panelBtn.onclick = () => { const closed = document.body.classList.toggle("nopanel"); const l = closed ? "Afficher le panneau" : "Masquer le panneau";
      panelBtn.setAttribute("aria-label", l); panelBtn.title = l; panelBtn.setAttribute("aria-expanded", !closed); fitBar(); renderPanel(); if (!state.focus) fitNodes(visNodes, 1.2, 400); };
    chips = $("chips");
    typeKeys.forEach(t => {
      const b = document.createElement("button"); b.className = "chip" + (state.types.has(t) ? "" : " off"); b.setAttribute("aria-pressed", state.types.has(t));
      b.title = TYPES[t].label;
      b.innerHTML = `<span class="sw" style="background:${TYPES[t].color}"></span><span class="full">${esc(TYPES[t].label)} <span class="muted">${G.bases.find(x => x.key === t).count}</span></span><span class="short">${esc(TYPES[t].label.replace(/^Fiches\s+/, "").split(" ")[0])}</span>`;
      b.onclick = () => { state.types.has(t) ? state.types.delete(t) : state.types.add(t); b.classList.toggle("off", !state.types.has(t)); b.setAttribute("aria-pressed", state.types.has(t)); state.focus ? select(state.focus, false, state.ring) : update(); };
      chips.appendChild(b);
    });
    isoBtn = $("isoBtn");
    isoBtn.title = `${isoCount} fiches sans lien`;
    const isoLabel = () => { isoBtn.classList.toggle("off", !state.showIso); isoBtn.setAttribute("aria-pressed", state.showIso); };
    isoLabel(); if (!isoCount) isoBtn.style.display = "none";
    isoBtn.onclick = () => { state.showIso = !state.showIso; isoLabel(); update(); };
    const sugBtn = $("sugBtn"); if (!G.conf.length) sugBtn.style.display = "none";
    sugBtn.title = "Liens « À ne pas confondre »";
    const sugLabel = () => { sugBtn.classList.toggle("off", !state.showSug); sugBtn.setAttribute("aria-pressed", state.showSug); };
    sugLabel();
    sugBtn.onclick = () => { state.showSug = !state.showSug; sugLabel(); state.focus ? select(state.focus, false, state.ring) : update(); };
    const dl = $("names");
    G.nodes.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")).forEach(n => { const o = document.createElement("option"); o.value = n.name; dl.appendChild(o); });
    $("q").addEventListener("change", e => {
      const v = e.target.value.trim().toLowerCase(); if (!v) return;
      const n = G.nodes.find(x => x.name.toLowerCase() === v) || G.nodes.find(x => x.name.toLowerCase().includes(v));
      if (n) select(n.id, true);
    });
  }
  function filterCount() {
    if (!FULL) return;
    const n = (typeKeys.length - state.types.size) + (state.showIso ? 0 : 1) + (state.showSug ? 0 : 1);
    $("fcount").textContent = n ? "· " + n : "";
  }

  // ---------- Bouton « Ouvrir en grand » (page nuage seul)
  let bigLink = null;
  if (!FULL) {
    bigLink = document.createElement("a"); bigLink.className = "btn open-big"; bigLink.target = "_blank"; bigLink.rel = "noopener";
    bigLink.href = BIG; bigLink.textContent = "Ouvrir en grand ↗"; document.body.appendChild(bigLink);
    const hint = document.createElement("div"); hint.className = "hint"; hint.textContent = "Clic : voir les liens · Double clic : isoler la fiche"; document.body.appendChild(hint);
  }

  // ---------- SVG
  const svg = d3.select("#svg"); svg.selectAll("*").remove();
  const root = svg.append("g");
  const gHulls = root.append("g"), gEdges = root.append("g"), gNodes = root.append("g");
  const zoom = d3.zoom().scaleExtent([.15, 5]).on("zoom", e => { root.attr("transform", e.transform); labelVis(e.transform.k); edgeVis(e.transform.k); });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node()) select(null); });

  // ---------- Disposition par groupes (Louvain calculé par le serveur)
  const C = G.comms;
  const sameComm = (a, b) => { a = a.id ? a : byId.get(a); b = b.id ? b : byId.get(b); return a.comm === b.comm && a.comm >= 0; };
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let u = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    u = Math.max(0, Math.min(1, u)); const qx = ax + u * dx, qy = ay + u * dy; return { d: Math.hypot(px - qx, py - qy), u, qx, qy }; }
  // Une bulle par groupe. On essaie plusieurs dispositions et on garde celle où le moins de liens
  // entre 2 bulles traversent une 3e bulle, puis la plus compacte. Tirages fixes : même vue à chaque ouverture.
  function anchors() {
    const w = {};
    G.edges.forEach(([a, b]) => { const ca = byId.get(a).comm, cb = byId.get(b).comm;
      if (ca !== cb && ca >= 0 && cb >= 0) { const key = Math.min(ca, cb) + "-" + Math.max(ca, cb); w[key] = (w[key] || 0) + 1; } });
    const pairs = Object.entries(w).map(([k, v]) => { const [s, t] = k.split("-").map(Number); return { s, t, w: v }; });
    function edgeAvoid(nodes, links, margin) { let alpha = 0;
      const f = a => { alpha = a; links.forEach(l => { const S = l.source, T = l.target;
        nodes.forEach(c => { if (c === S || c === T) return; const r = segDist(c.x, c.y, S.x, S.y, T.x, T.y);
          const need = c.r + margin; if (r.u > 0.02 && r.u < 0.98 && r.d < need) { const nx = (c.x - r.qx) || 1e-3, ny = (c.y - r.qy) || 1e-3, n = Math.hypot(nx, ny);
            const push = (need - r.d) * alpha * 0.6; c.vx += nx / n * push; c.vy += ny / n * push; S.vx -= nx / n * push * .25; S.vy -= ny / n * push * .25; T.vx -= nx / n * push * .25; T.vy -= ny / n * push * .25; } }); }); };
      f.initialize = () => {}; return f; }
    function run(seed) {
      const rnd = d3.randomLcg(seed);
      const sup = C.map((c, k) => ({ c, k })).filter(o => !o.c.small).map(({ c, k }) => { const a = rnd() * 6.283, d = 150 + rnd() * 350; return { k, r: 15 * Math.sqrt(c.size) + 16, x: Math.cos(a) * d, y: Math.sin(a) * d }; });
      const sl = pairs.filter(p => !C[p.s].small && !C[p.t].small).map(p => ({ source: p.s, target: p.t, w: p.w }));
      const ss = d3.forceSimulation(sup).stop().randomSource(d3.randomLcg(seed + 1))
        .force("link", d3.forceLink(sl).id(d => d.k).distance(l => l.source.r + l.target.r + 60).strength(l => Math.min(.8, .12 * l.w)))
        .force("charge", d3.forceManyBody().strength(d => -25 * d.r))
        .force("collide", d3.forceCollide(d => d.r + 40))
        .force("avoid", edgeAvoid(sup, sl, 22))
        .force("x", d3.forceX(0).strength(.05)).force("y", d3.forceY(0).strength(.05));
      for (let i = 0; i < 700; i++) ss.tick();
      let cross = 0;
      sl.forEach(l => sup.forEach(c => { if (c === l.source || c === l.target) return;
        const r = segDist(c.x, c.y, l.source.x, l.source.y, l.target.x, l.target.y); if (r.u > 0 && r.u < 1 && r.d < c.r + 8) cross += l.w; }));
      const cx = d3.mean(sup, s => s.x) || 0, cy = d3.mean(sup, s => s.y) || 0;
      const R = d3.max(sup, s => Math.hypot(s.x - cx, s.y - cy) + s.r) || 0;
      return { sup, cross, R, score: cross * 300 + R };
    }
    const runs = C.filter(c => !c.small).length > 2 ? 60 : 1;
    let best = null; for (let seed = 1; seed <= runs; seed++) { const r = run(seed); if (!best || r.score < best.score) best = r; }
    const sup = best.sup, a = {}; sup.forEach(s => a[s.k] = [s.x, s.y]);
    if (!sup.length) sup.push({ k: -1, r: 60, x: 0, y: 0 });
    // fiches isolées : couronne irrégulière qui suit la forme de l'ensemble, groupées par base
    const rnd = d3.randomLcg(7);
    // une fiche isolée qui a une confusion avec une fiche d'un groupe se place juste à l'extérieur de ce groupe
    const gx = d3.mean(sup, s => s.x), gy = d3.mean(sup, s => s.y), near = new Map();
    G.nodes.filter(n => n.comm < 0).forEach(n => { const p = [...n.sug].map(i => byId.get(i)).find(m => m.comm >= 0 && a[m.comm]); if (!p) return;
      const s = sup.find(o => o.k === p.comm), k = near.get(p.comm) || 0; near.set(p.comm, k + 1);
      const t = Math.atan2(s.y - gy, s.x - gx) + (k - .5) * .35; n.iso = [s.x + (s.r + 55) * Math.cos(t), s.y + (s.r + 55) * Math.sin(t)]; n.nearComm = true; });
    const iso = G.nodes.filter(n => n.comm < 0 && !n.nearComm).sort((a, b) => typeKeys.indexOf(a.type) - typeKeys.indexOf(b.type) || a.name.localeCompare(b.name, "fr"));
    // les îlots de 2 fiches rejoignent la couronne, répartis entre les fiches isolées
    const smalls = C.map((c, k) => ({ c, k })).filter(o => o.c.small).map(o => ({ small: o.k }));
    const crown = iso.slice(); smalls.forEach((o, i) => crown.splice(Math.round((i + .5) * crown.length / smalls.length) + i, 0, o));
    const x0 = d3.min(sup, s => s.x - s.r), x1 = d3.max(sup, s => s.x + s.r), y0 = d3.min(sup, s => s.y - s.r), y1 = d3.max(sup, s => s.y + s.r);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 90, ry = (y1 - y0) / 2 + 90, ph = rnd() * 6.28;
    crown.forEach((n, i) => { const t = -Math.PI / 2 + (i + (rnd() - .5) * .8) * 2 * Math.PI / crown.length;
      const wob = 1 + .07 * Math.sin(3 * t + ph) + .05 * Math.sin(5 * t + 2 * ph), off = (rnd() - .3) * 70;
      const p = [cx + (rx * wob + off) * Math.cos(t), cy + (ry * wob + off) * Math.sin(t)];
      if (n.small !== undefined) a[n.small] = p; else n.iso = p; });
    return a;
  }
  const A = anchors();
  const ax = d => d.comm < 0 ? d.iso[0] : A[d.comm][0], ay = d => d.comm < 0 ? d.iso[1] : A[d.comm][1];
  const rad = n => 4 + Math.sqrt(n.deg) * 2.6;
  const sim = d3.forceSimulation().alphaDecay(.025)
    .force("link", d3.forceLink().id(d => d.id)
      .distance(l => l.sug ? 140 : sameComm(l.source, l.target) ? 40 : 160)
      .strength(l => l.sug ? 0 : sameComm(l.source, l.target) ? .5 : .02))
    .force("charge", d3.forceManyBody().strength(-60).distanceMax(170))
    .force("x", d3.forceX(ax).strength(d => d.comm < 0 ? .06 : .13))
    .force("y", d3.forceY(ay).strength(d => d.comm < 0 ? .06 : .13))
    .force("collide", d3.forceCollide(d => rad(d) + 5));
  const rndN = d3.randomLcg(3); sim.randomSource(d3.randomLcg(5));
  G.nodes.forEach(n => { n.x = ax(n) + (rndN() - .5) * 40; n.y = ay(n) + (rndN() - .5) * 40; });

  let nodeSel, edgeSel, visNodes = [], visEdges = [];
  function update() {
    filterCount();
    visNodes = G.nodes.filter(n => state.types.has(n.type) && (state.showIso || n.deg > 0 || (state.showSug && n.sug.size)));
    const vis = new Set(visNodes.map(n => n.id));
    visEdges = G.edges.filter(([a, b]) => vis.has(a) && vis.has(b)).map(([a, b]) => ({ source: a, target: b, sug: false }));
    if (state.showSug) G.conf.forEach(([a, b]) => { if (vis.has(a) && vis.has(b)) visEdges.push({ source: a, target: b, sug: true }); });
    edgeSel = gEdges.selectAll("line").data(visEdges, d => (d.source.id || d.source) + (d.target.id || d.target) + d.sug)
      .join("line").attr("class", d => "edge" + (d.sug ? " sug" : "") + (!d.sug && !sameComm(d.source, d.target) ? " cross" : ""));
    nodeSel = gNodes.selectAll("g.node").data(visNodes, d => d.id).join(enter => {
      const g = enter.append("g").attr("class", "node").attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", d => `${d.name}, ${TYPES[d.type].label}, ${d.deg} lien${d.deg > 1 ? "s" : ""}`);
      g.append("circle").attr("r", rad);
      g.append("text").attr("dy", d => -rad(d) - 4).attr("text-anchor", "middle").text(d => d.name);
      g.append("title").text(d => `${d.name} · ${d.deg} lien${d.deg > 1 ? "s" : ""}`);
      g.on("click", (e, d) => { e.stopPropagation(); if (state.focus !== d.id || state.ring) select(d.id); })
       .on("dblclick", (e, d) => { e.stopPropagation(); e.preventDefault(); select(d.id, false, true); })
       .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(d.id, false, e.shiftKey); } })
       .call(d3.drag().on("start", (e, d) => { if (!e.active) sim.alphaTarget(.2).restart(); d.fx = d.x; d.fy = d.y; })
         .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); if (!d.ring) { d.fx = null; d.fy = null; } }));
      return g;
    });
    nodeSel.sort((a, b) => a.deg - b.deg);
    sim.nodes(visNodes); sim.force("link").links(visEdges); sim.alpha(.8).restart();
    paint(); placeLabels(); labelVis(d3.zoomTransform(svg.node()).k); edgeVis(d3.zoomTransform(svg.node()).k); highlight();
  }
  function placeLabels() { if (!nodeSel) return;
    nodeSel.select("text")
      .attr("text-anchor", d => d.ring === "R" ? "start" : d.ring === "L" ? "end" : "middle")
      .attr("dx", d => d.ring === "R" ? rad(d) + 6 : d.ring === "L" ? -(rad(d) + 6) : 0)
      .attr("dy", d => d.ring === "R" || d.ring === "L" ? "0.32em" : -rad(d) - 4)
      .style("font-weight", d => d.ring === "C" ? 600 : null)
      .style("font-size", d => d.ring === "C" ? "13px" : "10.5px");
  }
  function releaseRing() { G.nodes.forEach(n => { if (n.ring) { n.ring = null; n.fx = null; n.fy = null; } }); }
  function buildRing(f) {
    const vis = new Set(visNodes.map(n => n.id));
    const nbs = [...new Set([...f.nb, ...(state.showSug ? f.sug : [])])].map(i => byId.get(i)).filter(n => vis.has(n.id))
      .sort((a, b) => typeKeys.indexOf(a.type) - typeKeys.indexOf(b.type) || a.name.localeCompare(b.name, "fr"));
    const half = Math.ceil(nbs.length / 2), sides = [["R", nbs.slice(0, half)], ["L", nbs.slice(half)]];
    const STEP = 22; let maxH = 0, R = 150;
    sides.forEach(([, arr]) => { const H = (arr.length - 1) * STEP; maxH = Math.max(maxH, H); R = Math.max(R, H / 2 + 48); });
    const targets = [];
    f.ring = "C"; targets.push([f, f.x, f.y, f.x, f.y]);
    sides.forEach(([side, arr]) => { const H = (arr.length - 1) * STEP, sx = side === "R" ? 1 : -1;
      arr.forEach((n, i) => { const y = -H / 2 + i * STEP, x = sx * Math.sqrt(Math.max(R * R - y * y, (R * 0.35) ** 2));
        n.ring = side; targets.push([n, n.x, n.y, f.x + x, f.y + y]); }); });
    f.fx = f.x; f.fy = f.y;
    d3.transition().duration(450).ease(d3.easeCubicOut).tween("ring", () => t => {
      targets.forEach(([n, x0, y0, x1, y1]) => { n.fx = x0 + (x1 - x0) * t; n.fy = y0 + (y1 - y0) * t; });
    });
    sim.alpha(.35).restart();
    placeLabels();
    return { R, H: maxH };
  }
  function paint() { if (nodeSel) nodeSel.select("circle").attr("fill", color); }

  // ---------- Placement des noms sans chevauchement
  let curK = 1, raf = 0;
  const mctx = document.createElement("canvas").getContext("2d"), tw = new Map();
  function textW(name) { if (!tw.has(name)) { mctx.font = "500 100px Inter, system-ui, sans-serif"; tw.set(name, mctx.measureText(name).width / 100); } return tw.get(name); }
  if (document.fonts) document.fonts.ready.then(() => { tw.clear(); scheduleLabels(); });
  function labelVis(k) { curK = k; scheduleLabels(); }
  function scheduleLabels() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; layoutLabels(); }); }
  function layoutLabels() {
    if (!nodeSel) return; const k = curK;
    const boxes = [], hit = b => { for (const o of boxes) { if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true; } return false; };
    const circles = visNodes.map(n => ({ id: n.id, b: [n.x - rad(n), n.y - rad(n), n.x + rad(n), n.y + rad(n)] }));
    const onCircle = (b, id, only) => circles.some(c => c.id !== id && (!only || only.has(c.id)) && b[0] < c.b[2] && b[2] > c.b[0] && b[1] < c.b[3] && b[3] > c.b[1]);
    const txt = nodeSel.select("text");
    if (state.focus && state.ring) { txt.style("display", d => d.ring ? null : "none"); placeLabels(); return; }
    const fs = 11 / k, h = fs * 1.2, gap = 3 / k;
    const place = new Map();
    const minDeg = k < 0.55 ? 9 : k < 0.8 ? 6 : k < 1.1 ? 4 : k < 1.5 ? 2 : k < 2 ? 1 : 0;
    const F = state.focus && byId.get(state.focus), keepL = F ? new Set([F.id, ...F.nb, ...(state.showSug ? F.sug : [])]) : null;
    visNodes.filter(d => F ? keepL.has(d.id) : d.deg >= minDeg).sort((a, b) => (F ? (b.id === F.id) - (a.id === F.id) : 0) || b.deg - a.deg || a.name.localeCompare(b.name)).forEach(d => {
      const w = textW(d.name) * fs, r = rad(d);
      const cand = [
        { a: "middle", dx: 0, dy: -(r + gap) - fs * .22, b: [d.x - w / 2, d.y - r - gap - h, d.x + w / 2, d.y - r - gap] },
        { a: "middle", dx: 0, dy: r + gap + fs * .85, b: [d.x - w / 2, d.y + r + gap, d.x + w / 2, d.y + r + gap + h] },
        { a: "start", dx: r + gap, dy: fs * .35, b: [d.x + r + gap, d.y - h / 2, d.x + r + gap + w, d.y + h / 2] },
        { a: "end", dx: -(r + gap), dy: fs * .35, b: [d.x - r - gap - w, d.y - h / 2, d.x - r - gap, d.y + h / 2] }];
      for (const c of cand) { if (!hit(c.b) && (d.deg >= 10 || !onCircle(c.b, d.id, keepL))) { boxes.push(c.b); place.set(d.id, c); return; } }
    });
    txt.style("display", d => place.has(d.id) ? null : "none").style("font-size", fs + "px").style("font-weight", null)
      .attr("text-anchor", d => place.has(d.id) ? place.get(d.id).a : "middle")
      .attr("dx", d => place.has(d.id) ? place.get(d.id).dx : 0)
      .attr("dy", d => place.has(d.id) ? place.get(d.id).dy : 0);
  }
  sim.on("tick", () => {
    edgeSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
    drawHulls(); scheduleLabels();
  });
  const hullLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(.5));
  function drawHulls() {
    const groups = d3.group(visNodes.filter(n => n.comm >= 0 && !C[n.comm].small), n => n.comm);
    const data = [...groups].filter(([, ns]) => ns.length >= 3).map(([k, ns]) => {
      const pts = []; ns.forEach(n => { const r = rad(n) + 16; for (let a = 0; a < 6.28; a += 0.785) pts.push([n.x + r * Math.cos(a), n.y + r * Math.sin(a)]); });
      const h = d3.polygonHull(pts); return { k, h, top: d3.min(h, p => p[1]), cx: d3.mean(ns, n => n.x) };
    });
    const sel = gHulls.selectAll("g.hull").data(data, d => d.k).join(enter => {
      const g = enter.append("g").attr("class", "hull");
      g.append("path");
      return g; });
    sel.select("path").attr("d", d => hullLine(d.h));
    sel.classed("dim", !!state.focus);
  }
  function fitNodes(ns, maxK = 1.4, dur = 600) {
    if (!ns.length) return;
    const v = viewArea();
    const x0 = d3.min(ns, n => n.x) - 60, x1 = d3.max(ns, n => n.x) + 60, y0 = d3.min(ns, n => n.y) - 60, y1 = d3.max(ns, n => n.y) + 40;
    const k = Math.min(maxK, v.W / (x1 - x0), v.H / (y1 - y0));
    const t = d3.zoomIdentity.translate(v.cx - k * (x0 + x1) / 2, v.cy - k * (y0 + y1) / 2).scale(k);
    (dur ? svg.transition().duration(dur) : svg).call(zoom.transform, t);
  }
  function zoomComm(k) { if (state.focus) select(null); fitNodes(visNodes.filter(n => n.comm === k), 1.8); }
  function highlight() {
    const f = state.focus && byId.get(state.focus);
    if (!f) { nodeSel.classed("dim", false).classed("hl", false); edgeSel.classed("dim", false).classed("on", false); return; }
    const keep = new Set([f.id, ...f.nb, ...(state.showSug ? f.sug : [])]);
    const touch = d => d.source.id === f.id || d.target.id === f.id;
    nodeSel.classed("dim", d => !keep.has(d.id)).classed("hl", d => d.id === f.id);
    edgeSel.classed("dim", d => !touch(d)).classed("on", touch);
  }
  // 1 clic : on montre les liens sans toucher à la disposition. Double clic : la fiche est isolée en couronne.
  function select(id, center, ring = false) {
    const wasRing = state.ring;
    state.focus = id; state.ring = !!(id && ring); if (id) state.panel = null;
    releaseRing();
    if (id) { const n = byId.get(id);
      if (!state.types.has(n.type)) { state.types.add(n.type); if (chips) [...chips.children][typeKeys.indexOf(n.type)].classList.remove("off"); }
      if (n.deg === 0 && !state.showIso && !(state.showSug && n.sug.size)) isoBtn.click(); else update();
      if (FULL) { setCollapsed(false); loadFiche(id); }
      const v = viewArea();
      if (state.ring) {
        const box = buildRing(n);
        const k = Math.max(.5, Math.min(1.5, v.H / (box.H + 120), v.W / (2 * box.R + 440)));
        svg.transition().duration(550).call(zoom.transform, d3.zoomIdentity.translate(v.cx - n.x * k, v.cy - n.y * k).scale(k));
      } else {
        if (wasRing) sim.alpha(.4).restart();
        if (center || offscreen(n, v)) { const k = Math.max(1.2, d3.zoomTransform(svg.node()).k);
          svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(v.cx - n.x * k, v.cy - n.y * k).scale(k)); }
      }
    } else { highlight(); placeLabels(); sim.alpha(.4).restart(); if (FULL) resetFiche(); }
    labelVis(d3.zoomTransform(svg.node()).k);
    if (bigLink) bigLink.href = BIG + (id ? "#" + id : "");
    if (FULL) {
      renderPanel();
      if (history.replaceState) history.replaceState(null, "", id ? "#" + id : location.pathname + location.search);
    }
  }
  // La fiche choisie est-elle cachée (hors écran ou sous la fenêtre) ?
  function offscreen(n, v) {
    const t = d3.zoomTransform(svg.node()), x = t.applyX(n.x), y = t.applyY(n.y);
    return x < v.x0 + 20 || x > v.x1 - 20 || y < v.y0 + 20 || y > v.y1 - 20;
  }

  // Lien vers un formulaire avec ses champs pré-remplis
  function formUrl(base, params) {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  // ---------- Panneau (page complète)
  const panel = FULL ? $("panel") : null;
  const item = (n, extra = "") => `<li><span class="sw" style="background:${color(n)}"></span><button class="lnk" data-id="${n.id}">${esc(n.name)}</button>${extra}</li>`;
  const grab = () => { const o = !document.body.classList.contains("nopanel");
    return `<button class="grab" aria-expanded="${o}" aria-label="${o ? "Réduire le panneau" : "Agrandir le panneau"}"><span></span></button>`; };
  const themeSwitch = () => { const d = isDark();
    return `<button class="theme" role="switch" aria-checked="${d}" data-theme-switch><span class="trk" aria-hidden="true"></span>Mode sombre</button>`; };
  function renderPanel() {
    if (!panel) return;
    if (!state.focus && state.panel === "res") {
      const kinds = [...new Set(RES.map(r => r.kind || "Autres"))].sort((a, b) => (a === "Autres") - (b === "Autres") || a.localeCompare(b, "fr"));
      panel.innerHTML = grab() + `<button class="lnk back" data-back="1">← Vue d'ensemble</button>
        <h1 style="margin-top:12px">Ressources</h1>
        ${kinds.map(k => { const rs = RES.filter(r => (r.kind || "Autres") === k);
          return `<h3>${esc(k)} · ${rs.length}</h3><ul class="links">${rs.map(r => `<li><span class="sw res"></span><button class="lnk" data-res="${esc(r.id)}">${esc(r.name)}</button></li>`).join("")}</ul>`; }).join("")}
        <div class="pfoot">${themeSwitch()}</div>`;
    } else if (state.focus) { const n = byId.get(state.focus);
      const groups = {}; [...n.nb].map(i => byId.get(i)).forEach(m => { (groups[m.type] = groups[m.type] || []).push(m); });
      let h = `<button class="lnk back" data-back="1">← Vue d'ensemble</button>
        <h1 style="margin-top:12px">${esc(n.name)}</h1>
        <p><span class="tag" style="border-color:${color(n)}">${esc(TYPES[n.type].label)}</span>${n.cat ? `<span class="tag">${esc(n.cat)}</span>` : ""}</p>
        <h2>${n.deg} lien${n.deg > 1 ? "s" : ""}</h2>`;
      if (!n.deg) h += `<p class="muted">Aucune relation logique. Cette fiche n'est reliée à rien.</p>`;
      typeKeys.forEach(t => { if (groups[t]) h += `<h3>${esc(TYPES[t].label)} · ${groups[t].length}</h3><ul class="links">${groups[t].sort((a, b) => b.deg - a.deg).map(m => item(m)).join("")}</ul>`; });
      if (n.sug.size) h += `<h2 style="color:var(--conf)">À ne pas confondre avec</h2><p class="muted" style="margin-top:-4px">Notions proches en apparence mais différentes. Trait rouge dans le graphe.</p><ul class="links">${[...n.sug].map(i => item(byId.get(i))).join("")}</ul>`;
      panel.innerHTML = grab() + h + `<div class="pfoot">${themeSwitch()}</div>`;
    } else {
      const hubs = G.nodes.slice().sort((a, b) => b.deg - a.deg).slice(0, 8);
      const iso = G.nodes.filter(n => n.deg === 0);
      const when = new Date(G.generated).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
      panel.innerHTML = grab() + `<h1>Réseau des fiches</h1>
        <div class="stat"><div><b>${G.nodes.length}</b><span class="muted">fiches</span></div><div><b>${G.edges.length}</b><span class="muted">liens</span></div><div><b>${G.conf.length}</b><span class="muted">confusions</span></div><div><b>${iso.length}</b><span class="muted">isolées</span></div></div>
        <h2>Les plaques tournantes</h2>
        <p class="muted">Les fiches qui relient le plus de notions.</p>
        <ul class="links">${hubs.map(n => item(n, ` <span class="muted">${n.deg}</span>`)).join("")}</ul>
        <div class="pfoot">
          ${G.forms && G.forms.proposition ? `<a class="btn" href="${esc(formUrl(G.forms.proposition, {}))}" target="_blank" rel="noopener noreferrer">Proposer une fiche ou une base</a>` : ""}
          <p class="legend">Dernière mise à jour ${esc(when)}</p>
          ${themeSwitch()}
        </div>`;
    }
    panel.querySelectorAll("[data-id]").forEach(b => b.onclick = () => select(b.dataset.id, true));
    panel.querySelectorAll("[data-comm]").forEach(b => b.onclick = () => zoomComm(+b.dataset.comm));
    panel.querySelectorAll("[data-res]").forEach(b => b.onclick = () => showRes(b.dataset.res));
    const bk = panel.querySelector("[data-back]"); if (bk) bk.onclick = () => { if (state.panel && !state.focus) { state.panel = null; renderPanel(); } else select(null); };
    const gb = panel.querySelector(".grab"); if (gb) gb.onclick = () => $("panelBtn").click();
    const ts = panel.querySelector("[data-theme-switch]");
    if (ts) ts.onclick = () => { const t = isDark() ? "light" : "dark";
      document.documentElement.dataset.theme = t; store.set("reseau-theme", t);
      ts.setAttribute("aria-checked", t === "dark"); };
  }

  // ---------- Fiche : barre repliée sous la recherche. Un clic sur un point la déplie avec le contenu de la fiche.
  const win = FULL ? $("win") : document.createElement("div");
  const wTitle = FULL && win.querySelector(".wt"), wSw = FULL && win.querySelector(".sw"), wBody = FULL && win.querySelector(".wbody");
  const wCol = FULL && win.querySelector("[data-collapse]");
  const ficheCache = new Map(); let ficheReq = null, shown = null;
  function setCollapsed(c) { if (!FULL) return; win.classList.toggle("collapsed", c); wCol.setAttribute("aria-expanded", !c); const l = c ? "Déplier la fiche" : "Replier la fiche"; wCol.setAttribute("aria-label", l); wCol.title = l; wCol.textContent = c ? (MOB() ? "▴" : "▸") : "▾";
    // Une fiche dépliée ne doit pas dépasser du bas de l'écran
    if (!c && innerWidth > 760) requestAnimationFrame(() => { const r = win.getBoundingClientRect(); if (r.bottom > innerHeight - 8) win.style.top = Math.max(8, innerHeight - 8 - r.height) + "px"; }); }
  function resetFiche() {
    shown = null; if (ficheReq) ficheReq.abort();
    win.classList.add("empty"); document.body.classList.remove("hasfiche"); wTitle.textContent = "Fiche";
    wBody.innerHTML = `<p class="muted">Clique sur un point pour lire sa fiche.</p>`;
    setCollapsed(true);
  }
  async function loadFiche(id) {
    const n = byId.get(id); if (!n || shown === id) return; shown = id;
    win.classList.remove("empty"); document.body.classList.add("hasfiche"); wTitle.textContent = n.name; wSw.style.background = color(n);
    if (ficheCache.has(id)) return renderFiche(ficheCache.get(id));
    wBody.innerHTML = `<div class="skel" style="width:60%"></div><div class="skel"></div><div class="skel" style="width:85%"></div><div class="skel" style="width:70%"></div>`;
    wBody.setAttribute("aria-busy", "true");
    if (ficheReq) ficheReq.abort();
    ficheReq = new AbortController();
    try {
      const r = await fetch(API_FICHE(id), { signal: ficheReq.signal });
      const j = r.ok ? await r.json() : null;
      if (!r.ok) throw new Error(r.status === 404 ? "Cette fiche sera disponible à la prochaine mise à jour." : "Erreur " + r.status);
      ficheCache.set(id, j); if (shown === id) renderFiche(j);
    } catch (e) {
      if (e.name === "AbortError") return;
      wBody.removeAttribute("aria-busy");
      wBody.innerHTML = `<p>Le contenu de cette fiche ne se charge pas.</p><p class="muted">${esc(e.message)}</p><div class="acts"><button class="btn" data-retry>Réessayer</button></div>`;
      wBody.querySelector("[data-retry]").onclick = () => { shown = null; loadFiche(id); };
    }
  }
  function renderFiche(j) {
    const n = byId.get(j.id);
    wBody.removeAttribute("aria-busy");
    const props = j.props.length ? `<dl class="props">${j.props.map(p => `<dt>${esc(p.name)}</dt><dd>${p.html}</dd>`).join("")}</dl>` : "";
    const body = j.html.trim() ? j.html : `<p class="muted">Pas de texte dans le corps de la fiche.</p>`;
    const who = j.contributors && j.contributors.length ? j.contributors.map(c => typeof c === "string" ? esc(c)
      : peopleById.has(c.id) ? `<button class="lnk" data-person="${esc(c.id)}">${esc(c.name)}</button>` : esc(c.name)).join(", ")
      : `<span class="muted">Personne pour l'instant</span>`;
    const F = G.forms || {}, here = location.origin + location.pathname + "#" + n.id;
    const acts = [
      F.erreur ? `<a class="btn" href="${esc(formUrl(F.erreur, { type: "Erreur", fiche: n.name, lien: here }))}" target="_blank" rel="noopener noreferrer">Signaler une erreur</a>` : "",
      F.proposition ? `<a class="btn" href="${esc(formUrl(F.proposition, { liee: n.name }))}" target="_blank" rel="noopener noreferrer">Proposer une fiche liée</a>` : "",
    ].join("");
    const rs = RES.filter(r => r.liees.includes(n.id));
    const resH = rs.length ? `<div class="contrib"><h4>Ressources</h4><ul class="links">${rs.map(r => `<li><span class="sw res"></span><button class="lnk" data-res="${esc(r.id)}">${esc(r.name)}</button></li>`).join("")}</ul></div>` : "";
    wBody.innerHTML = props + body + resH + `<div class="contrib"><h4>Contributeurs</h4><p>${who}</p>${acts ? `<div class="acts">${acts}</div>` : ""}</div>`;
    wBody.scrollTop = 0;
    wBody.querySelectorAll("[data-id]").forEach(b => {
      if (byId.has(b.dataset.id)) b.onclick = () => select(b.dataset.id, true);
      else b.replaceWith(...b.childNodes);
    });
    wBody.querySelectorAll("[data-person]").forEach(b => b.onclick = () => showPerson(b.dataset.person));
    wBody.querySelectorAll("[data-res]").forEach(b => b.onclick = () => showRes(b.dataset.res));
  }
  // Fiche d'une ressource : même fenêtre qu'une fiche, avec le lien vers le template et les fiches liées
  async function showRes(rid) {
    const r = resById.get(rid); if (!r || !FULL) return;
    if (ficheReq) ficheReq.abort();
    shown = "res:" + rid; win.classList.remove("empty"); document.body.classList.add("hasfiche"); setCollapsed(false);
    wTitle.textContent = r.name; wSw.style.background = "var(--accent)";
    const render = j => {
      wBody.removeAttribute("aria-busy");
      const props = j && j.props.length ? `<dl class="props">${j.props.map(p => `<dt>${esc(p.name)}</dt><dd>${p.html}</dd>`).join("")}</dl>` : "";
      const body = j && j.html.trim() ? j.html : `<p class="muted">Pas encore de mode d'emploi pour cette ressource.</p>`;
      const ls = r.liees.map(i => byId.get(i)).filter(Boolean);
      // « Télécharger » : la première image de la page Notion de la ressource (copiée dans le site par le build)
      const imgs = j ? [...j.html.matchAll(/<img src="(data\/img\/[\w.-]+)"/g)].map(m => m[1]) : [];
      const slug = r.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const dl = imgs.map((img, k) => `<a class="btn" href="${esc(img)}" download="${esc(slug + (imgs.length > 1 ? "-" + (k + 1) : "") + img.slice(img.lastIndexOf(".")))}">Télécharger${imgs.length > 1 ? " " + (k + 1) : ""}</a>`).join("");
      const F = G.forms || {};
      wBody.innerHTML = props + `<div class="acts" style="margin:0 0 12px"><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le template ↗</a>${dl}</div>` + body
        + (ls.length ? `<div class="contrib"><h4>Fiches liées</h4><ul class="links">${ls.map(n => item(n)).join("")}</ul></div>` : "")
        + (F.erreur ? `<div class="acts"><a class="btn" href="${esc(formUrl(F.erreur, { type: "Erreur", fiche: r.name, lien: r.url }))}" target="_blank" rel="noopener noreferrer">Signaler une erreur</a></div>` : "");
      wBody.scrollTop = 0;
      wBody.querySelectorAll("[data-id]").forEach(b => { if (byId.has(b.dataset.id)) b.onclick = () => select(b.dataset.id, true); else b.replaceWith(...b.childNodes); });
    };
    if (ficheCache.has(rid)) return render(ficheCache.get(rid));
    wBody.innerHTML = `<div class="skel" style="width:60%"></div><div class="skel"></div><div class="skel" style="width:85%"></div>`;
    wBody.setAttribute("aria-busy", "true");
    ficheReq = new AbortController();
    try { const res = await fetch(API_FICHE(rid), { signal: ficheReq.signal }); const j = res.ok ? await res.json() : null;
      if (j) ficheCache.set(rid, j); if (shown === "res:" + rid) render(j); }
    catch (e) { if (e.name !== "AbortError" && shown === "res:" + rid) render(null); }
  }
  // Fiche d'un contributeur : métier, liens et fiches relues (cliquables)
  const peopleById = new Map((G.people || []).map(p => [p.id, p]));
  function showPerson(pid) {
    const p = peopleById.get(pid); if (!p || !FULL) return;
    if (ficheReq) ficheReq.abort();
    shown = "person:" + pid; win.classList.remove("empty"); document.body.classList.add("hasfiche"); setCollapsed(false);
    wTitle.textContent = p.name; wSw.style.background = "var(--text-muted)";
    const fs = p.fiches.map(i => byId.get(i)).filter(Boolean)
      .sort((a, b) => typeKeys.indexOf(a.type) - typeKeys.indexOf(b.type) || a.name.localeCompare(b.name, "fr"));
    const ini = p.name.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
    const photo = p.photo ? `<img class="pphoto" src="${esc(p.photo)}" alt="">` : `<span class="pphoto ini" aria-hidden="true">${esc(ini)}</span>`;
    const since = p.since ? new Date(p.since).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "";
    const links = (p.links || []).map(l => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join("");
    wBody.removeAttribute("aria-busy");
    wBody.innerHTML = `<div class="phead">${photo}<div>
        <div class="pname">${esc(p.name)}</div>
        ${p.job ? `<div class="muted">${esc(p.job)}</div>` : ""}
        ${p.formation ? `<div class="muted" style="font-size:12.5px">Formation : ${esc(p.formation)}</div>` : ""}
        ${(p.tags || []).length ? `<p class="ptags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</p>` : ""}
      </div></div>
      ${links ? `<div class="acts">${links}</div>` : ""}
      ${p.bio ? `<div class="pbio">${p.bio}</div>` : ""}
      ${since ? `<p class="muted" style="font-size:12px">Contributeur depuis ${esc(since)}</p>` : ""}
      <details class="pfiches"><summary>${fs.length} fiche${fs.length > 1 ? "s" : ""} relue${fs.length > 1 ? "s" : ""}</summary>
        <ul class="links">${fs.map(n => item(n)).join("")}</ul></details>`;
    wBody.scrollTop = 0;
    wBody.querySelectorAll("[data-id]").forEach(b => { if (byId.has(b.dataset.id)) b.onclick = () => select(b.dataset.id, true); else b.replaceWith(...b.childNodes); });
  }
  if (FULL) {
    win.classList.add("empty");
    // Un clic sur la barre de titre replie ou déplie. Après un glissement, on ne replie pas.
    win.querySelector(".whead").addEventListener("click", () => { if (win.dataset.moved) { win.dataset.moved = ""; return; } setCollapsed(!win.classList.contains("collapsed")); });
    // La fiche se déplace en tirant sa barre de titre. Sa place est gardée pour la prochaine visite.
    const fp = store.get("reseau-fiche-pos");
    if (fp && innerWidth > 760) { win.style.left = Math.min(Math.max(0, fp.x), innerWidth - 120) + "px"; win.style.top = Math.min(Math.max(0, fp.y), innerHeight - 44) + "px"; }
    draggable(win, "reseau-fiche-pos");
    win.querySelector("[data-close]").onclick = e => { e.stopPropagation(); if (shown && /^(person|res):/.test(shown) && state.focus) { shown = null; loadFiche(state.focus); } else select(null); };
    swipe(win.querySelector(".whead"), d => { if (MOB()) setCollapsed(d > 0); });
    swipe($("panel"), d => { if (MOB() && (d > 0) !== document.body.classList.contains("nopanel")) $("panelBtn").click(); }, ".grab");
    win.addEventListener("keydown", e => { if (e.key === "Escape" && !win.classList.contains("collapsed")) { e.stopPropagation(); setCollapsed(true); wCol.focus(); } });
    // Taille choisie en tirant le coin bas-droit : gardée pour la prochaine visite
    const size = store.get("reseau-fiche-size");
    if (size && innerWidth > 760) { win.style.width = Math.min(size.w, innerWidth - 24) + "px"; win.style.height = Math.min(size.h, innerHeight - 68) + "px"; }
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (!win.classList.contains("collapsed") && innerWidth > 760) store.set("reseau-fiche-size", { w: win.offsetWidth, h: win.offsetHeight });
    }).observe(win);
  }
  // Glisser vers le haut ou le bas sur une feuille mobile : d < 0 vers le haut
  function swipe(el, cb, only) {
    let y0 = null;
    el.addEventListener("touchstart", e => { y0 = only && !e.target.closest(only) ? null : e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", e => { if (y0 === null) return; const d = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(d) > 40) cb(d); }, { passive: true });
  }
  // Une fenêtre se déplace en tirant sa barre de titre ; sa position est gardée
  function draggable(el, key) {
    const head = el.querySelector(".whead");
    head.addEventListener("pointerdown", e => {
      if (e.target.closest("button") || innerWidth <= 760) return;
      e.preventDefault(); head.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
      el.dataset.moved = "";
      const move = ev => {
        if (!el.dataset.moved) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return; el.dataset.moved = "1"; }
        const x = Math.min(Math.max(0, ev.clientX - ox), innerWidth - 120), y = Math.min(Math.max(0, ev.clientY - oy), innerHeight - 44);
        el.style.left = x + "px"; el.style.top = y + "px"; el.style.bottom = "auto"; el.style.right = "auto";
      };
      const up = () => { head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up);
        if (el.dataset.moved) store.set(key, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) }); };
      head.addEventListener("pointermove", move); head.addEventListener("pointerup", up);
    });
  }

  // ---------- Légende : fenêtre repliable et déplaçable (page complète)
  if (FULL) {
    const lw = $("legendWin"), lb = lw.querySelector(".wbody"), lc = lw.querySelector("[data-collapse]");
    lb.innerHTML = `<ul class="leg">
        <li><span class="swl"></span>Lien logique</li>
        <li><span class="swl conf"></span>À ne pas confondre</li>
        ${G.bases.map(b => `<li><span class="dot" style="background:${b.color}"></span>${esc(b.one || b.label)}</li>`).join("")}
      </ul>
      ${MOB() ? `<ul class="leg help"><li>Toucher : ouvrir la fiche.</li><li>Pincer pour voir plus de liens.</li></ul>`
        : `<ul class="leg help"><li>Clic : voir les liens.</li><li>Double clic : isoler la fiche.</li><li>Zoomer pour voir plus de liens, glisser pour déplacer.</li></ul>`}`;
    const setL = c => { lw.classList.toggle("collapsed", c); lc.setAttribute("aria-expanded", !c); lc.setAttribute("aria-label", c ? "Déplier la légende" : "Replier la légende"); lc.textContent = c ? "▸" : "▾"; store.set("reseau-legend-collapsed", c); };
    lc.onclick = () => setL(!lw.classList.contains("collapsed"));
    lw.querySelector(".whead").addEventListener("dblclick", e => { if (!e.target.closest("button")) setL(!lw.classList.contains("collapsed")); });
    const saved = store.get("reseau-legend-collapsed");
    setL(saved === null ? innerWidth <= 760 : saved);
    const p = store.get("reseau-legend-pos");
    if (p && innerWidth > 760) { lw.style.left = Math.min(Math.max(0, p.x), innerWidth - 120) + "px"; lw.style.top = Math.min(Math.max(0, p.y), innerHeight - 44) + "px"; lw.style.bottom = "auto"; lw.style.right = "auto"; }
    draggable(lw, "reseau-legend-pos");
  }

  // ---------- Bouton Ressources : ouvre directement la liste dans le panneau (page complète)
  if (FULL && RES.length) {
    const rbtn = $("resBtn");
    rbtn.hidden = false; $("resCount").textContent = RES.length;
    rbtn.onclick = () => {
      if (state.focus) select(null);
      state.panel = "res";
      if (document.body.classList.contains("nopanel")) $("panelBtn").click(); else renderPanel();
      const first = panel.querySelector("[data-res]"); if (first && !MOB()) first.focus({ preventScroll: true });
    };
  }

  // ---------- Lancement
  if (MOB()) { document.body.classList.add("nopanel"); $("panelBtn").setAttribute("aria-expanded", false); }
  update(); renderPanel(); fitBar();
  if (document.fonts) document.fonts.ready.then(() => fitBar());
  sim.stop(); for (let i = 0; i < 350; i++) sim.tick(); sim.on("tick")(); sim.alpha(.05).restart();
  fitNodes(visNodes, 1.2, 0);
  addEventListener("resize", () => { fitBar(); if (!state.focus) fitNodes(visNodes, 1.2, 0); });
  const deep = location.hash.slice(1).replace(/-/g, "").toLowerCase();
  if (deep && byId.has(deep)) select(deep, true);
}
})();
