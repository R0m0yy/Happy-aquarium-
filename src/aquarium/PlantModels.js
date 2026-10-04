// Procedural aquatic plant models. Every geometry carries a vertex colour and
// an aSway weight so the shared shader can animate them in the current.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/util.js';
import { tankStandard } from '../render/materials.js';
import { toTexture, leafTexture } from '../render/textures.js';

const matCache = new Map();
function plantMaterial(color, style = 'broad', extra = {}) {
  const key = `${color}:${style}:${JSON.stringify(extra)}`;
  if (!matCache.has(key)) {
    matCache.set(key, tankStandard({ map: toTexture(leafTexture(color, style)), vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0, ...extra }, { sway: true }));
  }
  return matCache.get(key);
}

function finalize(geo, height, colorFn) {
  const p = geo.attributes.position;
  const sway = new Float32Array(p.count);
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, p.getY(i) / Math.max(0.01, height)));
    sway[i] = t;
    colorFn(t, c, i);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}

// A leaf ribbon grown along an arching path.
function leaf({ base, yaw, pitch0 = 0.2, bend = 0.8, length = 0.2, width = 0.04, seg = 8, shape = 'oval', fold = 0.25, twist = 0, wave = 0 }) {
  const pos = [], uv = [], idx = [];
  const dir = new THREE.Vector3();
  let p = base.clone();
  const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const th = pitch0 + bend * t * t;
    dir.set(Math.sin(th) * Math.cos(yaw), Math.cos(th), Math.sin(th) * Math.sin(yaw));
    let w;
    switch (shape) {
      case 'oval': w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.75); break;
      case 'lance': w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.65)), 0.9); break;
      case 'ribbon': w = t > 0.85 ? (1 - t) / 0.15 : 1; break;
      case 'round': w = Math.sqrt(Math.max(0, Math.sin(Math.PI * t))); break;
      default: w = Math.sin(Math.PI * t);
    }
    w *= width;
    const s = side.clone().applyAxisAngle(dir, twist * t);
    const nrm = new THREE.Vector3().crossVectors(s, dir).normalize();
    const wv = wave ? Math.sin(t * 18) * wave * w : 0;
    const l = p.clone().addScaledVector(s, w / 2).addScaledVector(nrm, fold * w * 0.5 + wv);
    const r = p.clone().addScaledVector(s, -w / 2).addScaledVector(nrm, fold * w * 0.5 - wv);
    pos.push(l.x, l.y, l.z, p.x, p.y, p.z, r.x, r.y, r.z);
    uv.push(0, t, 0.5, t, 1, t);
    if (i < seg) {
      const a = i * 3;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
    p = p.addScaledVector(dir, length / seg);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function stem(points, radius = 0.004) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, Math.max(4, points.length * 3), radius, 5, false);
  return g;
}

function prep(geos) {
  // strip to common attributes
  return geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
}

const C = (hex) => new THREE.Color(hex);

export function buildPlant(def, seed = 1) {
  const rng = makeRng(seed * 13 + def.id.length);
  const group = new THREE.Group();
  const H = def.height;
  let geos = [];
  let colorFn = (t, c) => c.copy(C(0x9ac08a)).lerp(C(0xffffff), t * 0.3);
  let style = 'broad';
  let leafColor = '#3d7a32';
  let radius = 0.08;
  let extra = {};

  switch (def.model) {
    case 'anubias': {
      leafColor = '#2f6a2a';
      for (let i = 0; i < 9; i++) {
        const yaw = rng() * Math.PI * 2;
        const base = new THREE.Vector3((rng() - 0.5) * 0.06, 0.01, (rng() - 0.5) * 0.04);
        const petiole = leaf({ base, yaw, pitch0: 0.6 + rng() * 0.4, bend: 0.2, length: 0.06 + rng() * 0.04, width: 0.006, seg: 3, shape: 'ribbon', fold: 0 });
        geos.push(petiole);
        const p = petiole.attributes.position;
        const tip = new THREE.Vector3(p.getX(p.count - 2), p.getY(p.count - 2), p.getZ(p.count - 2));
        geos.push(leaf({ base: tip, yaw, pitch0: 0.7 + rng() * 0.4, bend: 0.6, length: 0.09 + rng() * 0.05, width: 0.06 + rng() * 0.02, seg: 7, shape: 'oval', fold: 0.35 }));
      }
      // rhizome
      geos.push(stem([new THREE.Vector3(-0.05, 0.008, 0), new THREE.Vector3(0, 0.012, 0.01), new THREE.Vector3(0.05, 0.008, -0.01)], 0.008));
      colorFn = (t, c) => c.copy(C(0x6a8a50)).lerp(C(0xc8e8b0), Math.min(1, t * 1.1));
      extra = { roughness: 0.3 };
      radius = 0.09;
      break;
    }
    case 'javafern': {
      leafColor = '#3d7a32';
      style = 'fern';
      for (let i = 0; i < 13; i++) {
        const yaw = rng() * Math.PI * 2;
        geos.push(leaf({ base: new THREE.Vector3((rng() - 0.5) * 0.05, 0.01, (rng() - 0.5) * 0.04), yaw, pitch0: 0.15 + rng() * 0.35, bend: 0.9 + rng() * 0.6, length: H * (0.6 + rng() * 0.5), width: 0.035 + rng() * 0.015, seg: 9, shape: 'lance', fold: 0.3, wave: 0.15 }));
      }
      colorFn = (t, c) => c.copy(C(0x5a8a40)).lerp(C(0xd0f0a0), t * 0.6);
      radius = 0.1;
      break;
    }
    case 'sword': {
      leafColor = '#3f8a36';
      for (let i = 0; i < 16; i++) {
        const yaw = (i / 16) * Math.PI * 2 + rng() * 0.4;
        geos.push(leaf({ base: new THREE.Vector3(0, 0.01, 0), yaw, pitch0: 0.1 + rng() * 0.3, bend: 1.0 + rng() * 0.5, length: H * (0.6 + rng() * 0.5), width: 0.04 + rng() * 0.015, seg: 10, shape: 'lance', fold: 0.3 }));
      }
      colorFn = (t, c) => c.copy(C(0x5a8a40)).lerp(C(0xc8f0a0), t * 0.7);
      radius = 0.14;
      break;
    }
    case 'rotala':
    case 'ludwigia': {
      const red = def.model === 'rotala';
      leafColor = red ? '#c0603a' : '#a8603a';
      const stems = red ? 10 : 7;
      for (let s = 0; s < stems; s++) {
        const bx = (rng() - 0.5) * 0.09, bz = (rng() - 0.5) * 0.07;
        const h = H * (0.65 + rng() * 0.4);
        const lean = (rng() - 0.5) * 0.08;
        const pts = [];
        for (let k = 0; k <= 4; k++) pts.push(new THREE.Vector3(bx + lean * (k / 4) ** 2, (k / 4) * h, bz + Math.sin(k + s) * 0.01));
        geos.push(stem(pts, 0.0028));
        const nodes = red ? 14 : 9;
        for (let k = 1; k <= nodes; k++) {
          const t = k / (nodes + 1);
          const y = t * h;
          for (let q = 0; q < (red ? 4 : 2); q++) {
            const yaw = (q / (red ? 4 : 2)) * Math.PI * 2 + k * 0.9;
            geos.push(leaf({ base: new THREE.Vector3(bx + lean * t * t, y, bz), yaw, pitch0: 0.9, bend: 0.3, length: red ? 0.04 * (1 - t * 0.3) : 0.045, width: red ? 0.008 : 0.022, seg: 3, shape: red ? 'lance' : 'oval', fold: 0.2 }));
          }
        }
      }
      colorFn = red
        ? (t, c) => c.copy(C(0x6aa048)).lerp(C(0xff6a50), Math.pow(t, 1.6))
        : (t, c) => c.copy(C(0x8a9a48)).lerp(C(0xe06040), t);
      style = 'thin';
      radius = 0.07;
      break;
    }
    case 'vallis': {
      leafColor = '#5a9a3c';
      for (let i = 0; i < 22; i++) {
        const yaw = rng() * Math.PI * 2;
        geos.push(leaf({ base: new THREE.Vector3((rng() - 0.5) * 0.1, 0.0, (rng() - 0.5) * 0.06), yaw, pitch0: 0.02 + rng() * 0.08, bend: 0.25 + rng() * 0.6, length: H * (0.7 + rng() * 0.45), width: 0.012 + rng() * 0.006, seg: 16, shape: 'ribbon', fold: 0.1, twist: (rng() - 0.5) * 2 }));
      }
      colorFn = (t, c) => c.copy(C(0x7aa858)).lerp(C(0xd8f8b0), t * 0.6);
      radius = 0.08;
      break;
    }
    case 'moss': {
      leafColor = '#3c7a2a';
      const mound = new THREE.IcosahedronGeometry(0.06, 2);
      const p = mound.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setY(i, Math.max(0, y) * 0.55);
        p.setX(i, p.getX(i) * (1.2 + Math.sin(i) * 0.1));
        p.setZ(i, p.getZ(i) * (1 + Math.cos(i) * 0.1));
      }
      mound.computeVertexNormals();
      geos.push(mound);
      for (let i = 0; i < 70; i++) {
        const a = rng() * Math.PI * 2, r = rng() * 0.065;
        const base = new THREE.Vector3(Math.cos(a) * r * 1.2, 0.033 * (1 - (r / 0.065) ** 2) * 0.9, Math.sin(a) * r);
        geos.push(leaf({ base, yaw: a, pitch0: 0.4 + rng() * 0.6, bend: 0.5, length: 0.02 + rng() * 0.02, width: 0.008, seg: 2, shape: 'lance', fold: 0 }));
      }
      colorFn = (t, c, i) => c.copy(C(0x3a6a28)).lerp(C(0x8ad060), t * 0.8 + ((i * 37) % 10) * 0.02);
      radius = 0.07;
      break;
    }
    case 'hairgrass': {
      leafColor = '#6fb244';
      for (let i = 0; i < 70; i++) {
        const a = rng() * Math.PI * 2, r = rng() * 0.08;
        geos.push(leaf({ base: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), yaw: rng() * 6.28, pitch0: rng() * 0.25, bend: rng() * 0.5, length: H * (0.6 + rng() * 0.5), width: 0.003, seg: 4, shape: 'ribbon', fold: 0 }));
      }
      colorFn = (t, c) => c.copy(C(0x5a9a3a)).lerp(C(0xc8f890), t);
      radius = 0.08;
      break;
    }
    case 'crypt': {
      leafColor = '#6a5a2a';
      for (let i = 0; i < 11; i++) {
        const yaw = rng() * Math.PI * 2;
        geos.push(leaf({ base: new THREE.Vector3(0, 0.005, 0), yaw, pitch0: 0.3 + rng() * 0.4, bend: 0.8, length: H * (0.7 + rng() * 0.5), width: 0.035, seg: 8, shape: 'lance', fold: 0.2, wave: 0.35 }));
      }
      colorFn = (t, c) => c.copy(C(0x6a6a38)).lerp(C(0xd8b070), t * 0.7);
      radius = 0.08;
      break;
    }
    case 'lotus': {
      leafColor = '#9a2a3a';
      style = 'lotus';
      for (let i = 0; i < 7; i++) {
        const yaw = rng() * Math.PI * 2;
        const len = H * (0.35 + rng() * 0.5);
        const pet = leaf({ base: new THREE.Vector3(0, 0.005, 0), yaw, pitch0: 0.1 + rng() * 0.3, bend: 0.3, length: len, width: 0.006, seg: 5, shape: 'ribbon', fold: 0 });
        geos.push(pet);
        const p = pet.attributes.position;
        const tip = new THREE.Vector3(p.getX(p.count - 2), p.getY(p.count - 2), p.getZ(p.count - 2));
        geos.push(leaf({ base: tip, yaw, pitch0: 1.1, bend: 0.4, length: 0.1 + rng() * 0.04, width: 0.1, seg: 7, shape: 'round', fold: 0.15, wave: 0.12 }));
      }
      colorFn = (t, c) => c.copy(C(0x7a3a3a)).lerp(C(0xff8a8a), t * 0.5);
      radius = 0.12;
      break;
    }
    case 'carpet': {
      leafColor = '#5ab03a';
      for (let i = 0; i < 160; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.13;
        geos.push(leaf({ base: new THREE.Vector3(Math.cos(a) * r, 0.002 + rng() * 0.015, Math.sin(a) * r * 0.8), yaw: rng() * 6.28, pitch0: 1.0 + rng() * 0.5, bend: 0.2, length: 0.012, width: 0.012, seg: 2, shape: 'round', fold: 0 }));
      }
      colorFn = (t, c, i) => c.copy(C(0x6ab84a)).lerp(C(0xb8f080), ((i * 13) % 7) / 7);
      radius = 0.13;
      break;
    }
    case 'floaters': {
      leafColor = '#6aaa3e';
      for (let i = 0; i < 24; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.16;
        const base = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
        geos.push(leaf({ base, yaw: rng() * 6.28, pitch0: Math.PI / 2 - 0.05, bend: 0, length: 0.025 + rng() * 0.012, width: 0.03, seg: 3, shape: 'round', fold: -0.1 }));
        // dangling roots
        geos.push(leaf({ base: base.clone().add(new THREE.Vector3(0, -0.002, 0)), yaw: rng() * 6.28, pitch0: Math.PI - 0.1, bend: 0, length: 0.03 + rng() * 0.05, width: 0.002, seg: 2, shape: 'ribbon', fold: 0 }));
      }
      colorFn = (t, c) => c.copy(C(0xa8d880));
      radius = 0.0;
      break;
    }
    default:
      break;
  }
  const merged = mergeGeometries(prep(geos));
  finalize(merged, def.model === 'floaters' ? 1 : H, colorFn);
  if (def.model === 'floaters') {
    // sway gently as a raft
    const s = merged.attributes.aSway;
    for (let i = 0; i < s.count; i++) s.setX(i, 0.35);
  }
  const mesh = new THREE.Mesh(merged, plantMaterial(leafColor, style, extra));
  mesh.castShadow = def.model !== 'carpet' && def.model !== 'moss';
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.radius = radius;
  return group;
}

// A tiny flower used for blooming plants (lotus, anubias)
export function buildFlower(color = 0xfff4f0) {
  const g = new THREE.Group();
  const petalM = tankStandard({ color, roughness: 0.4, side: THREE.DoubleSide, emissive: 0x221818 });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), petalM);
    p.scale.set(1, 0.3, 0.55);
    const a = (i / 6) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.016, 0, Math.sin(a) * 0.016);
    p.rotation.y = -a;
    p.rotation.z = 0.5;
    g.add(p);
  }
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), tankStandard({ color: 0xffd040, emissive: 0x443300 }));
  c.position.y = 0.004;
  g.add(c);
  return g;
}
