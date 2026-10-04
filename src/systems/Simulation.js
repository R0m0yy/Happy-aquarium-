// Tank life simulation: needs, growth stages, breeding/births, water quality,
// algae, plant growth, offline progression and the aquarium beauty score.
import { SPECIES_BY_ID, STAGE_DURATION, LIFE_STAGES } from '../data/species.js';
import { EQUIPMENT_BY_ID, TANK_BY_ID, PLANT_BY_ID, DECOR_BY_ID, SUBSTRATE_BY_ID } from '../data/items.js';
import { inherit, createFish, rarityOf, fishBeauty, canBreed, randomName } from './Genetics.js';
import { bus } from '../core/EventBus.js';
import { clamp, randInt, rating } from '../core/util.js';
import { allFish } from '../core/GameState.js';

export const TRICKS = [
  { id: 'glass', name: 'Come To Glass', desc: 'Swims up to greet you at the glass.' },
  { id: 'follow', name: 'Follow Finger', desc: 'Follows your cursor or finger along the glass.' },
  { id: 'circle', name: 'Circle', desc: 'Swims a graceful loop.' },
  { id: 'target', name: 'Touch Target', desc: 'Taps a target stick with its nose.' },
  { id: 'hoop', name: 'Swim Through Hoop', desc: 'Darts through a floating hoop.' },
  { id: 'ball', name: 'Push Ball', desc: 'Nudges a little ball across the surface.' },
];

export class Simulation {
  constructor(game) {
    this.game = game;
    this.bgTimer = 0;
    this.lastRating = null;
    this.beautyMilestones = new Set();
    this.trainCooldown = new Map();
  }
  get s() {
    return this.game.state;
  }

  equipmentPower(tank, slot) {
    const id = tank.equipment?.[slot];
    return id ? EQUIPMENT_BY_ID[id]?.power ?? 1 : 0;
  }

  // ------------------------------------------------------------ water
  waterTick(tank, dt, offline = false) {
    const w = tank.water;
    const cap = TANK_BY_ID[tank.size]?.cap ?? 18;
    const load = tank.fish.reduce((a, f) => a + (f.stage === 'EGG' ? 0 : SPECIES_BY_ID[f.species].adultSize * 10 * (f.stage === 'ADULT' ? 1 : 0.4)), 0);
    const filter = Math.max(0.6, this.equipmentPower(tank, 'filter')) * (0.5 + 0.5 * tank.filterHealth);
    w.cleanliness = clamp(w.cleanliness - ((0.00003 + load * 0.000022) / filter) * dt, offline ? 0.35 : 0.05, 1);
    tank.filterHealth = clamp(tank.filterHealth - dt / 9000, 0.25, 1);
    const plants = tank.plants.length;
    const air = this.equipmentPower(tank, 'air');
    const crowd = clamp(tank.fish.length / cap, 0, 2);
    w.oxygen = clamp(0.62 + air * 0.18 + Math.min(plants, 12) * 0.015 + tank.filterHealth * 0.1 - Math.max(0, crowd - 0.7) * 0.4, 0.2, 1);
    const roomTemp = 23 + Math.sin(this.game.timeOfDay * Math.PI * 2 - 1.5) * 1.5;
    const target = tank.equipment?.heater ? 25.8 : roomTemp;
    w.temp += (target - w.temp) * Math.min(1, dt / 600);
    // algae & debris
    const uv = tank.equipment?.uv ? 2.2 : 1;
    const light = tank.lighting === 'planted' ? 1.3 : 1;
    const algaeRate = ((0.00004 + 0.00003 * light) * Math.max(0.35, 1 - plants * 0.035)) / uv;
    tank.algae.level = clamp(tank.algae.level + algaeRate * dt, 0, offline ? 0.8 : 1);
    tank.debris = clamp((tank.debris ?? 0) + 0.000015 * dt * (1 + load * 0.1), 0, offline ? 0.7 : 1);
    // overall quality
    const tempFit = this.tempFit(tank);
    w.quality = clamp(w.cleanliness * 0.48 + w.oxygen * 0.22 + tempFit * 0.15 + (1 - Math.max(0, crowd - 0.8)) * 0.1 + (1 - tank.debris) * 0.05, 0, 1);
  }

  tempFit(tank) {
    const fish = tank.fish.filter((f) => f.stage !== 'EGG');
    if (!fish.length) return 1;
    let fit = 0;
    for (const f of fish) {
      const [lo, hi] = SPECIES_BY_ID[f.species].temp;
      const t = tank.water.temp;
      fit += t >= lo && t <= hi ? 1 : clamp(1 - Math.min(Math.abs(t - lo), Math.abs(t - hi)) / 4, 0, 1);
    }
    return fit / fish.length;
  }

  // -------------------------------------------------------------- fish
  fishTick(tank, f, dt, offline = false) {
    const sp = SPECIES_BY_ID[f.species];
    if (f.stage === 'EGG') {
      this.growTick(tank, f, dt);
      return;
    }
    const feeder = !!tank.equipment?.feeder;
    const hungerRate = (1 / 1500) * (f.stage === 'FRY' ? 0.6 : 1);
    f.hunger = clamp(f.hunger + hungerRate * dt, 0, offline && feeder ? 0.4 : 1);
    if (offline && feeder && f.hunger > 0.38) f.hunger = 0.3;
    // happiness target
    const w = tank.water;
    const cap = TANK_BY_ID[tank.size]?.cap ?? 18;
    const crowd = tank.fish.length / cap;
    const plants = Math.min(tank.plants.length / 8, 1);
    const hides = Math.min(tank.decor.filter((d) => DECOR_BY_ID[d.itemId]?.cave || DECOR_BY_ID[d.itemId]?.cat === 'driftwood').length / 2, 1);
    const sameSpecies = tank.fish.filter((o) => o.species === f.species && o !== f).length;
    let social = 0;
    if (sp.social === 'school') social = sameSpecies >= 4 ? 0.1 : sameSpecies >= 2 ? 0 : -0.1;
    if (sp.social === 'solo' && sameSpecies > 0 && sp.behavior.territorial > 0.5) social = f.sex === 'M' ? -0.05 * tank.fish.filter((o) => o.species === f.species && o.sex === 'M' && o !== f).length : 0;
    const tempOk = this.tempFit({ ...tank, fish: [f] });
    const target = clamp(0.42 + w.quality * 0.25 + (f.hunger < 0.5 ? 0.12 : f.hunger > 0.8 ? -0.15 : 0) + plants * 0.08 + hides * 0.05 + social + f.bond * 0.08 - Math.max(0, crowd - 1) * 0.3 + (tempOk - 1) * 0.15 + (f.favorite ? 0.03 : 0), 0.05, 1);
    f.happiness += (target - f.happiness) * Math.min(1, dt / 400);
    if (offline) f.happiness = Math.max(f.happiness, 0.35);
    // health: recovers with good care, dips with neglect; never dies
    const hTarget = clamp(0.55 + w.quality * 0.4 + (f.hunger < 0.6 ? 0.08 : -0.25) + (tempOk - 1) * 0.2, 0.2, 1);
    f.health += (hTarget - f.health) * Math.min(1, dt / (hTarget < f.health ? 1500 : 600));
    f.health = clamp(f.health, offline ? 0.4 : 0.2, 1);
    f.energy = clamp(f.energy + (this.game.isNight ? dt / 900 : -dt / 2400), 0.1, 1);
    f.bond = clamp(f.bond - dt / 200000, 0, 1);
    f.breedCooldown = Math.max(0, (f.breedCooldown ?? 0) - dt);
    f.age = (f.age ?? 0) + dt;
    this.growTick(tank, f, dt);
    if (f.pregnant) {
      f.pregnant.due -= dt;
      if (f.pregnant.due <= 0) this.birth(tank, f);
    }
  }

  growTick(tank, f, dt) {
    if (f.stage === 'ADULT') return;
    const dur = STAGE_DURATION[f.stage] ?? 600;
    const care = f.stage === 'EGG' ? 1 : clamp(0.5 + (1 - f.hunger) * 0.5 + f.happiness * 0.3, 0.4, 1.3);
    f.stageProgress = (f.stageProgress ?? 0) + (dt / dur) * care;
    if (f.stageProgress >= 1) {
      const i = LIFE_STAGES.indexOf(f.stage);
      const prev = f.stage;
      f.stage = LIFE_STAGES[Math.min(LIFE_STAGES.length - 1, i + 1)];
      f.stageProgress = f.stage === 'ADULT' ? 1 : 0;
      if (prev === 'EGG') {
        f.hunger = 0.3;
        bus.emit('fish:hatched', { fish: f, tank });
      } else bus.emit('fish:grew', { fish: f, stage: f.stage, tank });
      if (f.stage === 'ADULT') {
        f.raised = true;
        bus.emit('fish:adult', { fish: f, tank });
      }
    }
  }

  // ---------------------------------------------------------- breeding
  startBreeding(a, b) {
    const chk = canBreed(a, b);
    if (!chk.ok) return chk;
    const mother = a.sex === 'F' ? a : b;
    const father = mother === a ? b : a;
    const sp = SPECIES_BY_ID[mother.species];
    mother.pregnant = { father: father.id, due: sp.breeding.gestation, total: sp.breeding.gestation };
    mother.breedCooldown = sp.breeding.gestation + 600;
    father.breedCooldown = 600;
    mother.bond = clamp(mother.bond + 0.05, 0, 1);
    father.bond = clamp(father.bond + 0.05, 0, 1);
    bus.emit('fish:bred', { mother, father, species: sp });
    return { ok: true, mother, father };
  }

  birth(tank, mother) {
    const s = this.s;
    const sp = SPECIES_BY_ID[mother.species];
    const fatherRec = allFish(s).find((x) => x.id === mother.pregnant.father) ?? s.archive[mother.pregnant.father];
    mother.pregnant = null;
    if (!fatherRec) return;
    const nursery = s.tanks.find((t) => t.type === 'nursery' && t.env === sp.env);
    const dest = nursery ?? tank;
    const [lo, hi] = sp.breeding.clutch;
    const n = randInt(lo, hi);
    const stage = sp.breeding.type === 'live' ? 'FRY' : 'EGG';
    const names = allFish(s).map((f) => f.name);
    const babies = [];
    for (let i = 0; i < n; i++) {
      const genome = inherit(sp.id, mother.genome, fatherRec.genome);
      const baby = createFish(sp.id, {
        genome,
        stage,
        name: randomName(names),
        parents: { mother: mother.id, father: fatherRec.id },
        generation: Math.max(mother.generation ?? 1, fatherRec.generation ?? 1) + 1,
        hunger: 0.3,
        bond: 0.15,
      });
      names.push(baby.name);
      baby.rarity = rarityOf(sp.id, genome);
      dest.fish.push(baby);
      mother.children.push(baby.id);
      fatherRec.children = fatherRec.children ?? [];
      fatherRec.children.push(baby.id);
      babies.push(baby);
      if (genome.mutations.length) bus.emit('mutation', { fish: baby, mutations: genome.mutations });
    }
    s.collection.breedingRecords.unshift({ time: Date.now(), species: sp.id, mother: mother.name, father: fatherRec.name, count: n, mutations: babies.filter((b) => b.genome.mutations.length).length });
    s.collection.breedingRecords = s.collection.breedingRecords.slice(0, 30);
    bus.emit('fish:born', { babies, tank: dest, species: sp, live: stage === 'FRY' });
  }

  // ---------------------------------------------------------- training
  train(fish, trickId) {
    const now = performance.now();
    const cd = this.trainCooldown.get(fish.id) ?? 0;
    if (now < cd) return { ok: false, reason: `Let ${fish.name} rest a moment.`, wait: (cd - now) / 1000 };
    if (fish.stage === 'EGG' || fish.stage === 'FRY') return { ok: false, reason: 'Too young to train.' };
    this.trainCooldown.set(fish.id, now + 9000);
    const prev = fish.tricks[trickId] ?? 0;
    const mult = (fish.personality.includes('curious') ? 1.3 : 1) * (fish.personality.includes('lazy') ? 0.75 : 1) * (fish.personality.includes('playful') ? 1.2 : 1);
    const gain = 0.22 * mult * (0.6 + fish.bond * 0.8);
    fish.tricks[trickId] = clamp(prev + gain, 0, 1);
    fish.bond = clamp(fish.bond + 0.04, 0, 1);
    fish.happiness = clamp(fish.happiness + 0.03, 0, 1);
    if (fish.bond >= 0.99) this.game.progression.stat('maxBond', 1, 'set');
    const learned = prev < 1 && fish.tricks[trickId] >= 1;
    if (learned) bus.emit('trick:learned', { fish, trick: TRICKS.find((t) => t.id === trickId) });
    return { ok: true, progress: fish.tricks[trickId], learned };
  }

  // -------------------------------------------------------------- beauty
  beauty(tank) {
    const fish = tank.fish.filter((f) => f.stage !== 'EGG');
    const fishB = fish.length ? fish.reduce((a, f) => a + fishBeauty(f), 0) / fish.length : 0.3;
    const plantCount = tank.plants.length;
    const plantHealth = plantCount ? tank.plants.reduce((a, p) => a + Math.min(1, p.growth ?? 0.5), 0) / plantCount : 0;
    const plantScore = Math.min(1, plantCount / 10) * 0.6 + plantHealth * 0.4;
    // composition: variety of hardscape, use of space, foreground/background layering
    const cats = new Set(tank.decor.map((d) => DECOR_BY_ID[d.itemId]?.cat));
    const xs = [...tank.decor.map((d) => d.nx), ...tank.plants.map((p) => p.nx)];
    const spread = xs.length > 1 ? Math.min(1, (Math.max(...xs) - Math.min(...xs)) / 0.7) : 0.2;
    const layering = tank.plants.length ? tank.plants.filter((p) => (PLANT_BY_ID[p.plantId]?.height ?? 0) > 0.35 ? p.nz < 0 : true).length / tank.plants.length : 0.5;
    const count = tank.decor.length;
    const density = count === 0 ? 0.2 : count <= 14 ? Math.min(1, count / 4) : Math.max(0.6, 1 - (count - 14) * 0.03);
    const composition = clamp(cats.size / 3 * 0.3 + spread * 0.3 + layering * 0.2 + density * 0.2, 0, 1);
    const species = new Set(fish.map((f) => f.species)).size;
    const bio = Math.min(1, species / 5);
    const clean = (tank.water.cleanliness * 0.6 + (1 - tank.algae.level) * 0.4);
    const compat = this.tempFit(tank);
    const score = fishB * 28 + plantScore * 20 + composition * 22 + bio * 10 + clean * 15 + compat * 5;
    return Math.round(clamp(score, 0, 100));
  }

  // ------------------------------------------------------------- updates
  tickTank(tank, dt, offline = false) {
    this.waterTick(tank, dt, offline);
    for (const f of [...tank.fish]) this.fishTick(tank, f, dt, offline);
    this.game.plants.grow(tank, dt);
  }

  update(dt) {
    const s = this.s;
    const active = this.game.activeTank;
    this.tickTank(active, dt);
    this.bgTimer += dt;
    if (this.bgTimer >= 1) {
      // background tanks simulate at 1 Hz
      for (const t of s.tanks) if (t !== active) this.tickTank(t, this.bgTimer);
      this.bgTimer = 0;
      const r = rating(active.water.quality);
      if (r !== this.lastRating) {
        if (r === 'EXCELLENT') bus.emit('water:excellent', { tank: active });
        this.lastRating = r;
        bus.emit('water:rating', { rating: r });
      }
    }
  }

  // Apply time passed while the game was closed. Relaxing: never fatal.
  offline(seconds) {
    const total = Math.min(seconds, 3 * 86400);
    if (total < 5) return null;
    const before = allFish(this.s).map((f) => ({ id: f.id, stage: f.stage }));
    const plantsBefore = this.s.tanks.reduce((a, t) => a + t.plants.reduce((b, p) => b + (p.growth ?? 0), 0), 0);
    let left = total;
    const step = 30;
    // cap the number of steps for very long absences while keeping growth exact-ish
    const stepSize = total > 6 * 3600 ? total / 720 : step;
    while (left > 0) {
      const dt = Math.min(stepSize, left);
      for (const t of this.s.tanks) this.tickTank(t, dt, true);
      left -= dt;
    }
    const after = allFish(this.s);
    const grew = after.filter((f) => {
      const b = before.find((x) => x.id === f.id);
      return b && b.stage !== f.stage;
    });
    const hatched = grew.filter((f) => before.find((x) => x.id === f.id).stage === 'EGG').length;
    const plantsAfter = this.s.tanks.reduce((a, t) => a + t.plants.reduce((b, p) => b + (p.growth ?? 0), 0), 0);
    return { seconds: total, grew: grew.length, hatched, born: after.length - before.length, plants: plantsAfter - plantsBefore };
  }
}
