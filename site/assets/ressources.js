// Page « Ressources » : les templates en cartes, rangés par thème. Une ressource ouverte prend toute la page :
// boutons du template, mode d'emploi, fiches liées. Les briques viennent de commun.js.
(function () {
"use strict";
const U = window.DataUX, { esc } = U, $ = id => document.getElementById(id);

U.loadGraph().then(init).catch(() => { $("grid").innerHTML = `<p class="empty">Les ressources ne se chargent pas. Réessaie dans un instant.</p>`; });

function init(G) {
  const D = U.data(G), { byId, RES } = D, byAnchor = new Map(RES.map(r => [r.anchor, r]));

  // ---------- Cartes par thème (ordre de Notion, « Autres » à la fin) ; les puces font défiler jusqu'au thème
  const ord = G.resThemes || [], rank = k => { const i = ord.indexOf(k); return i < 0 ? ord.length : i; };
  const kinds = [...new Set(RES.map(r => r.kind || "Autres"))].sort((a, b) => (a === "Autres") - (b === "Autres") || rank(a) - rank(b) || a.localeCompare(b, "fr"));
  const grid = U.grille($("grid"), kinds.map(k => ({ key: k, title: esc(k),
    items: RES.filter(r => (r.kind || "Autres") === k).sort(U.byName).map(r => { const ls = r.liees.map(i => byId.get(i)).filter(Boolean).map(n => n.name).join(" · ");
      return { key: r.anchor, anchor: r.anchor, name: r.name, meta: ls, search: r.name + " " + ls, color: "var(--accent)" }; }) })), "ressource", $("jump"));
  const filter = () => { $("n").textContent = grid.filter($("q").value); };
  $("q").addEventListener("input", filter); filter();

  // ---------- Ressource ouverte en pleine page
  const v = U.vue({ grid: $("list"), head: document.querySelector(".fh"), split: $("split"), title: "Ressources · DataUX", cardFor: grid.cardFor, route });
  const f = $("fiche");
  function route() { let a = ""; try { a = decodeURIComponent(location.hash.slice(1)); } catch (e) {} if (byAnchor.has(a)) open(a); else v.close(); }
  function open(a) {
    const r = byAnchor.get(a); v.show(a, r.name);
    f.innerHTML = `<a class="back" href="#">← Toutes les ressources</a>
      <p class="ct"><span class="sw res" aria-hidden="true"></span>Ressource${r.kind ? " · " + esc(r.kind) : ""}</p><h1>${esc(r.name)}</h1>
      ${U.resActs(r)}<div class="fc">${U.SKEL}</div>`;
    f.querySelector(".back").onclick = e => { e.preventDefault(); v.go(); }; f.scrollTop = 0;
    const fill = j => { if (v.current !== a) return;
      f.querySelector(".fc").innerHTML = U.resHTML(D, r, j, n => `<li>${D.swOf(n.type)}<a href="fiches.html#${esc(n.anchor)}">${esc(n.name)}</a> <span class="muted">· ${esc(D.label(n.type))}</span></li>`);
      // Les liens internes du mode d'emploi mènent aux fiches de la liste
      f.querySelectorAll(".fc [data-id]").forEach(b => { const n = byId.get(b.dataset.id);
        if (n) { const l = document.createElement("a"); l.href = "fiches.html#" + n.anchor; l.textContent = b.textContent; b.replaceWith(l); } else b.replaceWith(...b.childNodes); }); };
    U.loadFiche(r.id).then(fill).catch(e => { if (!e || e.name !== "AbortError") fill(null); });
  }
  route();
}
})();
