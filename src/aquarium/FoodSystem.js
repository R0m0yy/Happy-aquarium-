// Physical food particles: each particle floats, drifts and sinks according to
// its food type, can be individually targeted and eaten by fish, and leftovers
// decay into debris.
import * as THREE from 'three';
import { FOOD_BY_ID } from '../data/items.js';
import { tankStandard } from '../render/materials.js';
import { bus } from '../core/EventBus.js';
import { clamp, randRange } from '../core/util.js';

const MAX = 240;
const KINDS = ['flake', 'pellet', 'wafer', 'frozen', 'worm', 'veggie', 'treat'];

function kindGeometry(kind) {
  switch (kind) {
    case 'flake': {
      const g = new THREE.CircleGeometry(1, 5);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, (Math.random() - 0.5) * 0.25);
      g.computeVertexNormals();
      return g;
    }
    case 'veggie': {
      const g = new THREE.CircleGeometry(1, 4);
      return g;
    }
    case 'pellet': return new THREE.SphereGeometry(1, 8, 6);
    case 'treat': return new THREE.OctahedronGeometry(1, 0);
    case 'wafer': return new THREE.CylinderGeometry(1, 1, 0.35, 16);
    case 'frozen': return new THREE.BoxGeometry(1, 1, 1);
    case 'worm': return new THREE.CapsuleGeometry(0.35, 2.2, 3, 6);
    default: return new THREE.SphereGeometry(1, 6, 4);
  }
}

export class FoodSystem {
  constructor(aquarium) {
    this.aq = aquarium;
    this.particles = [];
    for (let i = 0; i < MAX; i++) this.particles.push({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), kind: 'flake', size: 0.01, t: 0, resting: false, targets: 0, food: null, color: new THREE.Color() });
    this.meshes = {};
    this.group = new THREE.Group();
    this.group.name = 'food';
    aquarium.contents.add(this.group);
    const m4 = new THREE.Matrix4();
    for (const k of KINDS) {
      const mat = tankStandard({ roughness: 0.6, side: k === 'flake' || k === 'veggie' ? THREE.DoubleSide : THREE.FrontSide, emissive: k === 'treat' ? 0x664422 : 0x000000 });
      const mesh = new THREE.InstancedMesh(kindGeometry(k), mat, MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.setColorAt(0, new THREE.Color());
      mesh.castShadow = false;
      this.group.add(mesh);
      this.meshes[k] = mesh;
    }
    this._m4 = m4;
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
    this.activeCount = 0;
    this.feedLog = 0;
  }

  get any() {
    return this.activeCount > 0;
  }

  spawn(kind, pos, vel, size, color, food) {
    const p = this.particles.find((x) => !x.active);
    if (!p) return null;
    p.active = true;
    p.kind = kind;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.size = size;
    p.t = 0;
    p.resting = false;
    p.targets = 0;
    p.food = food;
    p.color.set(color);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin = randRange(-2, 2);
    p.surface = kind === 'flake' || kind === 'veggie' ? randRange(1.5, 4) : kind === 'frozen' ? randRange(0.6, 1.2) : kind === 'pellet' ? randRange(0.1, 0.5) : 0;
    p.inWater = false;
    this.activeCount++;
    return p;
  }

  // Drop a pinch of food above the water at world (x, z).
  drop(foodId, x, z) {
    const f = FOOD_BY_ID[foodId] ?? FOOD_BY_ID.flakes;
    const b = this.aq.bounds(0.06);
    const n = f.count;
    const kind = f.kind;
    for (let i = 0; i < n; i++) {
      const px = clamp(x + randRange(-0.12, 0.12), b.minX, b.maxX);
      const pz = clamp(z + randRange(-0.1, 0.1), b.minZ, b.maxZ);
      const pos = new THREE.Vector3(px, this.aq.waterY + randRange(0.05, 0.25), pz);
      const vel = new THREE.Vector3(randRange(-0.05, 0.05), randRange(-0.5, -0.2), randRange(-0.05, 0.05));
      const size = kind === 'flake' ? randRange(0.006, 0.011) : kind === 'pellet' ? randRange(0.0035, 0.005) : kind === 'wafer' ? 0.018 : kind === 'frozen' ? 0.016 : kind === 'veggie' ? randRange(0.007, 0.011) : 0.006;
      const color = f.color[Math.floor(Math.random() * f.color.length)];
      const p = this.spawn(kind, pos, vel, size, color, f);
      if (p) p.delay = i * 0.025 + Math.random() * 0.15;
    }
    this.aq.addRipple(x, z, 1);
    bus.emit('food:dropped', { food: f, x, z });
  }

  update(dt) {
    const aq = this.aq;
    const b = aq.bounds(0.03);
    const wy = aq.waterY;
    for (const p of this.particles) {
      if (!p.active) continue;
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.t += dt;
      // above water: fall in
      if (!p.inWater) {
        p.vel.y -= 2.5 * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y <= wy) {
          p.inWater = true;
          p.pos.y = wy - 0.002;
          p.vel.set(p.vel.x * 0.2, 0, p.vel.z * 0.2);
          p.t = 0;
          if (Math.random() < 0.25) aq.addRipple(p.pos.x, p.pos.z, 0.35);
        }
      } else if (p.resting) {
        // lying on the substrate, slowly decaying
        if (p.t > 70) {
          this.remove(p);
          bus.emit('food:decayed', { food: p.food });
          continue;
        }
      } else {
        const floorY = aq.substrateY(p.pos.x, p.pos.z) + p.size * 0.4;
        let sink;
        switch (p.kind) {
          case 'flake': sink = 0.022; break;
          case 'veggie': sink = 0.035; break;
          case 'pellet': sink = 0.055; break;
          case 'wafer': sink = 0.17; break;
          case 'frozen': sink = 0.0; break;
          case 'worm': sink = 0.04; break;
          case 'treat': sink = 0.03; break;
          default: sink = 0.04;
        }
        if (p.t < p.surface) {
          // floating on the surface, drifting with the current
          p.pos.y = wy - 0.003;
          p.pos.x += Math.sin(p.t * 0.7 + p.size * 900) * 0.01 * dt;
          p.pos.z += Math.cos(p.t * 0.5 + p.size * 700) * 0.008 * dt;
          if (p.kind === 'frozen' && p.t + dt >= p.surface) {
            // the frozen cube breaks apart into wriggly pieces
            for (let k = 0; k < 6; k++) {
              const v = new THREE.Vector3(randRange(-0.04, 0.04), -0.02, randRange(-0.04, 0.04));
              const w = this.spawn('worm', p.pos.clone().add(new THREE.Vector3(randRange(-0.02, 0.02), -0.005, randRange(-0.02, 0.02))), v, 0.006, p.color, p.food);
              if (w) w.inWater = true;
            }
            this.remove(p);
            continue;
          }
        } else {
          p.vel.y = THREE.MathUtils.lerp(p.vel.y, -sink, 1 - Math.exp(-2 * dt));
          const flutter = p.kind === 'flake' || p.kind === 'veggie' ? 0.04 : p.kind === 'worm' ? 0.02 : 0.006;
          p.vel.x = Math.sin(p.t * 2.3 + p.size * 1000) * flutter;
          p.vel.z = Math.cos(p.t * 1.9 + p.size * 800) * flutter * 0.7;
          p.pos.addScaledVector(p.vel, dt);
          p.rot.x += p.spin * dt;
          p.rot.z += p.spin * 0.7 * dt;
        }
        p.pos.x = clamp(p.pos.x, b.minX, b.maxX);
        p.pos.z = clamp(p.pos.z, b.minZ, b.maxZ);
        if (p.pos.y <= floorY) {
          p.pos.y = floorY;
          p.resting = true;
          p.t = 0;
          p.rot.x = Math.PI / 2;
          if (p.kind === 'wafer') p.rot.set(0, p.rot.y, 0);
        }
      }
    }
    this.render();
  }

  render() {
    const counts = {};
    for (const k of KINDS) counts[k] = 0;
    const m = this._m4, q = this._q, s = this._s;
    for (const p of this.particles) {
      if (!p.active || p.delay > 0) continue;
      const mesh = this.meshes[p.kind];
      const i = counts[p.kind]++;
      q.setFromEuler(p.rot);
      if (p.kind === 'worm') q.setFromEuler(this._e.set(p.rot.x, p.rot.y, Math.sin(p.t * 9) * 0.6));
      s.setScalar(p.size);
      m.compose(p.pos, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, p.color);
    }
    for (const k of KINDS) {
      const mesh = this.meshes[k];
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  remove(p) {
    if (!p.active) return;
    p.active = false;
    this.activeCount--;
  }

  // Choose the most attractive particle for this fish (or null).
  findFor(fish, rangeMul = 1) {
    if (!this.activeCount) return null;
    const sp = fish.sp;
    const diet = sp.diet;
    const bottom = sp.behavior.kind === 'bottom' || sp.behavior.kind === 'glass';
    let range = (0.7 + (fish.has('greedy') ? 0.6 : 0) + (fish.has('curious') ? 0.15 : 0) - (fish.has('shy') ? 0.2 : 0)) * rangeMul;
    if (fish.rec.hunger > 0.6) range *= 1.4;
    let best = null, bestScore = Infinity;
    for (const p of this.particles) {
      if (!p.active || p.delay > 0 || !p.inWater) continue;
      const cat = p.kind === 'worm' ? 'frozen' : p.kind === 'treat' ? 'treat' : p.food?.cat ?? p.kind;
      if (!diet.includes(cat) && fish.stage !== 'FRY') continue;
      if (fish.stage === 'FRY' && p.kind === 'wafer') continue;
      const nearFloor = p.resting || p.pos.y < this.aq.substrateY(p.pos.x, p.pos.z) + 0.2;
      if (bottom && !nearFloor) continue;
      if (!bottom && p.resting && sp.behavior.depth[0] > 0.2) continue;
      const d = fish.pos.distanceTo(p.pos);
      if (d > range) continue;
      const fav = fish.rec.favoriteFood === cat ? 0.7 : 1;
      const score = d * (1 + p.targets * 0.6) * fav;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best && fish.foodTarget !== best) {
      if (fish.foodTarget) fish.foodTarget.targets = Math.max(0, fish.foodTarget.targets - 1);
      best.targets++;
    }
    return best;
  }

  eat(p, fish) {
    if (!p.active) return;
    this.remove(p);
    const f = p.food ?? FOOD_BY_ID.flakes;
    const cat = p.kind === 'worm' ? 'frozen' : f.cat;
    const fav = fish.rec.favoriteFood === cat ? 1.35 : 1;
    const per = f.nutrition / Math.max(3, f.count * 0.35);
    const sizeK = 0.6 + fish.sp.adultSize * 3;
    fish.rec.hunger = clamp(fish.rec.hunger - (per * fav) / sizeK * 2.2, 0, 1);
    fish.rec.happiness = clamp(fish.rec.happiness + f.happy * 0.25 * fav, 0, 1);
    fish.rec.eaten = (fish.rec.eaten ?? 0) + 1;
    if (f.id === 'treat') fish.rec.bond = clamp(fish.rec.bond + 0.02, 0, 1);
    if (f.beauty) fish.rec.colorBoost = clamp((fish.rec.colorBoost ?? 0) + f.beauty * 0.1, 0, 0.3);
    bus.emit('fish:ate', { fish: fish.rec, food: f });
  }

  clear() {
    for (const p of this.particles) if (p.active) this.remove(p);
    this.render();
  }

  dispose() {
    this.group.removeFromParent();
  }
}
