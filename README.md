# MGR Electrical website

The new site for [MGR Electrical](https://mgrelectrical.com.au), Mac's electrical and air conditioning business in Woolgoolga, the Coffs Coast and Grafton.

The home page opens on **Mac's Street**, a little pixel-art game. Mac does his rounds on his own, you can tap houses and flick the street-light switch, and **Storm Night** is a 30-second round with a score you can send to a mate.

- **Preview:** https://paulhauner.github.io/mgr-electrical-website/ (GitHub Pages, served from `docs/`; marked `noindex`)
- **Live:** https://mgrelectrical.com.au (not switched over yet)

## Layout

```
site/        static assets copied as-is: css, js, fonts, img, game layers
templates/   Jinja page templates (one per page, same URLs as the old site)
art/         Python that draws all the pixel art
build.py     renders templates + generates poster, share card, favicons -> docs/
docs/        built output, committed, served by GitHub Pages
```

No framework and no Node. The JavaScript is three plain files:

- `site/js/game.js` — the game; composites the layers in `site/game/` onto a canvas
- `site/js/site.js` — switchboard menu, sticky call bar
- `site/js/form.js` — quote form; carried over from the old site unchanged in behaviour

## Building

```sh
pip install jinja2 pillow numpy
python3 build.py                 # preview build into docs/
python3 -m http.server -d docs   # look at it on http://localhost:8000/index.html
```

Changing the art (needs `pip install potracer` only to re-trace the logo):

```sh
python3 art/export_game.py site/game   # redraw backgrounds, house layers, sprite atlas
python3 build.py
```

`art/pixel.py` holds the drawing primitives, palettes and Mac's sprites, `art/scene2.py` the houses, and `art/hilux.py` the ute. Everything is drawn at 1× and scaled up in the browser with nearest-neighbour, so a pixel is a pixel.

## Launching on mgrelectrical.com.au

The old site runs on Cloudflare Pages with a `_worker.js` that handles the quote form at `/api/enquiry`, plus Google Tag Manager and Google Ads call tracking. The new site keeps all of that:

- the form posts the same JSON, with the same field names, to the same `/api/enquiry`
- GTM `GTM-NDL5ZBQB` and the Ads phone-number swap (`AW-18421058252`) are in every page, but **only load on mgrelectrical.com.au**, so the preview never pollutes the ad data
- every old URL still exists: `/electrical`, `/air-conditioning`, `/aircon-service-repairs`, `/aircon-installation`, `/emergency`, `/storm-electrician`, `/grafton-electrician`, `/contact`

To launch:

1. `python3 build.py --production` (drops `noindex`, opens up `robots.txt`, points og:image at the real domain)
2. Copy the existing `_worker.js` from the current Cloudflare Pages deployment into `docs/` so the form keeps working
3. Deploy `docs/` to that same Cloudflare Pages project
4. Check: submit a test enquiry, tap a phone link, confirm both show in GTM preview

## Notes

- Fonts are Barlow and Barlow Condensed (SIL Open Font License, see `site/fonts/OFL.txt`), self-hosted.
- The logo in `site/img/logo.svg` is a vector trace of the old 320×240 PNG. If the original artwork turns up, swap it in.
- `prefers-reduced-motion` gets a still scene; taps and the switch still work instantly.
