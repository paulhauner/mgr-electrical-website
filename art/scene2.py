"""Bigger-scale street: houses sized so Mac (24px) fits inside the rooms."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from pixel import *
from hilux import hilux, meter_box

OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)
EDGE = '#0A0B10'


def back_window(cv, x, y, lit, pal):
    cv.rect(x, y, 7, 6, '#0E1530' if lit else '#0A0F22')
    cv.px(x + 2, y + 1, '#E8E4D0')
    cv.hl(x, y + 3, 7, '#5E3420' if lit else pal['dark_furn'])
    cv.vl(x + 3, y, 6, '#5E3420' if lit else pal['dark_furn'])
    cv.hl(x - 1, y - 1, 9, '#F7F2E6' if lit else pal['dark_furn'])
    cv.hl(x - 1, y + 6, 9, '#F7F2E6' if lit else pal['dark_furn'])


def room2(cv, x, y, w, h, lit, pal, kind, window_at=None):
    room(cv, x, y, w, h, lit, pal, kind)
    if window_at is not None:
        back_window(cv, x + window_at, y + 6, lit, pal)


def roof_skillion(cv, x, y_low, w, rise, c1='#7C838A', c2='#959CA3'):
    """Solid sloped sheet, high on the left; y_low is the right-hand eave."""
    for i in range(w):
        yy = y_low - round(rise * (w - 1 - i) / (w - 1))
        cv.px(x + i, yy - 1, EDGE)
        cv.px(x + i, yy, c2)
        cv.px(x + i, yy + 1, c1 if i % 2 else c2)
        cv.px(x + i, yy + 2, '#5B6168')
        cv.px(x + i, yy + 3, EDGE)


def queenslander2(cv, x, ground, lit, pal):
    w, rh = 64, 32
    floor = ground - 9
    top = floor - rh
    cv.checker(x + 2, floor + 1, w - 4, 8, '#26352A', pal['dark_furn'])
    for sx in (x + 2, x + 20, x + 40, x + w - 4):
        cv.rect(sx, floor + 1, 2, 8, '#4A3A28')
    cv.rect(x - 9, floor - 1, w + 10, 2, '#6A5038')
    for i in range(4):
        cv.hl(x - 13 - i * 2, floor + 1 + i * 2, 4, '#6A5038')
    half = (w - 5) // 2
    room2(cv, x + 2, top + 2, half, rh - 2, lit[0], pal, 'lounge', window_at=half - 14)
    room2(cv, x + 3 + half, top + 2, w - 5 - half, rh - 2, lit[1], pal, 'kitchen')
    cv.vl(x + 2 + half, top + 2, rh - 2, '#D9CDB0')
    frame(cv, x, top, w, rh + 1, '#E2D6B8')
    # verandah
    cv.hl(x - 9, floor - 7, 9, '#E2D6B8'); cv.vl(x - 9, floor - 16, 16, '#E2D6B8')
    for k in range(4):
        cv.vl(x - 8 + k * 2, floor - 6, 6, '#BFB396')
    cv.hl(x - 10, floor - 17, 10, '#959CA3')
    roof_hip(cv, x - 10, top - 1, w + 20, 12, '#7C838A', '#959CA3')
    cv.hl(x - 10, top - 1, w + 20, '#5B6168')
    condenser(cv, x + w + 3, floor - 7, lit[0] or lit[1])
    return dict(eave=(x + w + 6, top - 1), door=(x - 4, floor - 4), rooms=[(x + 2, top + 2, half, rh - 2), (x + 3 + half, top + 2, w - 5 - half, rh - 2)])


def fibro2(cv, x, ground, lit, pal):
    w, rh = 48, 30
    floor = ground - 3
    top = floor - rh
    cv.rect(x + 1, floor + 1, w - 2, 2, '#3A3A40')
    room2(cv, x + 2, top + 2, w - 4, rh - 2, lit[0], pal, 'bed', window_at=w - 22)
    frame(cv, x, top, w, rh + 1, '#9CC5C0')
    rx, rw, rise, ylow = x - 5, w + 10, 7, top - 2
    for i in range(rw):
        xx = rx + i
        if x <= xx < x + w:
            yy = ylow - round(rise * (rw - 1 - i) / (rw - 1))
            for y2 in range(yy + 3, top):
                cv.px(xx, y2, '#9CC5C0' if (xx not in (x, x + w - 1)) else EDGE)
    roof_skillion(cv, rx, ylow, rw, rise)
    condenser(cv, x - 9, floor - 7, lit[0])
    return dict(eave=(x + w - 2, top - 3), door=(x + w // 2, floor), rooms=[(x + 2, top + 2, w - 4, rh - 2)])


def brick2(cv, x, ground, lit, pal):
    w, rh = 60, 30
    floor = ground - 2
    top = floor - rh
    half = (w - 4) // 2
    room2(cv, x + 2, top + 2, half, rh - 2, lit[0], pal, 'tv')
    room2(cv, x + 2 + half, top + 2, w - 4 - half, rh - 2, lit[1], pal, 'kitchen', window_at=4)
    cv.vl(x + 1 + half, top + 2, rh - 2, '#B4785A')
    frame(cv, x, top, w, rh + 1, '#A8603E')
    for yy in range(top, top + rh + 1):
        for xx in list(range(x, x + 2)) + list(range(x + w - 2, x + w)):
            if yy % 2 == 0:
                cv.px(xx, yy, '#7A4430')
    cv.hl(x, top, w, '#7A4430')
    tiles(cv, x - 5, top - 1, w + 10, 11)
    return dict(eave=(x + 3, top - 1), door=(x + w // 2, floor), rooms=[(x + 2, top + 2, half, rh - 2), (x + 2 + half, top + 2, w - 4 - half, rh - 2)])


def shop2(cv, x, ground, lit, pal):
    w, rh = 60, 36
    floor = ground - 1
    top = floor - rh
    room2(cv, x + 2, top + 9, w - 4, rh - 9, lit[0], pal, 'shop')
    cv.rect(x, top, w, 9, '#D9D2BE')
    cv.hl(x, top + 8, w, EDGE)
    cv.rect(x + 8, top + 2, w - 16, 5, '#141414')
    for k in range(7):  # little marquee bulbs
        cv.px(x + 11 + k * 6, top + 4, '#F5B83D' if lit[0] else '#4A4A40')
    frame(cv, x, top, w, rh + 1, '#D9D2BE')
    for i in range(w + 6):
        cv.vl(x - 3 + i, top + 9, 4, '#B8432F' if (i // 4) % 2 else '#ECEAE4')
        if (i % 4) == 1:
            cv.px(x - 3 + i, top + 13, '#B8432F' if (i // 4) % 2 else '#ECEAE4')
    cv.hl(x - 3, top + 14, w + 6, EDGE)
    cv.hl(x - 1, top - 1, w + 2, EDGE)
    corrugated(cv, x - 1, top - 3, w + 2, 2)
    condenser(cv, x + w + 3, floor - 7, lit[0])
    return dict(eave=(x + w - 3, top - 2), door=(x + w // 2, floor), rooms=[(x + 2, top + 9, w - 4, rh - 9)])


def units2(cv, x, ground, lit, pal):
    w, rh = 52, 28
    f1 = ground - 1
    t1 = f1 - rh
    t2 = t1 - rh
    room2(cv, x + 2, t1 + 1, w - 4, rh - 1, lit[0], pal, 'lounge', window_at=w - 20)
    room2(cv, x + 2, t2 + 2, w - 4, rh - 1, lit[1], pal, 'tv', window_at=w - 16)
    cv.rect(x, t1 - 1, w, 2, '#C7BBA2')
    frame(cv, x, t2, w, rh * 2 + 1, '#C7BBA2')
    cv.hl(x + w, t1 - 6, 6, '#ECEAE4'); cv.vl(x + w + 5, t1 - 6, 6, '#ECEAE4')
    cv.vl(x + w + 3, t1 - 5, 5, '#BDB8AA'); cv.vl(x + w + 1, t1 - 5, 5, '#BDB8AA')
    corrugated(cv, x - 3, t2 - 3, w + 6, 2)
    cv.hl(x - 3, t2 - 4, w + 6, EDGE)
    condenser(cv, x + w + 2, f1 - 7, lit[0])
    return dict(eave=(x + 2, t2 - 3), door=(x + w // 2, f1), rooms=[(x + 2, t1 + 1, w - 4, rh - 1), (x + 2, t2 + 2, w - 4, rh - 1)])


def backyard_trees(cv, y_base, pal, mode, seed=4):
    """Dark foliage band between sea and street: palms, gums, pines."""
    col = {'dusk': '#141A2A', 'lit': '#0B111C', 'night': '#0B111C', 'storm': '#080B14'}[mode]
    col2 = mix(col, '#2A3A3A', 0.35)
    rnd = np.random.RandomState(seed)
    # low hedge band
    for x in range(cv.w):
        h = 8 + int(3 * math.sin(x / 7.0) + 2 * math.sin(x / 3.1))
        cv.vl(x, y_base - h, h + 30, col)
    for _ in range(cv.w // 26):
        x = rnd.randint(0, cv.w)
        kind = rnd.randint(0, 3)
        if kind == 0:  # palm
            hgt = rnd.randint(18, 26)
            for t in range(hgt):
                cv.px(x + (t * t) // 120, y_base - t, col)
            tx, ty = x + (hgt * hgt) // 120, y_base - hgt
            for dx, dy in [(-1, 0), (1, 0), (-2, 1), (2, 1), (-3, 2), (3, 2), (-4, 3), (4, 3), (0, -1), (-1, -1), (1, -1), (-2, -2), (2, -2), (-5, 4), (5, 4)]:
                cv.px(tx + dx, ty + dy, col)
        elif kind == 1:  # norfolk pine
            norfolk(cv, x, y_base, rnd.randint(22, 32), col)
        else:  # gum blob
            r = rnd.randint(6, 10)
            cx, cy = x, y_base - r - rnd.randint(2, 8)
            for yy in range(-r, r):
                for xx in range(-r - 2, r + 3):
                    if (xx / 1.2) ** 2 + yy ** 2 < r * r:
                        cv.px(cx + xx, cy + yy, col if (xx + yy) % 5 else col2)
            cv.vl(cx, cy, y_base - cy, col)


def ute(cv, x, y, beacon=False):
    """Dual-cab tray ute, facing left. ~58x22. Returns front light point."""
    O, Wt, Ws, G = EDGE, '#E8E6DE', '#BDBBB3', '#4E6E86'
    # ladder rack + ladder
    cv.hl(x + 18, y + 2, 40, '#3A3A40')
    for px_ in (x + 30, x + 56):
        cv.vl(px_, y + 2, 9, '#3A3A40')
    cv.hl(x + 16, y, 44, '#B9B7AF'); cv.hl(x + 16, y + 1, 44, '#8E8C86')
    for k in range(17, 60, 4):
        cv.px(x + k, y, '#8E8C86')
    # cab
    cv.rect(x + 8, y + 4, 22, 9, Wt)
    cv.hl(x + 9, y + 3, 20, O)
    cv.rect(x + 11, y + 5, 7, 5, G); cv.rect(x + 20, y + 5, 8, 5, G)
    cv.px(x + 11, y + 5, '#7A9AB2'); cv.px(x + 20, y + 5, '#7A9AB2')
    cv.vl(x + 19, y + 4, 9, Ws)
    # windscreen slope + bonnet
    for i in range(4):
        cv.px(x + 8 - i, y + 5 + i, O)
        cv.hl(x + 9 - i, y + 5 + i, 2 + i, G if i < 3 else Wt)
    cv.rect(x + 1, y + 9, 10, 4, Wt)
    cv.hl(x + 1, y + 8, 8, O)
    # snorkel
    cv.vl(x + 8, y + 1, 9, '#1A1A1E'); cv.hl(x + 8, y + 1, 3, '#1A1A1E')
    # lower body
    cv.rect(x + 1, y + 13, 30, 4, Wt)
    cv.hl(x + 1, y + 16, 30, Ws)
    # tray
    cv.rect(x + 31, y + 10, 28, 3, '#A9A8A2'); cv.hl(x + 31, y + 10, 28, '#CFCDC6')
    cv.rect(x + 31, y + 4, 2, 6, '#8E8C86')
    cv.rect(x + 33, y + 13, 12, 4, '#2E2F35')  # toolbox
    cv.rect(x + 50, y + 13, 7, 2, '#2E2F35')
    cv.px(x + 58, y + 11, '#C2402F'); cv.px(x + 58, y + 12, '#C2402F')
    # bullbar
    cv.vl(x - 1, y + 8, 9, '#1A1A1E'); cv.vl(x, y + 9, 7, '#2A2A30')
    cv.hl(x - 1, y + 8, 4, '#1A1A1E')
    cv.px(x + 1, y + 10, '#FFE6A0'); cv.px(x + 2, y + 10, '#FFE6A0')
    # outline
    cv.hl(x + 1, y + 17, 58, O)
    # door badge: hexagon
    for (bx, by) in [(x + 22, y + 13), (x + 23, y + 12), (x + 24, y + 12), (x + 25, y + 13), (x + 24, y + 14), (x + 23, y + 14)]:
        cv.px(bx, by, '#141414')
    # wheels
    for wx in (x + 8, x + 46):
        for yy in range(-4, 5):
            for xx in range(-4, 5):
                d = xx * xx + yy * yy
                if d <= 18:
                    cv.px(wx + xx, y + 18 + yy, '#141418' if d > 5 else ('#7C7C80' if d > 1 else '#3A3A40'))
    cv.rect(x + 3, y + 16, 12, 2, '#141418'); cv.rect(x + 41, y + 16, 12, 2, '#141418')
    for wx in (x + 8, x + 46):
        for yy in range(-4, 5):
            for xx in range(-4, 5):
                d = xx * xx + yy * yy
                if d <= 18:
                    cv.px(wx + xx, y + 18 + yy, '#141418' if d > 5 else ('#7C7C80' if d > 1 else '#3A3A40'))
    if beacon:
        cv.rect(x + 17, y + 2, 3, 1, '#F5B83D')
        cv.glow(x + 18, y + 2, 12, '#F5B83D', 0.55)
    return (x + 1, y + 10)


W, H, GROUND, HORIZON = 396, 162, 116, 64


def street(mode, mac=True):
    pal = {'dusk': DUSK, 'lit': NIGHT, 'storm': STORM, 'night': NIGHT}[mode]
    cv = Cv(W, H)
    storm = mode == 'storm'
    allon = mode == 'lit'
    sky_and_sea(cv, pal, HORIZON, stars=not storm, moon=not storm)
    headland(cv, 0, HORIZON, 54, '#0A0F1E' if mode != 'dusk' else '#1A1838')
    island_lighthouse(cv, 236, HORIZON, lit=True)
    if storm:
        clouds(cv, 8)
    if mode == 'dusk':
        flying_foxes(cv, [(170, 16), (182, 12), (191, 19), (204, 10), (70, 22), (80, 17), (300, 25)], '#2A1E3A')
    backyard_trees(cv, HORIZON + 26, pal, mode)
    if storm:
        bolt(cv, 30, 0, 60)

    L = dict(
        fibro=(allon,) if mode != 'dusk' else (False,),
        qld=(True, True) if allon else ((True, False) if mode == 'dusk' else (True, True)),
        brick=(True, True) if allon else ((False, True) if mode == 'dusk' else (False, False)),
        shop=(True,) if allon else ((True,) if mode == 'dusk' else (False,)),
        units=(True, True) if allon else ((False, True) if mode == 'dusk' else (True, False)),
    )
    if storm:
        L['fibro'] = (False,)
    ground_and_road(cv, pal, GROUND)
    e = {}
    e['fibro'] = fibro2(cv, 14, GROUND, L['fibro'], pal)
    e['qld'] = queenslander2(cv, 88, GROUND, L['qld'], pal)
    e['brick'] = brick2(cv, 178, GROUND, L['brick'], pal)
    meter_box(cv, 171, GROUND - 17)
    e['shop'] = shop2(cv, 252, GROUND, L['shop'], pal)
    e['units'] = units2(cv, 330, GROUND, L['units'], pal)

    wire = '#06070B'
    a1, b1 = pole(cv, 166, GROUND + 2, 36, allon, pal)
    a2, b2 = pole(cv, 322, GROUND + 2, 36, allon, pal)
    for dy in (0, 3):
        cv.sag(0, 34 + dy, a1[0], a1[1] + dy, 5, wire)
        cv.sag(b1[0], b1[1] + dy, a2[0], a2[1] + dy, 6, wire)
        cv.sag(b2[0], b2[1] + dy, W - 1, 34 + dy, 2, wire)
    cv.sag(a1[0], a1[1] + 1, *e['qld']['eave'], 3, wire)
    cv.sag(b1[0], b1[1] + 1, *e['brick']['eave'], 3, wire)
    cv.sag(a2[0], a2[1] + 1, *e['shop']['eave'], 3, wire)
    cv.sag(b2[0], b2[1] + 1, *e['units']['eave'], 2, wire)
    cv.sag(a1[0], a1[1] + 1, *e['fibro']['eave'], 9, wire)

    if allon:
        for px_ in (175, 331):
            cv.glow(px_, GROUND + 7, 20, '#FFD27A', 0.45, rx=1.5, ry=0.55)
        for v in e.values():
            dx, dy = v['door']
            cv.glow(dx, dy - 2, 8, '#FFE6A0', 0.3)

    if mode in ('lit', 'dusk'):
        cv.sprite(POSSUM, POSSUM_PAL, 236, 34 + 3 + 4)

    if allon or storm:
        cv.glow(176 - 8, GROUND + 4 + 14, 16, '#FFF1C2', 0.4, rx=1.8, ry=0.45)
    uf = hilux(cv, 176, GROUND + 4, beacon=storm)

    if mac:
        if mode == 'dusk':
            cv.sprite(MAC_BOX, BOX_PAL, 151, GROUND + 6 - len(MAC_BOX))
        elif mode == 'lit':
            cv.sprite(MAC_IDLE, MAC_PAL, 150, GROUND + 6 - len(MAC_IDLE))
        elif mode == 'storm':
            lx = 170
            for yy in range(58, GROUND + 6):
                o = (GROUND + 6 - yy) // 10
                cv.px(lx + o, yy, '#C9C9C4'); cv.px(lx + 7 + o, yy, '#C9C9C4')
                if yy % 4 == 0:
                    cv.hl(lx + o, yy, 8, '#9A9A96')
            cv.sprite(MAC_IDLE, MAC_PAL, lx + 4, 60)
            cv.glow(lx + 20, 66, 14, '#FFF1C2', 0.5)
            rain(cv)
    return cv, e


if __name__ == '__main__':
    for m in ('dusk', 'lit', 'storm'):
        cv, e = street(m)
        cv.save(os.path.join(OUT, f's2_{m}_4x.png'), 4)
        crop = Cv(130, H)
        crop.a = cv.a[:, 84:214].copy(); crop.w = 130
        crop.save(os.path.join(OUT, f's2_phone_{m}_3x.png'), 3)
    print('ok')
