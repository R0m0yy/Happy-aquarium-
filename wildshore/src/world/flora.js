// Procedural tropical vegetation: coconut palms, hardwood trees, mangroves, shrubs,
// ferns, broadleaf plants and grass. Each species is a set of variant geometries
// (per material part) that the scatter system instances across the islands.
import * as THREE from 'three';
import { rng, noise2 } from '../util/math.js';
import { tube, ribbon, card, merge, normalizeAttrs } from '../render/geo.js';
import {
  palmBarkTexture, palmFrondTexture, hardwoodBarkTexture, leafClusterTexture, fernTexture, broadleafTexture,
} from '../render/textures.js';
import { patchMaterial } from '../render/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);

// ---------- materials ----------
let MATS = null;
export function floraMaterials() {
  if (MATS) return MATS;
  const bark = palmBarkTexture();
  const hbark = hardwoodBarkTexture();
  const mk = (params, opts) => {
    const m = patchMaterial(new THREE.MeshStandardMaterial(params), opts);
    return m;
  };
  MATS = {
    palmBark: mk({ map: bark, bumpMap: bark, bumpScale: 2.5, roughness: 0.92, vertexColors: true }, { wind: 1, windMode: 'tree', fade: true }),
    palmFrond: mk({ map: palmFrondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, vertexColors: true }, { wind: 1, windMode: 'tree', fade: true }),
    coconut: mk({ color: 0xffffff, roughness: 0.55, vertexColors: true }, { wind: 1, windMode: 'tree', fade: true }),
    hardBark: mk({ map: hbark, bumpMap: hbark, bumpScale: 3, roughness: 0.95, vertexColors: true }, { wind: 0.5, windMode: 'tree', fade: true }),
    canopy: mk({ map: leafClusterTexture('canopy'), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true }, { wind: 0.7, windMode: 'tree', fade: true }),
    mangroveLeaf: mk({ map: leafClusterTexture('mangrove'), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.7, vertexColors: true }, { wind: 0.6, windMode: 'tree', fade: true }),
    vine: mk({ map: leafClusterTexture('vine'), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.6, vertexColors: true }, { wind: 0.3, windMode: 'plant' }),
    shrub: mk({ map: leafClusterTexture('shrub'), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.68, vertexColors: true }, { wind: 1, windMode: 'plant', fade: true }),
    fern: mk({ map: fernTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.72, vertexColors: true }, { wind: 1, windMode: 'plant' }),
    broadleaf: mk({ map: broadleafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.45, vertexColors: true }, { wind: 1, windMode: 'plant', fade: true }),
    stem: mk({ color: 0xffffff, roughness: 0.8, vertexColors: true }, { wind: 1, windMode: 'plant' }),
    grass: mk({ color: 0xffffff, roughness: 0.85, vertexColors: true, side: THREE.DoubleSide }, { wind: 1.2, windMode: 'grass' }),
  };
  return MATS;
}

// ---------- coconut palm ----------
export function buildPalm(seed) {
  const r = rng(seed);
  const H = r.range(7.5, 11.5);
  const lean = r.range(0.08, 0.32);
  const leanDir = V(0, 0, 1); // leans along +z, rotated per instance toward the sea
  const curve = r.range(0.6, 1.4);
  const path = (t) => V(0, H * t, 0).addScaledVector(leanDir, lean * H * Math.pow(t, 1 + curve * 0.6));
  const trunk = tube(path, (t) => 0.2 * (1 - 0.32 * t) + 0.16 * Math.exp(-t * 14) + 0.012 * Math.sin(t * H * 26),
    { segs: Math.round(H * 3), radial: 9, vScale: 1.0, colorFn: (t) => C(0xffffff).lerp(C(0xb9a98c), t * 0.5) });
  const top = path(1);
  const fronds = [];
  const nF = r.int(13, 17);
  const frondCol = new THREE.Color();
  for (let i = 0; i < nF; i++) {
    const az = (i / nF) * Math.PI * 2 + r.range(-0.2, 0.2);
    const age = r(); // 0 young (upright) .. 1 old (drooping)
    const dead = i < 2 && r() < 0.8;
    const el = dead ? -1.2 : 0.75 - age * 1.15;
    const L = (dead ? 2.6 : 3.6) + r.range(0, 1.4) - (age < 0.15 ? 1.2 : 0);
    const droop = dead ? 0.2 : 0.35 + age * 0.45;
    const d0 = V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const side = V(-Math.sin(az), 0, Math.cos(az));
    const p = (t) => top.clone().addScaledVector(d0, L * t).add(V(0, -droop * L * t * t, 0));
    if (dead) frondCol.set(0xc9a46a); else frondCol.setRGB(0.92 + r.range(-0.05, 0.08), 1.0, 0.82 + r.range(-0.08, 0.08)).multiplyScalar(0.9 + r.range(0, 0.2));
    const fc = frondCol.clone();
    const g = ribbon(p, (t) => (dead ? 0.7 : 1.9) * Math.sin(Math.min(1, t * 1.15 + 0.05) * Math.PI * 0.95) + 0.08,
      { segs: 9, fold: dead ? 0.1 : 0.55 + age * 0.3, side, colorFn: (t) => fc.clone().multiplyScalar(0.85 + t * 0.25) });
    fronds.push(g);
  }
  // crown shaft + frond bases
  const crownBase = tube((t) => top.clone().add(V(0, -0.6 + t * 0.9, 0)), (t) => 0.24 - t * 0.1, { segs: 3, radial: 8, colorFn: () => C(0x7b7a4a) });
  const nuts = [];
  const nN = r.int(3, 7);
  for (let i = 0; i < nN; i++) {
    const a = r() * Math.PI * 2;
    nuts.push(top.clone().add(V(Math.cos(a) * 0.3, -0.45 - r() * 0.25, Math.sin(a) * 0.3)));
  }
  return {
    parts: {
      palmBark: merge([trunk, crownBase]),
      palmFrond: merge(fronds),
    },
    height: H,
    top,
    nuts,
    radius: 0.35,
  };
}

// coconut mesh (individually harvestable instances)
export function coconutGeometry() {
  let g = new THREE.SphereGeometry(0.14, 10, 8);
  g.scale(1, 1.15, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setXYZ(i, p.getX(i) * (1 + 0.1 * Math.cos(Math.atan2(p.getZ(i), p.getX(i)) * 3)), y, p.getZ(i) * (1 + 0.1 * Math.cos(Math.atan2(p.getZ(i), p.getX(i)) * 3)));
  }
  g.computeVertexNormals();
  g = normalizeAttrs(g, C(0x5f7a2a));
  return g;
}

// ---------- tropical hardwood ----------
export function buildHardwood(seed, { scale = 1, mangrove = false } = {}) {
  const r = rng(seed);
  const H = r.range(5, 8) * scale;
  const bark = [];
  const leaves = [];
  const trunkTop = V(r.range(-0.4, 0.4), H, r.range(-0.4, 0.4));
  const trunkPath = (t) => V(trunkTop.x * t * t, H * t, trunkTop.z * t * t);
  const baseR = (mangrove ? 0.18 : 0.32) * scale;
  bark.push(tube(trunkPath, (t) => baseR * (1 - 0.45 * t) + (mangrove ? 0 : 0.25 * scale * Math.exp(-t * 10)), { segs: 10, radial: 9, vScale: 0.5, wobble: 0.08 }));
  // buttress / prop roots
  const nRoots = mangrove ? r.int(7, 10) : r.int(3, 5);
  for (let i = 0; i < nRoots; i++) {
    const a = (i / nRoots) * Math.PI * 2 + r() * 0.3;
    const out = (mangrove ? r.range(1.4, 2.4) : r.range(0.6, 1.1)) * scale;
    const hTop = mangrove ? r.range(1.2, 2.2) * scale : 0.7 * scale;
    const p = (t) => V(Math.cos(a) * out * t, hTop * (1 - t * t) - (mangrove ? 0.4 * t : 0), Math.sin(a) * out * t);
    bark.push(tube(p, (t) => (mangrove ? 0.06 : 0.14) * scale * (1 - t * 0.6), { segs: 6, radial: 5, vScale: 0.5 }));
  }
  // branches
  const nB = r.int(4, 6);
  const center = trunkPath(1).clone().add(V(0, 1.2 * scale, 0));
  for (let i = 0; i < nB; i++) {
    const a = (i / nB) * Math.PI * 2 + r.range(-0.3, 0.3);
    const startT = r.range(0.55, 0.9);
    const s = trunkPath(startT);
    const len = r.range(1.8, 3.2) * scale;
    const up = r.range(0.5, 1.1);
    const dir = V(Math.cos(a), up, Math.sin(a)).normalize();
    const p = (t) => s.clone().addScaledVector(dir, len * t).add(V(0, -0.3 * t * t * scale, 0));
    bark.push(tube(p, (t) => baseR * 0.45 * (1 - 0.7 * t), { segs: 5, radial: 6, vScale: 0.5 }));
    // leaf clusters at branch tip
    const tip = p(1);
    const nc = r.int(4, 7);
    for (let k = 0; k < nc; k++) {
      const off = V(r.range(-1, 1), r.range(-0.4, 0.8), r.range(-1, 1)).multiplyScalar(1.1 * scale);
      const pos = tip.clone().add(off);
      const col = C(0xffffff).multiplyScalar(0.8 + r() * 0.35);
      leaves.push(card(center, pos, r.range(2.0, 2.8) * scale, new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI), col, center));
    }
  }
  // crown fill
  for (let k = 0; k < 10; k++) {
    const pos = center.clone().add(V(r.range(-1.6, 1.6), r.range(-0.6, 1.2), r.range(-1.6, 1.6)).multiplyScalar(scale));
    leaves.push(card(center, pos, r.range(2.2, 3.0) * scale, new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI), C(0xffffff).multiplyScalar(0.75 + r() * 0.3), center));
  }
  return {
    parts: {
      hardBark: merge(bark),
      [mangrove ? 'mangroveLeaf' : 'canopy']: merge(leaves),
    },
    height: H + 2 * scale,
    radius: baseR + 0.1,
  };
}

// ---------- understory ----------
export function buildShrub(seed) {
  const r = rng(seed);
  const s = r.range(0.8, 1.5);
  const center = V(0, 0.55 * s, 0);
  const cards = [];
  const n = r.int(9, 14);
  for (let i = 0; i < n; i++) {
    const pos = center.clone().add(V(r.range(-0.6, 0.6), r.range(-0.3, 0.45), r.range(-0.6, 0.6)).multiplyScalar(s));
    cards.push(card(center, pos, r.range(0.9, 1.3) * s, new THREE.Euler(r.range(-1.2, 1.2), r() * Math.PI, r.range(-0.4, 0.4)), C(0xffffff).multiplyScalar(0.8 + r() * 0.3), V(0, 0, 0)));
  }
  return { parts: { shrub: merge(cards) }, radius: 0.4 * s, height: 1.2 * s };
}

// creeping beach morning-glory ground cover
export function buildVine(seed) {
  const r = rng(seed);
  const cards = [];
  const n = r.int(5, 8);
  for (let i = 0; i < n; i++) {
    const pos = V(r.range(-1.4, 1.4), 0.06 + r() * 0.08, r.range(-1.4, 1.4));
    const g = card(V(0, -2, 0), pos, r.range(1.0, 1.7), new THREE.Euler(-Math.PI / 2 + r.range(-0.25, 0.25), r() * Math.PI, 0), C(0xffffff).multiplyScalar(0.85 + r() * 0.3), V(pos.x, -3, pos.z));
    cards.push(g);
  }
  return { parts: { vine: merge(cards) }, radius: 0, height: 0.2 };
}

export function buildFern(seed) {
  const r = rng(seed);
  const fr = [];
  const n = r.int(8, 13);
  const s = r.range(0.7, 1.25);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    const el = r.range(0.45, 1.1);
    const L = r.range(0.8, 1.3) * s;
    const d = V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const side = V(-Math.sin(az), 0, Math.cos(az));
    const p = (t) => V(0, 0.05, 0).addScaledVector(d, L * t).add(V(0, -0.55 * L * t * t, 0));
    const col = C(0xffffff).multiplyScalar(0.85 + r() * 0.3);
    fr.push(ribbon(p, (t) => 0.42 * s * Math.sin(Math.min(1, t + 0.1) * Math.PI) + 0.02, { segs: 6, fold: 0.25, side, colorFn: () => col }));
  }
  return { parts: { fern: merge(fr) }, radius: 0.2, height: 0.8 * s };
}

export function buildBroadleaf(seed) {
  const r = rng(seed);
  const stems = [], leaves = [];
  const n = r.int(4, 7);
  const s = r.range(0.8, 1.4);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3);
    const h = r.range(0.7, 1.4) * s;
    const out = r.range(0.2, 0.55) * s;
    const p = (t) => V(Math.cos(az) * out * t, h * Math.sin(t * Math.PI * 0.5), Math.sin(az) * out * t);
    stems.push(tube(p, () => 0.025 * s, { segs: 4, radial: 4, colorFn: () => C(0x6e8f3a) }));
    const tip = p(1);
    const L = r.range(0.75, 1.1) * s;
    const dir = V(Math.cos(az), -0.25, Math.sin(az)).normalize();
    const side = V(-Math.sin(az), 0, Math.cos(az));
    const lp = (t) => tip.clone().addScaledVector(dir, L * t).add(V(0, 0.15 * L * Math.sin(t * Math.PI) - 0.2 * L * t * t, 0));
    const col = C(0xffffff).multiplyScalar(0.85 + r() * 0.3);
    leaves.push(ribbon(lp, () => L * 0.75, { segs: 5, fold: 0.18, side, colorFn: () => col }));
  }
  return { parts: { stem: merge(stems), broadleaf: merge(leaves) }, radius: 0.3, height: 1.4 * s };
}

export function buildGrassTuft(seed, dry = false) {
  const r = rng(seed);
  const blades = [];
  const n = r.int(10, 16);
  for (let i = 0; i < n; i++) {
    const az = r() * Math.PI * 2;
    const h = r.range(0.35, 0.75);
    const bend = r.range(0.1, 0.35);
    const ox = r.range(-0.12, 0.12), oz = r.range(-0.12, 0.12);
    const p = (t) => V(ox + Math.cos(az) * bend * t * t, h * t, oz + Math.sin(az) * bend * t * t);
    const base = dry ? C(0x7d7a3e) : C(0x4d6b25);
    const tip = dry ? C(0xc9bf7a) : C(0x9bb552);
    blades.push(ribbon(p, (t) => 0.05 * (1 - t) + 0.004, {
      segs: 3, side: V(-Math.sin(az), 0, Math.cos(az)), colorFn: (t) => base.clone().lerp(tip, t).multiplyScalar(0.85 + r() * 0.3),
    }));
  }
  return { parts: { grass: merge(blades) }, radius: 0, height: 0.6 };
}

// seedling sapling (planted by the player)
export function buildSapling(seed) {
  const r = rng(seed);
  const leaves = [];
  for (let i = 0; i < 5; i++) {
    const az = (i / 5) * Math.PI * 2;
    const side = V(-Math.sin(az), 0, Math.cos(az));
    const d = V(Math.cos(az) * 0.6, 0.8, Math.sin(az) * 0.6).normalize();
    leaves.push(ribbon((t) => V(0, 0.05, 0).addScaledVector(d, 0.8 * t).add(V(0, -0.3 * t * t, 0)), (t) => 0.4 * Math.sin(t * Math.PI) + 0.02, { segs: 4, fold: 0.4, side }));
  }
  return { parts: { palmFrond: merge(leaves) }, radius: 0.1, height: 0.6 };
}

export const FLORA_COLORS = { noise2 };
