(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const BASES = { kpi: "Fiches KPI", loi: "Lois du design", biais: "Biais cognitifs", methode: "Méthodes UX", framework: "Frameworks produit", acteur: "Acteurs du design", glossaire: "Glossaire design", biblio: "Bibliographie design" };
  const MOTIFS = { target: "Cible", scale: "Échelle", funnel: "Entonnoir", diamonds: "Double diamant", person: "Personne", clusters: "Groupes", outlier: "Élément qui se distingue", tree: "Arbre de choix", gauge: "Jauge", curve: "Courbe", bars: "Barres", clock: "Horloge", loop: "Boucle", canvas: "Grille", matrix: "Matrice", crowd: "Foule", balance: "Balance", mirror: "Miroir", memory: "Mémoire", stack: "Briques", star: "Étoile", noise: "Bruit", progress: "Progression", spotlight: "Projecteur", tag: "Étiquette de prix", journey: "Parcours", bubbles: "Bulles", layers: "Couches", network: "Réseau", book: "Livre", article: "Article", monogram: "Initiales" };
  const base = $("base"), motif = $("motif"), nom = $("nom"), img = $("img"), dl = $("dl"), msg = $("msg"), auto = $("auto");
  Object.entries(BASES).forEach(([k, v]) => base.add(new Option(v, k)));
  motif.add(new Option("Automatique (d'après le titre)", ""));
  Covers.MOTIFS.slice().sort((a, b) => (MOTIFS[a] || a).localeCompare(MOTIFS[b] || b, "fr")).forEach(m => motif.add(new Option(MOTIFS[m] || m, m)));
  base.value = "biblio";

  let svg = "", token = 0;
  async function render() {
    const t = ++token, n = nom.value.trim();
    if (!n) { img.removeAttribute("src"); dl.disabled = true; auto.textContent = ""; svg = ""; return; }
    const r = await Covers.draw({ nom: n, base: base.value, motif: motif.value || undefined });
    if (t !== token) return;
    svg = r.svg; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); dl.disabled = false;
    auto.textContent = motif.value ? "" : "Motif choisi : " + (MOTIFS[r.motif] || r.motif) + ".";
    msg.textContent = "";
  }
  [nom, base, motif].forEach(el => el.addEventListener("input", render));

  dl.addEventListener("click", () => {
    if (!svg) return;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = Covers.W; c.height = Covers.H;
      c.getContext("2d").drawImage(im, 0, 0, Covers.W, Covers.H);
      c.toBlob(b => {
        const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = (Covers.slug(nom.value) || "cover") + ".png";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        msg.textContent = "Image téléchargée : " + a.download;
      }, "image/png");
    };
    im.onerror = () => { msg.textContent = "L'image n'a pas pu être créée. Réessaie."; };
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
})();
