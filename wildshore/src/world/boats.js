// Boats: log raft, dugout canoe and outrigger sailboat. Four-point buoyancy on the
// shared Gerstner field, paddle/sail thrust, quadratic drag with keel resistance,
// grounding, collision damage, wakes, cargo and repair.
import * as THREE from 'three';
import { tube, merge, normalizeAttrs, ribbon } from '../render/geo.js';
import { structureMats } from './structureModels.js';
import { terrainHeight } from './islands.js';
import { Inventory } from '../systems/inventory.js';
import { damp, clamp, angleDiff, rng } from '../util/math.js';
import { patchMaterial } from '../render/materials.js';
import { woodTexture, palmBarkTexture } from '../render/textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);

export const BOAT_DEFS = {
  raft: { name: 'Log Raft', len: 3.2, beam: 2.2, draft: 0.25, thrust: 2.1, maxSp: 2.6, turn: 0.9, lateral: 1.4, hp: 80, cargo: 8, seat: V(0, 0.35, -0.3), roll: 1.6, deck: 0.32 },
  canoe: { name: 'Dugout Canoe', len: 4.6, beam: 0.85, draft: 0.2, thrust: 4.2, maxSp: 5.2, turn: 1.6, lateral: 5, hp: 120, cargo: 14, seat: V(0, 0.12, -0.6), roll: 1, deck: 0.15 },
  sailboat: { name: 'Outrigger Sailboat', len: 5.6, beam: 1.0, draft: 0.3, thrust: 3.2, maxSp: 8.5, turn: 1.25, lateral: 6, hp: 180, cargo: 22, seat: V(0, 0.15, -1.6), roll: 0.6, sail: true, deck: 0.18 },
};

let BMATS = null;
function mats() {
  if (BMATS) return BMATS;
  BMATS = {
    hull: patchMaterial(new THREE.MeshStandardMaterial({ map: woodTexture('dark'), bumpMap: woodTexture('dark'), bumpScale: 1.5, roughness: 0.7, vertexColors: true })),
    log: patchMaterial(new THREE.MeshStandardMaterial({ map: palmBarkTexture(), bumpMap: palmBarkTexture(), bumpScale: 2, roughness: 0.9, vertexColors: true })),
    sail: patchMaterial(new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.95, side: THREE.DoubleSide })),
  };
  return BMATS;
}

function buildRaft() {
  const sm = structureMats(), m = mats(), g = new THREE.Group();
  const logs = [];
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.31;
    const r = rng(i + 3);
    const L = 3.2 + r.range(-0.2, 0.2);
    logs.push(tube((t) => V(x, 0.08, (t - 0.5) * L), (t) => 0.15 * (1 - 0.15 * t), { segs: 6, radial: 8, vScale: 0.6, colorFn: () => C(0xffffff).multiplyScalar(0.8 + r() * 0.3) }));
  }
  g.add(new THREE.Mesh(merge(logs), m.log));
  const cross = [];
  for (const z of [-1.1, 0, 1.1]) cross.push(tube((t) => V(-1.15 + t * 2.3, 0.26, z), () => 0.05, { segs: 3, radial: 6, colorFn: () => C(0xd0b08a) }));
  g.add(new THREE.Mesh(merge(cross), sm.pole));
  const lashes = [];
  for (const z of [-1.1, 0, 1.1]) for (let i = 0; i < 7; i++) {
    const t = new THREE.TorusGeometry(0.12, 0.012, 4, 8); t.translate((i - 3) * 0.31, 0.2, z); lashes.push(t);
  }
  g.add(new THREE.Mesh(merge(lashes), sm.rope));
  return g;
}

function buildCanoe(len = 4.6, beam = 0.85) {
  const m = mats(), sm = structureMats(), g = new THREE.Group();
  // hull: lofted cross-sections, hollowed
  const segs = 24, rad = 14;
  const pos = [], idx = [], uv = [];
  const width = (t) => Math.pow(Math.sin(t * Math.PI), 0.65) * beam * 0.5;
  const depth = (t) => 0.38 * Math.pow(Math.sin(t * Math.PI), 0.4) + 0.06;
  const sheer = (t) => 0.38 + Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.22;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = (t - 0.5) * len;
    for (let j = 0; j <= rad; j++) {
      const a = Math.PI * (j / rad); // 0..PI half-ellipse (outer)
      const w = width(t), d = depth(t);
      pos.push(Math.cos(a) * w, sheer(t) - Math.sin(a) * d, z);
      uv.push(j / rad, t * len * 0.5);
    }
  }
  const outerCount = pos.length / 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = (t - 0.5) * len;
    for (let j = 0; j <= rad; j++) {
      const a = Math.PI * (j / rad);
      const w = Math.max(0, width(t) - 0.06), d = Math.max(0, depth(t) - 0.07);
      pos.push(Math.cos(a) * w, sheer(t) - 0.005 - Math.sin(a) * d, z);
      uv.push(j / rad, t * len * 0.5);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
    const a2 = a + outerCount, b2 = b + outerCount;
    idx.push(a2, b2, a2 + 1, a2 + 1, b2, b2 + 1);
  }
  // gunwale caps
  for (let i = 0; i < segs; i++) for (const j of [0, rad]) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + outerCount, b, b + outerCount, a + outerCount);
  }
  let hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hg.setIndex(idx);
  hg.computeVertexNormals();
  hg = normalizeAttrs(hg, C(0xffffff));
  const hull = new THREE.Mesh(hg, m.hull);
  hull.material.side = THREE.DoubleSide;
  g.add(hull);
  // thwarts
  const th = [];
  for (const z of [-len * 0.18, len * 0.2]) th.push(tube((t) => V(-width(0.5 + z / len) + 0.04 + t * (width(0.5 + z / len) * 2 - 0.08), 0.36, z), () => 0.03, { segs: 2, radial: 5, colorFn: () => C(0xc8a070) }));
  g.add(new THREE.Mesh(merge(th), sm.pole));
  return g;
}

function buildSailboat() {
  const m = mats(), sm = structureMats();
  const g = buildCanoe(5.6, 1.0);
  const parts = [];
  // outrigger float + booms
  parts.push(tube((t) => V(2.0, 0.12, (t - 0.5) * 3.6), (t) => 0.1 * Math.pow(Math.sin(t * Math.PI), 0.4) + 0.02, { segs: 8, radial: 7, colorFn: () => C(0xb89068) }));
  for (const z of [-0.9, 0.9]) parts.push(tube((t) => V(t * 2.05, 0.42 + Math.sin(t * Math.PI) * 0.1 - t * 0.25, z), () => 0.04, { segs: 4, radial: 6, colorFn: () => C(0xc8a070) }));
  // mast
  parts.push(tube((t) => V(0, 0.3 + t * 4.4, 0.6), (t) => 0.06 * (1 - t * 0.5), { segs: 6, radial: 7, colorFn: () => C(0xc0a078) }));
  g.add(new THREE.Mesh(merge(parts), sm.pole));
  // crab-claw sail on a pivoting boom
  const sailPivot = new THREE.Group();
  sailPivot.position.set(0, 0.9, 0.6);
  sailPivot.name = 'sail';
  const spar = [];
  spar.push(tube((t) => V(0, t * 3.6, -t * 1.6), () => 0.035, { segs: 4, radial: 5, colorFn: () => C(0xb89068) }));
  spar.push(tube((t) => V(0, 0.1, -t * 2.4), () => 0.035, { segs: 4, radial: 5, colorFn: () => C(0xb89068) }));
  sailPivot.add(new THREE.Mesh(merge(spar), sm.pole));
  const sg = new THREE.BufferGeometry();
  const sp = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const top = V(0, t * 3.6, -t * 1.6), bot = V(0, 0.1, -t * 2.4);
    sp.push(top, bot);
  }
  const verts = [], ids = [];
  sp.forEach((p) => verts.push(p.x, p.y, p.z));
  for (let i = 0; i < N; i++) { const a = i * 2; ids.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  sg.setIndex(ids);
  sg.computeVertexNormals();
  const sail = new THREE.Mesh(sg, m.sail); sail.name = 'cloth';
  sailPivot.add(sail);
  g.add(sailPivot);
  return g;
}

export class Boats {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.root = new THREE.Group();
    game.scene.add(this.root);
  }

  spawn(type, x, z, heading, opts = {}) {
    const def = BOAT_DEFS[type];
    const mesh = type === 'raft' ? buildRaft() : type === 'canoe' ? buildCanoe() : buildSailboat();
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const paddle = this.game.makePaddle ? this.game.makePaddle() : null;
    const b = {
      type, def, mesh, x, z, y: 0, heading, speed: 0, side: 0, yawRate: 0, pitch: 0, roll: 0, rollVel: 0,
      hp: opts.hp ?? def.hp, cargo: new Inventory(def.cargo, 999), beached: false, id: opts.id || Math.random().toString(36).slice(2),
      sailAngle: 0, sailTrim: 0,
    };
    if (opts.cargo) b.cargo.restore(opts.cargo);
    this.root.add(mesh);
    this.list.push(b);
    this.place(b, 0);
    return b;
  }

  remove(b) { this.root.remove(b.mesh); this.list = this.list.filter((x) => x !== b); }

  nearest(x, z, maxD = 4) {
    let best = null, bd = maxD;
    for (const b of this.list) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // ctl: { throttle -1..1, steer -1..1 } when the survivor is aboard
  update(dt, env, driven, ctl) {
    const ocean = this.game.ocean;
    for (const b of this.list) {
      const def = b.def;
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
      let thrust = 0;
      if (b === driven && ctl) {
        thrust = ctl.throttle * def.thrust * (ctl.throttle < 0 ? 0.5 : 1);
        b.yawRate = damp(b.yawRate, -ctl.steer * def.turn * (0.4 + Math.min(1, Math.abs(b.speed) / 2) * 0.8), 3, dt);
        if (def.sail) {
          // apparent wind on the sail: no thrust within ~40 degrees of the eye of the wind
          const wAng = Math.atan2(env.windDir.x, env.windDir.y);
          const rel = Math.abs(angleDiff(b.heading, wAng));
          const eff = rel < 0.7 ? 0 : Math.sin(Math.min(Math.PI / 2, rel - 0.5)) * (rel > 2.4 ? 0.85 : 1);
          thrust += env.w.wind * 9 * eff * (ctl.sailUp ? 1 : 0);
          b.sailAngle = damp(b.sailAngle, clamp(angleDiff(b.heading, wAng + Math.PI) * 0.5, -1.2, 1.2), 2, dt);
        }
      } else {
        b.yawRate = damp(b.yawRate, 0, 2, dt);
      }
      // drag: forward quadratic, lateral strong (keel)
      const drag = 0.35 * b.speed * Math.abs(b.speed) + 0.25 * b.speed;
      b.speed += (thrust - drag) * dt;
      b.speed = clamp(b.speed, -def.maxSp * 0.4, def.maxSp);
      // wind & current drift
      const drift = env.w.wind * 0.35 / def.lateral;
      let vx = fx * b.speed + env.windDir.x * drift, vz = fz * b.speed + env.windDir.y * drift;
      b.heading += b.yawRate * dt;
      // waves push the raft around more
      if (b.type === 'raft') b.heading += Math.sin(ocean.time * 0.7 + b.x) * 0.05 * env.w.waves * dt;
      const nx = b.x + vx * dt, nz = b.z + vz * dt;
      // grounding
      const ground = terrainHeight(nx + fx * def.len * 0.45, nz + fz * def.len * 0.45);
      const water = ocean.heightAt(nx, nz);
      if (ground > water - def.draft) {
        if (Math.abs(b.speed) > 2.5) {
          const dmg = (Math.abs(b.speed) - 2) * 8;
          b.hp -= dmg;
          this.game.onBoatHit && this.game.onBoatHit(b, dmg);
        }
        b.speed *= -0.15;
        b.beached = true;
      } else {
        b.x = nx; b.z = nz; b.beached = false;
      }
      // storms damage unattended boats outside a shelter
      if (env.w.waves > 1.6 && b !== driven && !this.game.structures.isSheltered(b.x, b.z)) b.hp -= (env.w.waves - 1.6) * dt * 0.08;
      if (b === driven && env.w.waves > 1.5) b.hp -= (env.w.waves - 1.5) * dt * 0.04 * (b.type === 'raft' ? 2 : 1);
      this.place(b, dt);
      // wake
      if (Math.abs(b.speed) > 0.6 && Math.random() < dt * 12 * Math.min(1, Math.abs(b.speed) / 3)) {
        const back = -def.len * 0.45;
        const side = (Math.random() - 0.5) * def.beam;
        const wx = b.x + fx * back + Math.cos(b.heading) * side, wz = b.z + fz * back - Math.sin(b.heading) * side;
        this.game.fx.foam(wx, ocean.heightAt(wx, wz) + 0.05, wz, 2, 0.4);
      }
      if (Math.abs(b.speed) > 1 && Math.random() < dt * 1.5) this.game.ocean.addRipple(b.x, b.z, 0.5);
    }
    this.list = this.list.filter((b) => {
      if (b.hp > 0) return true;
      this.game.onBoatDestroyed && this.game.onBoatDestroyed(b);
      this.root.remove(b.mesh);
      return false;
    });
  }

  place(b, dt) {
    const ocean = this.game.ocean, def = b.def;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const rx = Math.cos(b.heading), rz = -Math.sin(b.heading);
    const L = def.len * 0.42, W = def.beam * 0.5;
    const hb = ocean.heightAt(b.x + fx * L, b.z + fz * L), hs = ocean.heightAt(b.x - fx * L, b.z - fz * L);
    const hp = ocean.heightAt(b.x - rx * W, b.z - rz * W), hst = ocean.heightAt(b.x + rx * W, b.z + rz * W);
    let y = (hb + hs + hp + hst) / 4 - def.draft * 0.5;
    const ground = terrainHeight(b.x, b.z);
    if (y < ground + 0.05) y = ground + 0.05; // resting on the sand
    const tPitch = Math.atan2(hs - hb, L * 2);
    const tRoll = Math.atan2(hp - hst, W * 2) * def.roll + b.yawRate * b.speed * 0.03;
    if (dt === 0) { b.y = y; b.pitch = tPitch; b.roll = tRoll; }
    else {
      b.y = damp(b.y, y, 6, dt);
      b.pitch = damp(b.pitch, tPitch, 5, dt);
      // second-order roll for a lively rock
      b.rollVel += ((tRoll - b.roll) * 22 - b.rollVel * 3.2) * dt;
      b.roll += b.rollVel * dt;
    }
    b.mesh.position.set(b.x, b.y, b.z);
    b.mesh.rotation.set(0, 0, 0);
    b.mesh.rotateY(b.heading);
    b.mesh.rotateX(b.pitch);
    b.mesh.rotateZ(b.roll);
    const sail = b.mesh.getObjectByName('sail');
    if (sail) sail.rotation.y = b.sailAngle;
  }

  seatTransform(b, outPos, outQuat) {
    b.mesh.updateMatrixWorld(true);
    outPos.copy(b.def.seat).applyMatrix4(b.mesh.matrixWorld);
    b.mesh.getWorldQuaternion(outQuat);
  }

  serialize() { return this.list.map((b) => ({ type: b.type, x: b.x, z: b.z, heading: b.heading, hp: b.hp, cargo: b.cargo.serialize(), id: b.id })); }
  restore(arr) {
    for (const b of [...this.list]) this.remove(b);
    for (const o of arr) this.spawn(o.type, o.x, o.z, o.heading, o);
  }
}
