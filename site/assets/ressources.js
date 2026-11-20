// Page « Ressources » : les templates en cartes, classés par thème. Une ressource ouverte scinde la page :
// à gauche sa fiche (mode d'emploi, liens), à droite l'aperçu du template, réduit à la largeur du panneau.
(function () {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
try { const t = JSON.parse(localStorage.getItem("reseau-theme")); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) {}

fetch("data/graph.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(init)
  .catch(() => { $("grid").innerHTML = `<p class="empty">Les ressources ne se chargent pas. Réessaie dans un instant.</p>`; });

// Ressources à plusieurs planches : liens supplémentaires (comme sur la carte)
const EXTRA = { "Guide d'entretien utilisateur": [["Grille de prise de notes", "ressources/grille-de-prise-de-notes.html"], ["Version papier de la grille", "ressources/grille-de-prise-de-notes.html?papier"]] };

function init(G) {
  const RES = (G.ressources || []).slice();
  const byId = new Map(G.nodes.map(n => [n.id, n])), TYPES = {}; G.bases.forEach(b => { TYPES[b.key] = b; });
  // Adresse de la ressource : le nom de sa page (#persona), sinon son nom
  const own = r => /\/DataUX\/ressources\/[\w-]+\.html$/.test(r.url);
  const local = r => own(r) ? "ressources/" + r.url.split("/").pop() : r.url;
  RES.forEach(r => { r.anchor = own(r) ? r.url.split("/").pop().replace(/\.html$/, "") : fold(r.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); });
  const byAnchor = new Map(RES.map(r => [r.anchor, r]));

  // ---------- Cartes par thème (ordre de Notion, « Autres » à la fin)
  const ord = G.resThemes || [], rank = k => { const i = ord.indexOf(k); return i < 0 ? ord.length : i; };
  const kinds = [...new Set(RES.map(r => r.kind || "Autres"))].sort((a, b) => (a === "Autres") - (b === "Autres") || rank(a) - rank(b) || a.localeCompare(b, "fr"));
  $("grid").innerHTML = kinds.map(k => { const rs = RES.filter(r => (r.kind || "Autres") === k).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return `<section class="fam"><h2>${esc(k)} <span class="fc-n">${rs.length}</span></h2><div class="cards">${rs.map(r => {
      const ls = r.liees.map(i => byId.get(i)).filter(Boolean).map(n => n.name);
      return `<a class="card" href="#${r.anchor}" data-a="${r.anchor}" data-k="${esc(fold(r.name + " " + ls.join(" ")))}" style="--c:var(--accent)">
        <span class="cn">${esc(r.name)}</span>${ls.length ? `<span class="cm">${esc(ls.join(" · "))}</span>` : ""}</a>`; }).join("")}</div></section>`; }).join("");
  const cards = [...$("grid").querySelectorAll(".card")], fams = [...$("grid").querySelectorAll(".fam")];
  function filter() {
    const v = fold($("q").value.trim()); let c = 0;
    fams.forEach(f => { let k = 0; f.querySelectorAll(".card").forEach(a => { const ok = !v || a.dataset.k.includes(v); a.hidden = !ok; if (ok) k++; });
      f.hidden = !k; f.querySelector(".fc-n").textContent = k; c += k; });
    $("n").textContent = c ? `${c} ressource${c > 1 ? "s" : ""}` : "Aucune ressource ne correspond.";
  }
  $("q").addEventListener("input", filter); filter();

  // ---------- Vue scindée
  const tpl = $("tpl"), box = $("tplBox"), cache = new Map(); let shown = null, req = null, gridY = 0;
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const canVT = () => !RM.matches && !!document.startViewTransition;
  // Le template (A4 paysage, 1123 px) est affiché en entier dans le panneau : on le réduit à sa largeur
  const W = 1200;
  function fit() { const k = Math.min(1, box.clientWidth / W);
    tpl.style.width = W + "px"; tpl.style.height = (box.clientHeight / k) + "px"; tpl.style.transform = `scale(${k})`; }
  addEventListener("resize", () => { if (shown) fit(); });
  tpl.addEventListener("load", () => tpl.classList.add("ready"));
  function openAnim(a, card) {
    if (!canVT()) return open(a);
    if (card) card.style.viewTransitionName = "fiche";
    document.startViewTransition(() => { if (card) card.style.viewTransitionName = ""; open(a); });
  }
  function closeAnim() {
    const c = cards.find(x => x.dataset.a === shown);
    if (!canVT() || !c) return close();
    const t = document.startViewTransition(() => { close(); c.style.viewTransitionName = "fiche"; });
    t.finished.finally(() => { c.style.viewTransitionName = ""; });
  }
  $("grid").addEventListener("click", e => {
    const a = e.target.closest(".card"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); history.pushState(null, "", a.getAttribute("href")); openAnim(a.dataset.a, a);
  });
  const fromHash = () => { try { const h = decodeURIComponent(location.hash.slice(1)); return byAnchor.has(h) ? h : null; } catch (e) { return null; } };
  function route(anim) { const a = fromHash();
    if (a) { if (anim && !shown) openAnim(a); else open(a); } else if (anim) closeAnim(); else close(); }
  addEventListener("popstate", () => route(true));
  function close() {
    if (!shown) return; const last = shown; shown = null;
    document.body.classList.remove("split-on"); $("split").hidden = true; $("grid").hidden = false; document.querySelector(".fh").hidden = false;
    document.title = "Ressources · DataUX"; scrollTo(0, gridY);
    const c = cards.find(x => x.dataset.a === last); if (c) c.focus({ preventScroll: true });
  }
  function open(a) {
    const r = byAnchor.get(a); if (!r) return;
    if (!shown) gridY = scrollY; shown = a;
    document.body.classList.add("split-on"); $("split").hidden = false; $("grid").hidden = true; document.querySelector(".fh").hidden = true;
    document.title = r.name + " · DataUX";
    // Aperçu à droite : le template du site, ou un lien pour une ressource hébergée ailleurs
    if (own(r)) { $("ext").hidden = true; tpl.hidden = false; fit();
      if (tpl.getAttribute("src") !== local(r)) { tpl.classList.remove("ready"); tpl.src = local(r); } }
    else { tpl.hidden = true; tpl.removeAttribute("src"); $("ext").hidden = false;
      $("ext").innerHTML = `<p>Ce template est hébergé ailleurs.</p><a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Ouvrir ${esc(r.name)} ↗</a>`; }
    const f = $("fiche");
    f.innerHTML = head(r) + `<div class="fc"><div class="skel"></div><div class="skel"></div><div class="skel short"></div></div>`;
    bind(f); f.scrollTop = 0;
    if (cache.has(r.id)) return render(r, cache.get(r.id));
    if (req) req.abort(); req = new AbortController();
    fetch("data/fiches/" + r.id + ".json", { signal: req.signal }).then(x => x.ok ? x.json() : null)
      .then(j => { if (j) cache.set(r.id, j); if (shown === a) render(r, j); })
      .catch(e => { if (e && e.name !== "AbortError" && shown === a) render(r, null); });
  }
  const head = r => {
    const links = (own(r) ? [["Ouvrir le template", local(r)], ["Version papier vierge", local(r) + "?papier"]] : [["Ouvrir le template", r.url]]).concat(EXTRA[r.name] || []);
    return `<a class="back" href="#">← Toutes les ressources</a>
    <p class="ct"><span class="sw res" aria-hidden="true"></span>Ressource${r.kind ? " · " + esc(r.kind) : ""}</p>
    <h1>${esc(r.name)}</h1>
    <p class="acts">${links.map(([l, h], i) => `<a class="btn${i ? "" : " main"}" href="${esc(h)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join("")}</p>`; };
  function render(r, j) {
    const f = $("fiche");
    const props = j && j.props && j.props.length ? `<dl class="props">${j.props.map(p => `<dt>${esc(p.name)}</dt><dd>${p.html}</dd>`).join("")}</dl>` : "";
    const ls = r.liees.map(i => byId.get(i)).filter(Boolean);
    const lies = ls.length ? `<h4>Fiches liées</h4><ul class="res">${ls.map(n => `<li><a href="fiches.html#${n.id}">${esc(n.name)}</a> <span class="muted">· ${esc(TYPES[n.type].one || TYPES[n.type].label)}</span></li>`).join("")}</ul>` : "";
    f.querySelector(".fc").innerHTML = props + `<div class="body">${j && j.html && j.html.trim() ? j.html : `<p class="muted">Pas encore de mode d'emploi pour cette ressource.</p>`}</div>` + lies;
    // Les liens internes du mode d'emploi mènent aux fiches de la liste
    f.querySelectorAll(".fc [data-id]").forEach(b => { const n = byId.get(b.dataset.id);
      if (n) { const l = document.createElement("a"); l.href = "fiches.html#" + n.id; l.textContent = b.textContent; b.replaceWith(l); } else b.replaceWith(...b.childNodes); });
  }
  function bind(f) {
    f.querySelector(".back").onclick = e => { e.preventDefault(); history.pushState(null, "", location.pathname + location.search); closeAnim(); };
  }
  route();
}
})();
