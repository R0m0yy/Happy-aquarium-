// Player-built structures: placement preview & validation, construction progress,
// fire / cooking / drying / rain-collection / storage simulation, weather damage,
// repair, upgrade, walkable floors and persistence.
import * as THREE from 'three';
import { STRUCTURES, ITEMS } from '../data/items.js';
import { BUILD, structureMats, foodModel } from './structureModels.js';
import { terrainHeight, terrainNormal } from './islands.js';
import { Inventory } from '../systems/inventory.js';

const _n = new THREE.Vector3();
let SID = 1;

export class Structures {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.root = new THREE.Group();
    this.root.name = 'structures';
    game.scene.add(this.root);
    this.ghost = null;
    this.ghostType = null;
    this.ghostRot = 0;
    this.ghostValid = false;
    this.time = 0;
  }

  // ---------- placement ----------
  startPlacement(type) {
    this.cancelPlacement();
    this.ghostType = type;
    const m = BUILD[type] ? BUILD[type]() : BUILD.scaffold(type);
    m.traverse((o) => {
      if (o.isMesh) { o.material = structureMats().ghostOk; o.castShadow = false; }
      if (o.isLight) o.intensity = 0;
    });
    this.ghost = m;
    this.root.add(m);
  }
  cancelPlacement() {
    if (this.ghost) this.root.remove(this.ghost);
    this.ghost = null; this.ghostType = null;
  }
  rotateGhost(d) { this.ghostRot += d; }

  placementPose(player) {
    const def = STRUCTURES[this.ghostType];
    const f = player.forward(new THREE.Vector3());
    const dist = def.r + 1.6;
    const p = player.pos.clone().addScaledVector(f, dist);
    let rot = player.heading + this.ghostRot;
    if (def.place === 'shore') {
      // docks extend away from land: aim down-slope
      terrainNormal(p.x, p.z, _n);
      rot = Math.atan2(-_n.x, -_n.z) + Math.PI + this.ghostRot * 0.2;
      rot = Math.atan2(_n.x, _n.z) + this.ghostRot * 0.15;
    }
    return { x: p.x, z: p.z, rot };
  }

  validate(type, x, z, rot) {
    const def = STRUCTURES[type];
    const g = this.game;
    const h = terrainHeight(x, z);
    const water = g.ocean.level;
    const reasons = [];
    if (def.boat) {
      if (water - h < 0.4) reasons.push('Must be built at the water\'s edge');
      if (water - h > 2.5) reasons.push('Too deep - build in the shallows');
    } else if (def.place === 'shore') {
      const tip = { x: x + Math.sin(rot) * 9, z: z + Math.cos(rot) * 9 };
      if (h < water - 0.3 || h > 1.6) reasons.push('Start a dock on the beach edge');
      if (terrainHeight(tip.x, tip.z) > water - 0.6) reasons.push('The end must reach water');
    } else {
      if (h < water + 0.35 && def.place !== 'any') reasons.push('Needs dry ground');
      if (def.place === 'any' && h < water - 1.5) reasons.push('Too deep');
      // slope
      let mn = Infinity, mx = -Infinity;
      for (let a = 0; a < 6; a++) {
        const hh = terrainHeight(x + Math.cos(a) * def.r * 0.8, z + Math.sin(a) * def.r * 0.8);
        mn = Math.min(mn, hh); mx = Math.max(mx, hh);
      }
      if (mx - mn > Math.max(0.6, def.r * 0.45)) reasons.push('Ground too steep');
      if (def.place === 'beach' && (h > 2.4)) reasons.push('Build on the beach');
    }
    // overlaps
    for (const s of this.list) {
      if (s.type === 'cookingRack' || type === 'cookingRack') continue;
      if (Math.hypot(s.x - x, s.z - z) < (STRUCTURES[s.type].r + def.r) * 0.85) { reasons.push('Overlaps a structure'); break; }
    }
    if (!def.boat && def.place !== 'shore') {
      const solids = g.nature.grid.query(x, z, def.r * 0.8);
      if (solids.some((o) => o.solid && o.inst.alive)) reasons.push('Clear the trees or rocks first');
    }
    if (def.near && !this.nearest(def.near, x, z, 2.5)) reasons.push(`Must be placed over a ${STRUCTURES[def.near].name.toLowerCase()}`);
    if (type === 'cookingRack') {
      const fire = this.nearest('campfire', x, z, 2.5);
      if (fire && fire.rack) reasons.push('This fire already has a rack');
    }
    if (!g.inv.has(def.in)) reasons.push('Missing materials');
    if (def.tools && !g.inv.hasTools(def.tools)) reasons.push('Requires ' + def.tools.map((t) => ITEMS[t].name).join(', '));
    return reasons;
  }

  updateGhost(player) {
    if (!this.ghost) return;
    const pose = this.placementPose(player);
    let { x, z, rot } = pose;
    if (this.ghostType === 'cookingRack') {
      const fire = this.nearest('campfire', x, z, 3);
      if (fire) { x = fire.x; z = fire.z; rot = fire.rot; }
    }
    const def = STRUCTURES[this.ghostType];
    const y = def.boat ? this.game.ocean.level : def.place === 'shore' ? 0 : terrainHeight(x, z);
    this.ghost.position.set(x, y, z);
    this.ghost.rotation.y = rot;
    this.ghostPose = { x, z, rot };
    const reasons = this.validate(this.ghostType, x, z, rot);
    this.ghostValid = reasons.length === 0;
    this.ghostReasons = reasons;
    const mat = this.ghostValid ? structureMats().ghostOk : structureMats().ghostBad;
    this.ghost.traverse((o) => { if (o.isMesh) o.material = mat; });
  }

  confirmPlacement() {
    if (!this.ghost || !this.ghostValid) return null;
    const type = this.ghostType, def = STRUCTURES[type];
    const { x, z, rot } = this.ghostPose;
    this.game.inv.consume(def.in);
    this.cancelPlacement();
    if (def.boat) {
      const b = this.game.boats.spawn(def.boat, x, z, rot);
      return { boat: b };
    }
    const s = this.add(type, x, z, rot, { progress: 0 });
    return { site: s };
  }

  // ---------- structure lifecycle ----------
  add(type, x, z, rot, opts = {}) {
    const def = STRUCTURES[type];
    if (type === 'cookingRack') {
      const fire = this.nearest('campfire', x, z, 3);
      if (fire) { x = fire.x; z = fire.z; rot = fire.rot; }
    }
    const s = {
      id: opts.id || SID++, type, x, z, rot,
      y: def.place === 'shore' ? 0 : terrainHeight(x, z),
      hp: opts.hp ?? def.hp, maxHp: def.hp,
      progress: opts.progress ?? 1,
      data: opts.data || {},
      group: new THREE.Group(),
    };
    SID = Math.max(SID, s.id + 1);
    s.group.position.set(x, s.y, z);
    s.group.rotation.y = rot;
    this.root.add(s.group);
    this.list.push(s);
    this.initData(s);
    this.refreshModel(s);
    if (type === 'cookingRack') {
      const fire = this.nearest('campfire', x, z, 3);
      if (fire) { fire.rack = s; s.fire = fire; }
    }
    return s;
  }

  initData(s) {
    const d = s.data;
    if (s.type === 'campfire') { d.fuel ??= 3; d.lit ??= true; d.cook ??= []; d.boil ??= 0; }
    if (s.type === 'cookingRack') { d.cook ??= []; }
    if (s.type === 'dryingRack') { d.items ??= []; }
    if (s.type === 'waterCollector') { d.water ??= 0; }
    if (s.type === 'storageBasket' || s.type === 'woodenHut') {
      s.storage = new Inventory(s.type === 'woodenHut' ? 20 : 16, 999);
      if (d.items) s.storage.restore(d.items);
    }
  }

  refreshModel(s) {
    s.group.clear();
    const model = s.progress >= 1 ? BUILD[s.type](s.id) : BUILD.scaffold(s.type);
    s.group.add(model);
    s.model = model;
    s.flames = model.getObjectByName('flames');
    s.light = model.getObjectByName('light');
    s.logs = model.getObjectByName('logs');
    s.slots = model.getObjectByName('slots');
    s.waterMesh = model.getObjectByName('water');
    this.refreshFood(s);
  }

  remove(s) {
    this.root.remove(s.group);
    this.list = this.list.filter((x) => x !== s);
    if (s.fire) s.fire.rack = null;
    if (s.rack) this.remove(s.rack);
  }

  nearest(type, x, z, maxD = Infinity) {
    let best = null, bd = maxD;
    for (const s of this.list) {
      if (type && s.type !== type) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // walkable surfaces (platforms, docks, hut floors are entered via ladder)
  floorAt(x, z, currentY) {
    let best = -Infinity;
    for (const s of this.list) {
      if (s.progress < 1) continue;
      const def = STRUCTURES[s.type];
      if (!def.floor) continue;
      const dx = x - s.x, dz = z - s.z;
      const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
      const lx = dx * c + dz * sn, lz = -dx * sn + dz * c;
      let top = -Infinity;
      if (s.type === 'dock') {
        if (Math.abs(lx) < 0.9 && lz > -0.4 && lz < 9.2) top = s.y + 0.97;
      } else if (s.type === 'raisedPlatform') {
        const fy = s.y + 1.13;
        if (Math.abs(lx) < 1.9 && Math.abs(lz) < 1.9) top = fy;
        // steps on +x
        else if (lx >= 1.8 && lx < 3.4 && Math.abs(lz) < 0.55) top = s.y + 1.13 - ((lx - 1.8) / 1.6) * 1.0;
      }
      if (top > best && top - currentY < 0.7) best = top;
    }
    return best;
  }

  // circle obstacles for the player / animals
  collide(pos, r) {
    for (const s of this.list) {
      const def = STRUCTURES[s.type];
      if (s.type === 'dock' || s.type === 'raisedPlatform' || s.type === 'cookingRack') continue;
      let cr = def.r * 0.75;
      if (s.type === 'palmShelter') cr = 0.6; // open front: you can step under it
      if (s.type === 'boatShelter') continue;
      const dx = pos.x - s.x, dz = pos.z - s.z;
      const d = Math.hypot(dx, dz);
      const minD = cr + r;
      if (d < minD && d > 0.0001) { pos.x = s.x + (dx / d) * minD; pos.z = s.z + (dz / d) * minD; }
    }
    // dock & platform posts
    for (const s of this.list) {
      if (s.type !== 'dock' && s.type !== 'raisedPlatform') continue;
    }
  }

  // ---------- simulation ----------
  update(dt, dtH, env) {
    this.time += dt;
    const g = this.game;
    const rain = env.w.rain;
    const storm = Math.max(0, env.w.waves - 1.3) / 1.0;
    for (const s of this.list) {
      if (s.progress < 1) continue;
      const d = s.data;
      const sheltered = this.isSheltered(s.x, s.z);
      if (s.type === 'campfire') {
        if (d.lit) {
          d.fuel -= dtH * (1 + env.w.wind * 0.6);
          if (rain > 0.5 && !sheltered) d.fuel -= dtH * rain * 3;
          if (d.fuel <= 0) { d.fuel = 0; d.lit = false; g.ui?.toast('The campfire has burned out.'); }
        }
        const on = d.lit ? 1 : 0;
        const flick = 0.85 + Math.sin(this.time * 13 + s.id) * 0.08 + Math.sin(this.time * 31) * 0.05;
        if (s.light) { s.light.intensity = on * flick * (10 + Math.min(d.fuel, 4) * 3); }
        if (s.flames) {
          s.flames.visible = !!on;
          s.flames.scale.setScalar(0.6 + Math.min(1, d.fuel / 3) * 0.5);
          for (const f of s.flames.children) f.material.uniforms.uTime.value = this.time + s.id;
        }
        if (on && Math.random() < dt * 6) g.fx.embers(s.x, s.y + 0.5, s.z, 1);
        if (Math.random() < dt * (on ? 2.5 : 0.6) && (on || d.fuel === 0 && this.time % 30 < 10)) g.fx.smoke(s.x, s.y + 0.9, s.z, 1, on ? 0.4 : 0.2);
        // cooking on fire / rack
        const cookList = s.rack ? s.rack.data.cook : d.cook;
        if (on) this.cookTick(cookList, dtH, s.rack ? s.rack : s);
        if (on && d.boil > 0) {
          d.boil -= dtH;
          if (d.boil <= 0) { const n = d.boilN || 0; g.inv.add('cleanWater', n); g.ui?.toast(`${n} portions of water boiled and safe to drink.`); d.boilN = 0; }
        }
      }
      if (s.type === 'dryingRack') {
        const sun = env.daylight * (1 - env.w.cloud * 0.5) * (rain > 0.2 && !sheltered ? 0 : 1);
        let changed = false;
        for (const it of d.items) {
          it.t += dtH * (0.3 + sun);
          if (it.t >= 7 && !it.done) { it.id = ITEMS[it.id].dry || it.id; it.done = true; changed = true; }
          if (!it.done && rain > 0.3 && !sheltered && Math.random() < dtH * 0.05) { it.id = 'spoiled'; it.done = true; changed = true; }
        }
        if (changed) this.refreshFood(s);
      }
      if (s.type === 'waterCollector') {
        if (rain > 0.05) d.water = Math.min(6, d.water + rain * dtH * 2.2);
        if (s.waterMesh) { s.waterMesh.visible = d.water >= 1; }
      }
      if (s.storage) {
        s.storage.tick(dtH, 0.55);
      }
      // weather damage
      if (storm > 0 && !(s.type === 'boatShelter')) {
        s.hp -= storm * dtH * (s.type === 'woodenHut' ? 1.5 : 4) * (sheltered && s.type !== 'palmShelter' ? 0.3 : 1);
        if (s.hp <= 0) {
          g.ui?.toast(`The storm destroyed your ${STRUCTURES[s.type].name.toLowerCase()}!`, 'bad');
          g.fx.chips(s.x, s.y + 1, s.z, [0.6, 0.5, 0.35], 30);
          this.remove(s);
          break;
        }
      }
    }
  }

  cookTick(list, dtH, holder) {
    let changed = false;
    for (const it of list) {
      it.t += dtH;
      const def = ITEMS[it.id];
      if (!it.cooked && it.t >= 0.6) { it.id = def.cook || it.id; it.cooked = true; changed = true; }
      // leave fish on the rack much longer and it smokes
      if (it.cooked && !it.smoked && it.id === 'cookedFish' && it.t >= 5 && holder.type === 'cookingRack') { it.id = 'smokedFish'; it.smoked = true; changed = true; }
      if (it.cooked && it.t > (holder.type === 'cookingRack' ? 14 : 2.2) && it.id !== 'smokedFish') { it.id = 'spoiled'; it.cooked = true; changed = true; it.burnt = true; }
    }
    if (changed) this.refreshFood(holder);
  }

  refreshFood(s) {
    const holder = s.slots || (s.model && s.model.getObjectByName('slots'));
    if (s.type === 'campfire' && !s.rack) {
      // a skewer over the coals
      let sk = s.group.getObjectByName('skewer');
      if (sk) s.group.remove(sk);
      if (s.data.cook && s.data.cook.length) {
        sk = new THREE.Group(); sk.name = 'skewer';
        const f = foodModel(s.data.cook[0].id); f.position.set(0, 0.75, 0); f.rotation.y = Math.PI / 2;
        sk.add(f);
        s.group.add(sk);
      }
      return;
    }
    if (!holder) return;
    holder.clear();
    const list = s.type === 'dryingRack' ? s.data.items : s.data.cook;
    if (!list) return;
    list.forEach((it, i) => {
      const m = foodModel(it.id);
      if (s.type === 'dryingRack') {
        m.position.set(-0.9 + (i % 4) * 0.6, i < 4 ? 1.0 : 0.65, 0);
        m.rotation.x = Math.PI / 2;
      } else {
        m.position.set(-0.35 + (i % 4) * 0.23, 0.68, (i < 4 ? -0.05 : 0.15));
      }
      holder.add(m);
    });
  }

  isSheltered(x, z) {
    for (const s of this.list) {
      if (s.progress < 1) continue;
      if ((s.type === 'palmShelter' || s.type === 'woodenHut' || s.type === 'boatShelter') && Math.hypot(s.x - x, s.z - z) < STRUCTURES[s.type].r * 1.05) return true;
    }
    return false;
  }

  shelterQuality(x, z) {
    let q = 0;
    for (const s of this.list) {
      if (s.progress < 1) continue;
      const def = STRUCTURES[s.type];
      if (def.shelter && Math.hypot(s.x - x, s.z - z) < def.r * 1.3) q = Math.max(q, def.shelter * (0.5 + 0.5 * s.hp / s.maxHp));
    }
    return q;
  }

  fireHeat(x, z) {
    let h = 0;
    for (const s of this.list) {
      if (s.type !== 'campfire' || !s.data.lit || s.progress < 1) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      h = Math.max(h, 1 - Math.min(1, Math.max(0, (d - 1) / 4)));
    }
    return h;
  }

  serialize() {
    return this.list.map((s) => ({
      id: s.id, type: s.type, x: s.x, z: s.z, rot: s.rot, hp: s.hp, progress: s.progress,
      data: { ...s.data, items: s.storage ? s.storage.serialize() : s.data.items },
    }));
  }
  restore(arr) {
    for (const s of [...this.list]) this.remove(s);
    // fires first so racks can attach
    const sorted = [...arr].sort((a, b) => (a.type === 'campfire' ? -1 : 0) - (b.type === 'campfire' ? -1 : 0));
    for (const o of sorted) this.add(o.type, o.x, o.z, o.rot, o);
  }
}
