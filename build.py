#!/usr/bin/env python3
"""Build the MGR Electrical site into ./docs (served by GitHub Pages).

    python3 build.py              # preview build: noindex, links to the preview URL
    python3 build.py --production # launch build: indexable, canonical mgrelectrical.com.au

Environment:
    PREVIEW_URL   absolute URL of the preview (for og:image), default GitHub Pages URL
    OUT           output folder, default docs

Needs: pip install jinja2 pillow numpy
"""
import json
import os
import shutil
import sys
import time

import numpy as np
from jinja2 import Environment, FileSystemLoader, select_autoescape
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, 'site')
TEMPLATES = os.path.join(ROOT, 'templates')
PROD_URL = 'https://mgrelectrical.com.au'

PAGES = [
    # slug, template, nav key
    ('index', 'index.html', 'home'),
    ('electrical', 'electrical.html', 'electrical'),
    ('air-conditioning', 'air-conditioning.html', 'air-conditioning'),
    ('aircon-service-repairs', 'aircon-service-repairs.html', 'air-conditioning'),
    ('aircon-installation', 'aircon-installation.html', 'air-conditioning'),
    ('emergency', 'emergency.html', 'emergency'),
    ('storm-electrician', 'storm-electrician.html', 'storm-electrician'),
    ('grafton-electrician', 'grafton-electrician.html', 'grafton-electrician'),
    ('contact', 'contact.html', 'contact'),
    ('404', '404.html', None),
]


def game_images():
    g = os.path.join(SITE, 'game')
    man = json.load(open(os.path.join(g, 'manifest.json')))
    atlas = Image.open(os.path.join(g, 'sprites.png')).convert('RGBA')

    def frame(name):
        f = man['frames'][name]
        return atlas.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))

    def scene(mode, lit_ids, mac=None, mac_x=None):
        bg = Image.open(os.path.join(g, f'bg-{mode}.png')).convert('RGBA')
        lit = Image.open(os.path.join(g, f'lit-{mode}.png')).convert('RGBA')
        for h in man['houses']:
            if h['id'] in lit_ids:
                box = (h['x'], h['y'], h['x'] + h['w'], h['y'] + h['h'])
                bg.paste(lit.crop(box), box[:2])
        if mac:
            m = frame(mac)
            bg.alpha_composite(m, (mac_x - m.width // 2, man['world']['path'] - m.height))
        u = frame('ute')
        bg.alpha_composite(u, (man['ute']['x'], man['ute']['y']))
        return bg

    return man, frame, scene


def make_images(out):
    man, frame, scene = game_images()
    # poster shown before the game boots (and if JS is off)
    poster = scene('dusk', {'qld', 'shop'}, 'mac-box', 159)
    poster.convert('RGB').save(os.path.join(out, 'game', 'poster.png'), optimize=True)
    # page art sprites at 1x (CSS scales them, pixelated)
    for name in ('mac-idle', 'mac-wave', 'mac-box', 'ute'):
        frame(name).save(os.path.join(out, 'img', f'{name}.png'), optimize=True)
    # social share card 1200x630
    night = scene('night', {h['id'] for h in man['houses']}, 'mac-wave', 158)
    card = Image.new('RGB', (1200, 630), (20, 20, 20))
    s = night.convert('RGB').resize((night.width * 3, night.height * 3), Image.NEAREST)
    card.paste(s.crop((0, 0, 1188, 450)), (6, 180))
    logo = Image.open(os.path.join(ROOT, 'art', 'logo-capture.png')).convert('L')
    bbox = logo.point(lambda v: 255 if v > 60 else 0).getbbox()
    logo = logo.crop(bbox)
    lw = 190
    logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    white = Image.new('RGB', logo.size, (255, 255, 255))
    card.paste(white, (40, 22), logo)
    d = ImageDraw.Draw(card)
    f1 = ImageFont.truetype(os.path.join(ROOT, 'art', 'fonts', 'BarlowCondensed-ExtraBold.ttf'), 66)
    f2 = ImageFont.truetype(os.path.join(ROOT, 'art', 'fonts', 'Barlow-SemiBold.ttf'), 30)
    d.text((262, 30), 'YOUR LOCAL SPARKY. ON CALL 24 HOURS.', font=f1, fill=(244, 241, 234))
    d.text((264, 108), 'Woolgoolga · Coffs Coast · Grafton', font=f2, fill=(169, 165, 155))
    d.text((760, 108), 'Play Storm Night →', font=f2, fill=(245, 184, 61))
    card.save(os.path.join(out, 'img', 'og-image.png'), optimize=True)
    # favicons
    src = Image.open(os.path.join(ROOT, 'art', 'logo-capture.png')).convert('L')
    src = src.crop(src.point(lambda v: 255 if v > 60 else 0).getbbox())
    for size, name in ((32, 'favicon-32.png'), (180, 'apple-touch-icon.png'), (512, 'icon-512.png')):
        pad = round(size * 0.1)
        w = size - pad * 2
        m = src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)
        ic = Image.new('RGB', (size, size), (20, 20, 20))
        ic.paste(Image.new('RGB', m.size, (255, 255, 255)), (pad, (size - m.height) // 2), m)
        ic.save(os.path.join(out, 'img', name), optimize=True)


def main():
    production = '--production' in sys.argv
    out = os.path.join(ROOT, os.environ.get('OUT', 'docs'))
    preview_url = os.environ.get('PREVIEW_URL', 'https://paulhauner.github.io/mgr-electrical-website').rstrip('/')
    base_url = PROD_URL if production else preview_url
    if os.path.isdir(out):
        shutil.rmtree(out)
    shutil.copytree(SITE, out)
    make_images(out)

    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(['html']),
                      trim_blocks=True, lstrip_blocks=True)
    version = time.strftime('%Y%m%d%H%M')
    for slug, tpl, nav in PAGES:
        path = '/' if slug == 'index' else f'/{slug}'
        html = env.get_template(tpl).render(
            slug=slug, nav=nav, path=path, preview=not production,
            prod_url=PROD_URL, base_url=base_url, v=version,
        )
        with open(os.path.join(out, f'{slug}.html'), 'w') as f:
            f.write(html)

    with open(os.path.join(out, 'robots.txt'), 'w') as f:
        if production:
            f.write(f'User-agent: *\nAllow: /\n\nSitemap: {PROD_URL}/sitemap.xml\n')
        else:
            f.write('# Preview copy of mgrelectrical.com.au: keep it out of search results.\nUser-agent: *\nDisallow: /\n')
    with open(os.path.join(out, 'sitemap.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for slug, _, nav in PAGES:
            if slug == '404':
                continue
            loc = PROD_URL + ('/' if slug == 'index' else f'/{slug}')
            f.write(f'  <url><loc>{loc}</loc></url>\n')
        f.write('</urlset>\n')
    open(os.path.join(out, '.nojekyll'), 'w').close()
    print(f'built {"production" if production else "preview"} site into {out}')


if __name__ == '__main__':
    main()
