/* Fiches modifiables DataUX.
   Rend les zones vides de la fiche modifiables, les cases à cocher cliquables,
   garde la saisie dans le navigateur (localStorage) et permet d'enregistrer une image PNG.
   Rien n'est envoyé à un serveur. */
(function () {
  "use strict";
  var root = document.querySelector(".root");
  if (!root) return;
  var KEY = "dataux-fiche:" + location.pathname;
  var NB = /[\s ​]/g;

  function empty(el) { return el.textContent.replace(NB, "") === ""; }
  function leaf(el) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.tagName !== "BR") return false;
    return true;
  }

  /* 1. Cases à cocher */
  var checks = [];
  // Cases dessinées (.cb i)
  root.querySelectorAll(".cb > i").forEach(function (i) { i.setAttribute("data-ck", ""); checks.push(i); });
  // Caractères ☐ et ○ dans le texte : chacun devient un élément cliquable
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  var texts = [];
  while (walker.nextNode()) if (/[☐○]/.test(walker.currentNode.nodeValue)) texts.push(walker.currentNode);
  texts.forEach(function (t) {
    var frag = document.createDocumentFragment();
    t.nodeValue.split(/([☐○])/).forEach(function (part) {
      if (part === "☐" || part === "○") {
        var s = document.createElement("span");
        s.textContent = part; s.setAttribute("data-ck", part); checks.push(s); frag.appendChild(s);
      } else if (part) frag.appendChild(document.createTextNode(part));
    });
    t.parentNode.replaceChild(frag, t);
  });
  function setCheck(el, on) {
    var k = el.getAttribute("data-ck");
    if (k === "☐") el.textContent = on ? "☒" : "☐";
    else if (k === "○") el.textContent = on ? "●" : "○";
    else el.classList.toggle("on", on);
    el.setAttribute("aria-checked", on ? "true" : "false");
  }
  checks.forEach(function (el) {
    el.setAttribute("role", "checkbox"); el.setAttribute("tabindex", "0"); el.setAttribute("aria-checked", "false");
    function toggle() { setCheck(el, el.getAttribute("aria-checked") !== "true"); save(); }
    el.addEventListener("click", toggle);
    el.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } });
  });

  /* 2. Zones de saisie */
  var eds = [];
  var SMALL = ".fld i, .ft .d i, u, .ini i";
  var ALWAYS = ".bx";
  root.querySelectorAll("*").forEach(function (el) {
    if (el.hasAttribute("data-ck") || el.closest("[data-ed]") || el.closest("h1, h2")) return;
    var ok = false;
    if (el.matches(ALWAYS)) ok = !el.querySelector("[data-ck]");
    else if (el.matches(SMALL)) ok = empty(el);
    else if (leaf(el) && empty(el) && !el.matches(".n, i[style*='border-radius:50%']")) {
      var r = el.getBoundingClientRect();
      ok = r.width >= 30 && r.height >= 14;
    }
    if (!ok) return;
    el.setAttribute("data-ed", "");
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "true");
    if (el.matches(SMALL)) el.setAttribute("data-line", "");
    eds.push(el);
  });
  eds.forEach(function (el) {
    el.addEventListener("input", save);
    el.addEventListener("paste", function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData("text/plain");
      if (el.hasAttribute("data-line")) t = t.replace(/\s*\n\s*/g, " ");
      document.execCommand("insertText", false, t);
    });
    if (el.hasAttribute("data-line")) el.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
  });

  /* 3. Sauvegarde locale */
  var timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var data = { e: eds.map(function (el) { return el.innerHTML; }), c: checks.map(function (el) { return el.getAttribute("aria-checked") === "true"; }) };
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (err) { /* stockage indisponible : la fiche marche quand même */ }
    }, 300);
  }
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.e && saved.e.length === eds.length) eds.forEach(function (el, i) { el.innerHTML = saved.e[i]; });
    if (saved && saved.c && saved.c.length === checks.length) checks.forEach(function (el, i) { setCheck(el, !!saved.c[i]); });
  } catch (err) { /* rien à restaurer */ }

  /* 4. Barre d'outils */
  var slug = location.pathname.split("/").pop().replace(/\.html$/, "") || "fiche";
  var bar = document.createElement("div");
  bar.className = "tb";
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
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      return window.htmlToImage.toPng(root, { pixelRatio: 2, backgroundColor: "#ffffff", style: { margin: "0", outline: "0" } });
    }).then(function (url) {
      var a = document.createElement("a");
      a.href = url; a.download = slug + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      msg.textContent = "Image enregistrée";
    }).catch(function () {
      msg.textContent = "L'image n'a pas pu être créée. Essayez « Imprimer / PDF ».";
    }).then(function () {
      btn.disabled = false;
      document.documentElement.classList.remove("capturing");
    });
  }
})();
