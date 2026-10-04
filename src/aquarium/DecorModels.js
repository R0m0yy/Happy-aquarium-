// Procedural hardscape and ornament models. Each builder returns
// { group, colliders: [{x,y,z,r}], hide?: Vector3, bubbles?: Vector3, radius }
// in local space (origin on the substrate).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, makeNoise3D } from '../core/util.js';
import { tankStandard } from '../render/materials.js';
import { toTexture, stoneTexture, noiseBumpTexture } from '../render/textures.js';

const mats = new Map();
function stoneMat(style, extra = {}) {
  const key = `${style}:${JSON.stringify(extra)}`;
  if (!mats.has(key)) {
    mats.set(key, tankStandard({
      map: toTexture(stoneTexture(style), { repeat: [2, 2] }),
      bumpMap: toTexture(noiseBumpTexture(style.length + 3, 0.08), { repeat: [3, 3], srgb: false }),
      bumpScale: 3,
      roughness: style === 'river' || style === 'quartz' ? 0.45 : 0.85,
      ...extra,
    }));
  }
  return mats.get(key);
}
function solidMat(color, extra = {}) {
  const key = `solid:${color}:${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, tankStandard({ color, roughness: 0.6, ...extra }));
  return mats.get(key);
}

function shadow(o) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
}

// ---------------------------------------------------------------- rocks
function rockGeometry(seed, { sx = 1, sy = 0.8, sz = 0.8, rough = 0.35, detail = 3, jag = 0.0 }) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const n3 = makeNoise3D(seed);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = n3(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4) - 0.5;
    const n2 = n3(v.x * 4 + 3, v.y * 4, v.z * 4) - 0.5;
    let k = 1 + n * rough * 2 + n2 * rough * 0.5;
    if (jag) k += Math.abs(Math.sin(v.y * 9 + v.x * 3)) * jag;
    v.multiplyScalar(k);
    v.set(v.x * sx, v.y * sy, v.z * sz);
    if (v.y < 0) v.y *= 0.25; // flat-ish bottom buried in substrate
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const ROCK_SHAPES = {
  seiryu: { sx: 0.11, sy: 0.16, sz: 0.09, rough: 0.42, jag: 0.12, flat: true },
  lava: { sx: 0.08, sy: 0.07, sz: 0.07, rough: 0.5, flat: true },
  dragon: { sx: 0.12, sy: 0.12, sz: 0.09, rough: 0.5, jag: 0.15, flat: true },
  river: { sx: 0.09, sy: 0.055, sz: 0.07, rough: 0.12, flat: false },
  holey: { sx: 0.1, sy: 0.09, sz: 0.08, rough: 0.45, flat: true },
  quartz: { sx: 0.07, sy: 0.08, sz: 0.06, rough: 0.35, jag: 0.25, flat: true },
  mossy: { sx: 0.13, sy: 0.1, sz: 0.11, rough: 0.25, flat: false },
};

function buildRock(def) {
  const g = new THREE.Group();
  const shape = ROCK_SHAPES[def.style] ?? ROCK_SHAPES.seiryu;
  const rng = makeRng(def.seed ?? 1);
  const colliders = [];
  const main = new THREE.Mesh(rockGeometry(def.seed, shape), stoneMat(def.style, { flatShading: shape.flat }));
  g.add(main);
  colliders.push({ x: 0, y: shape.sy * 0.4, z: 0, r: Math.max(shape.sx, shape.sz) * 0.95 });
  // smaller companion stones give a natural cluster
  const n = def.style === 'river' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const s = 0.35 + rng() * 0.25;
    const m = new THREE.Mesh(rockGeometry((def.seed ?? 1) + 50 + i, { ...shape, sx: shape.sx * s, sy: shape.sy * s, sz: shape.sz * s }), stoneMat(def.style, { flatShading: shape.flat }));
    const a = rng() * Math.PI * 2;
    m.position.set(Math.cos(a) * shape.sx * 1.1, 0, Math.sin(a) * shape.sz * 1.1);
    m.rotation.y = rng() * 6;
    g.add(m);
    colliders.push({ x: m.position.x, y: shape.sy * s * 0.4, z: m.position.z, r: shape.sx * s });
  }
  if (def.style === 'mossy') {
    const moss = new THREE.Mesh(rockGeometry((def.seed ?? 1) + 7, { sx: shape.sx * 0.85, sy: shape.sy * 0.35, sz: shape.sz * 0.8, rough: 0.3 }), solidMat(0x4a8a30, { roughness: 1 }));
    moss.position.y = shape.sy * 0.72;
    g.add(moss);
  }
  return { group: shadow(g), colliders, radius: Math.max(shape.sx, shape.sz) * 1.4 };
}

function buildSlate(def) {
  const g = new THREE.Group();
  const rng = makeRng(def.seed);
  const colliders = [];
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const w = 0.16 - i * 0.02 + rng() * 0.03, d = 0.11 - i * 0.012, h = 0.018 + rng() * 0.01;
    const geo = rockGeometry(def.seed + i, { sx: w / 2, sy: h, sz: d / 2, rough: 0.12, detail: 2 });
    const m = new THREE.Mesh(geo, stoneMat('slate', { flatShading: true }));
    m.position.set((rng() - 0.5) * 0.03, y + h * 0.8, (rng() - 0.5) * 0.02);
    m.rotation.y = rng() * 0.6;
    g.add(m);
    y += h * 1.6;
  }
  colliders.push({ x: 0, y: y / 2, z: 0, r: 0.09 });
  return { group: shadow(g), colliders, radius: 0.12 };
}

function buildPebbles(def) {
  const g = new THREE.Group();
  const rng = makeRng(def.seed);
  for (let i = 0; i < 9; i++) {
    const s = 0.02 + rng() * 0.025;
    const m = new THREE.Mesh(rockGeometry(def.seed + i * 3, { sx: s, sy: s * 0.6, sz: s * 0.8, rough: 0.1, detail: 2 }), stoneMat('river'));
    const a = rng() * Math.PI * 2, r = rng() * 0.08;
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.add(m);
  }
  return { group: shadow(g), colliders: [{ x: 0, y: 0.01, z: 0, r: 0.06 }], radius: 0.1 };
}

function buildSpire(def) {
  const g = new THREE.Group();
  const rng = makeRng(def.seed);
  const colliders = [];
  for (let i = 0; i < 4; i++) {
    const h = 0.32 - i * 0.06;
    const geo = rockGeometry(def.seed + i * 7, { sx: 0.05 + rng() * 0.02, sy: h, sz: 0.045, rough: 0.35, jag: 0.15 });
    const m = new THREE.Mesh(geo, stoneMat('seiryu', { flatShading: true }));
    m.position.set((i - 1.5) * 0.05 + (rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.04);
    m.rotation.set((rng() - 0.5) * 0.15, rng() * 6, (rng() - 0.5) * 0.15);
    g.add(m);
    for (let k = 0; k < 3; k++) colliders.push({ x: m.position.x, y: (k + 0.5) * h / 3, z: m.position.z, r: 0.055 });
  }
  return { group: shadow(g), colliders, radius: 0.14 };
}

// ------------------------------------------------------------- driftwood
function taperedTube(points, r0, r1, radial = 7, segs = 16) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], uv = [], idx = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i], B = frames.binormals[i];
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 3 + i) * 0.08;
      const x = P.x + (Math.cos(a) * N.x + Math.sin(a) * B.x) * r * wob;
      const y = P.y + (Math.cos(a) * N.y + Math.sin(a) * B.y) * r * wob;
      const z = P.z + (Math.cos(a) * N.z + Math.sin(a) * B.z) * r * wob;
      pos.push(x, y, z);
      uv.push(k / radial, t * 3);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
    const a = i * (radial + 1) + k, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, curve };
}

const WOOD_STYLE = {
  spider: { tex: 'wood', branches: 9, depth: 3, r: 0.012, len: 0.2, up: 0.8, spread: 1.0 },
  mopani: { tex: 'mopani', branches: 4, depth: 2, r: 0.026, len: 0.18, up: 0.5, spread: 0.7 },
  manzanita: { tex: 'wood', branches: 7, depth: 3, r: 0.015, len: 0.22, up: 0.9, spread: 0.6 },
  root: { tex: 'wood', branches: 8, depth: 2, r: 0.018, len: 0.16, up: 0.25, spread: 1.4 },
  twig: { tex: 'wood', branches: 6, depth: 1, r: 0.006, len: 0.18, up: 0.6, spread: 1.0 },
};

function buildWood(def) {
  const st = WOOD_STYLE[def.style] ?? WOOD_STYLE.spider;
  const rng = makeRng(def.seed);
  const geos = [];
  const colliders = [];
  const branch = (start, dir, len, r, depth) => {
    const pts = [start.clone()];
    const d = dir.clone();
    let p = start.clone();
    for (let i = 0; i < 4; i++) {
      d.add(new THREE.Vector3((rng() - 0.5) * 0.6, (rng() - 0.3) * 0.4 * st.up, (rng() - 0.5) * 0.6)).normalize();
      p = p.clone().addScaledVector(d, len / 4);
      p.y = Math.max(0.005, p.y);
      pts.push(p);
    }
    const { geo } = taperedTube(pts, r, r * 0.45, 7, 12);
    geos.push(geo);
    for (let i = 1; i < pts.length; i++) colliders.push({ x: pts[i].x, y: pts[i].y, z: pts[i].z, r: r * 1.3 + 0.01, soft: r < 0.008 });
    if (depth > 0) {
      const n = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const from = pts[2 + Math.floor(rng() * 2)];
        const nd = d.clone().add(new THREE.Vector3((rng() - 0.5) * st.spread * 2, st.up * 0.6, (rng() - 0.5) * st.spread * 2)).normalize();
        branch(from, nd, len * 0.72, r * 0.55, depth - 1);
      }
    }
  };
  // main trunk(s)
  const trunks = Math.max(1, Math.round(st.branches / 4));
  for (let i = 0; i < trunks; i++) {
    const a = rng() * Math.PI * 2;
    const start = new THREE.Vector3(Math.cos(a) * 0.03, 0.005, Math.sin(a) * 0.02);
    const dir = new THREE.Vector3(Math.cos(a) * 0.6, st.up, Math.sin(a) * 0.4).normalize();
    branch(start, dir, st.len * 1.4, st.r * 1.6, st.depth);
  }
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(mergeGeometries(geos), stoneMat(st.tex, { roughness: 0.9 }));
  g.add(mesh);
  return { group: shadow(g), colliders, radius: st.len * 1.2 };
}

function buildBonsai(def) {
  const g = new THREE.Group();
  const w = buildWood({ ...def, style: 'manzanita' });
  g.add(w.group);
  const canopy = [];
  const rng = makeRng(def.seed + 3);
  for (let i = 0; i < 6; i++) {
    const c = w.colliders[w.colliders.length - 1 - i * 2] ?? w.colliders[0];
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04 + rng() * 0.02, 1), solidMat(0x3c8a2c, { roughness: 1, flatShading: true }));
    m.position.set(c.x, c.y + 0.02, c.z);
    m.scale.y = 0.6;
    canopy.push(m);
    g.add(m);
  }
  return { group: shadow(g), colliders: w.colliders, radius: w.radius };
}

function buildStump() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector2(0.07 - i * 0.004 + Math.sin(i) * 0.004 + (i === 0 ? 0.03 : 0), i * 0.03));
  pts.push(new THREE.Vector2(0.045, 0.18), new THREE.Vector2(0.0, 0.17));
  const geo = new THREE.LatheGeometry(pts, 18);
  g.add(new THREE.Mesh(geo, stoneMat('wood')));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const { geo: root } = taperedTube([new THREE.Vector3(Math.cos(a) * 0.06, 0.03, Math.sin(a) * 0.06), new THREE.Vector3(Math.cos(a) * 0.12, 0.01, Math.sin(a) * 0.12), new THREE.Vector3(Math.cos(a + 0.3) * 0.17, 0.003, Math.sin(a + 0.3) * 0.17)], 0.018, 0.005);
    g.add(new THREE.Mesh(root, stoneMat('wood')));
  }
  return { group: shadow(g), colliders: [{ x: 0, y: 0.06, z: 0, r: 0.085 }, { x: 0, y: 0.14, z: 0, r: 0.06 }], radius: 0.18 };
}

function buildArchWood(def) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3((t - 0.5) * 0.4, Math.sin(t * Math.PI) * 0.22 + 0.005, Math.sin(t * 7) * 0.02));
  }
  const { geo } = taperedTube(pts, 0.03, 0.022, 8, 24);
  g.add(new THREE.Mesh(geo, stoneMat('mopani')));
  const colliders = pts.map((p) => ({ x: p.x, y: p.y, z: p.z, r: 0.045 }));
  const extra = buildWood({ ...def, style: 'twig', seed: def.seed + 4 });
  extra.group.position.set(0.05, 0.18, 0);
  extra.group.scale.setScalar(0.8);
  g.add(extra.group);
  return { group: shadow(g), colliders, radius: 0.24, hide: new THREE.Vector3(0, 0.06, 0) };
}

// ------------------------------------------------------------- ornaments
function column(h, r, mat) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 12, 4), mat);
  shaft.position.y = h / 2;
  g.add(shaft);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, r * 0.5, r * 2.6), mat);
  cap.position.y = h + r * 0.25;
  g.add(cap);
  const base = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, r * 0.5, r * 2.6), mat);
  base.position.y = r * 0.25;
  g.add(base);
  return g;
}

function buildRuins() {
  const g = new THREE.Group();
  const m = stoneMat('sandstone');
  const c1 = column(0.26, 0.022, m);
  c1.position.set(-0.1, 0, 0);
  const c2 = column(0.2, 0.022, m);
  c2.position.set(0.1, 0, 0.02);
  c2.rotation.z = 0.08;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.06), m);
  beam.position.set(-0.04, 0.29, 0);
  beam.rotation.z = -0.1;
  const broken = column(0.08, 0.022, m);
  broken.position.set(0.02, 0.01, 0.08);
  broken.rotation.set(Math.PI / 2 - 0.1, 0, 0.6);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.04), m);
    b.position.set(-0.03 + i * 0.05, 0.017, -0.08);
    b.rotation.y = i * 0.4;
    g.add(b);
  }
  g.add(c1, c2, beam, broken);
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), solidMat(0x3c7a2a, { roughness: 1 }));
  moss.scale.set(1.4, 0.4, 1);
  moss.position.set(-0.1, 0.3, 0);
  g.add(moss);
  return { group: shadow(g), colliders: [{ x: -0.1, y: 0.06, z: 0, r: 0.04 }, { x: -0.1, y: 0.18, z: 0, r: 0.035 }, { x: 0.1, y: 0.06, z: 0.02, r: 0.04 }, { x: 0.1, y: 0.16, z: 0.02, r: 0.035 }, { x: -0.04, y: 0.29, z: 0, r: 0.05 }, { x: 0.02, y: 0.03, z: 0.08, r: 0.04 }], radius: 0.18, hide: new THREE.Vector3(0, 0.1, 0) };
}

function buildTemple() {
  const g = new THREE.Group();
  const m = stoneMat('sandstone');
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.34 - i * 0.04, 0.025, 0.22 - i * 0.03), m);
    s.position.y = 0.0125 + i * 0.025;
    g.add(s);
  }
  for (const x of [-0.11, -0.04, 0.04, 0.11]) {
    const c = column(0.17, 0.014, m);
    c.position.set(x, 0.075, 0.05);
    g.add(c);
    const c2 = column(0.17, 0.014, m);
    c2.position.set(x, 0.075, -0.05);
    g.add(c2);
  }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.2, 0.08, 4, 1), m);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.1, 1, 0.6);
  roof.position.y = 0.3;
  g.add(roof);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.16), m);
  lintel.position.y = 0.255;
  g.add(lintel);
  return { group: shadow(g), colliders: [{ x: -0.1, y: 0.12, z: 0, r: 0.07 }, { x: 0.1, y: 0.12, z: 0, r: 0.07 }, { x: 0, y: 0.27, z: 0, r: 0.12 }, { x: 0, y: 0.04, z: 0, r: 0.12 }], radius: 0.2, hide: new THREE.Vector3(0, 0.12, 0) };
}

function buildArch() {
  const g = new THREE.Group();
  const m = stoneMat('dragon', { flatShading: true });
  const geo = new THREE.TorusGeometry(0.12, 0.035, 8, 20, Math.PI);
  const n3 = makeNoise3D(5);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (n3(p.getX(i) * 20, p.getY(i) * 20, p.getZ(i) * 20) - 0.5) * 0.25;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * (1.3 + (k - 1)));
  }
  geo.computeVertexNormals();
  const a = new THREE.Mesh(geo, m);
  g.add(a);
  const colliders = [];
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * Math.PI;
    colliders.push({ x: Math.cos(t) * 0.12, y: Math.sin(t) * 0.12, z: 0, r: 0.045 });
  }
  return { group: shadow(g), colliders, radius: 0.18, hide: new THREE.Vector3(0, 0.05, 0) };
}

function buildChest() {
  const g = new THREE.Group();
  const wood = stoneMat('wood');
  const gold = solidMat(0xd8a838, { metalness: 0.9, roughness: 0.25 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), wood);
  box.position.y = 0.04;
  g.add(box);
  const lidGroup = new THREE.Group();
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 16, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2;
  lidGroup.add(lid);
  lidGroup.position.set(0, 0.08, -0.05);
  lid.position.z = 0.05;
  lidGroup.rotation.x = -0.6;
  g.add(lidGroup);
  for (const x of [-0.06, 0.06]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.082, 0.102), gold);
    band.position.set(x, 0.04, 0);
    g.add(band);
  }
  const coins = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), solidMat(0xffc840, { metalness: 0.9, roughness: 0.2, emissive: 0x553300 }));
  coins.scale.set(1.2, 0.35, 0.75);
  coins.position.y = 0.075;
  g.add(coins);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, 12), coins.material);
    c.position.set(0.1 + i * 0.015, 0.002, 0.04 - i * 0.01);
    c.rotation.x = 0.2;
    g.add(c);
  }
  return { group: shadow(g), colliders: [{ x: 0, y: 0.05, z: 0, r: 0.09 }], radius: 0.12, bubbles: new THREE.Vector3(0, 0.1, 0) };
}

function buildCrystal() {
  const g = new THREE.Group();
  const rng = makeRng(77);
  const mat = tankStandard({ color: 0xc8a0ff, emissive: 0x6a30c0, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true });
  const base = new THREE.Mesh(rockGeometry(9, { sx: 0.08, sy: 0.04, sz: 0.07, rough: 0.3 }), stoneMat('slate', { flatShading: true }));
  g.add(base);
  for (let i = 0; i < 9; i++) {
    const h = 0.06 + rng() * 0.12;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.016 + rng() * 0.01, h, 6, 1), mat);
    c.geometry.translate(0, h / 2, 0);
    c.position.set((rng() - 0.5) * 0.08, 0.02, (rng() - 0.5) * 0.06);
    c.rotation.set((rng() - 0.5) * 0.9, rng() * 6, (rng() - 0.5) * 0.9);
    g.add(c);
  }
  return { group: shadow(g), colliders: [{ x: 0, y: 0.06, z: 0, r: 0.08 }], radius: 0.1, glow: { color: 0xa070ff } };
}

function shellGeo(kind) {
  if (kind === 'spiral') {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 0.03 * (1 - t * 0.5) + 0.002, t * 0.07));
    }
    const g = new THREE.LatheGeometry(pts, 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const tw = y * 30;
      const x = p.getX(i), z = p.getZ(i);
      const s = 1 + Math.sin(Math.atan2(z, x) * 1 + tw) * 0.15;
      p.setX(i, x * s);
      p.setZ(i, z * s);
    }
    g.computeVertexNormals();
    return g;
  }
  const g = new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 + Math.abs(Math.sin(a * 6)) * 0.1;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * 0.5 * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function buildShells() {
  const g = new THREE.Group();
  const cols = [0xf8e8d8, 0xf0c8b0, 0xe8d0f0, 0xfff0e0];
  const rng = makeRng(31);
  for (let i = 0; i < 6; i++) {
    const kind = i % 2 ? 'spiral' : 'scallop';
    const m = new THREE.Mesh(shellGeo(kind), solidMat(cols[i % cols.length], { roughness: 0.35 }));
    const a = rng() * Math.PI * 2, r = 0.02 + rng() * 0.07;
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.rotation.set(kind === 'spiral' ? Math.PI / 2 - 0.3 : 0, rng() * 6, 0);
    m.scale.setScalar(0.8 + rng() * 0.6);
    g.add(m);
  }
  return { group: shadow(g), colliders: [{ x: 0, y: 0.02, z: 0, r: 0.08, soft: true }], radius: 0.11 };
}

function buildAmphora() {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.025, 0.005], [0.05, 0.05], [0.055, 0.1], [0.04, 0.15], [0.018, 0.18], [0.016, 0.21], [0.024, 0.215], [0.022, 0.22]].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 24);
  const m = new THREE.Mesh(geo, stoneMat('ceramic', { roughness: 0.6 }));
  m.rotation.z = 1.25;
  m.position.set(0.09, 0.05, 0);
  g.add(m);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12, Math.PI), m.material);
    h.position.set(0, 0.17, s * 0.025);
    h.rotation.y = Math.PI / 2;
    m.add(h);
  }
  return { group: shadow(g), colliders: [{ x: 0.0, y: 0.05, z: 0, r: 0.06 }, { x: -0.08, y: 0.04, z: 0, r: 0.04 }, { x: 0.07, y: 0.05, z: 0, r: 0.05 }], radius: 0.14, hide: new THREE.Vector3(-0.12, 0.03, 0) };
}

function buildGuardian() {
  // a weathered stone figure sitting cross-legged (original design)
  const g = new THREE.Group();
  const m = stoneMat('sandstone', { roughness: 0.9 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 16), m);
  base.position.y = 0.015;
  const legs = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10), m);
  legs.scale.set(1, 0.32, 0.7);
  legs.position.y = 0.05;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), m);
  body.scale.set(0.95, 1.3, 0.75);
  body.position.y = 0.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), m);
  head.position.y = 0.215;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), m);
  top.position.y = 0.252;
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.06, 4, 8), m);
    arm.position.set(s * 0.055, 0.11, 0.01);
    arm.rotation.z = s * 0.35;
    g.add(arm);
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.025, 4, 6), m);
    ear.position.set(s * 0.035, 0.205, 0);
    g.add(ear);
  }
  const hands = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), m);
  hands.scale.set(1.4, 0.6, 1);
  hands.position.set(0, 0.075, 0.04);
  g.add(base, legs, body, head, top, hands);
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), solidMat(0x3c7a2a, { roughness: 1 }));
  moss.scale.set(1.5, 0.3, 1.2);
  moss.position.set(0.04, 0.03, 0.05);
  g.add(moss);
  return { group: shadow(g), colliders: [{ x: 0, y: 0.05, z: 0, r: 0.09 }, { x: 0, y: 0.14, z: 0, r: 0.065 }, { x: 0, y: 0.22, z: 0, r: 0.04 }], radius: 0.12 };
}

function buildLighthouse() {
  const g = new THREE.Group();
  const white = solidMat(0xf0ece4, { roughness: 0.5 });
  const red = solidMat(0xc83a2a, { roughness: 0.5 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.045 - i * 0.004 - 0.004, 0.045 - i * 0.004, 0.06, 18), i % 2 ? red : white);
    s.position.y = 0.03 + i * 0.06;
    g.add(s);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 12), tankStandard({ color: 0xfff0b0, emissive: 0xffd060, emissiveIntensity: 1.2 }));
  lamp.position.y = 0.32;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.035, 12), red);
  cap.position.y = 0.355;
  g.add(lamp, cap);
  const rocks = buildRock({ style: 'dragon', seed: 88 });
  rocks.group.scale.setScalar(0.8);
  g.add(rocks.group);
  return { group: shadow(g), colliders: [{ x: 0, y: 0.08, z: 0, r: 0.08 }, { x: 0, y: 0.2, z: 0, r: 0.05 }, { x: 0, y: 0.31, z: 0, r: 0.04 }], radius: 0.12, glow: { color: 0xffd060 } };
}

function buildShip() {
  const g = new THREE.Group();
  const wood = stoneMat('wood');
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI), wood);
  hull.scale.set(1.5, 0.7, 0.6);
  hull.rotation.set(-Math.PI / 2, 0, 0.35);
  hull.position.y = 0.04;
  g.add(hull);
  for (let i = 0; i < 6; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.008), wood);
    plank.position.set(-0.12 + i * 0.045, 0.1, 0.07);
    plank.rotation.z = 0.35 + (i % 2) * 0.1;
    g.add(plank);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.32, 8), wood);
  mast.position.set(0.02, 0.17, 0);
  mast.rotation.z = -0.4;
  g.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.1, 4, 4), tankStandard({ color: 0xd8ccb0, side: THREE.DoubleSide, roughness: 1, transparent: true, opacity: 0.85 }));
  sail.position.set(0.07, 0.24, 0);
  sail.rotation.z = -0.4;
  g.add(sail);
  return { group: shadow(g), colliders: [{ x: -0.1, y: 0.06, z: 0, r: 0.08 }, { x: 0.05, y: 0.06, z: 0, r: 0.09 }, { x: 0.15, y: 0.08, z: 0, r: 0.07 }, { x: 0.06, y: 0.2, z: 0, r: 0.04 }], radius: 0.24, hide: new THREE.Vector3(0, 0.04, 0.04), bubbles: new THREE.Vector3(-0.15, 0.06, 0) };
}

function buildHelmet() {
  const g = new THREE.Group();
  const brass = solidMat(0xb08838, { metalness: 0.85, roughness: 0.35 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), brass);
  dome.position.y = 0.085;
  g.add(dome);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.03, 24), brass);
  collar.position.y = 0.015;
  g.add(collar);
  const glass = tankStandard({ color: 0x0a2030, roughness: 0.05, metalness: 0.2 });
  const ring = brass;
  for (const [x, y, z, s] of [[0, 0.09, 0.078, 1], [0.072, 0.09, 0.02, 0.7], [-0.072, 0.09, 0.02, 0.7]]) {
    const port = new THREE.Mesh(new THREE.CircleGeometry(0.03 * s, 20), glass);
    port.position.set(x, y, z);
    port.lookAt(x * 2, y, z * 2 + (z === 0.02 ? 0 : 0.1));
    g.add(port);
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.03 * s, 0.006, 6, 20), ring);
    r.position.copy(port.position);
    r.quaternion.copy(port.quaternion);
    g.add(r);
  }
  g.rotation.z = 0.2;
  return { group: shadow(g), colliders: [{ x: 0, y: 0.08, z: 0, r: 0.1 }], radius: 0.12, bubbles: new THREE.Vector3(0, 0.17, 0) };
}

function buildPagoda() {
  const g = new THREE.Group();
  const stone = stoneMat('seiryu');
  const roofM = solidMat(0x3a4a4a, { roughness: 0.7 });
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const w = 0.09 - i * 0.015;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, w), stone);
    body.position.y = y + 0.025;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 1.1, 0.03, 4), roofM);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = y + 0.065;
    g.add(roof);
    y += 0.07;
  }
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.05, 6), roofM);
  tip.position.y = y + 0.02;
  g.add(tip);
  return { group: shadow(g), colliders: [{ x: 0, y: 0.06, z: 0, r: 0.07 }, { x: 0, y: 0.17, z: 0, r: 0.05 }, { x: 0, y: 0.26, z: 0, r: 0.035 }], radius: 0.09 };
}

function buildMushrooms() {
  const g = new THREE.Group();
  const rng = makeRng(12);
  const capM = tankStandard({ color: 0x60e8ff, emissive: 0x20a8d0, emissiveIntensity: 0.9, roughness: 0.3 });
  const stemM = solidMat(0xe8e0d0, { roughness: 0.6 });
  for (let i = 0; i < 7; i++) {
    const h = 0.03 + rng() * 0.06;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, h, 8), stemM);
    const x = (rng() - 0.5) * 0.1, z = (rng() - 0.5) * 0.08;
    s.position.set(x, h / 2, z);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.015 + rng() * 0.015, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capM);
    c.position.set(x, h, z);
    c.scale.y = 0.6;
    g.add(s, c);
  }
  return { group: shadow(g), colliders: [{ x: 0, y: 0.03, z: 0, r: 0.07, soft: true }], radius: 0.08, glow: { color: 0x60e8ff } };
}

function buildLantern() {
  const g = new THREE.Group();
  const m = stoneMat('seiryu');
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.03, 6), m);
  base.position.y = 0.015;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.1, 8), m);
  post.position.y = 0.08;
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.02, 6), m);
  plat.position.y = 0.14;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.05), m);
  box.position.y = 0.172;
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.052), tankStandard({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 1 }));
  light.position.y = 0.172;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.05, 6), m);
  roof.position.y = 0.22;
  g.add(base, post, plat, box, light, roof);
  return { group: shadow(g), colliders: [{ x: 0, y: 0.06, z: 0, r: 0.05 }, { x: 0, y: 0.18, z: 0, r: 0.06 }], radius: 0.08, glow: { color: 0xffb050 } };
}

function buildTower() {
  const g = new THREE.Group();
  const m = stoneMat('seiryu');
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.26, 16), m);
  tower.position.y = 0.13;
  g.add(tower);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.02), m);
    c.position.set(Math.cos(a) * 0.06, 0.275, Math.sin(a) * 0.06);
    c.rotation.y = -a;
    g.add(c);
  }
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16, 0, Math.PI), solidMat(0x101010));
  door.position.set(0, 0.0, 0.071);
  g.add(door);
  const doorBot = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.04), door.material);
  doorBot.position.set(0, -0.02, 0.071);
  door.position.y = 0.06;
  doorBot.position.y = 0.04;
  g.add(doorBot);
  for (const y of [0.15, 0.21]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.025), solidMat(0x101010));
    w.position.set(0, y, 0.066);
    g.add(w);
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.025), tankStandard({ color: 0xc83a3a, side: THREE.DoubleSide }));
  flag.position.set(0.02, 0.33, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 4), solidMat(0x404040));
  pole.position.set(0, 0.31, 0);
  g.add(flag, pole);
  return { group: shadow(g), colliders: [{ x: 0, y: 0.07, z: 0, r: 0.08 }, { x: 0, y: 0.2, z: 0, r: 0.075 }], radius: 0.1, hide: new THREE.Vector3(0, 0.04, 0.09) };
}

// ------------------------------------------------------------------ caves
function buildCaveRock(def) {
  const g = new THREE.Group();
  const m = stoneMat(def.style ?? 'dragon', { flatShading: true });
  const shell = rockGeometry(def.seed ?? 5, { sx: 0.15, sy: 0.13, sz: 0.12, rough: 0.35 });
  const mesh = new THREE.Mesh(shell, m);
  g.add(mesh);
  // dark cave mouth facing the viewer
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), solidMat(0x050608, { roughness: 1 }));
  mouth.scale.set(1.2, 0.9, 1);
  mouth.position.set(0, 0.045, 0.118);
  g.add(mouth);
  return { group: shadow(g), colliders: [{ x: 0, y: 0.06, z: 0, r: 0.13 }], radius: 0.17, hide: new THREE.Vector3(0, 0.04, 0.16) };
}

function buildTunnel(def) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.08, 0.08, 0.28, 18, 6, true, 0, Math.PI);
  const n3 = makeNoise3D(13);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (n3(p.getX(i) * 15, p.getY(i) * 15, p.getZ(i) * 15) - 0.5) * 0.35;
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, stoneMat(def.style ?? 'seiryu', { flatShading: true, side: THREE.DoubleSide }));
  m.rotation.set(0, 0, Math.PI / 2);
  m.rotation.order = 'ZXY';
  m.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(m);
  holder.rotation.y = Math.PI / 2;
  g.add(holder);
  const colliders = [];
  for (let i = -2; i <= 2; i++) colliders.push({ x: i * 0.06, y: 0.09, z: 0, r: 0.04 });
  return { group: shadow(g), colliders, radius: 0.18, hide: new THREE.Vector3(0, 0.03, 0) };
}

function buildLog() {
  const g = new THREE.Group();
  const outer = new THREE.CylinderGeometry(0.06, 0.065, 0.3, 18, 4, true);
  const m = new THREE.Mesh(outer, stoneMat('wood', { side: THREE.DoubleSide }));
  m.rotation.z = Math.PI / 2;
  m.position.y = 0.055;
  g.add(m);
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.063, 18), solidMat(0x8a6a48, { side: THREE.DoubleSide, roughness: 0.9 }));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(s * 0.15, 0.055, 0);
    g.add(ring);
  }
  const dark = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.29, 14, 1, true), solidMat(0x120c08, { side: THREE.BackSide }));
  dark.rotation.z = Math.PI / 2;
  dark.position.y = 0.055;
  g.add(dark);
  return { group: shadow(g), colliders: [{ x: -0.1, y: 0.06, z: 0, r: 0.07 }, { x: 0.1, y: 0.06, z: 0, r: 0.07 }, { x: 0, y: 0.1, z: 0, r: 0.05 }], radius: 0.18, hide: new THREE.Vector3(0.17, 0.05, 0) };
}

function buildCoconut() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), stoneMat('wood', { side: THREE.DoubleSide }));
  shell.scale.set(1, 0.9, 1.1);
  g.add(shell);
  const fiber = new THREE.Mesh(new THREE.SphereGeometry(0.071, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), solidMat(0x6a4a2a, { roughness: 1, wireframe: true, transparent: true, opacity: 0.35 }));
  fiber.scale.copy(shell.scale);
  g.add(fiber);
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), solidMat(0x080604));
  door.position.set(0, 0.025, 0.077);
  g.add(door);
  return { group: shadow(g), colliders: [{ x: 0, y: 0.03, z: 0, r: 0.08 }], radius: 0.09, hide: new THREE.Vector3(0, 0.02, 0.1) };
}

function buildTubes() {
  const g = new THREE.Group();
  const m = stoneMat('ceramic', { side: THREE.DoubleSide });
  const dark = solidMat(0x100806, { side: THREE.DoubleSide });
  const pos = [[-0.035, 0.025], [0.035, 0.025], [0, 0.07]];
  for (const [x, y] of pos) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 14, 1, true), m);
    t.rotation.x = Math.PI / 2;
    t.position.set(x, y, 0);
    g.add(t);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.022, 14), dark);
    inner.position.set(x, y, 0.058);
    g.add(inner);
  }
  return { group: shadow(g), colliders: [{ x: 0, y: 0.04, z: 0, r: 0.08 }], radius: 0.09, hide: new THREE.Vector3(0, 0.025, 0.09) };
}

function buildArchCave(def) {
  const g = new THREE.Group();
  const a = buildArch();
  a.group.scale.set(1.3, 1.2, 1.6);
  g.add(a.group);
  for (const s of [-1, 1]) {
    const r = buildRock({ style: def.style ?? 'lava', seed: (def.seed ?? 9) + s });
    r.group.position.set(s * 0.16, 0, 0);
    r.group.scale.setScalar(1.1);
    g.add(r.group);
  }
  const colliders = a.colliders.map((c) => ({ ...c, x: c.x * 1.3, y: c.y * 1.2 })).concat([{ x: -0.16, y: 0.05, z: 0, r: 0.1 }, { x: 0.16, y: 0.05, z: 0, r: 0.1 }]);
  return { group: shadow(g), colliders, radius: 0.27, hide: new THREE.Vector3(0, 0.05, 0) };
}

const BUILDERS = {
  rock: buildRock, slate: buildSlate, pebbles: buildPebbles, spire: buildSpire,
  wood: buildWood, bonsai: buildBonsai, stump: buildStump, archwood: buildArchWood,
  ruins: buildRuins, temple: buildTemple, arch: buildArch, chest: buildChest, crystal: buildCrystal, shells: buildShells,
  amphora: buildAmphora, guardian: buildGuardian, lighthouse: buildLighthouse, ship: buildShip, helmet: buildHelmet,
  pagoda: buildPagoda, mushrooms: buildMushrooms, lantern: buildLantern, tower: buildTower,
  caverock: buildCaveRock, tunnel: buildTunnel, log: buildLog, coconut: buildCoconut, tubes: buildTubes, archcave: buildArchCave,
};

export function buildDecor(def) {
  const b = BUILDERS[def.model] ?? buildRock;
  const out = b(def);
  out.group.userData.decorId = def.id;
  return out;
}
