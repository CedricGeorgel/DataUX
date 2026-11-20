// Page « Liste » : les fiches en cartes, rangées par famille. Une fiche ouverte scinde la page :
// à gauche son contenu, à droite la carte isolée sur elle (embed.html?iso, sans moyen d'en sortir).
// Un contributeur s'ouvre de la même façon, avec son avatar au centre de la carte.
// Les briques (cartes, rangement, vue scindée, contenu de fiche) viennent de commun.js.
(function () {
"use strict";
const U = window.DataUX, { esc } = U, $ = id => document.getElementById(id);

U.loadGraph().then(init).catch(() => { $("grid").innerHTML = `<p class="empty">Les fiches ne se chargent pas. Réessaie dans un instant.</p>`; });

function init(G) {
  const D = U.data(G), { byId, people } = D;

  // ---------- Cartes par famille ; les puces des familles font défiler jusqu'à la famille
  const grid = U.grille($("grid"), G.bases.map(b => ({ key: b.key, title: D.swOf(b.key) + esc(b.label),
    items: G.nodes.filter(n => n.type === b.key).sort(U.byName).map(n => ({ key: n.id, anchor: n.anchor, name: n.name, meta: n.cat, search: n.name + " " + (n.cat || ""), color: b.color })) })), "fiche", $("jump"));
  const filter = () => { $("n").textContent = grid.filter($("q").value); };
  $("q").addEventListener("input", filter); filter();

  // ---------- Vue scindée
  const v = U.vue({ grid: $("list"), head: document.querySelector(".fh"), split: $("split"), title: "Toutes les fiches · DataUX", cardFor: grid.cardFor, route });
  const map = $("map"), f = $("fiche"); let lastFiche = null;
  map.addEventListener("load", () => map.classList.add("ready"));
  // La carte n'est chargée qu'une fois : ensuite on change seulement son # (pas de rechargement, pas d'événement load)
  function mapTo(hash) {
    if (!map.getAttribute("src")) map.src = "embed.html?iso#" + hash;
    else try { map.contentWindow.location.replace("embed.html?iso#" + hash); } catch (e) { map.src = "embed.html?iso#" + hash; }
  }
  // La carte prévient quand on y ouvre un autre point : on suit sans la recharger
  addEventListener("message", e => {
    if (e.origin !== location.origin || e.source !== map.contentWindow || !e.data || e.data.dataux !== "fiche") return;
    const n = byId.get(e.data.id); if (n && n.id !== v.current) { history.pushState(null, "", "#" + n.anchor); open(n.id, true); }
  });
  function route() {
    const m = /^#contributeur-([\w-]+)$/.exec(location.hash);
    if (m && people.has(m[1])) return openPerson(m[1]);
    const id = D.fromHash(location.hash.slice(1)); if (id) open(id); else v.close();
  }
  function open(id, fromMap) {
    const n = byId.get(id); if (!n) return;
    v.show(id, n.name); lastFiche = id;
    if (!fromMap) mapTo(n.id);
    f.innerHTML = `<a class="back" href="#">← Toutes les fiches</a>
      <p class="ct">${D.swOf(n.type)}${esc(D.label(n.type))}${n.cat ? " · " + esc(n.cat) : ""}</p><h1>${esc(n.name)}</h1><div class="fc">${U.SKEL}</div>`;
    bind(); f.scrollTop = 0;
    U.loadFiche(id).then(j => { if (v.current !== id) return;
      f.querySelector(".fc").innerHTML = U.ficheHTML(D, n, j, { here: location.origin + location.pathname + "#" + n.anchor,
        resItem: r => `<a href="ressources.html#${esc(r.anchor)}">${esc(r.name)}</a>` });
      bind(); })
      .catch(e => { if (e && e.name !== "AbortError" && v.current === id) f.querySelector(".fc").innerHTML = `<p class="muted">Le contenu de cette fiche ne se charge pas.</p>`; });
  }
  // Contributeur : sa présentation à gauche, son avatar au centre de la carte, ses fiches autour
  function openPerson(pid) {
    const p = people.get(pid);
    v.show("p:" + pid, p.name); mapTo("p=" + pid);
    const back = lastFiche ? `<button class="lnk back" data-id="${lastFiche}">← ${esc(byId.get(lastFiche).name)}</button>` : `<a class="back" href="#">← Toutes les fiches</a>`;
    f.innerHTML = back + `<p class="ct">Contributeur</p><div class="fc pbig">${U.personHTML(p)}${U.relues(D, p)}</div>`;
    bind(); f.scrollTop = 0;
  }
  function bind() {
    const b = f.querySelector(".back"); if (b) b.onclick = e => { e.preventDefault(); v.go(); };
    f.querySelectorAll("[data-id]").forEach(x => { const n = byId.get(x.dataset.id);
      if (n) x.onclick = e => { e.preventDefault(); v.go("#" + n.anchor); }; else x.replaceWith(...x.childNodes); });
    f.querySelectorAll("[data-person]").forEach(x => x.onclick = () => v.go("#contributeur-" + x.dataset.person));
  }
  route();
}
})();
