#!/usr/bin/env python3
"""Covers des fiches : un motif par notion, la couleur de sa base.

Usage : python3 scripts/covers.py site/covers
Chaque cover fait 1500 x 600. Le motif reste dans la bande centrale,
car Notion rogne le haut et le bas selon la largeur de l'écran.
"""
import math, os, subprocess, sys

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


def frame(color, body):
    bg = mix(color, "#121212", 0.84)
    glow = mix(color, "#121212", 0.45)
    light = mix(color, "#ffffff", 0.45)
    dots = []
    for x in range(30, W, 40):
        for y in range(20, H, 40):
            dots.append(f'<circle cx="{x}" cy="{y}" r="1.3"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
 <radialGradient id="g" cx="50%" cy="50%" r="60%">
  <stop offset="0" stop-color="{glow}" stop-opacity=".55"/>
  <stop offset="1" stop-color="{bg}" stop-opacity="0"/>
 </radialGradient>
</defs>
<rect width="{W}" height="{H}" fill="{bg}"/>
<rect width="{W}" height="{H}" fill="url(#g)"/>
<g fill="#ffffff" opacity=".07">{''.join(dots)}</g>
<g fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
   style="--a:{light}">{body.replace("ACC", light)}</g>
</svg>'''


# ---------- motifs ----------

def fitts():
    # Un curseur, une trajectoire, une grande cible proche et une petite cible lointaine.
    s = []
    tx, ty = CX + 230, CY
    for r, o in ((150, .25), (110, .45), (70, .7)):
        s.append(f'<circle cx="{tx}" cy="{ty}" r="{r}" opacity="{o}"/>')
    s.append(f'<circle cx="{tx}" cy="{ty}" r="30" fill="ACC" stroke="none"/>')
    # petite cible lointaine
    s.append(f'<circle cx="{CX + 520}" cy="{CY - 120}" r="16" opacity=".5"/>')
    s.append(f'<circle cx="{CX + 520}" cy="{CY - 120}" r="5" fill="#fff" stroke="none" opacity=".5"/>')
    # trajectoire
    s.append(f'<path d="M{CX - 380} {CY + 70} C {CX - 200} {CY + 120}, {CX - 20} {CY - 60}, {tx - 34} {ty}" '
             f'stroke="ACC" stroke-dasharray="2 14" stroke-width="5"/>')
    # curseur
    x, y = CX - 420, CY + 40
    s.append(f'<path d="M{x} {y} l0 70 l18 -17 l14 30 l12 -6 l-14 -29 l24 -2 z" fill="#fff" stroke="none"/>')
    return s


def ancrage():
    # Une échelle, un ancre-repère appuyé, et des estimations qui s'agglutinent autour.
    s = []
    x0, x1, y = CX - 520, CX + 520, CY + 60
    s.append(f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" opacity=".6"/>')
    for i in range(11):
        x = x0 + i * (x1 - x0) / 10
        s.append(f'<line x1="{x}" y1="{y - 10}" x2="{x}" y2="{y + 10}" opacity=".4"/>')
    ax = x0 + 0.28 * (x1 - x0)
    s.append(f'<line x1="{ax}" y1="{y - 210}" x2="{ax}" y2="{y + 30}" stroke="ACC" stroke-width="10"/>')
    s.append(f'<circle cx="{ax}" cy="{y - 222}" r="16" stroke="ACC" stroke-width="6"/>')
    truth = x0 + 0.72 * (x1 - x0)
    s.append(f'<line x1="{truth}" y1="{y - 120}" x2="{truth}" y2="{y + 20}" stroke-dasharray="3 12" opacity=".5"/>')
    import random
    rnd = random.Random(7)
    for i in range(46):
        d = rnd.gauss(0.36, 0.09)
        x = x0 + d * (x1 - x0)
        yy = y - 30 - rnd.random() * 150
        s.append(f'<circle cx="{x:.1f}" cy="{yy:.1f}" r="7" fill="#fff" stroke="none" opacity="{0.35 + rnd.random() * .5:.2f}"/>')
    return s


def conversion():
    # Un entonnoir de barres : beaucoup de visiteurs entrent, quelques-uns sortent.
    s = []
    widths = [880, 640, 420, 240, 110]
    y = CY - 170
    for i, w in enumerate(widths):
        last = i == len(widths) - 1
        s.append(f'<rect x="{CX - w / 2}" y="{y}" width="{w}" height="46" rx="23" '
                 + ('fill="ACC" stroke="none"/>' if last else f'opacity="{0.35 + i * .15:.2f}"/>'))
        y += 72
    import random
    rnd = random.Random(3)
    for i in range(22):
        x = CX - 500 + rnd.random() * 1000
        s.append(f'<circle cx="{x:.0f}" cy="{CY - 215 - rnd.random() * 40:.0f}" r="5" fill="#fff" stroke="none" opacity=".55"/>')
    s.append(f'<circle cx="{CX}" cy="{CY + 205}" r="9" fill="ACC" stroke="none"/>')
    return s


def persona():
    # Un buste, et autour les étiquettes qui le décrivent.
    s = []
    s.append(f'<circle cx="{CX}" cy="{CY - 60}" r="62" stroke-width="5"/>')
    s.append(f'<path d="M{CX - 125} {CY + 170} C {CX - 125} {CY + 40}, {CX + 125} {CY + 40}, {CX + 125} {CY + 170}" stroke-width="5"/>')
    tags = [(-380, -150, 190), (-430, -40, 150), (-360, 80, 210), (260, -160, 170), (300, -50, 230), (250, 70, 150)]
    for i, (dx, dy, w) in enumerate(tags):
        x = CX + dx
        acc = i in (1, 4)
        s.append(f'<rect x="{x}" y="{CY + dy}" width="{w}" height="40" rx="20" '
                 + ('stroke="ACC"/>' if acc else 'opacity=".45"/>'))
        s.append(f'<line x1="{x + 22}" y1="{CY + dy + 20}" x2="{x + w - 30}" y2="{CY + dy + 20}" '
                 + ('stroke="ACC" stroke-width="5"/>' if acc else 'opacity=".45" stroke-width="5"/>'))
        # lien vers le buste
        ex = CX - 70 if dx < 0 else CX + 70
        sx = x + w if dx < 0 else x
        s.append(f'<line x1="{sx}" y1="{CY + dy + 20}" x2="{ex}" y2="{CY - 20}" stroke-dasharray="2 10" opacity=".3"/>')
    return s


def double_diamant():
    # Deux losanges : ouvrir, resserrer, ouvrir, resserrer.
    s = []
    h, w = 170, 300
    l1, l2 = CX - 2 * w, CX
    for i, left in enumerate((l1, l2)):
        pts = f"{left},{CY} {left + w},{CY - h} {left + 2 * w},{CY} {left + w},{CY + h}"
        s.append(f'<polygon points="{pts}" ' + ('stroke="ACC" stroke-width="5"/>' if i == 1 else 'opacity=".7" stroke-width="5"/>'))
        s.append(f'<line x1="{left + w}" y1="{CY - h}" x2="{left + w}" y2="{CY + h}" stroke-dasharray="2 12" opacity=".35"/>')
    for x in (l1, l2, CX + 2 * w):
        s.append(f'<circle cx="{x}" cy="{CY}" r="12" fill="#fff" stroke="none"/>')
    import random
    rnd = random.Random(5)
    for left in (l1, l2):
        for i in range(14):
            t = rnd.random()
            x = left + w * (0.35 + t * 1.3)
            spread = h * (1 - abs(x - (left + w)) / w) * 0.8
            s.append(f'<circle cx="{x:.0f}" cy="{CY + (rnd.random() * 2 - 1) * spread:.0f}" r="5" fill="#fff" stroke="none" opacity=".45"/>')
    return s


COVERS = [
    ("loi-fitts", "loi", fitts),
    ("biais-ancrage", "biais", ancrage),
    ("kpi-conversion", "kpi", conversion),
    ("methode-persona", "methode", persona),
    ("framework-double-diamant", "framework", double_diamant),
]


def main(out):
    os.makedirs(out, exist_ok=True)
    for slug, base, fn in COVERS:
        svg = frame(BASES[base], "\n".join(fn()))
        p = os.path.join(out, slug + ".svg")
        with open(p, "w") as f:
            f.write(svg)
        subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), "-o", p[:-4] + ".png", p], check=True)
        os.remove(p)
        print(slug)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "site/covers")
