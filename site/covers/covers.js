/* Générateur de covers DataUX, version navigateur.
   Même dessin que scripts/covers.py : le tirage au sort reproduit celui de Python (Mersenne Twister),
   donc un même titre donne la même image des deux côtés. Si tu changes un motif, change-le aux deux endroits. */
(function (root) {
"use strict";
const W = 1500, H = 600, CX = W / 2, CY = H / 2;
const RULES = {"REGLES": [["target", "fitts|task success|precision|doherty|first byte|first contentful|interaction to next|core web|seuil"], ["scale", "ancrage|tendance centrale|regression|chiffre de gauche|relativite|amorcage a bas prix|insensibilite|ampleur|normalite"], ["funnel", "conversion|drop-off|funnel|aarrr|onboarding completion|satisficing|parkinson"], ["diamonds", "double diamant|design thinking|change by design|service design thinking"], ["person", "persona|empathie|jobs to be done|projection|victime identifiable|eliza|anthropo|introspection|faux consensus"], ["clusters", "proximite|similarite|region commune|connexite|affinit|tri de cartes|endogroupe|exogroupe|polarisation|gestalt|pragnanz"], ["outlier", "restorff|saillance|contraste|beaute|halo|banniere|cecite|nouveaute|accessibility|erreur de mcnamara|stroop|esthetique"], ["tree", "hick|choix|arbre|opportunity solution|decision|ockham|comment pourrions|crazy 8|information architecture|morville"], ["gauge", "score|rating|net promoter|ease question|usability scale|umux|confiance|excès|exces|optimisme|supériorité|superiorite|dunning|certitude|risque zero|illusion de controle"], ["curve", "retention|churn|lifetime|active users|learnability|apprentissage|adaptation|return on investment|roi|hedonique|amorcage|exposition|engagement rate|bounce|adoption|spacement|espacement|negligence du taux"], ["bars", "test a/b|leurre|compromis|cadrage|benchmark|kano|ice|rice|heart|comparai|simpson|lean ux"], ["clock", "time on task|session duration|planification|present|duree|temps|zeigarnik|travail|retrospection|patience|sprint"], ["loop", "lean startup|scrum|renforcement|hooked|cycle|kanban|habitude|continuous discovery|skinner|fogg|engagement et coherence|prophetie|reciprocite|cascade"], ["canvas", "canvas|blueprint|story mapping|journal de bord|roadmap|raci|moscow|user story|invest|okr"], ["matrix", "matrice|valeur effort|pareto|severity|heuristique d'affect|evaluation heuristique|heuristic"], ["crowd", "preuve sociale|mode|conformite|pensee de groupe|temoin|paresse sociale|ignorance pluraliste|facilitation sociale|snob|fomo|contagion|autorite|reactance|hawthorne|acquiescement|desirabilite"], ["balance", "aversion|dotation|irrecuperable|compensation|justification|regret|omission|statu quo|defaut|douleur|surjustification|coût|cout|ikea|parce que|porte au nez"], ["mirror", "asymetrie|dissonance|transparence|projecteur|angle mort|auto-complaisance|attribution|malediction|croyance|raisonnement motive|confirmation|experimentateur|questions orientees|sympathie"], ["memory", "memoire|miller|charge cognitive|rappel|souvenir|amnesie|cryptomnesie|pic et|position serielle|google|generation|desinformation|effet d'ordre|disponibilite|reconnaissance|fluence|verite|ancien"], ["stack", "design system|tokens|pattern library|ui kit|atomic|style guide|standards|composants|elements of user"], ["star", "north star|objectif|gradient|flow|vision|inspired|value proposition|okr"], ["noise", "apophenie|correlation|frequence|petits nombres|p-hacking|joueur|representativite|conjonction|narrative|barnum|publication|survivant|selection|non-reponse|goodhart|base"], ["progress", "progression dotee|onboarding|completion|feature|recovery|error rate|effort"], ["spotlight", "attention|inattention|focalisation|perception selective|cocktail|attention selective|changement"], ["tag", "prix|gratuite|veblen|monetaire|comptabilite mentale|acquisition cost|payer|rarete"], ["journey", "parcours|enquete|contextuelle|prototypage|test utilisateur|instrument|paradoxe de l'utilisateur|jakob|mental|postel|tesler|don't make|krug|nudge|thaler"], ["bubbles", "entretien|questionnaire|think aloud|verbalisation|mom test|just enough research|uxr|charte editoriale|ton"], ["layers", "identite visuelle|charte graphique|brand|direction artistique|moodboard|thinking with type|about face|emotional design|design of everyday|everyday"]], "MANUEL": {"Modèle mental": "mirror", "Mémoire de travail": "memory", "Heuristique de représentativité": "noise", "Prophétie autoréalisatrice": "loop", "Service blueprint": "canvas", "Matrice valeur effort": "matrix", "Loi de Parkinson": "clock", "Satisficing": "progress", "Cascade d'information": "crowd", "Effet d'amorçage": "memory", "Négligence du taux de base": "noise", "OKR": "star", "Erreur de McNamara": "bars", "Biais d'impact": "gauge", "Biais de négativité": "balance", "Biais rétrospectif": "journey", "Effet Barnum": "person", "Écart d'information": "progress", "Illusion de profondeur explicative": "layers", "Effet de réflexion": "balance", "Heuristique d'affect": "balance", "Biais d'automatisation": "loop", "Biais de congruence à l'humeur": "mirror", "The Magical Number Seven, Plus or Minus Two": "article"}, "DEFAUT": {"kpi": "curve", "loi": "target", "biais": "noise", "methode": "journey", "framework": "canvas", "acteur": "monogram", "glossaire": "stack", "biblio": "book"}, "BASES": {"kpi": "#d9730d", "loi": "#337ea9", "biais": "#9065b0", "methode": "#448361", "framework": "#cb912f", "acteur": "#c14c8a", "glossaire": "#d44c47", "biblio": "#91918e"}};

// ---------- Hasard identique à Python (random.Random)
class PyRandom {
  constructor(seed) {                       // seed : BigInt positif
    this.mt = new Uint32Array(624); this.i = 624; this.gnext = null;
    const key = []; let s = seed; do { key.push(Number(s & 0xffffffffn)); s >>= 32n; } while (s > 0n);
    this.initArray(key);
  }
  mul(a, b) { return Number((BigInt(a) * BigInt(b)) & 0xffffffffn); }
  initGenrand(s) {
    const mt = this.mt; mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) mt[i] = (this.mul(1812433253, (mt[i - 1] ^ (mt[i - 1] >>> 30))) + i) >>> 0;
    this.i = 624;
  }
  initArray(key) {
    const mt = this.mt; this.initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(624, key.length); k; k--) {
      mt[i] = ((mt[i] ^ this.mul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
      i++; j++; if (i >= 624) { mt[0] = mt[623]; i = 1; } if (j >= key.length) j = 0;
    }
    for (let k = 623; k; k--) {
      mt[i] = ((mt[i] ^ this.mul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
      i++; if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000; this.i = 624;
  }
  u32() {
    const mt = this.mt;
    if (this.i >= 624) {
      let k = 0, y;
      for (; k < 227; k++) { y = (mt[k] & 0x80000000) | (mt[k + 1] & 0x7fffffff); mt[k] = mt[k + 397] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      for (; k < 623; k++) { y = (mt[k] & 0x80000000) | (mt[k + 1] & 0x7fffffff); mt[k] = mt[k - 227] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      y = (mt[623] & 0x80000000) | (mt[0] & 0x7fffffff); mt[623] = mt[396] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.i = 0;
    }
    let y = mt[this.i++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  }
  random() { const a = this.u32() >>> 5, b = this.u32() >>> 6; return (a * 67108864 + b) / 9007199254740992; }
  uniform(a, b) { return a + (b - a) * this.random(); }
  below(n) { if (n <= 0) return 0; const k = n.toString(2).length; let r; do { r = this.u32() >>> (32 - k); } while (r >= n); return r; }
  randrange(a, b) { return b === undefined ? this.below(a) : a + this.below(b - a); }
  randint(a, b) { return a + this.below(b - a + 1); }
  choice(arr) { return arr[this.below(arr.length)]; }
  gauss(mu, sigma) {
    let z = this.gnext; this.gnext = null;
    if (z === null) { const x = this.random() * 2 * Math.PI, g = Math.sqrt(-2 * Math.log(1 - this.random())); z = Math.cos(x) * g; this.gnext = Math.sin(x) * g; }
    return mu + z * sigma;
  }
  sampleRange(n, k) {                       // random.sample(range(n), k) pour les petits n
    const pool = Array.from({ length: n }, (_, i) => i), out = [];
    for (let i = 0; i < k; i++) { const j = this.below(n - i); out.push(pool[j]); pool[j] = pool[n - i - 1]; }
    return out;
  }
}

// ---------- Couleurs
const BASES = RULES.BASES;
const hx = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const roundEven = v => { const f = Math.floor(v), d = v - f; return d < .5 ? f : d > .5 ? f + 1 : (f % 2 === 0 ? f : f + 1); };
function mix(a, b, t) {
  const A = hx(a), B = hx(b);
  return "#" + A.map((x, i) => roundEven(x * (1 - t) + B[i] * t).toString(16).padStart(2, "0")).join("");
}
const slug = s => s.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f1 = x => x.toFixed(1);

function frame(color, body) {
  const bg = mix(color, "#121212", .84), glow = mix(color, "#121212", .45), acc = mix(color, "#ffffff", .45);
  let dots = "";
  for (let x = 30; x < W; x += 40) for (let y = 20; y < H; y += 40) dots += `<circle cx="${x}" cy="${y}" r="1.3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="g" cx="50%" cy="50%" r="60%">
<stop offset="0" stop-color="${glow}" stop-opacity=".55"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/>
</radialGradient></defs>
<rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="${H}" fill="url(#g)"/>
<g fill="#ffffff" opacity=".07">${dots}</g>
<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body.split("ACC").join(acc)}</g>
</svg>`;
}

// ---------- Briques (o = opacité ; opts : acc, w, dash, fill)
const A = acc => acc ? ' stroke="ACC"' : "";
const dot = (x, y, r = 6, o = 1, { acc = false } = {}) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${acc ? "ACC" : "#fff"}" stroke="none" opacity="${o.toFixed(2)}"/>`;
const ring = (x, y, r, o = 1, { acc = false, w = 4 } = {}) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" opacity="${o.toFixed(2)}" stroke-width="${w}"${A(acc)}/>`;
const line = (x1, y1, x2, y2, o = 1, { acc = false, dash = null, w = 4 } = {}) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" opacity="${o.toFixed(2)}" stroke-width="${w}"${A(acc)}${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const rect = (x, y, w, h, rx = 10, o = 1, { acc = false, fill = false } = {}) => {
  const f = fill && acc ? ' fill="ACC" stroke="none"' : fill ? ' fill="#fff" stroke="none"' : "";
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${rx}" opacity="${o.toFixed(2)}"${acc && !fill ? ' stroke="ACC"' : ""}${f}/>`;
};
const path = (d, o = 1, { acc = false, dash = null, w = 4, fill = null } = {}) => `<path d="${d}" opacity="${o.toFixed(2)}" stroke-width="${w}"${A(acc)}${dash ? ` stroke-dasharray="${dash}"` : ""}${fill ? ` fill="${fill}"` : ""}/>`;
const sin = Math.sin, cos = Math.cos, PI = Math.PI;

// ---------- Motifs
const M = {};
M.target = r => {
  const tx = CX + r.uniform(120, 300), ty = CY + r.uniform(-40, 40);
  const s = [[150, .25], [110, .45], [70, .7]].map(([R, o]) => ring(tx, ty, R, o));
  s.push(dot(tx, ty, 30, 1, { acc: true }));
  const sx = CX - r.uniform(380, 460), sy = CY + r.uniform(30, 110);
  s.push(path(`M${sx + 30} ${sy + 20} C ${CX - 200} ${sy + 80}, ${CX - 20} ${ty - 80}, ${tx - 34} ${ty}`, 1, { acc: true, dash: "2 14", w: 5 }));
  s.push(`<path d="M${sx} ${sy} l0 70 l18 -17 l14 30 l12 -6 l-14 -29 l24 -2 z" fill="#fff" stroke="none"/>`);
  return s;
};
M.scale = r => {
  const x0 = CX - 520, x1 = CX + 520, y = CY + 70;
  const s = [line(x0, y, x1, y, .6)];
  for (let i = 0; i < 11; i++) s.push(line(x0 + i * 104, y - 10, x0 + i * 104, y + 10, .4));
  const a = r.uniform(.2, .45), ax = x0 + a * (x1 - x0);
  s.push(line(ax, y - 210, ax, y + 30, 1, { acc: true, w: 10 }), ring(ax, y - 222, 16, 1, { acc: true, w: 6 }));
  const t = r.uniform(.62, .85), tx = x0 + t * (x1 - x0);
  s.push(line(tx, y - 120, tx, y + 20, .5, { dash: "3 12" }));
  for (let i = 0; i < 44; i++) { const x = x0 + r.gauss(a + .08, .09) * (x1 - x0); const yy = y - 30 - r.random() * 150; s.push(dot(x, yy, 7, .35 + r.random() * .5)); }
  return s;
};
M.funnel = r => {
  const n = r.choice([4, 5, 6]); let y = CY - 40 * n + 20; const s = [];
  for (let i = 0; i < n; i++) {
    const w = 900 * Math.pow(1 - i / n, 1.2) + 80, last = i === n - 1;
    s.push(rect(CX - w / 2, y, w, 44, 22, last ? 1 : .3 + i * .12, { acc: last, fill: last })); y += 74;
  }
  for (let i = 0; i < 24; i++) { const x = CX - 500 + r.random() * 1000; s.push(dot(x, CY - 40 * n - 20 - r.random() * 40, 5, .55)); }
  return s;
};
M.person = r => {
  const s = [ring(CX, CY - 60, 62, 1, { w: 5 }), path(`M${CX - 125} ${CY + 170} C ${CX - 125} ${CY + 40}, ${CX + 125} ${CY + 40}, ${CX + 125} ${CY + 170}`, 1, { w: 5 })];
  const hi = r.sampleRange(6, 2);
  [[-400, -150], [-440, -40], [-380, 80], [250, -160], [290, -50], [240, 70]].forEach(([dx, dy], i) => {
    const w = r.choice([150, 180, 210, 230]), x = CX + dx, acc = hi.includes(i);
    s.push(rect(x, CY + dy, w, 40, 20, acc ? 1 : .45, { acc }), line(x + 22, CY + dy + 20, x + w - 30, CY + dy + 20, acc ? 1 : .45, { acc, w: 5 }));
    const ex = dx < 0 ? CX - 70 : CX + 70, sx = dx < 0 ? x + w : x;
    s.push(line(sx, CY + dy + 20, ex, CY - 20, .3, { dash: "2 10" }));
  });
  return s;
};
M.diamonds = r => {
  const h = 170, w = 300, s = [];
  [CX - 2 * w, CX].forEach((left, i) => {
    s.push(`<polygon points="${left},${CY} ${left + w},${CY - h} ${left + 2 * w},${CY} ${left + w},${CY + h}" stroke-width="5" opacity="${i === 0 ? .7 : 1}"${i ? ' stroke="ACC"' : ""}/>`);
    s.push(line(left + w, CY - h, left + w, CY + h, .35, { dash: "2 12" }));
    for (let k = 0; k < 14; k++) {
      const x = left + w * (.35 + r.random() * 1.3), spread = h * (1 - Math.abs(x - (left + w)) / w) * .8;
      s.push(dot(x, CY + (r.random() * 2 - 1) * spread, 5, .45));
    }
  });
  [CX - 2 * w, CX, CX + 2 * w].forEach(x => s.push(dot(x, CY, 12)));
  return s;
};
M.clusters = r => {
  const k = r.choice([3, 4]), s = [];
  const centers = Array.from({ length: k }, (_, i) => [CX + (i - (k - 1) / 2) * 300, CY + r.uniform(-40, 40)]);
  const hi = r.randrange(k);
  centers.forEach(([cx, cy], i) => {
    if (i === hi) s.push(ring(cx, cy, 120, .5, { acc: true, w: 3 }));
    const n = r.randint(9, 14);
    for (let j = 0; j < n; j++) { const a = r.random() * 6.283, d = Math.pow(r.random(), .6) * 85; s.push(dot(cx + cos(a) * d, cy + sin(a) * d, 9, i === hi ? 1 : .55, { acc: i === hi })); }
  });
  return s;
};
M.outlier = r => {
  const cols = 13, rows = 5, gx = 80, gy = 70, x0 = CX - (cols - 1) * gx / 2, y0 = CY - (rows - 1) * gy / 2;
  const hxx = r.randrange(2, cols - 2), hyy = r.randrange(1, rows - 1), s = [], shape = r.choice(["dot", "square"]);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = x0 + i * gx, y = y0 + j * gy;
    if (i === hxx && j === hyy) s.push(ring(x, y, 34, .5, { acc: true, w: 3 }), dot(x, y, 18, 1, { acc: true }));
    else if (shape === "dot") s.push(dot(x, y, 9, .35));
    else s.push(rect(x - 9, y - 9, 18, 18, 3, .35, { fill: true }));
  }
  return s;
};
M.tree = r => {
  const s = [], levels = r.choice([3, 4]), x0 = CX - 480, step = 960 / levels; let nodes = [[x0, CY]];
  for (let lv = 1; lv <= levels; lv++) {
    const nw = [], n = levels === 3 ? Math.pow(2, lv) : Math.min(Math.pow(2, lv), 10), span = lv > 1 ? 380 : 220;
    for (let k = 0; k < n; k++) {
      const y = n > 1 ? CY - span / 2 + span * (k + .5) / n : CY;
      const [px, py] = nodes[Math.min(Math.floor(k * nodes.length / n), nodes.length - 1)], x = x0 + lv * step;
      s.push(path(`M${px} ${py} C ${px + step / 2} ${py}, ${x - step / 2} ${y}, ${x} ${y}`, .45, { w: 3 })); nw.push([x, y]);
    }
    nodes = nw;
  }
  const pick = r.randrange(nodes.length), [px, py] = nodes[pick];
  nodes.forEach(([x, y]) => s.push(dot(x, y, 7, .6)));
  s.push(dot(x0, CY, 12), dot(px, py, 14, 1, { acc: true }), ring(px, py, 28, .6, { acc: true, w: 3 }));
  return s;
};
M.gauge = r => {
  const v = r.uniform(.55, .9), R = 210, cy = CY + 120;
  const s = [path(`M${CX - R} ${cy} A ${R} ${R} 0 0 1 ${CX + R} ${cy}`, .3, { w: 24 })];
  const a = PI * (1 - v), ex = CX + R * cos(a), ey = cy - R * sin(a);
  s.push(path(`M${CX - R} ${cy} A ${R} ${R} 0 0 1 ${f1(ex)} ${f1(ey)}`, 1, { acc: true, w: 24 }));
  for (let i = 0; i < 11; i++) { const t = PI * i / 10, c = cos(t), sn = sin(t); s.push(line(CX + (R + 30) * c, cy - (R + 30) * sn, CX + (R + 44) * c, cy - (R + 44) * sn, .5, { w: 3 })); }
  s.push(line(CX, cy, CX + (R - 60) * cos(a), cy - (R - 60) * sin(a), 1, { w: 6 }), dot(CX, cy, 14));
  return s;
};
M.curve = r => {
  const kind = r.choice(["up", "down", "log", "decay"]), x0 = CX - 520, x1 = CX + 520, yb = CY + 170, yt = CY - 170, pts = [];
  for (let i = 0; i < 41; i++) {
    const t = i / 40;
    let v = { up: t ** 2, down: 1 - t ** .5, log: Math.log1p(9 * t) / Math.log(10), decay: .15 + .85 * Math.exp(-4 * t) }[kind];
    v = Math.min(1, Math.max(0, v + r.uniform(-.02, .02))); pts.push([x0 + t * (x1 - x0), yb - v * (yb - yt)]);
  }
  const d = "M" + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(" L");
  const s = [line(x0, yb, x1, yb, .5), line(x0, yb, x0, yt - 20, .5)];
  for (let k = 1; k < 5; k++) s.push(line(x0, yb - k * 85, x1, yb - k * 85, .12, { w: 2 }));
  s.push(path(`${d} L${x1} ${yb} L${x0} ${yb} Z`, 0, { fill: "ACC" }));
  s.push(path(d, 1, { acc: true, w: 6 }));
  s.push(path(`${d} L${x1} ${yb} L${x0} ${yb} Z`, .12, { fill: "ACC" }).replace('stroke-width="4"', 'stroke="none"'));
  const [lx, ly] = pts[pts.length - 1];
  s.push(dot(lx, ly, 12, 1, { acc: true }), ring(lx, ly, 26, .5, { acc: true, w: 3 }));
  return s;
};
M.bars = r => {
  const n = r.choice([2, 3, 4]), hi = r.randrange(n), s = [], bw = 150, gap = 90, total = n * bw + (n - 1) * gap, yb = CY + 180; let x = CX - total / 2;
  for (let i = 0; i < n; i++) { const h = i !== hi ? r.uniform(140, 330) : 350; s.push(rect(x, yb - h, bw, h, 14, i === hi ? 1 : .4, { acc: i === hi, fill: i === hi })); x += bw + gap; }
  s.push(line(CX - total / 2 - 60, yb, CX + total / 2 + 60, yb, .5));
  return s;
};
M.clock = r => {
  const R = 190, s = [ring(CX, CY, R, .8, { w: 5 })];
  for (let i = 0; i < 12; i++) { const a = i * PI / 6; s.push(line(CX + (R - 26) * sin(a), CY - (R - 26) * cos(a), CX + (R - 10) * sin(a), CY - (R - 10) * cos(a), .5, { w: 4 })); }
  const f = r.uniform(.2, .75), a = f * 2 * PI, ex = CX + (R - 55) * sin(a), ey = CY - (R - 55) * cos(a), large = f > .5 ? 1 : 0;
  s.push(path(`M${CX} ${CY - (R - 55)} A ${R - 55} ${R - 55} 0 ${large} 1 ${f1(ex)} ${f1(ey)}`, 1, { acc: true, w: 16 }));
  s.push(line(CX, CY, CX + 90 * sin(a * .3), CY - 90 * cos(a * .3), 1, { w: 6 }), line(CX, CY, ex, ey, 1, { acc: true, w: 4 }), dot(CX, CY, 10));
  s.push(line(CX - 620, CY, CX - 260, CY, .25, { dash: "2 14" }), line(CX + 260, CY, CX + 620, CY, .25, { dash: "2 14" }));
  return s;
};
M.loop = r => {
  const s = [], R = 170, n = r.choice([3, 4, 5, 6]), hi = r.randrange(n);
  s.push(ring(CX, CY, R, .35, { w: 4 }));
  for (let i = 0; i < n; i++) {
    const a = -PI / 2 + i * 2 * PI / n, x = CX + R * cos(a), y = CY + R * sin(a);
    s.push(dot(x, y, i === hi ? 22 : 14, i === hi ? 1 : .8, { acc: i === hi }));
    const b = a + PI / n, ax = CX + R * cos(b), ay = CY + R * sin(b), tx = -sin(b), ty = cos(b);
    s.push(path(`M${f1(ax - tx * 14 - cos(b) * 10)} ${f1(ay - ty * 14 - sin(b) * 10)} L${f1(ax)} ${f1(ay)} L${f1(ax - tx * 14 + cos(b) * 10)} ${f1(ay - ty * 14 + sin(b) * 10)}`, .7, { w: 4 }));
  }
  s.push(ring(CX - 520, CY, 60, .15), ring(CX + 520, CY, 60, .15));
  return s;
};
M.canvas = r => {
  const cols = r.choice([3, 4, 5]), rows = r.choice([2, 3]), gw = 860, gh = 380, x0 = CX - gw / 2, y0 = CY - gh / 2, cw = gw / cols, ch = gh / rows;
  const hi = [r.randrange(cols), r.randrange(rows)], s = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const acc = i === hi[0] && j === hi[1];
    s.push(rect(x0 + i * cw + 8, y0 + j * ch + 8, cw - 16, ch - 16, 12, acc ? 1 : .35, { acc }));
    const n = r.randint(1, 3);
    for (let k = 0; k < n; k++) { const ww = (cw - 60) * r.uniform(.4, .9); s.push(line(x0 + i * cw + 30, y0 + j * ch + 38 + k * 22, x0 + i * cw + 30 + ww, y0 + j * ch + 38 + k * 22, acc ? .9 : .3, { acc, w: 5 })); }
  }
  return s;
};
M.matrix = r => {
  const s = [line(CX - 300, CY, CX + 300, CY, .6), line(CX, CY - 220, CX, CY + 220, .6), rect(CX - 300, CY - 220, 600, 440, 18, .2)];
  const q = r.randrange(4), qx = (q % 2 === 0 ? -1 : 1) * 150, qy = (q < 2 ? -1 : 1) * 110;
  s.push(rect(CX + qx - 140, CY + qy - 100, 280, 200, 14, .9, { acc: true }));
  for (let i = 0; i < 16; i++) { const x = CX + r.uniform(-270, 270), y = CY + r.uniform(-190, 190), inq = (x - CX) * qx > 0 && (y - CY) * qy > 0; s.push(dot(x, y, 9, inq ? .95 : .35, { acc: inq })); }
  return s;
};
M.crowd = r => {
  const s = [];
  for (let i = 0; i < 11; i++) for (let j = 0; j < 4; j++) { const x = CX - 500 + i * 100 + (j % 2) * 50, y = CY - 150 + j * 100; s.push(path(`M${x - 18} ${y} L${x + 18} ${y} M${x + 6} ${y - 12} L${x + 18} ${y} L${x + 6} ${y + 12}`, .4, { w: 4 })); }
  const x = CX + r.choice([-1, 1]) * r.choice([50, 150]), y = CY - 50 + r.choice([0, 100]), flip = r.random() < .5;
  const d = flip ? `M${x + 26} ${y} L${x - 26} ${y} M${x - 10} ${y - 16} L${x - 26} ${y} L${x - 10} ${y + 16}` : `M${x - 26} ${y} L${x + 26} ${y} M${x + 10} ${y - 16} L${x + 26} ${y} L${x + 10} ${y + 16}`;
  s.push(rect(x - 46, y - 40, 92, 80, 40, .9, { acc: true, fill: true }).replace('opacity="0.90"', 'opacity="0.18"'), path(d, 1, { acc: true, w: 7 }));
  return s;
};
M.balance = r => {
  const t = r.uniform(-.25, .25), L = 340, lx = CX - L * cos(t), ly = CY - 40 - L * sin(t), rx = CX + L * cos(t), ry = CY - 40 + L * sin(t);
  const s = [path(`M${CX - 70} ${CY + 190} L${CX} ${CY - 40} L${CX + 70} ${CY + 190}`, .6, { w: 5 }), line(lx, ly, rx, ry, 1, { w: 6 }), dot(CX, CY - 40, 12)];
  [[lx, ly, true], [rx, ry, false]].forEach(([x, y, acc]) => s.push(line(x, y, x - 70, y + 110, .5, { w: 3 }), line(x, y, x + 70, y + 110, .5, { w: 3 }),
    path(`M${x - 90} ${y + 110} L${x + 90} ${y + 110} Q${x} ${y + 170} ${x - 90} ${y + 110} Z`, 1, { acc, w: 5 })));
  s.push(dot(lx, ly + 90, r.choice([22, 30, 38]), 1, { acc: true }), dot(rx - 20, ry + 92, 14, .8), dot(rx + 18, ry + 92, 14, .8));
  return s;
};
M.mirror = r => {
  const s = [line(CX, CY - 220, CX, CY + 220, .35, { dash: "3 14" })];
  [-1, 1].forEach(side => {
    const x = CX + side * 280, acc = side === 1;
    s.push(ring(x, CY - 40, 50, acc ? 1 : .6, { acc, w: 5 }), path(`M${x - 95} ${CY + 160} C ${x - 95} ${CY + 50}, ${x + 95} ${CY + 50}, ${x + 95} ${CY + 160}`, acc ? 1 : .6, { acc, w: 5 }));
  });
  const n = r.randint(3, 5);
  for (let k = 0; k < n; k++) { const y = CY - 120 + k * 50; s.push(path(`M${CX - 190} ${y} Q${CX} ${y - 40 + r.uniform(-20, 20)} ${CX + 190} ${y}`, .25, { dash: "2 10", w: 3 })); }
  return s;
};
M.memory = r => {
  const n = 12, s = [], keep = new Set(r.sampleRange(n, r.choice([2, 3]))), shape = r.choice(["U", "flat", "end"]);
  for (let i = 0; i < n; i++) {
    const x = CX - 550 + i * 100;
    let o = { U: .2 + .8 * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2), flat: .3, end: .2 + .8 * i / (n - 1) }[shape];
    const acc = keep.has(i) && shape === "flat"; if (acc) o = 1;
    s.push(rect(x - 34, CY - 70, 68, 140, 14, o, { acc }), line(x - 16, CY - 20, x + 16, CY - 20, o, { acc, w: 5 }), line(x - 16, CY + 10, x + 8, CY + 10, o * .7, { acc, w: 5 }));
  }
  s.push(path(`M${CX - 560} ${CY + 140} Q${CX} ${CY + 210} ${CX + 560} ${CY + 140}`, .3, { dash: "2 14", w: 3 }));
  return s;
};
M.stack = r => {
  const s = []; let y = CY + 140;
  [5, 3, 1].forEach((k, li) => {
    const w = 140, gap = 24, tot = k * w + (k - 1) * gap; let x = CX - tot / 2;
    for (let i = 0; i < k; i++) { const acc = li === 2; s.push(rect(x, y - 60, w, 60, 10, acc ? 1 : .35 + li * .25, { acc, fill: acc })); x += w + gap; }
    y -= 100;
  });
  s.push(dot(CX - 460, CY - 120, 10, .4), dot(CX - 420, CY - 150, 6, .3), dot(CX + 460, CY + 100, 10, .4), ring(CX + 430, CY - 120, 24, .3));
  return s;
};
M.star = r => {
  const s = [], sx = CX + r.uniform(200, 340), sy = CY - r.uniform(60, 120), pts = [];
  for (let i = 0; i < 8; i++) { const a = -PI / 2 + i * PI / 4, R = i % 2 === 0 ? 46 : 14; pts.push(`${f1(sx + R * cos(a))},${f1(sy + R * sin(a))}`); }
  s.push(`<polygon points="${pts.join(" ")}" fill="ACC" stroke="none"/>`, ring(sx, sy, 80, .3, { acc: true, w: 3 }));
  const n = r.randint(3, 5);
  for (let k = 0; k < n; k++) {
    const x0 = CX - 520 + r.uniform(0, 80), y0 = CY + 160 - k * 60 + r.uniform(-20, 20);
    s.push(path(`M${x0} ${y0} Q${(x0 + sx) / 2} ${y0 + r.uniform(-60, 60)} ${sx - 60} ${sy + 30}`, .35 + k * .1, { dash: "2 14", w: 4 }), dot(x0, y0, 8, .7));
  }
  return s;
};
M.noise = r => {
  const s = [];
  for (let i = 0; i < 120; i++) { const x = CX - 560 + r.random() * 1120, y = CY - 220 + r.random() * 440; s.push(dot(x, y, 6, .25 + r.random() * .3)); }
  const pts = [];
  for (let i = 0; i < 6; i++) { const x = CX - 400 + i * 160 + r.uniform(-40, 40); pts.push([x, CY + r.uniform(-140, 140)]); }
  s.push(path("M" + pts.map(([x, y]) => `${x.toFixed(0)} ${y.toFixed(0)}`).join(" L"), 1, { acc: true, dash: "2 12", w: 5 }));
  pts.forEach(([x, y]) => s.push(dot(x, y, 12, 1, { acc: true })));
  return s;
};
M.progress = r => {
  const s = [], n = r.choice([3, 4, 5]), f = r.uniform(.35, .85);
  for (let k = 0; k < n; k++) {
    const y = CY - (n - 1) * 45 + k * 90, ff = k === Math.floor(n / 2) ? f : r.uniform(.15, 1), acc = k === Math.floor(n / 2);
    s.push(rect(CX - 450, y - 16, 900, 32, 16, .25), rect(CX - 450, y - 16, 900 * ff, 32, 16, acc ? 1 : .45, { acc, fill: true }));
  }
  return s;
};
M.spotlight = r => {
  const s = [];
  for (let i = 0; i < 70; i++) { const x = CX - 560 + r.random() * 1120, y = CY - 220 + r.random() * 440; s.push(dot(x, y, 7, .2)); }
  const fx = CX + r.uniform(-200, 200), fy = CY + r.uniform(-60, 60);
  s.push(path(`M${CX - 600} ${CY - 260} L${fx - 120} ${fy - 5} L${fx - 120} ${fy + 5} L${CX - 600} ${CY + 260}`, .12, { fill: "#ffffff" }).replace('stroke-width="4"', 'stroke="none"'), ring(fx, fy, 120, .9, { acc: true, w: 4 }));
  for (let i = 0; i < 5; i++) { const dx = r.uniform(-60, 60), dy = r.uniform(-60, 60); s.push(dot(fx + dx, fy + dy, 10, 1, { acc: true })); }
  return s;
};
M.tag = r => {
  const x = CX - 40, y = CY;
  const s = [path(`M${x - 180} ${y - 90} L${x + 100} ${y - 90} L${x + 200} ${y} L${x + 100} ${y + 90} L${x - 180} ${y + 90} Z`, 1, { acc: true, w: 6 }), ring(x + 110, y, 18, 1, { acc: true, w: 5 })];
  s.push(line(x - 140, y - 25, x + 10, y - 25, 1, { w: 10 }), line(x - 140, y + 25, x - 50, y + 25, .5, { w: 10 }));
  for (let i = 0; i < 9; i++) { const a = r.random() * 6.28, d = r.uniform(320, 480); s.push(ring(CX + cos(a) * d, CY + sin(a) * d * .5, r.choice([12, 18, 24]), .35, { w: 3 })); }
  return s;
};
M.journey = r => {
  const s = [], pts = [];
  for (let i = 0; i < 7; i++) { const q = r.random(); pts.push([CX - 540 + i * 180, CY + 120 * sin(i * 1.1 + q) * r.uniform(.6, 1)]); }
  let d = `M${pts[0][0].toFixed(0)} ${pts[0][1].toFixed(0)} `;
  d += pts.slice(1).map(([x, y], i) => `S${((x + pts[i][0]) / 2).toFixed(0)} ${y.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)}`).join(" ");
  s.push(path(d, .7, { w: 5 }));
  const hi = r.randrange(1, 6);
  pts.forEach(([x, y], i) => { s.push(dot(x, y, i === hi ? 16 : 10, 1, { acc: i === hi })); if (i === hi) s.push(ring(x, y, 34, .6, { acc: true, w: 3 })); });
  const [lx, ly] = pts[6];
  s.push(path(`M${lx + 10} ${ly - 50} L${lx + 10} ${ly - 10} M${lx + 10} ${ly - 50} L${lx + 50} ${ly - 38} L${lx + 10} ${ly - 26}`, 1, { acc: true, w: 4 }));
  return s;
};
M.bubbles = r => {
  const s = [];
  [[CX - 470, CY - 150, 380, 120, -1], [CX + 90, CY - 30, 380, 120, 1], [CX - 380, CY + 110, 300, 90, -1]].forEach(([x, y, w, h, side], i) => {
    const acc = i === 1, tail = side < 0 ? `M${x + 50} ${y + h} L${x + 40} ${y + h + 36} L${x + 90} ${y + h}` : `M${x + w - 90} ${y + h} L${x + w - 40} ${y + h + 36} L${x + w - 50} ${y + h}`;
    s.push(rect(x, y, w, h, 28, acc ? 1 : .5, { acc }), path(tail, acc ? 1 : .5, { acc }));
    for (let k = 0; k < 2; k++) { const ww = (w - 80) * r.uniform(.5, 1) * (k === 0 ? 1 : .6); s.push(line(x + 40, y + 42 + k * 34, x + 40 + ww, y + 42 + k * 34, acc ? 1 : .5, { acc, w: 6 })); }
  });
  s.push(r.random() < .5 ? `<text x="${CX + 330}" y="${CY - 120}" font-family="Inter Display, Inter, sans-serif" font-weight="200" font-size="160" fill="ACC" stroke="none" opacity=".9">?</text>` : "");
  return s;
};
M.layers = r => {
  const s = [], n = r.choice([3, 4, 5]), hi = r.randrange(n);
  for (let i = 0; i < n; i++) { const y = CY + 150 - i * 75, w = 700 - i * 60, acc = i === hi; s.push(path(`M${CX - w / 2} ${y} L${CX} ${y - 60} L${CX + w / 2} ${y} L${CX} ${y + 60} Z`, acc ? 1 : .35 + i * .1, { acc, w: 5 })); }
  return s;
};
M.network = r => {
  const s = [], nodes = [];
  for (let i = 0; i < 16; i++) { const x = CX + r.uniform(-520, 520); nodes.push([x, CY + r.uniform(-200, 200)]); }
  const hub = r.randrange(16);
  nodes.forEach(([x, y], i) => nodes.slice(i + 1).forEach(([x2, y2], k) => { const j = i + 1 + k; if (Math.hypot(x - x2, y - y2) < 260) s.push(line(x, y, x2, y2, hub === i || hub === j ? .7 : .2, { acc: hub === i || hub === j, w: 3 })); }));
  nodes.forEach(([x, y], i) => s.push(dot(x, y, i === hub ? 16 : 8, i === hub ? 1 : .7, { acc: i === hub })));
  return s;
};
M.book = r => {
  const s = [], x = CX - 150, y = CY - 210, w = 300, h = 420;
  s.push(rect(x + 22, y + 14, w, h, 10, .25), rect(x, y, w, h, 10, 1, { acc: true }), line(x + 34, y, x + 34, y + h, .5, { w: 3 }));
  const n = r.choice([2, 3]);
  for (let k = 0; k < n; k++) { const ww = (w - 110) * r.uniform(.5, 1); s.push(line(x + 70, y + 80 + k * 34, x + 70 + ww, y + 80 + k * 34, .9, { w: 8 })); }
  s.push(r.choice([ring(x + w / 2 + 15, y + h - 120, 50, .6, { acc: true }), rect(x + w / 2 - 35, y + h - 165, 100, 100, 8, .6, { acc: true })]));
  [-1, 1].forEach(side => { const n2 = r.randint(2, 4); for (let k = 0; k < n2; k++) { const bx = CX + side * (260 + k * 46), hh = r.uniform(240, 380); s.push(rect(bx - 16, CY + 200 - hh, 32, hh, 6, .25)); } });
  return s;
};
M.article = r => {
  const s = [], w = 340, h = 450, x = CX - w / 2, y = CY - h / 2 - 5, c = 70;
  [[2, .15], [1, .28]].forEach(([k, o]) => s.push(rect(x + 26 * k, y - 14 * k, w, h, 8, o)));
  s.push(path(`M${x} ${y + 8} Q ${x} ${y}, ${x + 8} ${y} L ${x + w - c} ${y} L ${x + w} ${y + c} L ${x + w} ${y + h - 8} Q ${x + w} ${y + h}, ${x + w - 8} ${y + h} L ${x + 8} ${y + h} Q ${x} ${y + h}, ${x} ${y + h - 8} Z`, 1, { acc: true }));
  s.push(path(`M${x + w - c} ${y} L ${x + w - c} ${y + c} L ${x + w} ${y + c}`, .7, { w: 4 }));
  s.push(line(x + 36, y + 56, x + 36 + (w - 150) * r.uniform(.7, 1), y + 56, 1, { w: 10 }), line(x + 36, y + 84, x + 36 + 130, y + 84, .5, { w: 4 }), line(x + 36, y + 110, x + w - 36, y + 110, .3, { w: 2 }));
  const col = (w - 96) / 2;
  [x + 36, x + 60 + col].forEach(cx => { const n = r.choice([6, 7]); for (let k = 0; k < n; k++) { const ww = col * (k < 5 ? 1 : r.uniform(.4, .8)); s.push(line(cx, y + 138 + k * 24, cx + ww, y + 138 + k * 24, .4, { w: 4 })); } });
  const gx = x + 36, gy = y + h - 130;
  s.push(line(gx, gy, gx, gy + 70, .6, { w: 3 }), line(gx, gy + 70, gx + 110, gy + 70, .6, { w: 3 }));
  const hi = r.randrange(5);
  for (let k = 0; k < 5; k++) { const bh = k !== hi ? r.uniform(20, 62) : 66; s.push(rect(gx + 14 + k * 20, gy + 70 - bh, 12, bh, 2, k === hi ? 1 : .45, { acc: k === hi, fill: true })); }
  s.push(`<text x="${x + w - 70}" y="${y + h - 40}" font-family="Inter Display, Inter, sans-serif" font-weight="300" font-size="34" fill="ACC" stroke="none" opacity=".9">[1]</text>`);
  [-1, 1].forEach(side => { const n = r.randint(2, 3); for (let k = 0; k < n; k++) { const bx = CX + side * (300 + k * 70), by = CY - 120 + k * 100 + r.uniform(-20, 20); s.push(rect(bx - 22, by - 30, 44, 60, 4, .25), line(bx - 12, by - 12, bx + 12, by - 12, .25, { w: 3 }), line(bx - 12, by + 2, bx + 8, by + 2, .25, { w: 3 })); } });
  return s;
};
M.monogram = (r, nom) => {
  const parts = nom.split(/[\s\-.()]+/).filter(p => p && /\p{L}/u.test(p[0]) && !["et", "de", "la", "avec", "l"].includes(p.toLowerCase()));
  const ini = parts.slice(0, 2).map(p => p[0].toUpperCase()).join("") || nom.slice(0, 1);
  const s = [ring(CX, CY, 210, .3, { w: 2 }), ring(CX, CY, 170, .6, { acc: true, w: 3 })], a0 = r.random() * 6.28;
  for (let k = 0; k < 5; k++) s.push(dot(CX + 210 * cos(a0 + k * .5), CY + 210 * sin(a0 + k * .5), 8 - k, .8 - k * .1, { acc: k === 0 }));
  s.push(`<text x="${CX}" y="${CY + 58}" text-anchor="middle" font-family="Inter Display, Inter, sans-serif" font-weight="200" font-size="170" letter-spacing="6" fill="#ffffff" stroke="none">${esc(ini)}</text>`);
  return s;
};

// ---------- Choix automatique du motif d'après le titre
const norm = s => s.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
const REGEX = RULES.REGLES.map(([m, rx]) => [m, new RegExp(norm(rx))]);
function choose(f) {
  if (RULES.MANUEL[f.nom]) return RULES.MANUEL[f.nom];
  if (f.base === "acteur") return "monogram";
  if (f.base === "biblio") return "book";
  const n = norm(f.nom);
  for (const [m, rx] of REGEX) if (rx.test(n)) return m;
  return RULES.DEFAUT[f.base];
}

// ---------- API
async function seedOf(nom) {                // même graine que Python : sha256(titre)[:12] en hexadécimal
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nom));
  return BigInt("0x" + [...new Uint8Array(h)].slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join(""));
}
function drawWith(seed, f) {
  const r = new PyRandom(seed), m = f.motif || choose(f);
  const body = (m === "monogram" ? M.monogram(r, f.nom) : M[m](r)).filter(Boolean).join("\n");
  return { motif: m, svg: frame(BASES[f.base], body) };
}
async function draw(f) { return drawWith(await seedOf(f.nom), f); }

const api = { W, H, BASES, MOTIFS: Object.keys(M), draw, drawWith, seedOf, choose, slug, PyRandom };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Covers = api;
})(typeof window !== "undefined" ? window : globalThis);
