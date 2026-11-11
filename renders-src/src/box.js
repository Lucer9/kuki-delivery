// KUKI gift box v2: Franco-Mexican toile lid, gilded cartouche, papel picado
// skirt, satin ribbon. All artwork is drawn on canvases at build time.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toileCanvas, drawPapelPicado } from './toile.js';
import { BRAND } from './flavors.js';
import { rng } from './noise.js';
import { Q, DRAFT, stage, capture, softShape, resetCookie, buildCookie } from './scene.js';

const TAU = Math.PI * 2;
const GOLD = '#F2C255';
const TXT = { tagline: 'parisian pâtisserie, pop energy', place: 'NORTH BEACH · SAN FRANCISCO', side: 'pâtisserie pop  ·  North Beach, SF' };

// box dimensions (world units; a cookie is ~2.1 across)
const W = 4.8, HB = 0.78, WL = 4.96, HS = 0.46, TOP = HB + 0.05;

export function patternSwatch(size) { return toileCanvas(size).toDataURL('image/png'); }

// ------------------------------------------------------------------ layered canvases
// colour + ORM (G = roughness, B = metalness) + bump, painted in lock-step so
// gold foil is metallic, smooth and slightly embossed.
class Layers {
  constructor(w, h, paper) {
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.w = w; this.h = h;
    this.col = mk(); this.orm = mk(); this.bmp = mk();
    this.c = this.col.getContext('2d'); this.o = this.orm.getContext('2d'); this.b = this.bmp.getContext('2d');
    this.c.fillStyle = paper; this.c.fillRect(0, 0, w, h);
    this.o.fillStyle = 'rgb(0,205,0)'; this.o.fillRect(0, 0, w, h);
    this.b.fillStyle = 'rgb(110,110,110)'; this.b.fillRect(0, 0, w, h);
    // paper fibre
    const n = document.createElement('canvas'); n.width = n.height = 256;
    const nc = n.getContext('2d'), id = nc.createImageData(256, 256), r = rng(77);
    for (let i = 0; i < id.data.length; i += 4) { const v = 96 + r() * 40; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    nc.putImageData(id, 0, 0);
    this.b.globalAlpha = 0.9; this.b.fillStyle = this.b.createPattern(n, 'repeat'); this.b.save(); this.b.scale(2.5, 2.5); this.b.fillRect(0, 0, w, h); this.b.restore(); this.b.globalAlpha = 1;
  }
  // run the same drawing on all three layers as gold foil
  gold(fn) {
    fn(this.c, GOLD);
    fn(this.o, 'rgb(0,74,150)');
    fn(this.b, 'rgb(215,215,215)');
  }
  // a pressed-in crease (bump only) plus a faint shade line
  crease(x0, y0, x1, y1, w) {
    for (const [ctx, st, lw] of [[this.b, 'rgb(40,40,40)', w], [this.c, 'rgba(120,70,0,0.12)', w * 0.8]]) { ctx.strokeStyle = st; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  }
  material(extra = {}) {
    const half = (cv) => { const o = document.createElement('canvas'); o.width = cv.width >> 1; o.height = cv.height >> 1; const x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, o.width, o.height); return o; };
    const tex = (cv, srgb) => { const t = new THREE.CanvasTexture(srgb ? cv : half(cv)); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 16; return t; };
    const orm = tex(this.orm, false);
    return new THREE.MeshPhysicalMaterial({
      map: tex(this.col, true), roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
      bumpMap: tex(this.bmp, false), bumpScale: 1.2, color: new THREE.Color('#ffffff').multiplyScalar(0.69), toneMapped: false, ...extra,
    });
  }
}

// ------------------------------------------------------------------ gold ornament vocabulary
function volute(c, px, py, dx, dy, side, r, lw, turns = 1.9) {
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const nx = -dy * side, ny = dx * side;
  const cx = px + nx * r, cy = py + ny * r;
  const a0 = Math.atan2(py - cy, px - cx);
  const s = Math.sign(-Math.sin(a0) * dx + Math.cos(a0) * dy) || 1;
  const T = turns * TAU, N = 60;
  let x = px, y = py;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * T, rr = r * Math.exp(-0.3 * t), a = a0 + s * t;
    const X = cx + Math.cos(a) * rr, Y = cy + Math.sin(a) * rr;
    c.lineWidth = lw * (1 - 0.55 * (i / N));
    c.beginPath(); c.moveTo(x, y); c.lineTo(X, Y); c.stroke();
    x = X; y = Y;
  }
  c.beginPath(); c.arc(x, y, lw * 0.75, 0, TAU); c.fill();
}
// C-scroll: an arc with a volute at each end
function cscroll(c, x1, y1, x2, y2, bulge, r, lw, side = 1) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
  const qx = mx - (dy / l) * bulge, qy = my + (dx / l) * bulge;
  c.lineWidth = lw; c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(qx, qy, x2, y2); c.stroke();
  volute(c, x2, y2, x2 - qx, y2 - qy, side, r, lw);
  volute(c, x1, y1, x1 - qx, y1 - qy, -side, r, lw);
}
function petal(c, x, y, a, len, wid) {
  c.save(); c.translate(x, y); c.rotate(a);
  c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid, len, 0); c.bezierCurveTo(len * 0.75, wid, len * 0.3, wid, 0, 0); c.fill();
  c.restore();
}
function palmette(c, x, y, a, size) {
  for (let k = -3; k <= 3; k++) petal(c, x, y, a + k * 0.36, size * (1 - Math.abs(k) * 0.16), size * 0.13);
  c.beginPath(); c.arc(x, y, size * 0.13, 0, TAU); c.fill();
}
function laurelSpray(c, x, y, a, len, n, lw) {
  c.save(); c.translate(x, y); c.rotate(a);
  c.lineWidth = lw; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.12, len, 0); c.stroke();
  for (let k = 1; k <= n; k++) { const d = (len * k) / (n + 0.3), yy = -len * 0.12 * Math.sin((Math.PI * k) / (n + 0.3)) * 0.9; petal(c, d, yy, -0.75, len * 0.2, len * 0.045); petal(c, d, yy, 0.75, len * 0.2, len * 0.045); }
  petal(c, len, 0, 0, len * 0.2, len * 0.045);
  c.restore();
}
// Talavera-inspired tile ornament (an original star / quatrefoil arrangement)
function talaveraTile(c, x, y, s, lw) {
  c.save(); c.translate(x, y);
  c.lineWidth = lw; c.strokeRect(-s / 2, -s / 2, s, s);
  c.lineWidth = lw * 0.5; c.strokeRect(-s * 0.44, -s * 0.44, s * 0.88, s * 0.88);
  // eight-point star from two squares
  for (const r of [0, Math.PI / 4]) { c.save(); c.rotate(r); c.lineWidth = lw * 0.8; c.strokeRect(-s * 0.25, -s * 0.25, s * 0.5, s * 0.5); c.restore(); }
  for (let k = 0; k < 8; k++) petal(c, 0, 0, (k / 8) * TAU, s * 0.2, s * 0.045);
  c.beginPath(); c.arc(0, 0, s * 0.05, 0, TAU); c.fill();
  // quarter fans + leaves in the corners
  for (let k = 0; k < 4; k++) {
    c.save(); c.rotate((k / 4) * TAU); c.translate(s * 0.44, s * 0.44);
    c.lineWidth = lw * 0.7; c.beginPath(); c.arc(0, 0, s * 0.17, Math.PI, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(0, 0, s * 0.1, Math.PI, Math.PI * 1.5); c.stroke();
    petal(c, -s * 0.2, -s * 0.2, Math.PI * 1.25, s * 0.1, s * 0.03);
    c.restore();
    c.save(); c.rotate((k / 4) * TAU); c.beginPath(); c.arc(0, -s * 0.37, s * 0.028, 0, TAU); c.fill(); petal(c, 0, -s * 0.27, -Math.PI / 2, s * 0.07, s * 0.025); c.restore();
  }
  c.restore();
}

// ------------------------------------------------------------------ panel artwork
function lidTopLayers() {
  const S = DRAFT ? 2048 : 4096, U = S / WL;
  const L = new Layers(S, S, BRAND.beurre);
  const c = L.c;
  // toile, 2 repeats across the lid
  const tileW = S / 2, tile = toileCanvas(DRAFT ? 1024 : 2048);
  for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) c.drawImage(tile, i * tileW + tileW * 0.25, j * tileW + tileW * 0.18, tileW, tileW);
  const m1 = 0.2 * U, m2 = 0.275 * U, cs = 0.62 * U;
  // clear margins + corner tiles + medallion field
  c.fillStyle = BRAND.beurre;
  c.fillRect(0, 0, S, m2); c.fillRect(0, S - m2, S, m2); c.fillRect(0, 0, m2, S); c.fillRect(S - m2, 0, m2, S);
  const corners = [[m1 + cs / 2, m1 + cs / 2], [S - m1 - cs / 2, m1 + cs / 2], [m1 + cs / 2, S - m1 - cs / 2], [S - m1 - cs / 2, S - m1 - cs / 2]];
  for (const [x, y] of corners) c.fillRect(x - cs / 2, y - cs / 2, cs, cs);
  const cx = S / 2, cy = S / 2, A = 1.36 * U, B = 0.94 * U;
  c.fillStyle = BRAND.beurre; c.beginPath(); c.ellipse(cx, cy, A + 0.5 * U, B + 0.52 * U, 0, 0, TAU); c.fill();
  for (const [x, y] of [[cx, m2], [cx, S - m2], [m2, cy], [S - m2, cy]]) { c.beginPath(); c.ellipse(x, y, (x === cx ? 0.55 : 0.24) * U, (x === cx ? 0.24 : 0.55) * U, 0, 0, TAU); c.fill(); }
  c.fillStyle = BRAND.creme; c.beginPath(); c.ellipse(cx, cy, A + 0.1 * U, B + 0.1 * U, 0, 0, TAU); c.fill();
  // score lines where the lid folds
  for (const d of [0.05 * U]) { L.crease(d, d, S - d, d, 5); L.crease(d, S - d, S - d, S - d, 5); L.crease(d, d, d, S - d, 5); L.crease(S - d, d, S - d, S - d, 5); }
  L.gold((g, st) => {
    g.strokeStyle = st; g.fillStyle = st; g.lineCap = 'round';
    // double rule border, broken by the corner tiles
    g.lineWidth = 0.028 * U; g.strokeRect(m1, m1, S - 2 * m1, S - 2 * m1);
    g.lineWidth = 0.01 * U; g.strokeRect(m2, m2, S - 2 * m2, S - 2 * m2);
    for (const [x, y] of corners) talaveraTile(g, x, y, cs, 0.022 * U);
    // little fleurons at the mid-points of each side
    for (const [x, y, a] of [[cx, m2, Math.PI / 2], [cx, S - m2, -Math.PI / 2], [m2, cy, 0], [S - m2, cy, Math.PI]]) { palmette(g, x, y, a, 0.16 * U); laurelSpray(g, x, y, a + Math.PI / 2, 0.42 * U, 5, 0.01 * U); laurelSpray(g, x, y, a - Math.PI / 2, 0.42 * U, 5, 0.01 * U); }
    // cartouche frame
    g.lineWidth = 0.04 * U; g.beginPath(); g.ellipse(cx, cy, A + 0.085 * U, B + 0.085 * U, 0, 0, TAU); g.stroke();
    g.lineWidth = 0.011 * U; g.beginPath(); g.ellipse(cx, cy, A, B, 0, 0, TAU); g.stroke();
    const nb = 96;
    for (let k = 0; k < nb; k++) { const a = (k / nb) * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * (A + 0.165 * U), cy + Math.sin(a) * (B + 0.165 * U), 0.014 * U, 0, TAU); g.fill(); }
    // crest and base: palmette between C-scrolls, laurel sprays
    for (const s of [-1, 1]) {
      const y0 = cy + s * (B + 0.2 * U);
      palmette(g, cx, y0 - s * 0.02 * U, s * Math.PI / 2, (s < 0 ? 0.3 : 0.22) * U);
      for (const h of [-1, 1]) {
        cscroll(g, cx + h * 0.16 * U, y0 + s * 0.05 * U, cx + h * 0.8 * U, y0 - s * 0.13 * U, -h * s * 0.16 * U, 0.075 * U, 0.024 * U, h * s);
        laurelSpray(g, cx + h * 0.86 * U, y0 - s * 0.2 * U, s > 0 ? (h > 0 ? -0.5 : Math.PI + 0.5) : (h > 0 ? 0.5 : Math.PI - 0.5), 0.5 * U, 6, 0.011 * U);
      }
    }
    for (const h of [-1, 1]) {
      const x0 = cx + h * (A + 0.24 * U);
      cscroll(g, x0, cy - 0.36 * U, x0, cy + 0.36 * U, -h * 0.13 * U, 0.06 * U, 0.022 * U, h);
      palmette(g, x0 + h * 0.02 * U, cy, h > 0 ? 0 : Math.PI, 0.15 * U);
    }
    // rule + lozenge under the wordmark
    g.lineWidth = 0.009 * U; g.beginPath(); g.moveTo(cx - 0.55 * U, cy + 0.2 * U); g.lineTo(cx - 0.07 * U, cy + 0.2 * U); g.moveTo(cx + 0.07 * U, cy + 0.2 * U); g.lineTo(cx + 0.55 * U, cy + 0.2 * U); g.stroke();
    g.save(); g.translate(cx, cy + 0.2 * U); g.rotate(Math.PI / 4); g.fillRect(-0.028 * U, -0.028 * U, 0.056 * U, 0.056 * U); g.restore();
  });
  // wordmark + lines (ink, not foil)
  c.fillStyle = BRAND.tomate; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = `700 ${0.74 * U}px "Bodoni Moda"`; c.letterSpacing = `${0.035 * U}px`;
  c.fillText('KUKI', cx + 0.02 * U, cy + 0.06 * U);
  c.font = `italic 500 ${0.15 * U}px "Bodoni Moda"`; c.letterSpacing = `${0.004 * U}px`;
  c.fillText(TXT.tagline, cx, cy + 0.42 * U);
  c.font = `500 ${0.082 * U}px "Bodoni Moda"`; c.letterSpacing = `${0.03 * U}px`;
  c.fillText(TXT.place, cx + 0.015 * U, cy + 0.6 * U);
  return L;
}

function skirtLayers() {
  const Wp = DRAFT ? 2048 : 4096, Hp = Math.round((Wp * HS) / WL), U = Wp / WL;
  const L = new Layers(Wp, Hp, BRAND.beurre);
  L.c.save(); L.c.translate(0.1 * U, 0.035 * U);
  drawPapelPicado(L.c, Wp - 0.2 * U, Hp * 0.72, { count: 13 });
  L.c.restore();
  L.gold((g, st) => {
    g.strokeStyle = st; g.fillStyle = st;
    g.lineWidth = 0.022 * U; g.beginPath(); g.moveTo(0, Hp - 0.07 * U); g.lineTo(Wp, Hp - 0.07 * U); g.stroke();
    g.lineWidth = 0.008 * U; g.beginPath(); g.moveTo(0, Hp - 0.105 * U); g.lineTo(Wp, Hp - 0.105 * U); g.stroke();
  });
  return L;
}

function baseLayers(withText) {
  const Wp = DRAFT ? 2048 : 4096, Hp = Math.round((Wp * HB) / W), U = Wp / W;
  const L = new Layers(Wp, Hp, BRAND.tomate);
  L.gold((g, st) => {
    g.strokeStyle = st; g.fillStyle = st;
    const y = Hp - 0.19 * U;
    g.lineWidth = 0.014 * U;
    for (const yy of [y - 0.085 * U, y + 0.085 * U]) { g.beginPath(); g.moveTo(0, yy); g.lineTo(Wp, yy); g.stroke(); }
    const n = 30;
    for (let k = 0; k < n; k++) {
      const x = ((k + 0.5) / n) * Wp;
      if (k % 2) { for (let j = 0; j < 4; j++) petal(g, x, y, (j / 4) * TAU + Math.PI / 4, 0.055 * U, 0.016 * U); g.beginPath(); g.arc(x, y, 0.012 * U, 0, TAU); g.fill(); }
      else { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-0.02 * U, -0.02 * U, 0.04 * U, 0.04 * U); g.restore(); }
    }
    if (withText) {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `italic 500 ${0.2 * U}px "Bodoni Moda"`; g.letterSpacing = `${0.012 * U}px`;
      g.fillText(TXT.side, Wp / 2, Hp * 0.33);
    }
  });
  return L;
}

// planar UVs per box face so artwork lands predictably on RoundedBoxGeometry
function boxUVs(g, w, h, d) {
  const p = g.attributes.position, uv = g.attributes.uv, idx = g.index;
  for (const gr of g.groups) {
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const v = idx ? idx.getX(i) : i;
      const x = p.getX(v) / w, y = p.getY(v) / h, z = p.getZ(v) / d;
      const [u, t] = [[0.5 - z, y + 0.5], [z + 0.5, y + 0.5], [x + 0.5, 0.5 - z], [x + 0.5, z + 0.5], [x + 0.5, y + 0.5], [0.5 - x, y + 0.5]][gr.materialIndex];
      uv.setXY(v, u, t);
    }
  }
  uv.needsUpdate = true;
  return g;
}
const plain = (hex, k = 0.72) => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(k), roughness: 0.85, toneMapped: false });
const shadowed = (m) => { m.castShadow = m.receiveShadow = true; return m; };

let _lidMats = null;
function buildLid() {
  if (!_lidMats) {
    const top = lidTopLayers().material(), skirt = skirtLayers().material();
    _lidMats = [skirt, skirt, top, plain(BRAND.creme), skirt, skirt];
  }
  const g = boxUVs(new RoundedBoxGeometry(WL, HS, WL, 5, 0.035), WL, HS, WL);
  return shadowed(new THREE.Mesh(g, _lidMats));
}
function buildBase() {
  const side = baseLayers(false).material(), front = baseLayers(true).material();
  const g = boxUVs(new RoundedBoxGeometry(W, HB, W, 4, 0.03), W, HB, W);
  const m = shadowed(new THREE.Mesh(g, [side, side, plain(BRAND.creme), plain(BRAND.tomate), front, side]));
  m.position.y = HB / 2;
  return m;
}
function buildTray() {
  const t = 0.055, g = new THREE.Group();
  const side = baseLayers(false).material(), front = baseLayers(true).material(), inner = plain(BRAND.creme, 0.66), red = plain(BRAND.tomate);
  const wall = (w, mats, x, z, ry) => {
    const geo = boxUVs(new RoundedBoxGeometry(w, HB, t, 2, 0.012), w, HB, t);
    const m = shadowed(new THREE.Mesh(geo, mats));
    m.position.set(x, HB / 2, z); m.rotation.y = ry; g.add(m);
  };
  wall(W, [red, red, inner, red, front, inner], 0, W / 2 - t / 2, 0);
  wall(W, [red, red, inner, red, side, inner], 0, -W / 2 + t / 2, Math.PI);
  wall(W, [red, red, inner, red, side, inner], W / 2 - t / 2, 0, Math.PI / 2);
  wall(W, [red, red, inner, red, side, inner], -W / 2 + t / 2, 0, -Math.PI / 2);
  const floor = shadowed(new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, t, W - 0.02), inner));
  floor.position.y = t / 2; g.add(floor);
  g.userData.floorY = t;
  return g;
}

// ------------------------------------------------------------------ ribbon
function satin() {
  return new THREE.MeshPhysicalMaterial({
    color: '#82BA58', roughness: 0.24, sheen: 0.25, sheenColor: '#DDF2C4', sheenRoughness: 0.35,
    anisotropy: 0.85, side: THREE.DoubleSide,
  });
}
// strip through samples [{p, w, wdir?|n}] -> BufferGeometry
function strip(samples, { cols = 6, vcut = 0, crown = 0.012 } = {}) {
  const n = samples.length, pos = [], uv = [], idx = [];
  const t = new THREE.Vector3(), wd = new THREE.Vector3(), nn = new THREE.Vector3();
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)].p, b = samples[Math.min(n - 1, i + 1)].p;
    t.subVectors(b, a).normalize();
    const s = samples[i];
    if (s.wdir) wd.copy(s.wdir).normalize(); else wd.crossVectors(t, s.n).normalize();
    nn.crossVectors(wd, t).normalize();
    if (i) len += s.p.distanceTo(samples[i - 1].p);
    for (let k = 0; k <= cols; k++) {
      const f = k / cols * 2 - 1;
      const cut = i === n - 1 ? vcut * (1 - Math.abs(f)) : 0; // swallowtail on the last row
      pos.push(s.p.x + wd.x * f * s.w - t.x * cut + nn.x * crown * (1 - f * f), s.p.y + wd.y * f * s.w - t.y * cut + nn.y * crown * (1 - f * f), s.p.z + wd.z * f * s.w - t.z * cut + nn.z * crown * (1 - f * f));
      uv.push(len, k / cols);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < cols; k++) { const a = i * (cols + 1) + k, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function resample(ctrl, N) {
  // ctrl: [{p, n?, w}] -> smooth samples
  const curve = new THREE.CatmullRomCurve3(ctrl.map((c) => c.p), false, 'centripetal');
  const out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, f = u * (ctrl.length - 1), k = Math.min(ctrl.length - 2, Math.floor(f)), a = ctrl[k], b = ctrl[k + 1], m = f - k;
    const s = { p: curve.getPoint(u), w: a.w + (b.w - a.w) * m };
    if (a.n) s.n = a.n.clone().lerp(b.n, m).normalize();
    if (a.wdir) s.wdir = a.wdir.clone().lerp(b.wdir, m).normalize();
    out.push(s);
  }
  return out;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function buildRibbon() {
  const g = new THREE.Group(), mat = satin();
  const hw = 0.2, e = 0.012, xA = -1.98, zB = 1.66, half = WL / 2;
  const add = (geo) => g.add(shadowed(new THREE.Mesh(geo, mat)));
  // band over the box along an axis: up one side, across the lid, down the other
  const band = (alongZ, off, lift) => {
    const P = (s, y) => (alongZ ? V(off, y, s) : V(s, y, off));
    const N = (s, y) => (alongZ ? V(0, y, s) : V(s, y, 0));
    const h = half + lift, top = TOP + lift, lidBot = TOP - HS;
    const ctrl = [];
    const push = (s, y, ns, ny) => ctrl.push({ p: P(s, y), n: N(ns, ny).normalize(), w: hw });
    push(-W / 2 - lift, 0.0, -1, 0); push(-W / 2 - lift, lidBot - 0.1, -1, 0); push(-h, lidBot + 0.02, -1, 0); push(-h, top - 0.06, -1, 0.2);
    push(-h + 0.03, top - 0.012, -0.7, 0.7); push(-h + 0.09, top, 0, 1);
    for (const s of [-1.6, -0.8, 0, 0.8, 1.6]) push(s, top, 0, 1);
    void 0;
    push(h - 0.09, top, 0, 1); push(h - 0.03, top - 0.012, 0.7, 0.7); push(h, top - 0.06, 1, 0.2); push(h, lidBot + 0.02, 1, 0); push(W / 2 + lift, lidBot - 0.1, 1, 0); push(W / 2 + lift, 0.0, 1, 0);
    // polyline (not spline) keeps the corners crisp
    const samples = [];
    for (let i = 0; i < ctrl.length - 1; i++) { const a = ctrl[i], b = ctrl[i + 1], m = Math.max(2, Math.ceil(a.p.distanceTo(b.p) / 0.05)); for (let k = 0; k < m; k++) { const f = k / m; samples.push({ p: a.p.clone().lerp(b.p, f), n: a.n.clone().lerp(b.n, f).normalize(), w: hw }); } }
    samples.push(ctrl[ctrl.length - 1]);
    add(strip(samples, { cols: 4, crown: 0.006 }));
  };
  band(true, xA, e);
  band(false, zB, e * 2.2);
  // bow
  const K = V(xA, TOP + 0.07, zB);
  const loop = (phi, scale, tilt) => {
    const d = V(Math.cos(phi), 0, Math.sin(phi)), perp = V(-Math.sin(phi), 0, Math.cos(phi));
    const wdir = perp.clone().addScaledVector(V(0, 1, 0), tilt).normalize();
    const prof = [[0.02, 0.05, 0.42], [0.18, 0.3, 0.8], [0.5, 0.52, 1], [0.84, 0.47, 1], [0.99, 0.24, 0.95], [0.82, 0.07, 0.9], [0.42, 0.04, 0.75], [0.04, 0.0, 0.42]];
    const ctrl = prof.map(([s, h, w]) => ({ p: K.clone().addScaledVector(d, s * scale).add(V(0, h * scale - 0.02, 0)), wdir, w: hw * 1.12 * w }));
    add(strip(resample(ctrl, 70), { cols: 8, crown: 0.03 }));
  };
  loop(0.72, 1.2, 0.3); loop(0.72 + Math.PI + 0.3, 1.12, -0.28);
  const up = V(0, 1, 0);
  const tail = (pts, vcut) => add(strip(resample(pts.map(([p, n, w]) => ({ p, n, w: hw * w })), 70), { cols: 8, vcut, crown: 0.015 }));
  const ty = TOP + e * 3;
  tail([[K.clone(), up, 0.45], [V(xA + 0.2, ty + 0.1, zB + 0.28), up, 0.85], [V(xA + 0.34, ty + 0.03, zB + 0.62), up, 1], [V(xA + 0.4, ty + 0.035, half - 0.12), up, 1], [V(xA + 0.43, ty - 0.03, half + 0.05), V(0, 0.6, 0.8), 1],
    [V(xA + 0.48, TOP - 0.3, half + 0.07), V(0, 0, 1), 1], [V(xA + 0.56, TOP - 0.74, half + 0.1), V(0, -0.1, 1), 1]], 0.2);
  tail([[K.clone(), up, 0.45], [V(xA - 0.3, ty + 0.1, zB + 0.12), up, 0.85], [V(xA - 0.62, ty + 0.03, zB + 0.2), up, 1], [V(-half + 0.12, ty + 0.035, zB + 0.26), up, 1], [V(-half - 0.05, ty - 0.03, zB + 0.28), V(-0.8, 0.6, 0), 1],
    [V(-half - 0.07, TOP - 0.28, zB + 0.33), V(-1, 0, 0), 1], [V(-half - 0.1, TOP - 0.6, zB + 0.42), V(-1, -0.1, 0), 1]], 0.2);
  const knot = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat));
  knot.scale.set(0.15, 0.1, 0.13); knot.rotation.y = -0.72; knot.position.copy(K).add(V(0, 0.02, 0));
  g.add(knot);
  return g;
}

// ------------------------------------------------------------------ shots
function contactRects(rects, world) {
  // rects in world x/z: [x0, z0, x1, z1]; `world` = side length the texture covers
  return softShape((c, s) => { for (const [x0, z0, x1, z1] of rects) c.fillRect((x0 / world + 0.5) * s, (z0 / world + 0.5) * s, ((x1 - x0) / world) * s, ((z1 - z0) / world) * s); }, 18);
}
function camAt(w, h, { az, el, d, target, fov = 22 }) {
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 200);
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  cam.position.set(target[0] + Math.sin(a) * Math.cos(e) * d, target[1] + Math.sin(e) * d, target[2] + Math.cos(a) * Math.cos(e) * d);
  cam.lookAt(...target);
  return cam;
}

export function boxClosed(w, h, bg = BRAND.creme) {
  const world = 12;
  const scene = stage({ key: [-5.5, 9, 6.5], extent: 5, mapSize: 4096, radius: 4, ground: { bg, contact: contactRects([[-W / 2, -W / 2, W / 2, W / 2]], world), size: world, opacity: 0.2, contactOpacity: 0.6 }, keyI: 2.5, fillI: 0.55, rimI: 1.3, envI: 0.5 });
  const box = new THREE.Group();
  box.add(buildBase());
  const lid = buildLid(); lid.position.y = TOP - HS / 2; box.add(lid);
  box.add(buildRibbon());
  box.rotation.y = 0;
  scene.add(box);
  const cam = camAt(w, h, { az: -30, el: 34, d: 15.4, target: [0.1, 0.3, 0.1] });
  return capture(scene, cam, w, h, bg);
}

export function boxOpen(w, h, bg = BRAND.pistache) {
  const world = 16;
  const lean = (64 * Math.PI) / 180;
  const lidCy = (HS / 2) * Math.cos(lean) + (WL / 2) * Math.sin(lean);
  const lidZ = -W / 2 - 0.08 - (WL / 2) * Math.cos(lean) - (HS / 2) * Math.sin(lean);
  const scene = stage({ key: [-5.5, 9, 6.5], extent: 6.5, mapSize: 4096, radius: 4, ground: { bg, contact: contactRects([[-W / 2, -W / 2, W / 2, W / 2], [-WL / 2, -W / 2 - 0.5, WL / 2, -W / 2 - 0.05]], world), size: world, opacity: 0.12, contactOpacity: 0.6 }, keyI: 2.5, fillI: 0.6, rimI: 1.2, envI: 0.5 });
  const tray = buildTray();
  scene.add(tray);
  const lid = buildLid();
  lid.rotation.x = lean; lid.position.set(0, lidCy, lidZ);
  scene.add(lid);
  const order = ['le-classique', 'concha-rosa', 'fraise-creme', 'cajeta-praline'];
  const spots = [[-1, 1], [1, 1], [-1, -1], [1, -1]], rots = [0.4, -0.6, 2.2, 1.1];
  const cookies = order.map((slug, i) => {
    const c = resetCookie(buildCookie(slug));
    c.position.set(spots[i][0] * 1.16, tray.userData.floorY + 0.004, spots[i][1] * 1.16);
    c.rotation.y = rots[i];
    scene.add(c);
    return c;
  });
  const cam = camAt(w, h, { az: -16, el: 40, d: 20.8, target: [0.1, 1.22, -0.85] });
  const url = capture(scene, cam, w, h, bg);
  cookies.forEach((c) => scene.remove(c));
  return url;
}
void Q;
