// Procedural natural props: rocks, boulders, driftwood, logs, shells, pebbles,
// fallen fronds, coral species, sea grass, anemones, urchins and giant clams.
import * as THREE from 'three';
import { rng, noise3 } from '../util/math.js';
import { tube, ribbon, merge, normalizeAttrs, rockGeometry, card } from '../render/geo.js';
import { stoneTexture, palmFrondTexture, seaFanTexture, woodTexture, hardwoodBarkTexture } from '../render/textures.js';
import { patchMaterial } from '../render/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);

let MATS = null;
export function propMaterials() {
  if (MATS) return MATS;
  const stone = stoneTexture();
  const mk = (p, o = {}) => patchMaterial(new THREE.MeshStandardMaterial(p), o);
  MATS = {
    rock: mk({ map: stone, bumpMap: stone, bumpScale: 3, roughness: 0.9, vertexColors: true }, { fade: true }),
    wood: mk({ map: woodTexture('weathered'), bumpMap: woodTexture('weathered'), bumpScale: 2, roughness: 0.85, vertexColors: true }),
    log: mk({ map: hardwoodBarkTexture(), bumpMap: hardwoodBarkTexture(), bumpScale: 3, roughness: 0.95, vertexColors: true }),
    shell: mk({ roughness: 0.4, vertexColors: true }),
    deadFrond: mk({ map: palmFrondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }),
    coral: mk({ roughness: 0.75, vertexColors: true }),
    seaFan: mk({ map: seaFanTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true }, { wind: 0.0 }),
    seaGrass: seaMat({ roughness: 0.7, vertexColors: true, side: THREE.DoubleSide }, 1),
    anemone: seaMat({ roughness: 0.5, vertexColors: true }, 0.4),
  };
  return MATS;
}

// underwater sway: constant surge independent of wind
function seaMat(params, amt) {
  const m = patchMaterial(new THREE.MeshStandardMaterial(params), {});
  const orig = m.onBeforeCompile;
  m.onBeforeCompile = (shader) => {
    orig(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec3 inst = instanceMatrix[3].xyz;
        #else
          vec3 inst = modelMatrix[3].xyz;
        #endif
        float ph = dot(inst.xz, vec2(0.21, 0.37));
        float h = max(transformed.y, 0.0);
        float sw = sin(uTime * 1.1 + ph) * h * h * ${(0.35 * amt).toFixed(3)} + sin(uTime * 2.3 + ph * 2.0 + transformed.y * 3.0) * h * ${(0.04 * amt).toFixed(3)};
        transformed.x += sw * 0.8;
        transformed.z += sw * 0.5;
      }`);
  };
  m.customProgramCacheKey = () => 'sea' + amt;
  return m;
}

export function buildRock(seed, kind = 'beach') {
  const r = rng(seed);
  const pal = {
    beach: [C(0x948d82), C(0xb4a58c), 0],
    jungle: [C(0x7a776d), C(0x6b6150), 0.9],
    cliff: [C(0x8d877a), C(0x9d927c), 0.25],
    basalt: [C(0x55514c), C(0x3f3d3a), 0.15],
    reef: [C(0x9c9483), C(0x7e8a6a), 0],
  }[kind] || [C(0x8a857b), null, 0];
  const s = kind === 'cliff' ? r.range(3, 6) : r.range(0.5, 1.6);
  const g = rockGeometry(r, {
    detail: kind === 'cliff' ? 4 : 3, sx: s * r.range(0.8, 1.3), sy: s * r.range(0.45, 0.9), sz: s * r.range(0.8, 1.3),
    rough: kind === 'basalt' ? 0.5 : 0.38, seed: r() * 100, color: pal[0], palette: pal[1], moss: pal[2],
  });
  return { parts: { rock: g }, radius: s * 0.9, height: s * 0.7 };
}

export function buildPebbles(seed) {
  const r = rng(seed);
  const list = [];
  for (let i = 0; i < 7; i++) {
    const g = rockGeometry(r, { detail: 1, sx: 0.06 + r() * 0.07, sy: 0.04 + r() * 0.04, sz: 0.06 + r() * 0.07, rough: 0.2, seed: r() * 50, color: C(0x9c958a).lerp(C(0x6d675f), r()) });
    g.translate(r.range(-0.5, 0.5), 0.02, r.range(-0.5, 0.5));
    list.push(g);
  }
  return { parts: { rock: merge(list) }, radius: 0, height: 0.1 };
}

export function buildDriftwood(seed, mossy = false) {
  const r = rng(seed);
  const L = r.range(1.6, 3.6);
  const bend = r.range(-0.4, 0.4);
  const p = (t) => V((t - 0.5) * L, 0.12 + Math.sin(t * Math.PI) * 0.05, Math.sin(t * Math.PI) * bend);
  const R = r.range(0.09, 0.2);
  const parts = [tube(p, (t) => R * (1 - 0.3 * t) * (0.9 + 0.2 * Math.sin(t * 17)), { segs: 10, radial: 7, vScale: 0.6, wobble: 0.15, capEnd: true })];
  // a branch stub or two
  for (let i = 0; i < r.int(1, 3); i++) {
    const s = p(r.range(0.2, 0.8));
    const d = V(r.range(-0.3, 0.3), r.range(0.3, 0.8), r.sign()).normalize();
    parts.push(tube((t) => s.clone().addScaledVector(d, t * r.range(0.3, 0.7)), (t) => R * 0.4 * (1 - t * 0.7), { segs: 3, radial: 5 }));
  }
  let g = merge(parts);
  const col = mossy ? C(0x8c7c62) : C(0xcfc3ad);
  g = normalizeAttrs(g);
  const c = g.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, col.r, col.g, col.b);
  return { parts: { [mossy ? 'log' : 'wood']: g }, radius: 0.3, height: 0.3, length: L };
}

export function buildShells(seed) {
  const r = rng(seed);
  const list = [];
  const n = r.int(2, 5);
  for (let i = 0; i < n; i++) {
    let g;
    const kind = r();
    if (kind < 0.4) {
      // turban / cone shell (lathe spiral)
      const pts = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector2(0.05 * Math.sin(t * Math.PI) * (1 - t * 0.5) + 0.002, t * 0.11)); }
      g = new THREE.LatheGeometry(pts, 10);
      g.rotateZ(Math.PI / 2 * r());
      g = normalizeAttrs(g, C(0xe7d6bf).lerp(C(0xc98e6a), r() * 0.6));
    } else if (kind < 0.8) {
      // scallop: ribbed fan
      g = new THREE.CircleGeometry(0.06 + r() * 0.03, 12, 0, Math.PI);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const a = Math.atan2(p.getY(k), p.getX(k));
        p.setZ(k, Math.cos(a * 18) * 0.004 + Math.hypot(p.getX(k), p.getY(k)) * 0.15);
      }
      g.rotateX(-Math.PI / 2);
      g.computeVertexNormals();
      g = normalizeAttrs(g, C(0xf1e6d6).lerp(C(0xe39a7a), r() * 0.7));
    } else {
      // starfish
      const shape = new THREE.Shape();
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const rr = k % 2 ? 0.03 : 0.1;
        k === 0 ? shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
      g.rotateX(-Math.PI / 2);
      g = normalizeAttrs(g, C(0xd86a3c).lerp(C(0xc9455a), r()));
    }
    g.translate(r.range(-0.6, 0.6), 0.02, r.range(-0.6, 0.6));
    list.push(g);
  }
  return { parts: { shell: merge(list) }, radius: 0, height: 0.1 };
}

export function buildFallenFrond(seed) {
  const r = rng(seed);
  const L = r.range(2.2, 3.4);
  const a = r() * Math.PI * 2;
  const d = V(Math.cos(a), 0, Math.sin(a));
  const side = V(-d.z, 0, d.x);
  const g = ribbon((t) => V(0, 0.04 + Math.sin(t * Math.PI) * 0.12, 0).addScaledVector(d, (t - 0.5) * L), (t) => 1.1 * Math.sin(Math.min(1, t + 0.1) * Math.PI) + 0.05,
    { segs: 6, fold: -0.15, side, colorFn: () => C(0xa08654).lerp(C(0x6f6a3a), r() * 0.5) });
  return { parts: { deadFrond: g }, radius: 0, height: 0.2 };
}

// ---------- coral & underwater life ----------
const CORAL_COLS = [0xd9a066, 0xc76b8f, 0x8f6fc7, 0xe0c35a, 0x6fb08a, 0xe07a5a, 0x7aa3d6, 0xc9b38c];

export function buildBrainCoral(seed) {
  const r = rng(seed);
  const s = r.range(0.35, 0.9);
  let g = new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const p = g.attributes.position;
  const sd = r() * 100;
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i));
    const ridge = Math.abs(Math.sin((noise3(v.x * 2 + sd, v.y * 2, v.z * 2) * 6 + v.x * 9 + v.z * 7)));
    v.multiplyScalar(1 + ridge * 0.06 + noise3(v.x + sd, v.y, v.z) * 0.12);
    p.setXYZ(i, v.x * s, (v.y - 0.25) * s * 0.75, v.z * s);
  }
  g.computeVertexNormals();
  const base = C(r.pick(CORAL_COLS));
  g = normalizeAttrs(g, base);
  const c = g.attributes.color;
  for (let i = 0; i < c.count; i++) {
    const k = 0.75 + 0.35 * Math.abs(noise3(p.getX(i) * 6, p.getY(i) * 6, p.getZ(i) * 6 + sd));
    c.setXYZ(i, base.r * k, base.g * k, base.b * k);
  }
  return { parts: { coral: g }, radius: s * 0.8, height: s * 0.6 };
}

export function buildStaghorn(seed) {
  const r = rng(seed);
  const list = [];
  const base = C(r.pick([0xc9a27a, 0xb58fb8, 0xd2b56a, 0x9fb4d8]));
  const tipC = C(r.pick([0x8a7cff, 0xff8ab0, 0xfff2a0, 0x9ef0ff]));
  const grow = (start, dir, len, rad, depth) => {
    const end = start.clone().addScaledVector(dir, len);
    list.push(tube((t) => start.clone().lerp(end, t), (t) => rad * (1 - t * 0.35), {
      segs: 2, radial: 5, colorFn: (t) => base.clone().lerp(tipC, depth > 1 ? t * 0.8 : 0),
    }));
    if (depth >= 3) return;
    const nb = r.int(2, 3);
    for (let i = 0; i < nb; i++) {
      const nd = dir.clone().add(V(r.range(-0.7, 0.7), r.range(0.1, 0.6), r.range(-0.7, 0.7))).normalize();
      grow(end, nd, len * r.range(0.6, 0.85), rad * 0.72, depth + 1);
    }
  };
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) grow(V(r.range(-0.2, 0.2), -0.05, r.range(-0.2, 0.2)), V(r.range(-0.5, 0.5), 1, r.range(-0.5, 0.5)).normalize(), r.range(0.25, 0.4), 0.05, 0);
  return { parts: { coral: merge(list) }, radius: 0.5, height: 0.9 };
}

export function buildTableCoral(seed) {
  const r = rng(seed);
  const s = r.range(0.6, 1.3);
  const top = new THREE.CylinderGeometry(s, s * 0.85, 0.08, 24, 1);
  const p = top.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const d = Math.hypot(p.getX(i), p.getZ(i));
    p.setY(i, p.getY(i) + d * 0.18 + Math.sin(a * 11) * 0.02 * d);
  }
  top.translate(0, 0.45 * s, 0);
  const stalk = new THREE.CylinderGeometry(0.06, 0.12, 0.45 * s, 7);
  stalk.translate(0, 0.22 * s, 0);
  top.computeVertexNormals();
  const col = C(r.pick([0xb8a27a, 0x9ab38a, 0xc7a0b8, 0xd9c08a]));
  const g = merge([normalizeAttrs(top, col), normalizeAttrs(stalk, col.clone().multiplyScalar(0.7))]);
  return { parts: { coral: g }, radius: 0.2, height: 0.6 * s };
}

export function buildSeaFan(seed) {
  const r = rng(seed);
  const s = r.range(0.6, 1.2);
  let g = new THREE.PlaneGeometry(1.3 * s, 1.3 * s, 2, 2);
  g.translate(0, 0.62 * s, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2) * 0.1);
  g.computeVertexNormals();
  g = normalizeAttrs(g, C(r.pick([0xffffff, 0xffc0d8, 0xd0b0ff, 0xffd090])));
  return { parts: { seaFan: g }, radius: 0, height: 1.2 * s };
}

export function buildSeaGrass(seed) {
  const r = rng(seed);
  const blades = [];
  const n = r.int(14, 22);
  for (let i = 0; i < n; i++) {
    const az = r() * Math.PI * 2;
    const h = r.range(0.4, 1.0);
    const ox = r.range(-0.4, 0.4), oz = r.range(-0.4, 0.4);
    blades.push(ribbon((t) => V(ox + Math.cos(az) * 0.1 * t, h * t, oz + Math.sin(az) * 0.1 * t), () => 0.035, {
      segs: 4, side: V(-Math.sin(az), 0, Math.cos(az)), colorFn: (t) => C(0x3f6b2a).lerp(C(0x9bb35a), t).multiplyScalar(0.8 + r() * 0.3),
    }));
  }
  return { parts: { seaGrass: merge(blades) }, radius: 0, height: 1 };
}

export function buildAnemone(seed) {
  const r = rng(seed);
  const list = [];
  const col = C(r.pick([0xff7aa8, 0xb07aff, 0x7affd8, 0xffb37a]));
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * 3.1;
    const rr = 0.05 + (i / n) * 0.12;
    const s = V(Math.cos(a) * rr, 0.08, Math.sin(a) * rr);
    const d = V(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize();
    list.push(tube((t) => s.clone().addScaledVector(d, t * 0.18), (t) => 0.014 * (1 - t * 0.6), { segs: 2, radial: 4, colorFn: (t) => col.clone().lerp(C(0xffffff), t * 0.6) }));
  }
  const body = new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10);
  body.translate(0, 0.05, 0);
  list.push(normalizeAttrs(body, col.clone().multiplyScalar(0.6)));
  return { parts: { anemone: merge(list) }, radius: 0, height: 0.3 };
}

export function buildUrchin(seed) {
  const r = rng(seed);
  const list = [];
  const body = new THREE.SphereGeometry(0.08, 10, 8);
  body.scale(1, 0.7, 1);
  list.push(normalizeAttrs(body, C(0x1d1426)));
  for (let i = 0; i < 26; i++) {
    const d = V(r.range(-1, 1), r.range(0, 1), r.range(-1, 1)).normalize();
    const sp = new THREE.ConeGeometry(0.008, 0.16, 3);
    sp.translate(0, 0.08, 0);
    sp.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d));
    sp.translate(d.x * 0.06, d.y * 0.04, d.z * 0.06);
    list.push(normalizeAttrs(sp, C(0x2a1d38)));
  }
  return { parts: { coral: merge(list) }, radius: 0, height: 0.2 };
}

export function buildGiantClam() {
  const shellCol = C(0xcfc6b2), mantle = C(0x2f7fd0);
  const half = (sgn) => {
    const g = new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.55, 0.7);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setY(i, p.getY(i) * (1 + 0.15 * Math.abs(Math.sin(a * 5))));
    }
    g.computeVertexNormals();
    g.rotateZ(sgn * 1.25);
    g.translate(sgn * 0.05, 0.2, 0);
    return normalizeAttrs(g, shellCol);
  };
  const lip = new THREE.TorusGeometry(0.3, 0.07, 6, 20);
  lip.rotateX(Math.PI / 2); lip.scale(0.25, 1, 1); lip.translate(0, 0.38, 0);
  return { parts: { coral: merge([half(1), half(-1), normalizeAttrs(lip, mantle)]) }, radius: 0.4, height: 0.5 };
}

export function buildSubmergedBranch(seed) {
  const d = buildDriftwood(seed, true);
  return d;
}
