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
  var eds = [], checks = [];

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
    if (/border-radius:\s*50%/.test(s) && /width:\s*11px/.test(s)) addCheck(i, "");
  });
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
    function toggle() { setCheck(el, el.getAttribute("aria-checked") !== "true"); save(); }
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
    if (!tl && !zoneHasField(z) && !zoneText(z)) { var lo = mk("div", "lo"); z.appendChild(lo); }
  });
  var SMALL = ".fld i, .ft .d i, u, .ini i";
  root.querySelectorAll("*").forEach(function (el) {
    if (el.hasAttribute("data-ck") || el.hasAttribute("data-ed") || el.hasAttribute("data-line") || el.closest("[data-ed], [data-line], h1, h2, [data-ck]")) return;
    if (el.matches(SMALL)) { if (empty(el)) markLine(el); return; }
    var ok = false;
    if (el.matches(".bx, .card.d, .card, .lo")) ok = !el.querySelector("[data-ck]") && (el.matches(".bx, .card.d, .lo") || empty(el));
    else if (leaf(el) && empty(el) && !el.matches(".n, i[style*='border-radius:50%'], i[style*='border-radius: 50%']")) {
      var r = el.getBoundingClientRect();
      ok = r.width >= 30 && r.height >= 14;
    }
    if (ok && el.matches("td, th") && isLabelCell(el)) ok = false;
    if (ok) markBlock(el);
  });

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
      if (!line) w.style.height = Math.max(12, Math.floor(sizes[i].h)) + "px";
      if (el.classList.contains("lo")) { el.style.flex = "none"; el.style.height = Math.max(12, Math.floor(sizes[i].h)) + "px"; el.style.minHeight = "0"; }
      // Texte d'aide déjà présent (« Passer de… à… », « Comment pourrions-nous… ? ») : affiché en indication
      var hint = el.getAttribute("data-hint") || el.innerText.replace(/\s+/g, " ").trim();
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
    restore();
  });

  /* 5. Sauvegarde locale */
  var timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var data = { v: 2, e: eds.map(function (el) { return el.innerHTML; }), c: checks.map(function (el) { return el.getAttribute("aria-checked") === "true"; }) };
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) { /* stockage indisponible : la fiche marche quand même */ }
    }, 300);
  }
  function restore() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!saved || saved.v !== 2) return;
      if (saved.e && saved.e.length === eds.length) eds.forEach(function (el, i) { el.innerHTML = saved.e[i]; });
      if (saved.c && saved.c.length === checks.length) checks.forEach(function (el, i) { setCheck(el, !!saved.c[i]); });
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
