// Living plants inside the active tank: placement, growth, trimming, blooms.
import * as THREE from 'three';
import { PLANT_BY_ID, SUBSTRATE_BY_ID, LIGHTING_BY_ID } from '../data/items.js';
import { buildPlant, buildFlower } from './PlantModels.js';
import { bus } from '../core/EventBus.js';
import { clamp, uid, hashString } from '../core/util.js';

export class PlantSystem {
  constructor(aquarium) {
    this.aq = aquarium;
    this.group = new THREE.Group();
    this.group.name = 'plants';
    aquarium.contents.add(this.group);
    this.items = new Map(); // uid -> {rec, obj, def}
  }

  load(tank) {
    this.clear();
    this.tank = tank;
    for (const rec of tank.plants) this.spawn(rec);
  }

  clear() {
    for (const it of this.items.values()) it.obj.removeFromParent();
    this.items.clear();
  }

  spawn(rec) {
    const def = PLANT_BY_ID[rec.plantId];
    if (!def) return null;
    const obj = buildPlant(def, hashString(rec.uid) % 997);
    obj.userData.plantUid = rec.uid;
    obj.rotation.y = rec.rot ?? 0;
    this.group.add(obj);
    const it = { rec, obj, def, flower: null };
    this.items.set(rec.uid, it);
    this.place(it);
    return it;
  }

  place(it) {
    const { rec, obj, def } = it;
    const p = this.aq.layoutToWorld(rec.nx, rec.nz);
    if (def.model === 'floaters') p.y = this.aq.waterY - 0.004;
    else p.y -= 0.004;
    obj.position.copy(p);
    const g = clamp(rec.growth ?? 0.6, 0.05, 1.4);
    const hScale = (0.35 + 0.65 * Math.min(1, g)) * (g > 1 ? 1 + (g - 1) * 0.9 : 1);
    const s = (rec.scale ?? 1) * 1.35;
    // cap height so tall plants never poke out of the water
    const maxH = this.aq.waterY - p.y - 0.02;
    const hs = Math.min(hScale * s, maxH / Math.max(0.01, def.height));
    obj.scale.set(s * (0.7 + 0.3 * Math.min(1, g)), def.model === 'floaters' ? 1 : hs, s * (0.7 + 0.3 * Math.min(1, g)));
    if (rec.bloom && def.blooms) {
      if (!it.flower) {
        it.flower = buildFlower(0xfff0f4);
        this.group.add(it.flower);
      }
      it.flower.position.set(p.x + 0.02, this.aq.waterY - 0.006, p.z);
    } else if (it.flower) {
      it.flower.removeFromParent();
      it.flower = null;
    }
  }

  add(plantId, nx = 0, nz = 0) {
    const rec = { uid: uid('pl'), plantId, nx, nz, growth: 0.35, scale: 1, rot: Math.random() * 6.28 };
    this.tank.plants.push(rec);
    const it = this.spawn(rec);
    bus.emit('plant:placed', { plant: PLANT_BY_ID[plantId] });
    return it;
  }

  remove(uidv) {
    const it = this.items.get(uidv);
    if (!it) return null;
    it.obj.removeFromParent();
    it.flower?.removeFromParent();
    this.items.delete(uidv);
    this.tank.plants = this.tank.plants.filter((p) => p.uid !== uidv);
    return it.rec;
  }

  trim(uidv) {
    const it = this.items.get(uidv);
    if (!it) return false;
    if ((it.rec.growth ?? 0) < 0.85) return false;
    it.rec.growth = 0.6;
    this.place(it);
    bus.emit('plant:trimmed', { plant: it.def });
    return true;
  }

  overgrown() {
    return [...this.items.values()].filter((it) => (it.rec.growth ?? 0) >= 1.0);
  }

  // growth rate per second of game time, scaled by equipment, substrate, light
  growthRate(tank) {
    let k = 1;
    k += SUBSTRATE_BY_ID[tank.substrate]?.plantBonus ?? 0;
    k += LIGHTING_BY_ID[tank.lighting]?.plantBonus ?? 0;
    if (tank.equipment?.co2) k += 0.4;
    k *= 0.5 + (tank.water?.quality ?? 0.8) * 0.6;
    return k;
  }

  // Applies growth (also used for offline progress with large dt).
  grow(tank, dt) {
    const k = this.growthRate(tank);
    for (const rec of tank.plants) {
      const def = PLANT_BY_ID[rec.plantId];
      if (!def) continue;
      const rate = def.growth / 2400; // ~40 min (game time) to grow fully at rate 1
      rec.growth = clamp((rec.growth ?? 0.5) + rate * k * dt * (rec.growth > 1 ? 0.35 : 1), 0, 1.3);
      if (def.blooms && rec.growth > 0.9 && !rec.bloom && Math.random() < dt / 1800) {
        rec.bloom = true;
        bus.emit('plant:bloom', { plant: def, rec });
      }
    }
  }

  refresh() {
    for (const it of this.items.values()) this.place(it);
  }

  // Plants are soft obstacles and natural resting/hiding spots.
  colliders() {
    const out = [];
    for (const it of this.items.values()) {
      if (it.def.model === 'floaters' || it.def.model === 'carpet') continue;
      const r = (it.obj.userData.radius ?? 0.08) * it.obj.scale.x * 0.7;
      const h = it.def.height * it.obj.scale.y;
      out.push({ x: it.obj.position.x, y: it.obj.position.y + h * 0.35, z: it.obj.position.z, r, soft: true });
    }
    return out;
  }

  restSpots() {
    return [...this.items.values()].filter((it) => it.def.model !== 'floaters').map((it) => {
      const h = it.def.height * it.obj.scale.y;
      return new THREE.Vector3(it.obj.position.x + 0.06, it.obj.position.y + Math.max(0.05, h * 0.4), it.obj.position.z + 0.06);
    });
  }

  pick(raycaster) {
    const hits = raycaster.intersectObjects(this.group.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.plantUid) o = o.parent;
      if (o) return { uid: o.userData.plantUid, point: h.point, distance: h.distance };
    }
    return null;
  }
}
