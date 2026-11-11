// Procedural KUKI cookie: profile -> displaced mesh + canvas-generated PBR maps.
//
// Everything lives in an "unrolled" 2D space p = dir(theta) * s, where s is arc
// length along the cookie's cross-section profile (top centre -> shoulder ->
// side -> bottom edge). Geometry, textures and toppings all sample the same
// functions of p, so cracks in the mesh line up with cracks in the colour map
// and toppings sit exactly on the surface.

import * as THREE from 'three';
import { gn, fbm, voronoi, clamp, smoothstep, mix } from './noise.js';

const hex = (h) => {
  const c = new THREE.Color(h); // linear working space
  const s = c.clone().convertLinearToSRGB();
  return [s.r, s.g, s.b]; // keep sRGB triplet for canvas painting
};

// ---------------------------------------------------------------- profile
export function buildProfile({ R = 1, T = 0.46, yEq = 0.15, n = 2.6, rb = 0.9 } = {}) {
  const pts = [];
  const M = 600;
  for (let i = 0; i <= M; i++) {
    const phi = (i / M) * Math.PI * 0.5;
    pts.push([R * Math.pow(Math.sin(phi), 2 / n), yEq + (T - yEq) * Math.pow(Math.cos(phi), 2 / n)]);
  }
  const K = 80;
  for (let i = 1; i <= K; i++) {
    const phi = (i / K) * Math.PI * 0.5;
    pts.push([rb + (R - rb) * Math.cos(phi), yEq * (1 - Math.sin(phi))]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const sEnd = cum[cum.length - 1];
  const sEq = cum[M];
  const N = 2048;
  const tr = new Float32Array(N + 1), ty = new Float32Array(N + 1);
  let k = 0;
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * sEnd;
    while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const t = (s - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    tr[i] = mix(pts[k][0], pts[k + 1][0], t);
    ty[i] = mix(pts[k][1], pts[k + 1][1], t);
  }
  const nrT = new Float32Array(N + 1), nyT = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const a = Math.max(0, i - 3), b = Math.min(N, i + 3);
    let dr = tr[b] - tr[a], dy = ty[b] - ty[a];
    const l = Math.hypot(dr, dy) || 1;
    dr /= l; dy /= l;
    nrT[i] = -dy; nyT[i] = dr;
  }
  nrT[0] = 0; nyT[0] = 1;
  const o = { r: 0, y: 0, nr: 0, ny: 1 };
  function sample(s) {
    const f = clamp(s / sEnd) * N;
    const i = Math.min(N - 1, Math.floor(f)), t = f - i;
    o.r = mix(tr[i], tr[i + 1], t);
    o.y = mix(ty[i], ty[i + 1], t);
    o.nr = mix(nrT[i], nrT[i + 1], t);
    o.ny = mix(nyT[i], nyT[i + 1], t);
    return o;
  }
  return { sample, sEq, sEnd, R, T };
}

// ---------------------------------------------------------------- field
export function makeField(F) {
  const prof = buildProfile(F.shape);
  const seed = F.seed;
  const vo = { f1: 0, f2: 0, id: 0 };
  const S = prof.sEnd * 1.03; // half extent of texture space

  const edge = (c, s) =>
    1 + F.edgeAmp * (gn(c * 1.15 + 3.1, s * 1.15 - 1.7, seed + 40) + 0.4 * gn(c * 3.3, s * 3.3, seed + 41) + 0.12 * gn(c * 9, s * 9, seed + 42));

  function crack(px, pz) {
    if (F.crackDepth <= 0) return 0;
    const s = Math.hypot(px, pz);
    let mask = smoothstep(F.crackThresh - 0.2, F.crackThresh + 0.2, 0.5 + 0.5 * fbm(px * 1.3 + 9.2, pz * 1.3 - 4.1, seed + 8, 2));
    mask *= 1 - smoothstep(prof.sEq * 0.93, prof.sEq * 1.1, s);
    if (mask < 0.004) return 0;
    const wx = px * F.crackScale + F.crackWarp * fbm(px * 2.1 + 11, pz * 2.1, seed + 5, 3);
    const wz = pz * F.crackScale + F.crackWarp * fbm(px * 2.1, pz * 2.1 + 7, seed + 6, 3);
    voronoi(wx, wz, seed + 7, vo);
    const d = vo.f2 - vo.f1;
    const w = F.crackWidth * (0.35 + 0.65 * mask);
    const t = 1 - smoothstep(0, w, d);
    return Math.pow(t, 1.4) * mask;
  }

  function H(px, pz, withCracks = true) {
    let h = F.lumpAmp * fbm(px * 1.5, pz * 1.5, seed + 1, 3) + F.lumpAmp * 0.4 * fbm(px * 4.2, pz * 4.2, seed + 2, 2);
    h += (withCracks ? 1 : 0.2) * (F.cragAmp || 0) * (fbm(px * 7.5, pz * 7.5, seed + 3, 3) + 0.5 * gn(px * 19, pz * 19, seed + 4));
    if (withCracks) h -= F.crackDepth * crack(px, pz);
    return h;
  }

  // world position on the cookie surface (+h along the smooth normal)
  function surf(px, pz, h, withCracks, out) {
    const s = Math.hypot(px, pz);
    const c = s > 1e-9 ? px / s : 1, sn = s > 1e-9 ? pz / s : 0;
    const P = prof.sample(s);
    const fade = 1 - smoothstep(prof.sEq + 0.45 * (prof.sEnd - prof.sEq), prof.sEnd, s);
    const d = H(px, pz, withCracks) * fade + h;
    const r = P.r * mix(1, edge(c, sn), smoothstep(0, 0.5, s)) + P.nr * d;
    out.set(r * c, Math.max(0, P.y + P.ny * d), r * sn);
    return out;
  }
  function normal(px, pz, out) {
    const s = Math.hypot(px, pz);
    const c = s > 1e-9 ? px / s : 1, sn = s > 1e-9 ? pz / s : 0;
    const P = prof.sample(s);
    out.set(P.nr * c, P.ny, P.nr * sn).normalize();
    return out;
  }
  return { F, prof, seed, S, crack, H, surf, normal, edge };
}

// ---------------------------------------------------------------- geometry
export function cookieGeometry(ctx, q) {
  const NR = q.rings, NT = q.segs;
  const { prof, S } = ctx;
  const nv = 1 + NR * NT + 1;
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const v = new THREE.Vector3();
  ctx.surf(0, 0, 0, true, v);
  pos.set([v.x, v.y, v.z], 0);
  uv.set([0.5, 0.5], 0);
  let k = 1;
  for (let i = 1; i <= NR; i++) {
    const s = (i / NR) * prof.sEnd;
    for (let j = 0; j < NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      const px = Math.cos(th) * s, pz = Math.sin(th) * s;
      ctx.surf(px, pz, 0, true, v);
      pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
      uv[k * 2] = px / (2 * S) + 0.5;
      uv[k * 2 + 1] = 0.5 - pz / (2 * S);
      k++;
    }
  }
  // bottom centre
  pos.set([0, 0, 0], k * 3);
  uv.set([0.5, 0.5], k * 2);
  const bottom = k;
  const idx = new Uint32Array((NT + (NR - 1) * NT * 2 + NT) * 3);
  let t = 0;
  const id = (i, j) => 1 + (i - 1) * NT + (j % NT);
  for (let j = 0; j < NT; j++) { idx[t++] = 0; idx[t++] = id(1, j + 1); idx[t++] = id(1, j); }
  for (let i = 1; i < NR; i++) {
    for (let j = 0; j < NT; j++) {
      const a = id(i, j), b = id(i, j + 1), c = id(i + 1, j), d = id(i + 1, j + 1);
      idx[t++] = a; idx[t++] = b; idx[t++] = c;
      idx[t++] = b; idx[t++] = d; idx[t++] = c;
    }
  }
  for (let j = 0; j < NT; j++) { idx[t++] = bottom; idx[t++] = id(NR, j); idx[t++] = id(NR, j + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- textures
export function cookieTextures(ctx, q) {
  const N = q.tex;
  const { F, prof, seed, S } = ctx;
  const dough = hex(F.dough), brown = hex(F.edge), crackC = hex(F.crackColor), speck = hex(F.speckColor || '#3b2418');
  const deep = hex(F.deep || F.edge);
  const hf = new Float32Array(N * N);
  const col = new ImageData(N, N), rgh = new ImageData(N, N), nrm = new ImageData(N, N);
  const vo = { f1: 0, f2: 0, id: 0 };
  const extra = F.paint || null;
  const tmp = [0, 0, 0];
  for (let j = 0; j < N; j++) {
    const pz = ((j + 0.5) / N * 2 - 1) * S;
    for (let i = 0; i < N; i++) {
      const px = ((i + 0.5) / N * 2 - 1) * S;
      const s = Math.hypot(px, pz);
      const o = (j * N + i) * 4;
      const c = crack(ctx, px, pz);
      const lump = fbm(px * 1.5, pz * 1.5, seed + 1, 3);
      // --- browning: ring toward the shoulder + blotches on high spots
      const sr = s / prof.sEq;
      let b = smoothstep(F.brownStart, F.brownEnd, sr + 0.1 * fbm(px * 2.6, pz * 2.6, seed + 21, 3));
      const blot = smoothstep(0.0, 0.7, fbm(px * 2.3 + 5, pz * 2.3, seed + 20, 3) + 0.5 * lump);
      b = clamp(b * F.brownAmt + blot * F.blotAmt);
      let r = mix(dough[0], brown[0], b), g = mix(dough[1], brown[1], b), bl = mix(dough[2], brown[2], b);
      // darker base where the cookie touched the tray
      const base = smoothstep(prof.sEq + 0.25 * (prof.sEnd - prof.sEq), prof.sEnd, s) * F.baseAmt;
      r = mix(r, deep[0], base); g = mix(g, deep[1], base); bl = mix(bl, deep[2], base);
      if (extra) { tmp[0] = r; tmp[1] = g; tmp[2] = bl; extra(px, pz, s, tmp, ctx); r = tmp[0]; g = tmp[1]; bl = tmp[2]; }
      // mottling
      const m = 1 + 0.07 * fbm(px * 8, pz * 8, seed + 22, 2) + 0.05 * gn(px * 31, pz * 31, seed + 23);
      r *= m; g *= m; bl *= m;
      // pale, moist interior showing through the cracks
      const ck = smoothstep(0.0, 0.45, c) * F.crackTint;
      r = mix(r, crackC[0], ck); g = mix(g, crackC[1], ck); bl = mix(bl, crackC[2], ck);
      const core = 1 - 0.3 * smoothstep(0.55, 1, c);
      const crag = 1 + 0.1 * fbm(px * 7.5, pz * 7.5, seed + 3, 3);
      r *= core * crag; g *= Math.pow(core, 1.25) * crag; bl *= Math.pow(core, 1.5) * crag;
      // specks
      voronoi(px * 34, pz * 34, seed + 30, vo);
      let sp = 0;
      if (vo.id < F.speckAmt) sp = 1 - smoothstep(0.05, 0.16 + 0.1 * vo.id, vo.f1);
      r = mix(r, speck[0], sp * 0.8); g = mix(g, speck[1], sp * 0.8); bl = mix(bl, speck[2], sp * 0.8);
      col.data[o] = clamp(r) * 255; col.data[o + 1] = clamp(g) * 255; col.data[o + 2] = clamp(bl) * 255; col.data[o + 3] = 255;
      // --- fine height for the normal map (world units)
      voronoi(px * 21 + 3.3, pz * 21, seed + 31, vo);
      const pit = vo.id > 0.45 ? (1 - smoothstep(0.0, 0.2 + 0.25 * vo.id, vo.f1)) : 0;
      let h = 0.0045 * fbm(px * 13, pz * 13, seed + 32, 3) + 0.0022 * gn(px * 46, pz * 46, seed + 33) + 0.0012 * gn(px * 95, pz * 95, seed + 34);
      h -= pit * F.pitDepth;
      h -= c * 0.012;
      h += sp * 0.002;
      hf[j * N + i] = h;
      const ro = clamp(F.rough - 0.22 * c + 0.06 * fbm(px * 6, pz * 6, seed + 35, 2) - pit * 0.1);
      rgh.data[o] = 255; rgh.data[o + 1] = ro * 255; rgh.data[o + 2] = 0; rgh.data[o + 3] = 255;
    }
  }
  const dx = (2 * S) / N;
  const k = F.normalStrength / (2 * dx);
  for (let j = 0; j < N; j++) {
    const j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
      const dhx = (hf[j * N + i1] - hf[j * N + i0]) * k;
      const dhz = (hf[j1 * N + i] - hf[j0 * N + i]) * k;
      let nx = -dhx, ny = dhz, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const o = (j * N + i) * 4;
      nrm.data[o] = (nx * 0.5 + 0.5) * 255; nrm.data[o + 1] = (ny * 0.5 + 0.5) * 255; nrm.data[o + 2] = (nz * 0.5 + 0.5) * 255; nrm.data[o + 3] = 255;
    }
  }
  const mk = (img, srgb) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    cv.getContext('2d').putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { map: mk(col, true), roughnessMap: mk(rgh, false), normalMap: mk(nrm, false) };
}
function crack(ctx, px, pz) { return ctx.crack(px, pz); }

// A tiling grain normal map (sugar, frosting, paper...). `spec` controls scale.
export function grainNormalMap({ size = 512, seed = 1, cells = 64, strength = 1.2, pits = 0 } = {}) {
  const N = size;
  const h = new Float32Array(N * N);
  const P = cells;
  const hsh = (x, y, s) => {
    let v = (Math.imul(((x % P) + P) % P, 374761393) + Math.imul(((y % P) + P) % P, 668265263) + Math.imul(s, 2147483647)) | 0;
    v = Math.imul(v ^ (v >>> 13), 1274126177); v ^= v >>> 16;
    return (v >>> 0) / 4294967296;
  };
  const vn = (x, y, s, per) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const w = (a, b) => hsh(((a % per) + per) % per, ((b % per) + per) % per, s + per);
    const a = w(ix, iy), b = w(ix + 1, iy), c = w(ix, iy + 1), d = w(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N), y = (j / N);
    let v = vn(x * P, y * P, seed, P) + 0.5 * vn(x * P * 2, y * P * 2, seed + 1, P * 2) + 0.25 * vn(x * P * 4, y * P * 4, seed + 2, P * 4);
    if (pits) { const p = vn(x * P * 0.5, y * P * 0.5, seed + 3, P / 2); v -= pits * smoothstep(0.7, 0.9, p); }
    h[j * N + i] = v;
  }
  const img = new ImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N, i0 = (i + N - 1) % N, j1 = (j + 1) % N, j0 = (j + N - 1) % N;
    let nx = -(h[j * N + i1] - h[j * N + i0]) * strength, ny = (h[j1 * N + i] - h[j0 * N + i]) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const o = (j * N + i) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  cv.getContext('2d').putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- conforming helpers
// A polar patch that hugs the cookie surface: vertex = surface(p) + normal * height.
export function conformBlob(ctx, { cx = 0, cz = 0, radiusFn, heightFn, nR = 24, nT = 64, uvScale = 1, rhoPow = 1, colorFn = null }) {
  const nv = 1 + nR * nT;
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const colr = colorFn ? new Float32Array(nv * 3) : null;
  const v = new THREE.Vector3();
  const cc = [1, 1, 1];
  const put = (k, px, pz, rho, th) => {
    const h = heightFn(rho, th, px, pz);
    ctx.surf(px, pz, h, false, v);
    pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
    uv[k * 2] = px * uvScale; uv[k * 2 + 1] = pz * uvScale;
    if (colr) { colorFn(rho, th, px, pz, h, cc); colr[k * 3] = cc[0]; colr[k * 3 + 1] = cc[1]; colr[k * 3 + 2] = cc[2]; }
  };
  put(0, cx, cz, 0, 0);
  let k = 1;
  for (let i = 1; i <= nR; i++) {
    const rho = Math.pow(i / nR, rhoPow);
    for (let j = 0; j < nT; j++) {
      const th = (j / nT) * Math.PI * 2;
      const R = radiusFn(th);
      put(k++, cx + Math.cos(th) * R * rho, cz + Math.sin(th) * R * rho, rho, th);
    }
  }
  const idx = new Uint32Array((nT + (nR - 1) * nT * 2) * 3);
  let t = 0;
  const id = (i, j) => 1 + (i - 1) * nT + (j % nT);
  for (let j = 0; j < nT; j++) { idx[t++] = 0; idx[t++] = id(1, j + 1); idx[t++] = id(1, j); }
  for (let i = 1; i < nR; i++) for (let j = 0; j < nT; j++) {
    const a = id(i, j), b = id(i, j + 1), c = id(i + 1, j), d = id(i + 1, j + 1);
    idx[t++] = a; idx[t++] = b; idx[t++] = c;
    idx[t++] = b; idx[t++] = d; idx[t++] = c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (colr) g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// A ribbon (half-ellipse cross-section) following a 2D path over the surface.
// path: [{x, z, w}] in unrolled space; w = half width.
export function conformRibbon(ctx, path, { hRatio = 0.55, sink = 0.004, M = 10, uvScale = 1 } = {}) {
  const n = path.length;
  const nv = n * (M + 1);
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const a = path[Math.max(0, k - 1)], b = path[Math.min(n - 1, k + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const sx = -tz, sz = tx;
    const p = path[k];
    for (let m = 0; m <= M; m++) {
      const ang = (m / M) * Math.PI;
      const lat = Math.cos(ang) * p.w;
      const h = Math.sin(ang) * p.w * hRatio * (p.hMul ?? 1) - sink;
      const px = p.x + sx * lat, pz = p.z + sz * lat;
      ctx.surf(px, pz, h, false, v);
      const o = k * (M + 1) + m;
      pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      uv[o * 2] = px * uvScale; uv[o * 2 + 1] = pz * uvScale;
    }
  }
  const idx = [];
  for (let k = 0; k < n - 1; k++) for (let m = 0; m < M; m++) {
    const a = k * (M + 1) + m, b = a + 1, c = a + (M + 1), d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Put an object on the surface at p, aligned to the normal, lifted by h.
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
export function placeOn(ctx, obj, px, pz, h, r) {
  ctx.surf(px, pz, h, false, _v);
  ctx.normal(px, pz, _n);
  obj.position.copy(_v);
  _q.setFromUnitVectors(_up, _n);
  obj.quaternion.copy(_q);
  if (r) {
    obj.rotateY(r() * Math.PI * 2);
    obj.rotateX((r() - 0.5) * (r.tilt ?? 0.7));
    obj.rotateZ((r() - 0.5) * (r.tilt ?? 0.7));
  }
  return obj;
}

export function scatter(r, n, minDist, maxS, minS = 0, tries = 4000) {
  const pts = [];
  for (let t = 0; t < tries && pts.length < n; t++) {
    const a = r() * Math.PI * 2, s = Math.sqrt(mix(minS * minS, maxS * maxS, r()));
    const x = Math.cos(a) * s, z = Math.sin(a) * s;
    if (pts.every((p) => Math.hypot(p.x - x, p.z - z) > minDist)) pts.push({ x, z });
  }
  return pts;
}

// Lumpy rock-ish geometry for chunks, crumbs and nuts.
export function lumpGeometry({ seed = 1, detail = 2, amp = 0.25, freq = 1.4, flat = true, scale = [1, 1, 1], boxy = 0 }) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (boxy) {
      const m = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
      v.multiplyScalar(mix(1, 1 / m, boxy));
    }
    const d = 1 + amp * (gn(v.x * freq + seed * 3.1, v.y * freq + v.z * 0.7, seed) + 0.6 * gn(v.z * freq * 1.3 - seed, v.x * freq * 0.8 + v.y * 1.1, seed + 9));
    v.multiplyScalar(d);
    p.setXYZ(i, v.x * scale[0], v.y * scale[1], v.z * scale[2]);
  }
  if (!flat) {
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVerts(g);
  }
  g.computeVertexNormals();
  return g;
}

// minimal position-only vertex weld (keeps this module free of addon imports)
export function mergeVerts(g) {
  const p = g.attributes.position;
  const map = new Map(), verts = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e4)}_${Math.round(p.getY(i) * 1e4)}_${Math.round(p.getZ(i) * 1e4)}`;
    let k = map.get(key);
    if (k === undefined) { k = verts.length / 3; map.set(key, k); verts.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(k);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  o.setIndex(idx);
  return o;
}

export { hex };
