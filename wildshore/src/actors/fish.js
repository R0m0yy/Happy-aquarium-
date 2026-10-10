// Reef fish: boids schools that wander their habitat, avoid the seabed, surface and
// rocks, react to the diver (flee / scatter), hide among coral, and flee predators.
// Rendered as instanced meshes with a vertex-shader tail undulation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { terrainHeight, ISLANDS, HOME } from '../world/islands.js';
import { rng, clamp } from '../util/math.js';
import { normalizeAttrs } from '../render/geo.js';
import { patchMaterial } from '../render/materials.js';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

// species: geometry is built pointing +Z, tail at -Z
export const SPECIES = {
  barramundi: { name: 'Barramundi', len: 0.75, speed: 1.1, school: [3, 6], depth: [2.5, 14], wiggle: 0.08, item: 'rawFish', weight: 2.5 },
  tang: { name: 'Yellow Tang', len: 0.22, speed: 1.4, school: [10, 22], depth: [1.0, 7], wiggle: 0.12, item: 'rawFish', weight: 0.3, colors: [0xffd21a, 0xffc400], shape: 'disc' },
  parrot: { name: 'Parrotfish', len: 0.5, speed: 1.0, school: [3, 6], depth: [1.5, 9], wiggle: 0.1, item: 'rawFish', weight: 1.2, colors: [0x2fc7a9, 0x3f8fe0], shape: 'oval' },
  snapper: { name: 'Red Snapper', len: 0.55, speed: 1.2, school: [5, 10], depth: [4, 18], wiggle: 0.09, item: 'rawFish', weight: 1.5, colors: [0xe0584a, 0xf07a5a], shape: 'oval' },
  chromis: { name: 'Blue Chromis', len: 0.12, speed: 1.6, school: [20, 40], depth: [0.8, 6], wiggle: 0.14, item: null, colors: [0x3fb8ff, 0x58d8ff], shape: 'small' },
};

function proceduralFish(shape, color) {
  // lathe body flattened laterally + tail + dorsal fin
  const prof = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = Math.sin(Math.pow(t, 0.8) * Math.PI) * (shape === 'disc' ? 0.42 : shape === 'small' ? 0.2 : 0.22) * (t < 0.15 ? 0.9 : 1);
    prof.push(new THREE.Vector2(Math.max(0.002, r), t - 0.5));
  }
  let body = new THREE.LatheGeometry(prof, 12);
  body.rotateX(Math.PI / 2); // along z
  body.scale(shape === 'disc' ? 0.35 : 0.45, 1, 1);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.48, 0, 0.22, -0.72, 0, -0.22, -0.72, 0, 0, -0.48, 0, -0.22, -0.72, 0, 0.22, -0.72], 3));
  tail.computeVertexNormals();
  const fin = new THREE.BufferGeometry();
  const fh = shape === 'disc' ? 0.32 : 0.16;
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.15, 0.2, 0, 0.15 + fh, -0.1, 0, 0.12, -0.35, 0, 0.15, 0.2, 0, 0.12, -0.35, 0, 0.15 + fh, -0.1], 3));
  fin.computeVertexNormals();
  const c = new THREE.Color(color);
  body = normalizeAttrs(body, c);
  // darker back, pale belly, eye
  const p = body.attributes.position, col = body.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    const k = y > 0 ? 0.8 : 1.15;
    let r = c.r * k, g = c.g * k, b = c.b * k;
    if (z > 0.3 && Math.abs(y) < 0.06 && Math.abs(p.getX(i)) > 0.05) { r = g = b = 0.05; }
    col.setXYZ(i, Math.min(1, r), Math.min(1, g), Math.min(1, b));
  }
  const g = new THREE.BufferGeometry();
  const merged = [body, normalizeAttrs(tail, c.clone().multiplyScalar(0.8)), normalizeAttrs(fin, c.clone().multiplyScalar(0.75))];
  const { mergeGeometries } = THREE.BufferGeometryUtils || {};
  void g; void mergeGeometries;
  return merged;
}

function swimMaterial(base) {
  const m = patchMaterial(base, { caustics: true });
  const orig = m.onBeforeCompile;
  m.onBeforeCompile = (shader) => {
    orig(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float aPhase;
      attribute float aAmp;
      uniform float uFishLen;`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float zn = transformed.z / uFishLen; // -0.5 tail .. 0.5 head
        float w = pow(clamp(0.6 - zn, 0.0, 1.2), 2.0);
        transformed.x += sin(aPhase - zn * 6.0) * aAmp * w * uFishLen;
      }`);
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>`);
    shader.uniforms.uFishLen = m.userData.lenU;
  };
  m.userData.lenU = { value: 1 };
  return m;
}

export class FishSystem {
  constructor(game, quality) {
    this.game = game;
    this.schools = [];
    this.meshes = {};
    this.time = 0;
    this.count = quality.fishCount;
    this.root = new THREE.Group();
    game.scene.add(this.root);
  }

  async init() {
    let barraGeo = null, barraMat = null;
    try {
      const gltf = await new GLTFLoader().loadAsync('assets/models/fish.glb');
      gltf.scene.traverse((o) => { if (o.isMesh && !barraGeo) { barraGeo = o.geometry.clone(); barraMat = o.material; } });
      // normalise: centre & scale to 1m length along +z
      barraGeo.computeBoundingBox();
      const bb = barraGeo.boundingBox;
      const c = bb.getCenter(new THREE.Vector3());
      barraGeo.translate(-c.x, -c.y, -c.z);
      const L = bb.max.z - bb.min.z;
      barraGeo.scale(1 / L, 1 / L, 1 / L);
    } catch (e) { console.warn('fish model failed', e); }
    const defs = {};
    if (barraGeo) {
      const mat = swimMaterial(new THREE.MeshStandardMaterial({ map: barraMat.map, normalMap: barraMat.normalMap, color: 0xffffff, roughness: 0.35, metalness: 0.1, emissive: 0x223038 }));
      defs.barramundi = { geo: barraGeo, mat };
    }
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    for (const [id, sp] of Object.entries(SPECIES)) {
      if (id === 'barramundi') continue;
      const parts = proceduralFish(sp.shape, sp.colors[0]);
      const geo = mergeGeometries(parts);
      defs[id] = { geo, mat: swimMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide })) };
    }
    this.defs = defs;
    this.spawnSchools();
  }

  habitats() {
    // reef shelves around each island + the outer reef
    const list = [];
    const R = rng(77);
    for (const isl of ISLANDS) {
      const n = Math.round((isl.atoll ? 9 : isl.id === 'home' ? 10 : 5) * this.count);
      for (let i = 0; i < n; i++) {
        // find a point on the shelf
        for (let k = 0; k < 30; k++) {
          let a = R() * Math.PI * 2, d = isl.R * (1.1 + R() * (isl.reef - 0.9));
          if (isl.id === 'home' && R() < 0.5) { a = Math.atan2(HOME.reef.z, HOME.reef.x) + (R() - 0.5) * 1.2; }
          const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
          const h = terrainHeight(x, z);
          if (h < -1.2 && h > -16) { list.push({ x, z, h, isl: isl.id }); break; }
        }
      }
    }
    return list;
  }

  spawnSchools() {
    const R = rng(99);
    const hab = this.habitats();
    const ids = Object.keys(this.defs);
    const perSpecies = {};
    for (const hb of hab) {
      // choose a species suited to the depth
      const depth = -hb.h;
      const cands = ids.filter((id) => depth >= SPECIES[id].depth[0] && depth <= SPECIES[id].depth[1] + 3);
      const id = cands.length ? cands[Math.floor(R() * cands.length)] : 'chromis';
      if (!this.defs[id]) continue;
      const sp = SPECIES[id];
      const n = Math.round((sp.school[0] + R() * (sp.school[1] - sp.school[0])) * (0.6 + 0.4 * this.count));
      const school = { id, sp, home: new THREE.Vector3(hb.x, hb.h, hb.z), target: new THREE.Vector3(hb.x, hb.h + 1, hb.z), fish: [], fear: 0, island: hb.isl, retarget: 0 };
      for (let i = 0; i < n; i++) {
        const scale = sp.len * (0.75 + R() * 0.5);
        school.fish.push({
          p: new THREE.Vector3(hb.x + (R() - 0.5) * 3, hb.h + 1 + R() * 1.5, hb.z + (R() - 0.5) * 3),
          v: new THREE.Vector3(R() - 0.5, 0, R() - 0.5).multiplyScalar(sp.speed),
          scale, phase: R() * 10, alive: true, respawn: 0, tint: 0.8 + R() * 0.4,
        });
      }
      this.schools.push(school);
      (perSpecies[id] ||= []).push(school);
    }
    // instanced meshes per species
    for (const [id, schools] of Object.entries(perSpecies)) {
      const total = schools.reduce((a, s) => a + s.fish.length, 0);
      const d = this.defs[id];
      const geo = d.geo.clone();
      const phase = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
      const amp = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
      geo.setAttribute('aPhase', phase);
      geo.setAttribute('aAmp', amp);
      const mesh = new THREE.InstancedMesh(geo, d.mat, total);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      if (id !== 'barramundi') {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
        const c = new THREE.Color();
        let k = 0;
        for (const s of schools) for (const f of s.fish) { c.set(SPECIES[id].colors[k % 2]).multiplyScalar(f.tint); mesh.instanceColor.setXYZ(k++, c.r, c.g, c.b); }
      }
      d.mat.userData.lenU.value = 1;
      this.root.add(mesh);
      this.meshes[id] = { mesh, schools, phase, amp };
    }
  }

  // threats: [{pos, radius, strength}]
  update(dt, player, threats) {
    this.time += dt;
    const cam = this.game.rig.camera.position;
    for (const s of this.schools) {
      const far = s.home.distanceToSquared(cam) > 160 * 160;
      if (far) continue;
      s.retarget -= dt;
      if (s.retarget <= 0) {
        s.retarget = 4 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2, d = Math.random() * 10;
        const x = s.home.x + Math.cos(a) * d, z = s.home.z + Math.sin(a) * d;
        const g = terrainHeight(x, z);
        s.target.set(x, Math.min(-0.8, g + 0.6 + Math.random() * 2), z);
      }
      s.fear = Math.max(0, s.fear - dt * 0.3);
      const fl = s.fish;
      for (let i = 0; i < fl.length; i++) {
        const f = fl[i];
        if (!f.alive) {
          f.respawn -= dt;
          if (f.respawn <= 0 && f.p.distanceTo(cam) > 25) { f.alive = true; f.p.copy(s.home).add(_v.set(0, 1.5, 0)); }
          continue;
        }
        _a.set(0, 0, 0);
        // cohesion + alignment + separation (sampled neighbours for speed)
        let cnt = 0;
        const cx = new THREE.Vector3(), al = new THREE.Vector3();
        for (let k = 1; k <= 4; k++) {
          const o = fl[(i + k * 3) % fl.length];
          if (o === f || !o.alive) continue;
          cx.add(o.p); al.add(o.v); cnt++;
          _v.subVectors(f.p, o.p);
          const d2 = _v.lengthSq();
          const minD = s.sp.len * 1.2;
          if (d2 < minD * minD && d2 > 1e-6) _a.addScaledVector(_v, 2.5 / Math.sqrt(d2));
        }
        if (cnt) {
          cx.multiplyScalar(1 / cnt).sub(f.p);
          _a.addScaledVector(cx, 0.6);
          al.multiplyScalar(1 / cnt).sub(f.v);
          _a.addScaledVector(al, 0.5);
        }
        // seek wander target
        _v.subVectors(s.target, f.p);
        _a.addScaledVector(_v, 0.12 * (1 - s.fear * 0.5));
        // threats: diver, spear, shark, boats
        for (const t of threats) {
          _v.subVectors(f.p, t.pos);
          const d = _v.length();
          if (d < t.radius) {
            const k = (1 - d / t.radius) * t.strength;
            _a.addScaledVector(_v.normalize(), k * 6);
            s.fear = Math.min(1, s.fear + k * dt * 2);
          }
        }
        // stay off the bottom and below the surface
        const g = terrainHeight(f.p.x, f.p.z);
        if (f.p.y < g + 0.5) _a.y += (g + 0.5 - f.p.y) * 8;
        if (f.p.y > -0.4) _a.y -= (f.p.y + 0.4) * 10;
        // look-ahead terrain avoidance
        const ax = f.p.x + f.v.x * 0.8, az = f.p.z + f.v.z * 0.8;
        const ga = terrainHeight(ax, az);
        if (ga > f.p.y - 0.3) { _a.x -= f.v.x * 2; _a.z -= f.v.z * 2; _a.y += 2; }
        const maxSp = s.sp.speed * (1 + s.fear * 2.2);
        f.v.addScaledVector(_a, dt);
        const sp = f.v.length();
        if (sp > maxSp) f.v.multiplyScalar(maxSp / sp);
        if (sp < s.sp.speed * 0.25) f.v.multiplyScalar(1.05);
        f.v.y *= 0.96;
        f.p.addScaledVector(f.v, dt);
        f.phase += dt * (6 + sp * 8 / Math.max(0.3, s.sp.len * 2));
      }
    }
    // write instances
    for (const [id, M] of Object.entries(this.meshes)) {
      let k = 0;
      for (const s of M.schools) for (const f of s.fish) {
        if (f.alive) {
          _v.copy(f.v);
          if (_v.lengthSq() < 1e-5) _v.set(0, 0, 1);
          _v.normalize();
          _q.setFromUnitVectors(FWD, _v);
          _s.setScalar(f.scale);
        } else _s.setScalar(0);
        _m.compose(f.p, _q, _s);
        M.mesh.setMatrixAt(k, _m);
        M.phase.array[k] = f.phase;
        M.amp.array[k] = s.sp.wiggle * (1 + s.fear);
        k++;
      }
      M.mesh.instanceMatrix.needsUpdate = true;
      M.phase.needsUpdate = true;
      M.amp.needsUpdate = true;
    }
  }

  // spear strike: returns caught fish {species} or null
  strike(origin, dir, range = 2.2, cone = 0.45) {
    let best = null, bd = Infinity;
    for (const s of this.schools) {
      if (s.home.distanceToSquared(origin) > 60 * 60) continue;
      for (const f of s.fish) {
        if (!f.alive) continue;
        _v.subVectors(f.p, origin);
        const d = _v.length();
        if (d > range + f.scale * 0.5) continue;
        const ang = Math.acos(clamp(_v.dot(dir) / Math.max(d, 1e-4), -1, 1));
        if (ang > cone) continue;
        // escape chance: alert fish dodge
        if (d < bd) { bd = d; best = { s, f }; }
      }
    }
    if (!best) return null;
    const dodge = best.s.fear * 0.45 * (best.s.sp.speed > 1.3 ? 1.4 : 1);
    if (Math.random() < dodge) { best.s.fear = 1; return { missed: true, species: best.s.id }; }
    best.f.alive = false;
    best.f.respawn = 120 + Math.random() * 120;
    best.s.fear = 1;
    return { species: best.s.id, pos: best.f.p.clone(), sp: best.s.sp };
  }

  nearestFish(pos, maxD) {
    let best = null, bd = maxD;
    for (const s of this.schools) for (const f of s.fish) {
      if (!f.alive) continue;
      const d = f.p.distanceTo(pos);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  speciesNear(x, z, depth) {
    const ok = Object.keys(SPECIES).filter((id) => SPECIES[id].item && depth >= SPECIES[id].depth[0] - 0.5);
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : 'tang';
  }
}
