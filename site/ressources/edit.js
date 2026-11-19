/* Fiches modifiables DataUX.
   Rend les zones vides de la fiche modifiables (à taille fixe : une case ne grandit jamais),
   les cases à cocher cliquables, garde la saisie dans le navigateur (localStorage)
   et permet d'enregistrer une image PNG. Rien n'est envoyé à un serveur. */
(function () {
  "use strict";
  var root = document.querySelector(".root");
  if (!root) return;
  var KEY = "dataux-fiche:" + location.pathname;
  var NB = /[\s ​]/g;
  var eds = [], checks = [], tlLines = [];

  function empty(el) { return el.textContent.replace(NB, "") === ""; }
  function leaf(el) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.tagName !== "BR") return false;
    return true;
  }
  function mk(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  // Fond « surface » (beige) : case d'intitulé, jamais modifiable
  function isLabelCell(el) {
    var bg = getComputedStyle(el).backgroundColor;
    var m = bg.match(/\d+/g);
    return m && m.length >= 3 && !(m[0] == 255 && m[1] == 255 && m[2] == 255) && (m.length < 4 || +m[3] > 0);
  }

  /* 0. Calculs automatiques (ICE, RICE, Kano) : repérer les colonnes et verrouiller les cases calculées */
  var calc = null;
  function txt(el) { return (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase(); }
  root.querySelectorAll("table").forEach(function (t) {
    if (calc || t.closest(".sq")) return;
    var head = t.querySelector("thead tr"); if (!head) return;
    var cols = Array.prototype.map.call(head.children, txt);
    function col(word) { for (var i = 0; i < cols.length; i++) if (cols[i].indexOf(word) === 0) return i; return -1; }
    var rows = Array.prototype.slice.call(t.querySelectorAll("tbody tr"));
    var c;
    if (col("reach") >= 0 && col("effort") >= 0) c = { kind: "rice", r: col("reach"), i: col("impact"), c: col("confidence"), e: col("effort"), s: col("score"), k: col("rang") };
    else if (col("impact") >= 0 && col("facilité") >= 0) c = { kind: "ice", i: col("impact"), c: col("confiance"), f: col("facilité"), s: col("score"), k: col("rang") };
    else if (col("si elle était présente") >= 0 && col("résultat") >= 0) c = { kind: "kano", p: col("si elle était présente"), a: col("si elle était absente"), s: col("résultat") };
    if (!c) return;
    c.rows = rows;
    rows.forEach(function (tr) {
      [c.s, c.k].forEach(function (i) { var td = tr.children[i]; if (i >= 0 && td) { td.setAttribute("data-calc", ""); td.classList.add("calc"); } });
    });
    calc = c;
  });
  // SUS : points de chaque ligne, sous-totaux et score sur 100 calculés depuis les ronds cochés
  var sus = /questionnaire-sus/.test(location.pathname) ? Array.prototype.slice.call(root.querySelectorAll(".big tbody tr")) : null;
  if (sus) {
    sus.forEach(function (tr) { var td = tr.children[3]; if (td) { td.setAttribute("data-calc", ""); td.classList.add("calc"); } });
    root.querySelectorAll(".cl i, .big-score i").forEach(function (i) { i.setAttribute("data-calc", ""); });
  }
  function recalcSus() {
    var odd = 0, even = 0, all = true;
    sus.forEach(function (tr, ri) {
      var dots = Array.prototype.slice.call(tr.querySelectorAll(".o > i")), k = -1;
      dots.forEach(function (d, i) { if (d.getAttribute("aria-checked") === "true") k = i; });
      var pts = k < 0 ? null : (ri % 2 === 0 ? k : 4 - k);
      if (pts === null) all = false; else if (ri % 2 === 0) odd += pts; else even += pts;
      put(tr.children[3], pts === null ? "" : String(pts));
    });
    var boxes = root.querySelectorAll(".cl i, .big-score i");
    var vals = all ? [odd, even, odd + even, fr((odd + even) * 2.5)] : ["", "", "", ""];
    Array.prototype.forEach.call(boxes, function (b, i) { put(b, String(vals[i])); });
    // Curseur sur le dégradé : où se situe le score
    var g = root.querySelector(".gauge");
    if (g) {
      var m = g.querySelector(".gmark"); if (!m) { m = mk("i", "gmark"); g.appendChild(m); }
      m.hidden = !all; if (all) m.style.left = ((odd + even) * 2.5) + "%";
    }
  }
  function num(el) {
    var e = el && el.querySelector("[data-ed]"); if (!e) return null;
    var s = e.textContent.replace(/\s| /g, "");
    if (s === "") return null;
    var pct = /%$/.test(s); s = s.replace(/%$/, "").replace(",", ".");
    var n = /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
    return { n: n, pct: pct, el: e };
  }
  function bad(v, ok) { if (!v) return; v.el.classList.toggle("bad", !ok); }
  function fr(n) { return (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toString().replace(".", ","); }
  function put(td, value) { if (!td) return; var s = td.querySelector(".calc-v"); if (!s) { s = mk("span", "calc-v"); td.innerHTML = ""; td.appendChild(s); } s.textContent = value; }
  var KANO = { M: "Obligatoire", O: "Performance", A: "Attractive", I: "Indifférente", R: "Rejetée", Q: "Douteuse" };
  function recalc() {
    if (sus) recalcSus();
    if (typeof recalcMore === "function") recalcMore();
    if (!calc) return;
    var scores = [];
    calc.rows.forEach(function (tr, ri) {
      var td = tr.children, score = null;
      if (calc.kind === "ice") {
        var vi = num(td[calc.i]), vc = num(td[calc.c]), vf = num(td[calc.f]);
        [vi, vc, vf].forEach(function (v) { bad(v, v && v.n >= 1 && v.n <= 10); });
        if ([vi, vc, vf].every(function (v) { return v && v.n >= 1 && v.n <= 10; })) score = vi.n * vc.n * vf.n;
      } else if (calc.kind === "rice") {
        var r = num(td[calc.r]), im = num(td[calc.i]), co = num(td[calc.c]), ef = num(td[calc.e]);
        var cv = co ? (co.pct || co.n > 1 ? co.n / 100 : co.n) : null;
        bad(r, r && r.n >= 0); bad(im, im && im.n > 0 && im.n <= 3); bad(co, co && cv > 0 && cv <= 1); bad(ef, ef && ef.n > 0);
        if (r && im && co && ef && r.n >= 0 && im.n > 0 && im.n <= 3 && cv > 0 && cv <= 1 && ef.n > 0) score = r.n * im.n * cv / ef.n;
      } else if (calc.kind === "kano") {
        var pick = function (cell) {
          var on = cell ? Array.prototype.slice.call(cell.querySelectorAll("[data-ck]")) : [];
          for (var i = 0; i < on.length; i++) if (on[i].getAttribute("aria-checked") === "true") return i;
          return -1;
        };
        var p = pick(td[calc.p]), a = pick(td[calc.a]), out = "";
        var grid = root.querySelector(".sq tbody");
        if (p >= 0 && a >= 0 && grid && grid.rows[p] && grid.rows[p].cells[a + 1]) {
          var l = grid.rows[p].cells[a + 1].textContent.trim();
          out = l + (KANO[l] ? " · " + KANO[l] : "");
        }
        put(td[calc.s], out);
        return;
      }
      scores.push({ ri: ri, s: score });
      put(td[calc.s], score === null ? "" : fr(score));
    });
    if (calc.k >= 0) scores.forEach(function (x) {
      var rank = x.s === null ? "" : 1 + scores.filter(function (y) { return y.s !== null && y.s > x.s; }).length;
      put(calc.rows[x.ri].children[calc.k], String(rank));
    });
  }

  /* 0 bis. Parcours : bande « Émotions » (lignes à cellule fusionnée) réservée aux émojis */
  var emoBand = [];
  root.querySelectorAll("td.n").forEach(function (td) {
    if (txt(td) !== "émotions") return;
    var tr = td.parentElement, rows = [tr.previousElementSibling, tr, tr.nextElementSibling];
    rows.forEach(function (r) {
      if (r && r.querySelector("td[colspan]")) { emoBand.push(r); r.querySelectorAll("td[colspan]").forEach(function (c) { c.setAttribute("data-calc", ""); }); }
    });
  });

  /* 1. Préparation : transformer les gabarits texte en champs */

  // a. Traits de soulignement « ____ » : l'élément entier ou chaque série devient un champ
  root.querySelectorAll("*").forEach(function (el) {
    if (el.closest("[data-under]")) return;
    var t = el.textContent.replace(NB, "");
    if (t && /^_+$/.test(t) && !el.closest("h1, h2")) {
      el.setAttribute("data-under", ""); el.innerHTML = "";
      el.classList.add("ed-line-block");
      markLine(el);
    }
  });
  var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), tn = [];
  while (tw.nextNode()) if (/_{3,}/.test(tw.currentNode.nodeValue)) tn.push(tw.currentNode);
  tn.forEach(function (t) {
    var frag = document.createDocumentFragment();
    t.nodeValue.split(/(_{3,})/).forEach(function (part) {
      if (/^_{3,}$/.test(part)) {
        var s = mk("span", "ed-under"); s.style.width = Math.max(40, part.length * 5) + "px";
        markLine(s); frag.appendChild(s);
      } else if (part) frag.appendChild(document.createTextNode(part));
    });
    t.parentNode.replaceChild(frag, t);
  });

  // a1. Pas de trait sous les champs, une indication à la place (« Prénom », « ______ »)
  root.classList.add("ed-noline");
  var persona = /persona/.test(location.pathname);
  root.querySelectorAll(".ed-line-block").forEach(function (el) { if (persona) el.setAttribute("data-hint", "Prénom"); });

  // a2. Benchmark : noms des colonnes (« Notre produit », « Concurrent A »…) modifiables, en-tête sur une ligne
  if (/benchmark/.test(location.pathname)) root.querySelectorAll("thead th").forEach(function (th) {
    th.querySelectorAll("br").forEach(function (br) { br.remove(); });
    var t = th.textContent.replace(/\s+/g, " ").trim();
    if (/^(Notre produit|Concurrent [A-Z])$/.test(t)) { th.setAttribute("data-hint", t); th.classList.add("ed-th"); markLine(th); }
  });

  // b. Lignes « En tant que <br>je veux <br>… » : un champ à la suite de chaque début de phrase
  root.querySelectorAll(".z div").forEach(function (el) {
    if (!el.childNodes.length || el.closest("h2")) return;
    var onlyText = Array.prototype.every.call(el.childNodes, function (n) { return n.nodeType === 3 || n.tagName === "BR"; });
    if (!onlyText || !el.querySelector("br")) return;
    var lines = el.innerHTML.split(/<br\s*\/?>/i).map(function (l) { return l.replace(/&nbsp;/g, " ").trim(); }).filter(Boolean);
    if (lines.length < 2) return;
    el.innerHTML = "";
    lines.forEach(function (l) {
      var row = mk("div", "ed-row"), lab = mk("span"), f = mk("span", "ed-under ed-grow");
      lab.textContent = l + " "; row.appendChild(lab); row.appendChild(f); el.appendChild(row); markLine(f);
    });
  });

  // c. Citation « … » : un champ entre les guillemets
  root.querySelectorAll("*").forEach(function (el) {
    if (el.children.length === 0 && el.textContent.trim() === "«") {
      var f = mk("div", "ed-quote"); el.appendChild(f); markBlock(f);
    }
  });

  /* 2. Cases à cocher et pastilles */
  root.querySelectorAll(".cb > i").forEach(function (i) { addCheck(i, ""); });
  root.querySelectorAll(".pill").forEach(function (p) { addCheck(p, "pill"); });
  // Petits ronds d'une échelle (ex. Aisance numérique du persona)
  root.querySelectorAll(".z i").forEach(function (i) {
    var s = i.getAttribute("style") || "";
    if (/border-radius:\s*50%/.test(s) && /width:\s*11px/.test(s)) { addCheck(i, ""); i.setAttribute("data-radio", ""); }
  });
  // Fiches 2027 : ronds d'échelle (un choix par ligne), cases à cocher, oui/non, garder/exclure, gommettes de vote
  root.querySelectorAll(".os .o > i, .yn > i, .ge i").forEach(function (i) { addCheck(i, ""); i.setAttribute("data-radio", ""); });
  var PATH = location.pathname;
  var TRI = /etats-d-un-ecran/.test(PATH), RGAA = /checklist-accessibilite/.test(PATH);
  // États d'un écran : les cases ont trois états (gérés plus bas) ; RGAA : oui / non / N/A exclusifs sur une ligne
  root.querySelectorAll(TRI ? ".dotv > i" : "i.box, .dotv > i").forEach(function (i) { addCheck(i, ""); if (RGAA && i.matches("i.box")) i.setAttribute("data-radio", "tr"); });
  // Pastilles groupées (garder / revoir…, direct / indirect / échec…) : un seul choix
  root.querySelectorAll(".pills > .pill[data-ck]").forEach(function (p) { p.setAttribute("data-radio", ""); });
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), texts = [];
  while (walker.nextNode()) if (/[☐○]/.test(walker.currentNode.nodeValue)) texts.push(walker.currentNode);
  texts.forEach(function (t) {
    var frag = document.createDocumentFragment();
    t.nodeValue.split(/([☐○])/).forEach(function (part) {
      if (part === "☐" || part === "○") { var s = mk("span"); s.textContent = part; addCheck(s, part); frag.appendChild(s); }
      else if (part) frag.appendChild(document.createTextNode(part));
    });
    t.parentNode.replaceChild(frag, t);
  });
  function addCheck(el, kind) {
    el.setAttribute("data-ck", kind); el.setAttribute("role", "checkbox"); el.setAttribute("tabindex", "0"); el.setAttribute("aria-checked", "false");
    function toggle() {
      var on = el.getAttribute("aria-checked") !== "true";
      // Kano : une seule réponse par question
      var grp = calc && calc.kind === "kano" && el.closest(".cbl");
      if (on && grp) grp.querySelectorAll("[data-ck]").forEach(function (o) { if (o !== el) setCheck(o, false); });
      // Échelle à ronds (aisance numérique) : un seul choix
      if (on && el.hasAttribute("data-radio")) ((el.getAttribute("data-radio") === "tr" ? el.closest("tr") : el.closest(".os, .yn, .ge, .pills")) || el.parentElement).querySelectorAll("[data-radio]").forEach(function (o) { if (o !== el) setCheck(o, false); });
      setCheck(el, on); save();
    }
    el.addEventListener("click", toggle);
    el.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } });
    checks.push(el);
  }
  function setCheck(el, on) {
    var k = el.getAttribute("data-ck");
    if (k === "☐") el.textContent = on ? "☒" : "☐";
    else if (k === "○") el.textContent = on ? "●" : "○";
    else el.classList.toggle("on", on);
    el.setAttribute("aria-checked", on ? "true" : "false");
  }

  /* 2 bis. Fiches 2027 : réglages propres à certaines fiches */
  function rowsOf(t) { return t && t.tBodies[0] ? Array.prototype.slice.call(t.tBodies[0].rows) : []; }
  function lockCalc(el) { if (!el) return; el.setAttribute("data-calc", ""); if (el.tagName === "TD") el.classList.add("calc"); }
  // « ____ » des phrases à compléter (Jobs to be done, Énoncé du problème) : indication grise, pas de trait
  root.querySelectorAll(".pov u").forEach(function (u) { u.classList.add("ed-under"); });
  // Grille de vote : total = A + B + C
  var voteRows = /grille-de-vote/.test(PATH) ? rowsOf(root.querySelector("table")) : null;
  if (voteRows) voteRows.forEach(function (tr) { lockCalc(tr.children[6]); });
  // Test d'arbre : réussites directes, indirectes et échecs comptés
  var arbre = /test-d-arbre/.test(PATH) ? { rows: rowsOf(root.querySelector("table")), out: Array.prototype.slice.call(root.querySelectorAll(".leg u.w")) } : null;
  if (arbre) arbre.out.forEach(lockCalc);
  // Checklist accessibilité : taux = oui ÷ (oui + non)
  var rgaa = RGAA ? { rows: rowsOf(root.querySelector("table")), out: root.querySelector(".leg u.w") } : null;
  if (rgaa) lockCalc(rgaa.out);
  // Rapport de test : ✓ ~ ✗ choisis dans un menu, réussite calculée
  var marks = [], markPick = null;
  var rapport = /rapport-de-test/.test(PATH) ? rowsOf(root.querySelector("table")) : null;
  function setMark(b, v) { b.textContent = v || ""; b.setAttribute("data-v", v || ""); b.setAttribute("aria-label", v ? "Résultat " + v + ", changer" : "Choisir un résultat"); }
  function closeMarks() { if (markPick) { markPick.remove(); markPick = null; } }
  // Case à choix dans un menu (✓ ~ ✗ du rapport de test, niveaux 0 à 4 de la matrice de compétences)
  function pickerCell(td, opts) {
    var b = mk("button", "mk"); b.type = "button";
    td.setAttribute("data-calc", ""); td.appendChild(b); setMark(b, ""); marks.push(b);
    b.addEventListener("click", function (e) {
      e.stopPropagation(); closeMarks();
      markPick = mk("div", "emo-pick mk-pick");
      opts.concat([["", "Effacer"]]).forEach(function (o) {
        var x = mk("button", o[0] ? "" : "clr"); x.type = "button"; x.textContent = o[0] ? o[0] + " " + o[1] : o[1];
        x.addEventListener("click", function () { setMark(b, o[0]); closeMarks(); save(); b.focus(); });
        markPick.appendChild(x);
      });
      var r = b.getBoundingClientRect();
      markPick.style.left = (r.left + window.scrollX) + "px"; markPick.style.top = (r.bottom + 4 + window.scrollY) + "px";
      document.body.appendChild(markPick); markPick.querySelector("button").focus();
    });
  }
  var matrice = /matrice-de-competences/.test(PATH) ? rowsOf(root.querySelector(".mc table")) : null;
  if (rapport || matrice) {
    document.addEventListener("click", function (e) { if (markPick && !markPick.contains(e.target)) closeMarks(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMarks(); });
  }
  if (rapport) rapport.forEach(function (tr) {
    for (var c = 1; c < tr.children.length - 1; c++) pickerCell(tr.children[c], [["✓", "réussi"], ["~", "avec aide"], ["✗", "échec"]]);
    lockCalc(tr.lastElementChild.querySelector(".pct"));
  });
  if (matrice) matrice.forEach(function (tr, ri) {
    for (var c = 1; c < tr.children.length - 1; c++) pickerCell(tr.children[c], [["0", "aucune"], ["1", "notions"], ["2", "autonome"], ["3", "confirmé"], ["4", "référent"]]);
    if (ri === matrice.length - 1) lockCalc(tr.lastElementChild);
  });
  // États d'un écran : chaque case passe de vide à « fait », « à faire », « sans objet »
  var tris = [], TRI_S = ["", "oui", "non", "na"], TRI_L = { "": "Pas renseigné", oui: "Fait", non: "À faire", na: "Sans objet" };
  function setTri(i, s) { i.setAttribute("data-s", s); i.setAttribute("aria-label", TRI_L[s]); i.setAttribute("title", TRI_L[s]); }
  if (TRI) root.querySelectorAll("i.box").forEach(function (i) {
    i.setAttribute("role", "button"); i.setAttribute("tabindex", "0"); setTri(i, "");
    function next() { setTri(i, TRI_S[(TRI_S.indexOf(i.getAttribute("data-s")) + 1) % 4]); save(); }
    i.addEventListener("click", next);
    i.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); next(); } });
    tris.push(i);
  });
  // Inventaire de l'interface : le code hexadécimal colore la pastille
  function swatches() {
    root.querySelectorAll(".sw > div").forEach(function (d) {
      var i = d.querySelector("i"), e = d.querySelector("[data-ed]"); if (!i || !e) return;
      var v = e.textContent.trim().replace(/^#?/, "#");
      i.style.background = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : "";
    });
  }
  function selIdx(el, s) { var o = el ? el.querySelectorAll(s) : []; for (var i = 0; i < o.length; i++) if (o[i].getAttribute("aria-checked") === "true") return i; return -1; }
  function recalcMore() {
    if (voteRows) voteRows.forEach(function (tr) {
      var t = 0, n = 0;
      [3, 4, 5].forEach(function (c) { var k = selIdx(tr.children[c], ".o > i"); if (k >= 0) { t += k + 1; n++; } });
      put(tr.children[6], n ? String(t) : "");
    });
    if (arbre) {
      var cnt = [0, 0, 0];
      arbre.rows.forEach(function (tr) { var k = selIdx(tr, ".pill"); if (k >= 0 && k < 3) cnt[k]++; });
      arbre.out.forEach(function (u, i) { put(u, String(cnt[i])); });
    }
    if (rgaa && rgaa.out) {
      var oui = 0, non = 0;
      rgaa.rows.forEach(function (tr) { var b = tr.querySelectorAll("i.box"); if (b[0] && b[0].getAttribute("aria-checked") === "true") oui++; if (b[1] && b[1].getAttribute("aria-checked") === "true") non++; });
      put(rgaa.out, oui + non ? String(Math.round(oui * 100 / (oui + non))) : "");
    }
    if (rapport) rapport.forEach(function (tr) {
      var ok = 0, n = 0;
      tr.querySelectorAll(".mk").forEach(function (b) { var v = b.getAttribute("data-v"); if (v) { n++; if (v === "✓") ok++; } });
      var p = tr.lastElementChild.querySelector(".pct"); if (p) put(p, n ? String(Math.round(ok * 100 / n)) : "");
    });
    swatches();
    if (ECO) drawLinks();
  }

  /* 3. Zones de saisie */
  // Zone sans aucun champ : on lui ajoute une zone d'écriture
  function zoneHasField(z) { return z.querySelector(".lo, td, .card, .bx, [data-ed], [data-line], .ed-quote, .ed-under, table"); }
  // Texte propre à la zone, hors titre et hors consigne : s'il y en a, la zone est déjà remplie (ex. Relances)
  function zoneText(z) {
    var c = z.cloneNode(true);
    c.querySelectorAll("h2, p").forEach(function (n) { n.remove(); });
    return c.textContent.replace(NB, "");
  }
  root.querySelectorAll(".z").forEach(function (z) {
    // Frise (largeur 75 %) : l'espace libre à droite sert aux livrables
    var tl = z.querySelector(':scope > div[style*="width:75%"]');
    if (tl) { var side = mk("div", "ed-side"); z.appendChild(side); markBlock(side); }
    if (tl) tlLines.push(tl);
    // Matrice Impact/effort : on y pose des post-its, pas de zone d'écriture
    if (!tl && !zoneHasField(z) && !zoneText(z) && !/matrice-impact-effort/.test(location.pathname)) { var lo = mk("div", "lo"); z.appendChild(lo); }
  });
  var SMALL = ".fld i, .ft .d i, u, .ini i, .kv i, .tl i, .nl i, .pct, .hl2";
  root.querySelectorAll("*").forEach(function (el) {
    if (el.hasAttribute("data-ck") || el.hasAttribute("data-ed") || el.hasAttribute("data-line") || el.closest("[data-ed], [data-line], h1, h2, [data-ck], [data-calc], svg") || el.matches(".sw i, i.box[data-s]")) return;
    if (el.matches(SMALL)) { if (empty(el)) markLine(el); return; }
    var ok = false;
    if (el.matches(".bx, .card.d, .card, .lo")) ok = !el.querySelector("[data-ck]") && (el.matches(".bx, .card.d, .lo") || empty(el));
    else if (leaf(el) && empty(el) && (!el.matches(".n") || emptyFirstCol(el)) && !el.matches("i[style*='border-radius:50%'], i[style*='border-radius: 50%']")) {
      var r = el.getBoundingClientRect();
      ok = r.width >= 30 && r.height >= 14;
    }
    // Beige = intitulé, sauf première colonne vide et ligne « Besoin de l'équipe » de la matrice de compétences
    if (ok && el.matches("td, th") && isLabelCell(el) && !emptyFirstCol(el) && !el.closest(".mc")) ok = false;
    if (ok) markBlock(el);
  });

  // Première colonne beige vide sous un titre de colonne (Tâche, Écran, Idée, Personne…) : à remplir, pas un intitulé
  function emptyFirstCol(td) {
    if (!td.matches("td.n") || !empty(td) || td.cellIndex !== 0) return false;
    var t = td.closest("table"), h = t && t.tHead && t.tHead.rows[0];
    return !!(h && h.cells[0] && h.cells[0].textContent.replace(NB, "") !== "");
  }
  function markLine(el) { el.setAttribute("data-line", ""); }
  function markBlock(el) { el.setAttribute("data-box", ""); }

  /* 4. Figer les tailles (après chargement des polices) puis activer la saisie */
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () {
    var boxes = Array.prototype.slice.call(root.querySelectorAll("[data-box], [data-line]"));
    // Mesurer d'abord, modifier ensuite : la mise en page ne bouge pas pendant la mesure
    var sizes = boxes.map(function (el) {
      var cs = getComputedStyle(el);
      return { w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
               h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) };
    });
    // Zones basses (bandeau) : la saisie se place à droite du titre
    boxes.forEach(function (el, i) {
      var z = el.closest(".z");
      if (el.classList.contains("lo") && z && z.clientHeight < 60) {
        var h2 = z.querySelector("h2");
        el.classList.add("ed-band");
        el.style.left = ((h2 ? h2.getBoundingClientRect().right - z.getBoundingClientRect().left : 0) + 10) + "px";
        // Consigne de la zone (ex. « Facilité ressentie de 1 à 7… ») : devient l'indication du champ
        var p = z.querySelector(":scope > p");
        if (p) { el.setAttribute("data-hint", p.textContent.replace(/\s+/g, " ").trim()); p.style.display = "none"; }
        sizes[i].h = z.clientHeight - 10;
      }
    });
    boxes.forEach(function (el, i) {
      var line = el.hasAttribute("data-line");
      var w = mk("div", "ed" + (line ? " ed-l" : ""));
      // Dans une case de tableau, 2 px de marge : sinon les arrondis s'additionnent et la dernière ligne déborde
      if (!line) w.style.height = Math.max(12, Math.floor(sizes[i].h) - (el.tagName === "TD" ? 2 : 0)) + "px";
      if (el.classList.contains("lo")) { el.style.flex = "none"; el.style.height = Math.max(12, Math.floor(sizes[i].h)) + "px"; el.style.minHeight = "0"; }
      // Texte d'aide déjà présent (« Passer de… à… », « Comment pourrions-nous… ? ») : affiché en indication
      var hint = el.getAttribute("data-hint") || el.innerText.replace(/\s+/g, " ").trim();
      // Champ souligné sans indication : une ligne de « ____ » grise remplace le trait
      if (!hint && el.matches(".ed-under, .ed-line-block")) hint = new Array(300).join("_");
      if (hint) w.setAttribute("data-ph", hint);
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(w);
      w.setAttribute("contenteditable", "true"); w.setAttribute("spellcheck", "true"); w.setAttribute("data-ed", "");
      if (line) w.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
      w.addEventListener("input", save);
      w.addEventListener("paste", function (e) {
        e.preventDefault();
        var t = (e.clipboardData || window.clipboardData).getData("text/plain");
        if (line) t = t.replace(/\s*\n\s*/g, " ");
        document.execCommand("insertText", false, t);
      });
      eds.push(w);
    });
    // Fiches 2027 : toute case de tableau qu'on ne peut ni écrire ni cocher passe en beige, comme sur les anciennes fiches
    if (/(questionnaire-sus|formulaire-de-consentement|questionnaire-de-recrutement|rapport-de-test|test-d-arbre|inventaire-de-contenus|enonce-du-probleme|jobs-to-be-done|carte-des-hypotheses|carte-de-l-ecosysteme|experience-map|grille-de-vote|etats-d-un-ecran|inventaire-de-l-interface|checklist-accessibilite|grille-de-critique|ton-et-voix|cartographie-des-parties-prenantes|matrice-de-competences|sprint-canvas)\.html$/.test(PATH))
      root.querySelectorAll("td").forEach(function (td) {
        if (td.classList.contains("calc") || td.hasAttribute("colspan") || td.querySelector("[data-ed], [data-ck], .mk, i.box[data-s], .calc-v")) return;
        td.classList.add("ro");
      });
    root.style.position = "relative";
    setupEmos();
    setupJals();
    restore();
    recalc();
  });

  /* 4 bis. Émojis du parcours et post-its de la Matrice */
  var emos = [], notes = [], notesLayer = null;
  // Bande du haut : émotions positives ; milieu : neutres ; bas : négatives
  var EMOJIS = [["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂", "😉", "😌", "😇", "😋", "😎", "🤓", "🤗", "🥰", "😍", "🤩", "😘", "🥳", "❤️", "👍"], ["😐", "😑", "😶", "🤔", "🧐", "🤨", "🙄", "😏", "😬", "😮", "😯", "😲", "😳", "😴", "🥱", "😪", "😮‍💨", "🤷"], ["😕", "😟", "🙁", "☹️", "😔", "😒", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "😤", "😠", "😡", "🤬", "🤢", "🤮", "😵‍💫", "🤯", "💔", "👎"]];
  var picker = null;
  function closePicker() { if (picker) { picker.remove(); picker = null; } }
  document.addEventListener("click", function (e) { if (picker && !picker.contains(e.target) && !e.target.closest(".emo")) closePicker(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePicker(); });
  function setEmo(slot, v) { slot.textContent = v || ""; slot.classList.toggle("set", !!v); slot.setAttribute("aria-label", v ? "Émotion " + v + ", changer" : "Choisir une émotion"); }
  function setupEmos() {
    if (!emoBand.length) return;
    var head = root.querySelector("thead tr"); if (!head) return;
    var rr = root.getBoundingClientRect();
    // Trois bandes (haut, milieu, bas) : un emplacement par étape dans chacune
    emoBand.forEach(function (band, bi) {
    var br = band.getBoundingClientRect(), top = br.top - rr.top, bot = br.bottom - rr.top;
    Array.prototype.slice.call(head.children, 1).forEach(function (th) {
      var r = th.getBoundingClientRect();
      var slot = mk("button", "emo"); slot.type = "button"; slot.setAttribute("data-band", Math.min(bi, 2));
      slot.style.left = (r.left - rr.left) + "px"; slot.style.width = r.width + "px";
      slot.style.top = top + "px"; slot.style.height = (bot - top) + "px";
      setEmo(slot, "");
      slot.addEventListener("click", function (e) {
        e.stopPropagation(); closePicker();
        picker = mk("div", "emo-pick"); picker.setAttribute("role", "listbox");
        var list = emoBand.length === 3 ? EMOJIS[+slot.getAttribute("data-band")] : EMOJIS[0].concat(EMOJIS[1], EMOJIS[2]);
        list.concat([""]).forEach(function (em) {
          var b = mk("button"); b.type = "button"; b.textContent = em || "Effacer"; if (!em) b.className = "clr";
          b.addEventListener("click", function () { setEmo(slot, em); closePicker(); save(); slot.focus(); });
          picker.appendChild(b);
        });
        var sr = slot.getBoundingClientRect();
        picker.style.left = Math.max(8, sr.left + sr.width / 2 - 165 + window.scrollX) + "px";
        picker.style.top = (sr.bottom + 4 + window.scrollY) + "px";
        document.body.appendChild(picker);
        picker.querySelector("button").focus();
      });
      root.appendChild(slot); emos.push(slot);
    });
    });
  }
  // Post-its : Matrice Impact/effort (idées) et Carte de l'écosystème (acteurs posés sur les cercles)
  var ECO = /carte-de-l-ecosysteme/.test(location.pathname);
  var NOTES = ECO || /matrice-impact-effort/.test(location.pathname);
  function addNote(d) {
    d = d || { x: 120 + notes.length * 14 % 140, y: 140 + notes.length * 14 % 140, t: "" };
    var n = mk("div", "pi"); n.style.left = d.x + "px"; n.style.top = d.y + "px";
    var grip = mk("div", "pi-grip"); grip.setAttribute("aria-hidden", "true");
    var del = mk("button", "pi-del"); del.type = "button"; del.textContent = "×"; del.setAttribute("aria-label", "Supprimer ce post-it");
    var t = mk("div", "pi-t"); t.setAttribute("contenteditable", "true"); t.setAttribute("data-ph", ECO ? "Acteur…" : "Idée…"); t.className = "pi-t ed"; t.innerHTML = d.t || "";
    n.appendChild(grip); n.appendChild(del); n.appendChild(t); root.appendChild(n);
    if (ECO) {
      n.classList.add("pi-eco");
      var ln = mk("button", "pi-link"); ln.type = "button"; ln.textContent = "⟷"; ln.setAttribute("aria-label", "Relier cet acteur à un autre");
      ln.addEventListener("click", function () { linkFrom(n); });
      n.appendChild(ln);
    }
    del.addEventListener("click", function () {
      links.filter(function (l) { return l.a === n || l.b === n; }).forEach(removeLink);
      notes.splice(notes.indexOf(n), 1); n.remove(); save();
    });
    t.addEventListener("input", save);
    t.addEventListener("paste", function (e) { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); });
    grip.addEventListener("pointerdown", function (e) {
      e.preventDefault(); grip.setPointerCapture(e.pointerId);
      var sx = e.clientX, sy = e.clientY, ox = n.offsetLeft, oy = n.offsetTop;
      function mv(ev) {
        n.style.left = Math.min(root.clientWidth - n.offsetWidth, Math.max(0, ox + ev.clientX - sx)) + "px";
        n.style.top = Math.min(root.clientHeight - n.offsetHeight, Math.max(0, oy + ev.clientY - sy)) + "px";
        drawLinks();
      }
      function up() { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); save(); }
      grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up);
    });
    notes.push(n); return n;
  }

  /* Liens entre acteurs (Carte de l'écosystème) : ⟷ sur un acteur, puis ⟷ sur un autre.
     Un clic sur un lien change son type (échange → lien faible → tension), un 4e clic le supprime. */
  var links = [], linkSvg = null, linkStart = null, LINK_T = ["Échange", "Lien faible", "Tension"];
  function linkLayer() {
    if (linkSvg) return linkSvg;
    linkSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); linkSvg.setAttribute("class", "links");
    linkSvg.innerHTML = '<defs><marker id="lk-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8f867e"/></marker></defs>';
    root.appendChild(linkSvg); return linkSvg;
  }
  function centre(n) { return { x: n.offsetLeft + n.offsetWidth / 2, y: n.offsetTop + n.offsetHeight / 2 }; }
  function drawLinks() {
    links.forEach(function (l) {
      var a = centre(l.a), b = centre(l.b);
      l.el.setAttribute("x1", a.x); l.el.setAttribute("y1", a.y); l.el.setAttribute("x2", b.x); l.el.setAttribute("y2", b.y);
      l.hit.setAttribute("x1", a.x); l.hit.setAttribute("y1", a.y); l.hit.setAttribute("x2", b.x); l.hit.setAttribute("y2", b.y);
      l.el.setAttribute("class", "lk lk-" + l.t); if (l.t === 0) l.el.setAttribute("marker-end", "url(#lk-ar)"); else l.el.removeAttribute("marker-end");
      l.hit.querySelector("title").textContent = LINK_T[l.t] + " · cliquer pour changer";
    });
  }
  function addLink(a, b, t) {
    var svg = linkLayer(), NS = "http://www.w3.org/2000/svg";
    var el = document.createElementNS(NS, "line"), hit = document.createElementNS(NS, "line"), ti = document.createElementNS(NS, "title");
    hit.setAttribute("class", "lk-hit"); hit.appendChild(ti); svg.appendChild(el); svg.appendChild(hit);
    var l = { a: a, b: b, t: t || 0, el: el, hit: hit };
    hit.addEventListener("click", function () { if (l.t >= 2) removeLink(l); else { l.t++; drawLinks(); } save(); });
    links.push(l); drawLinks(); return l;
  }
  function removeLink(l) { l.el.remove(); l.hit.remove(); links.splice(links.indexOf(l), 1); }
  function linkFrom(n) {
    if (!linkStart) { linkStart = n; n.classList.add("pi-sel"); return; }
    var a = linkStart; a.classList.remove("pi-sel"); linkStart = null;
    if (a !== n && !links.some(function (l) { return (l.a === a && l.b === n) || (l.a === n && l.b === a); })) { addLink(a, n, 0); save(); }
  }

  /* 4 ter. Photo du persona : import d'une image ou avatar généré (DiceBear Notionists, CC0) */
  var photoEl = null, photo = null, phPanel = null;
  root.querySelectorAll("div").forEach(function (d) {
    var st = d.getAttribute("style") || "";
    if (!photoEl && /border-radius:\s*50%/.test(st) && /width:\s*84px/.test(st)) photoEl = d;
  });
  var AV_KEYS = [["hair", "Cheveux"], ["eyes", "Yeux"], ["brows", "Sourcils"], ["nose", "Nez"], ["lips", "Bouche"], ["beard", "Barbe"], ["glasses", "Lunettes"], ["body", "Tenue"]];
  var OPTIONAL = { beard: 1, glasses: 1 };
  function loadAv(cb) {
    if (window.DataUXAvatar) return cb();
    var me = (document.querySelector('script[src*="edit.js"]') || { src: "" }).src, q = me.indexOf("?");
    var sc = mk("script"); sc.src = "vendor/avatar.js" + (q >= 0 ? me.slice(q) : "");
    sc.onload = cb; document.head.appendChild(sc);
  }
  function avList(k) { var l = window.DataUXAvatar.options[k].slice(); return OPTIONAL[k] ? [""].concat(l) : l; }
  function randAv() {
    var o = {};
    AV_KEYS.forEach(function (k) { var l = avList(k[0]); o[k[0]] = l[Math.floor(Math.random() * l.length)]; });
    if (Math.random() < .7) o.beard = ""; if (Math.random() < .7) o.glasses = "";
    return o;
  }
  function renderPhoto() {
    if (!photoEl) return;
    photoEl.innerHTML = "";
    if (!photo) { photoEl.textContent = "photo"; photoEl.classList.remove("ph-set"); return; }
    var src = photo.type === "img" ? photo.src : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(window.DataUXAvatar.svg(photo.o));
    var img = mk("img"); img.src = src; img.alt = "Photo du persona"; photoEl.appendChild(img); photoEl.classList.add("ph-set");
  }
  function closePh() { if (phPanel) { phPanel.remove(); phPanel = null; } }
  function openPh() {
    closePh();
    phPanel = mk("div", "ph-panel"); phPanel.setAttribute("role", "dialog"); phPanel.setAttribute("aria-label", "Photo du persona");
    var up = mk("button", "ph-up"); up.type = "button"; up.textContent = "Importer une photo";
    var file = mk("input"); file.type = "file"; file.accept = "image/*"; file.hidden = true;
    up.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () {
      var f = file.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var im = new Image();
        im.onload = function () {
          // Réduite à 320 px et recadrée en carré : légère à garder dans le navigateur
          var c = document.createElement("canvas"), z = 320, sd = Math.min(im.width, im.height);
          c.width = c.height = z;
          c.getContext("2d").drawImage(im, (im.width - sd) / 2, (im.height - sd) / 2, sd, sd, 0, 0, z, z);
          photo = { type: "img", src: c.toDataURL("image/jpeg", .85) }; renderPhoto(); save(); closePh();
        };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    phPanel.appendChild(up); phPanel.appendChild(file);
    var gen = mk("div", "ph-gen"); gen.innerHTML = '<p class="ph-h">Ou générer un avatar</p>';
    phPanel.appendChild(gen);
    loadAv(function () {
      if (!photo || photo.type !== "av") { photo = { type: "av", o: randAv() }; renderPhoto(); save(); }
      AV_KEYS.forEach(function (k) {
        var row = mk("div", "ph-row"), lab = mk("span"), prev = mk("button"), val = mk("span", "ph-val"), next = mk("button");
        lab.textContent = k[1]; prev.type = next.type = "button"; prev.textContent = "‹"; next.textContent = "›";
        prev.setAttribute("aria-label", k[1] + " précédent"); next.setAttribute("aria-label", k[1] + " suivant");
        function show() { var l = avList(k[0]), i = l.indexOf(photo.o[k[0]]); val.textContent = photo.o[k[0]] ? (i + (OPTIONAL[k[0]] ? 0 : 1)) + " / " + (l.length - (OPTIONAL[k[0]] ? 1 : 0)) : "aucun"; }
        function step(d) { var l = avList(k[0]), i = l.indexOf(photo.o[k[0]]); photo.o[k[0]] = l[(i + d + l.length) % l.length]; show(); renderPhoto(); save(); }
        prev.addEventListener("click", function () { step(-1); }); next.addEventListener("click", function () { step(1); });
        show(); row.appendChild(lab); row.appendChild(prev); row.appendChild(val); row.appendChild(next); gen.appendChild(row);
      });
      var acts = mk("div", "ph-acts"), rnd = mk("button"), del = mk("button"), ok = mk("button", "ph-ok");
      rnd.type = del.type = ok.type = "button"; rnd.textContent = "Aléatoire"; del.textContent = "Retirer la photo"; ok.textContent = "OK";
      rnd.addEventListener("click", function () { photo = { type: "av", o: randAv() }; renderPhoto(); save(); openPh(); });
      del.addEventListener("click", function () { photo = null; renderPhoto(); save(); closePh(); });
      ok.addEventListener("click", closePh);
      acts.appendChild(rnd); acts.appendChild(del); acts.appendChild(ok); gen.appendChild(acts);
    });
    var r = photoEl.getBoundingClientRect();
    phPanel.style.left = (r.right + 12 + window.scrollX) + "px"; phPanel.style.top = (r.top + window.scrollY) + "px";
    document.body.appendChild(phPanel);
  }
  if (photoEl) {
    photoEl.classList.add("ph"); photoEl.setAttribute("role", "button"); photoEl.setAttribute("tabindex", "0"); photoEl.setAttribute("aria-label", "Ajouter une photo ou un avatar");
    photoEl.addEventListener("click", openPh);
    photoEl.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPh(); } });
    document.addEventListener("click", function (e) { if (phPanel && !phPanel.contains(e.target) && !photoEl.contains(e.target)) closePh(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePh(); });
  }

  /* 4 quater. Jalons sur la frise (Cadrage UXR) : clic sur la ligne pour en poser un */
  var jals = [], jalLine = null;
  function addJal(d) {
    if (!jalLine) return null;
    var j = mk("div", "jal"); j.style.left = d.x + "%";
    var mark = mk("i", "jal-m"); mark.setAttribute("title", "Glisser pour déplacer");
    var lab = mk("div", "jal-l ed"); lab.setAttribute("contenteditable", "true"); lab.setAttribute("data-ph", "Jalon"); lab.innerHTML = d.l || "";
    var dat = mk("div", "jal-d ed"); dat.setAttribute("contenteditable", "true"); dat.setAttribute("data-ph", "date"); dat.innerHTML = d.d || "";
    var del = mk("button", "jal-x"); del.type = "button"; del.textContent = "×"; del.setAttribute("aria-label", "Supprimer ce jalon");
    j.appendChild(lab); j.appendChild(mark); j.appendChild(dat); j.appendChild(del);
    [lab, dat].forEach(function (f) {
      f.addEventListener("input", save);
      f.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
      f.addEventListener("paste", function (e) { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\s+/g, " ")); });
    });
    del.addEventListener("click", function (e) { e.stopPropagation(); jals.splice(jals.indexOf(j), 1); j.remove(); save(); });
    mark.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation(); mark.setPointerCapture(e.pointerId);
      var r = jalLine.getBoundingClientRect();
      function mv(ev) { j.style.left = Math.min(98, Math.max(2, (ev.clientX - r.left) / r.width * 100)) + "%"; }
      function up() { mark.removeEventListener("pointermove", mv); mark.removeEventListener("pointerup", up); save(); }
      mark.addEventListener("pointermove", mv); mark.addEventListener("pointerup", up);
    });
    j.addEventListener("click", function (e) { e.stopPropagation(); });
    jalLine.appendChild(j); jals.push(j); return j;
  }
  function setupJals() {
    if (!tlLines.length) return;
    jalLine = tlLines[0].querySelector('div[style*="align-items:center"]');
    if (!jalLine) return;
    jalLine.classList.add("jal-line");
    jalLine.setAttribute("title", "Cliquer sur la ligne pour poser un jalon");
    jalLine.addEventListener("click", function (e) {
      var r = jalLine.getBoundingClientRect();
      var j = addJal({ x: Math.min(98, Math.max(2, (e.clientX - r.left) / r.width * 100)) });
      if (j) { j.querySelector(".jal-l").focus(); save(); }
    });
  }

  /* 5. Sauvegarde locale */
  var timer;
  function save() {
    recalc();
    clearTimeout(timer);
    timer = setTimeout(function () {
      var data = { v: 2, e: eds.map(function (el) { return el.innerHTML; }), c: checks.map(function (el) { return el.getAttribute("aria-checked") === "true"; }),
        m: emos.map(function (el) { return el.textContent; }),
        p: notes.map(function (n) { return { x: n.offsetLeft, y: n.offsetTop, t: n.querySelector(".pi-t").innerHTML }; }),
        ph: photo,
        j: jals.map(function (j) { return { x: parseFloat(j.style.left), l: j.querySelector(".jal-l").innerHTML, d: j.querySelector(".jal-d").innerHTML }; }),
        t: tris.map(function (i) { return i.getAttribute("data-s"); }), r: marks.map(function (b) { return b.getAttribute("data-v"); }),
        k: links.map(function (l) { return [notes.indexOf(l.a), notes.indexOf(l.b), l.t]; }) };
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) { /* stockage indisponible : la fiche marche quand même */ }
    }, 300);
  }
  function restore() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!saved || saved.v !== 2) return;
      if (saved.e && saved.e.length === eds.length) eds.forEach(function (el, i) { el.innerHTML = saved.e[i]; });
      if (saved.c && saved.c.length === checks.length) checks.forEach(function (el, i) { setCheck(el, !!saved.c[i]); });
      if (saved.m && saved.m.length === emos.length) emos.forEach(function (el, i) { setEmo(el, saved.m[i]); });
      if (NOTES && saved.p) saved.p.forEach(function (d) { addNote(d); });
      if (saved.t && saved.t.length === tris.length) tris.forEach(function (i, n) { setTri(i, saved.t[n] || ""); });
      if (saved.r && saved.r.length === marks.length) marks.forEach(function (b, n) { setMark(b, saved.r[n]); });
      if (ECO && saved.k) saved.k.forEach(function (k) { if (notes[k[0]] && notes[k[1]]) addLink(notes[k[0]], notes[k[1]], k[2]); });
      if (saved.j && jalLine) saved.j.forEach(function (d) { addJal(d); });
      if (saved.ph && photoEl) { photo = saved.ph; if (photo.type === "av") loadAv(renderPhoto); else renderPhoto(); }
    } catch (err) { /* rien à restaurer */ }
  }

  /* 6. Barre d'outils */
  var slug = location.pathname.split("/").pop().replace(/\.html$/, "") || "fiche";
  var bar = mk("div", "tb");
  bar.innerHTML = '<button type="button" data-a="png">Enregistrer en image</button>' +
    '<button type="button" data-a="print">Imprimer / PDF</button>' +
    '<button type="button" data-a="clear">Tout effacer</button>' +
    '<span class="msg" role="status">Saisie gardée dans ce navigateur</span>';
  document.body.insertBefore(bar, document.body.firstChild);
  var msg = bar.querySelector(".msg");
  // Bouton post-it : sous la fiche, à part des autres
  if (NOTES) {
    var below = mk("div", "tb-below"), nb = mk("button", "btn-note");
    nb.type = "button"; nb.textContent = ECO ? "+ Ajouter un acteur" : "+ Ajouter un post-it";
    nb.addEventListener("click", function () { var n = addNote(); n.querySelector(".pi-t").focus(); save(); });
    below.appendChild(nb); root.parentNode.insertBefore(below, root.nextSibling);
  }
  bar.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var a = b.getAttribute("data-a");
    if (a === "print") window.print();
    else if (a === "clear") {
      if (!confirm("Effacer tout ce qui a été saisi sur cette fiche ?")) return;
      try { localStorage.removeItem(KEY); } catch (err) {}
      location.reload();
    } else if (a === "png") exportPng(b);
  });
  function exportPng(btn) {
    if (!window.htmlToImage) { msg.textContent = "Export indisponible"; return; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    btn.disabled = true; msg.textContent = "Création de l'image…";
    document.documentElement.classList.add("capturing");
    ready.then(function () {
      return window.htmlToImage.toPng(root, { pixelRatio: 2, backgroundColor: "#ffffff", style: { margin: "0", outline: "0" } });
    }).then(function (url) {
      var a = mk("a"); a.href = url; a.download = slug + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      msg.textContent = "Image enregistrée";
    }).catch(function () {
      msg.textContent = "L'image n'a pas pu être créée. Essayez « Imprimer / PDF ».";
    }).then(function () { btn.disabled = false; document.documentElement.classList.remove("capturing"); });
  }
})();
