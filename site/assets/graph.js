// Réseau des fiches. Une seule base de code pour les deux pages :
// <body data-mode="full"> = page complète, <body data-mode="embed"> = nuage seul pour Notion.
(function () {
"use strict";
const MODE = document.body.dataset.mode || "full";
const FULL = MODE === "full";
// Carte intégrée à la page des fiches (embed.html?iso) : toujours isolée sur une fiche, sans moyen d'en sortir
const LOCK = !FULL && new URLSearchParams(location.search).has("iso");
if (LOCK) document.body.classList.add("lock");
const API_GRAPH = "data/graph.json";
const API_FICHE = id => "data/fiches/" + id + ".json";
const BIG = "index.html";
const $ = id => document.getElementById(id);
// Briques communes aux pages (commun.js) : texte, adresses lisibles, formes, contenu des fiches
const U = window.DataUX, esc = U.esc;
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
  init(j);
  hideScreen();
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
  // Adresses lisibles (#persona), pastilles, contenu des fiches : préparés par commun.js
  const D = U.data(G), fromHash = D.fromHash;

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
  const state = { ring: false, types: new Set(typeKeys.filter(t => LOCK || !HIDDEN.includes(t))), showIso: true, showSug: true, focus: null, panel: null };
  const color = n => TYPES[n.type].color;
  // Une forme par base, en plus de la couleur (lisible sans la couleur). Les deux plus grosses bases restent rondes ou presque.
  const SHAPE = U.SHAPE;
  const shapeOf = t => SHAPE[t] || "circle";
  const poly = (k, R, a0) => "M" + Array.from({ length: k }, (_, i) => { const a = (a0 + 360 * i / k) * Math.PI / 180; return (R * Math.cos(a)).toFixed(2) + "," + (R * Math.sin(a)).toFixed(2); }).join("L") + "Z";
  function shapeD(s, r) {
    if (s === "square") { const a = r * .88; return `M${-a},${-a}H${a}V${a}H${-a}Z`; }
    if (s === "diamond") { const a = r * 1.2; return `M0,${-a}L${a},0L0,${a}L${-a},0Z`; }
    if (s === "triangle") { const h = r * 1.15; return `M0,${-h}L${h * 1.05},${h * .8}L${-h * 1.05},${h * .8}Z`; }
    if (s === "tridown") { const h = r * 1.15; return `M0,${h}L${h * 1.05},${-h * .8}L${-h * 1.05},${-h * .8}Z`; }
    if (s === "hexagon") return poly(6, r * 1.07, 0);
    if (s === "pentagon") return poly(5, r * 1.1, -90);
    if (s === "book") { const w = r * .76, h = r * 1.04; return `M${-w},${-h}H${w}V${h}H${-w}Z`; }
    return `M${-r},0A${r},${r} 0 1,0 ${r},0A${r},${r} 0 1,0 ${-r},0Z`;
  }
  // Tracé un peu réduit : le trait arrondi (même couleur) redonne la taille et adoucit les coins
  const markD = d => shapeD(shapeOf(d.type), Math.max(2.2, rad(d) - 1.2));
  // Ressources (templates à imprimer) : hors carte, ouvertes depuis l'encart « Ressources »
  const RES = G.ressources || [], resById = new Map(RES.map(r => [r.id, r]));

  // ---------- Barre de filtres (page complète)
  // Mobile : le panneau et la fiche deviennent des feuilles en bas d'écran
  const MOB = () => FULL && innerWidth <= 760;
  const sideW = () => !FULL || document.body.classList.contains("nopanel") || innerWidth <= 760 ? 0 : 360;
  const topH = FULL ? 112 : 20;
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
      b.innerHTML = `<span class="sw" data-s="${shapeOf(t)}" style="background:${TYPES[t].color}"></span><span class="full">${esc(TYPES[t].label)} <span class="muted">${G.bases.find(x => x.key === t).count}</span></span><span class="short">${esc(TYPES[t].label.replace(/^Fiches\s+/, "").split(" ")[0])}</span>`;
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
  if (!FULL && !LOCK) {
    bigLink = document.createElement("a"); bigLink.className = "btn open-big"; bigLink.target = "_blank"; bigLink.rel = "noopener";
    bigLink.href = BIG; bigLink.textContent = "Ouvrir en grand ↗"; document.body.appendChild(bigLink);
    const hint = document.createElement("div"); hint.className = "hint"; hint.textContent = "Clic : voir les liens · Double clic : isoler la fiche"; document.body.appendChild(hint);
  }

  // ---------- SVG
  const svg = d3.select("#svg"); svg.selectAll("*").remove();
  const root = svg.append("g");
  const gEdges = root.append("g"), gNodes = root.append("g");
  // Mode verrouillé : seules la fiche et ses voisines sont tracées. Le reste de la carte est un décor
  // de points et de traits inventés (fixe, non cliquable), pour garder l'idée d'un réseau sans calculer les 406 fiches.
  if (LOCK) {
    const gDeco = root.insert("g", ":first-child").attr("class", "deco").attr("aria-hidden", "true");
    const rnd = d3.randomLcg(11), cols = G.bases.map(b => b.color), pts = [];
    while (pts.length < 240) { const a = rnd() * 2 * Math.PI, r = 340 + Math.sqrt(rnd()) * 1300;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, c: cols[Math.floor(rnd() * cols.length)], s: 2 + rnd() * 3.5 }); }
    const lines = [];
    pts.forEach((p, i) => { const near = pts.map((q, j) => [j, (q.x - p.x) ** 2 + (q.y - p.y) ** 2]).filter(([j]) => j > i).sort((a, b) => a[1] - b[1]);
      near.slice(0, rnd() < .5 ? 1 : 2).forEach(([j]) => lines.push([p, pts[j]])); });
    gDeco.selectAll("line").data(lines).join("line").attr("x1", d => d[0].x).attr("y1", d => d[0].y).attr("x2", d => d[1].x).attr("y2", d => d[1].y);
    gDeco.selectAll("circle").data(pts).join("circle").attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => d.s).attr("fill", d => d.c);
  }
  const zoom = d3.zoom().scaleExtent([.15, 5]).on("zoom", e => { root.attr("transform", e.transform); labelVis(e.transform.k); edgeVis(e.transform.k); });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", e => { if (e.target === svg.node() && !LOCK) select(null); });
  // Mode verrouillé : ouvrir un point l'isole à son tour et prévient la page des fiches
  const pick = id => { select(id, false, true); history.replaceState(null, "", "?iso#" + id); if (window.parent !== window) window.parent.postMessage({ dataux: "fiche", id }, location.origin); };

  // ---------- Disposition par groupes (Louvain calculé par le serveur)
  const C = G.comms;
  const sameComm = (a, b) => { a = a.id ? a : byId.get(a); b = b.id ? b : byId.get(b); return a.comm === b.comm && a.comm >= 0; };
  // Disposition gardée dans le navigateur : tant que les fiches, les liens et le code ne changent pas,
  // on réutilise les positions calculées à la visite précédente (le calcul prend près d'une seconde).
  const LKEY = "reseau-layout", VER = (/\?v=(\w+)/.exec([...document.scripts].map(x => x.src).join(" ")) || [])[1] || "";
  const lsig = (() => { const str = VER + JSON.stringify([G.nodes.map(n => [n.id, n.comm]), G.edges, G.conf, C.map(c => c.small)]);
    let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + str.length; })();
  let cached = store.get(LKEY); if (!cached || cached.sig !== lsig || !cached.p) cached = null;
  if (cached && !G.nodes.every(n => cached.p[n.id])) cached = null;
  const rad = n => 4 + Math.sqrt(n.deg) * 2.6;
  // Disposition « LinLog » (modèle de Gephi) avec des liens pondérés : aucun groupe n'est imposé.
  // Un lien tire d'autant plus fort que ses deux fiches partagent de voisins (cosinus, normalisé),
  // l'attraction croît en log de la distance, et les fiches très liées repoussent davantage
  // et bougent moins : elles se placent entre leurs groupes au lieu de tout aspirer au centre.
  const wRaw = new Map(G.edges.map(([a, b]) => { const A = byId.get(a), B = byId.get(b); let s = 0;
    A.nb.forEach(x => { if (B.nb.has(x)) s++; }); return [eKey(a, b), s / Math.sqrt(A.deg * B.deg)]; }));
  const wSorted = [...wRaw.values()].sort((x, y) => x - y), wQ = wSorted[Math.floor(wSorted.length * .9)] || 1;
  const wLink = new Map([...wRaw].map(([k, w]) => [k, .06 + Math.min(1, w / wQ)]));
  const wMean = d3.mean([...wLink.values()]) || 1;
  let linkCap = Infinity;
  function linlog() {
    const f = alpha => sim.force("link").links().forEach(l => { if (l.sug) return;
      const s = l.source, t = l.target, dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy) || 1e-3;
      const F = 17.6 * (wLink.get(eKey(s.id, t.id)) || wMean) / wMean * Math.log(1 + d) * alpha / d;
      // Après le calcul initial, pas plus de 5 % de la distance par étape (linkCap) : sinon 2 fiches peu liées
      // se dépassent à chaque étape et un petit îlot tourbillonne sur lui-même après un filtre.
      const ks = Math.min(F / (s.deg + 1), linkCap), kt = Math.min(F / (t.deg + 1), linkCap);
      s.vx += dx * ks; s.vy += dy * ks; t.vx -= dx * kt; t.vy -= dy * kt; });
    f.initialize = () => {}; return f;
  }
  const sim = d3.forceSimulation().alphaDecay(.012)
    .force("link", d3.forceLink().id(d => d.id).strength(0))
    .force("linlog", linlog())
    .force("charge", d3.forceManyBody().strength(d => -9 * (d.deg + 1)))
    .force("x", d3.forceX(0).strength(.012))
    .force("y", d3.forceY(0).strength(.012))
    .force("collide", d3.forceCollide(d => rad(d) + 5));
  const rndN = d3.randomLcg(3); sim.randomSource(d3.randomLcg(5));
  G.nodes.forEach(n => { n.x = (rndN() - .5) * 800; n.y = (rndN() - .5) * 800; });
  if (cached) G.nodes.forEach(n => { n.x = cached.p[n.id][0]; n.y = cached.p[n.id][1]; });

  let nodeSel, edgeSel, visNodes = [], visEdges = [];
  function update() {
    filterCount();
    const before = new Set(visNodes.map(n => n.id));
    visNodes = G.nodes.filter(n => state.types.has(n.type) && (state.showIso || n.deg > 0 || (state.showSug && n.sug.size)));
    if (LOCK && state.focus) { const f = byId.get(state.focus), keep = new Set([f.id, ...f.nb, ...(state.showSug ? f.sug : [])]);
      visNodes = visNodes.filter(n => keep.has(n.id));
      // Les nouvelles voisines partent du centre de la fiche : la couronne s'ouvre au lieu d'apparaître d'un coup
      visNodes.forEach(n => { if (!before.has(n.id) && n !== f) { n.x = f.x + (Math.random() - .5) * 4; n.y = f.y + (Math.random() - .5) * 4; } }); }
    if (LOCK && state.person) { const P = new Set(peopleById.get(state.person).fiches);
      visNodes = G.nodes.filter(n => P.has(n.id));
      visNodes.forEach(n => { if (!before.has(n.id)) { n.x = (Math.random() - .5) * 4; n.y = (Math.random() - .5) * 4; } }); }
    const vis = new Set(visNodes.map(n => n.id));
    visEdges = LOCK && state.person ? [] : G.edges.filter(([a, b]) => vis.has(a) && vis.has(b)).map(([a, b]) => ({ source: a, target: b, sug: false }));
    if (state.showSug && !(LOCK && state.person)) G.conf.forEach(([a, b]) => { if (vis.has(a) && vis.has(b)) visEdges.push({ source: a, target: b, sug: true }); });
    edgeSel = gEdges.selectAll("line").data(visEdges, d => (d.source.id || d.source) + (d.target.id || d.target) + d.sug)
      .join("line").attr("class", d => "edge" + (d.sug ? " sug" : "") + (!d.sug && !sameComm(d.source, d.target) ? " cross" : ""));
    nodeSel = gNodes.selectAll("g.node").data(visNodes, d => d.id).join(enter => {
      const g = enter.append("g").attr("class", "node").attr("tabindex", -1).attr("role", "button")
        .attr("aria-label", d => `${d.name}, ${TYPES[d.type].label}, ${d.deg} lien${d.deg > 1 ? "s" : ""}`);
      g.append("path").attr("class", "mk-o").attr("d", markD);
      g.append("path").attr("class", "mk").attr("d", markD);
      g.append("text").attr("dy", d => -rad(d) - 4).attr("text-anchor", "middle").text(d => d.name);
      g.append("title").text(d => `${d.name} · ${d.deg} lien${d.deg > 1 ? "s" : ""}`);
      g.on("click", (e, d) => { e.stopPropagation(); if (LOCK) { if (state.focus !== d.id) pick(d.id); } else if (state.focus !== d.id || state.ring) select(d.id); })
       .on("dblclick", (e, d) => { e.stopPropagation(); e.preventDefault(); if (LOCK) { if (state.focus !== d.id) pick(d.id); } else select(d.id, false, true); })
       .on("focus", (e, d) => setRov(d.id))
       .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (LOCK) pick(d.id); else select(d.id, false, e.shiftKey); }
         else if (DIRS[e.key]) { e.preventDefault(); moveFocus(d, DIRS[e.key]); }
         else if (e.key === "Escape" && state.focus && !LOCK) { e.preventDefault(); select(null); } })
       .call(d3.drag().on("start", (e, d) => { if (!e.active) sim.alphaTarget(.2).restart(); d.fx = d.x; d.fy = d.y; })
         .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); if (!d.ring) { d.fx = null; d.fy = null; } }));
      return g;
    });
    nodeSel.sort((a, b) => a.deg - b.deg);
    syncRov();
    sim.nodes(visNodes); sim.force("link").links(visEdges); sim.alpha(.8).restart();
    paint(); placeLabels(); labelVis(d3.zoomTransform(svg.node()).k); edgeVis(d3.zoomTransform(svg.node()).k); highlight();
  }
  // ---------- Clavier : un seul point dans l'ordre de tabulation (Tab entre puis sort de la carte),
  // les flèches passent au point le plus proche dans la direction. Fiche ouverte : seulement parmi ses liens.
  let rov = null;
  const DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  function setRov(id) { rov = id; if (nodeSel) nodeSel.attr("tabindex", d => d.id === rov ? 0 : -1); }
  function syncRov() {
    if (!visNodes.length) return;
    const has = id => id && visNodes.some(n => n.id === id);
    setRov(has(state.focus) ? state.focus : has(rov) ? rov : visNodes.reduce((a, b) => b.deg > a.deg ? b : a).id);
  }
  function moveFocus(d, [ux, uy]) {
    const f = state.focus && byId.get(state.focus), keep = f ? new Set([f.id, ...f.nb, ...(state.showSug ? f.sug : [])]) : null;
    let best = null, bs = Infinity;
    visNodes.forEach(n => { if (n === d || (keep && !keep.has(n.id))) return;
      const dx = n.x - d.x, dy = n.y - d.y, along = dx * ux + dy * uy; if (along <= 0) return;
      const s = along + 2.5 * Math.abs(dx * uy - dy * ux); if (s < bs) { bs = s; best = n; } });
    if (!best) return;
    setRov(best.id);
    const el = nodeSel.filter(n => n.id === best.id).node(); if (el) el.focus({ preventScroll: true });
    const v = viewArea();
    if (offscreen(best, v)) { const k = d3.zoomTransform(svg.node()).k;
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(v.cx - best.x * k, v.cy - best.y * k).scale(k)); }
  }
  function placeLabels() { if (!nodeSel) return;
    nodeSel.select("text")
      .attr("text-anchor", d => d.ring === "R" ? "start" : d.ring === "L" ? "end" : "middle")
      .attr("dx", d => d.ring === "R" ? rad(d) + 6 : d.ring === "L" ? -(rad(d) + 6) : 0)
      .attr("dy", d => d.ring === "R" || d.ring === "L" ? "0.32em" : -rad(d) - 4)
      .style("font-weight", d => d.ring === "C" ? 600 : null)
      .style("font-size", d => d.ring === "C" ? "13px" : "10.5px");
  }
  function releaseRing() { clearIso(); G.nodes.forEach(n => { if (n.ring) { n.ring = null; n.fx = null; n.fy = null; } }); }
  // ---------- Vues isolées : la fiche (ou le contributeur) au centre, ses voisines autour.
  // Jusqu'à FLOWER voisines : une couronne (noms à droite et à gauche, familles légèrement écartées).
  // Au-delà : une fleur par famille, en petite couronne autour d'un cœur à son nom ; les fleurs entourent le centre.
  // Le fond (fiches hors de la vue, décor) est légèrement flouté pour lire les liens.
  const FLOWER = 24, STEP = 22;
  const byName = (a, b) => a.name.localeCompare(b.name, "fr");
  let gIso = null, stems = null;
  function clearIso() { if (gIso) gIso.remove(); gIso = null; stems = null; gEdges.style("display", null); svg.classed("iso-on", false); }
  // Couronne : moitié à droite, moitié à gauche, un petit écart entre deux familles, points jamais superposés
  function crown(arr, minR) {
    const half = Math.ceil(arr.length / 2), sides = [["R", arr.slice(0, half)], ["L", arr.slice(half)]], GAP = 12;
    // L'écart entre deux points suit leur taille : jamais de chevauchement, même pour les grosses fiches
    const ys = sides.map(([, a]) => { let y = 0; return a.map((n, i) => {
      if (i) y += Math.max(STEP, rad(a[i - 1]) + rad(n) + 5) + (n.type !== a[i - 1].type ? GAP : 0); return y; }); });
    let maxH = 0, R = minR; ys.forEach(Y => { const H = Y.length ? Y[Y.length - 1] : 0; maxH = Math.max(maxH, H); R = Math.max(R, H / 2 + 40); });
    const pos = [];
    sides.forEach(([side, a], k) => { const Y = ys[k], H = Y.length ? Y[Y.length - 1] : 0, sx = side === "R" ? 1 : -1;
      a.forEach((n, i) => { const y = Y[i] - H / 2, x = sx * Math.sqrt(Math.max(R * R - y * y, (R * .35) ** 2)); pos.push([n, side, x, y]); }); });
    return { pos, R, H: maxH };
  }
  // groups : [{ label, color, nodes }] ; conf : fiches « à ne pas confondre » (tige rouge dans les fleurs)
  // Renvoie la taille occupée { w, h } pour cadrer le zoom
  function layoutIso(cx, cy, groups, center, withStems, conf) {
    clearIso();
    const all = groups.flatMap(g => g.nodes), targets = [], petals = [];
    gIso = root.insert("g", () => gNodes.node()).attr("class", "iso");
    let w, h;
    svg.classed("iso-on", true);
    if (all.length <= FLOWER) {
      const c = crown(all, 150);
      c.pos.forEach(([n, side, x, y]) => { n.ring = side; targets.push([n, n.x, n.y, cx + x, cy + y]); if (withStems) petals.push({ x: cx, y: cy, n }); });
      w = 2 * c.R + 360; h = c.H + 60;
    } else {
      gEdges.style("display", "none");
      const fl = groups.map(g => { const c = crown(g.nodes, 46); return { g, c, D: Math.max(2 * c.R + 300, c.H + 110) }; });
      const tot = fl.reduce((s, f) => s + f.D + 30, 0), maxD = d3.max(fl, f => f.D);
      const R = Math.max(maxD / 2 + 160, tot / (2 * Math.PI)); let a = -Math.PI / 2;
      fl.forEach(f => {
        const da = 2 * Math.PI * (f.D + 30) / tot, ang = a + da / 2; a += da;
        const hx = cx + Math.cos(ang) * R, hy = cy + Math.sin(ang) * R;
        gIso.append("line").attr("class", "stem main").attr("x1", cx).attr("y1", cy).attr("x2", hx).attr("y2", hy).style("stroke", f.g.color);
        f.c.pos.forEach(([n, side, x, y]) => { n.ring = side; targets.push([n, n.x, n.y, hx + x, hy + y]); petals.push({ x: hx, y: hy, n, conf: !!(conf && conf.has(n.id)) }); });
        const hg = gIso.append("g").attr("class", "heart").attr("transform", `translate(${hx},${hy})`);
        hg.append("circle").attr("r", 6).style("fill", f.g.color);
        hg.append("text").attr("y", -f.c.H / 2 - 28).attr("text-anchor", "middle").text(`${f.g.label} · ${f.g.nodes.length}`).style("fill", f.g.color);
      });
      w = h = 2 * (R + maxD / 2);
    }
    stems = gIso.selectAll("line.petal").data(petals).join("line").attr("class", d => "stem petal" + (d.conf ? " conf" : ""))
      .attr("x1", d => d.x).attr("y1", d => d.y).attr("x2", d => d.n.x).attr("y2", d => d.n.y);
    if (center) { center.ring = "C"; center.fx = cx; center.fy = cy; }
    d3.transition().duration(all.length > FLOWER ? 650 : 450).ease(d3.easeCubicOut).tween("ring", () => t => {
      targets.forEach(([n, x0, y0, x1, y1]) => { n.fx = x0 + (x1 - x0) * t; n.fy = y0 + (y1 - y0) * t; });
    });
    sim.alpha(.35).restart();
    placeLabels();
    return { w, h };
  }
  function buildRing(f) {
    const vis = new Set(visNodes.map(n => n.id));
    // Voisines et confusions rangées ensemble par famille ; dans les fleurs, la tige d'une confusion est rouge
    const conf = new Set(state.showSug ? f.sug : []);
    const nbs = [...new Set([...f.nb, ...conf])].map(i => byId.get(i)).filter(n => n && vis.has(n.id));
    const groups = typeKeys.map(t => ({ label: TYPES[t].label, color: TYPES[t].color, nodes: nbs.filter(n => n.type === t).sort(byName) })).filter(g => g.nodes.length);
    return layoutIso(f.x, f.y, groups, f, false, conf);
  }
  function paint() { if (nodeSel) nodeSel.select(".mk").attr("fill", color).attr("stroke", color); }

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
    if (state.ring) { txt.style("display", d => d.ring ? null : "none"); placeLabels(); return; }
    // Dézoom maximal : aucun nom, la carte se lit comme une forme
    if (k < .2) { txt.style("display", "none"); return; }
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
    if (stems) stems.attr("x2", d => d.n.x).attr("y2", d => d.n.y);
    scheduleLabels();
  });
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
    if (state.person && id) leavePerson();
    const wasRing = state.ring;
    state.focus = id; state.ring = !!(id && ring); if (id) setRov(id);
    releaseRing();
    if (id) { const n = byId.get(id);
      if (!state.types.has(n.type)) { state.types.add(n.type); if (chips) [...chips.children][typeKeys.indexOf(n.type)].classList.remove("off"); }
      if (n.deg === 0 && !state.showIso && !(state.showSug && n.sug.size)) isoBtn.click(); else update();
      if (FULL) { setCollapsed(state.ring && MOB()); loadFiche(id); }
      const v = viewArea();
      if (state.ring) {
        const box = buildRing(n);
        const k = Math.max(.25, Math.min(1.5, v.H / (box.h + 80), v.W / (box.w + 80)));
        svg.transition().duration(550).call(zoom.transform, d3.zoomIdentity.translate(v.cx - n.x * k, v.cy - n.y * k).scale(k));
      } else {
        if (wasRing) sim.alpha(.4).restart();
        if (center || offscreen(n, v)) { const k = Math.max(1.2, d3.zoomTransform(svg.node()).k);
          svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(v.cx - n.x * k, v.cy - n.y * k).scale(k)); }
      }
    } else { highlight(); placeLabels(); sim.alpha(.4).restart(); if (FULL) resetFiche(); }
    labelVis(d3.zoomTransform(svg.node()).k);
    const anc = id ? "#" + byId.get(id).anchor : "";
    if (bigLink) bigLink.href = BIG + anc;
    if (FULL) {
      isoSync(); renderPanel();
      if (history.replaceState) history.replaceState(null, "", anc || location.pathname + location.search);
    }
  }
  // La fiche choisie est-elle cachée (hors écran ou sous la fenêtre) ?
  function offscreen(n, v) {
    const t = d3.zoomTransform(svg.node()), x = t.applyX(n.x), y = t.applyY(n.y);
    return x < v.x0 + 20 || x > v.x1 - 20 || y < v.y0 + 20 || y > v.y1 - 20;
  }

  // Lien vers un formulaire avec ses champs pré-remplis
  const formUrl = U.formUrl;

  // ---------- Panneau (page complète)
  const panel = FULL ? $("panel") : null;
  const item = (n, extra = "") => `<li><span class="sw" data-s="${shapeOf(n.type)}" style="background:${color(n)}"></span><button class="lnk" data-id="${n.id}">${esc(n.name)}</button>${extra}</li>`;
  const grab = () => { const o = !document.body.classList.contains("nopanel");
    return `<button class="grab" aria-expanded="${o}" aria-label="${o ? "Réduire le panneau" : "Agrandir le panneau"}"><span></span></button>`; };
  const themeSwitch = () => { const d = isDark();
    return `<button class="theme" role="switch" aria-checked="${d}" data-theme-switch><span class="trk" aria-hidden="true"></span>Mode sombre</button>`; };
  function renderPanel() {
    if (!panel) return;
    if (state.focus) { const n = byId.get(state.focus);
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
  // Bouton « Isoler » (mobile) : même effet que le double clic sur desktop
  const wIso = FULL && win.querySelector("[data-iso]");
  function isoSync() { if (!wIso) return; const on = !!state.ring;
    wIso.hidden = !state.focus || /^(person|res):/.test(shown || "");
    wIso.textContent = on ? "Tout voir" : "Isoler"; wIso.setAttribute("aria-pressed", on);
    wIso.title = on ? "Revenir à la carte complète" : "Isoler la fiche avec ses liens"; }
  function setCollapsed(c) { if (!FULL) return; isoSync(); win.classList.toggle("collapsed", c); wCol.setAttribute("aria-expanded", !c); const l = c ? "Déplier la fiche" : "Replier la fiche"; wCol.setAttribute("aria-label", l); wCol.title = l; wCol.textContent = c ? (MOB() ? "▴" : "▸") : "▾";
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
    win.classList.remove("empty"); document.body.classList.add("hasfiche"); wTitle.textContent = n.name; wSw.style.background = color(n); wSw.dataset.s = shapeOf(n.type);
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
    wBody.innerHTML = U.ficheHTML(D, n, j, { here: location.origin + location.pathname + "#" + n.anchor,
      resItem: r => `<button class="lnk" data-res="${esc(r.id)}">${esc(r.name)}</button>` });
    wBody.scrollTop = 0;
    wBody.querySelectorAll("[data-id]").forEach(b => {
      if (byId.has(b.dataset.id)) b.onclick = () => select(b.dataset.id, true);
      else b.replaceWith(...b.childNodes);
    });
    wBody.querySelectorAll("[data-person]").forEach(b => b.onclick = () => showPerson(b.dataset.person));
    wBody.querySelectorAll("[data-res]").forEach(b => b.onclick = () => showRes(b.dataset.res));
  }
  // Fiche d'une ressource : même fenêtre qu'une fiche, avec le lien vers le template et les fiches liées
  // Ressources à plusieurs planches : libellés des boutons et liens supplémentaires
  const RES_EXTRA = {
    "Guide d'entretien utilisateur": {
      open: [["Ouvrir la grille de prise de notes", "ressources/grille-de-prise-de-notes.html"]],
      papier: [["Version papier de la grille", "ressources/grille-de-prise-de-notes.html?papier"]]
    }
  };
  async function showRes(rid) {
    const r = resById.get(rid); if (!r || !FULL) return;
    if (ficheReq) ficheReq.abort();
    shown = "res:" + rid; win.classList.remove("empty"); document.body.classList.add("hasfiche"); setCollapsed(false);
    wTitle.textContent = r.name; wSw.style.background = "var(--accent)"; delete wSw.dataset.s;
    const render = j => {
      wBody.removeAttribute("aria-busy");
      const props = j && j.props.length ? `<dl class="props">${j.props.map(p => `<dt>${esc(p.name)}</dt><dd>${p.html}</dd>`).join("")}</dl>` : "";
      const body = j && j.html.trim() ? j.html : `<p class="muted">Pas encore de mode d'emploi pour cette ressource.</p>`;
      const ls = r.liees.map(i => byId.get(i)).filter(Boolean);
      // « Version papier » : la fiche vierge à imprimer (les images de la page Notion sont des exemples remplis)
      const X = RES_EXTRA[r.name] || {};
      const own = /\/DataUX\/ressources\/[\w-]+\.html$/.test(r.url);
      const dl = (own ? [["Version papier vierge", r.url + "?papier"]] : []).concat(X.papier || [])
        .map(([label, href]) => `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join("");
      const more = (X.open || []).map(([label, href]) => `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join("");
      const F = G.forms || {};
      wBody.innerHTML = props + `<div class="acts" style="margin:0 0 12px"><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le template ↗</a>${more}${dl}</div>` + body
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
  const peopleById = D.people;
  function showPerson(pid) {
    const p = peopleById.get(pid); if (!p || !FULL) return;
    if (ficheReq) ficheReq.abort();
    shown = "person:" + pid; win.classList.remove("empty"); document.body.classList.add("hasfiche"); setCollapsed(false);
    wTitle.textContent = p.name; wSw.style.background = "var(--text-muted)"; delete wSw.dataset.s;
    wBody.removeAttribute("aria-busy");
    wBody.innerHTML = U.personHTML(p) + U.relues(D, p, true);
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
    wIso.onclick = e => { e.stopPropagation(); if (state.focus) select(state.focus, false, !state.ring); };
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
        ${G.bases.map(b => `<li><span class="dot" data-s="${shapeOf(b.key)}" style="background:${b.color}"></span>${esc(b.one || b.label)}</li>`).join("")}
      </ul>
      ${MOB() ? `<ul class="leg help"><li>Toucher : ouvrir la fiche.</li><li>Pincer pour voir plus de liens.</li></ul>`
        : `<ul class="leg help"><li>Clic : voir les liens.</li><li>Double clic : isoler la fiche.</li><li>Zoomer pour voir plus de liens, glisser pour déplacer.</li><li>Clavier : Tab, puis flèches ; Entrée ouvre la fiche.</li></ul>`}`;
    const setL = c => { lw.classList.toggle("collapsed", c); lc.setAttribute("aria-expanded", !c); lc.setAttribute("aria-label", c ? "Déplier la légende" : "Replier la légende"); lc.textContent = c ? "▸" : "▾"; store.set("reseau-legend-collapsed", c); };
    lc.onclick = () => setL(!lw.classList.contains("collapsed"));
    lw.querySelector(".whead").addEventListener("dblclick", e => { if (!e.target.closest("button")) setL(!lw.classList.contains("collapsed")); });
    const saved = store.get("reseau-legend-collapsed");
    setL(saved === null ? innerWidth <= 760 : saved);
    const p = store.get("reseau-legend-pos");
    if (p && innerWidth > 760) { lw.style.left = Math.min(Math.max(0, p.x), innerWidth - 120) + "px"; lw.style.top = Math.min(Math.max(0, p.y), innerHeight - 44) + "px"; lw.style.bottom = "auto"; lw.style.right = "auto"; }
    draggable(lw, "reseau-legend-pos");
  }

  // ---------- Carte isolée sur un contributeur (embed.html?iso#p=<id>) : son avatar au centre,
  // ses fiches autour, avec la même logique que la fiche isolée (couronne, ou fleurs par famille)
  let gPerson = null;
  function personHash() { const m = /^p=([\w-]+)$/.exec(location.hash.slice(1)); return m && peopleById.has(m[1]) ? m[1] : null; }
  function leavePerson() { state.person = null; if (gPerson) gPerson.remove(); gPerson = null; }
  function isoPerson(pid) {
    const p = peopleById.get(pid); if (!p) return;
    if (gPerson) gPerson.remove();
    state.person = pid; state.focus = null; releaseRing(); state.ring = true;
    update(); highlight();
    const groups = typeKeys.map(t => ({ label: TYPES[t].label, color: TYPES[t].color, nodes: visNodes.filter(n => n.type === t).sort(byName) })).filter(g => g.nodes.length);
    const box = layoutIso(0, 0, groups, null, true, null);
    gPerson = root.append("g").attr("class", "person");
    const R = 32, ini = p.name.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
    gPerson.append("circle").attr("class", "pav").attr("r", R + 3);
    if (p.photo) {
      svg.select("defs#pdefs").remove();
      svg.append("defs").attr("id", "pdefs").append("clipPath").attr("id", "pclip").append("circle").attr("r", R);
      gPerson.append("image").attr("href", p.photo).attr("x", -R).attr("y", -R).attr("width", 2 * R).attr("height", 2 * R)
        .attr("preserveAspectRatio", "xMidYMid slice").attr("clip-path", "url(#pclip)");
    } else gPerson.append("text").attr("class", "pini").attr("dy", ".35em").attr("text-anchor", "middle").text(ini);
    gPerson.append("text").attr("class", "pnm").attr("y", R + 20).attr("text-anchor", "middle").text(p.name);
    const v = viewArea(), k = Math.max(.25, Math.min(1.3, v.H / (box.h + 80), v.W / (box.w + 80)));
    svg.transition().duration(550).call(zoom.transform, d3.zoomIdentity.translate(v.cx, v.cy).scale(k));
    labelVis(k);
  }

  // ---------- Lancement
  if (MOB()) { document.body.classList.add("nopanel"); $("panelBtn").setAttribute("aria-expanded", false); }
  if (LOCK) { const d0 = fromHash(location.hash.slice(1)), p0 = personHash();
    if (p0) state.person = p0; else if (d0) state.focus = d0;
    if (p0 || d0) G.nodes.forEach(n => { n.x = 0; n.y = 0; }); }
  update(); renderPanel(); fitBar();
  if (document.fonts) document.fonts.ready.then(() => fitBar());
  sim.stop();
  if (!cached && !LOCK) { for (let i = 0; i < 450; i++) sim.tick();
    const p = {}; G.nodes.forEach(n => { p[n.id] = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10]; });
    store.set(LKEY, { sig: lsig, p }); }
  else G.nodes.forEach(n => { n.vx = 0; n.vy = 0; });
  linkCap = .05;
  sim.on("tick")(); sim.alpha(.05).restart();
  fitNodes(visNodes, 1.2, 0);
  addEventListener("resize", () => { fitBar(); if (LOCK && state.person) isoPerson(state.person); else if (LOCK && state.focus) select(state.focus, false, true); else if (!state.focus) fitNodes(visNodes, 1.2, 0); });
  const deep = fromHash(location.hash.slice(1));
  if (state.person) isoPerson(state.person); else if (deep) select(deep, true, LOCK);
  addEventListener("hashchange", () => { const pp = LOCK && personHash(); if (pp) { if (pp !== state.person) isoPerson(pp); return; }
    const d = fromHash(location.hash.slice(1)); if (d && d !== state.focus) select(d, true, LOCK); });
}
})();
