"""Service-area map: a small, hand-drawn-style SVG of the Coffs Coast and the
Clarence Valley, generated at build time so there's no map library or tiles.

Coordinates are approximate (good to a few hundred metres), which is plenty
for "where does Mac work". North is up, plain equirectangular projection.
"""
from markupsafe import Markup

LON0, LAT0, LON1, LAT1 = 152.80, -29.60, 153.50, -30.42
K = 680                       # px per degree of latitude
COS = 0.866                   # cos(30 deg S)
W = round((LON1 - LON0) * COS * K)
H = round((LAT0 - LAT1) * K)


def xy(lon, lat):
    return round((lon - LON0) * COS * K, 1), round((LAT0 - lat) * K, 1)


def path(points):
    return 'M' + ' L'.join(f'{x},{y}' for x, y in (xy(*p) for p in points))


COAST = [
    (153.345, -29.58), (153.34, -29.61), (153.315, -29.69), (153.30, -29.78), (153.27, -29.87),
    (153.25, -29.93), (153.235, -29.975), (153.225, -29.995), (153.215, -30.04), (153.208, -30.08),
    (153.200, -30.095), (153.207, -30.110), (153.198, -30.128), (153.195, -30.150),
    (153.188, -30.170), (153.170, -30.200), (153.157, -30.240), (153.150, -30.270),
    (153.157, -30.300), (153.135, -30.320), (153.120, -30.350), (153.112, -30.370),
    (153.095, -30.400), (153.085, -30.44),
]
HIGHWAY = [
    (152.80, -29.735), (152.90, -29.712), (152.935, -29.705), (152.975, -29.75), (153.01, -29.81),
    (153.05, -29.88), (153.08, -29.94), (153.13, -29.98), (153.172, -30.01), (153.178, -30.06),
    (153.172, -30.10), (153.163, -30.15), (153.145, -30.20), (153.124, -30.25), (153.108, -30.29),
    (153.085, -30.34), (153.07, -30.38), (153.06, -30.44),
]
RIVER = [
    (152.78, -29.668), (152.87, -29.676), (152.93, -29.686), (152.965, -29.676), (153.00, -29.655),
    (153.03, -29.632), (153.07, -29.60), (153.10, -29.58),
]
COAST_TOWNS = [  # name, lon, lat
    ('Corindi Beach', 153.205, -29.985),
    ('Safety Beach', 153.188, -30.095),
    ('Woolgoolga', 153.188, -30.112),
    ('Sandy Beach', 153.183, -30.150),
    ('Emerald Beach', 153.175, -30.168),
    ('Moonee Beach', 153.155, -30.203),
    ('Sapphire Beach', 153.140, -30.240),
    ('Coffs Harbour', 153.118, -30.296),
    ('Toormina', 153.087, -30.353),
    ('Sawtell', 153.100, -30.367),
]
GRAFTON = (152.933, -29.690)

INK2, LINE, PAPER, MUTED, AMBER, SEA, SEA_EDGE, RIVER_C = (
    '#1C1C1B', '#2A2A28', '#F4F1EA', '#A9A59B', '#F5B83D', '#13202A', '#3E5566', '#2C4A5E')


def spread(ys, gap, lo, hi):
    """Nudge label positions apart so none are closer than `gap`."""
    ys = list(ys)
    for _ in range(200):
        moved = False
        for i in range(1, len(ys)):
            d = ys[i] - ys[i - 1]
            if d < gap:
                push = (gap - d) / 2
                ys[i - 1] -= push
                ys[i] += push
                moved = True
        ys = [min(max(y, lo), hi) for y in ys]
        if not moved:
            break
    return ys


def area_map(focus='coast'):
    """focus='coast' highlights Woolgoolga (home base); 'grafton' highlights Grafton."""
    out = [f'<svg class="area-svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
           f'aria-labelledby="area-map-t"><title id="area-map-t">Map: MGR Electrical works along the Coffs Coast '
           f'from Corindi Beach to Sawtell, based in Woolgoolga, and inland to Grafton.</title>']
    out.append(f'<rect width="{W}" height="{H}" fill="{INK2}"/>')
    sea = path(COAST) + f' L{W + 5},{H + 5} L{W + 5},-5 Z'
    out.append(f'<path d="{sea}" fill="{SEA}"/>')
    out.append(f'<path d="{path(COAST)}" fill="none" stroke="{SEA_EDGE}" stroke-width="2" stroke-linejoin="round"/>')
    out.append(f'<path d="{path(RIVER)}" fill="none" stroke="{RIVER_C}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')
    out.append(f'<path d="{path(HIGHWAY)}" fill="none" stroke="{AMBER}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="6 5" stroke-linejoin="round"/>')
    # small map furniture
    hx, hy = xy(153.03, -29.86)
    out.append(f'<text x="{hx}" y="{hy}" transform="rotate(55 {hx} {hy})" class="m-note" fill="{AMBER}" fill-opacity=".8">PACIFIC HWY</text>')
    rx, ry = xy(152.815, -29.655)
    out.append(f'<text x="{rx}" y="{ry}" class="m-note" fill="#5E7F94">CLARENCE RIVER</text>')
    sx, sy = xy(153.42, -29.70)
    out.append(f'<text x="{sx}" y="{sy}" class="m-note" fill="#4C6578" text-anchor="middle">CORAL SEA</text>')
    out.append(f'<g transform="translate(22 {H - 26})" fill="{MUTED}"><path d="M0 -14 L5 0 L0 -4 L-5 0 Z"/>'
               f'<text x="0" y="13" class="m-note" text-anchor="middle">N</text></g>')

    # coastal towns: dots on land, labels in a column out to sea with leader lines
    col = xy(153.245, -30)[0]
    pts = [(n,) + xy(lo, la) for n, lo, la in COAST_TOWNS]
    label_y = spread([p[2] for p in pts], 17, 14, H - 8)
    home = focus == 'coast'
    for (name, x, y), ly in zip(pts, label_y):
        is_home = name == 'Woolgoolga'
        out.append(f'<path d="M{x + 4},{y} L{col - 6},{ly - 4}" stroke="{PAPER}" stroke-opacity=".22" stroke-width="1" fill="none"/>')
        if is_home:
            out.append(f'<circle cx="{x}" cy="{y}" r="10" fill="{AMBER}" fill-opacity="{".25" if home else ".12"}"/>')
            out.append(f'<circle cx="{x}" cy="{y}" r="5" fill="{AMBER}" stroke="{INK2}" stroke-width="2"/>')
            out.append(f'<text x="{col}" y="{ly}" class="m-town m-home" fill="{AMBER}">WOOLGOOLGA'
                       f'<tspan class="m-sub" fill="{MUTED}" dx="6">home base</tspan></text>')
        else:
            out.append(f'<circle cx="{x}" cy="{y}" r="3.5" fill="{PAPER}" stroke="{INK2}" stroke-width="1.5"/>')
            out.append(f'<text x="{col}" y="{ly}" class="m-town" fill="{PAPER}">{name.upper()}</text>')

    # Grafton
    gx, gy = xy(*GRAFTON)
    hot = focus == 'grafton'
    out.append(f'<circle cx="{gx}" cy="{gy}" r="10" fill="{AMBER if hot else PAPER}" fill-opacity="{".25" if hot else ".08"}"/>')
    out.append(f'<circle cx="{gx}" cy="{gy}" r="{5 if hot else 4}" fill="{AMBER if hot else PAPER}" stroke="{INK2}" stroke-width="2"/>')
    out.append(f'<text x="{gx + 12}" y="{gy + 22}" class="m-town{" m-home" if hot else ""}" fill="{AMBER if hot else PAPER}">GRAFTON</text>')
    out.append(f'<text x="{gx + 12}" y="{gy + 37}" class="m-sub" fill="{MUTED}">no travel fee</text>')
    out.append('</svg>')
    return Markup(''.join(out))


if __name__ == '__main__':
    print(W, H)
    open('/tmp/map.svg', 'w').write(str(area_map()))
