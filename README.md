# MGR Electrical website

The new site for [MGR Electrical](https://mgrelectrical.com.au), Mac's electrical and air conditioning business in Woolgoolga, the Coffs Coast and Grafton.

The home page opens on **Mac's Street**, a little pixel-art game that plays itself. The big switch under it is the street's **main switch**: it powers the house lights, the aircons and the streetlights (leave it off and Mac turns it back on). Mac always says what he's about to do, then goes to the ute (the toolbox opens) for whatever the job needs: a globe for a blown light, or a new outdoor unit to install an aircon or to replace one that's caught fire or started sparking. Cool or warm air comes out once it's running. Turn the power off and he says so straight away and goes to put it back on. Tap a house with a job to make it his next one. **Storm Night** is a 30-second round: tap houses the lightning knocks out, and flick the main back on when it trips. The score can be sent to a mate.

- **Preview:** https://paulhauner.github.io/mgr-electrical-website/ (GitHub Pages, served from `docs/`; marked `noindex`)
- **Live:** https://mgrelectrical.com.au (not switched over yet)

> **Deploying to mgrelectrical.com.au? Never deploy `docs/`.** It's the preview build: every page is `noindex` and its `robots.txt` blocks all crawlers, so putting it live would drop the site from Google. Build the live site with `python3 build.py --production`, which writes to `dist/` and fails if the result isn't indexable. See [Launching](#launching-on-mgrelectricalcomau).

## Layout

```
site/        static assets copied as-is: css, js, fonts, img, game layers
templates/   Jinja page templates (one per page, same URLs as the old site)
art/         Python that draws all the pixel art
build.py     renders templates + generates poster, share card, favicons
docs/        PREVIEW build (noindex), committed, served by GitHub Pages
dist/        LIVE build from --production (not committed); this is what gets deployed
```

No framework and no Node. The JavaScript is three plain files:

- `site/js/game.js` — the game; composites the layers in `site/game/` onto a canvas
- `site/js/site.js` — switchboard menu, sticky call bar
- `site/js/form.js` — quote form; carried over from the old site unchanged in behaviour

## Building

```sh
pip install -r requirements.txt   # jinja2, pillow, numpy
python3 build.py                 # preview build into docs/
python3 -m http.server -d docs   # look at it on http://localhost:8000/index.html
```

Changing the art (needs `pip install potracer` only to re-trace the logo):

```sh
python3 art/export_game.py site/game   # redraw backgrounds, house layers, sprite atlas
python3 build.py
```

`art/pixel.py` holds the drawing primitives, palettes and Mac's sprites, `art/scene2.py` the houses, and `art/hilux.py` the ute. `area_map.py` draws the service-area map (an SVG built into each page; coordinates are approximate). Everything is drawn at 1× and scaled up in the browser with nearest-neighbour, so a pixel is a pixel.

## Launching on mgrelectrical.com.au

The old site runs on Cloudflare Pages with a `_worker.js` that handles the quote form at `/api/enquiry`, plus Google Tag Manager and Google Ads call tracking. The new site keeps all of that:

- the form posts the same JSON, with the same field names, to the same `/api/enquiry`
- GTM `GTM-NDL5ZBQB` and the Ads phone-number swap (`AW-18421058252`) are in every page, but **only load on mgrelectrical.com.au**, so the preview never pollutes the ad data. The GTM `<noscript>` iframe is only written into production builds
- phone links use the same `tel:+61434023625` format and the same `data-cta` names as the old site (`header-call`, `hero-call`, `form-call`, `footer-call`, `sticky-call`, …), so `phone_click` reporting in GTM keeps its labels
- titles, meta descriptions, og:titles, canonicals and the page copy are carried over from the old site word for word
- every old URL still exists: `/electrical`, `/air-conditioning`, `/aircon-service-repairs`, `/aircon-installation`, `/emergency`, `/storm-electrician`, `/grafton-electrician`, `/contact`

To launch:

1. `pip install -r requirements.txt && python3 build.py --production`. Output goes to `dist/`. It drops `noindex`, opens up `robots.txt`, points canonical/og URLs at mgrelectrical.com.au, adds the GTM `<noscript>` iframe, and exits with an error if any of that didn't happen.
2. Bring the existing `/api/enquiry` handler across from the current Cloudflare Pages project so the form keeps working: a `_worker.js` goes inside `dist/`; a `functions/` folder goes at the repo root. An advanced-mode `_worker.js` must pass every non-`/api/` request through to `env.ASSETS.fetch(request)`.
3. Deploy `dist/` to that same Cloudflare Pages project, e.g. `npx wrangler pages deploy dist --project-name <project>`. With Git integration instead: build command `pip install -r requirements.txt && python3 build.py --production`, build output directory `dist`.
4. Check on the live domain (the form and tracking deliberately do nothing on other hosts): `curl -s https://mgrelectrical.com.au/ | grep -c noindex` prints `0`; submit a test enquiry; tap a phone link; confirm both show in GTM preview.

## Notes

- Fonts are Barlow and Barlow Condensed (SIL Open Font License, see `site/fonts/OFL.txt`), self-hosted.
- The logo in `site/img/logo.svg` is a vector trace of the old 320×240 PNG. If the original artwork turns up, swap it in.
- `prefers-reduced-motion` gets a still scene; taps and the switch still work instantly.
