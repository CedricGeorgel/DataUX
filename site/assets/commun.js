// Briques communes aux pages DataUX (carte, liste, ressources). Chaque logique n'est écrite qu'une fois ici :
// outils de texte, thème, adresses lisibles, pastilles, cartes rangées par groupe, vue scindée animée,
// contenu d'une fiche et présentation d'un contributeur. Les pages s'en servent via window.DataUX.
(function () {
"use strict";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Texte sans accents ni majuscules, pour les recherches et les adresses
const fold = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slug = s => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const byName = (a, b) => a.name.localeCompare(b.name, "fr");
function formUrl(base, params) { const u = new URL(base); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); return u.toString(); }

// ---------- Thème choisi sur la carte (clair ou sombre) ; sans choix, le réglage de l'appareil
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
                set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const t0 = store.get("reseau-theme"); if (t0 === "light" || t0 === "dark") document.documentElement.dataset.theme = t0;

// ---------- Forme de chaque base (en plus de sa couleur) et pastille
const SHAPE = { biais: "circle", glossaire: "square", kpi: "diamond", loi: "triangle", methode: "hexagon", framework: "pentagon", acteur: "tridown", biblio: "book" };
const sw = (type, color) => `<span class="sw" data-s="${SHAPE[type] || "circle"}" style="background:${color}" aria-hidden="true"></span>`;

// ---------- Données de la carte, préparées une fois : bases, degrés, adresses lisibles (#persona)
function data(G) {
  const TYPES = {}; G.bases.forEach(b => { TYPES[b.key] = b; });
  const byId = new Map(G.nodes.map(n => [n.id, n]));
  if (G.nodes.some(n => n.deg == null)) {
    const deg = new Map(); G.edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); });
    G.nodes.forEach(n => { n.deg = deg.get(n.id) || 0; });
  }
  // Deux fiches au même nom : la base est ajoutée à la seconde (la plus liée garde le nom seul)
  const bySlug = new Map();
  G.nodes.slice().sort((a, b) => b.deg - a.deg || (a.id < b.id ? -1 : 1)).forEach(n => {
    let s = slug(n.name) || n.id;
    if (bySlug.has(s)) s += "-" + n.type; if (bySlug.has(s)) s += "-" + n.id.slice(0, 4);
    n.anchor = s; bySlug.set(s, n.id); });
  // Accepte aussi les anciens liens (#identifiant Notion)
  const fromHash = h => { try { h = decodeURIComponent(h || "").toLowerCase(); } catch (e) { return null; }
    if (bySlug.has(h)) return bySlug.get(h); h = h.replace(/-/g, ""); return byId.has(h) ? h : null; };
  const people = new Map((G.people || []).map(p => [p.id, p]));
  const RES = G.ressources || [];
  const own = r => /\/DataUX\/ressources\/[\w-]+\.html$/.test(r.url);
  RES.forEach(r => { r.own = own(r); r.local = r.own ? "ressources/" + r.url.split("/").pop() : r.url;
    r.anchor = r.own ? r.url.split("/").pop().replace(/\.html$/, "") : slug(r.name); });
  const label = t => TYPES[t].one || TYPES[t].label;
  const swOf = t => sw(t, TYPES[t].color);
  return { G, TYPES, byId, bySlug, fromHash, people, RES, label, swOf };
}

// ---------- Cartes rangées par groupe, avec filtre texte (et filtre par groupe en option)
// groups : [{ key, title (html), items: [{ key, anchor, name, meta, search, color }] }]
function grille(el, groups, noun) {
  el.innerHTML = groups.filter(g => g.items.length).map(g => `<section class="fam" data-g="${esc(g.key)}"><h2>${g.title} <span class="fc-n">${g.items.length}</span></h2><div class="cards">${g.items.map(it =>
    `<a class="card" href="#${esc(it.anchor)}" data-key="${esc(it.key)}" data-k="${esc(fold(it.search || it.name))}" style="--c:${it.color}">
      <span class="cn">${esc(it.name)}</span>${it.meta ? `<span class="cm">${esc(it.meta)}</span>` : ""}</a>`).join("")}</div></section>`).join("");
  const cards = [...el.querySelectorAll(".card")], fams = [...el.querySelectorAll(".fam")];
  return {
    cards, cardFor: key => cards.find(c => c.dataset.key === key),
    // Renvoie le texte du compteur : « 12 fiches » ou « Aucune fiche ne correspond. »
    filter(text, keep) {
      const v = fold(String(text || "").trim()); let c = 0;
      fams.forEach(f => { let k = 0; const show = !keep || keep.has(f.dataset.g);
        f.querySelectorAll(".card").forEach(a => { const ok = show && (!v || a.dataset.k.includes(v)); a.hidden = !ok; if (ok) k++; });
        f.hidden = !k; f.querySelector(".fc-n").textContent = k; c += k; });
      return c ? `${c} ${noun}${c > 1 ? "s" : ""}` : `Aucune ${noun} ne correspond.`;
    }
  };
}

// ---------- Vue scindée : une carte cliquée s'agrandit jusqu'à devenir le panneau (View Transitions),
// le bouton retour et le # de l'adresse font le chemin inverse. route() lit le # et ouvre ce qu'il faut.
function vue({ grid, head, split, title, cardFor, route }) {
  let cur = null, gridY = 0;
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const canVT = () => !RM.matches && !!document.startViewTransition;
  function animate(fn, card) {
    if (!canVT()) return fn();
    if (card) card.style.viewTransitionName = "fiche";
    document.startViewTransition(() => { if (card) card.style.viewTransitionName = ""; fn(); });
  }
  const api = {
    get current() { return cur; },
    // À appeler par la page quand elle affiche quelque chose dans le panneau
    show(key, name) {
      if (!cur) gridY = scrollY; cur = key;
      document.body.classList.add("split-on"); split.hidden = false; grid.hidden = true; head.hidden = true;
      document.title = name + " · DataUX";
    },
    close() {
      if (!cur) return; const last = cur; cur = null;
      document.body.classList.remove("split-on"); split.hidden = true; grid.hidden = false; head.hidden = false;
      document.title = title; scrollTo(0, gridY);
      const c = cardFor(last); if (c) c.focus({ preventScroll: true });
    },
    closeAnim() {
      const c = cur && cardFor(cur);
      if (!canVT() || !c) return api.close();
      const t = document.startViewTransition(() => { api.close(); c.style.viewTransitionName = "fiche"; });
      t.finished.finally(() => { c.style.viewTransitionName = ""; });
    },
    // Aller à une adresse (#…) ou revenir à la liste (sans argument), en gardant l'historique du navigateur
    go(hash) {
      if (!hash) { history.pushState(null, "", location.pathname + location.search); return api.closeAnim(); }
      history.pushState(null, "", hash); route();
    }
  };
  grid.addEventListener("click", e => {
    const a = e.target.closest(".card"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); history.pushState(null, "", a.getAttribute("href")); animate(route, a);
  });
  addEventListener("popstate", () => { if (location.hash.length > 1) { if (cur) route(); else animate(route); } else api.closeAnim(); });
  return api;
}

// ---------- Contenu d'une fiche (propriétés, corps, ressources, contributeurs), identique partout
const SKEL = `<div class="skel"></div><div class="skel"></div><div class="skel short"></div>`;
const propsHTML = j => j && j.props && j.props.length ? `<dl class="props">${j.props.map(p => `<dt>${esc(p.name)}</dt><dd>${p.html}</dd>`).join("")}</dl>` : "";
const bodyHTML = (j, empty) => `<div class="body">${j && j.html && j.html.trim() ? j.html : `<p class="muted">${esc(empty)}</p>`}</div>`;
// resItem(r) : comment afficher le lien vers une ressource (bouton sur la carte, lien sur la liste)
function ficheHTML(D, n, j, { resItem, here }) {
  const rs = D.RES.filter(r => r.liees.includes(n.id));
  const resH = rs.length ? `<div class="contrib"><h4>Ressources</h4><ul class="links res">${rs.map(r => `<li><span class="sw res"></span>${resItem(r)}</li>`).join("")}</ul></div>` : "";
  const who = j.contributors && j.contributors.length ? j.contributors.map(c => typeof c === "string" ? esc(c)
    : D.people.has(c.id) ? `<button class="lnk" data-person="${esc(c.id)}">${esc(c.name)}</button>` : esc(c.name)).join(", ")
    : `<span class="muted">Personne pour l'instant</span>`;
  const F = D.G.forms || {};
  const acts = [F.erreur ? `<a class="btn" href="${esc(formUrl(F.erreur, { type: "Erreur", fiche: n.name, lien: here }))}" target="_blank" rel="noopener noreferrer">Signaler une erreur</a>` : "",
    F.proposition ? `<a class="btn" href="${esc(formUrl(F.proposition, { liee: n.name }))}" target="_blank" rel="noopener noreferrer">Proposer une fiche liée</a>` : ""].join("");
  return propsHTML(j) + bodyHTML(j, "Pas de texte dans le corps de la fiche.") + resH
    + `<div class="contrib"><h4>Contributeurs</h4><p>${who}</p>${acts ? `<div class="acts">${acts}</div>` : ""}</div>`;
}
// Présentation d'un contributeur : photo, nom, métier, formation, étiquettes, liens, bio, ancienneté
function personHTML(p) {
  const ini = p.name.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
  const photo = p.photo ? `<img class="pphoto" src="${esc(p.photo)}" alt="">` : `<span class="pphoto ini" aria-hidden="true">${esc(ini)}</span>`;
  const links = (p.links || []).map(l => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join("");
  const since = p.since ? new Date(p.since).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "";
  return `<div class="phead">${photo}<div><div class="pname">${esc(p.name)}</div>
      ${p.job ? `<div class="muted">${esc(p.job)}</div>` : ""}${p.formation ? `<div class="muted">Formation : ${esc(p.formation)}</div>` : ""}
      ${(p.tags || []).length ? `<p class="ptags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</p>` : ""}</div></div>
    ${links ? `<div class="acts">${links}</div>` : ""}${p.bio ? `<div class="pbio">${p.bio}</div>` : ""}
    ${since ? `<p class="muted">Contributeur depuis ${esc(since)}</p>` : ""}`;
}
// Fiches relues par un contributeur, par base
// replie : liste dans un bloc dépliable (fenêtre de la carte, plus étroite)
function relues(D, p, replie) {
  const fs = (p.fiches || []).map(i => D.byId.get(i)).filter(Boolean), t = `${fs.length} fiche${fs.length > 1 ? "s" : ""} relue${fs.length > 1 ? "s" : ""}`;
  const list = D.G.bases.map(b => {
    const a = fs.filter(n => n.type === b.key).sort(byName);
    return a.length ? `<h5 class="pgrp">${D.swOf(b.key)}${esc(b.label)} <span class="muted">${a.length}</span></h5><ul class="plist">${a.map(n => `<li><button class="lnk" data-id="${n.id}">${esc(n.name)}</button></li>`).join("")}</ul>` : ""; }).join("");
  return replie ? `<details class="pfiches"><summary>${t}</summary>${list}</details>` : `<h4>${t}</h4>${list}`;
}
// Charge le contenu d'une fiche (une seule requête à la fois, réponses gardées en mémoire)
const cache = new Map(); let req = null;
function loadFiche(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (req) req.abort(); req = new AbortController();
  return fetch("data/fiches/" + id + ".json", { signal: req.signal }).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? "Cette fiche sera disponible à la prochaine mise à jour." : "Erreur " + r.status)))
    .then(j => { cache.set(id, j); return j; });
}
const loadGraph = () => fetch("data/graph.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : Promise.reject(r.status));

window.DataUX = { esc, fold, slug, byName, formUrl, store, SHAPE, sw, data, grille, vue, SKEL, propsHTML, bodyHTML, ficheHTML, personHTML, relues, loadFiche, loadGraph };
})();
