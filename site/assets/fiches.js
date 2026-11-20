// Page « Toutes les fiches » : les fiches en cartes. Une fiche ouverte scinde la page :
// à gauche son contenu, à droite la carte isolée sur elle (embed.html?iso, sans moyen d'en sortir).
(function () {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
try { const t = JSON.parse(localStorage.getItem("reseau-theme")); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) {}

fetch("data/graph.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(init)
  .catch(() => { $("grid").innerHTML = `<p class="empty">Les fiches ne se chargent pas. Réessaie dans un instant.</p>`; });

function init(G) {
  const TYPES = {}; G.bases.forEach(b => { TYPES[b.key] = b; });
  const byId = new Map(G.nodes.map(n => [n.id, n]));
  const deg = new Map(); G.edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); });
  G.nodes.forEach(n => { n.deg = deg.get(n.id) || 0; });
  // Mêmes adresses que la carte (#persona)
  const bySlug = new Map();
  G.nodes.slice().sort((a, b) => b.deg - a.deg || (a.id < b.id ? -1 : 1)).forEach(n => {
    let s = fold(n.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || n.id;
    if (bySlug.has(s)) s += "-" + n.type; if (bySlug.has(s)) s += "-" + n.id.slice(0, 4);
    n.anchor = s; bySlug.set(s, n.id); });
  const fromHash = () => { let h = ""; try { h = decodeURIComponent(location.hash.slice(1)).toLowerCase(); } catch (e) { return null; }
    if (bySlug.has(h)) return bySlug.get(h); h = h.replace(/-/g, ""); return byId.has(h) ? h : null; };
  const SHAPE = { biais: "circle", glossaire: "square", kpi: "diamond", loi: "triangle", methode: "hexagon", framework: "pentagon", acteur: "tridown", biblio: "book" };
  const sw = t => `<span class="sw" data-s="${SHAPE[t] || "circle"}" style="background:${TYPES[t].color}" aria-hidden="true"></span>`;
  const RES = G.ressources || [];

  // ---------- Cartes
  const on = new Set(G.bases.map(b => b.key));
  $("chips").innerHTML = G.bases.map(b => `<button class="chip" data-t="${b.key}" aria-pressed="true">${sw(b.key)}${esc(b.label.replace(/^Fiches\s+/, ""))}</button>`).join("");
  $("chips").querySelectorAll("[data-t]").forEach(b => b.onclick = () => {
    const t = b.dataset.t; on.has(t) ? on.delete(t) : on.add(t); b.setAttribute("aria-pressed", on.has(t)); filter(); });
  const sorted = G.nodes.slice().sort((a, b) => a.name.localeCompare(b.name, "fr"));
  $("grid").innerHTML = sorted.map(n => `<a class="card" href="#${n.anchor}" data-id="${n.id}" data-t="${n.type}" data-k="${esc(fold(n.name + " " + (n.cat || "")))}">
      <span class="ct">${sw(n.type)}${esc(TYPES[n.type].one || TYPES[n.type].label)}</span>
      <span class="cn">${esc(n.name)}</span>
      <span class="cm">${n.cat ? esc(n.cat) + " · " : ""}${n.deg} lien${n.deg > 1 ? "s" : ""}</span></a>`).join("");
  const cards = [...$("grid").children];
  function filter() {
    const v = fold($("q").value.trim()); let c = 0;
    cards.forEach(a => { const ok = on.has(a.dataset.t) && (!v || a.dataset.k.includes(v)); a.hidden = !ok; if (ok) c++; });
    $("n").textContent = c ? `${c} fiche${c > 1 ? "s" : ""}` : "Aucune fiche ne correspond.";
  }
  $("q").addEventListener("input", filter); filter();

  // ---------- Vue scindée
  const map = $("map"), cache = new Map(); let shown = null, req = null;
  // La carte prévient quand on y ouvre un autre point : on suit sans recharger la carte
  addEventListener("message", e => {
    if (e.origin !== location.origin || e.source !== map.contentWindow || !e.data || e.data.dataux !== "fiche") return;
    const n = byId.get(e.data.id); if (n && n.id !== shown) { history.pushState(null, "", "#" + n.anchor); open(n.id, true); }
  });
  function route() { const id = fromHash(); if (id) open(id); else close(); }
  addEventListener("hashchange", route);
  addEventListener("popstate", route);
  function close() {
    if (!shown) return; const last = shown; shown = null;
    document.body.classList.remove("split-on"); $("split").hidden = true; $("grid").hidden = false; document.querySelector(".fh").hidden = false;
    document.title = "Toutes les fiches · DataUX";
    const c = cards.find(a => a.dataset.id === last); if (c) c.focus({ preventScroll: false });
  }
  function open(id, fromMap) {
    const n = byId.get(id); if (!n) return;
    const first = !shown; shown = id;
    document.body.classList.add("split-on"); $("split").hidden = false; $("grid").hidden = true; document.querySelector(".fh").hidden = true;
    document.title = n.name + " · DataUX";
    if (!fromMap) {
      if (first || !map.contentWindow || !map.src) map.src = "embed.html?iso#" + n.id;
      else try { map.contentWindow.location.replace("embed.html?iso#" + n.id); } catch (e) { map.src = "embed.html?iso#" + n.id; }
    }
    const f = $("fiche");
    f.innerHTML = head(n) + `<div class="skel"></div><div class="skel"></div><div class="skel short"></div>`;
    bind(f); f.scrollTop = 0;
    if (cache.has(id)) return render(n, cache.get(id));
    if (req) req.abort(); req = new AbortController();
    fetch("data/fiches/" + id + ".json", { signal: req.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(j => { cache.set(id, j); if (shown === id) render(n, j); })
      .catch(e => { if (e && e.name === "AbortError") return; if (shown === id) { f.innerHTML = head(n) + `<p class="muted">Le contenu de cette fiche ne se charge pas.</p>`; bind(f); } });
  }
  const head = n => `<a class="back" href="#">← Toutes les fiches</a>
    <p class="ct">${sw(n.type)}${esc(TYPES[n.type].one || TYPES[n.type].label)}${n.cat ? " · " + esc(n.cat) : ""}</p>
    <h1>${esc(n.name)}</h1>`;
  function render(n, j) {
    const f = $("fiche");
    const props = j.props && j.props.length ? `<dl class="props">${j.props.map(p => `<dt>${esc(p.name)}</dt><dd>${p.html}</dd>`).join("")}</dl>` : "";
    const rs = RES.filter(r => r.liees.includes(n.id));
    const resH = rs.length ? `<h4>Ressources</h4><ul class="res">${rs.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)} ↗</a></li>`).join("")}</ul>` : "";
    f.innerHTML = head(n) + props + `<div class="body">${j.html && j.html.trim() ? j.html : `<p class="muted">Pas de texte dans le corps de la fiche.</p>`}</div>` + resH;
    bind(f); f.scrollTop = 0;
  }
  function bind(f) {
    f.querySelector(".back").onclick = e => { e.preventDefault(); history.pushState(null, "", location.pathname + location.search); close(); };
    f.querySelectorAll("[data-id]").forEach(b => { const n = byId.get(b.dataset.id);
      if (n) b.onclick = () => { history.pushState(null, "", "#" + n.anchor); open(n.id); }; else b.replaceWith(...b.childNodes); });
  }
  route();
}
})();
