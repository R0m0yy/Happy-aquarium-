// Detailed procedural models for player-built structures. Every piece is dimensional
// (round poles, split planks, lashed joints, layered fronds) rather than textured boxes.
import * as THREE from 'three';
import { tube, ribbon, merge, normalizeAttrs, rockGeometry } from '../render/geo.js';
import { woodTexture, ropeTexture, thatchTexture, palmFrondTexture, palmBarkTexture, stoneTexture, leafClusterTexture } from '../render/textures.js';
import { patchMaterial } from '../render/materials.js';
import { rng } from '../util/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);

let M = null;
export function structureMats() {
  if (M) return M;
  const mk = (p, o) => patchMaterial(new THREE.MeshStandardMaterial(p), o);
  const plank = woodTexture('fresh');
  const weath = woodTexture('weathered');
  M = {
    pole: mk({ map: weath, bumpMap: weath, bumpScale: 2, roughness: 0.85, vertexColors: true }),
    plank: mk({ map: plank, bumpMap: plank, bumpScale: 1.5, roughness: 0.78, vertexColors: true }),
    log: mk({ map: palmBarkTexture(), bumpMap: palmBarkTexture(), bumpScale: 2, roughness: 0.9, vertexColors: true }),
    rope: mk({ map: ropeTexture(), roughness: 0.95 }),
    thatch: mk({ map: thatchTexture(), bumpMap: thatchTexture(), bumpScale: 3, roughness: 0.95, side: THREE.DoubleSide, vertexColors: true }, { fade: true }),
    frond: mk({ map: palmFrondTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true }, { fade: true, wind: 0.25, windMode: 'plant' }),
    stone: mk({ map: stoneTexture(), roughness: 0.85, vertexColors: true }),
    ash: mk({ color: 0x2b2622, roughness: 1 }),
    char: mk({ color: 0x1c1410, roughness: 0.9, emissive: 0x000000 }),
    clay: mk({ color: 0x9a5a3a, roughness: 0.8 }),
    basket: mk({ map: thatchTexture(), roughness: 0.9, vertexColors: true }),
    leafBed: mk({ map: leafClusterTexture('canopy'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true }),
    ghostOk: new THREE.MeshBasicMaterial({ color: 0x6dff9a, transparent: true, opacity: 0.35, depthWrite: false }),
    ghostBad: new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.35, depthWrite: false }),
    flame: new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uI: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uI; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 uv = vUv; float y = uv.y;
          float nn = n(vec2(uv.x * 5.0, y * 4.0 - uTime * 3.2)) * 0.6 + n(vec2(uv.x * 11.0, y * 8.0 - uTime * 5.0)) * 0.4;
          float w = (1.0 - y) * 0.42 + 0.04;
          float d = abs(uv.x - 0.5 + (nn - 0.5) * 0.18 * y);
          float a = smoothstep(w, w * 0.25, d) * smoothstep(1.0, 0.25, y + nn * 0.35) * smoothstep(0.0, 0.08, y);
          vec3 c = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.35, 0.06), smoothstep(0.1, 0.8, y + nn * 0.2));
          c *= 2.6;
          gl_FragColor = vec4(c * a * uI, a * uI);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  };
  return M;
}

function mesh(g, m, cast = true) { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; return x; }

// round pole between two points
function pole(a, b, r, seed = 0, colorShift = 1) {
  const r2 = rng(seed + 7);
  const bow = V(r2.range(-1, 1), 0, r2.range(-1, 1)).multiplyScalar(a.distanceTo(b) * 0.012);
  const col = C(0xffffff).multiplyScalar(colorShift * (0.85 + r2() * 0.25));
  return tube((t) => a.clone().lerp(b, t).addScaledVector(bow, Math.sin(t * Math.PI)), (t) => r * (1 - t * 0.12), { segs: 4, radial: 7, vScale: 0.7, colorFn: () => col });
}
function lash(at, dir, r) {
  const list = [];
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  for (let i = 0; i < 3; i++) {
    const g = new THREE.TorusGeometry(r + 0.012, 0.011, 4, 10);
    g.rotateX(Math.PI / 2);
    g.translate(0, (i - 1) * 0.026, 0);
    g.applyQuaternion(q);
    g.translate(at.x, at.y, at.z);
    list.push(g);
  }
  // diagonal wrap
  const d = new THREE.TorusGeometry(r + 0.015, 0.01, 4, 10);
  d.rotateX(Math.PI / 2 + 0.7); d.applyQuaternion(q); d.translate(at.x, at.y, at.z);
  list.push(d);
  return merge(list);
}
// split plank with slight irregularity
function plank(w, h, l, seed) {
  const r = rng(seed);
  const g = new THREE.BoxGeometry(w, h, l, 1, 1, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, p.getY(i) + Math.sin(p.getZ(i) * 2 + seed) * 0.006);
    p.setX(i, p.getX(i) * (0.95 + r() * 0.08));
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 2 + r(), uv.getY(i) * l * 0.5 + r());
  return normalizeAttrs(g, C(0xffffff).multiplyScalar(0.82 + r() * 0.3));
}
// a frond laid along a direction (for roofs)
function roofFrond(start, dir, side, L, seed, droop = 0.15) {
  const r = rng(seed);
  const col = C(0xd9c48a).lerp(C(0x9fb05a), r() * 0.6).multiplyScalar(0.85 + r() * 0.25);
  return ribbon((t) => start.clone().addScaledVector(dir, L * t).add(V(0, -droop * t * t, 0)), (t) => 1.25 * Math.sin(Math.min(1, t * 1.1 + 0.08) * Math.PI * 0.95) + 0.1,
    { segs: 6, fold: 0.22, side, colorFn: () => col });
}

// ---------------- builders ----------------
export const BUILD = {
  campfire(seed = 1) {
    const m = structureMats(), g = new THREE.Group(), r = rng(seed);
    const stones = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = rockGeometry(r, { detail: 1, sx: 0.17 + r() * 0.06, sy: 0.12 + r() * 0.05, sz: 0.15 + r() * 0.05, rough: 0.3, seed: i, color: C(0x8a857c).lerp(C(0x5d5a55), r() * 0.6) });
      s.rotateY(a);
      s.translate(Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62);
      stones.push(s);
    }
    g.add(mesh(merge(stones), m.stone));
    const ash = new THREE.CircleGeometry(0.55, 16); ash.rotateX(-Math.PI / 2); ash.translate(0, 0.02, 0);
    g.add(mesh(ash, m.ash, false));
    // teepee of logs
    const logs = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.3;
      logs.push(pole(V(Math.cos(a) * 0.45, 0.04, Math.sin(a) * 0.45), V(Math.cos(a) * 0.05, 0.55, Math.sin(a) * 0.05), 0.04, i));
    }
    const logMesh = mesh(merge(logs), m.pole);
    logMesh.name = 'logs';
    g.add(logMesh);
    const charG = [];
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      charG.push(pole(V(Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3), V(-Math.cos(a) * 0.3, 0.07, -Math.sin(a) * 0.3), 0.035, i + 20));
    }
    g.add(mesh(merge(charG), m.char));
    // flames: crossed animated billboards
    const fl = new THREE.Group(); fl.name = 'flames';
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.1), m.flame);
      p.position.y = 0.55; p.rotation.y = (i / 3) * Math.PI;
      p.layers.set(1);
      fl.add(p);
    }
    g.add(fl);
    const light = new THREE.PointLight(0xff8a3a, 0, 16, 1.5);
    light.position.y = 0.9; light.name = 'light';
    light.castShadow = false;
    light.layers.enableAll();
    g.add(light);
    return g;
  },

  cookingRack(seed = 2) {
    const m = structureMats(), g = new THREE.Group();
    const parts = [], lashes = [];
    // two Y-forked uprights + crossbar + grill sticks
    for (const s of [-1, 1]) {
      const base = V(s * 0.75, 0, 0), top = V(s * 0.72, 1.0, 0);
      parts.push(pole(base, top, 0.035, seed + s));
      parts.push(pole(top.clone().add(V(0, -0.12, 0)), top.clone().add(V(s * 0.12, 0.12, 0)), 0.022, seed + s + 4));
      parts.push(pole(top.clone().add(V(0, -0.12, 0)), top.clone().add(V(-s * 0.1, 0.12, 0)), 0.022, seed + s + 6));
    }
    parts.push(pole(V(-0.85, 1.0, 0), V(0.85, 1.0, 0), 0.03, seed + 9));
    // grill
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * 0.12;
      parts.push(pole(V(-0.55, 0.62, z), V(0.55, 0.62, z), 0.014, seed + 10 + i));
    }
    parts.push(pole(V(-0.55, 0.62, -0.3), V(-0.55, 0.62, 0.3), 0.018, 40), pole(V(0.55, 0.62, -0.3), V(0.55, 0.62, 0.3), 0.018, 41));
    parts.push(pole(V(-0.62, 0, 0.3), V(-0.55, 0.62, 0.3), 0.02, 42), pole(V(0.62, 0, -0.3), V(0.55, 0.62, -0.3), 0.02, 43));
    parts.push(pole(V(-0.62, 0, -0.3), V(-0.55, 0.62, -0.3), 0.02, 44), pole(V(0.62, 0, 0.3), V(0.55, 0.62, 0.3), 0.02, 45));
    lashes.push(lash(V(-0.72, 1.0, 0), V(1, 0, 0), 0.035), lash(V(0.72, 1.0, 0), V(1, 0, 0), 0.035));
    g.add(mesh(merge(parts), m.pole), mesh(merge(lashes), m.rope));
    const slots = new THREE.Group(); slots.name = 'slots'; g.add(slots);
    return g;
  },

  dryingRack(seed = 3) {
    const m = structureMats(), g = new THREE.Group();
    const parts = [], lashes = [];
    for (const x of [-1.1, 1.1]) {
      parts.push(pole(V(x, 0, -0.45), V(x, 1.55, 0), 0.04, seed + x * 3));
      parts.push(pole(V(x, 0, 0.45), V(x, 1.55, 0), 0.04, seed + x * 5));
      lashes.push(lash(V(x, 1.5, 0), V(1, 0, 0), 0.05));
    }
    parts.push(pole(V(-1.3, 1.52, 0), V(1.3, 1.52, 0), 0.035, seed + 11));
    for (const y of [1.15, 0.8]) {
      parts.push(pole(V(-1.15, y, -0.2 + (1.55 - y) * 0.2), V(1.15, y, -0.2 + (1.55 - y) * 0.2), 0.02, seed + y * 10));
      parts.push(pole(V(-1.15, y, 0.2 - (1.55 - y) * 0.2), V(1.15, y, 0.2 - (1.55 - y) * 0.2), 0.02, seed + y * 12));
    }
    g.add(mesh(merge(parts), m.pole), mesh(merge(lashes), m.rope));
    const slots = new THREE.Group(); slots.name = 'slots'; g.add(slots);
    return g;
  },

  waterCollector(seed = 4) {
    const m = structureMats(), g = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      parts.push(pole(V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6), V(Math.cos(a) * 0.1, 1.35, Math.sin(a) * 0.1), 0.03, seed + i));
    }
    g.add(mesh(merge(parts), m.pole));
    g.add(mesh(lash(V(0, 1.25, 0), V(0, 1, 0), 0.07), m.rope));
    // frond funnel
    const fr = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const d = V(Math.cos(a), 0.55, Math.sin(a)).normalize();
      fr.push(roofFrond(V(0, 0.9, 0), d, V(-Math.sin(a), 0, Math.cos(a)), 0.9, seed + i, -0.05));
    }
    g.add(mesh(merge(fr), m.frond));
    // catch pot
    const pot = new THREE.LatheGeometry([[0.0, 0], [0.16, 0.02], [0.2, 0.12], [0.18, 0.24], [0.15, 0.27], [0.16, 0.3]].map((p) => new THREE.Vector2(p[0], p[1])), 14);
    pot.translate(0, 0.3, 0);
    g.add(mesh(pot, m.clay));
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14), new THREE.MeshStandardMaterial({ color: 0x5aa0b0, roughness: 0.1, metalness: 0.2 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.42; water.name = 'water'; water.visible = false;
    g.add(water);
    return g;
  },

  storageBasket(seed = 5) {
    const m = structureMats(), g = new THREE.Group();
    const prof = [[0.0, 0], [0.32, 0.02], [0.4, 0.2], [0.42, 0.45], [0.38, 0.62], [0.36, 0.65]];
    const b = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 20);
    const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + Math.sin(a * 24 + p.getY(i) * 30) * 0.015;
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    b.computeVertexNormals();
    g.add(mesh(normalizeAttrs(b, C(0xd8c08a)), m.basket));
    const lid = new THREE.SphereGeometry(0.4, 18, 6, 0, Math.PI * 2, 0, Math.PI * 0.28);
    lid.translate(0, 0.32, 0);
    g.add(mesh(normalizeAttrs(lid, C(0xc9ae78)), m.basket));
    const ring = new THREE.TorusGeometry(0.37, 0.025, 5, 20); ring.rotateX(Math.PI / 2); ring.translate(0, 0.64, 0);
    g.add(mesh(ring, m.rope));
    return g;
  },

  palmShelter(seed = 6) {
    const m = structureMats(), g = new THREE.Group(), r = rng(seed);
    const parts = [], lashes = [];
    const W = 3.4, Hf = 1.9, D = 2.6;
    // forked uprights at the front
    for (const x of [-W / 2, W / 2]) {
      parts.push(pole(V(x, -0.2, 0), V(x, Hf, 0), 0.06, seed + x));
      parts.push(pole(V(x, Hf - 0.15, 0), V(x + 0.12, Hf + 0.15, 0.05), 0.035, seed + x + 3));
      lashes.push(lash(V(x, Hf - 0.06, 0), V(1, 0, 0), 0.06));
    }
    parts.push(pole(V(-W / 2 - 0.3, Hf, 0), V(W / 2 + 0.3, Hf, 0), 0.055, seed + 9));
    // rafters down to the ground behind
    const nR = 6;
    for (let i = 0; i < nR; i++) {
      const x = -W / 2 + (i / (nR - 1)) * W;
      parts.push(pole(V(x, Hf + 0.06, 0.05), V(x, 0.02, -D), 0.035, seed + 20 + i));
      lashes.push(lash(V(x, Hf + 0.02, 0.0), V(0, -Hf, -D), 0.035));
    }
    // purlins
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      parts.push(pole(V(-W / 2 - 0.1, Hf * (1 - t), -D * t), V(W / 2 + 0.1, Hf * (1 - t), -D * t), 0.025, seed + 30 + k));
    }
    g.add(mesh(merge(parts), m.pole), mesh(merge(lashes), m.rope));
    // layered frond roof (shingled bottom-up)
    const fr = [];
    const slope = V(0, -Hf, -D).normalize();
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 6; i++) {
        const x = -W / 2 + 0.15 + (i / 5) * (W - 0.3) + r.range(-0.15, 0.15);
        const t = 1 - (row + 0.5) / 4.2;
        const start = V(x, Hf * (1 - t) + 0.12 + row * 0.02, -D * t + 0.12);
        fr.push(roofFrond(start, slope.clone(), V(1, 0, 0), 1.25, seed + row * 10 + i, 0.05));
      }
    }
    // ridge cap fronds draped over the front
    for (let i = 0; i < 5; i++) {
      const x = -W / 2 + 0.2 + (i / 4) * (W - 0.4);
      fr.push(roofFrond(V(x, Hf + 0.15, -0.3), V(0, -0.4, 1).normalize(), V(1, 0, 0), 0.9, seed + 70 + i, 0.25));
    }
    g.add(mesh(merge(fr), m.frond));
    // leaf bedding
    const bed = new THREE.PlaneGeometry(2.0, 1.2, 4, 2); bed.rotateX(-Math.PI / 2);
    const bp = bed.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setY(i, 0.08 + Math.random() * 0.06);
    bed.translate(0, 0, -1.1);
    g.add(mesh(normalizeAttrs(bed, C(0xc8b080)), m.leafBed, false));
    return g;
  },

  woodenHut(seed = 7) {
    const m = structureMats(), g = new THREE.Group(), r = rng(seed);
    const W = 4.2, D = 3.6, FH = 1.0, WH = 1.9;
    const parts = [], lashes = [], planks = [];
    // stilts
    for (const x of [-W / 2, 0, W / 2]) for (const z of [-D / 2, D / 2]) {
      parts.push(pole(V(x, -0.4, z), V(x, FH + WH, z), 0.09, seed + x * 7 + z));
    }
    // floor joists + planks
    for (const z of [-D / 2, 0, D / 2]) parts.push(pole(V(-W / 2 - 0.2, FH - 0.08, z), V(W / 2 + 0.2, FH - 0.08, z), 0.06, seed + z * 3));
    const nP = Math.floor(W / 0.22);
    for (let i = 0; i < nP; i++) {
      const p = plank(0.2, 0.05, D + 0.3, seed + i);
      p.translate(-W / 2 + 0.11 + i * 0.22, FH, 0);
      planks.push(p);
    }
    // walls: vertical poles on back and sides, half-wall at front with doorway
    const wallPoles = [];
    const addWall = (a, b, h0, h1, step, skip) => {
      const L = a.distanceTo(b), n = Math.floor(L / step);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        if (skip && skip(t)) continue;
        const p = a.clone().lerp(b, t);
        wallPoles.push(pole(V(p.x, h0, p.z), V(p.x, h1 + Math.sin(i * 1.7) * 0.03, p.z), 0.045, seed + i * 13 + h1));
      }
    };
    addWall(V(-W / 2, 0, -D / 2), V(W / 2, 0, -D / 2), FH, FH + WH, 0.11);
    addWall(V(-W / 2, 0, -D / 2), V(-W / 2, 0, D / 2), FH, FH + WH, 0.11);
    addWall(V(W / 2, 0, -D / 2), V(W / 2, 0, D / 2), FH, FH + WH, 0.11);
    addWall(V(-W / 2, 0, D / 2), V(W / 2, 0, D / 2), FH, FH + 0.9, 0.11, (t) => t > 0.38 && t < 0.62);
    // wall plates
    for (const z of [-D / 2, D / 2]) parts.push(pole(V(-W / 2 - 0.1, FH + WH, z), V(W / 2 + 0.1, FH + WH, z), 0.05, seed + 50 + z));
    for (const x of [-W / 2, W / 2]) parts.push(pole(V(x, FH + WH, -D / 2 - 0.1), V(x, FH + WH, D / 2 + 0.1), 0.05, seed + 60 + x));
    // ladder
    for (const x of [-0.25, 0.25]) parts.push(pole(V(x, 0, D / 2 + 1.1), V(x, FH + 0.1, D / 2 + 0.1), 0.035, seed + 80 + x * 10));
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      parts.push(pole(V(-0.28, FH * t, D / 2 + 1.1 - t), V(0.28, FH * t, D / 2 + 1.1 - t), 0.022, seed + 90 + i));
    }
    // gable roof frame
    const RH = 1.6, ov = 0.6;
    const ridgeY = FH + WH + RH;
    parts.push(pole(V(-W / 2 - ov, ridgeY, 0), V(W / 2 + ov, ridgeY, 0), 0.06, seed + 100));
    for (const x of [-W / 2 - 0.3, 0, W / 2 + 0.3]) {
      parts.push(pole(V(x, ridgeY + 0.05, 0), V(x, FH + WH - 0.35, D / 2 + ov), 0.045, seed + 110 + x));
      parts.push(pole(V(x, ridgeY + 0.05, 0), V(x, FH + WH - 0.35, -D / 2 - ov), 0.045, seed + 120 + x));
      lashes.push(lash(V(x, ridgeY, 0), V(1, 0, 0), 0.06));
    }
    g.add(mesh(merge(parts), m.pole), mesh(merge(wallPoles), m.pole), mesh(merge(planks), m.plank), mesh(merge(lashes), m.rope));
    // thatch: shingled rows per side, each row slightly proud of the one above
    const thatch = [];
    const eaveY = FH + WH - 0.35;
    for (const sd of [1, -1]) {
      const dir = V(0, eaveY - ridgeY, sd * (D / 2 + ov));
      const L = dir.length();
      dir.normalize();
      const up = dir.clone().negate();
      const xA = V(1, 0, 0);
      const nrm = new THREE.Vector3().crossVectors(xA, up).normalize();
      if (nrm.y < 0) nrm.negate();
      const zA = new THREE.Vector3().crossVectors(xA, up);
      for (let row = 0; row < 4; row++) {
        const ga = new THREE.PlaneGeometry(W + 2 * ov + 0.2, 0.95, 10, 2);
        const p = ga.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3 + row) * 0.025 + (p.getY(i) < 0 ? 0.07 : 0));
        ga.computeVertexNormals();
        const basis = new THREE.Matrix4().makeBasis(xA, up, zA.dot(nrm) > 0 ? zA : zA.clone().negate());
        if (zA.dot(nrm) < 0) ga.scale(-1, 1, 1);
        ga.applyMatrix4(basis);
        const c = V(0, ridgeY + 0.08, 0).addScaledVector(dir, L * (row + 0.55) / 4).addScaledVector(nrm, 0.04 + (3 - row) * 0.0 + row * 0.02);
        ga.translate(c.x, c.y, c.z);
        thatch.push(normalizeAttrs(ga, C(0xffffff).multiplyScalar(0.85 + r() * 0.2)));
      }
    }
    // ridge bundle
    const rb = tube((t) => V(-W / 2 - ov, ridgeY + 0.12, 0).lerp(V(W / 2 + ov, ridgeY + 0.12, 0), t), () => 0.16, { segs: 6, radial: 8, colorFn: () => C(0xbfa46a) });
    thatch.push(rb);
    g.add(mesh(merge(thatch), m.thatch));
    // gable fronds
    const fr = [];
    for (const x of [-W / 2 - 0.05, W / 2 + 0.05]) {
      for (let i = 0; i < 4; i++) fr.push(roofFrond(V(x, ridgeY - 0.1 - i * 0.35, -0.8 + i * 0.5), V(0, -0.3, 1).normalize(), V(0, 1, 0).cross(V(1, 0, 0)), 0.9, seed + 200 + i, 0.1));
    }
    g.add(mesh(merge(fr), m.frond));
    return g;
  },

  raisedPlatform(seed = 8) {
    const m = structureMats(), g = new THREE.Group();
    const W = 3.6, D = 3.6, FH = 1.1;
    const parts = [], planks = [], lashes = [];
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) parts.push(pole(V(x, -0.6, z), V(x, FH + 0.9, z), 0.085, seed + x * 3 + z));
    for (const z of [-D / 2, 0, D / 2]) parts.push(pole(V(-W / 2 - 0.15, FH - 0.08, z), V(W / 2 + 0.15, FH - 0.08, z), 0.06, seed + z * 9));
    for (let i = 0; i < Math.floor(W / 0.22); i++) { const p = plank(0.2, 0.05, D + 0.25, seed + i); p.translate(-W / 2 + 0.11 + i * 0.22, FH, 0); planks.push(p); }
    // rail
    for (const z of [-D / 2, D / 2]) parts.push(pole(V(-W / 2, FH + 0.85, z), V(W / 2, FH + 0.85, z), 0.035, seed + 40 + z));
    parts.push(pole(V(-W / 2, FH + 0.85, -D / 2), V(-W / 2, FH + 0.85, D / 2), 0.035, seed + 44));
    // steps up from +x side
    for (let i = 0; i < 4; i++) {
      const p = plank(0.5, 0.05, 1.0, seed + 70 + i); p.rotateY(Math.PI / 2);
      p.translate(W / 2 + 0.4 + (3 - i) * 0.35, 0.25 + i * 0.25, 0);
      planks.push(p);
      parts.push(pole(V(W / 2 + 0.4 + (3 - i) * 0.35, -0.3, 0.5), V(W / 2 + 0.4 + (3 - i) * 0.35, 0.22 + i * 0.25, 0.5), 0.03, seed + 80 + i));
      parts.push(pole(V(W / 2 + 0.4 + (3 - i) * 0.35, -0.3, -0.5), V(W / 2 + 0.4 + (3 - i) * 0.35, 0.22 + i * 0.25, -0.5), 0.03, seed + 90 + i));
    }
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) lashes.push(lash(V(x, FH - 0.08, z), V(1, 0, 0), 0.09));
    g.add(mesh(merge(parts), m.pole), mesh(merge(planks), m.plank), mesh(merge(lashes), m.rope));
    return g;
  },

  dock(seed = 9) {
    const m = structureMats(), g = new THREE.Group();
    const L = 9, W = 1.6, FH = 0.95;
    const parts = [], planks = [], lashes = [];
    for (let i = 0; i <= 4; i++) {
      const z = (i / 4) * L;
      for (const x of [-W / 2, W / 2]) {
        parts.push(pole(V(x, -4.5, z), V(x, FH + 0.25, z), 0.08, seed + i * 3 + x));
        lashes.push(lash(V(x, FH - 0.1, z), V(0, 1, 0), 0.08));
      }
      parts.push(pole(V(-W / 2 - 0.15, FH - 0.1, z), V(W / 2 + 0.15, FH - 0.1, z), 0.055, seed + 30 + i));
    }
    for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) parts.push(pole(V(x, FH - 0.04, -0.2), V(x, FH - 0.04, L + 0.2), 0.05, seed + 50 + x));
    const nP = Math.floor(L / 0.24);
    for (let i = 0; i < nP; i++) { const p = plank(W + 0.25, 0.05, 0.21, seed + i); p.rotateY(0); p.translate(0, FH + 0.02, 0.1 + i * 0.24); planks.push(p); }
    // mooring post
    parts.push(pole(V(W / 2 + 0.25, -3, L), V(W / 2 + 0.25, FH + 0.6, L), 0.07, seed + 99));
    const coil = new THREE.TorusGeometry(0.1, 0.025, 5, 12); coil.rotateX(Math.PI / 2); coil.translate(W / 2 + 0.25, FH + 0.35, L);
    g.add(mesh(merge(parts), m.pole), mesh(merge(planks), m.plank), mesh(merge([...lashes, normalizeAttrs(coil)]), m.rope));
    return g;
  },

  boatShelter(seed = 10) {
    const m = structureMats(), g = new THREE.Group(), r = rng(seed);
    const W = 3.4, L = 6.4, H = 2.4;
    const parts = [], lashes = [], fr = [];
    for (const x of [-W / 2, W / 2]) for (const z of [-L / 2, 0, L / 2]) {
      parts.push(pole(V(x, -0.3, z), V(x, H, z), 0.07, seed + x * 5 + z));
      lashes.push(lash(V(x, H - 0.08, z), V(0, 0, 1), 0.07));
    }
    for (const x of [-W / 2, W / 2]) parts.push(pole(V(x, H, -L / 2 - 0.3), V(x, H, L / 2 + 0.3), 0.055, seed + 30 + x));
    parts.push(pole(V(0, H + 0.9, -L / 2 - 0.3), V(0, H + 0.9, L / 2 + 0.3), 0.05, seed + 40));
    for (let i = 0; i <= 5; i++) {
      const z = -L / 2 + (i / 5) * L;
      parts.push(pole(V(-W / 2 - 0.3, H - 0.15, z), V(0, H + 0.95, z), 0.03, seed + 50 + i));
      parts.push(pole(V(W / 2 + 0.3, H - 0.15, z), V(0, H + 0.95, z), 0.03, seed + 60 + i));
    }
    const sl = V(W / 2 + 0.3, -1.1, 0).normalize();
    for (const s of [-1, 1]) for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
      const z = -L / 2 + (i / 6) * L + r.range(-0.2, 0.2);
      const t = row / 3;
      fr.push(roofFrond(V(s * (W / 2 + 0.3) * t, H + 0.95 - 1.1 * t + 0.1, z), V(s * sl.x, sl.y, 0), V(0, 0, 1), 1.3, seed + 100 + row * 10 + i + s * 50, 0.05));
    }
    g.add(mesh(merge(parts), m.pole), mesh(merge(lashes), m.rope), mesh(merge(fr), m.frond));
    return g;
  },

  // construction frame shown while building
  scaffold(type) {
    const m = structureMats(), g = new THREE.Group();
    const s = { campfire: 0.8, cookingRack: 0.9, dryingRack: 1.3, waterCollector: 0.7, storageBasket: 0.5, palmShelter: 1.8, woodenHut: 2.6, raisedPlatform: 2.0, dock: 1.2, boatShelter: 2.5 }[type] || 1;
    const parts = [];
    for (const x of [-s, s]) for (const z of [-s, s]) parts.push(pole(V(x, 0, z), V(x * 0.9, s * 1.1, z * 0.9), 0.03, x * 3 + z));
    parts.push(pole(V(-s, s * 1.05, -s), V(s, s * 1.05, -s), 0.025, 7), pole(V(-s, s * 1.05, s), V(s, s * 1.05, s), 0.025, 8));
    g.add(mesh(merge(parts), m.pole));
    const pile = [];
    for (let i = 0; i < 6; i++) pile.push(pole(V(-0.6, 0.05 + i * 0.03, -0.3 + i * 0.1), V(0.6, 0.05 + i * 0.03, -0.25 + i * 0.1), 0.04, 20 + i));
    g.add(mesh(merge(pile), m.pole));
    return g;
  },
};

// food items displayed on racks / grills
const FOOD_COL = {
  rawFish: 0xb8c2c8, cookedFish: 0xc98a4a, driedFish: 0x9a6a3a, smokedFish: 0x7a4a2a,
  rawMeat: 0xc0505a, cookedMeat: 0x8a4a2a, driedMeat: 0x6a3a22, shellfish: 0x5a4a5a, cookedShellfish: 0xd0905a,
  crab: 0xb0503a, cookedCrab: 0xe0603a, egg: 0xf0eadc, cookedEgg: 0xd8c8a0, spoiled: 0x4a4a2a,
};
export function foodModel(id) {
  const col = FOOD_COL[id] ?? 0x999999;
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
  let g;
  if (/Fish/.test(id) || id === 'rawFish') {
    g = new THREE.SphereGeometry(0.1, 10, 6); g.scale(0.5, 0.9, 2.2);
    const tail = new THREE.ConeGeometry(0.07, 0.12, 4); tail.rotateX(Math.PI / 2); tail.translate(0, 0, -0.27);
    g = merge([g, tail]);
  } else if (/Meat/.test(id)) { g = new THREE.BoxGeometry(0.22, 0.08, 0.16, 2, 1, 2); }
  else if (/Crab|crab/.test(id)) { g = new THREE.SphereGeometry(0.09, 10, 6); g.scale(1.3, 0.5, 1); }
  else { g = new THREE.SphereGeometry(0.06, 8, 6); }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}
