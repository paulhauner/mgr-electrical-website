"""Tiny pixel-art toolkit + MGR street scene generator."""
import math, numpy as np
from PIL import Image

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def hx(c):
    if isinstance(c, tuple):
        return c
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    a, b = hx(a), hx(b)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


class Cv:
    def __init__(s, w, h, bg='#000000'):
        s.w, s.h = w, h
        s.a = np.zeros((h, w, 3), np.uint8)
        s.a[:] = hx(bg)

    def px(s, x, y, c):
        if 0 <= x < s.w and 0 <= y < s.h and c is not None:
            s.a[y, x] = hx(c)

    def get(s, x, y):
        return tuple(int(v) for v in s.a[y, x])

    def rect(s, x, y, w, h, c):
        x0, y0, x1, y1 = max(0, x), max(0, y), min(s.w, x + w), min(s.h, y + h)
        if x1 > x0 and y1 > y0:
            s.a[y0:y1, x0:x1] = hx(c)

    def hl(s, x, y, w, c):
        s.rect(x, y, w, 1, c)

    def vl(s, x, y, h, c):
        s.rect(x, y, 1, h, c)

    def checker(s, x, y, w, h, c1, c2, ph=0):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                s.px(xx, yy, c1 if (xx + yy + ph) % 2 == 0 else c2)

    def line(s, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            s.px(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy

    def sag(s, x0, y0, x1, y1, drop, c):
        """Catenary-ish power line."""
        n = max(abs(x1 - x0), 1)
        prev = None
        for i in range(n + 1):
            t = i / n
            x = round(x0 + (x1 - x0) * t)
            y = round(y0 + (y1 - y0) * t + drop * 4 * t * (1 - t))
            if prev:
                s.line(prev[0], prev[1], x, y, c)
            prev = (x, y)

    def sprite(s, rows, pal, x, y, flip=False):
        for j, r in enumerate(rows):
            if flip:
                r = r[::-1]
            for i, ch in enumerate(r):
                if ch != '.' and ch in pal:
                    s.px(x + i, y + j, pal[ch])

    def vgrad(s, y0, y1, stops):
        """Dithered vertical gradient between colour stops [(t,col),...]."""
        for y in range(y0, y1):
            t = (y - y0) / max(1, (y1 - y0 - 1))
            for k in range(len(stops) - 1):
                if stops[k][0] <= t <= stops[k + 1][0]:
                    ta, ca = stops[k]
                    tb, cb = stops[k + 1]
                    u = (t - ta) / max(1e-6, tb - ta)
                    break
            # quantise to 4 steps then dither between them
            q = u * 4
            lo = math.floor(q)
            fr = q - lo
            for x in range(s.w):
                step = lo + (1 if fr > BAYER[y % 4, x % 4] else 0)
                s.a[y, x] = mix(ca, cb, min(step, 4) / 4)

    def glow(s, cx, cy, r, col, strength=0.55, rx=1.0, ry=1.0, clip=None):
        """Banded, ordered-dithered light pool."""
        for y in range(int(cy - r * ry) - 1, int(cy + r * ry) + 2):
            for x in range(int(cx - r * rx) - 1, int(cx + r * rx) + 2):
                if not (0 <= x < s.w and 0 <= y < s.h):
                    continue
                if clip and not (clip[0] <= x < clip[2] and clip[1] <= y < clip[3]):
                    continue
                d = math.hypot((x - cx) / rx, (y - cy) / ry) / r
                if d >= 1:
                    continue
                t = strength * (1 - d) ** 1.4
                q = t * 6
                lo = math.floor(q)
                step = lo + (1 if (q - lo) > BAYER[y % 4, x % 4] else 0)
                t = step / 6
                s.a[y, x] = mix(s.get(x, y), col, min(t, 0.9))

    def tint(s, x, y, w, h, col, t):
        for yy in range(max(0, y), min(s.h, y + h)):
            for xx in range(max(0, x), min(s.w, x + w)):
                s.a[yy, xx] = mix(s.get(xx, yy), col, t)

    def save(s, path, scale=1):
        im = Image.fromarray(s.a, 'RGB')
        if scale != 1:
            im = im.resize((s.w * scale, s.h * scale), Image.NEAREST)
        im.save(path, optimize=True)


# ---------------------------------------------------------------- palette
P = dict(
    amber='#F5B83D', bulb='#FFF1C2', cool='#86CDEE', white='#ECEAE4',
    ink='#141414', line='#08090E',
)

NIGHT = dict(sky=[(0, '#0B1028'), (0.55, '#18214A'), (0.85, '#2E2D5C'), (1, '#4A3560')],
             dark_room='#1B1F36', dark_furn='#12152A', ground='#18301F', grass2='#1F3A26',
             path='#3B3B42', kerb='#55555C', road='#1E1F26', roadline='#8A8A86', sea='#0E2333')
DUSK = dict(sky=[(0, '#141A3C'), (0.45, '#2A2E62'), (0.75, '#6B4470'), (0.92, '#C26A54'), (1, '#E89A5A')],
            dark_room='#262A44', dark_furn='#191C33', ground='#22402A', grass2='#2A4A30',
            path='#4A4A50', kerb='#64646A', road='#26272E', roadline='#9A9A94', sea='#1A3448')
STORM = dict(sky=[(0, '#06080F'), (0.6, '#0E1322'), (1, '#1C2236')],
             dark_room='#151829', dark_furn='#0D0F1C', ground='#13241A', grass2='#18301F',
             path='#2E2F36', kerb='#46474E', road='#16171D', roadline='#5E5E5C', sea='#0A1520')

# ---------------------------------------------------------------- sprites
MAC_PAL = {
    'C': '#8C8A68', 'c': '#6E6C50', 'V': '#5B5A42', 'W': '#D8D2B0',  # cap, brim, patch
    'S': '#E3AC8C', 's': '#C68C6E', 'E': '#2A1C16',  # skin
    'B': '#8E5A33', 'b': '#6B4124',  # beard
    'N': '#2C3754', 'n': '#1F2740', 'R': '#B9BEC6',  # shirt navy, shade, reflective
    'T': '#4F6474',  # ink
    'L': '#6E4E2C', 'l': '#9C7444',  # tool belt
    'P': '#2A3350', 'p': '#1E253C',  # trousers
    'K': '#8A6640', 'k': '#5E4428',  # boots
    'O': '#0D0E14',
}

MAC_IDLE = [
    "......OOOOO.....",
    ".....OCCCCCO....",
    "....OCCWWCCCO...",
    "....OCCCCCCCVVV.",
    "....OBSSSSSSO...",
    "....OBSESSESO...",
    "....OBSSSSSSs...",
    "....OBBSssSBBO..",
    "....OBBBBBBBBO..",
    "...OObBBBBBBbOO.",
    "..ONNNNNNNNNNNNO",
    "..ONRNNNNNNNNRNO",
    "..ONNNNNNNNNNNNO",
    "..OSnNNNNNNNNnSO",
    "..OSTnNNNNNNnTSO",
    "..OSSLLlLLlLLSSO",
    "...OOPPPPPPPPOO.",
    "....OPPPpPPPPO..",
    "....OPPPOPPPPO..",
    "....OPPPOOPPPO..",
    "....OPPPO.OPPPO.",
    "....OKKKO.OKKKO.",
    "...OkKKKO.OKKKkO",
    "...OOOOO..OOOOOO",
]

MAC_WALK = [
    "......OOOOO.....",
    ".....OCCCCCO....",
    "....OCCWWCCCO...",
    "....OCCCCCCCVVV.",
    "....OBSSSSSSO...",
    "....OBSESSESO...",
    "....OBSSSSSSs...",
    "....OBBSssSBBO..",
    "....OBBBBBBBBO..",
    "...OObBBBBBBbOO.",
    "..ONNNNNNNNNNNNO",
    "..ONRNNNNNNNNRNO",
    "..ONNNNNNNNNNNNO",
    "..OSnNNNNNNNNnSO",
    "..OSTnNNNNNNnTSO",
    "..OSSLLlLLlLLSSO",
    "...OOPPPPPPPPOO.",
    "....OPPPpPPPPO..",
    "...OPPPO.OPPPO..",
    "...OPPO...OPPPO.",
    "..OPPPO....OPPPO",
    "..OKKKO....OKKKO",
    ".OkKKKO....OKKKkO",
    ".OOOOO.....OOOOOO",
]

# carrying a split-system head unit on the shoulder
MAC_CARRY = [
    "..OOOOOOOOOOOOOOOO..",
    "..OwwwwwwwwwwwwwwwO.",
    "..OwggggggggggggwwO.",
    "..OOOOOOOOOOOOOOOOO.",
    "....OSOOOOOOO.OSO...",
    "....OSOCCCCCOOOSO...",
    "....OSCCWWCCCOSO....",
    "....OSCCCCCCCVVV....",
    "....OSBSSSSSSO......",
    "....OOBSESSESO......",
    "......BSSSSSSs......",
    "......BBSssSBBO.....",
    "......BBBBBBBBO.....",
    ".....ObBBBBBBbOO....",
    "....ONNNNNNNNNNNO...",
    "....ONRNNNNNNNNRO...",
    "....ONNNNNNNNNNNO...",
    "....OnNNNNNNNNNnO...",
    "....OnNNNNNNNNNnO...",
    "....OOLLlLLlLLLOO...",
    ".....OPPPPPPPPPO....",
    ".....OPPPpPPPPPO....",
    "....OPPPO.OPPPO.....",
    "....OPPO...OPPPO....",
    "...OPPPO....OPPPO...",
    "...OKKKO....OKKKO...",
    "..OkKKKO....OKKKkO..",
    "..OOOOO.....OOOOOO..",
]
CARRY_PAL = dict(MAC_PAL, w='#EEECE6', g='#C9C9C4')

MAC_SLEEP = [  # lying down, for the 2am easter egg
    "..OOOOO..............",
    ".OCCCCCO.OOOOOOOOOOO.",
    "OCCWWCCOONNNNNNNNNNNO",
    "OBSSSSSOONRNNNNNNNNNO",
    "OBSEESSOONNNNNNNNNNNO",
    "OBBBBBBOOOOOOOOOOOOOO",
    ".OOOOOO..............",
]

UTE = [
    "...........OOOOOOOOOOOOOOOOOOOOOO...",
    "...........O.....O......O......O....",
    "..........OOOOOOOOOOOOOOOOOOOOOOO...",
    ".......OOOOOOOOOO...................",
    "......OGGGGGGOGGGGO.................",
    ".....OGGGGGGGOGGGGGO...OOOOOOOOOOOO.",
    "....OWWWWWWWWOWWWWWWOOOAAAAAAAAAAAAO",
    "OOOOWWWWHHWWWOWWWWWWWWOAAAAAAAAAAAAO",
    "OYWWWWWWHHWWWOWWWWWWWWOOOOOOOOOOOOOO",
    "OWWWWWWWWWWWWOWWWWWWWWWWWWWWWWWWWWRO",
    "OddddOOOddddddddddddddddddOOOOddddRO",
    ".ddOXXXOdddddddddddddddddOXXXOdddO..",
    "...OXuXO.................OXuXO......",
    "....OOO...................OOO.......",
]
UTE_PAL = {'O': '#0A0B10', 'W': '#E6E4DC', 'd': '#A9A8A2', 'G': '#5D7C93', 'H': '#F2F0EA',
           'A': '#9A9A96', 'X': '#16171C', 'u': '#7C7C80', 'Y': '#F5B83D', 'R': '#C2402F'}

POSSUM = [
    "OO..........",
    "OyO.OOOO....",
    ".OOOggggOO..",
    "..OggggggOOO",
    "...OOOOOO..O",
]
POSSUM_PAL = {'O': '#2B2B33', 'g': '#4A4A52', 'y': '#F5D46A'}

BAT = ["O...O", ".OOO.", "..O.."]


# ---------------------------------------------------------------- scenery

def sky_and_sea(cv, pal, horizon, stars=True, moon=True, seed=1):
    cv.vgrad(0, horizon, pal['sky'])
    rnd = np.random.RandomState(seed)
    if stars:
        for _ in range(int(cv.w * horizon / 90)):
            x, y = rnd.randint(0, cv.w), rnd.randint(0, int(horizon * 0.6))
            cv.px(x, y, '#E8E4D0' if rnd.rand() > 0.5 else '#8E8CA8')
    if moon:
        mx, my = int(cv.w * 0.78), 20
        for y in range(-5, 6):
            for x in range(-5, 6):
                if x * x + y * y <= 25:
                    cv.px(mx + x, my + y, '#F2E9C8' if (x + 2) ** 2 + (y - 1) ** 2 > 9 else '#E3D9B4')
        cv.glow(mx, my, 14, '#F2E9C8', 0.18)
    cv.rect(0, horizon, cv.w, cv.h - horizon, pal['sea'])
    for x in range(0, cv.w, 1):
        if (x * 7 + 3) % 11 == 0:
            cv.px(x, horizon + 1 + (x % 3), mix(pal['sea'], '#ffffff', 0.18))


def headland(cv, x0, horizon, w, col='#0A1020'):
    for x in range(w):
        t = x / w
        h = int(9 * math.sin(min(1, t * 1.6) * math.pi / 2) * (1 - max(0, t - 0.75) * 3))
        cv.vl(x0 + x, horizon - h, h + 1, col)
    # norfolk pines on the headland
    for px_ in (x0 + 6, x0 + 11, x0 + 15):
        norfolk(cv, px_, horizon - 6, 9, col)


def norfolk(cv, x, base, h, col):
    cv.vl(x, base - h, h, col)
    for i in range(0, h, 2):
        span = 1 + (i // 2) // 1
        cv.hl(x - span // 2 - (1 if i % 4 == 0 else 0), base - h + i + 1, span + 1, col)


def island_lighthouse(cv, x, horizon, lit=True):
    cv.rect(x, horizon - 1, 7, 2, '#0A1020')
    cv.rect(x + 2, horizon - 2, 3, 1, '#0A1020')
    cv.vl(x + 3, horizon - 5, 3, '#C8C6BE')
    cv.px(x + 3, horizon - 6, '#F5B83D' if lit else '#3A3A40')
    if lit:
        cv.glow(x + 3, horizon - 6, 5, '#F5B83D', 0.5)


def corrugated(cv, x, y, w, h, c1='#7C838A', c2='#949BA2'):
    for xx in range(x, x + w):
        cv.vl(xx, y, h, c1 if xx % 2 else c2)


def roof_hip(cv, x, y_eave, w, h, c1, c2, ridge=None):
    """Trapezoid hip roof, eave at y_eave, narrowing upward."""
    for i in range(h):
        inset = i * 2
        yy = y_eave - i
        xx = x + inset
        ww = w - inset * 2
        if ww <= 2:
            break
        for k in range(ww):
            col = c1 if (xx + k) % 2 else c2
            cv.px(xx + k, yy, col)
        cv.px(xx, yy, '#0A0B10'); cv.px(xx + ww - 1, yy, '#0A0B10')
    cv.hl(x, y_eave + 1, w, '#0A0B10')


def tiles(cv, x, y_eave, w, h, base='#8E4430', dark='#6A2F20'):
    for i in range(h):
        inset = i * 2
        yy = y_eave - i
        ww = w - inset * 2
        if ww <= 2:
            break
        cv.hl(x + inset, yy, ww, dark if i % 2 == 0 else base)
        for k in range(0, ww, 3):
            cv.px(x + inset + k + (i % 2), yy, dark)
        cv.px(x + inset, yy, '#0A0B10'); cv.px(x + inset + ww - 1, yy, '#0A0B10')
    cv.hl(x, y_eave + 1, w, '#0A0B10')


# -------------------------------------------- room interiors (cutaway)
LIT_WALL = '#EDCF8E'
LIT_WALL2 = '#E2BD72'
LIT_FLOOR = '#A8774A'


def room(cv, x, y, w, h, lit, pal, kind, ac_on=None):
    """x,y = interior top-left; draws back wall, floor, furniture, lights."""
    if ac_on is None:
        ac_on = lit
    if lit:
        cv.rect(x, y, w, h, LIT_WALL)
        cv.rect(x, y + h - 2, w, 2, LIT_FLOOR)
        cv.rect(x, y, w, 2, LIT_WALL2)  # shade under ceiling
        furn, furn2 = '#8A4A30', '#5E3420'
    else:
        cv.rect(x, y, w, h, pal['dark_room'])
        cv.rect(x, y + h - 2, w, 2, pal['dark_furn'])
        furn, furn2 = pal['dark_furn'], pal['dark_furn']
    fy = y + h - 2  # floor line
    # split system head unit on back wall
    ux = x + w - 10 if kind != 'bed' else x + 2
    cv.rect(ux, y + 2, 8, 2, '#F2F1EC' if lit else '#3A3E56')
    cv.hl(ux, y + 4, 8, '#BDBDB8' if lit else '#2A2E44')
    if ac_on:
        cv.px(ux + 7, y + 2, '#3FA9E0')
        for k in range(3):
            cv.px(ux + 1 + k * 3, y + 6 + (k % 2), '#86CDEE')
            cv.px(ux + 2 + k * 3, y + 7 - (k % 2), '#86CDEE')
    if kind == 'lounge':
        # couch + person + lamp
        cv.rect(x + 2, fy - 4, 10, 2, furn); cv.rect(x + 2, fy - 2, 10, 2, furn2)
        cv.rect(x + 1, fy - 5, 2, 5, furn2); cv.rect(x + 11, fy - 5, 2, 5, furn2)
        if lit:
            cv.rect(x + 6, fy - 8, 2, 2, '#E3AC8C'); cv.rect(x + 5, fy - 6, 4, 2, '#3A6E8C')
        cv.vl(x + w - 3, fy - 7, 7, '#2A2A2A' if lit else furn)
        cv.rect(x + w - 4, fy - 9, 3, 2, '#F7E3A8' if lit else furn)
        if lit:
            cv.glow(x + w - 3, fy - 8, 7, '#FFF1C2', 0.35, clip=(x, y, x + w, y + h))
    elif kind == 'kitchen':
        cv.rect(x + 2, fy - 10, 4, 10, '#F2F1EC' if lit else furn)
        cv.vl(x + 5, fy - 7, 2, '#9A9A96' if lit else furn)
        cv.rect(x + 7, fy - 4, w - 9, 4, '#6E4E2C' if lit else furn)
        cv.hl(x + 7, fy - 5, w - 9, '#D8D2C2' if lit else furn)
        bx = x + w // 2 + 2
        cv.vl(bx, y, 3, '#2A2A2A' if lit else furn)
        cv.px(bx, y + 3, '#FFF1C2' if lit else '#2E3246')
        if lit:
            cv.glow(bx, y + 4, 9, '#FFF1C2', 0.4, clip=(x, y, x + w, y + h))
    elif kind == 'bed':
        cv.rect(x + w - 13, fy - 3, 12, 3, '#3C5A7A' if lit else furn)
        cv.rect(x + w - 13, fy - 4, 4, 1, '#ECEAE4' if lit else furn)
        cv.rect(x + w - 2, fy - 6, 1, 6, furn2)
        # ceiling fan
        fx = x + w // 2
        cv.vl(fx, y, 2, '#2A2A2A' if lit else furn)
        cv.hl(fx - 4, y + 2, 9, '#5E3420' if lit else furn)
        if lit:
            cv.px(fx, y + 3, '#FFF1C2')
            cv.glow(fx, y + 3, 9, '#FFF1C2', 0.35, clip=(x, y, x + w, y + h))
    elif kind == 'tv':
        cv.rect(x + 2, fy - 7, 8, 5, '#0D0E14')
        cv.rect(x + 3, fy - 6, 6, 3, '#6AB2E0' if lit else '#1E2A3A')
        cv.rect(x + 4, fy - 2, 4, 2, furn2)
        cv.rect(x + 12, fy - 4, 7, 4, furn)
        if lit:
            cv.rect(x + 14, fy - 7, 2, 2, '#E3AC8C'); cv.rect(x + 13, fy - 5, 4, 1, '#8C3A3A')
        bx = x + w - 6
        cv.vl(bx, y, 3, '#2A2A2A' if lit else furn)
        cv.px(bx, y + 3, '#FFF1C2' if lit else '#2E3246')
        if lit:
            cv.glow(bx, y + 4, 8, '#FFF1C2', 0.35, clip=(x, y, x + w, y + h))
    elif kind == 'shop':
        cv.rect(x + 1, fy - 5, w - 2, 5, '#6E4E2C' if lit else furn)
        cv.hl(x + 1, fy - 6, w - 2, '#D8D2C2' if lit else furn)
        for k in range(3):
            cv.rect(x + 3 + k * 6, fy - 9, 3, 3, ['#E8C46A', '#C86A4A', '#E8E2D0'][k] if lit else furn)
        for bx in (x + 5, x + w - 6):
            cv.vl(bx, y, 3, '#2A2A2A' if lit else furn)
            cv.px(bx, y + 3, '#FFF1C2' if lit else '#2E3246')
            if lit:
                cv.glow(bx, y + 4, 8, '#FFF1C2', 0.35, clip=(x, y, x + w, y + h))


def frame(cv, x, y, w, h, col, edge='#0A0B10', t=2):
    cv.rect(x, y, w, t, col); cv.rect(x, y + h - t, w, t, col)
    cv.rect(x, y, t, h, col); cv.rect(x + w - t, y, t, h, col)
    cv.hl(x, y - 1, w, edge); cv.hl(x, y + h, w, edge)
    cv.vl(x - 1, y, h, edge); cv.vl(x + w, y, h, edge)


def condenser(cv, x, y, on):
    cv.rect(x, y, 6, 5, '#C9C9C4'); cv.hl(x, y + 4, 6, '#9A9A96')
    cv.rect(x + 1, y + 1, 3, 3, '#3A3A40')
    cv.px(x + 2, y + 2, '#8A8A90' if on else '#3A3A40')
    cv.vl(x - 1, y, 5, '#0A0B10'); cv.vl(x + 6, y, 5, '#0A0B10')
    cv.hl(x, y - 1, 6, '#0A0B10'); cv.hl(x, y + 5, 6, '#0A0B10')


def queenslander(cv, x, ground, lit, pal, rooms=('lounge', 'kitchen')):
    w, rh = 44, 18
    floor = ground - 7
    top = floor - rh
    # stumps + lattice
    cv.checker(x + 2, floor + 1, w - 4, 6, '#2E3A2C', pal['dark_furn'])
    for sx in (x + 2, x + 15, x + 28, x + w - 4):
        cv.rect(sx, floor + 1, 2, 6, '#4A3A28')
    cv.rect(x - 1, floor - 1, w + 2, 2, '#6A5038')
    # stairs
    for i in range(3):
        cv.hl(x - 4 - i * 2, floor + 1 + i * 2, 4, '#6A5038')
    # rooms
    half = (w - 6) // 2
    room(cv, x + 2, top + 2, half, rh - 2, lit[0], pal, rooms[0])
    room(cv, x + 3 + half + 1, top + 2, w - 6 - half, rh - 2, lit[1], pal, rooms[1])
    cv.vl(x + 2 + half, top + 2, rh - 2, '#D9CDB0')
    frame(cv, x, top, w, rh + 1, '#E2D6B8')
    # verandah rail on the left side
    cv.hl(x - 6, floor - 6, 6, '#E2D6B8'); cv.vl(x - 6, floor - 6, 6, '#E2D6B8')
    for k in range(3):
        cv.vl(x - 5 + k * 2, floor - 5, 5, '#BFB396')
    roof_hip(cv, x - 7, top - 1, w + 14, 9, '#7C838A', '#959CA3')
    cv.hl(x - 7, top - 1, w + 14, '#5B6168')
    condenser(cv, x + w + 2, floor - 6, lit[0] or lit[1])
    return dict(eave=(x + w - 2, top - 1), door=(x - 2, floor))


def fibro(cv, x, ground, lit, pal, kind='bed'):
    w, rh = 34, 18
    floor = ground - 3
    top = floor - rh
    cv.rect(x + 1, floor + 1, w - 2, 2, '#3A3A40')
    room(cv, x + 2, top + 2, w - 4, rh - 2, lit[0], pal, kind)
    frame(cv, x, top, w, rh + 1, '#9CC5C0')
    # skillion roof, high on the left
    for i in range(w + 8):
        yy = top - 6 + (i * 5) // (w + 8)
        cv.vl(x - 4 + i, yy, 2, '#7C838A' if i % 2 else '#959CA3')
        cv.px(x - 4 + i, yy - 1, '#0A0B10')
    condenser(cv, x - 8, floor - 6, lit[0])
    return dict(eave=(x + 2, top - 5), door=(x + w // 2, floor))


def brick(cv, x, ground, lit, pal, rooms=('tv', 'kitchen')):
    w, rh = 40, 18
    floor = ground - 2
    top = floor - rh
    half = (w - 4) // 2
    room(cv, x + 2, top + 2, half, rh - 2, lit[0], pal, rooms[0])
    room(cv, x + 2 + half, top + 2, w - 4 - half, rh - 2, lit[1], pal, rooms[1])
    cv.vl(x + 1 + half, top + 2, rh - 2, '#B4785A')
    # brick frame
    frame(cv, x, top, w, rh + 1, '#A8603E')
    for yy in range(top, top + rh + 1):
        for xx in list(range(x, x + 2)) + list(range(x + w - 2, x + w)):
            if yy % 2 == 0:
                cv.px(xx, yy, '#7A4430')
    cv.hl(x, top, w, '#7A4430')
    tiles(cv, x - 4, top - 1, w + 8, 8)
    return dict(eave=(x + 3, top - 1), door=(x + w // 2, floor))


def shop(cv, x, ground, lit, pal):
    """Corner shop / cafe: the commercial work."""
    w, rh = 40, 22
    floor = ground - 1
    top = floor - rh
    room(cv, x + 2, top + 6, w - 4, rh - 6, lit[0], pal, 'shop')
    cv.rect(x, top, w, 6, '#D9D2BE')
    cv.hl(x, top + 5, w, '#0A0B10')
    # sign board
    cv.rect(x + 6, top + 1, w - 12, 3, '#141414')
    for k in range(5):
        cv.px(x + 9 + k * 4, top + 2, '#F5B83D' if lit[0] else '#4A4A40')
    frame(cv, x, top, w, rh + 1, '#D9D2BE')
    # striped awning
    for i in range(w + 4):
        cv.vl(x - 2 + i, top + 6, 3, '#B8432F' if (i // 3) % 2 else '#ECEAE4')
    cv.hl(x - 2, top + 9, w + 4, '#0A0B10')
    cv.hl(x - 2, top - 1, w + 4, '#0A0B10')
    condenser(cv, x + w + 2, floor - 6, lit[0])
    return dict(eave=(x + w - 3, top), door=(x + w // 2, floor))


def units(cv, x, ground, lit, pal):
    """Two-storey brick unit block."""
    w, rh = 40, 16
    f1 = ground - 1
    t1 = f1 - rh
    t2 = t1 - rh
    room(cv, x + 2, t1 + 1, w - 4, rh - 1, lit[0], pal, 'lounge')
    room(cv, x + 2, t2 + 2, w - 4, rh - 1, lit[1], pal, 'tv')
    cv.hl(x, t1, w, '#C7BBA2')
    frame(cv, x, t2, w, rh * 2 + 1, '#C7BBA2')
    # balcony rail upstairs
    cv.hl(x + w, t1 - 4, 5, '#ECEAE4'); cv.vl(x + w + 4, t1 - 4, 4, '#ECEAE4')
    corrugated(cv, x - 3, t2 - 3, w + 6, 2)
    cv.hl(x - 3, t2 - 4, w + 6, '#0A0B10')
    condenser(cv, x + w + 1, t1 - 3, lit[1])
    condenser(cv, x + w + 1, f1 - 6, lit[0])
    return dict(eave=(x + 2, t2 - 3), door=(x + w // 2, f1))


def pole(cv, x, ground, top, light_on, pal):
    cv.rect(x, top, 2, ground - top, '#5A4630')
    cv.vl(x + 1, top, ground - top, '#46361F')
    cv.rect(x - 5, top + 2, 12, 1, '#5A4630')
    for k in (-5, -1, 3, 6):
        cv.px(x + k, top + 1, '#C8C8C0')
    # street light arm
    cv.hl(x + 2, top + 9, 7, '#6A6A70')
    cv.rect(x + 8, top + 9, 3, 2, '#2A2A30')
    cv.px(x + 9, top + 11, '#FFE6A0' if light_on else '#3A3A40')
    return (x - 5, top + 1), (x + 6, top + 1)


def ground_and_road(cv, pal, ground):
    cv.rect(0, ground, cv.w, 3, pal['grass2'])
    cv.checker(0, ground, cv.w, 1, pal['ground'], pal['grass2'])
    cv.rect(0, ground + 3, cv.w, 4, pal['path'])
    cv.hl(0, ground + 3, cv.w, mix(pal['path'], '#ffffff', 0.08))
    cv.rect(0, ground + 7, cv.w, 1, pal['kerb'])
    cv.rect(0, ground + 8, cv.w, cv.h - ground - 8, pal['road'])
    mid = ground + 8 + (cv.h - ground - 8) * 2 // 3
    for x in range(0, cv.w, 10):
        cv.hl(x + 2, mid, 5, pal['roadline'])


def flying_foxes(cv, pts, col='#0B0D1C'):
    for (x, y) in pts:
        cv.sprite(BAT, {'O': col}, x, y)


def rain(cv, seed=3, dens=0.05, col='#5A6A8E'):
    rnd = np.random.RandomState(seed)
    for _ in range(int(cv.w * cv.h * dens / 4)):
        x, y = rnd.randint(0, cv.w), rnd.randint(0, cv.h)
        for k in range(3):
            cv.px(x - k // 2, y + k, mix(cv.get(min(cv.w - 1, max(0, x - k // 2)), min(cv.h - 1, y + k)) if y + k < cv.h and 0 <= x - k // 2 < cv.w else (0, 0, 0), col, 0.7))


def clouds(cv, y, seed=5, cols=('#151B2E', '#1E2640', '#283252')):
    rnd = np.random.RandomState(seed)
    for c_i, col in enumerate(cols):
        for _ in range(int(cv.w / 8)):
            cx, cy = rnd.randint(-10, cv.w + 10), y + rnd.randint(-4, 10) + c_i * 3
            r = rnd.randint(5, 12)
            for yy in range(-r, r):
                for xx in range(-2 * r, 2 * r):
                    if (xx / 2) ** 2 + yy ** 2 < r * r and (yy > -r * 0.6):
                        if (xx + yy) % 2 == 0 or (xx / 2) ** 2 + yy ** 2 < (r - 2) ** 2:
                            cv.px(cx + xx, cy + yy, col)


def bolt(cv, x, y0, y1, seed=2):
    rnd = np.random.RandomState(seed)
    xs, y = x, y0
    pts = [(xs, y)]
    while y < y1:
        y += rnd.randint(3, 6)
        xs += rnd.randint(-3, 4)
        pts.append((xs, min(y, y1)))
    for (a, b) in zip(pts, pts[1:]):
        cv.line(a[0], a[1], b[0], b[1], '#FFFFFF')
        cv.line(a[0] + 1, a[1], b[0] + 1, b[1], '#CFE4FF')
    cv.glow(x, (y0 + y1) // 2, 26, '#CFE4FF', 0.35, ry=1.6)

# carrying an outdoor condenser unit in front
MAC_BOX = [
    "......OOOOO.....",
    ".....OCCCCCO....",
    "....OCCWWCCCO...",
    "....OCCCCCCCVVV.",
    "....OBSSSSSSO...",
    "....OBSESSESO...",
    "....OBSSSSSSs...",
    "....OBBSssSBBO..",
    "....OBBBBBBBBO..",
    "...OObBBBBBBbOO.",
    "..ONNNNNNNNNNNNO",
    "..ONRNNNNNNNNRNO",
    ".OOOOOOOOOOOOOO.",
    "SOggggggggggggOS",
    "SOgOOOOOggvgvgOS",
    "SOgOdddOggvgvgOS",
    "SOgOdfdOggvgvgOS",
    "SOgOdddOggvgvgOS",
    ".OgOOOOOggvgvgO.",
    ".OggggggggggggO.",
    ".OhhhhhhhhhhhhO.",
    ".OOOOOOOOOOOOOO.",
    "....OPPPOPPPPO..",
    "....OPPPOOPPPO..",
    "....OPPPO.OPPPO.",
    "....OKKKO.OKKKO.",
    "...OkKKKO.OKKKkO",
    "...OOOOO..OOOOOO",
]
BOX_PAL = dict(MAC_PAL, g='#D2D1CB', v='#8A8A86', d='#3A3A40', f='#8A8A90', h='#A4A39E')

# ---- v4: redrawn character — narrower head, tapered jaw, clean-shaven ----
MAC_PAL = {
    'C': '#8C8A68', 'c': '#6E6C50', 'V': '#5B5A42', 'W': '#D8D2B0',
    'S': '#E3AC8C', 's': '#C68C6E', 'E': '#2A1C16', 'm': '#B06E5C',
    'H': '#5E3A22',
    'N': '#2C3754', 'n': '#1F2740', 'R': '#B9BEC6', 'Q': '#3A4766',
    'T': '#4F6474',
    'L': '#6E4E2C', 'l': '#9C7444',
    'P': '#2A3350', 'p': '#1E253C',
    'K': '#8A6640', 'k': '#5E4428',
    'O': '#0D0E14',
}
_HEAD = [
    "......OOOOO.....",
    ".....OCCCCCO....",
    "....OCCWWCCCO...",
    "....OcCCCCCCVVV.",
    ".....OHsssssO...",
    ".....OHSESESO...",
    ".....OSSSSSSs...",
    ".....OsSSmmSO...",
    "......OsSSSO....",
    "......OQSSQO....",
]
_TORSO = [
    "..ONNNNNQQNNNNNO",
    "..ONRNNNNNNNNRNO",
    "..ONNNNNNNNNNNNO",
    "..OSnNNNNNNNNnSO",
    "..OSTnNNNNNNnTSO",
    "..OSSLLlLLlLLSSO",
    "...OOPPPPPPPPOO.",
    "....OPPPpPPPPO..",
]
MAC_IDLE = _HEAD + _TORSO + [
    "....OPPPOPPPPO..",
    "....OPPPOOPPPO..",
    "....OPPPO.OPPPO.",
    "....OKKKO.OKKKO.",
    "...OkKKKO.OKKKkO",
    "...OOOOO..OOOOOO",
]
MAC_WALK = _HEAD + _TORSO + [
    "...OPPPO.OPPPO..",
    "...OPPO...OPPPO.",
    "..OPPPO....OPPPO",
    "..OKKKO....OKKKO",
    ".OkKKKO....OKKKkO",
    ".OOOOO.....OOOOOO",
]
MAC_BOX = _HEAD + [
    "..ONNNNNQQNNNNNO",
    "..ONRNNNNNNNNRNO",
    ".OOOOOOOOOOOOOO.",
    "SOggggggggggggOS",
    "SOgOOOOOggvgvgOS",
    "SOgOdddOggvgvgOS",
    "SOgOdfdOggvgvgOS",
    "SOgOdddOggvgvgOS",
    ".OgOOOOOggvgvgO.",
    ".OggggggggggggO.",
    ".OhhhhhhhhhhhhO.",
    ".OOOOOOOOOOOOOO.",
    "....OPPPOPPPPO..",
    "....OPPPOOPPPO..",
    "....OPPPO.OPPPO.",
    "....OKKKO.OKKKO.",
    "...OkKKKO.OKKKkO",
    "...OOOOO..OOOOOO",
]
BOX_PAL = dict(MAC_PAL, g='#D2D1CB', v='#8A8A86', d='#3A3A40', f='#8A8A90', h='#A4A39E')
MAC_CARRY = MAC_IDLE            # overhead pose retired
CARRY_PAL = MAC_PAL
MAC_SLEEP = [
    "..OOOOO..............",
    ".OCCCCCO.OOOOOOOOOOO.",
    "OCCWWCCOONNNNNNNNNNNO",
    "OHsssssOONRNNNNNNNNNO",
    "OHSssSSOONNNNNNNNNNNO",
    ".OsSSSOOOOOOOOOOOOOOO",
    "..OOOO...............",
]
