// Procedural furniture and houseplant models for the room.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/util.js';
import { fabricTexture, toTexture, leafTexture, woodTexture, bookSpines } from './textures.js';

const matCache = new Map();
export function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}

export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

export function rbox(w, h, d, r = 0.03, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
}

// ------------------------------------------------------------------- sofa
export function makeSofa(color = '#d6cfc4') {
  const g = new THREE.Group();
  const fab = new THREE.MeshStandardMaterial({ map: toTexture(fabricTexture(color, 4), { repeat: [3, 3] }), roughness: 0.92, color: 0xffffff });
  const fabDark = new THREE.MeshStandardMaterial({ map: toTexture(fabricTexture(color, 4), { repeat: [3, 3] }), roughness: 0.95, color: 0xcfc8c0 });
  const L = 2.5, D = 1.0;
  const base = new THREE.Mesh(rbox(L, 0.32, D, 0.06), fabDark);
  base.position.y = 0.26;
  g.add(base);
  // seat cushions
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(rbox(L / 3 - 0.04, 0.17, D - 0.22, 0.07, 4), fab);
    c.position.set(-L / 3 + i * (L / 3), 0.5, 0.08);
    c.rotation.x = 0.02;
    g.add(c);
  }
  const back = new THREE.Mesh(rbox(L, 0.62, 0.24, 0.08, 4), fabDark);
  back.position.set(0, 0.68, -D / 2 + 0.12);
  back.rotation.x = -0.12;
  g.add(back);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(rbox(L / 3 - 0.06, 0.48, 0.2, 0.09, 4), fab);
    c.position.set(-L / 3 + i * (L / 3), 0.78, -D / 2 + 0.3);
    c.rotation.x = -0.2;
    g.add(c);
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(rbox(0.22, 0.55, D, 0.08, 4), fabDark);
    arm.position.set(s * (L / 2 + 0.06), 0.42, 0);
    g.add(arm);
  }
  // throw pillows
  const pillowCols = ['#b8b0a2', '#7a8a9a', '#c9a27a'];
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(rbox(0.42, 0.4, 0.14, 0.07, 4), new THREE.MeshStandardMaterial({ map: toTexture(fabricTexture(pillowCols[i], 6), { repeat: [2, 2] }), roughness: 0.9 }));
    p.position.set((i ? 1 : -1) * (L / 2 - 0.35), 0.78, -0.12);
    p.rotation.set(-0.3, (i ? -1 : 1) * 0.25, (i ? -1 : 1) * 0.12);
    g.add(p);
  }
  const legM = mat('legs', () => new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.5 }));
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.1, 8), legM);
    leg.position.set(x * (L / 2), 0.05, z * (D / 2 - 0.08));
    g.add(leg);
  }
  g.userData.seatHeight = 0.58;
  return shadowAll(g);
}

// ------------------------------------------------------------ coffee table
export function makeCoffeeTable() {
  const g = new THREE.Group();
  const wood = mat('ctwood', () => new THREE.MeshStandardMaterial({ map: toTexture(woodTexture('walnut'), { repeat: [1, 1] }), roughness: 0.45 }));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 48), wood);
  top.position.y = 0.42;
  g.add(top);
  const shelf = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 40), wood);
  shelf.position.y = 0.12;
  g.add(shelf);
  const legM = mat('metal', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.7, roughness: 0.35 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), legM);
    leg.position.set(Math.cos(a) * 0.48, 0.21, Math.sin(a) * 0.48);
    g.add(leg);
  }
  // mug
  const mugM = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.3 });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 20, 1, true), mugM);
  mug.position.set(0.2, 0.5, 0.1);
  g.add(mug);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.048, 20), new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.2 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(0.2, 0.535, 0.1);
  g.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16), mugM);
  handle.position.set(0.255, 0.5, 0.1);
  g.add(handle);
  // books
  const bookCols = [0x2a4a6a, 0xc8b890, 0x7a2a2a];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(rbox(0.32 - i * 0.03, 0.035, 0.24 - i * 0.02, 0.008, 2), new THREE.MeshStandardMaterial({ color: bookCols[i], roughness: 0.7 }));
    b.position.set(-0.18, 0.47 + i * 0.036, -0.05);
    b.rotation.y = 0.2 + i * 0.15;
    g.add(b);
  }
  return shadowAll(g);
}

// ---------------------------------------------------------------- lamps
export function makeFloorLamp() {
  const g = new THREE.Group();
  const metal = mat('brass', () => new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.85, roughness: 0.3 }));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 32), metal);
  base.position.y = 0.02;
  g.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.7, 8), metal);
  pole.position.y = 0.87;
  g.add(pole);
  const shadeM = new THREE.MeshStandardMaterial({ color: 0xfff2dc, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.96 });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.36, 40, 1, true), shadeM);
  shade.position.y = 1.78;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe0b0 }));
  bulb.position.y = 1.72;
  g.add(bulb);
  g.userData.shade = shadeM;
  g.userData.bulb = bulb;
  g.userData.lightPos = new THREE.Vector3(0, 1.7, 0);
  return shadowAll(g, true, false);
}

export function makePendant(len = 1.0) {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, len, 4), mat('cord', () => new THREE.MeshBasicMaterial({ color: 0x111111 })));
  cord.position.y = -len / 2;
  g.add(cord);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 12), mat('brass', () => new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.85, roughness: 0.3 })));
  cap.position.y = -len - 0.03;
  g.add(cap);
  const glassM = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffb060, emissiveIntensity: 0, roughness: 0.1, transparent: true, opacity: 0.55 });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 18), glassM);
  globe.position.y = -len - 0.15;
  g.add(globe);
  const fil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
  fil.position.y = -len - 0.15;
  g.add(fil);
  g.userData.glass = glassM;
  g.userData.fil = fil;
  return g;
}

export function makeTableLamp() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshStandardMaterial({ color: 0x5a7a8a, roughness: 0.25, metalness: 0.1 }));
  base.scale.y = 1.2;
  base.position.y = 0.14;
  g.add(base);
  const shadeM = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.9, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.2, 32, 1, true), shadeM);
  shade.position.y = 0.38;
  g.add(shade);
  g.userData.shade = shadeM;
  return shadowAll(g, true, false);
}

// ----------------------------------------------------------- side table
export function makeSideTable() {
  const g = new THREE.Group();
  const wood = mat('ctwood', () => new THREE.MeshStandardMaterial({ map: toTexture(woodTexture('walnut')), roughness: 0.45 }));
  const top = new THREE.Mesh(rbox(0.5, 0.04, 0.5, 0.015), wood);
  top.position.y = 0.56;
  g.add(top);
  const box = new THREE.Mesh(rbox(0.46, 0.3, 0.46, 0.015), wood);
  box.position.y = 0.38;
  g.add(box);
  const legM = mat('metal', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.7, roughness: 0.35 }));
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.24, 0.025), legM);
    l.position.set(x * 0.2, 0.12, z * 0.2);
    g.add(l);
  }
  return shadowAll(g);
}

// --------------------------------------------------------------- shelves
export function makeShelf(width, color = '#4a2f1e') {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: toTexture(woodTexture('cabinet', color)), roughness: 0.55 });
  const board = new THREE.Mesh(rbox(width, 0.06, 0.36, 0.01), wood);
  g.add(board);
  // under-shelf LED strip
  const led = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.008, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb870 }));
  led.position.set(0, -0.034, 0.12);
  g.add(led);
  g.userData.led = led;
  return shadowAll(g);
}

export function makeBooks(width, seed = 1) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const tex = toTexture(bookSpines(seed));
  let x = -width / 2;
  const cols = [0x7a2a2a, 0x2a4a6a, 0xd8c8a0, 0x3a5a3a, 0xc89a4a, 0x5a3a5a, 0xe8e0d0, 0x1e2a3a];
  const geos = [];
  const spineMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
  while (x < width / 2 - 0.03) {
    const w = 0.025 + rng() * 0.035;
    const h = 0.2 + rng() * 0.1;
    const d = 0.16 + rng() * 0.06;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
      new THREE.MeshStandardMaterial({ color: cols[Math.floor(rng() * cols.length)], roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: cols[Math.floor(rng() * cols.length)], roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0xeee6d4, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0xeee6d4, roughness: 0.9 }),
      spineMat,
      new THREE.MeshStandardMaterial({ color: 0xeee6d4, roughness: 0.9 }),
    ]);
    const tilt = rng() < 0.08 ? 0.25 : 0;
    b.position.set(x + w / 2, h / 2, 0);
    b.rotation.z = -tilt;
    g.add(b);
    x += w + 0.002 + (tilt ? 0.05 : 0);
    if (rng() < 0.06) x += 0.12;
  }
  return shadowAll(g, true, true);
}

export function makeGlobeTerrarium() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.18, clearcoat: 1, envMapIntensity: 1.5 }));
  glass.position.y = 0.17;
  g.add(glass);
  const soil = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 12, 0, Math.PI * 2, Math.PI * 0.65, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 }));
  soil.position.y = 0.17;
  g.add(soil);
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 1 }));
  moss.scale.y = 0.5;
  moss.position.set(0.02, 0.07, 0);
  g.add(moss);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 24), mat('brass', () => new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.85, roughness: 0.3 })));
  base.position.y = 0.015;
  g.add(base);
  return g;
}

export function makeFrame(tex, w, h, frameColor = 0x1a1410) {
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.5 });
  const frame = new THREE.Mesh(rbox(w + 0.08, h + 0.08, 0.04, 0.008), fm);
  g.add(frame);
  const mt = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.9 }));
  mt.position.z = 0.021;
  g.add(mt);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.82), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  art.position.z = 0.022;
  g.add(art);
  return shadowAll(g, false, true);
}

// ------------------------------------------------------------- houseplants
function potGeometry(r = 0.22, h = 0.4) {
  const pts = [];
  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(r * 0.72, 0));
  pts.push(new THREE.Vector2(r * 0.8, h * 0.08));
  pts.push(new THREE.Vector2(r, h * 0.9));
  pts.push(new THREE.Vector2(r * 1.04, h));
  pts.push(new THREE.Vector2(r * 0.94, h));
  pts.push(new THREE.Vector2(r * 0.92, h * 0.92));
  return new THREE.LatheGeometry(pts, 36);
}

function leafGeo(len, width, bend, shape = 'oval', segs = 8) {
  // leaf in XY plane, base at origin, extends +Y; bent backward along Z
  const s = new THREE.Shape();
  if (shape === 'monstera') {
    s.moveTo(0, 0);
    s.bezierCurveTo(width * 0.9, len * 0.05, width * 1.05, len * 0.65, 0, len);
    s.bezierCurveTo(-width * 1.05, len * 0.65, -width * 0.9, len * 0.05, 0, 0);
  } else if (shape === 'blade') {
    s.moveTo(-width * 0.5, 0);
    s.quadraticCurveTo(-width * 0.6, len * 0.6, 0, len);
    s.quadraticCurveTo(width * 0.6, len * 0.6, width * 0.5, 0);
    s.lineTo(-width * 0.5, 0);
  } else if (shape === 'heart') {
    s.moveTo(0, 0);
    s.bezierCurveTo(width * 1.1, -len * 0.1, width * 0.8, len * 0.7, 0, len);
    s.bezierCurveTo(-width * 0.8, len * 0.7, -width * 1.1, -len * 0.1, 0, 0);
  } else {
    s.moveTo(0, 0);
    s.bezierCurveTo(width * 0.7, len * 0.15, width * 0.6, len * 0.75, 0, len);
    s.bezierCurveTo(-width * 0.6, len * 0.75, -width * 0.7, len * 0.15, 0, 0);
  }
  const geo = new THREE.ShapeGeometry(s, segs);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = y / len;
    pos.setZ(i, -bend * t * t * len + Math.abs(x) * 0.25);
    uv.setXY(i, x / (width * 2.2) + 0.5, t);
  }
  geo.computeVertexNormals();
  return geo;
}

export function makeHouseplant(kind = 'monstera', seed = 1, potColor = 0xe8e4dc) {
  const g = new THREE.Group();
  const rng = makeRng(seed + kind);
  const potM = new THREE.MeshStandardMaterial({ color: potColor, roughness: 0.55 });
  const pr = kind === 'small' ? 0.1 : kind === 'snake' ? 0.16 : 0.24;
  const ph = kind === 'small' ? 0.16 : kind === 'snake' ? 0.32 : 0.42;
  const pot = new THREE.Mesh(potGeometry(pr, ph), potM);
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(pr * 0.92, 24), new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = ph * 0.9;
  g.add(soil);
  const leafColor = kind === 'snake' ? '#3f6a3a' : kind === 'pothos' ? '#5a9a3c' : '#2f6a2c';
  const lm = new THREE.MeshStandardMaterial({ map: toTexture(leafTexture(leafColor, kind === 'palm' ? 'fern' : 'broad')), side: THREE.DoubleSide, roughness: 0.6 });
  const stemM = mat('stem', () => new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.8 }));
  const leaves = [];
  const stems = [];
  if (kind === 'monstera' || kind === 'fiddle' || kind === 'small') {
    const count = kind === 'small' ? 7 : 11;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.6;
      const h = (kind === 'small' ? 0.15 : 0.6) + rng() * (kind === 'small' ? 0.1 : 0.7);
      const tip = new THREE.Vector3(Math.cos(a) * Math.sin(tilt) * h, ph + Math.cos(tilt) * h, Math.sin(a) * Math.sin(tilt) * h);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, ph * 0.9, 0), new THREE.Vector3(tip.x * 0.3, tip.y * 0.85, tip.z * 0.3), tip);
      stems.push(new THREE.TubeGeometry(curve, 8, kind === 'small' ? 0.006 : 0.012, 5, false));
      const L = kind === 'small' ? 0.12 : 0.32 + rng() * 0.18;
      const lg = leafGeo(L, L * (kind === 'monstera' ? 0.55 : 0.4), 0.35, kind === 'monstera' ? 'monstera' : 'oval');
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9 - rng() * 0.6, -a + Math.PI / 2, 0, 'YXZ'));
      m.compose(tip, q, new THREE.Vector3(1, 1, 1));
      lg.applyMatrix4(m);
      leaves.push(lg);
    }
  } else if (kind === 'snake') {
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const L = 0.5 + rng() * 0.45;
      const lg = leafGeo(L, 0.07, 0.05 + rng() * 0.1, 'blade', 6);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 0.05, ph * 0.9, Math.sin(a) * 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.3, a, (rng() - 0.5) * 0.3)), new THREE.Vector3(1, 1, 1));
      lg.applyMatrix4(m);
      leaves.push(lg);
    }
  } else if (kind === 'palm') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.3;
      const h = 0.9 + rng() * 0.6;
      const tip = new THREE.Vector3(Math.cos(a) * 0.35, ph + h, Math.sin(a) * 0.35);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, ph, 0), new THREE.Vector3(tip.x * 0.2, ph + h * 0.7, tip.z * 0.2), tip);
      stems.push(new THREE.TubeGeometry(curve, 8, 0.01, 5, false));
      for (let k = 0; k < 14; k++) {
        const t = k / 14;
        const p = curve.getPoint(0.45 + t * 0.55);
        for (const side of [-1, 1]) {
          const lg = leafGeo(0.3 - t * 0.12, 0.025, 0.2, 'blade', 4);
          const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.2 - t * 0.5, -a + Math.PI / 2 + side * 1.1, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
          lg.applyMatrix4(m);
          leaves.push(lg);
        }
      }
    }
  } else if (kind === 'pothos') {
    // trailing vine for shelves
    for (let v = 0; v < 4; v++) {
      const pts = [];
      const a = rng() * Math.PI * 2;
      for (let k = 0; k < 8; k++) pts.push(new THREE.Vector3(Math.cos(a) * (0.1 + k * 0.03) + Math.sin(k) * 0.03, ph - k * 0.12 * (0.6 + v * 0.2), Math.sin(a) * 0.1 + 0.12 + k * 0.01));
      const curve = new THREE.CatmullRomCurve3(pts);
      stems.push(new THREE.TubeGeometry(curve, 20, 0.004, 4, false));
      for (let k = 0; k < 12; k++) {
        const p = curve.getPoint(k / 12);
        const lg = leafGeo(0.07, 0.045, 0.1, 'heart', 5);
        const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6 + rng(), rng() * 6, rng() - 0.5)), new THREE.Vector3(1, 1, 1));
        lg.applyMatrix4(m);
        leaves.push(lg);
      }
    }
  }
  if (stems.length) g.add(new THREE.Mesh(mergeGeometries(stems), stemM));
  if (leaves.length) g.add(new THREE.Mesh(mergeGeometries(leaves), lm));
  return shadowAll(g);
}

// ------------------------------------------------------------- step stool
export function makeStool() {
  const g = new THREE.Group();
  const wood = mat('stoolwood', () => new THREE.MeshStandardMaterial({ map: toTexture(woodTexture('walnut')), roughness: 0.5 }));
  const top = new THREE.Mesh(rbox(0.46, 0.05, 0.3, 0.015), wood);
  top.position.set(0, 0.47, -0.04);
  g.add(top);
  const step = new THREE.Mesh(rbox(0.46, 0.04, 0.18, 0.012), wood);
  step.position.set(0, 0.24, 0.18);
  g.add(step);
  for (const x of [-0.2, 0.2]) {
    const side = new THREE.Mesh(rbox(0.04, 0.47, 0.5, 0.01), wood);
    side.position.set(x, 0.235, 0.05);
    g.add(side);
  }
  g.userData.topHeight = 0.495;
  g.userData.stepHeight = 0.26;
  return shadowAll(g);
}

// --------------------------------------------------------- aquarium supplies
export function makeSupplies() {
  const g = new THREE.Group();
  const jarCols = [0xd0a040, 0x40a060, 0xc04040];
  for (let i = 0; i < 3; i++) {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.1 }));
    jar.position.set(i * 0.11, 0.06, 0);
    g.add(jar);
    const food = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16), new THREE.MeshStandardMaterial({ color: jarCols[i], roughness: 0.9 }));
    food.position.set(i * 0.11, 0.045, 0);
    g.add(food);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.025, 16), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
    lid.position.set(i * 0.11, 0.13, 0);
    g.add(lid);
  }
  return shadowAll(g);
}

export function makeCoralPiece(color = 0xf0d8c8) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const rng = makeRng(color);
  const geos = [];
  const branch = (p, dir, len, depth) => {
    const end = p.clone().addScaledVector(dir, len);
    const curve = new THREE.LineCurve3(p, end);
    geos.push(new THREE.TubeGeometry(curve, 2, 0.012 * (depth + 1), 5, false));
    if (depth > 0) for (let i = 0; i < 2; i++) {
      const nd = dir.clone().add(new THREE.Vector3((rng() - 0.5) * 1.2, 0.3, (rng() - 0.5) * 1.2)).normalize();
      branch(end, nd, len * 0.7, depth - 1);
    }
  };
  branch(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.08, 3);
  g.add(new THREE.Mesh(mergeGeometries(geos), m));
  return shadowAll(g);
}
