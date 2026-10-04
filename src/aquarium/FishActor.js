// A living fish inside the active tank: owns its meshes, animation and AI.
import * as THREE from 'three';
import { SPECIES_BY_ID, LIFE_STAGES } from '../data/species.js';
import { express } from '../systems/Genetics.js';
import { buildFishGeometry } from './FishGeometry.js';
import { paintFish, eyeTexture } from './FishPainter.js';
import { patchMaterial, TANK_UNIFORMS } from '../render/materials.js';
import { clamp, lerp, damp, randRange, makeNoise2D, hashString } from '../core/util.js';

const STAGE_J = { EGG: 1, FRY: 0.92, JUVENILE: 0.55, 'YOUNG ADULT': 0.2, ADULT: 0 };
const STAGE_SCALE = { EGG: 0.2, FRY: 0.28, JUVENILE: 0.5, 'YOUNG ADULT': 0.78, ADULT: 1 };
const noise = makeNoise2D(55);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const GLASS_UP = new THREE.Vector3(0, 0, 1);
const _upv = new THREE.Vector3();
const _side = new THREE.Vector3();

export class FishActor {
  constructor(record, ctx) {
    this.rec = record;
    this.ctx = ctx; // { aquarium, manager }
    this.sp = SPECIES_BY_ID[record.species];
    this.group = new THREE.Group();
    this.group.name = `fish:${record.id}`;
    this.group.userData.fishId = record.id;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.dir = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.target = new THREE.Vector3();
    this.state = 'wander';
    this.stateTime = 0;
    this.targetTimer = 0;
    this.tailPhase = Math.random() * 10;
    this.finPhase = Math.random() * 10;
    this.bank = 0;
    this.yawRate = 0;
    this.lastYaw = 0;
    this.burst = 0;
    this.speedNow = 0;
    this.seed = hashString(record.id) % 1000;
    this.foodTarget = null;
    this.lookTarget = null;
    this.eyeYaw = 0;
    this.restSpot = null;
    this.trick = null;
    this.alert = 0;
    this.homeSpot = null;
    this.highlight = 0;
    this.rebuild();
  }

  get stage() {
    return this.rec.stage;
  }
  get traits() {
    return this.rec.personality;
  }
  has(trait) {
    return this.rec.personality.includes(trait);
  }

  rebuild() {
    // dispose previous meshes (geometry is cached/shared)
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse?.((o) => {
        if (o.material && o.userData.ownMaterial) {
          o.material.map?.dispose();
          o.material.emissiveMap?.dispose();
          o.material.dispose();
        }
      });
    }
    const rec = this.rec;
    const ph = express(rec.species, rec.genome);
    this.ph = ph;
    this.builtStage = rec.stage;
    if (rec.stage === 'EGG') {
      this.buildEggs();
      return;
    }
    const j = STAGE_J[rec.stage] ?? 0;
    this.j = j;
    const geo = buildFishGeometry(this.sp, ph, rec.sex, j);
    const tex = paintFish(rec, this.sp, ph, j);
    this.tex = tex;
    this.uniforms = { uSwim: { value: new THREE.Vector4(0, 0.06, 6.5, 0) }, uFish: { value: new THREE.Vector4(0.5, 1, 0, 0.02) } };
    const metallic = ['platinum', 'dragon', 'gold', 'bronze', 'moonlight'].includes(ph.pattern);
    const bodyMat = patchMaterial(new THREE.MeshPhysicalMaterial({
      map: tex.bodyMap,
      roughness: metallic ? 0.25 : 0.38,
      metalness: metallic ? 0.35 : 0.05,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      sheen: 0.4,
      sheenColor: new THREE.Color().setHSL((ph.primary.h + 40) / 360, 0.7, 0.7),
      iridescence: ['neon', 'cardinal', 'galaxy', 'dragon', 'platinum', 'pearl'].includes(ph.pattern) ? 0.6 : 0.2,
      iridescenceIOR: 1.6,
      emissiveMap: tex.emissiveMap,
      emissive: tex.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0),
      emissiveIntensity: 0,
      envMapIntensity: 0.7,
    }), { fish: true, fishUniforms: this.uniforms });
    const finMat = patchMaterial(new THREE.MeshStandardMaterial({
      map: tex.finMap,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.4,
      depthWrite: false,
      alphaTest: 0.02,
      envMapIntensity: 0.4,
    }), { fish: true, fishUniforms: this.uniforms });
    this.bodyMat = bodyMat;
    this.finMat = finMat;
    const body = new THREE.Mesh(geo.bodyGeo, bodyMat);
    body.castShadow = true;
    body.userData.ownMaterial = true;
    const fins = new THREE.Mesh(geo.finGeo, finMat);
    fins.renderOrder = 2;
    fins.userData.ownMaterial = true;
    this.inner = new THREE.Group();
    this.inner.add(body, fins);
    // pectoral fins (animated separately)
    const pecMat = finMat;
    this.pecs = [];
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(geo.pecGeo, pecMat);
      p.position.set(geo.pecPos.x, geo.pecPos.y, geo.pecPos.z * side);
      p.rotation.set(0, side * 0.5, 0);
      p.userData.side = side;
      p.renderOrder = 2;
      this.inner.add(p);
      this.pecs.push(p);
    }
    // eyes
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(ph.eye), roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 });
    eyeMat.userData = {};
    this.eyes = [];
    const eyeGeo = new THREE.SphereGeometry(geo.eye.r, 16, 12);
    for (const side of [1, -1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(geo.eye.pos.x, geo.eye.pos.y, geo.eye.pos.z * side);
      e.scale.set(1, 1, 0.75);
      e.rotation.y = side > 0 ? 0 : Math.PI;
      e.userData.side = side;
      e.userData.baseRot = e.rotation.y;
      this.inner.add(e);
      this.eyes.push(e);
    }
    this.group.add(this.inner);
    this.updateScale();
    // selection ring (hidden by default)
    this.ring = null;
  }

  buildEggs() {
    const g = new THREE.Group();
    const mat = patchMaterial(new THREE.MeshPhysicalMaterial({ color: 0xfff2d0, roughness: 0.15, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1, emissive: 0x332a10 }), {});
    const geo = new THREE.SphereGeometry(0.008, 8, 6);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(randRange(-0.025, 0.025), randRange(0, 0.02), randRange(-0.02, 0.02));
      g.add(m);
    }
    const dot = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    g.children.forEach((egg) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 6, 4), dot);
      d.position.copy(egg.position).add(new THREE.Vector3(0.003, 0.003, 0.004));
      g.add(d);
    });
    this.inner = g;
    this.group.add(g);
    this.eyes = [];
    this.pecs = [];
    this.uniforms = null;
  }

  updateScale() {
    const len = this.sp.adultSize * this.ph.size * (STAGE_SCALE[this.rec.stage] ?? 1) * (this.rec.stage === 'ADULT' ? 1 : lerp(1, 1.15, this.rec.stageProgress ?? 0));
    this.length = len * 1.3;
    this.inner.scale.setScalar(this.length);
  }

  // ------------------------------------------------------------ placement
  spawn(bounds, pos) {
    const b = bounds;
    if (pos) this.pos.copy(pos);
    else {
      const [d0, d1] = this.sp.behavior.depth;
      this.pos.set(randRange(b.minX + 0.2, b.maxX - 0.2), lerp(b.minY, b.maxY, randRange(d0, Math.max(d0 + 0.05, d1))), randRange(b.minZ + 0.1, b.maxZ - 0.1));
    }
    this.dir.set(Math.random() < 0.5 ? 1 : -1, 0, randRange(-0.3, 0.3)).normalize();
    this.vel.copy(this.dir).multiplyScalar(this.sp.behavior.speed * 0.5);
    this.pickWanderTarget(bounds);
    this.group.position.copy(this.pos);
  }

  speciesSpeed() {
    let s = this.sp.behavior.speed;
    if (this.has('energetic')) s *= 1.25;
    if (this.has('lazy')) s *= 0.75;
    if (this.stage === 'FRY') s *= 0.6;
    else if (this.stage === 'JUVENILE') s *= 0.8;
    return s;
  }

  pickWanderTarget(b) {
    const beh = this.sp.behavior;
    let [d0, d1] = beh.depth;
    const night = this.ctx.manager.night;
    if (this.stage === 'FRY') [d0, d1] = [0.05, 0.4];
    const marginX = 0.12 + this.length;
    const r = () => Math.random();
    if (beh.kind === 'bottom') {
      this.target.set(randRange(b.minX + marginX, b.maxX - marginX), 0, randRange(b.minZ + 0.08, b.maxZ - 0.08));
      this.target.y = this.ctx.aquarium.substrateY(this.target.x, this.target.z) + this.length * 0.32;
      this.targetTimer = randRange(3, 7);
      return;
    }
    if (beh.kind === 'glass') {
      if (r() < 0.55) {
        // back glass or decoration surface
        this.target.set(randRange(b.minX + 0.2, b.maxX - 0.2), lerp(b.minY + 0.15, b.maxY - 0.1, r() * 0.7), b.minZ + 0.02);
        this.surface = 'glass';
      } else {
        this.target.set(randRange(b.minX + 0.2, b.maxX - 0.2), 0, randRange(b.minZ + 0.1, b.maxZ - 0.15));
        this.target.y = this.ctx.aquarium.substrateY(this.target.x, this.target.z) + this.length * 0.18;
        this.surface = 'floor';
      }
      this.targetTimer = randRange(12, 30);
      return;
    }
    // midwater fish: individual target with personal depth preference
    const pref = lerp(d0, d1, 0.5 + (noise(this.seed, 0.5) - 0.5) * 0.8);
    const dy = lerp(d0, d1, r()) * 0.6 + pref * 0.4;
    const h = b.minY + (b.maxY - b.minY) * clamp(dy, 0, 1);
    this.target.set(randRange(b.minX + marginX, b.maxX - marginX), h, randRange(b.minZ + 0.1, b.maxZ - 0.12));
    if (this.has('shy') && r() < 0.5) this.target.z = lerp(b.minZ, b.maxZ, 0.25);
    if (this.has('curious') && r() < 0.35) this.target.z = b.maxZ - 0.1;
    this.targetTimer = randRange(3, 9) * (this.has('energetic') ? 0.6 : 1) * (night ? 1.6 : 1);
  }

  // ----------------------------------------------------------------- AI
  update(dt, t, env) {
    if (this.builtStage !== this.rec.stage) {
      this.rebuild();
      if (this.builtStage !== 'EGG' && this.pos.lengthSq() === 0) this.spawn(env.bounds);
    }
    if (this.rec.stage === 'EGG') {
      // eggs sit still, gently wobbling
      this.inner.rotation.z = Math.sin(t * 0.8 + this.seed) * 0.05;
      return;
    }
    const beh = this.sp.behavior;
    const b = env.bounds;
    const desired = _v.set(0, 0, 0);
    const forces = this._forces ?? (this._forces = new THREE.Vector3());
    forces.set(0, 0, 0);
    let speedTarget = this.speciesSpeed();
    this.stateTime += dt;
    this.targetTimer -= dt;
    this.alert = Math.max(0, this.alert - dt);
    let mode = 'wander';
    let upWanted = UP;

    // ---------- state selection (priority order)
    const hungry = this.rec.hunger > 0.15;
    const food = hungry && this.stage !== 'FRY' ? env.food.findFor(this) : this.stage === 'FRY' ? env.food.findFor(this, 0.4) : null;
    if (this.trick) mode = 'trick';
    else if (food) mode = 'feed';
    else if (this.alert > 0 && this.alertFrom && !this.has('brave')) mode = 'flee';
    else if (env.attractor && this.wantsAttractor(env.attractor)) mode = 'curious';
    else if (env.night && beh.kind !== 'glass' && beh.kind !== 'bottom' && (!this.has('energetic') || Math.random() < 0.001)) mode = 'rest';
    else if (this.rec.energy < 0.2) mode = 'rest';
    else if (beh.kind === 'bottom') mode = 'forage';
    else if (beh.kind === 'glass') mode = 'graze';
    else if (beh.schooling > 0.5 && !this.has('independent')) mode = 'school';
    if (mode !== this.state) {
      this.state = mode;
      this.stateTime = 0;
      if (mode === 'rest') this.restSpot = env.findRestSpot(this);
    }

    // ---------- behaviour
    switch (mode) {
      case 'trick': {
        const tr = this.trick;
        tr.time += dt;
        tr.update(this, dt, tr);
        desired.copy(tr.target).sub(this.pos);
        speedTarget = tr.speed ?? speedTarget * 1.4;
        if (tr.done) this.trick = null;
        break;
      }
      case 'feed': {
        this.foodTarget = food;
        desired.copy(food.pos).sub(this.pos);
        const greedy = this.has('greedy') ? 1.5 : 1;
        speedTarget = beh.maxSpeed * 0.75 * greedy * (this.has('shy') ? 0.75 : 1);
        this.lookTarget = food.pos;
        // eat when the mouth reaches it
        const mouth = _v2.copy(this.dir).multiplyScalar(this.length * 0.5).add(this.pos);
        if (mouth.distanceTo(food.pos) < Math.max(0.03, this.length * 0.32)) {
          env.food.eat(food, this);
          this.burst = 0.6;
        }
        break;
      }
      case 'flee': {
        desired.copy(this.pos).sub(this.alertFrom);
        desired.y *= 0.3;
        speedTarget = beh.maxSpeed;
        if (env.hideSpot && this.has('shy')) {
          desired.copy(env.hideSpot(this)).sub(this.pos);
          speedTarget *= 0.9;
        }
        break;
      }
      case 'curious': {
        const a = env.attractor;
        _v2.copy(a.pos);
        _v2.x += Math.sin(t * 0.7 + this.seed) * 0.08;
        _v2.y += Math.cos(t * 0.5 + this.seed) * 0.05;
        _v2.z = Math.min(_v2.z, b.maxZ - this.length * 0.4);
        desired.copy(_v2).sub(this.pos);
        speedTarget = this.speciesSpeed() * 1.6;
        this.lookTarget = a.pos;
        if (desired.length() < 0.12) speedTarget *= 0.2;
        break;
      }
      case 'rest': {
        const spot = this.restSpot ?? this.target;
        desired.copy(spot).sub(this.pos);
        speedTarget = this.speciesSpeed() * 0.35;
        if (desired.length() < 0.08) speedTarget = 0.008;
        this.rec.energy = Math.min(1, this.rec.energy + dt * 0.01);
        break;
      }
      case 'forage': {
        if (this.targetTimer <= 0 || this.pos.distanceTo(this.target) < 0.06) this.pickWanderTarget(b);
        desired.copy(this.target).sub(this.pos);
        // short bursts then stop & sift
        const cycle = (t * 0.35 + this.seed * 0.01) % 1;
        speedTarget = cycle < 0.55 ? this.speciesSpeed() * 1.2 : 0.01;
        this.sifting = cycle >= 0.55;
        // stay close to the substrate
        const sy = env.aquarium.substrateY(this.pos.x, this.pos.z) + this.length * 0.3;
        forces.y += (sy - this.pos.y) * 3;
        // corys follow each other loosely
        this.schoolForce(env, forces, 0.6);
        break;
      }
      case 'graze': {
        if (this.targetTimer <= 0) this.pickWanderTarget(b);
        desired.copy(this.target).sub(this.pos);
        const dist = desired.length();
        speedTarget = dist > 0.08 ? this.speciesSpeed() * 1.3 : 0.004;
        this.attached = dist < 0.1;
        if (this.attached && this.surface === 'glass') upWanted = GLASS_UP;
        break;
      }
      case 'school': {
        const lead = env.schoolTarget(this.sp.id);
        desired.copy(lead).sub(this.pos).multiplyScalar(0.6);
        this.schoolForce(env, forces, beh.schooling * (this.has('social') ? 1.3 : 1));
        speedTarget = this.speciesSpeed() * (1 + 0.2 * Math.sin(t * 0.5 + this.seed));
        break;
      }
      default: {
        if (this.targetTimer <= 0 || this.pos.distanceTo(this.target) < 0.1 + this.length) this.pickWanderTarget(b);
        desired.copy(this.target).sub(this.pos);
        // personal meander
        desired.x += (noise(t * 0.15 + this.seed, 1) - 0.5) * 0.4;
        desired.y += (noise(t * 0.12 + this.seed, 7) - 0.5) * 0.2;
        if (beh.schooling > 0.2 || this.has('social')) this.schoolForce(env, forces, beh.schooling * 0.6 + (this.has('social') ? 0.3 : 0));
        if (beh.territorial > 0.3 || this.has('territorial')) this.territory(env, forces, desired);
        if (this.has('playful') && Math.random() < dt * 0.05) this.burst = 1;
      }
    }

    // ---------- separation from all fish
    for (const o of env.fish) {
      if (o === this || o.rec.stage === 'EGG') continue;
      _v2.copy(this.pos).sub(o.pos);
      const d = _v2.length();
      const minD = (this.length + o.length) * 0.55 + (this.has('gentle') ? 0.03 : 0.01);
      if (d < minD && d > 1e-5) forces.addScaledVector(_v2.normalize(), (minD - d) / minD * 1.6);
    }

    // ---------- obstacle avoidance (look ahead)
    const look = _v2.copy(this.dir).multiplyScalar(this.length + this.speedNow * 1.2).add(this.pos);
    for (const c of env.colliders) {
      const rr = c.r + this.length * 0.45;
      const dx = look.x - c.x, dy = look.y - c.y, dz = look.z - c.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < rr * rr * 1.6) {
        const d = Math.sqrt(d2) || 1e-4;
        const k = (1 - d / (rr * 1.27)) * (c.soft ? 0.6 : 2.4);
        if (k > 0) forces.x += (dx / d) * k, forces.y += (dy / d) * k * 0.7, forces.z += (dz / d) * k;
      }
    }
    // ---------- walls (soft)
    const wallM = 0.06 + this.length * 0.6;
    const wall = (v, lo, hi) => (v < lo + wallM ? (lo + wallM - v) / wallM : v > hi - wallM ? -(v - (hi - wallM)) / wallM : 0);
    forces.x += wall(this.pos.x, b.minX, b.maxX) * 2.2;
    forces.z += wall(this.pos.z, b.minZ, b.maxZ) * 2.2;
    const floorY = env.aquarium.substrateY(this.pos.x, this.pos.z) + this.length * 0.25;
    if (beh.kind !== 'bottom') forces.y += wall(this.pos.y, floorY, b.maxY) * 1.6;

    // ---------- combine
    if (desired.lengthSq() > 1e-8) desired.normalize();
    desired.addScaledVector(forces, 0.9);
    if (desired.lengthSq() < 1e-8) desired.copy(this.dir);
    desired.normalize();
    if (beh.kind !== 'glass' || !this.attached) desired.y = clamp(desired.y, -0.55, 0.55);
    desired.normalize();

    // turn toward desired with a limited rate (smooth, curved turns)
    const turn = beh.turn * (this.stage === 'FRY' ? 1.6 : 1) * (0.6 + this.burst * 0.8);
    const angle = this.dir.angleTo(desired);
    if (angle > 1e-4) {
      const maxA = turn * dt;
      const k = Math.min(1, maxA / angle);
      this.dir.lerp(desired, k).normalize();
    }
    // speed with acceleration/braking; heavy fish accelerate slower
    if (this.burst > 0) {
      speedTarget = Math.max(speedTarget, beh.maxSpeed * this.burst);
      this.burst = Math.max(0, this.burst - dt * 1.2);
    }
    speedTarget = Math.min(speedTarget, beh.maxSpeed);
    const acc = (0.35 / beh.mass) * (speedTarget > this.speedNow ? 1 : 1.6);
    this.speedNow += clamp(speedTarget - this.speedNow, -acc * dt, acc * dt);
    this.speedNow = Math.max(0.003, this.speedNow);
    this.vel.copy(this.dir).multiplyScalar(this.speedNow);
    this.pos.addScaledVector(this.vel, dt);

    // ---------- hard constraints: never leave the water or clip decor
    const half = this.length * 0.42;
    this.pos.x = clamp(this.pos.x, b.minX + half, b.maxX - half);
    this.pos.z = clamp(this.pos.z, b.minZ + half * 0.6, b.maxZ - half * 0.6);
    const minY = env.aquarium.substrateY(this.pos.x, this.pos.z) + this.length * (beh.kind === 'bottom' || beh.kind === 'glass' ? 0.16 : 0.22);
    this.pos.y = clamp(this.pos.y, minY, b.maxY - this.length * 0.15);
    for (const c of env.colliders) {
      if (c.soft) continue;
      const rr = c.r + this.length * 0.3;
      _v2.set(this.pos.x - c.x, this.pos.y - c.y, this.pos.z - c.z);
      const d = _v2.length();
      if (d < rr && d > 1e-5) this.pos.addScaledVector(_v2, (rr - d) / d);
    }

    // ---------- orientation: yaw/pitch from direction, bank from turn rate
    const yaw = Math.atan2(-this.dir.z, this.dir.x);
    let dyaw = yaw - this.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.lastYaw = yaw;
    this.yawRate = damp(this.yawRate, dyaw / Math.max(dt, 1e-4), 6, dt);
    this.bank = damp(this.bank, clamp(-this.yawRate * 0.18 * (this.speedNow / beh.maxSpeed + 0.2), -0.5, 0.5), 5, dt);
    this.up.lerp(upWanted, 1 - Math.exp(-3 * dt)).normalize();
    const fwd = this.dir;
    const right = _v2.crossVectors(fwd, this.up);
    if (right.lengthSq() < 1e-6) right.set(0, 0, 1);
    right.normalize();
    const upv = _upv.crossVectors(right, fwd).normalize();
    // fish local: +x forward, +y up, +z = right-hand side (x cross y)
    _m.makeBasis(fwd, upv, _side.crossVectors(fwd, upv));
    _q.setFromRotationMatrix(_m);
    this.group.quaternion.copy(_q);
    this.inner.rotation.x = this.bank;
    if (this.sifting) this.inner.rotation.z = damp(this.inner.rotation.z, -0.35, 4, dt);
    else this.inner.rotation.z = damp(this.inner.rotation.z, 0, 4, dt);
    this.group.position.copy(this.pos);

    // ---------- swim animation
    const sp01 = clamp(this.speedNow / beh.maxSpeed, 0, 1);
    const freq = beh.tailFreq * (0.25 + sp01 * 1.5) * (this.stage === 'FRY' ? 1.7 : 1);
    this.tailPhase += dt * freq;
    this.finPhase += dt * (2 + sp01 * 4);
    const amp = (0.025 + sp01 * 0.075) * (1 - beh.glide * 0.35 * (1 - sp01));
    const u = this.uniforms.uSwim.value;
    u.x = this.tailPhase;
    u.y = damp(u.y, amp, 4, dt);
    u.z = this.sp.id === 'betta' || this.sp.id === 'angelfish' ? 4.5 : 6.5;
    u.w = damp(u.w, clamp(this.yawRate * 0.05, -0.12, 0.12), 5, dt);
    const f = this.uniforms.uFish.value;
    f.z = this.finPhase;
    f.w = 0.012 + (1 - sp01) * 0.01 + (this.sp.id === 'betta' ? 0.012 : 0);
    // pectorals: active when hovering
    for (const p of this.pecs) {
      const s = p.userData.side;
      p.rotation.y = s * (0.6 + Math.sin(this.finPhase * 2.2 + (s > 0 ? 0 : 1.4)) * (0.45 * (1 - sp01) + 0.12));
      p.rotation.x = Math.sin(this.finPhase * 2.2) * 0.2;
    }
    // eyes track things of interest
    let eyeTarget = 0;
    if (this.lookTarget) {
      _v2.copy(this.lookTarget).sub(this.pos);
      const ang = Math.atan2(-_v2.z, _v2.x) - yaw;
      eyeTarget = clamp(Math.atan2(Math.sin(ang), Math.cos(ang)), -0.45, 0.45);
    } else eyeTarget = Math.sin(t * 0.3 + this.seed) * 0.15;
    this.eyeYaw = damp(this.eyeYaw, eyeTarget, 5, dt);
    for (const e of this.eyes) e.rotation.y = e.userData.baseRot + this.eyeYaw * e.userData.side;
    this.lookTarget = null;

    // night glow / highlight
    if (this.tex?.emissiveMap) {
      const nightK = 1 - env.tankLight * 0.7;
      this.bodyMat.emissiveIntensity = (this.ph.glow ? 0.9 : 0.25) * nightK + (this.tex.glowStripe ? 0.15 : 0);
    }
  }

  wantsAttractor(a) {
    if (a.kind === 'keeper') return (this.rec.bond > 0.35 || this.has('curious')) && this.stage !== 'FRY';
    if (a.kind === 'pointer') return this.has('curious') || this.has('playful') || this.rec.bond > 0.5 || (this.rec.tricks.follow ?? 0) >= 1;
    if (a.kind === 'cat') return this.has('curious') || this.has('brave');
    return false;
  }

  schoolForce(env, forces, strength) {
    const coh = this._coh ?? (this._coh = new THREE.Vector3());
    const ali = this._ali ?? (this._ali = new THREE.Vector3());
    coh.set(0, 0, 0);
    ali.set(0, 0, 0);
    let n = 0;
    for (const o of env.fish) {
      if (o === this || o.sp.id !== this.sp.id || o.rec.stage === 'EGG') continue;
      const d = o.pos.distanceTo(this.pos);
      if (d < 0.55) {
        coh.add(o.pos);
        ali.add(o.dir);
        n++;
      }
    }
    if (!n) return;
    coh.multiplyScalar(1 / n).sub(this.pos);
    forces.addScaledVector(coh, strength * 1.4);
    forces.addScaledVector(ali.normalize(), strength * 0.7);
  }

  territory(env, forces, desired) {
    if (!this.homeSpot) this.homeSpot = this.pos.clone();
    for (const o of env.fish) {
      if (o === this || o.length > this.length * 1.6 || o.rec.stage === 'EGG') continue;
      const d = o.pos.distanceTo(this.homeSpot);
      if (d < 0.25 && o.pos.distanceTo(this.pos) < 0.45 && o.sp.id === this.sp.id) {
        // gentle display: swim toward the intruder briefly
        desired.copy(o.pos).sub(this.pos);
        this.burst = Math.max(this.burst, 0.3);
        o.alert = Math.max(o.alert, 1.5);
        o.alertFrom = this.pos;
        return;
      }
    }
  }

  // world-space mouth position
  mouth(out = new THREE.Vector3()) {
    return out.copy(this.dir).multiplyScalar(this.length * 0.5).add(this.pos);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.material && o.userData.ownMaterial) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
