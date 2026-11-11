// The four KUKI flavours: dough parameters + topping builders.
import * as THREE from 'three';
import { gn, fbm, voronoi, rng, clamp, smoothstep, mix } from './noise.js';
import { conformBlob, conformRibbon, placeOn, scatter, lumpGeometry, grainNormalMap, mergeVerts, hex } from './cookie.js';

export const BRAND = { beurre: '#FFE27A', tomate: '#E8412C', creme: '#FFF6E5', cacao: '#3B2418', pistache: '#B7D59A' };

const TAU = Math.PI * 2;
const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

// ------------------------------------------------------------------ Le Classique
function classique(group, ctx, r) {
  const seed = ctx.seed;
  const poolMat = new THREE.MeshPhysicalMaterial({ color: '#3e1f10', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
  const chunkMat = new THREE.MeshPhysicalMaterial({ color: '#45220f', roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const pts = scatter(r, 14, 0.3, ctx.prof.sEq * 0.86, 0.05);
  const items = [];
  pts.forEach((p, i) => {
    const s = Math.hypot(p.x, p.z);
    const chunk = r() < 0.5 || s > 0.82;
    const r0 = chunk ? r.range(0.085, 0.14) : r.range(0.11, 0.2);
    const rot = r() * Math.PI, asp = r.range(0.7, 1), sq = chunk ? 0.8 : 0.25;
    const radiusFn = (th) => {
      const c = Math.abs(Math.cos(th - rot)), sn = Math.abs(Math.sin(th - rot)) / asp;
      const sup = Math.pow(Math.pow(c, 4) + Math.pow(sn, 4), -0.25);
      return r0 * mix(1, sup, sq) * (1 + 0.16 * gn(Math.cos(th) * 1.4 + i * 7.3, Math.sin(th) * 1.4, seed + i) + 0.05 * gn(Math.cos(th) * 5, Math.sin(th) * 5 + i, seed));
    };
    const t = chunk ? r.range(0.05, 0.085) : r.range(0.02, 0.034);
    const heightFn = (rho, th, px, pz) =>
      t * Math.pow(1 - Math.pow(rho, chunk ? 7 : 2.6), chunk ? 0.4 : 0.8) * (1 + 0.08 * gn(px * 6, pz * 6, seed + 3)) - 0.007;
    const g = conformBlob(ctx, { cx: p.x, cz: p.z, radiusFn, heightFn, nR: 28, nT: 72, rhoPow: 0.8 });
    group.add(shadow(new THREE.Mesh(g, chunk ? chunkMat : poolMat)));
    items.push({ ...p, r0, t, chunk });
  });
  // sea-salt flakes, biased onto the chocolate
  const saltMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.28, clearcoat: 0.6, emissive: '#ffffff', emissiveIntensity: 0.06 });
  const geos = [0, 1, 2, 3].map((k) => lumpGeometry({ seed: 50 + k, detail: 0, amp: 0.25, boxy: 0.7, scale: [1, 0.28, 0.75] }));
  r.tilt = 1.0;
  for (let k = 0; k < 90; k++) {
    let px, pz, h = 0;
    if (r() < 0.45) {
      const it = r.pick(items), a = r() * TAU, d = it.r0 * 0.6 * Math.sqrt(r());
      px = it.x + Math.cos(a) * d; pz = it.z + Math.sin(a) * d; h = it.t * 0.9;
    } else {
      const a = r() * TAU, d = 0.92 * Math.sqrt(r());
      px = Math.cos(a) * d; pz = Math.sin(a) * d;
      const on = items.find((it) => Math.hypot(it.x - px, it.z - pz) < it.r0 * 0.8);
      h = on ? on.t * 0.8 : 0.002;
    }
    const m = new THREE.Mesh(r.pick(geos), saltMat);
    m.scale.setScalar(r.range(0.008, 0.02));
    placeOn(ctx, m, px, pz, h + 0.003, r);
    m.castShadow = true;
    group.add(m);
  }
}
const saltBit = (r) => {
  const m = new THREE.Mesh(lumpGeometry({ seed: 60 + Math.floor(r() * 9), detail: 0, amp: 0.25, boxy: 0.7, scale: [1, 0.3, 0.75] }),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.5 }));
  m.scale.setScalar(r.range(0.014, 0.03));
  return m;
};

// ------------------------------------------------------------------ Concha Rosa
function conchaGroove(px, pz) {
  // shell fan: grooves radiate from a hinge point just past the rim, with a gentle curl
  const ox = 0.1, oz = 1.0;
  const dx = px - ox, dz = pz - oz;
  const dist = Math.hypot(dx, dz);
  const a = Math.atan2(dx, -dz) + 0.16 * (dist - 0.9);
  const D = 0.205;
  const f = a / D;
  return Math.abs(f - Math.round(f)) * D * Math.max(0.25, dist); // world distance to nearest groove
}
function concha(group, ctx, r) {
  const seed = ctx.seed;
  const vo = {};
  const thick = 0.065;
  const radiusFn = (th) => 0.86 * (1 + 0.035 * gn(Math.cos(th) * 1.6, Math.sin(th) * 1.6, seed + 60) + 0.012 * gn(Math.cos(th) * 7, Math.sin(th) * 7, seed + 61));
  const heightFn = (rho, th, px, pz) => {
    const d = conchaGroove(px, pz);
    const gw = 0.03 * (0.8 + 0.4 * (0.5 + 0.5 * gn(px * 3, pz * 3, seed + 62)));
    const g = smoothstep(gw * 0.35, gw * 1.7, d);
    const e = 1 - smoothstep(0.86, 1.0, rho);
    let k = Math.pow(Math.min(g, e), 0.6);
    // hairline crazing on each sugar panel
    voronoi(px * 9 + 0.4 * gn(px * 4, pz * 4, seed), pz * 9, seed + 63, vo);
    const cz = 1 - smoothstep(0, 0.05, vo.f2 - vo.f1);
    return -0.014 + (thick + 0.014) * k * (1 - 0.16 * cz) + 0.004 * fbm(px * 7, pz * 7, seed + 64, 2) * k;
  };
  const pinkA = hex('#E77FA2'), pinkB = hex('#F29DB8');
  const colorFn = (rho, th, px, pz, h, out) => {
    const t = clamp(h / thick) * clamp(0.55 + 0.6 * fbm(px * 2.4, pz * 2.4, seed + 65, 3) + 0.25 * gn(px * 14, pz * 14, seed + 66));
    const c = new THREE.Color().setRGB(mix(pinkA[0], pinkB[0], t), mix(pinkA[1], pinkB[1], t), mix(pinkA[2], pinkB[2], t), THREE.SRGBColorSpace);
    out[0] = c.r; out[1] = c.g; out[2] = c.b;
  };
  const g = conformBlob(ctx, { radiusFn, heightFn, colorFn, nR: ctx.q.crustR, nT: ctx.q.crustT, uvScale: 5 });
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.7, sheen: 0.25, sheenColor: '#ffd0de', sheenRoughness: 0.4,
    normalMap: grainNormalMap({ seed: 4, cells: 96, strength: 2.2 }), normalScale: new THREE.Vector2(0.9, 0.9),
  });
  group.add(shadow(new THREE.Mesh(g, mat)));
  // coarse sugar crystals catching the light
  const sug = new THREE.MeshPhysicalMaterial({ color: '#fff4f7', roughness: 0.15, clearcoat: 1 });
  const sg = lumpGeometry({ seed: 3, detail: 0, amp: 0.2, boxy: 0.8 });
  r.tilt = 2;
  for (let k = 0; k < 0; k++) {
    const a = r() * TAU, d = 0.8 * Math.sqrt(r());
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    const h = heightFn(d / radiusFn(a), a, px, pz);
    if (h < thick * 0.8) continue;
    const m = new THREE.Mesh(sg, sug);
    m.scale.setScalar(r.range(0.004, 0.008));
    placeOn(ctx, m, px, pz, h + 0.002, r);
    group.add(m);
  }
}
const sugarBit = (r) => {
  const m = new THREE.Mesh(lumpGeometry({ seed: 70 + Math.floor(r() * 9), detail: 1, amp: 0.3, boxy: 0.5, scale: [1, 0.35, 0.8] }),
    new THREE.MeshPhysicalMaterial({ color: '#F3A6BD', roughness: 0.6, sheen: 0.5, sheenColor: '#ffe6ee' }));
  m.scale.setScalar(r.range(0.02, 0.05));
  return m;
};

// ------------------------------------------------------------------ Cajeta Praliné
function pecanGeometry(seed) {
  const g = mergeVerts(new THREE.IcosahedronGeometry(1, 4));
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const skin = new THREE.Color('#8E4F22'), dark = new THREE.Color('#693815'), meat = new THREE.Color('#D9B078'), c = new THREE.Color();
  const cut = 0.35 + 0.5 * ((seed * 0.37) % 1), cut2 = -0.95 + 0.4 * ((seed * 0.73) % 1);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ang = Math.atan2(z, y);
    const ridge = Math.cos(ang * 4 + 1.6 * Math.sin(x * 2.3 + seed));
    const k = 1 + 0.1 * ridge + 0.13 * gn(x * 1.4 + seed, y * 1.4 + z * 0.9, seed);
    x *= k * 1.05; y *= k * 0.5; z *= k * 0.74;
    let isCut = 0;
    if (x > cut) { x = cut + (x - cut) * 0.06; isCut = 1; }
    if (x < cut2) { x = cut2 + (x - cut2) * 0.06; isCut = 1; }
    p.setXYZ(i, x, y, z);
    if (isCut) c.copy(meat).multiplyScalar(0.9 + 0.15 * gn(y * 6, z * 6, seed));
    else c.copy(dark).lerp(skin, smoothstep(-0.9, 0.5, ridge)).multiplyScalar(0.9 + 0.2 * gn(x * 5, z * 5 + y * 3, seed));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
let _pecans = null, _pecanMat = null;
function pecanMesh(r) {
  _pecans ??= [1, 2, 3, 4, 5, 6].map((s) => pecanGeometry(s * 1.37));
  _pecanMat ??= new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 });
  const m = new THREE.Mesh(r.pick(_pecans), _pecanMat);
  m.scale.setScalar(r.range(0.075, 0.125));
  return shadow(m);
}
function cajetaPath(r, seed, rot, x0, x1, n, w0, sEq, { jx = 0.03, extLo = 0.82, extHi = 1.04, wv = 0.28, loose = 0 } = {}) {
  const pts = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let k = 0; k <= n; k++) {
    const x = mix(x0, x1, k / n) + r.range(-jx, jx);
    const ext = Math.sqrt(Math.max(0.05, 1 - x * x)) * sEq * r.range(extLo, extHi);
    const z = (k % 2 ? 1 : -1) * ext;
    pts.push(new THREE.Vector3(x * cr - z * sr, 0, x * sr + z * cr));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
  const N = n * 110;
  const out = curve.getSpacedPoints(N).map((p, i) => {
    const t = i / N;
    const end = Math.sqrt(clamp(Math.min(t, 1 - t) / 0.012));
    const w = w0 * (1 + wv * gn(t * 23, seed, seed + 80) + 0.12 * gn(t * 70, 1, seed + 81) + wv * 0.8 * gn(t * 5, 2, seed + 83));
    const wob = 0.014 * gn(t * 31, 3.3, seed + 82) + loose * gn(t * n * 1.7, 7.7, seed + 84);
    return { x: p.x + wob, z: p.z - wob + loose * gn(t * n * 1.9, 1.1, seed + 85), w: Math.max(0.002, w * end) };
  });
  return out;
}
function cajeta(group, ctx, r) {
  const seed = ctx.seed;
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#8E4209', roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06,
  });
  const p1 = cajetaPath(r, seed, 0.5, -0.78, 0.8, 6, 0.048, ctx.prof.sEq, { jx: 0.1, extLo: 0.5, extHi: 1.05, wv: 0.34 });
  group.add(shadow(new THREE.Mesh(conformRibbon(ctx, p1, { hRatio: 0.62, M: 12 }), mat)));
  // chopped toasted pecans
  const pts = scatter(r, 24, 0.17, 0.82, 0);
  r.tilt = 0.9;
  for (const p of pts) {
    const m = pecanMesh(r);
    placeOn(ctx, m, p.x, p.z, m.scale.x * 0.28, r);
    group.add(m);
  }
  // praline crumbs
  const crumbMat = new THREE.MeshPhysicalMaterial({ color: '#C98A45', roughness: 0.55, clearcoat: 0.3 });
  const cg = [0, 1, 2].map((k) => lumpGeometry({ seed: 90 + k, detail: 1, amp: 0.3 }));
  for (let k = 0; k < 70; k++) {
    const a = r() * TAU, d = 0.9 * Math.sqrt(r());
    const m = new THREE.Mesh(r.pick(cg), crumbMat);
    m.scale.setScalar(r.range(0.008, 0.022));
    placeOn(ctx, m, Math.cos(a) * d, Math.sin(a) * d, 0.004, r);
    m.castShadow = true;
    group.add(m);
  }
}
const pecanBit = (r) => pecanMesh(r);
function cajetaPaint(px, pz, s, c, ctx) {
  // caramel veins swirled through the dough
  const seed = ctx.seed;
  const t = Math.sin((px * 0.8 + pz * 0.6) * 6.5 + 3.2 * fbm(px * 1.1, pz * 1.1, seed + 70, 3));
  const v = smoothstep(0.55, 0.95, t) * 0.5;
  const k = hex('#A85E1C');
  c[0] = mix(c[0], k[0], v); c[1] = mix(c[1], k[1], v); c[2] = mix(c[2], k[2], v);
}

// ------------------------------------------------------------------ Fraise Crème
const BERRY = ['#B00E22', '#C9182C', '#8E0A1C', '#D4283C', '#E25468'];
let _berryGeo = null, _berryMat = null;
function berryMesh(r, lo, hi) {
  _berryGeo ??= [0, 1, 2, 3, 4, 5].map((k) => lumpGeometry({ seed: 120 + k, detail: k % 2, amp: 0.45, freq: 1.9, scale: [1, 0.45 + 0.09 * k, 0.8] }));
  _berryMat ??= BERRY.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.8 }));
  const m = new THREE.Mesh(r.pick(_berryGeo), r.pick(_berryMat));
  m.scale.setScalar(r.range(lo, hi));
  return m;
}
function fraise(group, ctx, r) {
  const seed = ctx.seed;
  const cx = 0.02, cz = -0.01, t = 0.145, K = TAU * 1.75, ph = 0.9;
  const radiusFn = (th) => 0.7 * (1 + 0.06 * gn(Math.cos(th) * 1.3, Math.sin(th) * 1.3, seed + 100) + 0.02 * gn(Math.cos(th) * 4, Math.sin(th) * 4, seed + 101) + 0.06 * Math.cos(th - K + ph - 0.6));
  const heightFn = (rho, th) => {
    const base = Math.pow(Math.max(0, 1 - Math.pow(rho, 3.6)), 0.5);
    let u = (th - rho * K + ph) / TAU;
    u -= Math.floor(u);
    let ridge = u < 0.8 ? u / 0.8 : (1 - u) / 0.2; // asymmetric spatula ridge
    ridge = ridge * ridge * (3 - 2 * ridge);
    const win = smoothstep(0.03, 0.3, rho);
    const sw = mix(0.7, 0.36 + 0.7 * ridge, win);
    return t * base * sw + 0.03 * Math.exp(-Math.pow(rho / 0.13, 2)) - 0.01;
  };
  const hi = new THREE.Color('#F7EEE2'), lo = new THREE.Color('#DCC9B2');
  const colorFn = (rho, th, px, pz, h, out) => {
    // fake a little occlusion in the spatula valleys so the swoop reads under soft light
    const k = smoothstep(0.35, 0.95, (h + 0.01) / t) * mix(1, 0.85, smoothstep(0.85, 1, rho));
    out[0] = mix(lo.r, hi.r, k); out[1] = mix(lo.g, hi.g, k); out[2] = mix(lo.b, hi.b, k);
  };
  const g = conformBlob(ctx, { cx, cz, radiusFn, heightFn, colorFn, nR: ctx.q.frostR, nT: ctx.q.frostT, uvScale: 3 });
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.35,
    normalMap: grainNormalMap({ seed: 9, cells: 24, strength: 0.6 }), normalScale: new THREE.Vector2(0.25, 0.25),
  });
  group.add(shadow(new THREE.Mesh(g, mat)));
  const frostAt = (px, pz) => {
    const dx = px - cx, dz = pz - cz, th = Math.atan2(dz, dx), rho = Math.hypot(dx, dz) / radiusFn(th);
    return rho < 0.97 ? heightFn(rho, th) : 0;
  };
  r.tilt = 2.5;
  // crumbs: dense along one crescent of the swoop, sparse elsewhere
  for (let k = 0; k < 230; k++) {
    const a = r() * TAU;
    const crescent = 0.5 + 0.5 * Math.cos(a - 2.3);
    if (r() > 0.25 + 0.75 * crescent) continue;
    const d = 0.66 * Math.pow(r(), 0.6);
    const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
    const big = r() < 0.3;
    const m = big ? berryMesh(r, 0.022, 0.04) : berryMesh(r, 0.007, 0.016);
    placeOn(ctx, m, px, pz, frostAt(px, pz) + m.scale.x * 0.08, r);
    m.castShadow = true;
    group.add(m);
  }
  for (let k = 0; k < 26; k++) {
    const a = r() * TAU, d = r.range(0.72, 0.98);
    const m = berryMesh(r, 0.008, 0.02);
    placeOn(ctx, m, Math.cos(a) * d, Math.sin(a) * d, m.scale.x * 0.3, r);
    m.castShadow = true;
    group.add(m);
  }
}
const berryBit = (r) => berryMesh(r, 0.015, 0.04);

// ------------------------------------------------------------------ shared: instanced sprinkles
function sprinkle(ctx, group, r, { n, geo, mat, size, sMin = 0, sMax = 1, hAt = null, tilt = 2.5, keep = null, lift = 0.2, cast = false }) {
  const im = new THREE.InstancedMesh(geo, mat, n), o = new THREE.Object3D();
  let k = 0;
  r.tilt = tilt;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, s = Math.sqrt(mix(sMin * sMin, sMax * sMax, r()));
    const px = Math.cos(a) * s, pz = Math.sin(a) * s;
    if (keep && !keep(px, pz, s)) continue;
    o.scale.setScalar(r.range(size[0], size[1]));
    o.rotation.set(0, 0, 0);
    placeOn(ctx, o, px, pz, (hAt ? hAt(px, pz) : 0) + o.scale.x * lift, r);
    o.updateMatrix();
    im.setMatrixAt(k++, o.matrix);
  }
  im.count = k;
  im.castShadow = cast; im.receiveShadow = true;
  group.add(im);
  return im;
}
const crystalGeo = () => new THREE.BoxGeometry(1.5, 1.1, 1.25);
const sugarMat = (color = '#ffffff', rough = 0.18) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.1 });
const bitOf = (geoFn, matFn, lo, hi) => (r) => { const m = new THREE.Mesh(geoFn(r), matFn(r)); m.scale.setScalar(r.range(lo, hi)); return m; };

// ------------------------------------------------------------------ Chocolat de Oaxaca
const shardGeo = (k) => lumpGeometry({ seed: 300 + k, detail: 0, amp: 0.32, boxy: 0.55, scale: [1, 0.32, 0.7] });
const shardMat = () => new THREE.MeshPhysicalMaterial({ color: '#4A2414', roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.6, flatShading: true });
function oaxaca(group, ctx, r) {
  const geos = [0, 1, 2, 3, 4].map(shardGeo), mat = shardMat();
  r.tilt = 1.1;
  for (const p of scatter(r, 40, 0.16, 0.9, 0.05)) {
    const m = new THREE.Mesh(r.pick(geos), mat);
    m.scale.setScalar(r.range(0.045, 0.1));
    placeOn(ctx, m, p.x, p.z, m.scale.x * 0.08, r);
    group.add(shadow(m));
  }
  const g = crystalGeo();
  sprinkle(ctx, group, r, { n: 1100, geo: g, mat: sugarMat('#F3E3CC'), size: [0.003, 0.006], sMax: 0.98, keep: (x, z) => fbm(x * 2.2, z * 2.2, ctx.seed + 90, 2) > -0.25 });
  sprinkle(ctx, group, r, { n: 2400, geo: g, mat: new THREE.MeshStandardMaterial({ color: '#B0703A', roughness: 0.8 }), size: [0.003, 0.006], sMax: 0.98, keep: (x, z) => fbm(x * 2.2, z * 2.2, ctx.seed + 90, 2) > -0.3 });
  sprinkle(ctx, group, r, { n: 46, geo: lumpGeometry({ seed: 7, detail: 0, amp: 0.3, boxy: 0.4, scale: [1, 0.18, 0.7] }), mat: new THREE.MeshPhysicalMaterial({ color: '#A8200F', roughness: 0.45, clearcoat: 0.4 }), size: [0.014, 0.032], sMax: 0.9, tilt: 1.2, lift: 0.1 });
}
function oaxacaPaint(px, pz, s, c, ctx) {
  // cinnamon-sugar dusting settles in soft patches
  const d = smoothstep(-0.2, 0.5, fbm(px * 2.2, pz * 2.2, ctx.seed + 90, 2)) * (0.5 + 0.5 * gn(px * 60, pz * 60, ctx.seed + 91)) * 0.32;
  const k = hex('#C89766');
  c[0] = mix(c[0], k[0], d); c[1] = mix(c[1], k[1], d); c[2] = mix(c[2], k[2], d);
}

// ------------------------------------------------------------------ Horchata Sablé
function horchata(group, ctx, r) {
  const g = crystalGeo();
  sprinkle(ctx, group, r, { n: 11000, geo: g, mat: sugarMat('#FFF8EC'), size: [0.003, 0.007], sMax: ctx.prof.sEq * 1.12 });
  sprinkle(ctx, group, r, { n: 6000, geo: g, mat: new THREE.MeshStandardMaterial({ color: '#A8662E', roughness: 0.75 }), size: [0.003, 0.006], sMax: ctx.prof.sEq * 1.12 });
  const glaze = new THREE.MeshPhysicalMaterial({ color: '#FFFCF4', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.86 });
  const p1 = cajetaPath(r, ctx.seed, -0.4, -0.72, 0.74, 5, 0.032, ctx.prof.sEq, { jx: 0.13, extLo: 0.45, extHi: 0.98, wv: 0.4, loose: 0.07 });
  group.add(shadow(new THREE.Mesh(conformRibbon(ctx, p1, { hRatio: 0.5, M: 10, sink: 0.002 }), glaze)));
  const p2 = cajetaPath(r, ctx.seed + 9, 1.3, -0.5, 0.55, 3, 0.024, ctx.prof.sEq, { jx: 0.15, extLo: 0.4, extHi: 0.9, wv: 0.4, loose: 0.08 });
  group.add(shadow(new THREE.Mesh(conformRibbon(ctx, p2, { hRatio: 0.5, M: 10, sink: 0.002 }), glaze)));
}

// ------------------------------------------------------------------ Pan de Muerto
function muerto(group, ctx, r) {
  const seed = ctx.seed;
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#CC8A36', roughness: 0.8, sheen: 0.5, sheenColor: '#ffe2b0', sheenRoughness: 0.7,
    normalMap: grainNormalMap({ seed: 31, cells: 110, strength: 2.6 }), normalScale: new THREE.Vector2(1, 1),
  });
  const bones = [];
  for (const [phi, sgn] of [[0.55, 1], [0.55 + Math.PI / 2, 1]]) {
    const path = [], N = 240, c = Math.cos(phi), sn = Math.sin(phi);
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1, d = u * 0.97 * sgn;
      const knuckle = Math.pow(Math.abs(Math.cos(Math.PI * (Math.abs(u) * 3.1 + 0.5))), 0.7);
      const end = Math.sqrt(clamp((1 - Math.abs(u)) / 0.05));
      const w = (0.085 + 0.055 * knuckle + 0.012 * gn(u * 9, phi, seed + 60)) * end;
      path.push({ x: c * d + 0.012 * gn(u * 4, 1, seed + 61), z: sn * d + 0.012 * gn(u * 4, 2, seed + 62), w: Math.max(0.004, w), hMul: 1.0 + 0.3 * knuckle });
    }
    bones.push(path);
    group.add(shadow(new THREE.Mesh(conformRibbon(ctx, path, { hRatio: 0.82, M: 14, sink: 0.012, uvScale: 5 }), mat)));
  }
  const knobR = 0.23;
  const knob = conformBlob(ctx, { radiusFn: (th) => knobR * (1 + 0.04 * gn(Math.cos(th) * 2, Math.sin(th) * 2, seed + 63)), heightFn: (rho) => 0.2 * Math.sqrt(Math.max(0, 1 - rho * rho)) + 0.05 * (1 - rho) - 0.01, nR: 26, nT: 64, uvScale: 5 });
  group.add(shadow(new THREE.Mesh(knob, mat)));
  // height of the toppings, so sugar sits on top of the bones too
  const hAt = (px, pz) => {
    const s = Math.hypot(px, pz);
    let h = s < knobR ? 0.2 * Math.sqrt(1 - (s / knobR) ** 2) + 0.05 * (1 - s / knobR) : 0;
    for (const [phi] of [[0.55], [0.55 + Math.PI / 2]]) {
      const c = Math.cos(phi), sn = Math.sin(phi), along = px * c + pz * sn, lat = Math.abs(-px * sn + pz * c);
      const u = along / 0.97;
      if (Math.abs(u) >= 1) continue;
      const w = 0.085 + 0.055 * Math.pow(Math.abs(Math.cos(Math.PI * (Math.abs(u) * 3.1 + 0.5))), 0.7);
      if (lat < w) h = Math.max(h, Math.sqrt(1 - (lat / w) ** 2) * w * 0.82 - 0.012);
    }
    return h;
  };
  const g = crystalGeo();
  sprinkle(ctx, group, r, { n: 20000, geo: g, mat: sugarMat('#FFFFFF', 0.22), size: [0.004, 0.009], sMax: ctx.prof.sEq * 1.05, hAt, lift: 0.1, keep: (x, z) => hAt(x, z) < 0.02 || r() < 0.22 });
}

// ------------------------------------------------------------------ Café de Olla Brûlée
function brulee(group, ctx, r) {
  const seed = ctx.seed, vo = {}, t = 0.03;
  const radiusFn = (th) => 0.74 * (1 + 0.05 * gn(Math.cos(th) * 1.5, Math.sin(th) * 1.5, seed + 60) + 0.02 * gn(Math.cos(th) * 6, Math.sin(th) * 6, seed + 61));
  const crackAt = (px, pz) => {
    voronoi(px * 3.4 + 0.5 * gn(px * 2, pz * 2, seed + 62), pz * 3.4 + 0.5 * gn(px * 2 + 5, pz * 2, seed + 63), seed + 64, vo);
    return [vo.f2 - vo.f1, vo.id];
  };
  const heightFn = (rho, th, px, pz) => {
    const [d, id] = crackAt(px, pz);
    const g = smoothstep(0.008, 0.028, d);
    const e = 1 - smoothstep(0.9, 1, rho);
    return -0.012 + (t + 0.012 + 0.012 * (id - 0.5)) * Math.min(g, e);
  };
  const amber = new THREE.Color('#B4610E'), burnt = new THREE.Color('#4A1B03'), pale = new THREE.Color('#D4922A'), c = new THREE.Color();
  const colorFn = (rho, th, px, pz, h, out) => {
    const b = smoothstep(0.0, 0.7, fbm(px * 2.6, pz * 2.6, seed + 65, 3) + 0.3 * gn(px * 9, pz * 9, seed + 66));
    c.copy(amber).lerp(burnt, b * 0.85).lerp(pale, smoothstep(0.3, 0.8, -fbm(px * 3.1 + 4, pz * 3.1, seed + 67, 2)) * 0.5);
    out[0] = c.r; out[1] = c.g; out[2] = c.b;
  };
  const g = conformBlob(ctx, { radiusFn, heightFn, colorFn, nR: ctx.q.crustR, nT: ctx.q.crustT });
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, emissive: '#5a2500', emissiveIntensity: 0.06 });
  group.add(shadow(new THREE.Mesh(g, mat)));
  // cinnamon stick (a double quill)
  const bark = new THREE.MeshStandardMaterial({ color: '#8A4A20', roughness: 0.85, side: THREE.DoubleSide, normalMap: grainNormalMap({ seed: 41, cells: 40, strength: 1.6 }), normalScale: new THREE.Vector2(0.8, 0.8) });
  const stick = new THREE.Group();
  for (const s of [-1, 1]) {
    const q = new THREE.CylinderGeometry(0.036, 0.036, 0.62, 22, 1, true, 0, Math.PI * 1.75);
    q.rotateY(s > 0 ? 1.2 : -2.2); q.rotateZ(Math.PI / 2);
    const m = shadow(new THREE.Mesh(q, bark));
    m.position.set(0, 0.036, s * 0.034);
    stick.add(m);
  }
  placeOn(ctx, stick, 0.1, 0.06, t + 0.004);
  stick.rotateY(0.7);
  group.add(stick);
  sprinkle(ctx, group, r, { n: 500, geo: crystalGeo(), mat: new THREE.MeshStandardMaterial({ color: '#7A3F1A', roughness: 0.8 }), size: [0.004, 0.009], sMin: 0.72, sMax: 1.0 });
}

// ------------------------------------------------------------------ Mangonada
const mangoGeo = (k = 0) => lumpGeometry({ seed: 400 + k, detail: 2, amp: 0.06, boxy: 0.82, flat: false });
const mangoMat = () => new THREE.MeshPhysicalMaterial({ color: '#FFAE14', roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: '#ffe08a' });
function mangonada(group, ctx, r) {
  const seed = ctx.seed, t = 0.05;
  const radiusFn = (th) => 0.5 * (1 + 0.2 * gn(Math.cos(th) * 1.4, Math.sin(th) * 1.4, seed + 60) + 0.09 * gn(Math.cos(th) * 4, Math.sin(th) * 4, seed + 61) + 0.04 * gn(Math.cos(th) * 9, Math.sin(th) * 9, seed + 62));
  const heightFn = (rho) => t * Math.pow(Math.max(0, 1 - Math.pow(rho, 2.8)), 0.6) - 0.008;
  const g = conformBlob(ctx, { cx: 0.02, cz: 0.02, radiusFn, heightFn, nR: 60, nT: 220, rhoPow: 0.8 });
  const chamoy = new THREE.MeshPhysicalMaterial({ color: '#7C0D0B', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, emissive: '#3a0000', emissiveIntensity: 0.1 });
  group.add(shadow(new THREE.Mesh(g, chamoy)));
  // a few drips running out toward the rim
  for (let k = 0; k < 0; k++) {
    const a = r() * TAU, path = [];
    for (let i = 0; i <= 60; i++) { const u = i / 60, d = 0.3 + u * r.range(0.32, 0.42); path.push({ x: Math.cos(a + 0.25 * u * (k % 2 ? 1 : -1)) * d + 0.02, z: Math.sin(a + 0.25 * u * (k % 2 ? 1 : -1)) * d + 0.02, w: 0.03 * (1 - 0.55 * u) * (u > 0.93 ? Math.sqrt((1 - u) / 0.07) * 1.3 : 1) + 0.002 }); }
    group.add(shadow(new THREE.Mesh(conformRibbon(ctx, path, { hRatio: 0.6, M: 10 }), chamoy)));
  }
  const cg = crystalGeo();
  const ring = (x, z, s) => s > 0.66 + 0.06 * gn(x * 3, z * 3, seed + 70);
  sprinkle(ctx, group, r, { n: 12000, geo: cg, mat: sugarMat('#D2301A', 0.3), size: [0.004, 0.008], sMin: 0.6, sMax: ctx.prof.sEq * 1.06, keep: ring });
  sprinkle(ctx, group, r, { n: 3500, geo: cg, mat: sugarMat('#FFF2D8', 0.2), size: [0.004, 0.007], sMin: 0.6, sMax: ctx.prof.sEq * 1.06, keep: ring });
  sprinkle(ctx, group, r, { n: 900, geo: cg, mat: new THREE.MeshStandardMaterial({ color: '#8FBF4A', roughness: 0.6 }), size: [0.004, 0.007], sMin: 0.6, sMax: ctx.prof.sEq * 1.04, keep: ring });
  const mm = mangoMat();
  r.tilt = 0.7;
  for (const p of scatter(r, 8, 0.16, 0.5, 0.1)) {
    const m = new THREE.Mesh(mangoGeo(Math.floor(r() * 3)), mm);
    m.scale.setScalar(r.range(0.055, 0.075));
    const rho = Math.hypot(p.x - 0.02, p.z - 0.02) / radiusFn(Math.atan2(p.z - 0.02, p.x - 0.02));
    placeOn(ctx, m, p.x, p.z, (rho < 1 ? heightFn(rho) : 0) + m.scale.x * 0.55, r);
    group.add(shadow(m));
  }
}
function mangonadaPaint(px, pz, s, c, ctx) {
  const k = hex('#C9381C');
  const v = smoothstep(0.62, 0.8, s + 0.06 * gn(px * 3, pz * 3, ctx.seed + 70)) * (1 - smoothstep(1.12, 1.3, s)) * 0.55;
  c[0] = mix(c[0], k[0], v); c[1] = mix(c[1], k[1], v); c[2] = mix(c[2], k[2], v);
}

// ------------------------------------------------------------------ Mazapán Rosé
let _petalGeo = null;
function petalGeo() {
  if (_petalGeo) return _petalGeo;
  _petalGeo = [0, 1, 2, 3].map((k) => {
    const g = lumpGeometry({ seed: 500 + k, detail: 3, amp: 0.1, flat: false, scale: [1, 0.07, 0.72] });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, p.getY(i) + (0.32 + 0.12 * k) * x * x + 0.25 * z * z * (k % 2 ? 1 : -0.6) + 0.06 * gn(x * 4, z * 4, 510 + k));
    }
    g.computeVertexNormals();
    return g;
  });
  return _petalGeo;
}
const PETAL = ['#C2456A', '#D4648A', '#B03458', '#E08AA6'];
const petalMat = (r) => new THREE.MeshPhysicalMaterial({ color: r.pick(PETAL), roughness: 0.6, sheen: 0.8, sheenColor: '#ffc4d6', sheenRoughness: 0.5, side: THREE.DoubleSide });
function mazapan(group, ctx, r) {
  const seed = ctx.seed, t = 0.075;
  const radiusFn = (th) => 0.66 * (1 + 0.1 * gn(Math.cos(th) * 1.6, Math.sin(th) * 1.6, seed + 60) + 0.06 * gn(Math.cos(th) * 5, Math.sin(th) * 5, seed + 61));
  const moundH = (rho, px, pz) => t * Math.pow(Math.max(0, 1 - rho * rho), 0.7) * (0.75 + 0.5 * (0.5 + 0.5 * fbm(px * 7, pz * 7, seed + 62, 3))) + 0.012 * gn(px * 22, pz * 22, seed + 63) * (1 - rho) - 0.006;
  const g = conformBlob(ctx, { radiusFn, heightFn: (rho, th, px, pz) => moundH(rho, px, pz), nR: 90, nT: 300, uvScale: 6 });
  const sand = new THREE.MeshStandardMaterial({ color: '#E2C493', roughness: 0.95, normalMap: grainNormalMap({ seed: 51, cells: 120, strength: 3 }), normalScale: new THREE.Vector2(1.2, 1.2) });
  group.add(shadow(new THREE.Mesh(g, sand)));
  const hAt = (px, pz) => { const rho = Math.hypot(px, pz) / radiusFn(Math.atan2(pz, px)); return rho < 1 ? moundH(rho, px, pz) : 0; };
  const crumbG = lumpGeometry({ seed: 520, detail: 1, amp: 0.35, flat: false });
  sprinkle(ctx, group, r, { n: 620, geo: crumbG, mat: new THREE.MeshStandardMaterial({ color: '#E6CB9C', roughness: 0.95 }), size: [0.012, 0.04], sMax: 0.62, hAt, lift: 0.3, cast: true });
  sprinkle(ctx, group, r, { n: 500, geo: crumbG, mat: new THREE.MeshStandardMaterial({ color: '#D7B57E', roughness: 0.95 }), size: [0.008, 0.026], sMax: 0.86, hAt, lift: 0.3, cast: true });
  // powdered sugar
  sprinkle(ctx, group, r, { n: 5000, geo: crystalGeo(), mat: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), size: [0.002, 0.005], sMax: 1.0, hAt, keep: (x, z) => fbm(x * 1.8 + 3, z * 1.8, seed + 71, 2) > -0.2 });
  const geos = petalGeo();
  r.tilt = 1.0;
  for (const p of scatter(r, 13, 0.2, 0.74, 0.0)) {
    const m = new THREE.Mesh(r.pick(geos), petalMat(r));
    m.scale.setScalar(r.range(0.085, 0.13));
    placeOn(ctx, m, p.x, p.z, hAt(p.x, p.z) + 0.03 + m.scale.x * 0.25, r);
    group.add(shadow(m));
  }
}
function mazapanPaint(px, pz, s, c, ctx) {
  const d = smoothstep(-0.25, 0.5, fbm(px * 1.8 + 3, pz * 1.8, ctx.seed + 71, 2)) * (0.45 + 0.55 * (0.5 + 0.5 * gn(px * 50, pz * 50, ctx.seed + 72))) * 0.55 * (1 - smoothstep(0.9, 1.2, s));
  c[0] = mix(c[0], 1, d); c[1] = mix(c[1], 0.98, d); c[2] = mix(c[2], 0.96, d);
}

// ------------------------------------------------------------------ table
export const FLAVORS = {
  'le-classique': {
    name: 'Le Classique', seed: 11, bg: BRAND.beurre,
    shape: { T: 0.5, n: 2.5, yEq: 0.17, rb: 0.9 },
    edgeAmp: 0.034, lumpAmp: 0.03, crackDepth: 0.075, crackScale: 1.9, crackWarp: 0.65, crackThresh: 0.55, crackWidth: 0.24, cragAmp: 0.009,
    dough: '#C98B3F', edge: '#8A4A14', deep: '#633209', crackColor: '#E2B56C',
    brownStart: 0.5, brownEnd: 1.02, brownAmt: 0.95, blotAmt: 0.3, baseAmt: 0.85, crackTint: 0.85,
    speckAmt: 0.1, speckColor: '#5a3312', pitDepth: 0.006, rough: 0.84, normalStrength: 2.6,
    sheenColor: '#ffd9a0', toppings: classique, bit: saltBit,
  },
  'concha-rosa': {
    name: 'Concha Rosa', seed: 23, bg: BRAND.pistache,
    shape: { T: 0.5, n: 2.3, yEq: 0.17, rb: 0.9 },
    edgeAmp: 0.022, lumpAmp: 0.016, crackDepth: 0.03, crackScale: 2.8, crackWarp: 0.5, crackThresh: 0.62, crackWidth: 0.16, cragAmp: 0.005,
    dough: '#E3BC72', edge: '#B97B2E', deep: '#93591B', crackColor: '#F0D79E',
    brownStart: 0.72, brownEnd: 1.08, brownAmt: 0.8, blotAmt: 0.1, baseAmt: 0.8, crackTint: 0.7,
    speckAmt: 0.05, speckColor: '#8a5a22', pitDepth: 0.004, rough: 0.86, normalStrength: 2.2,
    sheenColor: '#fff0c8', toppings: concha, bit: sugarBit,
  },
  'cajeta-praline': {
    name: 'Cajeta Praliné', seed: 37, bg: BRAND.creme,
    shape: { T: 0.48, n: 2.5, yEq: 0.16, rb: 0.9 },
    edgeAmp: 0.036, lumpAmp: 0.03, crackDepth: 0.065, crackScale: 2.0, crackWarp: 0.7, crackThresh: 0.6, crackWidth: 0.22, cragAmp: 0.009,
    dough: '#BC7A2C', edge: '#7E420F', deep: '#5A2C08', crackColor: '#D9A050',
    brownStart: 0.5, brownEnd: 1.0, brownAmt: 0.95, blotAmt: 0.35, baseAmt: 0.85, crackTint: 0.8,
    speckAmt: 0.12, speckColor: '#4a280e', pitDepth: 0.006, rough: 0.8, normalStrength: 2.6,
    sheenColor: '#ffc880', toppings: cajeta, bit: pecanBit, paint: cajetaPaint,
  },
  'fraise-creme': {
    name: 'Fraise Crème', seed: 51, bg: BRAND.tomate,
    shape: { T: 0.5, n: 2.4, yEq: 0.17, rb: 0.9 },
    edgeAmp: 0.026, lumpAmp: 0.022, crackDepth: 0.06, crackScale: 2.0, crackWarp: 0.6, crackThresh: 0.66, crackWidth: 0.2, cragAmp: 0.007,
    dough: '#E58496', edge: '#C4685C', deep: '#A2513F', crackColor: '#F2B4BE',
    brownStart: 0.6, brownEnd: 1.05, brownAmt: 0.85, blotAmt: 0.12, baseAmt: 0.8, crackTint: 0.8,
    speckAmt: 0.22, speckColor: '#C22B41', pitDepth: 0.005, rough: 0.86, normalStrength: 2.4,
    sheenColor: '#ffd0d8', toppings: fraise, bit: berryBit,
  },  'chocolat-de-oaxaca': {
    name: 'Chocolat de Oaxaca', seed: 67, bg: BRAND.beurre,
    shape: { T: 0.52, n: 2.4, yEq: 0.17, rb: 0.9 },
    edgeAmp: 0.032, lumpAmp: 0.03, crackDepth: 0.085, crackScale: 2.3, crackWarp: 0.7, crackThresh: 0.4, crackWidth: 0.3, cragAmp: 0.01,
    dough: '#24120B', edge: '#180A06', deep: '#100603', crackColor: '#55301F', glow: 0.025, sheenAmt: 0.3,
    brownStart: 0.55, brownEnd: 1.05, brownAmt: 0.8, blotAmt: 0.25, baseAmt: 0.8, crackTint: 0.85,
    speckAmt: 0.08, speckColor: '#1c0c06', pitDepth: 0.006, rough: 0.74, normalStrength: 2.8,
    sheenColor: '#b98a6a', toppings: oaxaca, paint: oaxacaPaint, bit: bitOf((r) => shardGeo(Math.floor(r() * 5)), shardMat, 0.03, 0.06),
  },
  'horchata-sable': {
    name: 'Horchata Sablé', seed: 73, bg: BRAND.cacao,
    shape: { T: 0.44, n: 3.0, yEq: 0.16, rb: 0.92 },
    edgeAmp: 0.018, lumpAmp: 0.014, crackDepth: 0.03, crackScale: 2.2, crackWarp: 0.5, crackThresh: 0.7, crackWidth: 0.14, cragAmp: 0.006,
    dough: '#E4C795', edge: '#C99A5C', deep: '#A6763C', crackColor: '#F3E2BE',
    brownStart: 0.7, brownEnd: 1.1, brownAmt: 0.7, blotAmt: 0.3, baseAmt: 0.8, crackTint: 0.7,
    speckAmt: 0.5, speckColor: '#8A4B1E', pitDepth: 0.004, rough: 0.88, normalStrength: 2.4,
    sheenColor: '#fff0d0', toppings: horchata, bit: bitOf(() => crystalGeo(), () => sugarMat('#FFF8EC'), 0.01, 0.02),
  },
  'pan-de-muerto': {
    name: 'Pan de Muerto', seed: 79, bg: BRAND.tomate,
    shape: { T: 0.58, n: 2.05, yEq: 0.17, rb: 0.9 },
    edgeAmp: 0.02, lumpAmp: 0.014, crackDepth: 0.0, crackScale: 2, crackWarp: 0.5, crackThresh: 0.9, crackWidth: 0.1, cragAmp: 0.005,
    dough: '#DDA452', edge: '#B8762A', deep: '#935718', crackColor: '#EBC27C',
    brownStart: 0.6, brownEnd: 1.08, brownAmt: 0.85, blotAmt: 0.25, baseAmt: 0.8, crackTint: 0.7,
    speckAmt: 0.03, speckColor: '#8a5a22', pitDepth: 0.004, rough: 0.82, normalStrength: 2.2,
    sheenColor: '#ffe2b0', toppings: muerto, bit: bitOf(() => crystalGeo(), () => sugarMat('#FFFFFF', 0.22), 0.012, 0.024),
  },
  'cafe-de-olla-brulee': {
    name: 'Café de Olla Brûlée', seed: 83, bg: BRAND.pistache,
    shape: { T: 0.5, n: 2.6, yEq: 0.17, rb: 0.9 },
    edgeAmp: 0.03, lumpAmp: 0.024, crackDepth: 0.06, crackScale: 2.1, crackWarp: 0.6, crackThresh: 0.6, crackWidth: 0.2, cragAmp: 0.009,
    dough: '#9A6238', edge: '#6A3B1A', deep: '#4A260E', crackColor: '#BE8A56',
    brownStart: 0.55, brownEnd: 1.02, brownAmt: 0.9, blotAmt: 0.3, baseAmt: 0.85, crackTint: 0.8,
    speckAmt: 0.25, speckColor: '#2e1608', pitDepth: 0.006, rough: 0.82, normalStrength: 2.6,
    sheenColor: '#e0b088', toppings: brulee, bit: bitOf(() => crystalGeo(), () => new THREE.MeshStandardMaterial({ color: '#8A4A20', roughness: 0.85 }), 0.014, 0.03),
  },
  mangonada: {
    name: 'Mangonada', seed: 89, bg: BRAND.creme,
    shape: { T: 0.5, n: 2.5, yEq: 0.17, rb: 0.9 },
    edgeAmp: 0.026, lumpAmp: 0.022, crackDepth: 0.045, crackScale: 2.2, crackWarp: 0.6, crackThresh: 0.66, crackWidth: 0.18, cragAmp: 0.007,
    dough: '#F2A61C', edge: '#D97F12', deep: '#B0600C', crackColor: '#FFCB52',
    brownStart: 0.62, brownEnd: 1.06, brownAmt: 0.8, blotAmt: 0.15, baseAmt: 0.8, crackTint: 0.8,
    speckAmt: 0.06, speckColor: '#C9381C', pitDepth: 0.005, rough: 0.84, normalStrength: 2.4,
    sheenColor: '#ffe08a', toppings: mangonada, paint: mangonadaPaint, bit: bitOf((r) => mangoGeo(Math.floor(r() * 3)), mangoMat, 0.03, 0.05),
  },
  'mazapan-rose': {
    name: 'Mazapán Rosé', seed: 97, bg: BRAND.cacao,
    shape: { T: 0.48, n: 2.6, yEq: 0.17, rb: 0.9 },
    edgeAmp: 0.024, lumpAmp: 0.02, crackDepth: 0.04, crackScale: 2.1, crackWarp: 0.6, crackThresh: 0.66, crackWidth: 0.17, cragAmp: 0.006,
    dough: '#EDBFB4', edge: '#D69C82', deep: '#B67A5A', crackColor: '#F8DAD2',
    brownStart: 0.62, brownEnd: 1.06, brownAmt: 0.8, blotAmt: 0.12, baseAmt: 0.8, crackTint: 0.75,
    speckAmt: 0.05, speckColor: '#C2456A', pitDepth: 0.005, rough: 0.88, normalStrength: 2.3,
    sheenColor: '#ffd8d0', toppings: mazapan, paint: mazapanPaint, bit: bitOf((r) => r.pick(petalGeo()), petalMat, 0.05, 0.08),
  },
};
export const SLUGS = Object.keys(FLAVORS);
export const LINEUP = { classic: SLUGS.slice(0, 6), rotating: SLUGS.slice(6) };
export { rng };
