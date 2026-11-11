// Scene assembly + shot rendering. Runs in the browser (headless Chromium).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeField, cookieGeometry, cookieTextures, lumpGeometry, grainNormalMap } from './cookie.js';
import { FLAVORS, BRAND, rng } from './flavors.js';

const params = new URLSearchParams(location.search);
const DRAFT = params.has('draft');
const Q = DRAFT
  ? { rings: 200, segs: 420, tex: 1024, crustR: 150, crustT: 460, frostR: 80, frostT: 280, ss: 1 }
  : { rings: 420, segs: 860, tex: 2048, crustR: 320, crustT: 960, frostR: 170, frostT: 540, ss: 1.5 };

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft (radius-based) in current three
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

// ------------------------------------------------------------------ cookies
const cache = {};
export function buildCookie(slug) {
  if (cache[slug]) return cache[slug];
  const t0 = performance.now();
  const F = FLAVORS[slug];
  const ctx = makeField(F);
  ctx.q = Q;
  const geo = cookieGeometry(ctx, Q);
  const maps = cookieTextures(ctx, Q);
  const mat = new THREE.MeshPhysicalMaterial({
    ...maps, roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(1, 1),
    // cheap stand-in for subsurface scattering: a broad warm sheen wraps light around
    // the edges and a faint self-lit term keeps shadowed dough from going clay-grey
    sheen: F.sheenAmt ?? 0.55, sheenColor: new THREE.Color(F.sheenColor), sheenRoughness: 0.85,
    emissive: new THREE.Color('#ffffff'), emissiveMap: maps.map, emissiveIntensity: F.glow ?? 0.07,
  });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = body.receiveShadow = true;
  const g = new THREE.Group();
  g.add(body);
  F.toppings(g, ctx, rng(F.seed * 977));
  g.userData = { ctx, F, slug };
  cache[slug] = g;
  console.log(`built ${slug} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  return g;
}
function resetCookie(g) {
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
  return g;
}

// ------------------------------------------------------------------ lighting / stage
function shadowTint(bg) {
  const c = new THREE.Color(bg), hsl = {};
  c.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h - 0.02, Math.min(hsl.s, 0.75), hsl.l * 0.3);
}
function softShape(draw, blur = 30, size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.filter = `blur(${blur}px)`;
  c.fillStyle = '#fff';
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function stage({ key = [-3.2, 6.5, 3.6], extent = 2.2, ground = null, mapSize = 2048, radius = 8, keyI = 2.5, envI = 0.42, fillI = 0.45, rimI = 1.8 }) {
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.environmentIntensity = envI;
  const k = new THREE.DirectionalLight(0xfff0dc, keyI);
  k.position.set(...key);
  k.castShadow = true;
  k.shadow.mapSize.set(mapSize, mapSize);
  const sc = k.shadow.camera;
  sc.left = -extent; sc.right = extent; sc.top = extent; sc.bottom = -extent; sc.near = 0.5; sc.far = 30;
  k.shadow.bias = -0.0006; k.shadow.normalBias = 0.014; k.shadow.radius = radius;
  scene.add(k);
  const fill = new THREE.DirectionalLight(0xdfe8ff, fillI);
  fill.position.set(5, 3, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff6ea, rimI);
  rim.position.set(1.5, 3.2, -6);
  scene.add(rim);
  if (ground) {
    const tint = shadowTint(ground.bg);
    const sm = new THREE.ShadowMaterial({ color: tint, opacity: ground.opacity ?? 0.42, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), sm);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);
    const cm = new THREE.MeshBasicMaterial({ map: ground.contact, color: tint, transparent: true, opacity: ground.contactOpacity ?? 0.75, depthWrite: false, toneMapped: false });
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(ground.size, ground.size), cm);
    cp.rotation.x = -Math.PI / 2;
    cp.position.y = 0.003;
    cp.renderOrder = 1;
    scene.add(cp);
  }
  return scene;
}

function capture(scene, camera, w, h, bg) {
  const ss = Q.ss;
  renderer.setSize(Math.round(w * ss), Math.round(h * ss), false);
  const gl = renderer.getContext();
  if (gl.drawingBufferWidth !== Math.round(w * ss)) {
    // the browser shrank the drawing buffer (memory pressure): fall back to 1x
    console.log(`drawing buffer clamped to ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}; rendering without supersampling`);
    renderer.setSize(w, h, false);
    if (gl.drawingBufferWidth !== w) throw new Error('WebGL drawing buffer too small for ' + w + 'x' + h);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(renderer.domElement, 0, 0, w, h);
  return cv.toDataURL('image/png');
}

// ------------------------------------------------------------------ shots
function aerial(slug, w, h) {
  const cookie = resetCookie(buildCookie(slug));
  const scene = stage({ key: [-4.6, 3.7, -3.2], extent: 1.6, keyI: 2.7, fillI: 0.5, rimI: 0.9, envI: 0.45 });
  scene.add(cookie);
  const box = new THREE.Box3().setFromObject(cookie);
  const rmax = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
  const fov = 18;
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  const d = 0.2 + rmax / (0.95 * Math.tan((fov * Math.PI) / 360));
  cam.position.set(0, d, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  const url = capture(scene, cam, w, h, null);
  scene.remove(cookie);
  return url;
}

function hero(slug, w, h, bg) {
  const cookie = resetCookie(buildCookie(slug));
  const F = FLAVORS[slug];
  bg = bg || F.bg;
  const contact = softShape((c, s) => { c.beginPath(); c.arc(s / 2, s / 2, s * 0.27, 0, 7); c.fill(); }, 26);
  const scene = stage({ key: [-3.6, 6.2, 3.2], extent: 2.6, ground: { bg, contact, size: 3.9 } });
  cookie.rotation.y = F.heroRot ?? 0.6;
  scene.add(cookie);
  // loose crumbs on the table
  const r = rng(F.seed * 31 + 5);
  const crumbs = new THREE.Group();
  const cmat = new THREE.MeshStandardMaterial({ color: F.edge, roughness: 0.9 });
  const cmat2 = new THREE.MeshStandardMaterial({ color: F.dough, roughness: 0.9 });
  const cg = [0, 1, 2].map((k) => lumpGeometry({ seed: 200 + k, detail: 2, amp: 0.35, flat: false }));
  for (let k = 0; k < 16; k++) {
    const a = r.range(0.25, Math.PI - 0.25) + (r() < 0.15 ? Math.PI : 0), d = r.range(1.22, 1.7);
    const m = new THREE.Mesh(r.pick(cg), r() < 0.5 ? cmat : cmat2);
    const sc = r.range(0.012, 0.036) * (r() < 0.2 ? 1.4 : 1);
    m.scale.set(sc, sc * 0.7, sc);
    m.position.set(THREE.MathUtils.clamp(Math.cos(a) * d, -0.92, 0.92), sc * 0.5, Math.sin(a) * d * 0.9 + 0.1);
    m.rotation.set(r() * 6, r() * 6, r() * 6);
    m.castShadow = true;
    crumbs.add(m);
  }
  for (let k = 0; k < 7; k++) {
    const a = r.range(0.45, Math.PI - 0.45), d = r.range(1.25, 1.65);
    const m = F.bit(r);
    m.position.set(THREE.MathUtils.clamp(Math.cos(a) * d, -0.9, 0.9), m.scale.y * 0.35, Math.sin(a) * d * 0.9 + 0.1);
    m.rotation.set((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5);
    m.castShadow = true;
    crumbs.add(m);
  }
  scene.add(crumbs);
  const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 100);
  const az = 0.0, el = (34 * Math.PI) / 180, d = 7.6;
  cam.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
  cam.lookAt(0, 0.1, 0.16);
  const url = capture(scene, cam, w, h, bg);
  scene.remove(cookie);
  return url;
}

export { renderer, Q, DRAFT, stage, capture, softShape, resetCookie, aerial, hero, shadowTint };
