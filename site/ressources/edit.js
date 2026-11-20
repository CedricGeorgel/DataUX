/* Fiches modifiables DataUX.
   Rend les zones vides de la fiche modifiables (à taille fixe : une case ne grandit jamais),
   les cases à cocher cliquables, garde la saisie dans le navigateur (localStorage)
   et permet d'enregistrer une image PNG. Rien n'est envoyé à un serveur. */
(function () {
  "use strict";
  var root = document.querySelector(".root");
  if (!root) return;
  // Version papier vierge (?papier) : la feuille telle qu'imprimée, sans saisie ni couleurs du web
  if (/[?&]papier\b/.test(location.search)) {
    document.documentElement.classList.add("papier");
    var pb = document.createElement("div"); pb.className = "tb tb-papier";
    pb.innerHTML = '<span class="msg">Version papier vierge, à imprimer et remplir au stylo.</span><button type="button">Imprimer</button>';
    pb.querySelector("button").addEventListener("click", function () { window.print(); });
    document.body.insertBefore(pb, document.body.firstChild);
    return;
  }
  var KEY = "dataux-fiche:" + location.pathname;
  // Consentement signé à distance : la saisie du participant est gardée à part de celle de l'organisateur
  if (/^#e=/.test(location.hash)) KEY += ":distance:" + location.hash.slice(3, 40);
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
  // Ligne « Total ✓ » (rainbow spreadsheet) : réussites par participant, calculées
  var rapportTot = rapport && rapport.length && rapport[rapport.length - 1].classList.contains("tot") ? rapport.pop() : null;
  if (rapportTot) {
    for (var tc = 1; tc < rapportTot.children.length - 1; tc++) lockCalc(rapportTot.children[tc]);
    lockCalc(rapportTot.lastElementChild.querySelector(".pct"));
  }
  // La valeur est dans un span : la matrice de compétences l'entoure d'un petit rond, comme sa légende
  function setMark(b, v) { b.innerHTML = ""; if (v) { var t = mk("span"); t.textContent = v; b.appendChild(t); } b.setAttribute("data-v", v || ""); b.setAttribute("aria-label", v ? "Résultat " + v + ", changer" : "Choisir un résultat"); }
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
  // Toutes les lignes à cases (la ligne « Besoin de l'équipe » est dans l'en-tête, tout en haut)
  var matrice = /matrice-de-competences/.test(PATH) ? Array.prototype.filter.call(root.querySelectorAll(".mc table tr"), function (tr) { return tr.querySelector("td"); }) : null;
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
    // Ligne « Besoin de l'équipe » (en haut depuis le 19/11) : sa case « Envie d'apprendre » est verrouillée
    if (tr.classList.contains("need") || tr.querySelector(".tot")) lockCalc(tr.lastElementChild);
  });
  // États d'un écran : chaque case passe de vide à « fait », « à faire », « sans objet »
  var tris = [], TRI_S = ["", "oui", "non", "na"], TRI_L = { "": "Pas renseigné", oui: "Fait", non: "À faire", na: "Sans objet" };
  function setTri(i, s) { i.setAttribute("data-s", s); i.setAttribute("aria-label", TRI_L[s]); i.setAttribute("title", TRI_L[s]); }
  // Un clic ouvre un menu (comme le rapport de test) au lieu de faire défiler les états
  if (TRI) {
    root.querySelectorAll("i.box").forEach(function (i) {
      i.setAttribute("role", "button"); i.setAttribute("tabindex", "0"); setTri(i, "");
      function open(e) {
        if (e) e.stopPropagation(); closeMarks();
        markPick = mk("div", "emo-pick mk-pick");
        [["oui", "✓ fait"], ["non", "✗ à faire"], ["na", "— sans objet"], ["", "Effacer"]].forEach(function (o) {
          var x = mk("button", o[0] ? "" : "clr"); x.type = "button"; x.textContent = o[1];
          x.addEventListener("click", function () { setTri(i, o[0]); closeMarks(); save(); i.focus(); });
          markPick.appendChild(x);
        });
        var r = i.getBoundingClientRect();
        markPick.style.left = (r.left + window.scrollX) + "px"; markPick.style.top = (r.bottom + 4 + window.scrollY) + "px";
        document.body.appendChild(markPick); markPick.querySelector("button").focus();
      }
      i.addEventListener("click", open);
      i.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); open(e); } });
      tris.push(i);
    });
    document.addEventListener("click", function (e) { if (markPick && !markPick.contains(e.target)) closeMarks(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMarks(); });
  }
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
    if (rapportTot) {
      var all = 0, alln = 0;
      for (var c = 1; c < rapportTot.children.length - 1; c++) {
        var okc = 0, nc = 0;
        rapport.forEach(function (tr) { var b = tr.children[c] && tr.children[c].querySelector(".mk"), v = b && b.getAttribute("data-v"); if (v) { nc++; if (v === "✓") okc++; } });
        put(rapportTot.children[c], nc ? String(okc) : ""); all += okc; alln += nc;
      }
      put(rapportTot.lastElementChild.querySelector(".pct"), alln ? String(Math.round(all * 100 / alln)) : "");
    }
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
    if (el.hasAttribute("data-ck") || el.hasAttribute("data-ed") || el.hasAttribute("data-line") || el.closest("[data-ed], [data-line], h1, h2, [data-ck], [data-calc], svg") || el.matches(".sw i, i.box[data-s]") || (el.matches("thead tr:first-child > th:first-child") && empty(el))) return;
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
    setupConsent();
    restore();
    if (REMOTE) applyRemote();
    // Largeur de l'écran et non de la page : la feuille A4 élargit la page au-delà de l'écran du téléphone
    if (CONSENT && ((window.screen && screen.width <= 760) || (window.matchMedia && window.matchMedia("(max-width: 760px)").matches))) setupPhone(!REMOTE);
    if (!CONSENT && PHONE_SHEET && ((window.screen && screen.width <= 760) || (window.matchMedia && window.matchMedia("(max-width: 760px)").matches))) setupPhoneSheet();
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

  /* Formulaire de consentement : trois usages.
     1. Imprimer : rien de spécial, on signe à la main.
     2. Sur place : participant et organisateur signent au doigt ou à la souris, puis image ou impression.
     3. À distance : l'organisateur remplit « L'étude » et « Vos droits », crée un lien (les champs voyagent
        dans l'adresse, après le #, jamais envoyés au serveur). Le participant coche, signe et renvoie l'image. */
  var CONSENT = /formulaire-de-consentement/.test(PATH);
  var REMOTE = CONSENT && /^#e=/.test(location.hash);
  var sigs = [];
  function consentZones() { return root.querySelectorAll(".z"); }
  // Champs remplis par l'organisateur : en-tête, « L'étude », « Vos droits », nom de l'organisateur
  function orgFields() {
    var z = consentZones(), list = Array.prototype.slice.call(root.querySelectorAll(".fld [data-ed]"));
    [0, 1].forEach(function (k) { if (z[k]) list = list.concat(Array.prototype.slice.call(z[k].querySelectorAll("[data-ed]"))); });
    if (z[4]) { var n = z[4].querySelector(".kv [data-ed]"); if (n) list.push(n); }
    return list;
  }
  function kvField(label) {
    var kv = Array.prototype.find.call(root.querySelectorAll(".kv"), function (k) { var b = k.querySelector("b"); return b && b.textContent.trim() === label; });
    return kv ? kv.querySelector("[data-ed]") : null;
  }
  // Tracé lissé : courbes passant par les milieux des points, avec tous les points intermédiaires du pointeur
  function ink(cv, ctx, pt, onDown, onUp) {
    var pts = null;
    function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    function add(p) {
      var l = pts[pts.length - 1];
      if (Math.abs(p.x - l.x) + Math.abs(p.y - l.y) < 1.2) return;
      pts.push(p); var n = pts.length;
      ctx.beginPath();
      if (n === 2) { ctx.moveTo(pts[0].x, pts[0].y); var m0 = mid(pts[0], pts[1]); ctx.lineTo(m0.x, m0.y); }
      else { var a = mid(pts[n - 3], pts[n - 2]), b = mid(pts[n - 2], pts[n - 1]); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(pts[n - 2].x, pts[n - 2].y, b.x, b.y); }
      ctx.stroke();
    }
    cv.addEventListener("pointerdown", function (e) { e.preventDefault(); cv.setPointerCapture(e.pointerId); var p = pt(e); pts = [p]; ctx.beginPath(); ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, 7); ctx.fill(); if (onDown) onDown(); });
    cv.addEventListener("pointermove", function (e) {
      if (!pts) return;
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (evs.length ? evs : [e]).forEach(function (ev) { add(pt(ev)); });
    });
    function end() {
      if (!pts) return;
      var n = pts.length;
      if (n > 1) { var m = mid(pts[n - 2], pts[n - 1]); ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(pts[n - 1].x, pts[n - 1].y); ctx.stroke(); }
      pts = null; onUp();
    }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }
  function sigPad(box) {
    box.textContent = "";
    var lab = mk("span", "sig-l"); lab.textContent = "Signature"; box.appendChild(lab);
    var cv = mk("canvas", "sig-c"); cv.setAttribute("aria-label", "Zone de signature : signez au doigt ou à la souris"); box.appendChild(cv);
    var clr = mk("button", "sig-x"); clr.type = "button"; clr.textContent = "Effacer"; box.appendChild(clr);
    var ctx, data = "", W = 0, H = 0;
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * 2; cv.height = H * 2;
    ctx = cv.getContext("2d"); ctx.scale(2, 2); ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#141414";
    function pt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
    function stampDate() {
      var z = box.closest(".z"), d = z && z.querySelectorAll(".kv [data-ed]")[1];
      if (d && !d.textContent.trim()) { var t = new Date(); d.textContent = ("0" + t.getDate()).slice(-2) + "/" + ("0" + (t.getMonth() + 1)).slice(-2) + "/" + t.getFullYear(); }
    }
    ink(cv, ctx, pt, stampDate, function () { data = cv.toDataURL("image/png"); save(); });
    clr.addEventListener("click", function () { ctx.clearRect(0, 0, W, H); data = ""; save(); });
    return {
      get: function () { return data; },
      set: function (url) { ctx.clearRect(0, 0, W, H); data = url || ""; if (!data) return; var im = new Image(); im.onload = function () { var k = Math.min(W / im.width, H / im.height), w = im.width * k, h = im.height * k; ctx.clearRect(0, 0, W, H); ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); }; im.src = data; }
    };
  }
  function setupConsent() {
    if (!CONSENT) return;
    root.querySelectorAll(".sig").forEach(function (box, i) {
      if (REMOTE && i === 1) { box.classList.add("sig-off"); box.textContent = "Signature de l'organisateur non requise pour un consentement à distance"; return; }
      sigs.push(sigPad(box));
    });
  }
  function encodeFields(vals) { return btoa(unescape(encodeURIComponent(JSON.stringify(vals)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function decodeFields(s) { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); }
  function applyRemote() {
    try {
      var vals = decodeFields(location.hash.slice(3));
      orgFields().forEach(function (e, i) { if (typeof vals[i] === "string") e.textContent = vals[i]; e.setAttribute("contenteditable", "false"); e.classList.add("ed-lock"); });
      // L'étude et Vos droits ne sont pas modifiables par le participant : fond surface
      var zs = root.querySelectorAll(".z"); [0, 1].forEach(function (i) { if (zs[i]) zs[i].classList.add("z-ro"); });
    } catch (err) { if (msg) msg.textContent = "Lien incomplet : demandez un nouveau lien à l'organisateur."; }
  }
  function remoteLink() { return location.origin + location.pathname + "#e=" + encodeFields(orgFields().map(function (e) { return e.textContent.trim(); })); }
  function sendSigned(btn, note, onsite) {
    if (!sigs[0] || !sigs[0].get()) { note.textContent = "Signez dans le cadre « Participant » avant d'envoyer."; return; }
    if (!window.htmlToImage) { note.textContent = "Envoi indisponible : utilisez « Imprimer / PDF »."; return; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    btn.disabled = true; note.textContent = "Préparation de l'image…";
    document.documentElement.classList.add("capturing");
    var c = kvField("Contact"), contact = c ? c.textContent.trim() : "";
    window.htmlToImage.toBlob(root, { pixelRatio: 2, backgroundColor: "#ffffff", style: { margin: "0", outline: "0", transform: "none" } }).then(function (blob) {
      var file = new File([blob], "consentement-signe.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: "Formulaire de consentement signé" }).then(function () { note.textContent = onsite ? "Formulaire enregistré." : "Formulaire envoyé. Merci !"; });
      }
      var a = mk("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      note.textContent = onsite ? "Image enregistrée dans vos téléchargements." : "Image enregistrée. Joignez-la à un e-mail" + (contact ? " à : " + contact : " à l'organisateur") + ".";
    }).catch(function (err) {
      if (err && err.name === "AbortError") { note.textContent = ""; return; }
      note.textContent = "L'image n'a pas pu être créée. Essayez « Imprimer / PDF ».";
    }).then(function () { btn.disabled = false; document.documentElement.classList.remove("capturing"); });
  }

  /* Consentement à distance sur téléphone : un formulaire vertical, lisible et signable au doigt.
     Il remplit la feuille A4 (réduite en aperçu dessous), qui reste le document envoyé. */
  function setupPhone(org) {
    var z = consentZones(), form = mk("div", "mform"), uid = 0;
    document.body.classList.add("phone-remote");
    function sec(title, parent) { var s = mk("section", "mf-s"), h = mk("h2"); h.textContent = title; s.appendChild(h); (parent || form).appendChild(s); return s; }
    function today() { var t = new Date(); return ("0" + t.getDate()).slice(-2) + "/" + ("0" + (t.getMonth() + 1)).slice(-2) + "/" + t.getFullYear(); }
    function push(ed, v) { ed.textContent = v; ed.dispatchEvent(new Event("input", { bubbles: true })); save(); }
    // Un texte réparti sur plusieurs lignes de la feuille (ex. « Objet » sur deux lignes)
    var meas = document.createElement("canvas").getContext("2d");
    function spread(eds, text) {
      var words = text.trim().split(/\s+/).filter(Boolean);
      eds.forEach(function (ed, i) {
        if (i === eds.length - 1) { push(ed, words.join(" ")); words = []; return; }
        meas.font = getComputedStyle(ed).font; var w = ed.clientWidth - 4, line = "";
        while (words.length && meas.measureText(line ? line + " " + words[0] : words[0]).width <= w) line = line ? line + " " + words.shift() : words.shift();
        push(ed, line);
      });
    }
    // Champ du téléphone relié à un ou plusieurs champs de la feuille
    function field(parent, label, eds, opts) {
      opts = opts || {}; var id = "mf-f" + (++uid);
      var l = mk("label", "mf-l"), inp = mk(opts.area ? "textarea" : "input");
      l.textContent = label; l.setAttribute("for", id); inp.id = id; if (!opts.area) inp.type = "text"; else inp.rows = 3;
      if (opts.ac) inp.autocomplete = opts.ac;
      inp.value = eds.map(function (e) { return e.textContent.trim(); }).filter(Boolean).join(" ");
      inp.addEventListener("input", function () { if (eds.length > 1) spread(eds, inp.value); else push(eds[0], inp.value); });
      parent.appendChild(l); parent.appendChild(inp); return inp;
    }
    // Pavé de signature au doigt, recopié dans la signature de la feuille
    function sigField(parent, label, idx, zone) {
      var sl = mk("p", "mf-l"); sl.textContent = label; parent.appendChild(sl);
      var pad = mk("div", "mf-pad"), cv = mk("canvas"), clr = mk("button", "mf-x");
      cv.setAttribute("aria-label", label + " : signez avec le doigt"); clr.type = "button"; clr.textContent = "Effacer";
      pad.appendChild(cv); pad.appendChild(clr); parent.appendChild(pad);
      var W = pad.clientWidth, H = 170, ctx;
      cv.width = W * 2; cv.height = H * 2; cv.style.height = H + "px"; ctx = cv.getContext("2d"); ctx.scale(2, 2);
      ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#141414";
      var existing = sigs[idx] && sigs[idx].get();
      if (existing) { var im0 = new Image(); im0.onload = function () { var k = Math.min(W / im0.width, H / im0.height); ctx.drawImage(im0, (W - im0.width * k) / 2, (H - im0.height * k) / 2, im0.width * k, im0.height * k); }; im0.src = existing; }
      function pt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
      ink(cv, ctx, pt, null, function () {
        var d = zone.querySelectorAll(".kv [data-ed]")[1];
        if (d && !d.textContent.trim()) d.textContent = today();
        if (sigs[idx]) sigs[idx].set(cv.toDataURL("image/png")); save();
      });
      clr.addEventListener("click", function () { ctx.clearRect(0, 0, W, H); if (sigs[idx]) sigs[idx].set(""); save(); });
    }

    var head = mk("div", "mf-h"), t = mk("h1"); t.textContent = "Formulaire de consentement"; head.appendChild(t);
    var flds = root.querySelectorAll(".fld > span");
    if (org) {
      form.appendChild(head);
      var s0 = sec("Le projet");
      flds.forEach(function (sp) { var b = sp.querySelector("b"), e = sp.querySelector("[data-ed]"); if (b && e) field(s0, b.textContent.trim(), [e]); });
    } else {
      var pr = root.querySelector(".fld [data-ed]");
      if (pr && pr.textContent.trim()) { var p0 = mk("p"); p0.textContent = pr.textContent.trim(); head.appendChild(p0); }
      form.appendChild(head);
    }
    // L'étude
    var s1 = sec("L'étude");
    if (org) {
      var groups = [];
      z[0].querySelectorAll(".kv").forEach(function (kv) {
        var b = kv.querySelector("b"), e = kv.querySelector("[data-ed]"), lab = b ? b.textContent.trim() : "";
        if (!e) return;
        if (!lab && groups.length) groups[groups.length - 1].eds.push(e); else groups.push({ lab: lab, eds: [e] });
      });
      groups.forEach(function (g) {
        field(s1, g.lab, g.eds, { area: g.eds.length > 1, ac: g.lab === "Contact" ? "email" : "" });
      });
    } else {
      s1.classList.add("mf-ro"); var dl = mk("dl"), lastLabel = "";
      z[0].querySelectorAll(".kv").forEach(function (kv) {
        var b = kv.querySelector("b"), e = kv.querySelector("[data-ed]"), v = e ? e.textContent.trim() : "";
        var lab = b ? b.textContent.trim() : ""; if (lab) lastLabel = lab;
        if (!v) return;
        if (!lab && dl.lastElementChild && dl.lastElementChild.tagName === "DD") { dl.lastElementChild.textContent += " " + v; return; }
        var dt = mk("dt"), dd = mk("dd"); dt.textContent = lab || lastLabel; dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd);
      });
      s1.appendChild(dl);
    }
    // Vos droits : le texte de la feuille ; côté organisateur, la durée de conservation est un champ
    var s2 = sec("Vos droits"), ul = mk("ul");
    if (!org) s2.classList.add("mf-ro");
    z[1].querySelectorAll("li").forEach(function (li) {
      var l = mk("li"), ed = li.querySelector("[data-ed]");
      if (org && ed) {
        li.childNodes.forEach(function (n) {
          if (n.nodeType === 3) l.appendChild(document.createTextNode(n.textContent.replace(/\s+/g, " ")));
          else if (n.contains(ed)) {
            var inp = mk("input", "mf-in"); inp.type = "text"; inp.inputMode = "numeric"; inp.value = ed.textContent.trim(); inp.setAttribute("aria-label", "Durée de conservation en mois");
            inp.addEventListener("input", function () { push(ed, inp.value); }); l.appendChild(inp);
          } else l.appendChild(document.createTextNode(n.textContent));
        });
      } else l.textContent = li.textContent.replace(/\s+/g, " ").trim();
      ul.appendChild(l);
    });
    s2.appendChild(ul);

    // Partie à signer : choix oui / non, participant, et organisateur sur place
    function signing(parent) {
      var s3 = sec(org ? "Le participant accepte" : "J'accepte", parent);
      z[2].querySelectorAll(".cbl").forEach(function (row) {
        var yn = row.querySelectorAll(".yn > i"), q = mk("div", "mf-q"), lab = mk("p"), bt = mk("div", "mf-yn");
        lab.textContent = (row.querySelector(".cb") || row).textContent.trim(); q.appendChild(lab);
        ["Oui", "Non"].forEach(function (txt, k) {
          var b = mk("button"); b.type = "button"; b.textContent = txt; b.setAttribute("aria-pressed", yn[k] && yn[k].getAttribute("aria-checked") === "true" ? "true" : "false");
          b.addEventListener("click", function () {
            if (!yn[k]) return;
            if (yn[k].getAttribute("aria-checked") !== "true") yn[k].click();
            bt.querySelectorAll("button").forEach(function (o, j) { o.setAttribute("aria-pressed", yn[j] && yn[j].getAttribute("aria-checked") === "true" ? "true" : "false"); });
          });
          bt.appendChild(b);
        });
        q.appendChild(bt); s3.appendChild(q);
      });
      var s4 = sec(org ? "Participant" : "Vous", parent);
      var nom = field(s4, org ? "Nom du participant" : "Votre nom", [z[3].querySelector(".kv [data-ed]")], { ac: org ? "off" : "name" });
      sigField(s4, org ? "Signature du participant" : "Votre signature", 0, z[3]);
      if (org && z[4]) {
        var s5 = sec("Organisateur", parent);
        field(s5, "Votre nom", [z[4].querySelector(".kv [data-ed]")], { ac: "name" });
        sigField(s5, "Votre signature", 1, z[4]);
      }
      var send = mk("button", "mf-send"), note = mk("p", "mf-note"); send.type = "button"; note.setAttribute("role", "status");
      send.textContent = org ? "Enregistrer le formulaire signé" : "Envoyer le formulaire signé";
      parent.appendChild(send); parent.appendChild(note);
      send.addEventListener("click", function () {
        if (!nom.value.trim()) { note.textContent = org ? "Écrivez le nom du participant." : "Écrivez votre nom avant d'envoyer."; nom.focus(); return; }
        sendSigned(send, note, org);
      });
    }

    if (org) {
      // Deux usages : envoyer un lien, ou faire signer sur place sur ce téléphone
      var s6 = sec("Faire signer"), how = mk("p", "mf-help");
      how.textContent = "À distance : le participant reçoit un lien, lit le formulaire, signe et vous renvoie l'image. Sur place : il signe sur ce téléphone.";
      s6.appendChild(how);
      var bl = mk("button", "mf-send"), bo = mk("button", "mf-alt"), ln = mk("p", "mf-note"), onsite = mk("div", "mf-onsite");
      bl.type = bo.type = "button"; bl.textContent = "Envoyer un lien au participant"; bo.textContent = "Faire signer sur place"; ln.setAttribute("role", "status");
      s6.appendChild(bl); s6.appendChild(ln); s6.appendChild(bo);
      bl.addEventListener("click", function () {
        var url = remoteLink();
        var copied = function () { ln.textContent = "Lien copié. Collez-le dans un message au participant."; };
        if (navigator.share) {
          navigator.share({ title: "Formulaire de consentement", text: "Merci de lire, signer et me renvoyer ce formulaire :", url: url })
            .then(function () { ln.textContent = "Lien envoyé. Le participant vous renverra l'image signée."; }, function (err) { if (!err || err.name !== "AbortError") ln.textContent = "Partage impossible : réessayez."; });
        } else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(copied, function () { ln.textContent = url; });
        else ln.textContent = url;
      });
      form.appendChild(onsite);
      bo.addEventListener("click", function () {
        if (!onsite.firstChild) signing(onsite);
        bo.hidden = true; onsite.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else signing(form);

    var pv = mk("p", "mf-pv"); pv.textContent = org ? "Aperçu de la feuille :" : "Le document qui sera envoyé :"; form.appendChild(pv);
    // Aperçu de la feuille, réduite à la largeur de l'écran
    var wrap = mk("div", "mf-sheet"); root.parentNode.insertBefore(form, root); root.parentNode.insertBefore(wrap, root); wrap.appendChild(root);
    function fit() { var k = wrap.clientWidth / 1123; root.style.transform = "scale(" + k + ")"; wrap.style.height = (794 * k) + "px"; }
    fit(); window.addEventListener("resize", fit);
    if (org) {
      var foot = mk("div", "mf-foot"), pb = mk("button", "mf-link"), cb2 = mk("button", "mf-link");
      pb.type = cb2.type = "button"; pb.textContent = "Imprimer"; cb2.textContent = "Tout effacer";
      pb.addEventListener("click", function () { window.print(); });
      cb2.addEventListener("click", function () { var x = document.querySelector('.tb [data-a="clear"]'); if (x) x.click(); });
      foot.appendChild(pb); foot.appendChild(cb2); wrap.parentNode.insertBefore(foot, wrap.nextSibling);
    }
  }

  /* Vue téléphone des fiches remplies sur le terrain (journal de bord, observation, prise de notes) :
     les tableaux deviennent des fiches, les zones de grands champs. La feuille A4 reste dessous, en aperçu. */
  var PHONE_SHEET = /journal-de-bord|grille-d-observation|grille-de-prise-de-notes/.test(location.pathname);
  function setupPhoneSheet() {
    var form = mk("div", "mform"), uid = 0, OBSV = /grille-d-observation/.test(location.pathname);
    document.body.classList.add("phone-sheet");
    function sec(title, parent) { var s = mk("section", "mf-s"), h = mk("h2"); h.textContent = title; s.appendChild(h); (parent || form).appendChild(s); return s; }
    function val(ed) { return ed.innerText.replace(/\n$/, ""); }
    function put(ed, v) { ed.innerText = v; save(); }
    function field(parent, label, ed, rows) {
      var id = "mf-f" + (++uid), l = mk("label", "mf-l"), inp = mk(rows ? "textarea" : "input");
      l.textContent = label; l.setAttribute("for", id); inp.id = id;
      if (rows) inp.rows = rows; else inp.type = "text";
      inp.value = val(ed);
      inp.addEventListener("input", function () { put(ed, inp.value); });
      parent.appendChild(l); parent.appendChild(inp); return inp;
    }
    var h1 = root.querySelector("h1"), head = mk("div", "mf-h"), t = mk("h1");
    t.textContent = h1 ? h1.textContent.trim() : ""; head.appendChild(t); form.appendChild(head);
    // En-tête : Projet, Participant… (« Du … Au … » donne deux champs)
    var s0 = sec("Informations");
    root.querySelectorAll(".fld b").forEach(function (b) {
      var n = b.nextElementSibling, ed = n && (n.matches("[data-ed]") ? n : n.querySelector("[data-ed]"));
      if (ed) field(s0, b.textContent.trim().replace(/^./, function (c) { return c.toUpperCase(); }).replace(/^INTERVIEWVER$/i, "Interviewer"), ed);
    });
    // Tableaux : une fiche par ligne
    root.querySelectorAll("table").forEach(function (tb) {
      var heads = Array.prototype.map.call(tb.querySelectorAll("thead th"), function (th) { return th.textContent.trim(); });
      var rows = Array.prototype.slice.call(tb.querySelectorAll("tbody tr")), cards = [];
      var list = mk("div", "mf-cards"); form.appendChild(list);
      rows.forEach(function (tr, i) {
        var tds = tr.querySelectorAll("td"), key = tr.querySelector("td.n"), eds = [];
        var card = mk("details", "mf-s mf-card"), sum = mk("summary"), body = mk("div", "mf-cb");
        var name = key ? key.textContent.trim() : "Observation " + (i + 1);
        sum.textContent = name; card.appendChild(sum); card.appendChild(body);
        tds.forEach(function (td, c) {
          var ed = td.querySelector("[data-ed]"); if (!ed) return;
          eds.push(ed);
          var inp = field(body, heads[c] || "", ed, /heure|moment|jour/i.test(heads[c] || "") ? 0 : 3);
          if (OBSV && /heure/i.test(heads[c] || "")) {
            inp.inputMode = "numeric"; card._heure = inp; card._heureEd = ed;
          }
        });
        // Observation : l'heure se remplit toute seule à la première saisie
        if (card._heure) body.addEventListener("input", function (e) {
          if (e.target === card._heure || card._heure.value) return;
          var d = new Date(); card._heure.value = ("0" + d.getHours()).slice(-2) + "h" + ("0" + d.getMinutes()).slice(-2); put(card._heureEd, card._heure.value);
        });
        var filled = eds.some(function (e) { return val(e).trim(); });
        card._filled = filled;
        function title() { var f = eds.map(val).filter(function (v) { return v.trim(); }); sum.setAttribute("data-sub", f.length ? f[f.length > 1 ? 1 : 0].split("\n")[0].slice(0, 40) : ""); }
        title(); body.addEventListener("input", title);
        list.appendChild(card); cards.push(card);
      });
      // Journal : toutes les journées, la première vide ouverte. Observation : les remplies + une vide, puis « Ajouter ».
      var firstEmpty = cards.filter(function (c) { return !c._filled; })[0];
      if (firstEmpty) firstEmpty.open = true;
      if (OBSV) {
        var shown = cards.filter(function (c) { return c._filled; }).length + 1;
        cards.forEach(function (c, i) { c.hidden = i >= shown; });
        var add = mk("button", "mf-alt"); add.type = "button"; add.textContent = "+ Ajouter une observation";
        add.addEventListener("click", function () {
          var next = cards.filter(function (c) { return c.hidden; })[0]; if (!next) return;
          cards.forEach(function (c) { c.open = false; }); next.hidden = false; next.open = true;
          var f = next.querySelector("textarea, input"); if (f) f.focus();
          if (!cards.some(function (c) { return c.hidden; })) add.hidden = true;
        });
        if (!cards.some(function (c) { return c.hidden; })) add.hidden = true;
        form.appendChild(add);
      }
    });
    // Zones de notes : un grand champ chacune
    root.querySelectorAll(".z").forEach(function (z) {
      var h = z.querySelector("h2"), ed = z.querySelector("[data-ed]"); if (!ed) return;
      var s = sec(h ? h.textContent.trim() : "Notes"), inp = mk("textarea", "mf-big"), id = "mf-f" + (++uid);
      inp.id = id; inp.rows = /chaud/i.test(s.textContent) ? 5 : 12; inp.setAttribute("aria-label", s.textContent);
      inp.value = val(ed); inp.addEventListener("input", function () { put(ed, inp.value); }); s.appendChild(inp);
    });
    var pv = mk("p", "mf-pv"); pv.textContent = "Aperçu de la feuille :"; form.appendChild(pv);
    var wrap = mk("div", "mf-sheet"); root.parentNode.insertBefore(form, root); root.parentNode.insertBefore(wrap, root); wrap.appendChild(root);
    var W0 = root.offsetWidth, H0 = root.offsetHeight;
    function fit() { var k = wrap.clientWidth / W0; root.style.transform = "scale(" + k + ")"; wrap.style.height = (H0 * k) + "px"; }
    fit(); window.addEventListener("resize", fit);
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

  /* 4 quater. Persona : titres des zones de droite renommables, Niveau et Bio masquables */
  var pzTitles = [], pzHide = {}, pzZones = {};
  if (persona) {
    root.classList.add("pz");
    root.querySelectorAll(".z h2").forEach(function (h) {
      var t = h.lastChild, txt = t && t.nodeType === 3 ? t.nodeValue.trim() : "";
      if (txt === "Niveau" || txt === "Bio") pzZones[txt] = h.closest(".z");
      if (!h.closest(".col.fill") || !txt) return;
      var s = mk("span", "ed-h2"); s.textContent = txt; s.setAttribute("data-orig", txt);
      s.setAttribute("contenteditable", "true"); s.setAttribute("spellcheck", "true");
      s.setAttribute("aria-label", "Titre de la zone « " + txt + " » (modifiable)"); s.title = "Cliquer pour renommer";
      h.replaceChild(s, t);
      s.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); s.blur(); } });
      s.addEventListener("paste", function (e) { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\s+/g, " ")); });
      s.addEventListener("input", save);
      s.addEventListener("blur", function () { if (!s.textContent.trim()) { s.textContent = txt; save(); } });
      pzTitles.push(s);
    });
  }
  function pzSet(name, hidden) {
    var z = pzZones[name]; if (!z) return;
    pzHide[name] = !!hidden; z.hidden = !!hidden;
    var b = document.querySelector('[data-pz="' + name + '"]');
    if (b) { b.textContent = (hidden ? "Afficher " : "Masquer ") + (name === "Bio" ? "la bio" : "le niveau"); b.setAttribute("aria-pressed", hidden ? "true" : "false"); }
  }

  /* 5. Sauvegarde locale */
  var timer;
  function save() {
    recalc();
    clearTimeout(timer);
    timer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (err) { /* stockage indisponible : la fiche marche quand même */ }
    }, 300);
  }
  function snapshot() {
      return { v: 2, e: eds.map(function (el) { return el.innerHTML; }), c: checks.map(function (el) { return el.getAttribute("aria-checked") === "true"; }),
        m: emos.map(function (el) { return el.textContent; }),
        p: notes.map(function (n) { return { x: n.offsetLeft, y: n.offsetTop, t: n.querySelector(".pi-t").innerHTML }; }),
        ph: photo,
        j: jals.map(function (j) { return { x: parseFloat(j.style.left), l: j.querySelector(".jal-l").innerHTML, d: j.querySelector(".jal-d").innerHTML }; }),
        t: tris.map(function (i) { return i.getAttribute("data-s"); }), r: marks.map(function (b) { return b.getAttribute("data-v"); }),
        k: links.map(function (l) { return [notes.indexOf(l.a), notes.indexOf(l.b), l.t]; }),
        g: sigs.map(function (s) { return s.get(); }),
        h: pzTitles.map(function (s) { return s.textContent; }), x: pzHide };
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
      if (saved.g) sigs.forEach(function (s, i) { s.set(saved.g[i]); });
      if (saved.h && saved.h.length === pzTitles.length) pzTitles.forEach(function (s, i) { if (saved.h[i]) s.textContent = saved.h[i]; });
      if (saved.x) Object.keys(saved.x).forEach(function (k) { pzSet(k, saved.x[k]); });
      if (saved.ph && photoEl) { photo = saved.ph; if (photo.type === "av") loadAv(renderPhoto); else renderPhoto(); }
    } catch (err) { /* rien à restaurer */ }
  }

  /* 6. Barre d'outils */
  var slug = location.pathname.split("/").pop().replace(/\.html$/, "") || "fiche";
  var bar = mk("div", "tb");
  bar.innerHTML = '<button type="button" data-a="save" title="Télécharger un fichier .dataux avec tout ce qui est saisi">Sauvegarder</button>' +
    '<button type="button" data-a="open" title="Reprendre une fiche à partir d\'un fichier .dataux">Ouvrir</button>' +
    '<span class="tb-gap" aria-hidden="true"></span>' +
    '<button type="button" data-a="png">Enregistrer en image</button>' +
    '<button type="button" data-a="print">Imprimer / PDF</button>' +
    '<span class="tb-gap" aria-hidden="true"></span>' +
    '<button type="button" data-a="clear">Tout effacer</button>' +
    '<span class="tb-gap" aria-hidden="true"></span>' +
    '<a class="tb-link" href="' + location.pathname + '?papier" target="_blank" rel="noopener">Version papier vierge ↗</a>' +
    '<span class="msg" role="status">Saisie gardée dans ce navigateur</span>';
  // Persona : boutons sous la fiche, comme le bouton post-it
  var pzBelow = persona && mk("div", "tb-below pz-below");
  if (persona) { root.parentNode.insertBefore(pzBelow, root.nextSibling); }
  if (persona) ["Niveau", "Bio"].forEach(function (n) {
    if (!pzZones[n]) return;
    var b = mk("button", "btn-note"); b.type = "button"; b.setAttribute("data-pz", n);
    pzBelow.appendChild(b);
    b.addEventListener("click", function () { pzSet(n, !pzHide[n]); save(); });
    pzSet(n, !!pzHide[n]);
  });
  document.body.insertBefore(bar, document.body.firstChild);
  var msg = bar.querySelector(".msg");
  // Retour vers la ou les fiches DataUX dont est tirée la ressource (lues dans les données de la carte)
  var back = mk("span", "tb-back");
  var backLink = function (href, label) { var a = mk("a", "tb-link"); a.href = href; a.target = "_top"; a.textContent = label; return a; };
  back.appendChild(backLink("../", "← DataUX"));
  bar.insertBefore(back, bar.firstChild);
  if (window.fetch) fetch("../data/graph.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (G) {
    if (!G || !G.ressources || !G.nodes) return;
    var here = location.pathname.split("/").pop();
    var res = G.ressources.filter(function (r) { return String(r.url || "").split(/[?#]/)[0].split("/").pop() === here; })[0];
    if (!res || !res.liees || !res.liees.length) return;
    var by = {}; G.nodes.forEach(function (n) { by[n.id] = n; });
    var ls = res.liees.map(function (i) { return by[i]; }).filter(Boolean);
    if (!ls.length) return;
    back.textContent = "← ";
    ls.forEach(function (n, i) {
      if (i) back.appendChild(document.createTextNode(" · "));
      var a = backLink("../#" + n.id, n.name); a.title = "Ouvrir la fiche « " + n.name + " » dans DataUX"; back.appendChild(a);
    });
  }).catch(function () {});
  // Consentement : sous la fiche, créer le lien (organisateur) ou envoyer le formulaire signé (participant)
  if (CONSENT) {
    var cb = mk("div", "tb-below consent"), note = mk("p", "consent-note"), go = mk("button", "btn-note");
    go.type = "button"; note.setAttribute("role", "status");
    if (REMOTE) {
      var intro = mk("p", "consent-intro");
      intro.textContent = "Lisez le formulaire, cochez vos choix, écrivez votre nom et signez dans le cadre « Participant ». Puis envoyez-le.";
      cb.appendChild(intro);
      go.textContent = "Envoyer le formulaire signé";
      go.addEventListener("click", function () { sendSigned(go, note); });
    } else {
      go.textContent = "Créer le lien pour signer à distance";
      go.addEventListener("click", function () {
        var url = remoteLink(), box = cb.querySelector(".lnk");
        if (!box) { box = mk("div", "lnk"); var inp = mk("input"); inp.type = "text"; inp.readOnly = true; inp.setAttribute("aria-label", "Lien à envoyer au participant"); box.appendChild(inp); cb.insertBefore(box, note); }
        var input = box.querySelector("input"); input.value = url; input.focus(); input.select();
        var done = function () { note.textContent = "Lien copié. Envoyez-le au participant : il cochera, signera et vous renverra l'image."; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { note.textContent = "Copiez le lien ci-dessus et envoyez-le au participant."; });
        else note.textContent = "Copiez le lien ci-dessus et envoyez-le au participant.";
      });
    }
    cb.appendChild(go); cb.appendChild(note); root.parentNode.insertBefore(cb, root.nextSibling);
  }
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
    else if (a === "save") saveFile();
    else if (a === "open") filePick.click();
  });
  /* 7. Sauvegarde dans un fichier .dataux (JSON) : à garder sur son ordinateur, à rouvrir plus tard ou ailleurs */
  var filePick = mk("input"); filePick.type = "file"; filePick.accept = ".dataux,.json,application/json"; filePick.hidden = true;
  document.body.appendChild(filePick);
  function saveFile() {
    var now = new Date(), day = now.toISOString().slice(0, 10);
    var file = { format: "dataux-fiche", version: 1, fiche: slug, titre: (root.querySelector("h1") || {}).textContent || slug,
      enregistre: now.toISOString(), donnees: snapshot() };
    var url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
    var a = mk("a"); a.href = url; a.download = slug + "-" + day + ".dataux";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    msg.textContent = "Fichier enregistré dans vos téléchargements";
  }
  filePick.addEventListener("change", function () {
    var f = filePick.files && filePick.files[0]; filePick.value = ""; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var file;
      try { file = JSON.parse(r.result); } catch (err) { file = null; }
      if (!file || file.format !== "dataux-fiche" || !file.donnees || file.donnees.v !== 2) { msg.textContent = "Ce fichier n'est pas une sauvegarde DataUX."; return; }
      if (file.fiche !== slug) { msg.textContent = "Ce fichier est une sauvegarde de « " + (file.titre || file.fiche) + " », pas de cette fiche."; return; }
      if (!confirm("Remplacer ce qui est saisi sur cette fiche par le contenu du fichier ?")) return;
      try { localStorage.setItem(KEY, JSON.stringify(file.donnees)); } catch (err) { msg.textContent = "Le navigateur refuse d'enregistrer : fichier trop lourd ou stockage désactivé."; return; }
      location.reload();
    };
    r.onerror = function () { msg.textContent = "Le fichier n'a pas pu être lu."; };
    r.readAsText(f);
  });
  function exportPng(btn) {
    if (!window.htmlToImage) { msg.textContent = "Export indisponible"; return; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    btn.disabled = true; msg.textContent = "Création de l'image…";
    document.documentElement.classList.add("capturing");
    ready.then(function () {
      return window.htmlToImage.toPng(root, { pixelRatio: 2, backgroundColor: "#ffffff", style: { margin: "0", outline: "0", transform: "none" } });
    }).then(function (url) {
      var a = mk("a"); a.href = url; a.download = slug + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      msg.textContent = "Image enregistrée";
    }).catch(function () {
      msg.textContent = "L'image n'a pas pu être créée. Essayez « Imprimer / PDF ».";
    }).then(function () { btn.disabled = false; document.documentElement.classList.remove("capturing"); });
  }
})();
