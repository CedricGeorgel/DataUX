#!/usr/bin/env python3
"""Covers des fiches DataUX.

Usage : python3 scripts/covers.py fiches.json site/covers
  fiches.json : [{"id": "<page notion>", "base": "biais", "nom": "Effet d'ancrage"}, ...]
Sortie : un PNG 1500 x 600 par fiche, nommé d'après son titre, et covers.json (id -> fichier).

Chaque fiche reçoit un motif tiré de sa notion (règles par mots-clés plus bas),
dans la couleur de sa base. Le hasard est fixé par le titre : relancer le script
redonne exactement les mêmes images.
"""
import hashlib, json, math, os, random, re, subprocess, sys, unicodedata

W, H = 1500, 600
CX, CY = W / 2, H / 2

BASES = {
    "kpi": "#d9730d", "loi": "#337ea9", "biais": "#9065b0", "methode": "#448361",
    "framework": "#cb912f", "acteur": "#c14c8a", "glossaire": "#d44c47", "biblio": "#91918e",
}


def hx(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    a, b = hx(a), hx(b)
    return "#%02x%02x%02x" % tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def frame(color, body):
    bg = mix(color, "#121212", 0.84)
    glow = mix(color, "#121212", 0.45)
    acc = mix(color, "#ffffff", 0.45)
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="1.3"/>' for x in range(30, W, 40) for y in range(20, H, 40))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs><radialGradient id="g" cx="50%" cy="50%" r="60%">
<stop offset="0" stop-color="{glow}" stop-opacity=".55"/><stop offset="1" stop-color="{bg}" stop-opacity="0"/>
</radialGradient></defs>
<rect width="{W}" height="{H}" fill="{bg}"/><rect width="{W}" height="{H}" fill="url(#g)"/>
<g fill="#ffffff" opacity=".07">{dots}</g>
<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">{body.replace("ACC", acc)}</g>
</svg>'''


# ---------- petites briques ----------

def dot(x, y, r=6, o=1, acc=False):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{"ACC" if acc else "#fff"}" stroke="none" opacity="{o:.2f}"/>'


def ring(x, y, r, o=1, acc=False, w=4):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" opacity="{o:.2f}" stroke-width="{w}"{" stroke=\"ACC\"" if acc else ""}/>'


def line(x1, y1, x2, y2, o=1, acc=False, dash=None, w=4):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" opacity="{o:.2f}" stroke-width="{w}"{" stroke=\"ACC\"" if acc else ""}{d}/>'


def rect(x, y, w, h, rx=10, o=1, acc=False, fill=False):
    f = ' fill="ACC" stroke="none"' if (fill and acc) else (' fill="#fff" stroke="none"' if fill else "")
    s = ' stroke="ACC"' if (acc and not fill) else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" opacity="{o:.2f}"{s}{f}/>'


def path(d, o=1, acc=False, dash=None, w=4, fill=None):
    a = f' stroke-dasharray="{dash}"' if dash else ""
    f = f' fill="{fill}"' if fill else ""
    return f'<path d="{d}" opacity="{o:.2f}" stroke-width="{w}"{" stroke=\"ACC\"" if acc else ""}{a}{f}/>'


# ---------- motifs ----------
# Chaque motif reçoit r (random.Random fixé par le titre) et renvoie une liste d'éléments SVG.

def m_target(r):
    tx = CX + r.uniform(120, 300); ty = CY + r.uniform(-40, 40)
    s = [ring(tx, ty, R, o) for R, o in ((150, .25), (110, .45), (70, .7))]
    s.append(dot(tx, ty, 30, acc=True))
    sx, sy = CX - r.uniform(380, 460), CY + r.uniform(30, 110)
    s.append(path(f"M{sx + 30} {sy + 20} C {CX - 200} {sy + 80}, {CX - 20} {ty - 80}, {tx - 34} {ty}", acc=True, dash="2 14", w=5))
    s.append(f'<path d="M{sx} {sy} l0 70 l18 -17 l14 30 l12 -6 l-14 -29 l24 -2 z" fill="#fff" stroke="none"/>')
    return s


def m_scale(r):
    # échelle, un repère appuyé, des points qui s'agglutinent autour
    x0, x1, y = CX - 520, CX + 520, CY + 70
    s = [line(x0, y, x1, y, .6)] + [line(x0 + i * 104, y - 10, x0 + i * 104, y + 10, .4) for i in range(11)]
    a = r.uniform(.2, .45); ax = x0 + a * (x1 - x0)
    s += [line(ax, y - 210, ax, y + 30, acc=True, w=10), ring(ax, y - 222, 16, acc=True, w=6)]
    t = r.uniform(.62, .85); tx = x0 + t * (x1 - x0)
    s.append(line(tx, y - 120, tx, y + 20, .5, dash="3 12"))
    for _ in range(44):
        x = x0 + r.gauss(a + .08, .09) * (x1 - x0)
        s.append(dot(x, y - 30 - r.random() * 150, 7, .35 + r.random() * .5))
    return s


def m_funnel(r):
    n = r.choice([4, 5, 6]); y = CY - 40 * n + 20; s = []
    for i in range(n):
        w = 900 * (1 - i / n) ** 1.2 + 80
        last = i == n - 1
        s.append(rect(CX - w / 2, y, w, 44, 22, 1 if last else .3 + i * .12, acc=last, fill=last))
        y += 74
    for _ in range(24):
        s.append(dot(CX - 500 + r.random() * 1000, CY - 40 * n - 20 - r.random() * 40, 5, .55))
    return s


def m_person(r):
    s = [ring(CX, CY - 60, 62, w=5), path(f"M{CX - 125} {CY + 170} C {CX - 125} {CY + 40}, {CX + 125} {CY + 40}, {CX + 125} {CY + 170}", w=5)]
    hi = r.sample(range(6), 2)
    for i, (dx, dy) in enumerate([(-400, -150), (-440, -40), (-380, 80), (250, -160), (290, -50), (240, 70)]):
        w = r.choice([150, 180, 210, 230]); x = CX + dx; acc = i in hi
        s += [rect(x, CY + dy, w, 40, 20, 1 if acc else .45, acc=acc),
              line(x + 22, CY + dy + 20, x + w - 30, CY + dy + 20, 1 if acc else .45, acc=acc, w=5)]
        ex = CX - 70 if dx < 0 else CX + 70; sx = x + w if dx < 0 else x
        s.append(line(sx, CY + dy + 20, ex, CY - 20, .3, dash="2 10"))
    return s


def m_diamonds(r):
    h, w = 170, 300; s = []
    for i, left in enumerate((CX - 2 * w, CX)):
        s.append(f'<polygon points="{left},{CY} {left + w},{CY - h} {left + 2 * w},{CY} {left + w},{CY + h}" stroke-width="5" opacity="{.7 if i == 0 else 1}"{" stroke=\"ACC\"" if i else ""}/>')
        s.append(line(left + w, CY - h, left + w, CY + h, .35, dash="2 12"))
        for _ in range(14):
            x = left + w * (0.35 + r.random() * 1.3)
            spread = h * (1 - abs(x - (left + w)) / w) * .8
            s.append(dot(x, CY + (r.random() * 2 - 1) * spread, 5, .45))
    s += [dot(x, CY, 12) for x in (CX - 2 * w, CX, CX + 2 * w)]
    return s


def m_clusters(r):
    # groupes de points (proximité, similarité, tri de cartes, endogroupe…)
    k = r.choice([3, 4]); s = []
    centers = [(CX + (i - (k - 1) / 2) * 300, CY + r.uniform(-40, 40)) for i in range(k)]
    hi = r.randrange(k)
    for i, (cx, cy) in enumerate(centers):
        if i == hi:
            s.append(ring(cx, cy, 120, .5, acc=True, w=3))
        for _ in range(r.randint(9, 14)):
            a = r.random() * 6.283; d = r.random() ** .6 * 85
            s.append(dot(cx + math.cos(a) * d, cy + math.sin(a) * d, 9, 1 if i == hi else .55, acc=i == hi))
    return s


def m_outlier(r):
    # une grille régulière, un élément qui se distingue
    cols, rows = 13, 5; gx, gy = 80, 70
    x0 = CX - (cols - 1) * gx / 2; y0 = CY - (rows - 1) * gy / 2
    hx_, hy_ = r.randrange(2, cols - 2), r.randrange(1, rows - 1)
    s = []
    shape = r.choice(["dot", "square"])
    for i in range(cols):
        for j in range(rows):
            x, y = x0 + i * gx, y0 + j * gy
            if (i, j) == (hx_, hy_):
                s += [ring(x, y, 34, .5, acc=True, w=3), dot(x, y, 18, acc=True)]
            elif shape == "dot":
                s.append(dot(x, y, 9, .35))
            else:
                s.append(rect(x - 9, y - 9, 18, 18, 3, .35, fill=True))
    return s


def m_tree(r):
    # des choix qui se démultiplient
    s = []; levels = r.choice([3, 4]); x0 = CX - 480; step = 960 / levels
    nodes = [(x0, CY)]
    hi_path = None
    for lv in range(1, levels + 1):
        new = []; n = 2 ** lv if levels == 3 else min(2 ** lv, 10)
        span = 380 if lv > 1 else 220
        for k in range(n):
            y = CY - span / 2 + span * (k + .5) / n if n > 1 else CY
            px, py = nodes[min(k * len(nodes) // n, len(nodes) - 1)]
            x = x0 + lv * step
            s.append(path(f"M{px} {py} C {px + step / 2} {py}, {x - step / 2} {y}, {x} {y}", .45, w=3))
            new.append((x, y))
        nodes = new
    pick = r.randrange(len(nodes)); px, py = nodes[pick]
    s += [dot(x, y, 7, .6) for x, y in nodes]
    s += [dot(x0, CY, 12), dot(px, py, 14, acc=True), ring(px, py, 28, .6, acc=True, w=3)]
    return s


def m_gauge(r):
    v = r.uniform(.55, .9); R = 210; cy = CY + 120
    s = [path(f"M{CX - R} {cy} A {R} {R} 0 0 1 {CX + R} {cy}", .3, w=24)]
    a = math.pi * (1 - v)
    ex, ey = CX + R * math.cos(a), cy - R * math.sin(a)
    s.append(path(f"M{CX - R} {cy} A {R} {R} 0 0 1 {ex:.1f} {ey:.1f}", acc=True, w=24))
    for i in range(11):
        t = math.pi * i / 10; c, sn = math.cos(t), math.sin(t)
        s.append(line(CX + (R + 30) * c, cy - (R + 30) * sn, CX + (R + 44) * c, cy - (R + 44) * sn, .5, w=3))
    s += [line(CX, cy, CX + (R - 60) * math.cos(a), cy - (R - 60) * math.sin(a), w=6), dot(CX, cy, 14)]
    return s


def m_curve(r):
    kind = r.choice(["up", "down", "log", "decay"])
    x0, x1, yb, yt = CX - 520, CX + 520, CY + 170, CY - 170
    pts = []
    for i in range(41):
        t = i / 40
        v = {"up": t ** 2, "down": 1 - t ** .5, "log": math.log1p(9 * t) / math.log(10), "decay": .15 + .85 * math.exp(-4 * t)}[kind]
        v = min(1, max(0, v + r.uniform(-.02, .02)))
        pts.append((x0 + t * (x1 - x0), yb - v * (yb - yt)))
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    s = [line(x0, yb, x1, yb, .5), line(x0, yb, x0, yt - 20, .5)]
    s += [line(x0, yb - k * 85, x1, yb - k * 85, .12, w=2) for k in range(1, 5)]
    s.append(path(d + f" L{x1} {yb} L{x0} {yb} Z", 0, fill="ACC"))
    s.append(path(d, acc=True, w=6))
    s.append(path(d + f" L{x1} {yb} L{x0} {yb} Z", .12, fill="ACC").replace('stroke-width="4"', 'stroke="none"'))
    lx, ly = pts[-1]
    s += [dot(lx, ly, 12, acc=True), ring(lx, ly, 26, .5, acc=True, w=3)]
    return s


def m_bars(r):
    n = r.choice([2, 3, 4]); hi = r.randrange(n); s = []
    bw = 150; gap = 90; total = n * bw + (n - 1) * gap; x = CX - total / 2; yb = CY + 180
    for i in range(n):
        h = r.uniform(140, 330) if i != hi else 350
        s.append(rect(x, yb - h, bw, h, 14, 1 if i == hi else .4, acc=i == hi, fill=i == hi))
        x += bw + gap
    s.append(line(CX - total / 2 - 60, yb, CX + total / 2 + 60, yb, .5))
    return s


def m_clock(r):
    R = 190; s = [ring(CX, CY, R, .8, w=5)]
    for i in range(12):
        a = i * math.pi / 6
        s.append(line(CX + (R - 26) * math.sin(a), CY - (R - 26) * math.cos(a), CX + (R - 10) * math.sin(a), CY - (R - 10) * math.cos(a), .5, w=4))
    f = r.uniform(.2, .75); a = f * 2 * math.pi
    ex, ey = CX + (R - 55) * math.sin(a), CY - (R - 55) * math.cos(a)
    large = 1 if f > .5 else 0
    s.append(path(f"M{CX} {CY - (R - 55)} A {R - 55} {R - 55} 0 {large} 1 {ex:.1f} {ey:.1f}", acc=True, w=16))
    s += [line(CX, CY, CX + 90 * math.sin(a * .3), CY - 90 * math.cos(a * .3), w=6), line(CX, CY, ex, ey, acc=True, w=4), dot(CX, CY, 10)]
    # barre de temps sur les côtés
    s += [line(CX - 620, CY, CX - 260, CY, .25, dash="2 14"), line(CX + 260, CY, CX + 620, CY, .25, dash="2 14")]
    return s


def m_loop(r):
    s = []; R = 170; n = r.choice([3, 4, 5, 6]); hi = r.randrange(n)
    s.append(ring(CX, CY, R, .35, w=4))
    for i in range(n):
        a = -math.pi / 2 + i * 2 * math.pi / n
        x, y = CX + R * math.cos(a), CY + R * math.sin(a)
        s.append(dot(x, y, 22 if i == hi else 14, 1 if i == hi else .8, acc=i == hi))
        # flèche
        b = a + math.pi / n
        ax, ay = CX + R * math.cos(b), CY + R * math.sin(b)
        tx, ty = -math.sin(b), math.cos(b)
        s.append(path(f"M{ax - tx * 14 - math.cos(b) * 10:.1f} {ay - ty * 14 - math.sin(b) * 10:.1f} L{ax:.1f} {ay:.1f} L{ax - tx * 14 + math.cos(b) * 10:.1f} {ay - ty * 14 + math.sin(b) * 10:.1f}", .7, w=4))
    s += [ring(CX - 520, CY, 60, .15), ring(CX + 520, CY, 60, .15)]
    return s


def m_canvas(r):
    # grille de cases (canvas, blueprint, kanban, story map)
    cols = r.choice([3, 4, 5]); rows = r.choice([2, 3])
    gw, gh = 860, 380; x0, y0 = CX - gw / 2, CY - gh / 2
    cw, ch = gw / cols, gh / rows; hi = (r.randrange(cols), r.randrange(rows)); s = []
    for i in range(cols):
        for j in range(rows):
            acc = (i, j) == hi
            s.append(rect(x0 + i * cw + 8, y0 + j * ch + 8, cw - 16, ch - 16, 12, 1 if acc else .35, acc=acc))
            for k in range(r.randint(1, 3)):
                ww = (cw - 60) * r.uniform(.4, .9)
                s.append(line(x0 + i * cw + 30, y0 + j * ch + 38 + k * 22, x0 + i * cw + 30 + ww, y0 + j * ch + 38 + k * 22, .9 if acc else .3, acc=acc, w=5))
    return s


def m_matrix(r):
    s = [line(CX - 300, CY, CX + 300, CY, .6), line(CX, CY - 220, CX, CY + 220, .6)]
    s += [rect(CX - 300, CY - 220, 600, 440, 18, .2)]
    q = r.randrange(4); qx = (-1 if q % 2 == 0 else 1) * 150; qy = (-1 if q < 2 else 1) * 110
    s.append(rect(CX + qx - 140 + (0 if qx < 0 else -0), CY + qy - 100, 280, 200, 14, .9, acc=True))
    for _ in range(16):
        x, y = CX + r.uniform(-270, 270), CY + r.uniform(-190, 190)
        inq = (x - CX) * qx > 0 and (y - CY) * qy > 0
        s.append(dot(x, y, 9, .95 if inq else .35, acc=inq))
    return s


def m_crowd(r):
    # une foule orientée dans un sens, un individu qui suit ou résiste
    s = []; cols, rows = 11, 4
    for i in range(cols):
        for j in range(rows):
            x = CX - 500 + i * 100 + (j % 2) * 50; y = CY - 150 + j * 100
            s.append(path(f"M{x - 18} {y} L{x + 18} {y} M{x + 6} {y - 12} L{x + 18} {y} L{x + 6} {y + 12}", .4, w=4))
    x, y = CX + r.choice([-1, 1]) * r.choice([50, 150]), CY - 50 + r.choice([0, 100])
    flip = r.random() < .5
    d = f"M{x + 26} {y} L{x - 26} {y} M{x - 10} {y - 16} L{x - 26} {y} L{x - 10} {y + 16}" if flip else f"M{x - 26} {y} L{x + 26} {y} M{x + 10} {y - 16} L{x + 26} {y} L{x + 10} {y + 16}"
    s += [rect(x - 46, y - 40, 92, 80, 40, .9, acc=True, fill=True).replace('opacity="0.90"', 'opacity="0.18"'), path(d, acc=True, w=7)]
    return s


def m_balance(r):
    t = r.uniform(-.25, .25); L = 340
    lx, ly = CX - L * math.cos(t), CY - 40 - L * math.sin(t)
    rx, ry = CX + L * math.cos(t), CY - 40 + L * math.sin(t)
    s = [path(f"M{CX - 70} {CY + 190} L{CX} {CY - 40} L{CX + 70} {CY + 190}", .6, w=5), line(lx, ly, rx, ry, w=6), dot(CX, CY - 40, 12)]
    for (x, y), acc in (((lx, ly), True), ((rx, ry), False)):
        s += [line(x, y, x - 70, y + 110, .5, w=3), line(x, y, x + 70, y + 110, .5, w=3),
              path(f"M{x - 90} {y + 110} L{x + 90} {y + 110} Q{x} {y + 170} {x - 90} {y + 110} Z", 1, acc=acc, w=5)]
    s.append(dot(lx, ly + 90, r.choice([22, 30, 38]), acc=True))
    s.append(dot(rx - 20, ry + 92, 14, .8)); s.append(dot(rx + 18, ry + 92, 14, .8))
    return s


def m_mirror(r):
    # deux points de vue face à face
    s = [line(CX, CY - 220, CX, CY + 220, .35, dash="3 14")]
    for side in (-1, 1):
        x = CX + side * 280; acc = side == 1
        s += [ring(x, CY - 40, 50, 1 if acc else .6, acc=acc, w=5),
              path(f"M{x - 95} {CY + 160} C {x - 95} {CY + 50}, {x + 95} {CY + 50}, {x + 95} {CY + 160}", 1 if acc else .6, acc=acc, w=5)]
    for k in range(r.randint(3, 5)):
        y = CY - 120 + k * 50
        s.append(path(f"M{CX - 190} {y} Q{CX} {y - 40 + r.uniform(-20, 20)} {CX + 190} {y}", .25, dash="2 10", w=3))
    return s


def m_memory(r):
    # une rangée d'éléments qui s'efface : certains restent nets
    n = 12; s = []; keep = set(r.sample(range(n), r.choice([2, 3])))
    shape = r.choice(["U", "flat", "end"])
    for i in range(n):
        x = CX - 550 + i * 100
        o = {"U": .2 + .8 * abs(i - (n - 1) / 2) / ((n - 1) / 2), "flat": .3, "end": .2 + .8 * i / (n - 1)}[shape]
        acc = i in keep and shape == "flat"
        if acc: o = 1
        s.append(rect(x - 34, CY - 70, 68, 140, 14, o, acc=acc))
        s.append(line(x - 16, CY - 20, x + 16, CY - 20, o, acc=acc, w=5))
        s.append(line(x - 16, CY + 10, x + 8, CY + 10, o * .7, acc=acc, w=5))
    s.append(path(f"M{CX - 560} {CY + 140} Q{CX} {CY + 210} {CX + 560} {CY + 140}", .3, dash="2 14", w=3))
    return s


def m_stack(r):
    # briques qui s'assemblent : atomes, molécules, composants
    s = []; levels = [1, 3, 5]; y = CY + 140
    for li, k in enumerate(reversed(levels)):
        w = 140; gap = 24; tot = k * w + (k - 1) * gap; x = CX - tot / 2
        for i in range(k):
            acc = li == 2
            s.append(rect(x, y - 60, w, 60, 10, 1 if acc else .35 + li * .25, acc=acc, fill=acc))
            x += w + gap
        y -= 100
    s += [dot(CX - 460, CY - 120, 10, .4), dot(CX - 420, CY - 150, 6, .3), dot(CX + 460, CY + 100, 10, .4), ring(CX + 430, CY - 120, 24, .3)]
    return s


def m_star(r):
    s = []; sx, sy = CX + r.uniform(200, 340), CY - r.uniform(60, 120)
    pts = []
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 4; R = 46 if i % 2 == 0 else 14
        pts.append(f"{sx + R * math.cos(a):.1f},{sy + R * math.sin(a):.1f}")
    s.append(f'<polygon points="{" ".join(pts)}" fill="ACC" stroke="none"/>')
    s.append(ring(sx, sy, 80, .3, acc=True, w=3))
    for k in range(r.randint(3, 5)):
        x0 = CX - 520 + r.uniform(0, 80); y0 = CY + 160 - k * 60 + r.uniform(-20, 20)
        s.append(path(f"M{x0} {y0} Q{(x0 + sx) / 2} {y0 + r.uniform(-60, 60)} {sx - 60} {sy + 30}", .35 + k * .1, dash="2 14", w=4))
        s.append(dot(x0, y0, 8, .7))
    return s


def m_noise(r):
    # des points au hasard, et un motif qu'on croit y voir
    s = [dot(CX - 560 + r.random() * 1120, CY - 220 + r.random() * 440, 6, .25 + r.random() * .3) for _ in range(120)]
    pts = [(CX - 400 + i * 160 + r.uniform(-40, 40), CY + r.uniform(-140, 140)) for i in range(6)]
    s.append(path("M" + " L".join(f"{x:.0f} {y:.0f}" for x, y in pts), acc=True, dash="2 12", w=5))
    s += [dot(x, y, 12, acc=True) for x, y in pts]
    return s


def m_progress(r):
    s = []; n = r.choice([3, 4, 5]); f = r.uniform(.35, .85)
    for k in range(n):
        y = CY - (n - 1) * 45 + k * 90; ff = f if k == n // 2 else r.uniform(.15, 1)
        acc = k == n // 2
        s += [rect(CX - 450, y - 16, 900, 32, 16, .25), rect(CX - 450, y - 16, 900 * ff, 32, 16, 1 if acc else .45, acc=acc, fill=True)]
    return s


def m_spotlight(r):
    s = [dot(CX - 560 + r.random() * 1120, CY - 220 + r.random() * 440, 7, .2) for _ in range(70)]
    fx, fy = CX + r.uniform(-200, 200), CY + r.uniform(-60, 60)
    s += [path(f"M{CX - 600} {CY - 260} L{fx - 120} {fy - 5} L{fx - 120} {fy + 5} L{CX - 600} {CY + 260}", .12, fill="#ffffff").replace('stroke-width="4"', 'stroke="none"'),
          ring(fx, fy, 120, .9, acc=True, w=4)]
    s += [dot(fx + r.uniform(-60, 60), fy + r.uniform(-60, 60), 10, acc=True) for _ in range(5)]
    return s


def m_tag(r):
    # une étiquette de prix, et des montants autour
    x, y = CX - 40, CY
    s = [path(f"M{x - 180} {y - 90} L{x + 100} {y - 90} L{x + 200} {y} L{x + 100} {y + 90} L{x - 180} {y + 90} Z", acc=True, w=6), ring(x + 110, y, 18, acc=True, w=5)]
    s += [line(x - 140, y - 25, x + 10, y - 25, w=10), line(x - 140, y + 25, x - 50, y + 25, .5, w=10)]
    for _ in range(9):
        a, d = r.random() * 6.28, r.uniform(320, 480)
        s.append(ring(CX + math.cos(a) * d, CY + math.sin(a) * d * .5, r.choice([12, 18, 24]), .35, w=3))
    return s


def m_journey(r):
    s = []; pts = []
    for i in range(7):
        pts.append((CX - 540 + i * 180, CY + 120 * math.sin(i * 1.1 + r.random()) * r.uniform(.6, 1)))
    d = "M" + " ".join(f"{'C' if i == 1 else ''}{x:.0f} {y:.0f}" for i, (x, y) in enumerate(pts[:1]))
    d = f"M{pts[0][0]:.0f} {pts[0][1]:.0f} " + " ".join(f"S{(x + px) / 2:.0f} {y:.0f} {x:.0f} {y:.0f}" for (px, _), (x, y) in zip(pts, pts[1:]))
    s.append(path(d, .7, w=5))
    hi = r.randrange(1, 6)
    for i, (x, y) in enumerate(pts):
        s += [dot(x, y, 16 if i == hi else 10, 1, acc=i == hi)]
        if i == hi: s.append(ring(x, y, 34, .6, acc=True, w=3))
    s.append(path(f"M{pts[-1][0] + 10} {pts[-1][1] - 50} L{pts[-1][0] + 10} {pts[-1][1] - 10} M{pts[-1][0] + 10} {pts[-1][1] - 50} L{pts[-1][0] + 50} {pts[-1][1] - 38} L{pts[-1][0] + 10} {pts[-1][1] - 26}", acc=True, w=4))
    return s


def m_bubbles(r):
    s = []
    for i, (x, y, w, h, side) in enumerate([(CX - 470, CY - 150, 380, 120, -1), (CX + 90, CY - 30, 380, 120, 1), (CX - 380, CY + 110, 300, 90, -1)]):
        acc = i == 1
        tail = f"M{x + 50} {y + h} L{x + 40} {y + h + 36} L{x + 90} {y + h}" if side < 0 else f"M{x + w - 90} {y + h} L{x + w - 40} {y + h + 36} L{x + w - 50} {y + h}"
        s += [rect(x, y, w, h, 28, 1 if acc else .5, acc=acc), path(tail, 1 if acc else .5, acc=acc)]
        for k in range(2):
            ww = (w - 80) * r.uniform(.5, 1) * (1 if k == 0 else .6)
            s.append(line(x + 40, y + 42 + k * 34, x + 40 + ww, y + 42 + k * 34, 1 if acc else .5, acc=acc, w=6))
    s.append(f'<text x="{CX + 330}" y="{CY - 120}" font-family="Inter Display" font-weight="200" font-size="160" fill="ACC" stroke="none" opacity=".9">?</text>' if r.random() < .5 else "")
    return s


def m_layers(r):
    s = []; n = r.choice([3, 4, 5]); hi = r.randrange(n)
    for i in range(n):
        y = CY + 150 - i * 75; w = 700 - i * 60
        acc = i == hi
        s.append(path(f"M{CX - w / 2} {y} L{CX} {y - 60} L{CX + w / 2} {y} L{CX} {y + 60} Z", 1 if acc else .35 + i * .1, acc=acc, w=5))
    return s


def m_network(r):
    s = []; nodes = [(CX + r.uniform(-520, 520), CY + r.uniform(-200, 200)) for _ in range(16)]
    hub = r.randrange(16)
    for i, (x, y) in enumerate(nodes):
        for j, (x2, y2) in enumerate(nodes[i + 1:], i + 1):
            if math.hypot(x - x2, y - y2) < 260:
                s.append(line(x, y, x2, y2, .7 if hub in (i, j) else .2, acc=hub in (i, j), w=3))
    s += [dot(x, y, 16 if i == hub else 8, 1 if i == hub else .7, acc=i == hub) for i, (x, y) in enumerate(nodes)]
    return s


def m_book(r):
    s = []; x, y, w, h = CX - 150, CY - 210, 300, 420
    s += [rect(x + 22, y + 14, w, h, 10, .25), rect(x, y, w, h, 10, 1, acc=True, w=5) if False else rect(x, y, w, h, 10, 1, acc=True)]
    s += [line(x + 34, y, x + 34, y + h, .5, w=3)]
    for k in range(r.choice([2, 3])):
        ww = (w - 110) * r.uniform(.5, 1)
        s.append(line(x + 70, y + 80 + k * 34, x + 70 + ww, y + 80 + k * 34, .9, w=8))
    s.append(r.choice([ring(x + w / 2 + 15, y + h - 120, 50, .6, acc=True), rect(x + w / 2 - 35, y + h - 165, 100, 100, 8, .6, acc=True)]))
    for side in (-1, 1):
        for k in range(r.randint(2, 4)):
            bx = CX + side * (260 + k * 46); hh = r.uniform(240, 380)
            s.append(rect(bx - 16, CY + 200 - hh, 32, hh, 6, .25))
    return s


def m_article(r):
    # un article : une page à coin plié, titre, deux colonnes, un graphique, des notes de bas de page, d'autres pages derrière
    s = []; w, h = 340, 450; x, y = CX - w / 2, CY - h / 2 - 5; c = 70
    for k, o in ((2, .15), (1, .28)):
        s.append(rect(x + 26 * k, y - 14 * k, w, h, 8, o))
    s.append(path(f"M{x} {y + 8} Q {x} {y}, {x + 8} {y} L {x + w - c} {y} L {x + w} {y + c} L {x + w} {y + h - 8} Q {x + w} {y + h}, {x + w - 8} {y + h} L {x + 8} {y + h} Q {x} {y + h}, {x} {y + h - 8} Z", 1, acc=True))
    s.append(path(f"M{x + w - c} {y} L {x + w - c} {y + c} L {x + w} {y + c}", .7, w=4))
    s.append(line(x + 36, y + 56, x + 36 + (w - 150) * r.uniform(.7, 1), y + 56, 1, w=10))
    s.append(line(x + 36, y + 84, x + 36 + 130, y + 84, .5, w=4))
    s.append(line(x + 36, y + 110, x + w - 36, y + 110, .3, w=2))
    col = (w - 96) / 2
    for cx in (x + 36, x + 60 + col):
        for k in range(r.choice([6, 7])):
            ww = col * (1 if k < 5 else r.uniform(.4, .8))
            s.append(line(cx, y + 138 + k * 24, cx + ww, y + 138 + k * 24, .4, w=4))
    # petit graphique
    gx, gy = x + 36, y + h - 130
    s.append(line(gx, gy, gx, gy + 70, .6, w=3)); s.append(line(gx, gy + 70, gx + 110, gy + 70, .6, w=3))
    hi = r.randrange(5)
    for k in range(5):
        bh = r.uniform(20, 62) if k != hi else 66
        s.append(rect(gx + 14 + k * 20, gy + 70 - bh, 12, bh, 2, 1 if k == hi else .45, acc=k == hi, fill=True))
    s.append(f'<text x="{x + w - 70}" y="{y + h - 40}" font-family="Inter Display" font-weight="300" font-size="34" fill="ACC" stroke="none" opacity=".9">[1]</text>')
    # références qui renvoient vers d'autres articles
    for side in (-1, 1):
        for k in range(r.randint(2, 3)):
            bx = CX + side * (300 + k * 70); by = CY - 120 + k * 100 + r.uniform(-20, 20)
            s.append(rect(bx - 22, by - 30, 44, 60, 4, .25))
            s.append(line(bx - 12, by - 12, bx + 12, by - 12, .25, w=3)); s.append(line(bx - 12, by + 2, bx + 8, by + 2, .25, w=3))
    return s


def m_monogram(r, nom):
    parts = [p for p in re.split(r"[\s\-.()]+", nom) if p and p[0].isalpha() and p.lower() not in ("et", "de", "la", "avec", "l")]
    ini = "".join(p[0].upper() for p in parts[:2]) or nom[:1]
    s = [ring(CX, CY, 210, .3, w=2), ring(CX, CY, 170, .6, acc=True, w=3)]
    a0 = r.random() * 6.28
    s += [dot(CX + 210 * math.cos(a0 + k * .5), CY + 210 * math.sin(a0 + k * .5), 8 - k, .8 - k * .1, acc=k == 0) for k in range(5)]
    s.append(f'<text x="{CX}" y="{CY + 58}" text-anchor="middle" font-family="Inter Display" font-weight="200" font-size="170" letter-spacing="6" fill="#ffffff" stroke="none">{esc(ini)}</text>')
    return s


MOTIFS = {k[2:]: v for k, v in globals().items() if k.startswith("m_")}

# ---------- choix du motif ----------
# Ordre important : la première règle qui colle gagne. Puis le motif par défaut de la base.
REGLES = [
    ("target", r"fitts|task success|precision|doherty|first byte|first contentful|interaction to next|core web|seuil"),
    ("scale", r"ancrage|tendance centrale|regression|chiffre de gauche|relativite|amorcage a bas prix|insensibilite|ampleur|normalite"),
    ("funnel", r"conversion|drop-off|funnel|aarrr|onboarding completion|satisficing|parkinson"),
    ("diamonds", r"double diamant|design thinking|change by design|service design thinking"),
    ("person", r"persona|empathie|jobs to be done|projection|victime identifiable|eliza|anthropo|introspection|faux consensus"),
    ("clusters", r"proximite|similarite|region commune|connexite|affinit|tri de cartes|endogroupe|exogroupe|polarisation|gestalt|pragnanz"),
    ("outlier", r"restorff|saillance|contraste|beaute|halo|banniere|cecite|nouveaute|accessibility|erreur de mcnamara|stroop|esthetique"),
    ("tree", r"hick|choix|arbre|opportunity solution|decision|ockham|comment pourrions|crazy 8|information architecture|morville"),
    ("gauge", r"score|rating|net promoter|ease question|usability scale|umux|confiance|excès|exces|optimisme|supériorité|superiorite|dunning|certitude|risque zero|illusion de controle"),
    ("curve", r"retention|churn|lifetime|active users|learnability|apprentissage|adaptation|return on investment|roi|hedonique|amorcage|exposition|engagement rate|bounce|adoption|spacement|espacement|negligence du taux"),
    ("bars", r"test a/b|leurre|compromis|cadrage|benchmark|kano|ice|rice|heart|comparai|simpson|lean ux"),
    ("clock", r"time on task|session duration|planification|present|duree|temps|zeigarnik|travail|retrospection|patience|sprint"),
    ("loop", r"lean startup|scrum|renforcement|hooked|cycle|kanban|habitude|continuous discovery|skinner|fogg|engagement et coherence|prophetie|reciprocite|cascade"),
    ("canvas", r"canvas|blueprint|story mapping|journal de bord|roadmap|raci|moscow|user story|invest|okr"),
    ("matrix", r"matrice|valeur effort|pareto|severity|heuristique d'affect|evaluation heuristique|heuristic"),
    ("crowd", r"preuve sociale|mode|conformite|pensee de groupe|temoin|paresse sociale|ignorance pluraliste|facilitation sociale|snob|fomo|contagion|autorite|reactance|hawthorne|acquiescement|desirabilite"),
    ("balance", r"aversion|dotation|irrecuperable|compensation|justification|regret|omission|statu quo|defaut|douleur|surjustification|coût|cout|ikea|parce que|porte au nez"),
    ("mirror", r"asymetrie|dissonance|transparence|projecteur|angle mort|auto-complaisance|attribution|malediction|croyance|raisonnement motive|confirmation|experimentateur|questions orientees|sympathie"),
    ("memory", r"memoire|miller|charge cognitive|rappel|souvenir|amnesie|cryptomnesie|pic et|position serielle|google|generation|desinformation|effet d'ordre|disponibilite|reconnaissance|fluence|verite|ancien"),
    ("stack", r"design system|tokens|pattern library|ui kit|atomic|style guide|standards|composants|elements of user"),
    ("star", r"north star|objectif|gradient|flow|vision|inspired|value proposition|okr"),
    ("noise", r"apophenie|correlation|frequence|petits nombres|p-hacking|joueur|representativite|conjonction|narrative|barnum|publication|survivant|selection|non-reponse|goodhart|base"),
    ("progress", r"progression dotee|onboarding|completion|feature|recovery|error rate|effort"),
    ("spotlight", r"attention|inattention|focalisation|perception selective|cocktail|attention selective|changement"),
    ("tag", r"prix|gratuite|veblen|monetaire|comptabilite mentale|acquisition cost|payer|rarete"),
    ("journey", r"parcours|enquete|contextuelle|prototypage|test utilisateur|instrument|paradoxe de l'utilisateur|jakob|mental|postel|tesler|don't make|krug|nudge|thaler"),
    ("bubbles", r"entretien|questionnaire|think aloud|verbalisation|mom test|just enough research|uxr|charte editoriale|ton"),
    ("layers", r"identite visuelle|charte graphique|brand|direction artistique|moodboard|thinking with type|about face|emotional design|design of everyday|everyday"),
]

DEFAUT = {"kpi": "curve", "loi": "target", "biais": "noise", "methode": "journey", "framework": "canvas",
          "acteur": "monogram", "glossaire": "stack", "biblio": "book"}


def norm(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


# Cas où les mots-clés tombent à côté (« ice » dans « matrice », « mode » dans « modèle »…).
MANUEL = {
    "Modèle mental": "mirror", "Mémoire de travail": "memory", "Heuristique de représentativité": "noise",
    "Prophétie autoréalisatrice": "loop", "Service blueprint": "canvas", "Matrice valeur effort": "matrix",
    "Loi de Parkinson": "clock", "Satisficing": "progress", "Cascade d'information": "crowd",
    "Effet d'amorçage": "memory", "Négligence du taux de base": "noise", "OKR": "star",
    "Erreur de McNamara": "bars", "Biais d'impact": "gauge", "Biais de négativité": "balance",
    "Biais rétrospectif": "journey", "Effet Barnum": "person", "Écart d'information": "progress",
    "Illusion de profondeur explicative": "layers", "Effet de réflexion": "balance", "Heuristique d'affect": "balance",
    "Biais d'automatisation": "loop", "Biais de congruence à l'humeur": "mirror",
    "The Magical Number Seven, Plus or Minus Two": "article",
}


def choisir(f):
    if f["nom"] in MANUEL:
        return MANUEL[f["nom"]]
    if f["base"] == "acteur":
        return "monogram"
    if f["base"] == "biblio":
        return "book"
    n = norm(f["nom"])
    for motif, rx in REGLES:
        if re.search(norm(rx), n):
            return motif
    return DEFAUT[f["base"]]


def draw(f):
    r = random.Random(int(hashlib.sha256(f["nom"].encode()).hexdigest()[:12], 16))
    m = f.get("motif") or choisir(f)
    body = MOTIFS[m](r, f["nom"]) if m == "monogram" else MOTIFS[m](r)
    return m, frame(BASES[f["base"]], "\n".join(x for x in body if x))


def main(src, out):
    fiches = json.load(open(src))
    os.makedirs(out, exist_ok=True)
    index, seen = {}, set()
    for f in fiches:
        name = slug(f["nom"]) or f["id"][:8]
        while name in seen:
            name += "-2"
        seen.add(name)
        m, svg = draw(f)
        p = os.path.join(out, name + ".svg")
        open(p, "w").write(svg)
        subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), "-o", p[:-4] + ".png", p], check=True)
        os.remove(p)
        index[f["id"]] = {"file": name + ".png", "motif": m, "nom": f["nom"], "base": f["base"]}
    json.dump(index, open("covers.json", "w"), ensure_ascii=False, indent=1)
    print(len(index), "covers")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "site/covers")
