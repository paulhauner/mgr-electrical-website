"""Mac's ute: white dual-cab, short Hilux-style nose, black bull bar with UHF aerial,
red ladder on roof racks, aluminium gullwing toolboxes on the tray. Faces left."""
from pixel import *

O = '#0A0B10'
W = '#E9E8E2'
WS = '#C4C3BC'
WD = '#9E9D97'
TINT = '#2C3A46'
TINT_HI = '#5C7384'
BLK = '#16171C'
BAR = '#1E2026'
BAR_HI = '#4A4F58'
AL = '#BFC2C6'
AL_HI = '#DCDFE2'
AL_LO = '#8F9399'
AL_SEAM = '#6E7278'
RED = '#D23A2C'
RED_D = '#8E1F16'
RED_M = '#B12A20'


def wheel(cv, cx, cy):
    for yy in range(-6, 7):
        for xx in range(-6, 7):
            d = xx * xx + yy * yy
            if d <= 30:
                c = BLK
                if d <= 12:
                    c = '#A3A7AC'
                if d <= 6:
                    c = '#7E8288'
                if d <= 1:
                    c = '#3A3D42'
                cv.px(cx + xx, cy + yy, c)


def arch(cv, cx, cy):
    for yy in range(-8, 1):
        for xx in range(-8, 9):
            d = xx * xx + yy * yy
            if d <= 56:
                cv.px(cx + xx, cy + yy, BLK if d >= 38 else '#0C0D11')


def hilux(cv, x, y, beacon=False):
    wheel(cv, x + 63, y + 22)          # rear wheel sits under the tray

    # ---- body: short nose, cab from x+16 ----
    cv.rect(x + 1, y + 11, 46, 10, W)
    cv.hl(x + 1, y + 20, 46, WS)
    cv.hl(x + 1, y + 21, 46, O)
    cv.hl(x + 1, y + 10, 16, O)          # bonnet line
    cv.hl(x + 2, y + 11, 13, '#F6F5F1')
    for i in range(7):                    # windscreen rake
        cv.px(x + 16 + i, y + 10 - i, O)
    cv.hl(x + 23, y + 3, 23, O)           # roof
    cv.hl(x + 23, y + 4, 23, W)
    cv.vl(x + 46, y + 3, 19, O)
    cv.rect(x + 44, y + 4, 2, 7, W)       # C-pillar
    for yy in range(y + 5, y + 11):
        start = x + 17 + (y + 10 - yy)
        for xx in range(start, x + 33):
            cv.px(xx, yy, TINT)
        for xx in range(x + 35, x + 44):
            cv.px(xx, yy, TINT)
    cv.rect(x + 33, y + 5, 2, 6, BLK)     # B-pillar
    cv.px(x + 21, y + 7, TINT_HI); cv.px(x + 22, y + 6, TINT_HI); cv.px(x + 37, y + 6, TINT_HI)
    cv.hl(x + 16, y + 11, 30, O)          # belt line
    cv.vl(x + 33, y + 12, 8, WD)          # door seam
    cv.hl(x + 29, y + 13, 2, BLK); cv.hl(x + 41, y + 13, 2, BLK)
    cv.rect(x + 17, y + 9, 2, 2, BLK)     # mirror

    # ---- front: modest grille + slim headlight + bumper ----
    cv.rect(x - 1, y + 11, 3, 6, BLK)
    cv.hl(x - 1, y + 13, 2, '#2E3138'); cv.hl(x - 1, y + 15, 2, '#2E3138')
    cv.hl(x, y + 11, 5, '#EEF2F6')
    cv.px(x + 5, y + 11, '#F5B83D')
    cv.rect(x - 1, y + 17, 6, 3, W)
    cv.hl(x - 1, y + 20, 6, BLK)
    cv.vl(x - 2, y + 10, 11, O)

    # ---- bull bar (black steel) + UHF aerial ----
    cv.rect(x - 5, y + 9, 2, 12, BAR)
    cv.vl(x - 5, y + 9, 12, BAR_HI)
    cv.hl(x - 5, y + 9, 9, BAR)           # top hoop back over the headlight
    cv.hl(x - 5, y + 8, 9, O)
    cv.hl(x - 4, y + 14, 3, BAR)          # cross tube
    cv.rect(x - 5, y + 19, 8, 2, BAR)     # bottom pan
    cv.vl(x - 6, y + 8, 14, O)
    cv.px(x - 6, y + 11, '#F5D46A')       # small driving light
    cv.vl(x - 4, y - 4, 12, '#3A3D44')    # UHF aerial
    cv.px(x - 4, y - 5, '#0A0B10')

    # ---- tray with aluminium gullwing toolboxes ----
    tx0, tx1 = x + 48, x + 78
    cv.rect(x + 47, y + 5, 1, 14, BLK)
    cv.rect(tx0, y + 6, tx1 - tx0, 11, AL)
    cv.hl(tx0, y + 6, tx1 - tx0, AL_HI)
    cv.hl(tx0, y + 16, tx1 - tx0, AL_LO)
    cv.hl(tx0, y + 5, tx1 - tx0, O)
    cv.vl(tx1, y + 5, 15, O)
    for dx0, dx1 in ((tx0 + 1, tx0 + 14), (tx0 + 16, tx1 - 1)):
        cv.hl(dx0, y + 7, dx1 - dx0, AL_SEAM)
        cv.hl(dx0, y + 15, dx1 - dx0, AL_SEAM)
        cv.vl(dx0, y + 7, 9, AL_SEAM)
        cv.vl(dx1 - 1, y + 7, 9, AL_SEAM)
        mid = (dx0 + dx1) // 2
        cv.hl(mid - 1, y + 14, 3, BLK)
    cv.rect(tx0 - 1, y + 17, tx1 - tx0 + 2, 2, '#3A3D42')
    cv.hl(tx0 - 1, y + 19, tx1 - tx0 + 2, O)
    cv.rect(x + 74, y + 19, 3, 5, BLK)
    cv.rect(tx1 - 1, y + 9, 2, 4, '#C2402F')

    # ---- roof racks + red ladder ----
    for rx in (x + 25, x + 43):
        cv.vl(rx, y + 2, 2, BLK)
    cv.hl(x + 24, y + 2, 22, BLK)
    for rx in (x + 60, x + 75):
        cv.vl(rx, y + 2, 4, BLK)
    cv.hl(x + 58, y + 2, 20, BLK)
    lx0, lx1 = x + 20, x + 79
    for xx in range(lx0, lx1):
        cv.px(xx, y - 1, RED)
        cv.px(xx, y, RED_M if (xx - lx0) % 5 else RED_D)
        cv.px(xx, y + 1, RED_D)
    cv.hl(lx0, y - 2, lx1 - lx0, O)
    cv.vl(lx0 - 1, y - 1, 3, O); cv.vl(lx1, y - 1, 3, O)

    arch(cv, x + 10, y + 21)
    wheel(cv, x + 10, y + 22)
    if beacon:
        cv.rect(x + 32, y - 4, 3, 2, '#F5B83D')
        cv.glow(x + 33, y - 3, 12, '#F5B83D', 0.55)
    return (x - 5, y + 11)


def meter_box(cv, x, y):
    cv.rect(x, y, 5, 7, '#D8D2BE')
    cv.rect(x + 1, y + 1, 3, 3, '#2A2E36')
    cv.px(x + 2, y + 2, '#6E8A6A')
    cv.hl(x, y + 5, 5, '#B0AA96')
    cv.vl(x - 1, y, 7, '#0A0B10'); cv.vl(x + 5, y, 7, '#0A0B10')
    cv.hl(x, y - 1, 5, '#0A0B10'); cv.hl(x, y + 7, 5, '#0A0B10')
