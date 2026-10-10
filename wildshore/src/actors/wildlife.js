// Wildlife with needs-driven behaviour and senses (vision cone, hearing scaled by the
// survivor's noise), fear, fleeing, territory/habitat, hit reactions and carcasses.
// Species: ghost crabs, seabirds, monitor lizards, wild pigs, green turtles, reef sharks.
import * as THREE from 'three';
import { tube, merge, normalizeAttrs, ribbon } from '../render/geo.js';
import { terrainHeight, ISLANDS, ISLAND_BY_ID, HUNTER, PONDS } from '../world/islands.js';
import { rng, damp, dampAngle, clamp, angleDiff } from '../util/math.js';
import { patchMaterial } from '../render/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
const _v = new THREE.Vector3();

function mat(color, rough = 0.7, extra = {}) {
  return patchMaterial(new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }), { caustics: true });
}
function m(g, material) { const x = new THREE.Mesh(g, material); x.castShadow = true; x.receiveShadow = true; return x; }

// ---------------- models (part hierarchies for procedural animation) ----------------
function crabModel(r) {
  const g = new THREE.Group();
  const shell = mat(r() < 0.5 ? 0xd9a26a : 0xc8603a, 0.5);
  const body = new THREE.SphereGeometry(0.11, 12, 8); body.scale(1.25, 0.45, 1);
  g.add(m(body, shell));
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 4), shell);
    eye.position.set(s * 0.035, 0.06, 0.08); g.add(eye);
  }
  const legs = [];
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.11, 0, (i - 1.5) * 0.045);
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.11, 4), shell);
    seg1.rotation.z = s * -1.0; seg1.position.set(s * 0.045, 0.02, 0);
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.12, 4), shell);
    seg2.rotation.z = s * 0.35; seg2.position.set(s * 0.11, -0.03, 0);
    leg.add(seg1, seg2);
    leg.userData = { s, i };
    g.add(leg); legs.push(leg);
  }
  const claws = [];
  for (const s of [-1, 1]) {
    const c = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.08, 5), shell);
    arm.rotation.x = Math.PI / 2; arm.position.z = 0.04;
    const pincer = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), shell); pincer.scale.set(0.8, 0.6, 1.4); pincer.position.z = 0.1;
    c.add(arm, pincer);
    c.position.set(s * 0.07, 0.01, 0.1);
    g.add(c); claws.push(c);
  }
  g.userData = { legs, claws };
  return g;
}

function gullModel() {
  const g = new THREE.Group();
  const white = mat(0xf2f2ee, 0.8), grey = mat(0x8a929a, 0.8), beak = mat(0xe8b23a, 0.5), dark = mat(0x222222, 0.6);
  const body = new THREE.SphereGeometry(0.12, 10, 8); body.scale(0.8, 0.8, 2);
  g.add(m(body, white));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), white); head.position.set(0, 0.08, 0.22); g.add(head);
  const bk = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 6), beak); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.07, 0.32); g.add(bk);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), grey); tail.rotation.x = -Math.PI / 2; tail.scale.set(1, 1, 0.3); tail.position.set(0, 0.02, -0.28); g.add(tail);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.16), grey); inner.position.x = s * 0.17;
    const outer = new THREE.Group(); outer.position.x = s * 0.34;
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.01, 0.12), grey); o.position.x = s * 0.17;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), dark); tip.position.x = s * 0.34;
    outer.add(o, tip);
    w.add(inner, outer);
    w.position.set(s * 0.06, 0.05, 0.02);
    w.userData = { s, outer };
    g.add(w); wings.push(w);
  }
  const legs = [];
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), beak); l.position.set(s * 0.04, -0.13, 0); g.add(l); legs.push(l); }
  g.userData = { wings, legs, head };
  return g;
}

function lizardModel(r) {
  const g = new THREE.Group();
  const skin = mat(r() < 0.5 ? 0x5a6a3a : 0x6a5a3a, 0.6);
  const spine = tube((t) => V(0, 0.05 + Math.sin(t * Math.PI) * 0.02, 0.35 - t * 1.0), (t) => (t < 0.35 ? 0.06 * Math.sin((t / 0.35) * Math.PI * 0.6 + 0.6) : 0.05 * (1 - (t - 0.35) / 0.65) + 0.005), { segs: 14, radial: 7 });
  const body = m(spine, skin); g.add(body);
  const legs = [];
  for (const [s, z] of [[-1, 0.18], [1, 0.18], [-1, -0.12], [1, -0.12]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.12, 5), skin);
    l.rotation.z = s * 1.1; l.position.set(s * 0.07, 0.02, z);
    g.add(l); legs.push(l);
  }
  g.userData = { legs, body };
  return g;
}

function pigModel(r, boar) {
  const g = new THREE.Group();
  const hide = mat(boar ? 0x3a2a22 : 0x5a4232, 0.95);
  const snout = mat(0x8a6a5a, 0.7);
  const s = boar ? 1.15 : 1;
  const body = new THREE.SphereGeometry(0.32, 16, 12); body.scale(0.85, 0.85, 1.55);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) { if (p.getY(i) > 0.15 && p.getZ(i) > -0.1) p.setY(i, p.getY(i) * 1.12); } // hump
  body.computeVertexNormals();
  const torso = m(body, hide); torso.position.y = 0.5; g.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.55, 0.48);
  const hg = new THREE.SphereGeometry(0.19, 12, 10); hg.scale(0.85, 0.9, 1.15);
  head.add(m(hg, hide));
  const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 10), snout); sn.rotation.x = Math.PI / 2; sn.position.set(0, -0.04, 0.2); head.add(sn);
  for (const sd of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), hide); ear.position.set(sd * 0.1, 0.15, -0.02); ear.rotation.set(-0.3, 0, sd * 0.5); head.add(ear);
    if (boar) { const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 4), mat(0xeeeadd, 0.4)); tusk.position.set(sd * 0.07, -0.05, 0.25); tusk.rotation.x = -0.6; head.add(tusk); }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), mat(0x111111, 0.3)); eye.position.set(sd * 0.09, 0.05, 0.12); head.add(eye);
  }
  // bristly mane
  const mane = ribbon((t) => V(0, 0.82 + Math.sin(t * Math.PI) * 0.03, 0.35 - t * 0.7), () => 0.06, { segs: 6, side: V(0, 0, 1).cross(V(0, 1, 0)).normalize() });
  g.add(m(mane, hide));
  g.add(head);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.18, 4), hide); tail.position.set(0, 0.6, -0.5); tail.rotation.x = 0.6; g.add(tail);
  const legs = [];
  for (const [sx, z] of [[-1, 0.28], [1, 0.28], [-1, -0.3], [1, -0.3]]) {
    const leg = new THREE.Group(); leg.position.set(sx * 0.15, 0.4, z);
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.4, 6), hide); lg.position.y = -0.2;
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 6), mat(0x1a1410, 0.6)); hoof.position.y = -0.41;
    leg.add(lg, hoof);
    g.add(leg); legs.push(leg);
  }
  g.scale.setScalar(s);
  g.userData = { legs, head, torso, tail };
  return g;
}

function turtleModel() {
  const g = new THREE.Group();
  const shellM = mat(0x5a5032, 0.5), skin = mat(0x7a8a6a, 0.7);
  const shell = new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); shell.scale(0.85, 0.42, 1.1);
  const col = new Float32Array(shell.attributes.position.count * 3);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i);
    const k = 0.75 + 0.35 * Math.abs(Math.sin(a * 5) * Math.cos(y * 18));
    col[i * 3] = 0.55 * k + 0.2; col[i * 3 + 1] = 0.48 * k + 0.15; col[i * 3 + 2] = 0.3 * k + 0.1;
  }
  shell.setAttribute('color', new THREE.BufferAttribute(col, 3));
  shellM.vertexColors = true; shellM.color.set(0xffffff);
  g.add(m(shell, shellM));
  const plast = new THREE.CircleGeometry(0.42, 16); plast.rotateX(Math.PI / 2); plast.scale(1, 1, 1.25); g.add(m(plast, mat(0xd8d0a0, 0.6)));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin); head.scale.set(0.9, 0.8, 1.3); head.position.set(0, 0.05, 0.62); g.add(head);
  const flippers = [];
  for (const [s, z, L] of [[-1, 0.3, 0.55], [1, 0.3, 0.55], [-1, -0.38, 0.25], [1, -0.38, 0.25]]) {
    const f = new THREE.Group(); f.position.set(s * 0.38, 0.02, z);
    const fg = new THREE.BoxGeometry(L, 0.03, L * 0.35); fg.translate(s * L * 0.5, 0, -L * 0.1);
    f.add(m(fg, skin)); f.userData = { s, front: z > 0 };
    g.add(f); flippers.push(f);
  }
  g.userData = { flippers, head };
  return g;
}

function sharkModel() {
  const g = new THREE.Group();
  const skin = mat(0x6a7a86, 0.45);
  const body = tube((t) => V(0, 0, 1.0 - t * 2.1), (t) => 0.23 * Math.pow(Math.sin(Math.min(1, t * 1.05 + 0.02) * Math.PI), 0.8) * (t > 0.6 ? 1 - (t - 0.6) * 1.6 : 1) + 0.02, { segs: 16, radial: 10, colorFn: () => C(0xffffff) });
  const bp = body.attributes.position, bc = body.attributes.color;
  for (let i = 0; i < bp.count; i++) { if (bp.getY(i) < -0.05) bc.setXYZ(i, 1.4, 1.35, 1.3); }
  const tailG = new THREE.Group(); tailG.position.z = -0.95;
  const fin = (pts) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); ge.computeVertexNormals(); return ge; };
  tailG.add(m(fin([0, 0, 0, 0, 0.55, -0.35, 0, 0.05, -0.15, 0, 0, 0, 0, -0.35, -0.3, 0, 0.05, -0.15]), skin));
  const dorsal = m(fin([0, 0.18, 0.2, 0, 0.55, -0.15, 0, 0.18, -0.25]), skin);
  const pecs = [];
  for (const s of [-1, 1]) pecs.push(m(fin([s * 0.15, -0.08, 0.35, s * 0.6, -0.25, 0.05, s * 0.15, -0.08, 0.1]), skin));
  const bm = m(body, skin); skin.vertexColors = true;
  const front = new THREE.Group(); front.add(bm, dorsal, ...pecs);
  g.add(front, tailG);
  skin.side = THREE.DoubleSide;
  g.userData = { tail: tailG, body: front };
  g.scale.setScalar(1.3);
  return g;
}

// ---------------- base animal ----------------
class Animal {
  constructor(sys, kind, x, z, opts = {}) {
    this.sys = sys; this.kind = kind;
    this.pos = new THREE.Vector3(x, terrainHeight(x, z), z);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.state = 'wander';
    this.timer = Math.random() * 3;
    this.target = new THREE.Vector3(x, 0, z);
    this.home = new THREE.Vector3(x, 0, z);
    this.hp = opts.hp || 20; this.maxHp = this.hp;
    this.awareness = 0;
    this.hunger = Math.random() * 0.5; this.thirst = Math.random() * 0.5; this.energy = 0.6 + Math.random() * 0.4;
    this.dead = false; this.butchered = false;
    this.anim = Math.random() * 10;
    this.island = opts.island;
    this.aiTimer = Math.random() * 0.2;
    this.hurtTimer = 0;
  }
  // senses: returns 0..1 how strongly the survivor is perceived
  perceive(player, range, fov = 2.4, hearing = 20) {
    if (!player || player.state === 'dead') return 0;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    let p = 0;
    const ang = Math.abs(angleDiff(this.heading, Math.atan2(dx, dz)));
    const conceal = player.crouch ? 0.5 : 1;
    if (d < range * conceal && ang < fov * 0.5) p = Math.max(p, 1 - d / (range * conceal));
    const hr = hearing * player.noise;
    if (d < hr) p = Math.max(p, (1 - d / hr) * 0.9);
    if (d < 2.2) p = 1;
    return p;
  }
  moveToward(x, z, speed, dt, turn = 5) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) { this.speed = damp(this.speed, 0, 6, dt); return true; }
    this.heading = dampAngle(this.heading, Math.atan2(dx, dz), turn, dt);
    this.speed = damp(this.speed, speed, 4, dt);
    return false;
  }
  integrate(dt, landOnly = true) {
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const h = terrainHeight(nx, nz);
    if (landOnly && h < 0.15) { this.heading += Math.PI * 0.6; this.speed *= 0.5; return; }
    _v.set(nx, 0, nz);
    this.sys.game.collideWorld(_v, 0.3);
    this.pos.x = _v.x; this.pos.z = _v.z;
    this.pos.y = damp(this.pos.y, terrainHeight(this.pos.x, this.pos.z), 12, dt);
  }
  hit(dmg, from) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtTimer = 0.6;
    this.awareness = 1;
    this.sys.game.fx.blood(this.pos.x, this.pos.y + 0.4, this.pos.z, this.pos.y < -0.2);
    if (this.hp <= 0) this.die();
    else this.onHurt && this.onHurt(from);
  }
  die() { this.dead = true; this.state = 'dead'; this.speed = 0; this.deadTime = 0; }
}

class Crab extends Animal {
  constructor(sys, x, z, r, isl) {
    super(sys, 'crab', x, z, { hp: 5, island: isl });
    this.mesh = crabModel(r);
    this.burrow = 0;
  }
  update(dt, player) {
    this.anim += dt * (2 + this.speed * 18);
    if (this.dead) { this.mesh.rotation.z = Math.PI; this.mesh.position.copy(this.pos).add(V(0, 0.08, 0)); return; }
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 0.15;
      const p = this.perceive(player, 6, 3, 9);
      if (p > 0.35) {
        this.state = 'flee';
        // flee seaward, sideways
        const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
        this.target.set(this.pos.x + dx * 2, 0, this.pos.z + dz * 2);
        this.timer = 1.5;
      } else if (this.state !== 'flee' && (this.timer -= 0.15) <= 0) {
        this.state = Math.random() < 0.5 ? 'idle' : 'wander';
        this.timer = 1 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        this.target.set(this.home.x + Math.cos(a) * 6, 0, this.home.z + Math.sin(a) * 6);
      }
      if (this.state === 'flee' && (this.timer -= 0.15) <= 0) this.state = 'idle';
    }
    if (this.state === 'flee') { this.moveToward(this.target.x, this.target.z, 3.2, dt, 12); }
    else if (this.state === 'wander') { if (this.moveToward(this.target.x, this.target.z, 0.6, dt, 6)) this.state = 'idle'; }
    else this.speed = damp(this.speed, 0, 8, dt);
    // crabs may scuttle into the shallows
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt, nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    if (terrainHeight(nx, nz) > -1.5) { this.pos.x = nx; this.pos.z = nz; }
    else this.heading += 2;
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    // scuttle sideways: body faces 90deg from travel
    this.mesh.position.copy(this.pos).add(V(0, 0.07 + Math.abs(Math.sin(this.anim)) * 0.01, 0));
    this.mesh.rotation.set(0, this.heading + Math.PI / 2, 0);
    for (const l of this.mesh.userData.legs) l.rotation.x = Math.sin(this.anim + l.userData.i * 1.3 + l.userData.s) * 0.5 * Math.min(1, this.speed + 0.1);
    for (const c of this.mesh.userData.claws) c.rotation.y = Math.sin(this.anim * 0.3) * 0.2;
  }
}

class Gull extends Animal {
  constructor(sys, x, z, isl) {
    super(sys, 'gull', x, z, { hp: 6, island: isl });
    this.mesh = gullModel();
    this.fly = 0; this.alt = 0; this.vy = 0;
    this.circle = Math.random() * 6; this.circleR = 12 + Math.random() * 10;
    this.flap = 0;
  }
  update(dt, player) {
    this.anim += dt;
    if (this.dead) { this.mesh.position.copy(this.pos).add(V(0, 0.1, 0)); this.mesh.rotation.z = Math.PI / 2; return; }
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 0.2;
      const p = this.perceive(player, 9, 4, 14);
      if (this.state !== 'fly' && p > 0.3) { this.state = 'fly'; this.timer = 10 + Math.random() * 15; this.sys.game.audio?.gull(this.pos); }
      if (this.state === 'fly') {
        this.timer -= 0.2;
        if (this.timer <= 0 && p < 0.1) {
          this.state = 'land';
          const a = Math.random() * Math.PI * 2;
          this.target.set(this.home.x + Math.cos(a) * 15, 0, this.home.z + Math.sin(a) * 15);
          if (terrainHeight(this.target.x, this.target.z) < 0.3) this.target.copy(this.home);
        }
      } else if (this.state === 'wander' || this.state === 'idle') {
        if ((this.timer -= 0.2) <= 0) {
          this.timer = 2 + Math.random() * 4;
          this.state = Math.random() < 0.4 ? 'idle' : 'wander';
          const a = Math.random() * Math.PI * 2;
          this.target.set(this.pos.x + Math.cos(a) * 2, 0, this.pos.z + Math.sin(a) * 2);
          if (Math.random() < 0.02) { this.state = 'fly'; this.timer = 8; }
        }
      }
    }
    const ground = terrainHeight(this.pos.x, this.pos.z);
    if (this.state === 'fly') {
      this.circle += dt * 0.5;
      const tx = this.home.x + Math.cos(this.circle) * this.circleR, tz = this.home.z + Math.sin(this.circle) * this.circleR;
      this.moveToward(tx, tz, 6, dt, 2);
      this.alt = damp(this.alt, Math.max(ground, 0) + 9 + Math.sin(this.circle * 2) * 3, 1, dt);
      this.flap += dt * (this.alt - this.pos.y > 1 ? 10 : 3);
    } else if (this.state === 'land') {
      const arrived = this.moveToward(this.target.x, this.target.z, 4, dt, 3);
      const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      this.alt = damp(this.alt, terrainHeight(this.target.x, this.target.z) + Math.min(8, d * 0.4), 2, dt);
      this.flap += dt * (d < 4 ? 12 : 4);
      if (arrived || (d < 0.5)) { this.state = 'idle'; this.timer = 3; this.alt = ground; }
    } else {
      if (this.state === 'wander') { if (this.moveToward(this.target.x, this.target.z, 0.5, dt)) this.state = 'idle'; }
      else this.speed = damp(this.speed, 0, 5, dt);
      this.alt = Math.max(ground, 0);
    }
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.pos.y = this.alt;
    const flying = this.state === 'fly' || this.state === 'land';
    this.mesh.position.copy(this.pos).add(V(0, flying ? 0 : 0.17, 0));
    this.mesh.rotation.set(flying ? -0.05 : (this.state === 'idle' ? Math.sin(this.anim * 2) * 0.15 + 0.1 : 0), this.heading, flying ? Math.sin(this.circle) * 0.3 : 0);
    for (const w of this.mesh.userData.wings) {
      const f = flying ? Math.sin(this.flap) * 0.7 : -1.3;
      w.rotation.z = w.userData.s * (flying ? f : -0.2);
      w.rotation.y = flying ? 0 : w.userData.s * 1.3;
      w.userData.outer.rotation.z = w.userData.s * (flying ? Math.sin(this.flap - 0.6) * 0.5 : 0);
    }
    for (const l of this.mesh.userData.legs) l.visible = !flying;
  }
}

class Lizard extends Animal {
  constructor(sys, x, z, r, isl) {
    super(sys, 'lizard', x, z, { hp: 8, island: isl });
    this.mesh = lizardModel(r);
  }
  update(dt, player) {
    this.anim += dt * (this.speed * 14 + 0.5);
    if (this.dead) { this.mesh.position.copy(this.pos); this.mesh.rotation.z = Math.PI; return; }
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 0.2;
      const p = this.perceive(player, 7, 3, 10);
      if (p > 0.3) { this.state = 'flee'; this.timer = 1.2; const a = Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z) + (Math.random() - 0.5); this.target.set(this.pos.x + Math.sin(a) * 8, 0, this.pos.z + Math.cos(a) * 8); }
      else if ((this.timer -= 0.2) <= 0) {
        this.timer = 2 + Math.random() * 6;
        this.state = Math.random() < 0.6 ? 'bask' : 'wander';
        const a = Math.random() * Math.PI * 2;
        this.target.set(this.home.x + Math.cos(a) * 8, 0, this.home.z + Math.sin(a) * 8);
      }
    }
    if (this.state === 'flee') { this.moveToward(this.target.x, this.target.z, 4.5, dt, 10); if ((this.timer -= dt) <= 0) this.state = 'bask'; }
    else if (this.state === 'wander') { if (this.moveToward(this.target.x, this.target.z, 0.8, dt, 4)) this.state = 'bask'; }
    else this.speed = damp(this.speed, 0, 6, dt);
    this.integrate(dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
    const body = this.mesh.userData.body;
    body.rotation.y = Math.sin(this.anim) * 0.15 * Math.min(1, this.speed);
    this.mesh.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.anim + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.8 * Math.min(1, this.speed); });
  }
}

class Pig extends Animal {
  constructor(sys, x, z, r, isl, boar) {
    super(sys, 'pig', x, z, { hp: boar ? 90 : 60, island: isl });
    this.boar = boar;
    this.mesh = pigModel(r, boar);
    this.herd = null;
    this.charge = 0;
    this.attackCd = 0;
    this.limp = 0;
  }
  onHurt(from) {
    // boars sometimes turn and charge when wounded
    if (this.boar && Math.random() < 0.55) { this.state = 'charge'; this.timer = 3.5; }
    else { this.state = 'flee'; this.timer = 7; this.limp = 0.35; }
    this.sys.game.audio?.squeal(this.pos);
    for (const o of this.sys.animals) if (o !== this && o.kind === 'pig' && !o.dead && o.pos.distanceTo(this.pos) < 25) { o.awareness = 1; o.state = 'flee'; o.timer = 6; }
  }
  update(dt, player) {
    const ud = this.mesh.userData;
    this.anim += dt * (1 + this.speed * 4.2);
    if (this.dead) {
      this.deadTime += dt;
      this.mesh.position.copy(this.pos).add(V(0, 0.1, 0));
      this.mesh.rotation.z = damp(this.mesh.rotation.z, Math.PI / 2, 4, dt);
      return;
    }
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    const env = this.sys.game.env;
    this.hunger = clamp(this.hunger + dt * 0.004, 0, 1);
    this.thirst = clamp(this.thirst + dt * 0.003, 0, 1);
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 0.25;
      const p = this.perceive(player, 22, 2.6, 26);
      this.awareness = clamp(this.awareness + (p - 0.08) * 0.5, 0, 1);
      const st = this.state;
      if (st !== 'flee' && st !== 'charge') {
        if (this.awareness > 0.75) {
          if (this.boar && player.pos.distanceTo(this.pos) < 6 && Math.random() < 0.3) { this.state = 'charge'; this.timer = 3; }
          else { this.state = 'flee'; this.timer = 6 + Math.random() * 4; this.sys.game.audio?.grunt(this.pos, true); }
        } else if (this.awareness > 0.35) { this.state = 'alert'; this.timer = 2; }
        else if ((this.timer -= 0.25) <= 0) {
          // needs-driven choice
          if (env.isNight()) { this.state = 'rest'; this.timer = 20; }
          else if (this.thirst > 0.7) { this.state = 'drink'; const c = HUNTER.creek; this.target.set(c.x + (Math.random() - 0.5) * 8, 0, c.z + 10 + Math.random() * 3); this.timer = 30; }
          else if (this.hunger > 0.5 || Math.random() < 0.5) { this.state = 'graze'; this.timer = 5 + Math.random() * 8; }
          else { this.state = 'wander'; this.timer = 6; const a = Math.random() * Math.PI * 2; this.target.set(this.home.x + Math.cos(a) * 20, 0, this.home.z + Math.sin(a) * 20); }
          if (Math.random() < 0.2) this.sys.game.audio?.grunt(this.pos);
        }
      } else if ((this.timer -= 0.25) <= 0) { this.state = 'wander'; this.awareness *= 0.5; this.timer = 3; }
    }
    const lim = 1 - this.limp;
    switch (this.state) {
      case 'graze': this.speed = damp(this.speed, Math.sin(this.anim * 0.2) > 0.6 ? 0.4 : 0, 3, dt); this.hunger = Math.max(0, this.hunger - dt * 0.03); if (Math.random() < dt * 0.3) this.heading += (Math.random() - 0.5); break;
      case 'wander': if (this.moveToward(this.target.x, this.target.z, 1.1, dt, 3)) this.timer = 0; break;
      case 'drink': if (this.moveToward(this.target.x, this.target.z, 1.3, dt, 3)) { this.thirst = Math.max(0, this.thirst - dt * 0.15); this.speed = 0; if (this.thirst < 0.05) this.timer = 0; } break;
      case 'rest': this.speed = damp(this.speed, 0, 3, dt); this.energy = Math.min(1, this.energy + dt * 0.01); break;
      case 'alert': this.speed = damp(this.speed, 0, 6, dt); this.heading = dampAngle(this.heading, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), 4, dt); break;
      case 'flee': {
        const a = Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
        // keep to the island: bias toward home when far
        const toHome = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z);
        const far = this.pos.distanceTo(this.home) > 45 ? 0.6 : 0;
        const dir = a + angleDiff(a, toHome) * far;
        this.heading = dampAngle(this.heading, dir, 5, dt);
        this.speed = damp(this.speed, 5.5 * lim, 3, dt);
        break;
      }
      case 'charge': {
        this.moveToward(player.pos.x, player.pos.z, 6.2, dt, 6);
        const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        if (d < 1.3 && this.attackCd <= 0) {
          this.attackCd = 1.6;
          this.sys.game.onAnimalAttack(this, 14, 'cut');
          this.state = 'flee'; this.timer = 4;
        }
        break;
      }
    }
    this.integrate(dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
    const gallop = this.speed > 3;
    ud.legs.forEach((l, i) => {
      const ph = gallop ? (i < 2 ? 0 : Math.PI * 0.8) + (i % 2) * 0.3 : (i === 0 || i === 3 ? 0 : Math.PI);
      l.rotation.x = Math.sin(this.anim * (gallop ? 1.6 : 1) + ph) * Math.min(0.7, this.speed * 0.25);
    });
    const graze = this.state === 'graze' || this.state === 'drink' && this.speed < 0.1;
    ud.head.rotation.x = damp(ud.head.rotation.x, graze ? 0.75 + Math.sin(this.anim * 3) * 0.08 : this.state === 'alert' ? -0.25 : 0, 5, dt);
    ud.torso.position.y = 0.5 + (this.state === 'rest' ? -0.2 : 0) + Math.abs(Math.sin(this.anim)) * 0.02 * Math.min(1, this.speed);
    ud.tail.rotation.z = Math.sin(this.anim * 4) * 0.4;
    if (this.state === 'rest') this.mesh.rotation.z = 0.2;
  }
}

class Turtle extends Animal {
  constructor(sys, x, z, isl) {
    super(sys, 'turtle', x, z, { hp: 40, island: isl });
    this.mesh = turtleModel();
    this.pos.y = Math.min(-1.5, terrainHeight(x, z) + 1.5);
    this.breath = 30 + Math.random() * 60;
  }
  update(dt, player) {
    this.anim += dt;
    this.breath -= dt;
    const ground = terrainHeight(this.pos.x, this.pos.z);
    let ty;
    if (this.breath < 0) { ty = -0.3; if (this.pos.y > -0.6) { this.breath = 60 + Math.random() * 60; } }
    else ty = Math.min(-1.2, ground + 1.2);
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 0.5;
      const d = this.pos.distanceTo(player.pos);
      if (d < 4) { this.state = 'flee'; this.timer = 3; }
      if ((this.timer -= 0.5) <= 0) {
        this.state = 'cruise'; this.timer = 6 + Math.random() * 8;
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2;
          const x = this.home.x + Math.cos(a) * 25, z = this.home.z + Math.sin(a) * 25;
          if (terrainHeight(x, z) < -2) { this.target.set(x, 0, z); break; }
        }
      }
    }
    if (this.state === 'flee') { const a = Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z); this.heading = dampAngle(this.heading, a, 2, dt); this.speed = damp(this.speed, 1.6, 2, dt); }
    else this.moveToward(this.target.x, this.target.z, 0.55, dt, 0.8);
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt, nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    if (terrainHeight(nx, nz) < -1.2) { this.pos.x = nx; this.pos.z = nz; } else this.heading += dt * 2;
    this.pos.y = damp(this.pos.y, ty, 0.6, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set((ty - this.pos.y) * -0.2, this.heading, 0);
    const f = this.anim * (1.2 + this.speed);
    for (const fl of this.mesh.userData.flippers) fl.rotation.z = fl.userData.s * Math.sin(f + (fl.userData.front ? 0 : 1)) * (fl.userData.front ? 0.6 : 0.3);
  }
}

class Shark extends Animal {
  constructor(sys, x, z, isl) {
    super(sys, 'shark', x, z, { hp: 120, island: isl });
    this.mesh = sharkModel();
    this.pos.y = -4;
    this.circleA = Math.random() * 6;
    this.attackCd = 0;
  }
  onHurt() { this.state = 'flee'; this.timer = 10; }
  update(dt, player, ctx) {
    this.anim += dt * (2 + this.speed);
    this.attackCd = Math.max(0, this.attackCd - dt);
    const inWater = player.state === 'swim' || player.state === 'dive';
    const d = this.pos.distanceTo(player.pos);
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 0.3;
      const lure = (ctx.bloodInWater ? 1 : 0) + (ctx.carryingFish && inWater ? 0.4 : 0) + (player.state === 'dive' ? 0.2 : 0);
      if (this.state !== 'flee') {
        if (inWater && d < 18 + lure * 12 && lure > 0.15) this.state = d < 6 && Math.random() < 0.25 + lure * 0.3 ? 'attack' : 'circle';
        else this.state = 'patrol';
      } else if ((this.timer -= 0.3) <= 0) this.state = 'patrol';
    }
    let tx, ty, tz, sp = 1.4;
    if (this.state === 'patrol') {
      this.circleA += dt * 0.05;
      tx = this.home.x + Math.cos(this.circleA) * 30; tz = this.home.z + Math.sin(this.circleA) * 30;
      ty = Math.max(terrainHeight(tx, tz) + 2, -8);
    } else if (this.state === 'circle') {
      this.circleA += dt * 0.35;
      tx = player.pos.x + Math.cos(this.circleA) * 7; tz = player.pos.z + Math.sin(this.circleA) * 7; ty = player.pos.y + 0.5; sp = 2.4;
    } else if (this.state === 'attack') {
      tx = player.pos.x; tz = player.pos.z; ty = player.pos.y + 0.8; sp = 5.5;
      if (d < 1.6 && this.attackCd <= 0) { this.attackCd = 4; this.sys.game.onAnimalAttack(this, 22, 'cut'); this.state = 'circle'; }
    } else {
      const a = Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
      tx = this.pos.x + Math.sin(a) * 20; tz = this.pos.z + Math.cos(a) * 20; ty = -6; sp = 6;
    }
    this.moveToward(tx, tz, sp, dt, this.state === 'attack' ? 3 : 1.4);
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt, nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const g = terrainHeight(nx, nz);
    if (g < -2.4) { this.pos.x = nx; this.pos.z = nz; } else { this.heading += dt * 2.5; }
    this.pos.y = damp(this.pos.y, clamp(ty, terrainHeight(this.pos.x, this.pos.z) + 0.8, -0.9), 1.2, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
    this.mesh.userData.tail.rotation.y = Math.sin(this.anim * 2.2) * 0.45;
    this.mesh.userData.body.rotation.y = Math.sin(this.anim * 2.2 + 1) * 0.08;
  }
}

// ---------------- system ----------------
export class Wildlife {
  constructor(game) {
    this.game = game;
    this.animals = [];
    this.root = new THREE.Group();
    game.scene.add(this.root);
  }

  spawnAll() {
    const R = rng(555);
    const add = (a) => { this.animals.push(a); this.root.add(a.mesh); return a; };
    const shorePoint = (isl, hMin, hMax, tries = 60) => {
      for (let k = 0; k < tries; k++) {
        const a = R() * Math.PI * 2, d = isl.R * (0.6 + R() * 0.7);
        const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
        const h = terrainHeight(x, z);
        if (h > hMin && h < hMax) return [x, z];
      }
      return null;
    };
    for (const isl of ISLANDS) {
      const crabs = isl.mangrove ? 16 : isl.rocky ? 10 : isl.id === 'home' ? 10 : 4;
      for (let i = 0; i < crabs; i++) { const p = shorePoint(isl, 0.2, 1.4); if (p) add(new Crab(this, p[0], p[1], R, isl.id)); }
      const gulls = isl.rocky ? 12 : isl.atoll ? 6 : 5;
      for (let i = 0; i < gulls; i++) { const p = shorePoint(isl, 0.4, isl.rocky ? 20 : 2); if (p) add(new Gull(this, p[0], p[1], isl.id)); }
      if (isl.id === 'home' || isl.id === 'hunter') for (let i = 0; i < (isl.id === 'home' ? 5 : 4); i++) { const p = shorePoint(isl, 2, 9); if (p) add(new Lizard(this, p[0], p[1], R, isl.id)); }
      // turtles on reefs
      const turtles = isl.atoll ? 5 : isl.id === 'home' ? 2 : 1;
      for (let i = 0; i < turtles; i++) {
        for (let k = 0; k < 40; k++) {
          const a = R() * Math.PI * 2, d = isl.R * (1.2 + R() * (isl.reef - 0.9));
          const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
          if (terrainHeight(x, z) < -3) { add(new Turtle(this, x, z, isl.id)); break; }
        }
      }
      // reef sharks patrol deeper edges
      const sharks = isl.atoll ? 2 : isl.id === 'home' || isl.id === 'rocky' ? 1 : 0;
      for (let i = 0; i < sharks; i++) {
        for (let k = 0; k < 40; k++) {
          const a = R() * Math.PI * 2, d = isl.R * (isl.reef + 0.15);
          const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
          if (terrainHeight(x, z) < -5) { add(new Shark(this, x, z, isl.id)); break; }
        }
      }
    }
    // pig herds on Hunter's Island
    const H = ISLAND_BY_ID.hunter;
    for (let h = 0; h < 3; h++) {
      const p = shorePoint(H, 3, 14) || [H.x, H.z];
      for (let i = 0; i < 3 + (h === 0 ? 1 : 0); i++) {
        const pig = add(new Pig(this, p[0] + (R() - 0.5) * 6, p[1] + (R() - 0.5) * 6, R, 'hunter', i === 0));
        pig.home.set(p[0], 0, p[1]);
      }
    }
  }

  update(dt, player, ctx) {
    const cam = this.game.rig.camera.position;
    for (const a of this.animals) {
      const d2 = (a.pos.x - cam.x) ** 2 + (a.pos.z - cam.z) ** 2;
      const near = d2 < 140 * 140;
      a.mesh.visible = near && !(a.butchered);
      if (!near) continue;
      // far-ish animals tick at lower rate
      if (d2 > 70 * 70) { a._skip = (a._skip || 0) + dt; if (a._skip < 0.1) continue; a.update(a._skip, player, ctx); a._skip = 0; }
      else a.update(dt, player, ctx);
    }
    // carcasses decay
    this.animals = this.animals.filter((a) => {
      if (a.dead && (a.deadTime || 0) > 900) { this.root.remove(a.mesh); return false; }
      if (a.dead) a.deadTime = (a.deadTime || 0) + dt;
      return true;
    });
  }

  // melee / projectile hit test
  hitTest(origin, dir, range, cone = 0.5, filter = null) {
    let best = null, bd = Infinity;
    for (const a of this.animals) {
      if (a.dead) continue;
      if (filter && !filter(a)) continue;
      _v.copy(a.pos); _v.y += a.kind === 'pig' ? 0.5 : 0.1;
      _v.sub(origin);
      const d = _v.length();
      if (d > range) continue;
      const ang = Math.acos(clamp(_v.dot(dir) / Math.max(d, 1e-4), -1, 1));
      if (ang > cone + (d < 1.2 ? 0.6 : 0)) continue;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  nearestDead(x, z, maxD = 2) {
    let best = null, bd = maxD;
    for (const a of this.animals) { if (!a.dead || a.butchered) continue; const d = Math.hypot(a.pos.x - x, a.pos.z - z); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  nearestAlive(kind, x, z, maxD) {
    let best = null, bd = maxD;
    for (const a of this.animals) { if (a.dead || a.kind !== kind) continue; const d = Math.hypot(a.pos.x - x, a.pos.z - z); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  remove(a) { this.root.remove(a.mesh); this.animals = this.animals.filter((x) => x !== a); }

  threats() {
    const t = [];
    for (const a of this.animals) if (a.kind === 'shark' && !a.dead) t.push({ pos: a.pos, radius: 8, strength: 1 });
    return t;
  }
}
