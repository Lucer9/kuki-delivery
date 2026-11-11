#!/usr/bin/env node
// KUKI product renders: serves this folder, drives headless Chromium (WebGL via
// SwiftShader is fine) and writes PNGs to ../renders.
//
//   node render.mjs                 full quality, everything
//   node render.mjs --draft         half size, low-res geometry/textures (fast)
//   node render.mjs --only hero     only jobs whose file name contains "hero" (comma-separated:
//                                   a slug, aerial, hero, box-closed, box-4pack, box-pattern, sheet)
//   node render.mjs --out /tmp/x    write somewhere else
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright')); }

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const DRAFT = flag('--draft');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const OUT = path.resolve(opt('--out', path.join(ROOT, '..', 'renders')));
fs.mkdirSync(OUT, { recursive: true });

const SLUGS = ['le-classique', 'concha-rosa', 'cajeta-praline', 'fraise-creme', 'chocolat-de-oaxaca', 'horchata-sable',
  'pan-de-muerto', 'cafe-de-olla-brulee', 'mangonada', 'mazapan-rose'];
const jobs = [
  ...SLUGS.map((slug) => ({ file: `${slug}-aerial.png`, kind: 'aerial', slug, w: 1600, h: 1600 })),
  ...SLUGS.map((slug) => ({ file: `${slug}-hero.png`, kind: 'hero', slug, w: 1600, h: 2000 })),
  { file: 'box-pattern.png', kind: 'pattern', w: 2000, h: 2000, noDraftScale: true },
  { file: 'box-closed.png', kind: 'box-closed', w: 2400, h: 1800 },
  { file: 'box-4pack.png', kind: 'box-open', w: 2400, h: 1800 },
].filter((j) => !ONLY.length || ONLY.some((o) => j.file.includes(o)));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const base = url.startsWith('/renders/') ? OUT : ROOT;
  const rel = url.startsWith('/renders/') ? url.slice('/renders/'.length) : url === '/' ? 'index.html' : url.slice(1);
  const file = path.join(base, rel);
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

async function launch() {
  for (const a of [[], ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']]) {
    const b = await chromium.launch({ args: a });
    const p = await b.newPage();
    const ok = await p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    await p.close();
    if (ok) return b;
    await b.close();
  }
  throw new Error('WebGL2 is not available in headless Chromium on this machine.');
}

const browser = await launch();
try {
  if (jobs.length) {
    const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
    page.on('console', (m) => console.log('  [page]', m.text()));
    page.on('pageerror', (e) => console.error('  [page error]', e.message));
    await page.goto(`${origin}/index.html${DRAFT ? '?draft' : ''}`);
    await page.waitForFunction(() => window.KUKI_READY === true, null, { timeout: 120000 });
    for (const job of jobs) {
      const t0 = Date.now();
      const url = await page.evaluate((j) => window.KUKI.shot(j), job);
      fs.writeFileSync(path.join(OUT, job.file), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`${job.file}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    await page.close();
  }
  if (!ONLY.length || ONLY.includes('sheet') || flag('--sheet')) {
    const page = await browser.newPage({ viewport: { width: 2400, height: 1200 }, deviceScaleFactor: 1 });
    await page.goto(`${origin}/sheet.html`);
    await page.waitForFunction(() => window.SHEET_READY === true, null, { timeout: 120000 });
    await page.screenshot({ path: path.join(OUT, 'contact-sheet.png'), fullPage: true });
    console.log('contact-sheet.png');
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
