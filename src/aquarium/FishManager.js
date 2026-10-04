// Owns the FishActors for the active tank and provides the shared environment
// their AI reads: colliders, food, school targets, rest/hide spots, attractors.
import * as THREE from 'three';
import { FishActor } from './FishActor.js';
import { clamp, randRange, pick } from '../core/util.js';
import { tankStandard } from '../render/materials.js';
import { bus } from '../core/EventBus.js';

export class FishManager {
  constructor(aquarium, food, plants, decor) {
    this.aq = aquarium;
    this.food = food;
    this.plants = plants;
    this.decor = decor;
    this.group = new THREE.Group();
    this.group.name = 'fish';
    aquarium.contents.add(this.group);
    this.actors = new Map();
    this.schoolTargets = new Map();
    this.attractor = null;
    this.night = false;
    this.colliderCache = [];
    this.colliderDirty = true;
    this.selectedId = null;
    this.props = new THREE.Group();
    aquarium.contents.add(this.props);
    this.patternTimer = 0;
    const self = this;
    this.env = {
      fish: [],
      colliders: [],
      bounds: null,
      food,
      aquarium,
      night: false,
      tankLight: 1,
      attractor: null,
      schoolTarget: (id) => self.schoolTarget(id),
      findRestSpot: (f) => self.findRestSpot(f),
      hideSpot: (f) => self.hideSpot(f),
    };
  }

  load(tank) {
    this.clear();
    this.tank = tank;
    this.colliderDirty = true;
    const b = this.aq.bounds();
    for (const rec of tank.fish) this.addActor(rec, b);
  }

  clear() {
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
    this.schoolTargets.clear();
  }

  addActor(rec, b = this.aq.bounds(), pos) {
    const a = new FishActor(rec, { aquarium: this.aq, manager: this });
    this.group.add(a.group);
    if (rec.stage === 'EGG') {
      const spot = rec.eggSpot ? new THREE.Vector3(rec.eggSpot.x, rec.eggSpot.y, rec.eggSpot.z) : this.eggSpot();
      rec.eggSpot = { x: spot.x, y: spot.y, z: spot.z };
      a.pos.copy(spot);
      a.group.position.copy(spot);
    } else a.spawn(b, pos);
    this.actors.set(rec.id, a);
    return a;
  }

  removeActor(id) {
    const a = this.actors.get(id);
    if (!a) return;
    a.dispose();
    this.actors.delete(id);
    if (this.selectedId === id) this.selectedId = null;
  }

  get list() {
    return [...this.actors.values()];
  }

  eggSpot() {
    const spots = this.plants.restSpots();
    if (spots.length) {
      const s = pick(spots).clone();
      s.y = Math.max(this.aq.substrateY(s.x, s.z) + 0.03, s.y - 0.05);
      return s;
    }
    const b = this.aq.bounds();
    const x = randRange(b.minX + 0.2, b.maxX - 0.2), z = randRange(b.minZ + 0.1, b.maxZ - 0.2);
    return new THREE.Vector3(x, this.aq.substrateY(x, z) + 0.01, z);
  }

  invalidateColliders() {
    this.colliderDirty = true;
  }

  schoolTarget(speciesId) {
    let st = this.schoolTargets.get(speciesId);
    const b = this.env.bounds;
    if (!st) {
      st = { pos: new THREE.Vector3(), timer: 0, pattern: null };
      this.schoolTargets.set(speciesId, st);
    }
    st.timer -= this._dt ?? 0.016;
    if (st.pattern) {
      // "school forms pattern" event: swim in a slow circle
      st.pattern.t += this._dt ?? 0.016;
      const a = st.pattern.t * 0.9;
      st.pos.set(st.pattern.cx + Math.cos(a) * 0.35, st.pattern.cy + Math.sin(a * 2) * 0.05, st.pattern.cz + Math.sin(a) * 0.18);
      if (st.pattern.t > 22) st.pattern = null;
      return st.pos;
    }
    if (st.timer <= 0) {
      st.pos.set(randRange(b.minX + 0.3, b.maxX - 0.3), randRange(b.minY + (b.maxY - b.minY) * 0.3, b.maxY - 0.12), randRange(b.minZ + 0.15, b.maxZ - 0.15));
      st.timer = randRange(5, 10);
    }
    return st.pos;
  }

  startSchoolPattern() {
    // pick the largest school
    const counts = {};
    for (const a of this.actors.values()) if (a.sp.behavior.schooling > 0.5 && a.rec.stage !== 'EGG') counts[a.sp.id] = (counts[a.sp.id] ?? 0) + 1;
    const best = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
    if (!best || best[1] < 4) return false;
    const b = this.env.bounds;
    const st = this.schoolTargets.get(best[0]) ?? { pos: new THREE.Vector3(), timer: 0 };
    st.pattern = { t: 0, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 + 0.1, cz: (b.minZ + b.maxZ) / 2 };
    this.schoolTargets.set(best[0], st);
    return best[0];
  }

  findRestSpot(f) {
    const beh = f.sp.behavior;
    if (beh.kind === 'bottom' || beh.kind === 'glass') return null;
    const spots = this.plants.restSpots().concat(this.decor.hideSpots());
    if (!spots.length || Math.random() < 0.25) {
      const b = this.env.bounds;
      const x = randRange(b.minX + 0.2, b.maxX - 0.2), z = randRange(b.minZ + 0.1, b.minZ + (b.maxZ - b.minZ) * 0.5);
      return new THREE.Vector3(x, this.aq.substrateY(x, z) + 0.1 + Math.random() * 0.2, z);
    }
    const s = pick(spots).clone();
    s.x += randRange(-0.05, 0.05);
    s.y += randRange(0, 0.06);
    return s;
  }

  hideSpot(f) {
    if (!f._hide || Math.random() < 0.002) {
      const spots = this.decor.hideSpots().concat(this.plants.restSpots());
      f._hide = spots.length ? pick(spots).clone() : null;
    }
    return f._hide ?? f.pos;
  }

  // Startle fish near a point (glass tap, cat at glass)
  startle(point, radius = 0.6, from) {
    for (const a of this.actors.values()) {
      if (a.rec.stage === 'EGG') continue;
      const d = a.pos.distanceTo(point);
      if (d < radius) {
        if (a.has('brave') || a.has('curious')) {
          a.burst = 0.4;
          continue;
        }
        a.alert = 2 + Math.random() * 2;
        a.alertFrom = (from ?? point).clone();
        a.burst = 0.9;
      }
    }
  }

  // ----------------------------------------------------------- tricks
  startTrick(fishId, trick, ctx) {
    const a = this.actors.get(fishId);
    if (!a || a.rec.stage === 'EGG') return false;
    const b = this.env.bounds;
    const front = b.maxZ - 0.08;
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const tr = { id: trick, time: 0, target: new THREE.Vector3(), done: false, speed: a.sp.behavior.maxSpeed * 0.7 };
    const clean = () => {
      if (tr.prop) {
        tr.prop.removeFromParent();
        tr.prop = null;
      }
    };
    switch (trick) {
      case 'glass':
        tr.update = (f, dt, t) => {
          t.target.set(ctx?.x ?? cx, cy + 0.05, front);
          if (t.time > 5) t.done = true;
          if (f.pos.distanceTo(t.target) < 0.08) t.speed = 0.01;
        };
        break;
      case 'circle':
        tr.update = (f, dt, t) => {
          const a2 = t.time * 1.8;
          if (!t.center) t.center = new THREE.Vector3(clamp(f.pos.x, b.minX + 0.3, b.maxX - 0.3), f.pos.y, clamp(f.pos.z, b.minZ + 0.25, b.maxZ - 0.25));
          t.target.set(t.center.x + Math.cos(a2) * 0.2, t.center.y + Math.sin(a2 * 2) * 0.02, t.center.z + Math.sin(a2) * 0.18);
          if (t.time > 7) t.done = true;
        };
        break;
      case 'follow':
        tr.update = (f, dt, t) => {
          if (this.attractor?.kind === 'pointer') t.target.copy(this.attractor.pos);
          else t.target.set(cx + Math.sin(t.time) * 0.4, cy, front);
          if (t.time > 8) t.done = true;
        };
        break;
      case 'target': {
        const stick = new THREE.Group();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.35, 6), tankStandard({ color: 0x2a2a2a }));
        rod.position.y = 0.175;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), tankStandard({ color: 0xff5a3a, emissive: 0x401008 }));
        stick.add(rod, ball);
        stick.position.set(clamp(a.pos.x + 0.3, b.minX + 0.1, b.maxX - 0.1), this.aq.waterY - 0.3, clamp(a.pos.z + 0.1, b.minZ + 0.1, b.maxZ - 0.1));
        this.props.add(stick);
        tr.prop = stick;
        tr.update = (f, dt, t) => {
          t.target.copy(stick.position);
          if (f.mouth().distanceTo(stick.position) < 0.04 || t.time > 7) {
            t.done = true;
            clean();
          }
        };
        break;
      }
      case 'hoop': {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 8, 32), tankStandard({ color: 0xffc040, emissive: 0x402800, roughness: 0.3 }));
        hoop.position.set(clamp(cx, b.minX + 0.3, b.maxX - 0.3), cy + 0.08, (b.minZ + b.maxZ) / 2 + 0.1);
        hoop.rotation.y = Math.PI / 2;
        this.props.add(hoop);
        tr.prop = hoop;
        const side = a.pos.x < hoop.position.x ? -1 : 1;
        tr.update = (f, dt, t) => {
          if (!t.passed) {
            t.target.copy(hoop.position).add(new THREE.Vector3(-side * 0.35, 0, 0));
            if (t.stage === undefined) t.stage = 0;
            if (t.stage === 0) {
              t.target.set(hoop.position.x + side * 0.3, hoop.position.y, hoop.position.z);
              if (f.pos.distanceTo(t.target) < 0.08) t.stage = 1;
            } else {
              t.target.set(hoop.position.x - side * 0.35, hoop.position.y, hoop.position.z);
              if (Math.sign(f.pos.x - hoop.position.x) === -side) t.passed = true;
            }
          }
          if (t.passed && t.time > 1) {
            t.done = true;
            clean();
          }
          if (t.time > 10) {
            t.done = true;
            clean();
          }
        };
        break;
      }
      case 'ball': {
        const ballM = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), tankStandard({ color: 0x3fa9ff, roughness: 0.3 }));
        ballM.position.set(clamp(a.pos.x, b.minX + 0.2, b.maxX - 0.2), this.aq.waterY - 0.03, clamp(a.pos.z, b.minZ + 0.1, b.maxZ - 0.1));
        this.props.add(ballM);
        tr.prop = ballM;
        tr.update = (f, dt, t) => {
          t.target.copy(ballM.position);
          if (f.mouth().distanceTo(ballM.position) < 0.06) {
            ballM.position.addScaledVector(f.dir, dt * 0.25);
            ballM.position.y = this.aq.waterY - 0.03;
            ballM.rotation.z -= dt * 3;
          }
          ballM.position.x = clamp(ballM.position.x, b.minX + 0.05, b.maxX - 0.05);
          ballM.position.z = clamp(ballM.position.z, b.minZ + 0.05, b.maxZ - 0.05);
          if (t.time > 8) {
            t.done = true;
            clean();
          }
        };
        break;
      }
      default:
        return false;
    }
    if (a.trick?.prop) a.trick.prop.removeFromParent();
    a.trick = tr;
    return true;
  }

  // ------------------------------------------------------------- update
  update(dt, t, tankLight, night) {
    this._dt = dt;
    if (this.colliderDirty) {
      this.colliderCache = this.decor.colliders().concat(this.plants.colliders());
      this.colliderDirty = false;
    }
    const env = this.env;
    env.fish = this.list;
    env.colliders = this.colliderCache;
    env.bounds = this.aq.bounds(0.04);
    env.night = night;
    env.tankLight = tankLight;
    env.attractor = this.attractor;
    this.night = night;
    for (const a of env.fish) a.update(dt, t, env);
  }

  // Screen-space picking (robust for small fast fish).
  pickScreen(camera, x, y, w, h, radiusPx = 46) {
    let best = null, bestD = Infinity;
    const v = new THREE.Vector3();
    for (const a of this.actors.values()) {
      v.copy(a.pos).project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const dist = Math.hypot(sx - x, sy - y);
      const r = radiusPx + a.length * 300;
      if (dist < r && dist < bestD) {
        bestD = dist;
        best = a;
      }
    }
    return best;
  }

  get(id) {
    return this.actors.get(id);
  }
}
