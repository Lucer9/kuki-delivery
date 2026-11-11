# KUKI renders

Procedural 3D product renders for KUKI: 10 cookies and the gift box. Everything
is generated in code (Three.js scenes rendered in headless Chromium via
Playwright). No external models, photos or textures; the box artwork (toile,
cartouche, papel picado) is drawn on canvases at build time and is original.

## Regenerate

```sh
cd renders-src
npm install            # three + @fontsource/bodoni-moda (Playwright/Chromium must already be available)
node render.mjs        # full quality -> ../renders (a few minutes on CPU/SwiftShader)
```

Options:
- `--draft`: half size, low-res meshes/textures (fast preview).
- `--only a,b`: comma-separated file-name substrings, e.g. a slug (`mangonada`),
  `aerial`, `hero`, `box-closed`, `box-4pack`, `box-pattern`, or `sheet`
  (contact sheet only).
- `--out <dir>`: write somewhere else.

## Outputs (../renders)

- `<slug>-aerial.png`: 1600x1600, top-down, transparent, no ground shadow.
- `<slug>-hero.png`: 1600x2000, 3/4 angle on a flat brand colour.
- `box-closed.png`: 2400x1800, closed box with ribbon.
- `box-4pack.png`: 2400x1800, open box with four cookies, lid propped behind.
- `box-pattern.png`: 2000x2000, one seamless tile of the toile (tomate on beurre).
- `contact-sheet.png`: everything on one sheet.
- `box-4pack-v1.png`: the earlier plain box, kept for reference (not regenerated).

Slugs follow `kuki-delivery/menu/menu.json`. Classics: le-classique, concha-rosa,
cajeta-praline, fraise-creme, chocolat-de-oaxaca, horchata-sable. Rotating:
pan-de-muerto, cafe-de-olla-brulee, mangonada, mazapan-rose.

## Layout

- `render.mjs`: static server + Playwright driver, writes the PNGs.
- `index.html`: render stage (import map for three, Bodoni Moda @font-face).
- `sheet.html`: contact sheet layout (screenshotted).
- `src/main.js`: entry point, `window.KUKI.shot(job)`.
- `src/noise.js`: seeded gradient noise, fbm, Voronoi.
- `src/cookie.js`: cookie profile, displaced mesh, canvas-generated colour /
  roughness / normal maps, helpers for toppings that hug the surface.
- `src/flavors.js`: per-flavour dough parameters, colours and topping builders.
  Add a flavour here (and its slug in `render.mjs` / `sheet.html`).
- `src/scene.js`: renderer, lights, RoomEnvironment PMREM, aerial and hero shots.
- `src/toile.js`: the Franco-Mexican toile de Jouy repeat and papel picado band
  (2D canvas line art; `drawToile(ctx, size, { ink, paper })` is reusable).
- `src/box.js`: box geometry, lid/skirt/base artwork with gold-foil layers,
  satin ribbon and bow, box shots.

## Notes

- ACES Filmic tone mapping + sRGB output, 1.5x supersampled.
- Backgrounds are composited in 2D after a transparent render, so they are the
  exact brand hex values. Box paper materials are `toneMapped: false` so beurre
  and tomate stay close to brand (ACES would desaturate them).
- All randomness is seeded (`seed` per flavour in `src/flavors.js`).
