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
  // Classées par famille (ordre des bases), puis par ordre alphabétique. Fond teinté à 5 % de la couleur de la famille.
  $("grid").innerHTML = G.bases.map(b => { const ns = G.nodes.filter(n => n.type === b.key).sort((x, y) => x.name.localeCompare(y.name, "fr"));
    return ns.length ? `<section class="fam" data-t="${b.key}"><h2>${sw(b.key)}${esc(b.label)} <span class="fc-n">${ns.length}</span></h2><div class="cards">${ns.map(n =>
      `<a class="card" href="#${n.anchor}" data-id="${n.id}" data-k="${esc(fold(n.name + " " + (n.cat || "")))}" style="--c:${b.color}">
        <span class="cn">${esc(n.name)}</span>${n.cat ? `<span class="cm">${esc(n.cat)}</span>` : ""}</a>`).join("")}</div></section>` : ""; }).join("");
  const cards = [...$("grid").querySelectorAll(".card")], fams = [...$("grid").querySelectorAll(".fam")];
  function filter() {
    const v = fold($("q").value.trim()); let c = 0;
    fams.forEach(f => { let k = 0; const show = on.has(f.dataset.t);
      f.querySelectorAll(".card").forEach(a => { const ok = show && (!v || a.dataset.k.includes(v)); a.hidden = !ok; if (ok) k++; });
      f.hidden = !k; f.querySelector(".fc-n").textContent = k; c += k; });
    $("n").textContent = c ? `${c} fiche${c > 1 ? "s" : ""}` : "Aucune fiche ne correspond.";
  }
  $("q").addEventListener("input", filter); filter();

  // ---------- Vue scindée
  const map = $("map"), cache = new Map(); let shown = null, req = null, gridY = 0;
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const canVT = () => !RM.matches && !!document.startViewTransition;
  map.addEventListener("load", () => map.classList.add("ready"));
  // La carte prévient quand on y ouvre un autre point : on suit sans recharger la carte
  addEventListener("message", e => {
    if (e.origin !== location.origin || e.source !== map.contentWindow || !e.data || e.data.dataux !== "fiche") return;
    const n = byId.get(e.data.id); if (n && n.id !== shown) { history.pushState(null, "", "#" + n.anchor); open(n.id, true); }
  });
  // Ouverture : la carte cliquée s'agrandit jusqu'à devenir le panneau de la fiche (View Transitions),
  // la carte du réseau glisse depuis la droite. Fermeture : le chemin inverse, vers la carte d'origine.
  function openAnim(id, card) {
    if (!canVT()) return open(id);
    if (card) card.style.viewTransitionName = "fiche";
    document.startViewTransition(() => { if (card) card.style.viewTransitionName = ""; open(id); });
  }
  function closeAnim() {
    const c = cards.find(a => a.dataset.id === shown);
    if (!canVT() || !c) return close();
    const t = document.startViewTransition(() => { close(); c.style.viewTransitionName = "fiche"; });
    t.finished.finally(() => { c.style.viewTransitionName = ""; });
  }
  $("grid").addEventListener("click", e => {
    const a = e.target.closest(".card"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); history.pushState(null, "", a.getAttribute("href")); openAnim(a.dataset.id, a);
  });
  function route(anim) { const id = fromHash();
    if (id) { if (anim && !shown) openAnim(id); else open(id); } else if (anim) closeAnim(); else close(); }
  addEventListener("popstate", () => route(true));
  function close() {
    if (!shown) return; const last = shown; shown = null;
    document.body.classList.remove("split-on"); $("split").hidden = true; $("grid").hidden = false; document.querySelector(".fh").hidden = false;
    document.title = "Toutes les fiches · DataUX";
    scrollTo(0, gridY);
    const c = cards.find(a => a.dataset.id === last); if (c) c.focus({ preventScroll: true });
  }
  function open(id, fromMap) {
    const n = byId.get(id); if (!n) return;
    const first = !shown; shown = id;
    if (first) gridY = scrollY;
    document.body.classList.add("split-on"); $("split").hidden = false; $("grid").hidden = true; document.querySelector(".fh").hidden = true;
    document.title = n.name + " · DataUX";
    if (!fromMap) {
      // La carte n'est chargée qu'une fois : ensuite on change seulement de fiche (un changement d'adresse
      // limité au # ne recharge pas la page, donc pas d'événement load : la carte doit rester visible)
      if (!map.getAttribute("src")) map.src = "embed.html?iso#" + n.id;
      else try { map.contentWindow.location.replace("embed.html?iso#" + n.id); } catch (e) { map.src = "embed.html?iso#" + n.id; }
    }
    const f = $("fiche");
    f.innerHTML = head(n) + `<div class="fc"><div class="skel"></div><div class="skel"></div><div class="skel short"></div></div>`;
    bind(f); f.scrollTop = 0;
    if (cache.has(id)) return render(n, cache.get(id));
    if (req) req.abort(); req = new AbortController();
    fetch("data/fiches/" + id + ".json", { signal: req.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(j => { cache.set(id, j); if (shown === id) render(n, j); })
      .catch(e => { if (e && e.name === "AbortError") return; if (shown === id) f.querySelector(".fc").innerHTML = `<p class="muted">Le contenu de cette fiche ne se charge pas.</p>`; });
  }
  const head = n => `<a class="back" href="#">← Toutes les fiches</a>
    <p class="ct">${sw(n.type)}${esc(TYPES[n.type].one || TYPES[n.type].label)}${n.cat ? " · " + esc(n.cat) : ""}</p>
    <h1>${esc(n.name)}</h1>`;
  function render(n, j) {
    const f = $("fiche");
    const props = j.props && j.props.length ? `<dl class="props">${j.props.map(p => `<dt>${esc(p.name)}</dt><dd>${p.html}</dd>`).join("")}</dl>` : "";
    const rs = RES.filter(r => r.liees.includes(n.id));
    const resH = rs.length ? `<h4>Ressources</h4><ul class="res">${rs.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)} ↗</a></li>`).join("")}</ul>` : "";
    // Contributeurs (comme sur la carte) : un nom connu s'ouvre sur sa présentation, sous la liste
    const who = j.contributors && j.contributors.length ? j.contributors.map(c => typeof c === "string" ? esc(c)
      : people.has(c.id) ? `<button class="lnk" data-person="${esc(c.id)}" aria-expanded="false">${esc(c.name)}</button>` : esc(c.name)).join(", ")
      : `<span class="muted">Personne pour l'instant</span>`;
    const F = G.forms || {}, here = location.origin + location.pathname + "#" + n.anchor;
    const acts = [F.erreur ? `<a class="btn" href="${esc(formUrl(F.erreur, { type: "Erreur", fiche: n.name, lien: here }))}" target="_blank" rel="noopener noreferrer">Signaler une erreur</a>` : "",
      F.proposition ? `<a class="btn" href="${esc(formUrl(F.proposition, { liee: n.name }))}" target="_blank" rel="noopener noreferrer">Proposer une fiche liée</a>` : ""].join("");
    const contrib = `<div class="contrib"><h4>Contributeurs</h4><p>${who}</p><div id="person"></div>${acts ? `<p class="acts">${acts}</p>` : ""}</div>`;
    f.querySelector(".fc").innerHTML = props + `<div class="body">${j.html && j.html.trim() ? j.html : `<p class="muted">Pas de texte dans le corps de la fiche.</p>`}</div>` + resH + contrib;
    f.querySelectorAll("[data-person]").forEach(b => b.onclick = () => {
      const open = b.getAttribute("aria-expanded") !== "true";
      f.querySelectorAll("[data-person]").forEach(x => x.setAttribute("aria-expanded", "false"));
      $("person").innerHTML = open ? person(people.get(b.dataset.person)) : ""; b.setAttribute("aria-expanded", open); });
    bind(f);
  }
  const people = new Map((G.people || []).map(p => [p.id, p]));
  function formUrl(base, params) { const u = new URL(base); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); return u.toString(); }
  function person(p) {
    const ini = p.name.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
    const photo = p.photo ? `<img class="pphoto" src="${esc(p.photo)}" alt="">` : `<span class="pphoto ini" aria-hidden="true">${esc(ini)}</span>`;
    const links = (p.links || []).map(l => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join("");
    return `<div class="pcard"><div class="phead">${photo}<div><div class="pname">${esc(p.name)}</div>
      ${p.job ? `<div class="muted">${esc(p.job)}</div>` : ""}${p.formation ? `<div class="muted">Formation : ${esc(p.formation)}</div>` : ""}</div></div>
      ${links ? `<p class="acts">${links}</p>` : ""}${p.bio ? `<div class="pbio">${p.bio}</div>` : ""}
      <p class="muted">${(p.fiches || []).length} fiche${(p.fiches || []).length > 1 ? "s" : ""} relue${(p.fiches || []).length > 1 ? "s" : ""}</p></div>`;
  }
  function bind(f) {
    f.querySelector(".back").onclick = e => { e.preventDefault(); history.pushState(null, "", location.pathname + location.search); closeAnim(); };
    f.querySelectorAll("[data-id]").forEach(b => { const n = byId.get(b.dataset.id);
      if (n) b.onclick = () => { history.pushState(null, "", "#" + n.anchor); open(n.id); }; else b.replaceWith(...b.childNodes); });
  }
  route();
}
})();
