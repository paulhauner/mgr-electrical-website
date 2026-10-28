"""Export the game's art as layers the browser composites at runtime.

    python3 art/export_game.py site/game

Writes, at 1x (the browser scales up with nearest-neighbour):
  bg-<mode>.png / lit-<mode>.png   the street with every house dark / lit,
                                   for mode in dusk, night, storm
  sprites.png                      atlas: Mac poses, ute, possum, bats, swag, glows
  manifest.json                    world size, house rectangles, atlas frames
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from pixel import *          # noqa: E402,F401  primitives, palettes, sprites
from scene2 import (         # noqa: E402
    W, H, GROUND, HORIZON, backyard_trees,
    fibro2, queenslander2, brick2, shop2, units2,
)
from hilux import hilux, meter_box  # noqa: E402

PALS = {'dusk': DUSK, 'night': NIGHT, 'storm': STORM}
HOUSES = [  # id, label, builder, x
    ('fibro', 'Fibro shack', fibro2, 14),
    ('qld', 'Queenslander', queenslander2, 88),
    ('brick', 'Brick veneer', brick2, 178),
    ('shop', 'Corner shop', shop2, 252),
    ('units', 'Units', units2, 330),
]
UTE_X, UTE_Y = 176, GROUND + 16


def render(mode, lit):
    pal = PALS[mode]
    cv = Cv(W, H)
    storm = mode == 'storm'
    sky_and_sea(cv, pal, HORIZON, stars=not storm, moon=not storm)
    headland(cv, 0, HORIZON, 54, '#1A1838' if mode == 'dusk' else '#0A0F1E')
    island_lighthouse(cv, 236, HORIZON, lit=True)
    if storm:
        clouds(cv, 8)
    backyard_trees(cv, HORIZON + 26, pal, 'lit' if mode == 'night' else mode)
    ground_and_road(cv, pal, GROUND)
    doors = {}
    for hid, _, fn, x in HOUSES:
        n = 2 if hid in ('qld', 'brick', 'units') else 1
        info = fn(cv, x, GROUND, (lit,) * n, pal)
        doors[hid] = info
        if hid == 'brick':
            meter_box(cv, 171, GROUND - 17)
    streetlights = mode == 'night'
    wire = '#06070B'
    a1, b1 = pole(cv, 166, GROUND + 2, 36, streetlights, pal)
    a2, b2 = pole(cv, 322, GROUND + 2, 36, streetlights, pal)
    for dy in (0, 3):
        cv.sag(0, 34 + dy, a1[0], a1[1] + dy, 5, wire)
        cv.sag(b1[0], b1[1] + dy, a2[0], a2[1] + dy, 6, wire)
        cv.sag(b2[0], b2[1] + dy, W - 1, 34 + dy, 2, wire)
    cv.sag(a1[0], a1[1] + 1, *doors['qld']['eave'], 3, wire)
    cv.sag(b1[0], b1[1] + 1, *doors['brick']['eave'], 3, wire)
    cv.sag(a2[0], a2[1] + 1, *doors['shop']['eave'], 3, wire)
    cv.sag(b2[0], b2[1] + 1, *doors['units']['eave'], 2, wire)
    cv.sag(a1[0], a1[1] + 1, *doors['fibro']['eave'], 9, wire)
    if streetlights:
        for px_ in (175, 331):
            cv.glow(px_, GROUND + 7, 20, '#FFD27A', 0.45, rx=1.5, ry=0.55)
    if lit:
        for v in doors.values():
            dx, dy = v['door']
            cv.glow(dx, dy - 2, 8, '#FFE6A0', 0.3)
    return cv, doors


def house_rects(dark, lit):
    diff = np.any(dark.a != lit.a, axis=2)
    ys, xs = np.nonzero(diff)
    centers = []
    for hid, _, fn, x in HOUSES:
        w = {'fibro': 48, 'qld': 64, 'brick': 60, 'shop': 60, 'units': 52}[hid]
        centers.append(x + w // 2)
    centers = np.array(centers)
    owner = np.abs(xs[:, None] - centers[None, :]).argmin(axis=1)
    rects = []
    for i, (hid, label, _, x) in enumerate(HOUSES):
        m = owner == i
        x0, x1 = int(xs[m].min()), int(xs[m].max()) + 1
        y0, y1 = int(ys[m].min()), int(ys[m].max()) + 1
        rects.append({'id': hid, 'label': label, 'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0,
                      'door': int(centers[i])})
    return rects


# ---------------------------------------------------------------- sprites
def rows_to_rgba(rows, pal):
    w, h = max(len(r) for r in rows), len(rows)
    a = np.zeros((h, w, 4), np.uint8)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch != '.' and ch in pal:
                a[j, i, :3] = hx(pal[ch])
                a[j, i, 3] = 255
    return a


def glow_rgba(w, h, col, strength=0.6):
    a = np.zeros((h, w, 4), np.uint8)
    cx, cy = (w - 1) / 2, (h - 1) / 2
    c = hx(col)
    for y in range(h):
        for x in range(w):
            d = math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2))
            if d >= 1:
                continue
            t = strength * (1 - d) ** 1.4
            q = t * 6
            lo = math.floor(q)
            step = lo + (1 if (q - lo) > BAYER[y % 4, x % 4] else 0)
            a[y, x, :3] = c
            a[y, x, 3] = int(255 * min(step / 6, 0.9))
    return a


MAC_BOXWALK = MAC_BOX[:22] + MAC_WALK[18:]
MAC_WAVE = [
    "......OOOOO.......",
    ".....OCCCCCO..OOO.",
    "....OCCWWCCCO.OSSO",
    "....OcCCCCCCVVVOSO",
    ".....OHsssssO..OSO",
    ".....OHSESESO..OSO",
    ".....OSSSSSSs..ONO",
    ".....OsSSmmSO..ONO",
    "......OsSSSO..ONO.",
    "......OQSSQO.ONO..",
    "..ONNNNNQQNNNNNO..",
    "..ONRNNNNNNNNRNO..",
    "..ONNNNNNNNNNNNO..",
    "..OSnNNNNNNNNnO...",
    "..OSTnNNNNNNNnO...",
    "..OSSLLlLLlLLLO...",
] + [r + '..' for r in MAC_IDLE[16:]]
MAC_LOOK = MAC_IDLE[:5] + [  # facing the camera, eyebrows down
    ".....OHSESESO...",
    ".....OSSSSSSS...",
    ".....OsSmmmSO...",
] + MAC_IDLE[8:]
SWAG = [
    "...OOOOOOOOOOOOOOOOOOOOOOO..",
    "..OGGGGGGGGGGGGGGGGGGGGGGGO.",
    ".OGgGGGGGGGGGGGGGGGGGGGGGGGO",
    ".OGGGGGGGGGGGGGGGGGGGGGGGGGO",
    "..OOOOOOOOOOOOOOOOOOOOOOOOO.",
]
SWAG_PAL = {'O': '#0D0E14', 'G': '#4E5A3A', 'g': '#6E7A52'}
BAT_UP = ["O...O", ".OOO.", "..O.."]
BAT_DOWN = [".....", "OOOOO", "..O.."]


def build_atlas():
    frames = {}
    tiles = []
    tiles.append(('mac-idle', rows_to_rgba(MAC_IDLE, MAC_PAL)))
    tiles.append(('mac-walk', rows_to_rgba(MAC_WALK, MAC_PAL)))
    tiles.append(('mac-box', rows_to_rgba(MAC_BOX, BOX_PAL)))
    tiles.append(('mac-boxwalk', rows_to_rgba(MAC_BOXWALK, BOX_PAL)))
    tiles.append(('mac-wave', rows_to_rgba(MAC_WAVE, MAC_PAL)))
    tiles.append(('mac-look', rows_to_rgba(MAC_LOOK, MAC_PAL)))
    tiles.append(('mac-sleep', rows_to_rgba(MAC_SLEEP, MAC_PAL)))
    tiles.append(('swag', rows_to_rgba(SWAG, SWAG_PAL)))
    tiles.append(('possum', rows_to_rgba(POSSUM, POSSUM_PAL)))
    tiles.append(('bat-up', rows_to_rgba(BAT_UP, {'O': '#2A1E3A'})))
    tiles.append(('bat-down', rows_to_rgba(BAT_DOWN, {'O': '#2A1E3A'})))
    # ute on magenta, keyed out
    u = Cv(90, 36, '#FF00FF')
    hilux(u, 8, 6)
    ua = np.zeros((36, 90, 4), np.uint8)
    ua[..., :3] = u.a
    ua[..., 3] = np.where(np.all(u.a == (255, 0, 255), axis=2), 0, 255)
    tiles.append(('ute', ua))
    tiles.append(('glow-headlight', glow_rgba(44, 10, '#FFF1C2', 0.55)))
    tiles.append(('glow-beacon', glow_rgba(25, 25, '#F5B83D', 0.6)))
    tiles.append(('glow-torch', glow_rgba(29, 29, '#FFF1C2', 0.55)))
    # shelf-pack into one row-wrapped atlas
    aw, x, y, rowh = 256, 0, 0, 0
    places = []
    for name, a in tiles:
        h, w = a.shape[:2]
        if x + w > aw:
            x, y, rowh = 0, y + rowh + 1, 0
        places.append((name, x, y, w, h, a))
        x += w + 1
        rowh = max(rowh, h)
    ah = y + rowh
    atlas = np.zeros((ah, aw, 4), np.uint8)
    for name, x, y, w, h, a in places:
        atlas[y:y + h, x:x + w] = a
        frames[name] = {'x': x, 'y': y, 'w': w, 'h': h}
    return Image.fromarray(atlas, 'RGBA'), frames


def main(out):
    os.makedirs(out, exist_ok=True)
    rects = None
    for mode in PALS:
        dark, doors = render(mode, False)
        lit, _ = render(mode, True)
        Image.fromarray(dark.a, 'RGB').save(os.path.join(out, f'bg-{mode}.png'), optimize=True)
        Image.fromarray(lit.a, 'RGB').save(os.path.join(out, f'lit-{mode}.png'), optimize=True)
        if mode == 'dusk':
            rects = house_rects(dark, lit)
    atlas, frames = build_atlas()
    atlas.save(os.path.join(out, 'sprites.png'), optimize=True)
    manifest = {
        'world': {'w': W, 'h': H, 'ground': GROUND, 'path': GROUND + 6},
        'houses': rects,
        'ute': {'x': UTE_X - 8, 'y': UTE_Y - 6, 'front': UTE_X - 6, 'beacon': [UTE_X + 33, UTE_Y - 3],
                'headlight': [UTE_X - 6, UTE_Y + 11]},
        'poles': [166, 322],
        'wireY': 37,
        'frames': frames,
    }
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print(json.dumps(rects))
    print({k: (v['w'], v['h']) for k, v in frames.items()})


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'site/game')
