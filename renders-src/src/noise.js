// Small deterministic noise toolkit (no dependencies). Everything is seeded so
// renders are reproducible run to run.

export function hashInt(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}
export function hash2(ix, iy, seed) {
  return hashInt(ix, iy, seed) / 4294967296;
}

const GX = new Float32Array(256), GY = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  GX[i] = Math.cos((i / 256) * Math.PI * 2);
  GY[i] = Math.sin((i / 256) * Math.PI * 2);
}

// Gradient noise, roughly [-1, 1]
export function gn(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  let k = hashInt(ix, iy, seed) & 255;
  const a = GX[k] * fx + GY[k] * fy;
  k = hashInt(ix + 1, iy, seed) & 255;
  const b = GX[k] * (fx - 1) + GY[k] * fy;
  k = hashInt(ix, iy + 1, seed) & 255;
  const c = GX[k] * fx + GY[k] * (fy - 1);
  k = hashInt(ix + 1, iy + 1, seed) & 255;
  const d = GX[k] * (fx - 1) + GY[k] * (fy - 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.6;
}

export function fbm(x, y, seed = 0, oct = 3) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * gn(x * f, y * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

// Worley / Voronoi: writes f1, f2 (euclidean) and a per-cell random id into `out`.
export function voronoi(x, y, seed, out) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const h = hashInt(cx, cy, seed);
      const px = cx + (h & 0xffff) / 65536;
      const py = cy + (h >>> 16) / 65536;
      const dx = px - x, dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; id = h; }
      else if (d < f2) { f2 = d; }
    }
  }
  out.f1 = Math.sqrt(f1);
  out.f2 = Math.sqrt(f2);
  out.id = (Math.imul(id, 2654435761) >>> 0) / 4294967296;
  return out;
}

export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;
