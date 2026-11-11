// "Toile de Jouy franco-mexicaine": a single-ink, engraving-style repeat drawn
// entirely with canvas strokes. Mexican subjects (Porfirian architecture, pan
// dulce, plants, animals) rendered like French copperplate toile vignettes.
// Original artwork - no traced or copied motifs.
//
// The tile is 1000x1000 design units, drawn at any pixel size, and repeats
// seamlessly (two columns of vignettes, the second dropped by half a row).

import { rng } from './noise.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- pen
class Pen {
  constructor(ctx, ink, paper, seed) {
    this.c = ctx; this.ink = ink; this.paper = paper; this.r = rng(seed);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }
  j(a = 0.6) { return (this.r() - 0.5) * 2 * a; }
  // path builders (no stroke)
  smooth(pts, close = false, wob = 0) {
    const c = this.c;
    const P = wob ? pts.map(([x, y]) => [x + this.j(wob), y + this.j(wob)]) : pts;
    const n = P.length;
    const g = (i) => (close ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    c.moveTo(P[0][0], P[0][1]);
    const m = close ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (close) c.closePath();
  }
  _paint(w, fill) {
    const c = this.c;
    if (fill) { c.fillStyle = fill === 'ink' ? this.ink : this.paper; c.fill(); }
    if (w > 0) { c.strokeStyle = this.ink; c.lineWidth = w; c.stroke(); }
  }
  curve(pts, { w = 2.2, close = false, fill = null, wob = 0.5 } = {}) {
    this.c.beginPath(); this.smooth(pts, close, wob); this._paint(w, fill);
  }
  poly(pts, { w = 2.2, close = true, fill = null, wob = 0.4 } = {}) {
    const c = this.c;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x + this.j(wob), y + this.j(wob)) : c.moveTo(x + this.j(wob), y + this.j(wob))));
    if (close) c.closePath();
    this._paint(w, fill);
  }
  line(x1, y1, x2, y2, w = 2.2) { this.poly([[x1, y1], [x2, y2]], { w, close: false }); }
  ell(x, y, rx, ry, { rot = 0, a0 = 0, a1 = TAU, w = 2.2, fill = null } = {}) {
    this.c.beginPath(); this.c.ellipse(x, y, rx, ry, rot, a0, a1); this._paint(w, fill);
  }
  dot(x, y, r = 1.6) { this.c.beginPath(); this.c.arc(x, y, r, 0, TAU); this.c.fillStyle = this.ink; this.c.fill(); }
  tube(pts, wo, wi = wo - 4) {
    const c = this.c;
    c.beginPath(); this.smooth(pts); c.strokeStyle = this.ink; c.lineWidth = wo; c.stroke();
    c.beginPath(); this.smooth(pts); c.strokeStyle = this.paper; c.lineWidth = Math.max(0.1, wi); c.stroke();
  }
  // parallel-line shading clipped to one or more shapes (intersection)
  hatch(shapes, { ang = 0.85, gap = 5, w = 1.1, box = [-260, -300, 260, 60], cross = false } = {}) {
    const c = this.c;
    c.save();
    for (const s of [].concat(shapes)) { c.beginPath(); s(c); c.clip(); }
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, L = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + 4;
    const run = (a) => {
      const dx = Math.cos(a), dy = Math.sin(a);
      c.beginPath();
      for (let t = -L; t <= L; t += gap) {
        const ox = cx - dy * t, oy = cy + dx * t;
        c.moveTo(ox - dx * L, oy - dy * L + this.j(0.4)); c.lineTo(ox + dx * L, oy + dy * L + this.j(0.4));
      }
      c.strokeStyle = this.ink; c.lineWidth = w; c.stroke();
    };
    run(ang);
    if (cross) run(ang + 1.2);
    c.restore();
  }
  at(x, y, rot, sx, sy, fn) {
    const c = this.c;
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (sx !== 1 || sy !== 1) c.scale(sx, sy); fn(); c.restore();
  }
}
// clip-shape helpers
const E = (x, y, rx, ry, rot = 0) => (c) => c.ellipse(x, y, rx, ry, rot, 0, TAU);
const PG = (pts) => (c) => { pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
const RC = (x0, y0, x1, y1) => PG([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const SM = (p, pts) => (c) => p.smooth(pts, true, 0);

// ---------------------------------------------------------------- small parts
function island(p, w, { rows = 5 } = {}) {
  const top = [];
  for (let i = 0; i <= 10; i++) top.push([-w + (2 * w * i) / 10, -5 * Math.sin((Math.PI * i) / 10) + p.j(1.5)]);
  p.curve(top, { w: 2.4 });
  for (let k = 1; k <= rows; k++) {
    const half = w * (1 - k * 0.16), y = k * 5.5;
    let x = -half + p.r() * 14;
    while (x < half) {
      const len = 14 + p.r() * 34;
      p.line(x, y + p.j(0.6), Math.min(half, x + len), y + p.j(0.6), 1.3);
      x += len + 5 + p.r() * 9;
    }
  }
}
function tuft(p, x, y, s = 1) {
  for (let k = -2; k <= 2; k++) p.curve([[x + k * 1.5 * s, y], [x + k * 3.2 * s, y - 6 * s], [x + k * 5.5 * s, y - (11 - Math.abs(k) * 1.5) * s]], { w: 1.3, wob: 0.3 });
}
function bush(p, cx, cy, r, { shade = true } = {}) {
  p.ell(cx, cy, r * 0.96, r * 0.96, { w: 0, fill: 'paper' });
  const n = Math.max(7, Math.round(r / 3.2));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + p.j(0.08);
    p.ell(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, r * 0.3, r * 0.3, { a0: a - 1.5, a1: a + 1.5, w: 1.9 });
  }
  for (let i = 0; i < n * 1.2; i++) {
    const a = p.r() * TAU, d = r * 0.62 * Math.sqrt(p.r());
    p.ell(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.16, r * 0.16, { a0: Math.PI * 0.9, a1: Math.PI * 2.1, w: 1.2 });
  }
  if (shade) p.hatch([E(cx, cy, r, r), E(cx + r * 0.55, cy + r * 0.45, r * 0.95, r * 0.95)], { gap: 3.6, w: 1, box: [cx - r, cy - r, cx + r, cy + r] });
}
function tree(p, x, h, r) {
  p.poly([[x - 3, 0], [x - 2, -h], [x + 2, -h], [x + 3.5, 0]], { w: 1.6, fill: 'paper' });
  p.hatch(RC(x, -h, x + 4, 0), { gap: 3, ang: 0.3, box: [x - 4, -h, x + 4, 0] });
  bush(p, x - r * 0.55, -h - r * 0.2, r * 0.75);
  bush(p, x + r * 0.6, -h - r * 0.3, r * 0.7);
  bush(p, x, -h - r * 0.9, r * 0.85);
}
function bird(p, x, y, s = 1) {
  p.curve([[x - 9 * s, y - 3 * s], [x - 4 * s, y - 6 * s], [x, y]], { w: 1.6, wob: 0 });
  p.curve([[x, y], [x + 5 * s, y - 7 * s], [x + 11 * s, y - 5 * s]], { w: 1.6, wob: 0 });
}
function cloud(p, x, y, w) {
  const n = Math.round(w / 13);
  let px = x - w / 2;
  for (let i = 0; i < n; i++) {
    const r = 6 + p.r() * 5 + 5 * Math.sin((Math.PI * (i + 0.5)) / n);
    p.ell(px + r, y, r, r * 0.9, { a0: Math.PI, a1: TAU, w: 1.6, fill: 'paper' });
    px += r * 1.45;
  }
  p.line(x - w / 2 + 6, y + 3, x + w / 2 - 10, y + 3, 1.2);
  p.line(x - w / 2 + 22, y + 7, x + w / 2 - 30, y + 7, 1.1);
}
// leaf pointing along +x from the origin of a rotated frame
function leafPts(len, wid, serr = 0, n = 14) {
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, base = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9);
    const tooth = serr && i % 2 ? 1 - serr : 1;
    top.push([len * t, -base * tooth]);
    bot.push([len * t, base * tooth]);
  }
  return top.concat(bot.reverse().slice(1, -1));
}
function leaf(p, x, y, ang, len, wid, { serr = 0, veins = 3, shade = true, w = 1.8 } = {}) {
  p.at(x, y, ang, 1, 1, () => {
    const pts = leafPts(len, wid, serr);
    if (serr) p.poly(pts, { w, fill: 'paper', wob: 0.2 }); else p.curve(pts, { w, close: true, fill: 'paper', wob: 0.2 });
    p.line(0, 0, len * 0.94, 0, 1.2);
    for (let k = 1; k <= veins; k++) {
      const t = k / (veins + 1);
      p.line(len * t, 0, len * (t + 0.14), -wid * 0.62 * Math.sin(Math.PI * t), 0.9);
      p.line(len * t, 0, len * (t + 0.14), wid * 0.62 * Math.sin(Math.PI * t), 0.9);
    }
    if (shade) p.hatch([PG(pts), RC(0, 0, len, wid)], { gap: 2.6, ang: 0.6, w: 0.8, box: [0, 0, len, wid] });
  });
}
function laurel(p, cx, cy, R, a0 = 0.3, a1 = 2.72) {
  for (const s of [-1, 1]) {
    const pts = [];
    for (let a = a0; a <= a1 + 1e-6; a += 0.1) pts.push([cx + s * R * Math.sin(a), cy + R * Math.cos(a)]);
    p.curve(pts, { w: 1.8, wob: 0.2 });
    for (let a = a0 + 0.1; a < a1; a += 0.155) {
      const x = cx + s * R * Math.sin(a), y = cy + R * Math.cos(a);
      const tang = Math.atan2(-Math.sin(a), s * Math.cos(a)); // direction of travel up the branch
      const sz = 15 + 5 * Math.sin((a - a0) / (a1 - a0) * Math.PI);
      leaf(p, x, y, tang - s * 0.62, sz, sz * 0.27, { veins: 0, shade: true, w: 1.5 });
      leaf(p, x, y, tang + s * 0.62, sz, sz * 0.27, { veins: 0, shade: false, w: 1.5 });
    }
  }
  // ribbon bow tying the two branches
  const by = cy + R * Math.cos(a0) + 3;
  for (const s of [-1, 1]) {
    p.curve([[cx, by], [cx + s * 14, by - 12], [cx + s * 30, by - 6], [cx + s * 24, by + 6], [cx, by]], { w: 1.7, fill: 'paper', wob: 0.2 });
    p.curve([[cx, by], [cx + s * 8, by + 12], [cx + s * 20, by + 20], [cx + s * 15, by + 26], [cx + s * 22, by + 30]], { w: 1.7, wob: 0.2 });
    p.hatch(SM(p, [[cx, by], [cx + s * 14, by - 12], [cx + s * 30, by - 6], [cx + s * 24, by + 6]]), { gap: 3, ang: s * 0.5, w: 0.8, box: [cx - 32, by - 14, cx + 32, by + 8] });
  }
  p.ell(cx, by, 5, 4, { w: 1.6, fill: 'paper' });
}
function marigold(p, x, y, r) {
  for (const k of [1, 0.74, 0.5, 0.27]) {
    const rr = r * k, n = Math.max(6, Math.round(rr / 1.9));
    p.ell(x, y, rr * 0.93, rr * 0.93, { w: 0, fill: 'paper' });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + k * 2;
      p.ell(x + Math.cos(a) * rr * 0.86, y + Math.sin(a) * rr * 0.86, rr * 0.3 + 1, rr * 0.3 + 1, { a0: a - 1.45, a1: a + 1.45, w: 1.5 });
      p.line(x + Math.cos(a) * rr * 0.62, y + Math.sin(a) * rr * 0.62, x + Math.cos(a) * rr * 0.92, y + Math.sin(a) * rr * 0.92, 0.8);
    }
  }
  p.dot(x, y, 1.6);
  p.hatch([E(x, y, r, r), E(x + r * 0.6, y + r * 0.5, r, r)], { gap: 3, w: 0.8, box: [x - r, y - r, x + r, y + r] });
}
function dahlia(p, x, y, r) {
  [[1, 13, 0], [0.7, 10, 0.3], [0.42, 7, 0.1]].forEach(([k, n, off]) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + off;
      leaf(p, x + Math.cos(a) * r * k * 0.18, y + Math.sin(a) * r * k * 0.18, a, r * k * 0.84, r * k * 0.19, { veins: 0, shade: i % 3 === 0, w: 1.4 });
    }
  });
  p.ell(x, y, r * 0.13, r * 0.13, { w: 1.4, fill: 'paper' });
  p.dot(x - 1, y, 1); p.dot(x + 1.5, y + 1, 1);
}

// ---------------------------------------------------------------- vignettes
// All drawn around a local origin at ground centre, y up = negative.

function bellasArtes(p) {
  tree(p, -158, 34, 20); tree(p, 160, 30, 19);
  // steps
  for (let k = 0; k < 4; k++) p.line(-150 - k * 5, -k * 3.4 + 2, 150 + k * 5, -k * 3.4 + 2, 1.5);
  // wings
  p.poly([[-140, -10], [-140, -78], [140, -78], [140, -10]], { fill: 'paper' });
  p.line(-144, -80, 144, -80, 2.6); p.line(-142, -85, 142, -85, 1.3);
  p.poly([[-136, -85], [-136, -94], [136, -94], [136, -85]], { w: 1.6, fill: 'paper' });
  for (let x = -128; x <= 128; x += 9) p.line(x, -86, x, -93, 0.9); // balustrade
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const x = s * (58 + k * 15);
      p.line(x - 2.2, -14, x - 2.2, -72, 1.4); p.line(x + 2.2, -14, x + 2.2, -72, 1.4);
      p.line(x - 4, -73, x + 4, -73, 1.8); p.line(x - 4, -13, x + 4, -13, 1.8);
      if (k < 4) {
        const wx = x + s * 7.5;
        p.ell(wx, -52, 3.6, 3.6, { a0: Math.PI, a1: TAU, w: 1.2 });
        p.poly([[wx - 3.6, -52], [wx - 3.6, -36], [wx + 3.6, -36], [wx + 3.6, -52]], { w: 1.2, close: false });
        p.hatch(RC(wx - 3.6, -55, wx + 3.6, -36), { gap: 2.2, w: 0.8, box: [wx - 4, -56, wx + 4, -36] });
        p.poly([[wx - 3.4, -30], [wx + 3.4, -30], [wx + 3.4, -18], [wx - 3.4, -18]], { w: 1 });
      }
    }
    // end pavilions with small cupolas
    const ex = s * 132;
    p.poly([[ex - 15, -10], [ex - 15, -98], [ex + 15, -98], [ex + 15, -10]], { fill: 'paper' });
    p.line(ex - 18, -99, ex + 18, -99, 2.2);
    p.ell(ex, -60, 6, 6, { a0: Math.PI, a1: TAU, w: 1.4 });
    p.poly([[ex - 6, -60], [ex - 6, -22], [ex + 6, -22], [ex + 6, -60]], { w: 1.4, close: false });
    p.hatch(RC(ex - 6, -66, ex + 6, -22), { gap: 2.4, w: 0.8, box: [ex - 7, -67, ex + 7, -21] });
    p.ell(ex, -100, 13, 15, { a0: Math.PI, a1: TAU, w: 1.9, fill: 'paper' });
    p.ell(ex, -100, 5, 15, { a0: Math.PI, a1: TAU, w: 1 });
    p.line(ex, -115, ex, -123, 1.5); p.dot(ex, -124, 1.8);
    p.hatch([E(ex, -100, 13, 15), RC(ex + 3, -116, ex + 14, -100)], { gap: 2.4, w: 0.8, box: [ex - 14, -116, ex + 14, -100] });
  }
  p.hatch(RC(96, -78, 140, -10), { gap: 4.5, w: 0.8, ang: 1.1, box: [96, -78, 140, -10] });
  // central pavilion with the great arch
  p.poly([[-50, -10], [-50, -104], [50, -104], [50, -10]], { fill: 'paper', w: 2.4 });
  p.line(-54, -105, 54, -105, 2.6);
  p.ell(0, -52, 27, 30, { a0: Math.PI, a1: TAU, w: 2.2 });
  p.ell(0, -52, 22, 25, { a0: Math.PI, a1: TAU, w: 1.2 });
  for (let k = 1; k < 8; k++) { const a = Math.PI + (k / 8) * Math.PI; p.line(Math.cos(a) * 7, -52 + Math.sin(a) * 8, Math.cos(a) * 22, -52 + Math.sin(a) * 25, 0.9); }
  p.poly([[-27, -52], [-27, -12], [27, -12], [27, -52]], { w: 1.8, close: false });
  p.line(-22, -52, 22, -52, 1.3);
  p.poly([[-9, -12], [-9, -44], [9, -44], [9, -12]], { w: 1.4, close: false });
  p.hatch(RC(-9, -44, 9, -12), { gap: 2.6, w: 0.9, cross: true, box: [-9, -44, 9, -12] });
  for (const x of [-42, -34, 34, 42]) { p.line(x - 2, -14, x - 2, -92, 1.4); p.line(x + 2, -14, x + 2, -92, 1.4); p.line(x - 4, -93, x + 4, -93, 1.8); }
  p.curve([[-50, -104], [-26, -112], [0, -116], [26, -112], [50, -104]], { w: 1.8, wob: 0 });
  // drum + great dome
  for (const s of [-1, 1]) {
    p.ell(s * 60, -96, 19, 21, { a0: Math.PI, a1: TAU, w: 1.9, fill: 'paper' });
    p.ell(s * 60, -96, 8, 21, { a0: Math.PI, a1: TAU, w: 1 });
    p.line(s * 60, -117, s * 60, -124, 1.4); p.dot(s * 60, -125, 1.6);
    p.hatch([E(s * 60, -96, 19, 21), RC(s * 60 + 5, -118, s * 60 + 20, -96)], { gap: 2.4, w: 0.8, box: [s * 60 - 20, -118, s * 60 + 20, -96] });
  }
  p.poly([[-40, -114], [-40, -130], [40, -130], [40, -114]], { fill: 'paper', w: 2 });
  for (let x = -32; x <= 32; x += 8) p.ell(x, -121, 2.2, 4, { w: 1, fill: 'ink' });
  p.ell(0, -131, 41, 50, { a0: Math.PI, a1: TAU, w: 2.6, fill: 'paper' });
  for (const k of [0.3, 0.62, 0.86]) p.ell(0, -131, 41 * k, 50, { a0: Math.PI, a1: TAU, w: 1.1 });
  for (const k of [0.35, 0.62, 0.84]) { const hw = 41 * Math.sqrt(1 - k * k); p.curve([[-hw, -131 - 50 * k], [0, -131 - 50 * k - 3], [hw, -131 - 50 * k]], { w: 0.9, wob: 0 }); }
  p.hatch([E(0, -131, 41, 50), RC(9, -182, 42, -131)], { gap: 2.8, w: 0.9, box: [-42, -182, 42, -131] });
  p.poly([[-7, -180], [-7, -192], [7, -192], [7, -180]], { fill: 'paper', w: 1.6 });
  p.ell(0, -192, 8, 8, { a0: Math.PI, a1: TAU, w: 1.7, fill: 'paper' });
  p.line(0, -200, 0, -212, 1.6); p.dot(0, -214, 2.2);
  island(p, 175);
  tuft(p, -110, 3); tuft(p, 96, 4, 0.9);
  bird(p, -92, -168); bird(p, -70, -182, 0.7); bird(p, 96, -160, 0.8);
  cloud(p, 104, -196, 74);
}

function kiosk(p) {
  tree(p, -112, 50, 24); tree(p, 114, 44, 22);
  // lamp posts
  for (const s of [-1, 1]) {
    const x = s * 84;
    p.line(x, 0, x, -62, 2); p.ell(x, -68, 5, 6, { w: 1.5, fill: 'paper' }); p.line(x - 4, -62, x + 4, -62, 1.6); p.line(x - 3, 0, x + 3, 0, 2.4);
  }
  // plinth
  p.poly([[-66, 0], [-70, -32], [70, -32], [66, 0]], { fill: 'paper', w: 2.4 });
  p.line(-25, -32, -24, 0, 1.3); p.line(25, -32, 24, 0, 1.3);
  p.poly([[-58, -26], [-56, -6], [-31, -6], [-31, -26]], { w: 1.1 }); p.poly([[58, -26], [56, -6], [31, -6], [31, -26]], { w: 1.1 });
  p.hatch(PG([[25, -32], [70, -32], [66, 0], [24, 0]]), { gap: 3.4, w: 0.9, box: [24, -32, 70, 0] });
  for (let k = 0; k < 5; k++) p.poly([[-15 - k * 1.5, -k * 6.4], [15 + k * 1.5, -k * 6.4]].map(([x, y]) => [x, y - 0.5]), { w: 1.5, close: false, fill: null });
  p.poly([[-14, -32], [-22, 0], [22, 0], [14, -32]], { w: 1.4, close: false });
  p.line(-76, -33, 76, -33, 3);
  // railing
  p.line(-70, -52, 70, -52, 2);
  for (let x = -68; x <= 68; x += 6.2) { if (Math.abs(x) < 13) continue; p.line(x, -34, x + 3.1, -51, 0.9); p.line(x + 3.1, -34, x, -51, 0.9); }
  // columns
  for (const x of [-66, -36, 0, 36, 66]) {
    if (x === 0) continue;
    p.line(x - 1.8, -34, x - 1.8, -122, 1.5); p.line(x + 1.8, -34, x + 1.8, -122, 1.5);
    p.line(x - 4, -56, x + 4, -56, 1.5);
    for (const s of [-1, 1]) p.curve([[x + s * 2, -108], [x + s * 9, -112], [x + s * 12, -121]], { w: 1.2, wob: 0 });
  }
  p.line(-1.6, -53, -1.6, -122, 1.2); p.line(1.6, -53, 1.6, -122, 1.2); // far column
  // frieze + iron lace valance
  p.poly([[-78, -122], [-78, -131], [78, -131], [78, -122]], { fill: 'paper', w: 2 });
  for (let x = -72; x <= 72; x += 8) { p.ell(x, -122, 4, 5.5, { a0: 0, a1: Math.PI, w: 1.1 }); p.dot(x, -126.5, 1); }
  // ogee roof
  const roofL = [[-86, -131], [-60, -141], [-36, -158], [-18, -176], [-9, -190]];
  const roof = roofL.concat(roofL.map(([x, y]) => [-x, y]).reverse());
  p.curve(roof, { w: 2.6, fill: 'paper', wob: 0 });
  p.line(-86, -131, 86, -131, 2.4);
  for (const k of [-0.62, -0.28, 0.28, 0.62]) p.curve(roofL.map(([x, y]) => [x * -k * 1.0 * (y < -185 ? 0.6 : 1), y]), { w: 1, wob: 0 });
  p.hatch([SM(p, roof), RC(14, -192, 90, -131)], { gap: 3, w: 0.9, box: [-90, -192, 90, -130] });
  p.poly([[-8, -190], [-8, -201], [8, -201], [8, -190]], { fill: 'paper', w: 1.6 });
  p.line(-3, -191, -3, -200, 0.9); p.line(3, -191, 3, -200, 0.9);
  p.ell(0, -201, 9.5, 11, { a0: Math.PI, a1: TAU, w: 1.8, fill: 'paper' });
  p.line(0, -212, 0, -230, 1.6); p.dot(0, -219, 2.4); p.dot(0, -231, 1.6);
  p.curve([[0, -226], [7, -229], [12, -225]], { w: 1.1, wob: 0 });
  island(p, 135);
  tuft(p, -52, 4); tuft(p, 44, 5, 0.9);
  marigold(p, -92, -6, 7); marigold(p, 96, -5, 6);
  bird(p, 62, -206, 0.9); bird(p, 84, -190, 0.7); bird(p, -70, -214, 0.8);
}

function agave(p, x, y, s = 1) {
  const L = [[-1.25, 62], [1.25, 60], [-0.95, 78], [0.98, 74], [-0.62, 90], [0.66, 86], [-0.3, 96], [0.34, 92], [0.02, 100]];
  for (const [a, len] of L) {
    p.at(x, y, a - Math.PI / 2, s, s, () => {
      const w = 9, bend = a * 7;
      const up = [[0, -w], [len * 0.3, -w * 0.95 - bend * 0.3], [len * 0.7, -w * 0.5 - bend], [len, -bend * 1.5]];
      const dn = [[len * 0.7, w * 0.5 - bend], [len * 0.3, w * 0.95 - bend * 0.3], [0, w]];
      const pts = up.concat(dn);
      p.curve(pts, { w: 1.8, close: true, fill: 'paper', wob: 0.2 });
      p.curve([[4, 0], [len * 0.5, -bend * 0.6], [len * 0.96, -bend * 1.45]], { w: 0.9, wob: 0 });
      p.hatch([SM(p, pts), PG([[0, 0], [len * 0.5, -bend * 0.6], [len, -bend * 1.5], [len, 14], [0, 14]])], { gap: 2.8, ang: 0.5, w: 0.8, box: [0, -16, len, 16] });
      for (let k = 1; k < 6; k++) p.dot(len * k / 6.5, -w * (1 - k / 7.5) - bend * (k / 6.5) * 0.9 - 1, 0.9);
    });
  }
}

function goat(p) {
  agave(p, -112, 2, 0.62);
  // far legs
  p.tube([[20, -56], [17, -28], [15, -2]], 8.5); p.tube([[-30, -48], [-22, -26], [-25, -2]], 8.5);
  p.hatch(RC(8, -56, 26, 0), { gap: 2.6, w: 0.9, box: [8, -56, 26, 0] }); p.hatch(RC(-36, -50, -14, 0), { gap: 2.6, w: 0.9, box: [-36, -50, -14, 0] });
  // horns (behind head)
  p.tube([[46, -128], [36, -144], [22, -150], [12, -142]], 6.5, 3); p.tube([[50, -128], [44, -146], [32, -156], [20, -152]], 6.5, 3);
  const body = [[-62, -80], [-40, -87], [-10, -84], [15, -89], [30, -104], [40, -120], [47, -129], [58, -127], [72, -116], [79, -108], [75, -102], [62, -103], [50, -103],
    [43, -91], [39, -74], [37, -58], [36, -30], [37, -7], [40, 0], [30, 0], [29, -28], [27, -50], [10, -47], [-20, -45], [-36, -49], [-37, -40], [-43, -25], [-40, -6], [-37, 0], [-47, 0], [-49, -9],
    [-55, -27], [-51, -45], [-60, -60], [-65, -72]];
  p.curve(body, { w: 2.5, close: true, fill: 'paper', wob: 0.3 });
  const B = SM(p, body);
  p.hatch([B, PG([[-70, -62], [45, -56], [45, 2], [-70, 2]])], { gap: 3, ang: 0.35, w: 0.9, box: [-70, -64, 45, 2] });
  p.hatch([B, E(-52, -66, 16, 22)], { gap: 3, ang: 1.2, w: 0.9, box: [-70, -90, -34, -44] });
  p.hatch([B, PG([[30, -104], [50, -103], [43, -88], [38, -74], [26, -84]])], { gap: 2.6, ang: 1.0, w: 0.9, box: [24, -106, 52, -72] });
  // coat strokes along the back
  for (let x = -52; x < 16; x += 7) p.curve([[x, -80 + p.j(2)], [x + 3, -74], [x + 2, -68 + p.j(2)]], { w: 0.9, wob: 0.3 });
  // head details
  leaf(p, 45, -123, 2.75, 17, 4.5, { veins: 0, w: 1.5 });
  p.dot(62, -119, 1.9); p.dot(76, -109, 1); p.line(70, -105, 76, -104, 1);
  for (let k = 0; k < 5; k++) p.curve([[58 + k * 2, -103], [57 + k * 1.6, -95], [59 + k, -88 + k]], { w: 1, wob: 0.3 });
  p.curve([[31, -101], [38, -95], [45, -95]], { w: 2.2, wob: 0 }); p.ell(40, -89, 3.6, 4, { w: 1.4, fill: 'paper' }); p.dot(40, -86.5, 0.9);
  p.curve([[-62, -80], [-72, -92], [-76, -86], [-66, -76]], { w: 1.8, fill: 'paper', wob: 0.2 });
  island(p, 120);
  tuft(p, 62, 3); tuft(p, -8, 5, 0.9); tuft(p, 92, 5, 0.8);
  marigold(p, 78, -7, 6.5); marigold(p, 96, -2, 5);
  bird(p, -30, -150, 0.9); bird(p, -52, -136, 0.7);
}

function concha(p, x, y, s = 1) {
  p.at(x, y, 0, s, s, () => {
    const dome = [[-48, 0], [-46, -22], [-30, -44], [0, -52], [30, -44], [46, -22], [48, 0]];
    p.curve(dome.concat([[30, 5], [0, 7], [-30, 5]]), { w: 2.4, close: true, fill: 'paper', wob: 0.3 });
    // shell scoring, fanning from the left shoulder
    for (let k = 0; k < 8; k++) {
      const t = k / 7, ex = -40 + t * 84, ey = -14 + 14 * Math.sin(t * 2.6) + (t > 0.85 ? -6 : 0);
      p.curve([[-34, -38], [-30 + t * 34, -40 + t * 2], [ex * 0.75 + 4, (ey - 40) / 2 + t * 4], [ex, ey]], { w: 1.5, wob: 0.3 });
      if (k < 7) p.curve([[-33, -37], [-28 + (t + 0.07) * 34, -38 + t * 2], [(ex + 6) * 0.75 + 4, (ey - 38) / 2 + t * 4], [ex + 5, ey + 1]], { w: 0.8, wob: 0.3 });
    }
    p.hatch([SM(p, dome.concat([[30, 5], [0, 7], [-30, 5]])), PG([[14, -56], [50, -56], [50, 8], [-10, 8]])], { gap: 3, ang: 1.0, w: 0.8, box: [-50, -56, 50, 8] });
    p.curve([[-47, -3], [-30, 3], [0, 5], [30, 3], [47, -3]], { w: 1, wob: 0 });
  });
}
function conchaStill(p) {
  laurel(p, 0, -128, 112);
  // table with a lace-edged cloth
  p.line(-92, -62, 92, -62, 2.4); p.line(-90, -57, 90, -57, 1.2);
  for (let x = -84; x <= 84; x += 12) { p.ell(x, -57, 6, 7, { a0: 0, a1: Math.PI, w: 1.2 }); p.dot(x, -53.5, 1); }
  // plate + concha
  p.ell(-30, -68, 60, 9, { w: 2, fill: 'paper' }); p.ell(-30, -69, 46, 5.5, { w: 1 });
  p.hatch([E(-30, -68, 60, 9), RC(-10, -68, 40, -56)], { gap: 2.6, w: 0.8, box: [-90, -78, 30, -58] });
  concha(p, -30, -76, 1.0);
  // jarrito of chocolate
  const jar = [[44, -64], [36, -78], [38, -96], [46, -108], [42, -118], [78, -118], [74, -108], [82, -96], [84, -78], [76, -64]];
  p.curve([[80, -104], [96, -104], [98, -86], [84, -80]], { w: 4.2, wob: 0 });
  p.curve([[80, -104], [96, -104], [98, -86], [84, -80]], { w: 0, wob: 0 });
  p.c.strokeStyle = p.paper; p.c.lineWidth = 1.4; p.c.beginPath(); p.smooth([[80, -104], [96, -104], [98, -86], [84, -80]]); p.c.stroke();
  p.curve(jar, { w: 2.2, close: true, fill: 'paper', wob: 0.2 });
  p.ell(60, -118, 18, 3.6, { w: 1.6, fill: 'paper' }); p.ell(60, -118, 13, 2, { w: 0, fill: 'ink' });
  p.curve([[37, -90], [48, -86], [60, -85], [72, -86], [83, -90]], { w: 1.1, wob: 0 });
  p.curve([[37, -76], [48, -72], [60, -71], [72, -72], [84, -76]], { w: 1.1, wob: 0 });
  for (let k = 0; k < 6; k++) { const x = 42 + k * 7.4; p.ell(x, -80.5, 2.6, 3.6, { w: 1 }); p.dot(x, -80.5, 0.8); }
  p.hatch([SM(p, jar), RC(66, -120, 90, -62)], { gap: 2.6, w: 0.8, box: [36, -120, 90, -62] });
  // molinillo standing in the jarrito
  p.tube([[57, -118], [40, -196]], 5.5, 2.6);
  for (const t of [0.25, 0.4, 0.55]) { const x = 57 - 17 * t, y = -118 - 78 * t; p.line(x - 4, y - 1, x + 4, y + 1, 1.6); }
  p.at(39, -201, -0.21, 1, 1, () => {
    p.ell(0, 0, 6, 9, { w: 1.7, fill: 'paper' });
    for (const k of [-3, 0, 3]) p.line(k, -7, k, 7, 0.9);
    p.ell(0, -11, 3.2, 3.2, { w: 1.4, fill: 'paper' });
  });
  // steam
  for (const [x, h] of [[66, 30], [74, 22]]) p.curve([[x, -124], [x + 5, -124 - h * 0.3], [x - 3, -124 - h * 0.6], [x + 4, -124 - h]], { w: 1.2, wob: 0.2 });
  // a strawberry and crumbs on the cloth
  p.dot(40, -66, 1.2); p.dot(30, -65, 1); p.dot(88, -66, 1.1);
}

function nopal(p) {
  agave(p, -66, 2, 0.8);
  const pads = [[46, -36, 22, 34, 0.05], [22, -92, 19, 29, -0.42], [72, -94, 19, 29, 0.42], [6, -146, 15, 23, -0.2], [42, -140, 13, 20, 0.25], [92, -146, 15, 23, 0.3]];
  // tunas + flowers first (behind pad edges)
  const fruit = (x, y, a, flower) => p.at(x, y, a, 1, 1, () => {
    p.ell(0, -7, 5.2, 8, { w: 1.5, fill: 'paper' });
    p.hatch([E(0, -7, 5.2, 8), RC(0, -16, 6, 2)], { gap: 2, w: 0.7, box: [-6, -16, 6, 2] });
    if (flower) { for (const k of [-0.9, -0.3, 0.3, 0.9]) leaf(p, 0, -14, k - Math.PI / 2, 9, 2.6, { veins: 0, shade: false, w: 1.2 }); } else { p.line(-3, -15, 3, -15, 1.4); p.dot(-1, -8, 0.7); p.dot(2, -5, 0.7); }
  });
  fruit(-2, -168, -0.35, false); fruit(12, -169, 0.1, true); fruit(38, -159, 0.1, false); fruit(50, -157, 0.5, false);
  fruit(88, -168, 0.0, true); fruit(101, -164, 0.5, false); fruit(8, -116, -0.9, false); fruit(86, -118, 0.95, false);
  for (const [x, y, rx, ry, rot] of pads) {
    p.ell(x, y, rx, ry, { rot, w: 2.2, fill: 'paper' });
    p.at(x, y, rot, 1, 1, () => {
      for (let j = -3; j <= 3; j++) for (let i = -2; i <= 2; i++) {
        const ax = i * rx * 0.36 + (j % 2 ? rx * 0.18 : 0), ay = j * ry * 0.24;
        if ((ax * ax) / (rx * rx) + (ay * ay) / (ry * ry) > 0.62) continue;
        p.dot(ax, ay, 1); p.line(ax, ay, ax - 2.4, ay - 2.6, 0.7); p.line(ax, ay, ax + 2.4, ay - 2.6, 0.7);
      }
      p.hatch([E(0, 0, rx, ry), E(rx * 0.7, ry * 0.25, rx, ry)], { gap: 2.8, w: 0.85, box: [-rx, -ry, rx, ry] });
    });
  }
  // hummingbird visiting
  hummingbird(p, -58, -176, 1.15, 1);
  island(p, 128);
  tuft(p, 2, 4); tuft(p, 100, 4, 0.9);
  p.ell(18, -1, 7, 4, { w: 1.4, fill: 'paper' }); p.ell(-8, 2, 5, 3, { w: 1.3, fill: 'paper' });
  bird(p, -100, -120, 0.8);
}

function hummingbird(p, x, y, s = 1, dir = 1) {
  p.at(x, y, 0, s * dir, s, () => {
    // tail
    for (const a of [2.55, 2.8, 3.05]) leaf(p, -12, 5, a, 20, 3.6, { veins: 0, shade: a > 2.7, w: 1.3 });
    // far wing
    leaf(p, -2, -6, -2.25, 30, 6, { veins: 0, shade: true, w: 1.3 });
    // body
    const body = [[-14, 5], [-6, -6], [6, -10], [15, -9], [20, -5], [16, 0], [6, 6], [-6, 8]];
    p.curve(body, { w: 2, close: true, fill: 'paper', wob: 0.2 });
    p.hatch([SM(p, body), PG([[-16, 0], [22, 2], [20, 10], [-16, 10]])], { gap: 2.2, ang: 0.3, w: 0.8, box: [-16, -10, 22, 10] });
    p.line(19, -5, 44, -1, 1.5); // bill
    p.dot(14, -5.5, 1.3);
    for (let k = 0; k < 4; k++) p.ell(6 + k * 2.5, 1, 2, 2, { a0: 0.2, a1: 2.6, w: 0.8 });
    // near wing with feather lines
    p.at(0, -7, -1.2, 1, 1, () => {
      const w = leafPts(36, 8.5);
      p.curve(w, { w: 1.7, close: true, fill: 'paper', wob: 0.2 });
      for (let k = 1; k < 7; k++) p.line(k * 4.6, 0, k * 4.6 + 6, 8.5 * Math.sin((Math.PI * k) / 8) * 0.9, 0.8);
      p.line(0, 0, 34, 0, 1);
    });
  });
}

function alebrije(p) {
  // an invented winged, curl-tailed creature covered in engraved ornament
  p.tube([[24, -56], [22, -28], [26, -3]], 9); p.tube([[-34, -50], [-26, -26], [-30, -3]], 9);
  // tail curling into a volute
  const tail = [[-56, -70], [-80, -74], [-100, -96], [-98, -128], [-78, -142], [-60, -130], [-64, -112], [-78, -112], [-80, -122]];
  p.tube(tail, 11, 7);
  for (let i = 0; i < 16; i++) { const t = i / 16, k = Math.floor(t * (tail.length - 1)); const a = tail[k], b = tail[k + 1]; const f = t * (tail.length - 1) - k; const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; const dx = b[1] - a[1], dy = -(b[0] - a[0]); const l = Math.hypot(dx, dy) || 1; p.line(x - (dx / l) * 3, y - (dy / l) * 3, x + (dx / l) * 3, y + (dy / l) * 3, 1); }
  // far wing
  for (const a of [-2.2, -1.95, -1.7]) leaf(p, 6, -82, a, 58, 8, { veins: 2, shade: true, w: 1.4 });
  const body = [[-58, -70], [-30, -79], [0, -75], [22, -83], [34, -100], [37, -116], [34, -138], [45, -122], [51, -140], [57, -119], [65, -112], [85, -100], [89, -95], [80, -89], [62, -87], [50, -83],
    [46, -66], [45, -40], [48, -9], [57, 0], [40, 0], [38, -30], [34, -51], [5, -50], [-28, -52], [-31, -36], [-27, -9], [-19, 0], [-38, 0], [-42, -20], [-50, -40], [-61, -56]];
  p.curve(body, { w: 2.5, close: true, fill: 'paper', wob: 0.3 });
  const B = SM(p, body);
  // ornament bands, clipped to the body
  const c = p.c;
  c.save(); c.beginPath(); B(c); c.clip();
  for (let x = -56; x < 34; x += 9) p.ell(x, -73, 5, 6, { a0: 0, a1: Math.PI, w: 1.2 });
  for (let x = -52; x < 34; x += 9) { p.ell(x, -64, 5, 6, { a0: 0, a1: Math.PI, w: 1 }); p.dot(x, -66, 0.9); }
  for (let x = -50; x < 46; x += 6) { p.line(x, -52, x + 3, -57, 1); p.line(x + 3, -57, x + 6, -52, 1); }
  for (let y = -44; y < 0; y += 6) { p.line(34, y, 52, y + 2, 1.1); p.line(-46, y, -22, y + 2, 1.1); }
  for (let k = 0; k < 5; k++) p.curve([[30 + k * 3, -84 - k * 6], [40 + k * 2, -88 - k * 6], [50 + k, -84 - k * 6]], { w: 1.1, wob: 0 });
  for (let k = 0; k < 9; k++) p.dot(-44 + k * 9, -58.5, 0.9);
  c.restore();
  p.hatch([B, PG([[-64, -60], [50, -56], [50, 0], [-64, 0]])], { gap: 3.4, ang: 0.3, w: 0.7, box: [-64, -60, 58, 0] });
  // near wing: two rows of feathers
  for (const a of [-2.75, -2.5, -2.25, -2.0, -1.75]) leaf(p, 10, -78, a, 66 - Math.abs(a + 2.25) * 16, 9, { veins: 3, shade: a < -2.2, w: 1.5 });
  for (const a of [-2.6, -2.3, -2.0, -1.7]) leaf(p, 12, -76, a, 30, 7, { veins: 0, shade: false, w: 1.4 });
  p.ell(12, -76, 6, 6, { w: 1.5, fill: 'paper' }); p.dot(12, -76, 1.6);
  // face
  p.curve([[60, -108], [65, -112], [71, -108], [65, -105]], { w: 1.3, close: true, fill: 'paper', wob: 0 }); p.dot(65.5, -108.5, 1.5);
  p.dot(86, -97, 1.3); p.curve([[70, -92], [78, -91], [84, -93]], { w: 1.1, wob: 0 });
  p.line(36, -131, 40, -120, 0.9); p.line(51, -133, 53, -121, 0.9);
  island(p, 118);
  tuft(p, 78, 4); tuft(p, -70, 5, 0.9);
  marigold(p, 96, -8, 7); dahlia(p, -98, -9, 9);
  bird(p, 88, -150, 0.8); bird(p, 70, -164, 0.6);
}

// ---------------------------------------------------------------- fillers
function sprigMarigold(p) {
  p.curve([[-4, 58], [2, 20], [-6, -14], [4, -40]], { w: 2.2, wob: 0.3 });
  p.curve([[-2, 6], [18, -8], [30, -30]], { w: 1.8, wob: 0.3 });
  for (const [x, y, a] of [[-2, 40, 2.6], [0, 30, 0.5], [-5, 12, 2.9], [-4, -2, 0.2]]) {
    for (let k = 0; k < 4; k++) { const d = 7 + k * 7; leaf(p, x + Math.cos(a) * d, y + Math.sin(a) * d, a + 0.75, 11 - k, 3, { veins: 0, serr: 0.3, shade: false, w: 1.2 }); leaf(p, x + Math.cos(a) * d, y + Math.sin(a) * d, a - 0.75, 11 - k, 3, { veins: 0, serr: 0.3, w: 1.2 }); }
    p.line(x, y, x + Math.cos(a) * 34, y + Math.sin(a) * 34, 1.4);
  }
  marigold(p, 5, -50, 21); marigold(p, 33, -36, 12);
  p.ell(-22, -22, 5, 7, { w: 1.5, fill: 'paper' }); p.curve([[-6, -6], [-16, -12], [-21, -16]], { w: 1.4, wob: 0 });
}
function sprigDahlia(p) {
  p.curve([[6, 60], [0, 24], [8, -8], [0, -34]], { w: 2.2, wob: 0.3 });
  p.curve([[4, 10], [-16, -2], [-28, -20]], { w: 1.8, wob: 0.3 });
  leaf(p, 3, 34, 0.25, 34, 10, { serr: 0.22 }); leaf(p, 2, 22, 2.75, 30, 9, { serr: 0.22 }); leaf(p, 6, 2, -0.2, 24, 7, { serr: 0.22 });
  dahlia(p, 0, -44, 27); dahlia(p, -32, -28, 14);
}
function sprigStrawberry(p) {
  p.curve([[-52, 26], [-20, 6], [14, 2], [46, -18]], { w: 2.2, wob: 0.3 });
  const berry = (x, y, s, a) => p.at(x, y, a, s, s, () => {
    const b = [[0, -11], [9, -12], [14, -3], [9, 10], [0, 19], [-9, 10], [-14, -3], [-9, -12]];
    p.curve(b, { w: 2, close: true, fill: 'paper', wob: 0.2 });
    for (let j = 0; j < 5; j++) for (let i = -2; i <= 2; i++) { const sx = i * 5 + (j % 2 ? 2.5 : 0), sy = -6 + j * 5; if (Math.abs(sx) < 11 - j * 2) p.line(sx, sy, sx + 0.6, sy + 1.8, 1); }
    p.hatch([SM(p, b), RC(2, -14, 16, 20)], { gap: 2.6, w: 0.8, box: [-14, -14, 16, 20] });
    for (const k of [-1.1, -0.55, 0, 0.55, 1.1]) leaf(p, 0, -11, k - Math.PI / 2 + Math.PI, 0, 0, { veins: 0, shade: false });
    for (const k of [-1.2, -0.6, 0, 0.6, 1.2]) leaf(p, 0, -12, k + Math.PI / 2, 9, 2.6, { veins: 0, shade: false, w: 1.2 });
  });
  p.curve([[-6, 4], [-4, 22], [-10, 32]], { w: 1.5, wob: 0 }); p.curve([[22, -2], [28, 14], [26, 24]], { w: 1.5, wob: 0 });
  for (const [x, y, a] of [[-24, 8, -2.2], [-24, 8, -1.4], [-24, 8, -3.0], [34, -12, -1.5], [34, -12, -0.7], [34, -12, 0.1]]) leaf(p, x, y, a, 30, 11, { serr: 0.25 });
  berry(-10, 44, 1, 0.1); berry(27, 36, 0.85, -0.15);
  // blossom
  p.curve([[6, 2], [2, -16], [8, -28]], { w: 1.4, wob: 0 });
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; p.ell(8 + Math.cos(a) * 6, -34 + Math.sin(a) * 6, 4.6, 4.6, { w: 1.3, fill: 'paper' }); }
  p.ell(8, -34, 3, 3, { w: 1.2, fill: 'paper' }); p.dot(8, -34, 1);
}
function sprigPecan(p) {
  p.curve([[-50, -30], [-18, -12], [16, -8], [52, 12]], { w: 2.6, wob: 0.3 });
  const pinnate = (x, y, a, n, len) => p.at(x, y, a, 1, 1, () => {
    p.line(0, 0, len, 0, 1.4);
    for (let k = 1; k <= n; k++) { const d = (len * k) / (n + 0.6); leaf(p, d, 0, 0.9, 21 - k, 5, { veins: 0, w: 1.3 }); leaf(p, d, 0, -0.9, 21 - k, 5, { veins: 0, shade: false, w: 1.3 }); }
    leaf(p, len, 0, 0, 22, 5.5, { veins: 0, w: 1.3 });
  });
  pinnate(-22, -14, -1.9, 4, 46); pinnate(20, -8, -0.75, 4, 50); pinnate(-36, -24, 2.6, 3, 34);
  const nut = (x, y, a) => p.at(x, y, a, 1, 1, () => {
    const n = [[0, -15], [6, -9], [7, 2], [4, 11], [0, 16], [-4, 11], [-7, 2], [-6, -9]];
    p.curve(n, { w: 1.8, close: true, fill: 'paper', wob: 0.2 });
    p.curve([[-3, -11], [-4, 0], [-2, 12]], { w: 0.8, wob: 0 }); p.curve([[2, -12], [3.4, 0], [1.6, 12]], { w: 0.8, wob: 0 });
    p.hatch([SM(p, n), RC(1, -16, 8, 17)], { gap: 2.2, w: 0.8, box: [-8, -16, 8, 17] });
    p.curve([[-8, -6], [-9, -15], [0, -19], [9, -15], [8, -6]], { w: 1.5, wob: 0 });
  });
  p.curve([[4, -8], [6, 6], [2, 14]], { w: 1.6, wob: 0 });
  nut(-8, 32, 0.3); nut(6, 36, -0.1); nut(18, 28, -0.5);
}
function sprigColibri(p) {
  hummingbird(p, -8, -22, 1.25, 1);
  p.curve([[52, 52], [44, 22], [48, -2]], { w: 2, wob: 0.3 });
  leaf(p, 46, 30, -0.3, 22, 6, { serr: 0.2 }); leaf(p, 45, 18, 3.3, 20, 6, { serr: 0.2 });
  dahlia(p, 48, -12, 15);
  bird(p, -40, 40, 0.8); bird(p, -22, 52, 0.6);
}

// ---------------------------------------------------------------- tile
const MAIN = [
  [bellasArtes, 250, 306, 1.04], [goat, 250, 628, 1.22], [nopal, 250, 968, 1.2],
  [conchaStill, 750, 168, 1.12], [kiosk, 750, 478, 1.16], [alebrije, 750, 800, 1.26],
];
const FILL = [
  [sprigMarigold, 500, 92, 1.15, 0.15], [sprigStrawberry, 500, 410, 1.15, -0.1], [sprigDahlia, 500, 742, 1.15, -0.12],
  [sprigPecan, 0, 262, 1.15, 0.1], [sprigColibri, 0, 585, 1.1, 0], [sprigMarigold, 0, 905, -1.1, -0.2],
];

export function drawToile(ctx, size, { ink = '#E8412C', paper = '#FFE27A', background = true } = {}) {
  const k = size / 1000;
  ctx.save();
  if (background) { ctx.fillStyle = paper; ctx.fillRect(0, 0, size, size); }
  ctx.scale(k, k);
  const all = MAIN.map((m, i) => [...m, 0, 100 + i]).concat(FILL.map((f, i) => [...f, 200 + i]));
  for (const [fn, x, y, s, rot, seed] of all) {
    for (const ox of [-1000, 0, 1000]) for (const oy of [-1000, 0, 1000]) {
      const X = x + ox, Y = y + oy;
      if (X < -320 || X > 1320 || Y < -120 || Y > 1420) continue;
      const p = new Pen(ctx, ink, paper, seed);
      p.at(X, Y, rot, s, Math.abs(s), () => fn(p));
    }
  }
  ctx.restore();
}

export function toileCanvas(size, opts) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  drawToile(cv.getContext('2d'), size, opts);
  return cv;
}

// ---------------------------------------------------------------- papel picado band
// Drawn into [0,w]x[0,h] of ctx: a cord with cut-paper pennants in solid ink.
export function drawPapelPicado(ctx, w, h, { ink = '#E8412C', paper = '#FFE27A', count = 9, seed = 5 } = {}) {
  const pw = w / count, r = rng(seed);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x0 = i * pw + pw * 0.06, x1 = (i + 1) * pw - pw * 0.06, W = x1 - x0;
    const sag = (t) => h * 0.07 + h * 0.06 * Math.sin(Math.PI * t);
    const top = (x) => sag((x - i * pw) / pw);
    const H = h * 0.74, sc = 7, sw = W / sc;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(x0, top(x0)); ctx.lineTo(x1, top(x1)); ctx.lineTo(x1, top(x1) + H);
    for (let k = sc - 1; k >= 0; k--) ctx.arc(x0 + (k + 0.5) * sw, top(x0) + H, sw / 2, 0, Math.PI, false);
    ctx.closePath(); ctx.fill();
    // cut-outs
    ctx.fillStyle = paper;
    const cx = (x0 + x1) / 2, cy = top(cx) + H * 0.5, R = Math.min(W, H) * 0.3;
    const kind = i % 3;
    const petal = (a, d, len, wid) => { ctx.save(); ctx.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, wid, 0, 0, TAU); ctx.fill(); ctx.restore(); };
    if (kind === 0) { for (let k = 0; k < 8; k++) petal((k / 8) * TAU, R * 0.28, R * 0.72, R * 0.14); ctx.beginPath(); ctx.arc(cx, cy, R * 0.16, 0, TAU); ctx.fill(); }
    else if (kind === 1) { for (let k = 0; k < 12; k++) petal((k / 12) * TAU, R * 0.5, R * 0.5, R * 0.07); for (let k = 0; k < 6; k++) petal((k / 6) * TAU + 0.26, R * 0.12, R * 0.3, R * 0.09); }
    else { for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; ctx.save(); ctx.translate(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5); ctx.rotate(a + Math.PI / 4); ctx.fillRect(-R * 0.2, -R * 0.2, R * 0.4, R * 0.4); ctx.restore(); } for (let k = 0; k < 4; k++) petal((k / 4) * TAU, R * 0.05, R * 0.34, R * 0.1); }
    // border perforations
    const m = W * 0.09;
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x0 + m + ((W - 2 * m) * k) / 5, top(x0) + H * 0.1, W * 0.022, 0, TAU); ctx.fill(); }
    for (let k = 0; k < sc; k++) { ctx.beginPath(); ctx.arc(x0 + (k + 0.5) * sw, top(x0) + H * 0.97, sw * 0.17, 0, TAU); ctx.fill(); }
    for (const sx of [x0 + m, x1 - m]) for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.ellipse(sx, top(x0) + H * (0.12 + k * 0.16), W * 0.018, H * 0.04, 0, 0, TAU); ctx.fill(); }
    void r;
  }
  // cord
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, h * 0.022);
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) { const t = (x % pw) / pw; const y = h * 0.07 + h * 0.06 * Math.sin(Math.PI * t); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.restore();
}
