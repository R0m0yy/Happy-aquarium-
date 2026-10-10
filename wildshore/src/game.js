// WILDSHORE game orchestration: world construction, the survivor's controls, contextual
// interactions, tools & combat, fishing, building, boating, sleep, objectives and saving.
import * as THREE from 'three';
import { Pipeline, QUALITY } from './render/pipeline.js';
import { Environment, WEATHER_LABEL } from './systems/environment.js';
import { createSky } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { Ocean } from './world/ocean.js';
import { CameraRig } from './core/cameraRig.js';
import { Input } from './core/input.js';
import { SHARED } from './render/materials.js';
import { initPondLevels, PONDS, HOME, ISLANDS, terrainHeight, pondAt, nearestIsland } from './world/islands.js';
import { setMaxAnisotropy } from './render/textures.js';
import { populateWorld } from './world/scatter.js';
import { Player, loadSurvivor } from './actors/player.js';
import { Survival } from './systems/survival.js';
import { Inventory } from './systems/inventory.js';
import { ITEMS, RECIPES, STRUCTURES } from './data/items.js';
import { Structures } from './world/structures.js';
import { Boats, BOAT_DEFS } from './world/boats.js';
import { FishSystem } from './actors/fish.js';
import { Wildlife } from './actors/wildlife.js';
import { FX } from './render/fx.js';
import { Audio } from './audio/audio.js';
import { makeItemModel } from './actors/equipment.js';
import { clamp, damp } from './util/math.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
export const SAVE_KEY = 'wildshore_save_v1';

export const OBJECTIVES = [
  { id: 'gather', text: 'Gather branches, plant fiber and stones', hint: 'Pick up driftwood on the beach and pull fiber from bushes [E].' },
  { id: 'axe', text: 'Craft cordage and a stone axe', hint: 'Open the backpack [Tab] → Craft.' },
  { id: 'water', text: 'Find fresh water', hint: 'There is a spring pond in the island\'s interior, north of camp.' },
  { id: 'fire', text: 'Build a campfire at camp', hint: 'Build menu [B]. Fire cooks food, boils water and keeps you warm.' },
  { id: 'spear', text: 'Craft a fishing spear (needs a knife)', hint: 'Flint is rare here; a stone knife works too.' },
  { id: 'fish', text: 'Catch a fish on the reef', hint: 'Swim out, hold Space to dive, click to thrust the spear.' },
  { id: 'cook', text: 'Cook your catch', hint: 'Interact with the campfire while carrying raw fish.' },
  { id: 'shelter', text: 'Build a palm lean-to and sleep', hint: 'Rest restores energy. Shelter keeps the rain off.' },
  { id: 'boat', text: 'Build a raft or canoe', hint: 'Build at the water\'s edge. A canoe needs hardwood and an axe.' },
  { id: 'explore', text: "Sail to Hunter's Island", hint: 'East-north-east across the strait. Wild pigs roam its forest.' },
  { id: 'hunt', text: 'Hunt a wild pig', hint: 'Crouch [C] to sneak; thrust or throw a stone spear.' },
  { id: 'reef', text: 'Dive the Outer Reef', hint: 'South-east. Giant clams hide pearls - and sharks patrol.' },
];

export class Game {
  constructor(canvas, qualityId, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.qualityId = qualityId;
    this.q = QUALITY[qualityId];
    this.pipe = new Pipeline(canvas, qualityId);
    setMaxAnisotropy(Math.min(8, this.pipe.renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.env = new Environment();
    this.env.dayLengthMin = settings.dayLength || 24;
    this.input = new Input(canvas);
    this.rig = new CameraRig(innerWidth / innerHeight);
    this.audio = new Audio();
    this.inv = new Inventory();
    this.surv = new Survival();
    this.paused = true;
    this.started = false;
    this.flags = {};
    this.discovered = new Set(['home']);
    this.harvest = new Map();
    this.projectiles = [];
    this.fishing = null;
    this.ui = null;
    this.time = 0;
    this.buildMode = false;
    this.boat = null;
    this.carrying = false;
    this.useHeld = 0;
    this.aiming = false;
    this.stats = { fish: 0, pigs: 0, crafted: 0, built: 0 };
    this.timeScale = 1;
    this.bloodTimer = 0;
  }

  async init(progress = () => {}) {
    const step = async (p, label) => { progress(p, label); await new Promise((r) => setTimeout(r, 16)); };
    await step(0.05, 'Charting the archipelago');
    initPondLevels();
    this.sky = createSky(this.env);
    this.scene.add(this.sky.mesh);
    await step(0.15, 'Shaping islands');
    this.terrain = createTerrain(this.q);
    this.scene.add(this.terrain.group);
    await step(0.35, 'Growing palms and reefs');
    this.nature = populateWorld(this.scene, this.q);
    await step(0.55, 'Filling the ocean');
    this.ocean = new Ocean(this.pipe.renderer, this.env, this.q);
    this.ocean.mesh.layers.set(1);
    this.scene.add(this.ocean.mesh);
    this.ponds = PONDS.map((p) => { const m = this.ocean.makePond(p); m.layers.set(1); this.scene.add(m); return m; });
    // lights
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 3));
    sun.castShadow = this.q.shadows > 0;
    sun.shadow.mapSize.set(this.q.shadows, this.q.shadows);
    const sr = this.q.shadowRange;
    Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 1, far: 320 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5c, 1);
    this.scene.add(this.hemi);
    for (const l of [sun, this.hemi]) l.layers.enableAll();
    this.scene.fog = new THREE.FogExp2(0xbfd8ff, 0.001);
    this.fx = new FX(this.scene, this.q);
    await step(0.65, 'Waking the survivor');
    const gltf = await loadSurvivor();
    this.player = new Player(gltf, this.scene);
    this.player.onFootstep = (p) => this.footstep(p);
    this.player.onSplash = (p, s) => { this.fx.splash(p.pos.x, this.ocean.level, p.pos.z, s); this.audio.splash(s); this.ocean.addRipple(p.pos.x, p.pos.z, 1); };
    await step(0.75, 'Releasing the fish');
    this.fish = new FishSystem(this, this.q);
    await this.fish.init();
    await step(0.85, 'Wildlife stirring');
    this.wildlife = new Wildlife(this);
    this.wildlife.spawnAll();
    this.structures = new Structures(this);
    this.boats = new Boats(this);
    this.worldIface = {
      groundAt: (x, z) => this.groundAt(x, z),
      waterAt: (x, z) => this.waterAt(x, z),
      collide: (pos, r, swim) => this.collideWorld(pos, r, swim),
      speedMul: () => (this.inv.weight() > this.inv.maxWeight ? 0.6 : 1) * (this.surv.energy < 10 ? 0.75 : 1),
    };
    await step(0.95, 'Compiling shaders');
    this.resize();
    addEventListener('resize', () => this.resize());
    // warm-up render to compile programs
    this.player.pos.set(HOME.spawn.x, terrainHeight(HOME.spawn.x, HOME.spawn.z), HOME.spawn.z);
    this.rig.focus.copy(this.player.pos);
    this.updateWorldUniforms(0.016);
    this.pipe.render(this.scene, this.rig.camera, 0.016);
    await step(1, 'Ready');
  }

  resize() {
    this.pipe.resize(innerWidth, innerHeight);
    this.rig.camera.aspect = innerWidth / innerHeight;
    this.rig.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ world queries
  groundAt(x, z) {
    const t = terrainHeight(x, z);
    const f = this.structures.floorAt(x, z, this.player ? this.player.pos.y : t);
    return Math.max(t, f);
  }
  waterAt(x, z) {
    const p = pondAt(x, z);
    if (p) return p.level;
    return this.ocean.heightAt(x, z);
  }
  collideWorld(pos, r, swimming = false) {
    const near = this.nature.grid.query(pos.x, pos.z, r + 3);
    for (const o of near) {
      if (!o.solid || !o.inst.alive) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz);
      const minD = o.r + r;
      if (d < minD && d > 1e-4) { pos.x = o.x + (dx / d) * minD; pos.z = o.z + (dz / d) * minD; }
    }
    this.structures.collide(pos, r);
  }

  // ------------------------------------------------------------------ game lifecycle
  newGame() {
    this.resetWorldState();
    const p = this.player;
    p.pos.set(HOME.spawn.x, terrainHeight(HOME.spawn.x, HOME.spawn.z), HOME.spawn.z);
    p.heading = Math.PI;
    p.state = 'ground';
    this.env.time = 7.2; this.env.day = 1; this.env.setWeather('clear', true);
    this.surv = new Survival();
    this.inv = new Inventory();
    this.inv.add('stick', 2);
    this.inv.add('coconut', 1);
    this.inv.add('cleanWater', 1);
    this.equip(null);
    this.flags = {};
    this.discovered = new Set(['home']);
    this.stats = { fish: 0, pigs: 0, crafted: 0, built: 0 };
    this.rig.focus.copy(p.pos);
    this.rig.yaw = this.rig.targetYaw = 0;
    this.ui?.bindInventory();
    this.started = true;
    this.paused = false;
    this.ui?.toast('Day 1. You were dropped on Castaway Key with almost nothing. Survive.', 'info', 6);
  }

  resetWorldState() {
    for (const [key] of this.harvest) {
      const [sp, id] = key.split(':');
      const inst = this.nature.species[sp]?.instances[+id];
      if (inst) { inst.alive = true; inst.hp = undefined; inst.gathered = 0; this.nature.species[sp].refresh(inst); }
    }
    this.harvest.clear();
    for (const p of this.nature.species.palm.instances) for (const c of p.nutIds) if (!c.alive) this.nature.species.coconut.setAlive(c, true);
    this.structures.restore([]);
    this.boats.restore([]);
    for (const pr of this.projectiles) this.scene.remove(pr.mesh);
    this.projectiles = [];
    this.cancelFishing();
  }

  serialize() {
    const p = this.player;
    return {
      v: 1,
      savedAt: Date.now(),
      env: this.env.serialize(),
      surv: this.surv.serialize(),
      inv: this.inv.serialize(),
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, heading: p.heading, state: p.state === 'boat' || p.state === 'sleep' ? 'ground' : p.state, equipped: p.equippedUid ? this.inv.findUid(p.equippedUid)?.id : null },
      structures: this.structures.serialize(),
      boats: this.boats.serialize(),
      harvest: [...this.harvest.entries()],
      nuts: this.nature.species.coconut.instances.filter((c) => !c.alive).map((c) => c.id),
      flags: this.flags,
      discovered: [...this.discovered],
      stats: this.stats,
    };
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      this.ui?.toast('Game saved.');
      return true;
    } catch (e) { this.ui?.toast('Could not save: ' + e.message, 'bad'); return false; }
  }

  load(data) {
    this.resetWorldState();
    this.env.restore(data.env);
    this.surv = new Survival(); this.surv.restore(data.surv);
    this.inv = new Inventory(); this.inv.restore(data.inv);
    this.structures.restore(data.structures || []);
    this.boats.restore(data.boats || []);
    this.harvest = new Map(data.harvest || []);
    for (const [key, h] of this.harvest) {
      const [sp, id] = key.split(':');
      const inst = this.nature.species[sp]?.instances[+id];
      if (!inst) continue;
      if (h.gone) this.nature.species[sp].setAlive(inst, false);
      inst.gathered = h.gathered || 0;
    }
    for (const id of data.nuts || []) { const c = this.nature.species.coconut.instances[id]; if (c) this.nature.species.coconut.setAlive(c, false); }
    this.flags = data.flags || {};
    this.discovered = new Set(data.discovered || ['home']);
    this.stats = data.stats || this.stats;
    const p = this.player;
    p.pos.set(data.player.x, data.player.y, data.player.z);
    p.heading = data.player.heading;
    p.state = data.player.state === 'dive' ? 'swim' : data.player.state || 'ground';
    this.equip(null);
    if (data.player.equipped) { const it = this.inv.find(data.player.equipped); if (it) this.equipUid(it.uid); }
    this.rig.focus.copy(p.pos);
    this.ui?.bindInventory();
    this.started = true;
    this.paused = false;
    this.ui?.toast(`Day ${this.env.day}. Welcome back.`);
  }

  static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  static readSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }

  // ------------------------------------------------------------------ equipment
  equipUid(uid) {
    const it = this.inv.findUid(uid);
    if (!it) return;
    if (this.player.equippedUid === uid) { this.equip(null); return; }
    this.player.equippedUid = uid;
    this.player.equip(it.id);
    this.audio.ui();
    this.ui?.refresh();
  }
  equip(id) {
    this.player.equippedUid = null;
    this.player.equip(id);
    this.ui?.refresh();
  }
  get equippedItem() { return this.player.equippedUid ? this.inv.findUid(this.player.equippedUid) : null; }
  hasTool(kind) { return this.inv.items.find((it) => ITEMS[it.id].tool === kind || it.id === kind); }

  // ------------------------------------------------------------------ objectives
  complete(id) {
    if (this.flags[id]) return;
    this.flags[id] = true;
    const o = OBJECTIVES.find((x) => x.id === id);
    if (o) { this.ui?.toast('Goal complete: ' + o.text, 'good', 4); this.audio.pickup(); }
  }
  currentObjective() { return OBJECTIVES.find((o) => !this.flags[o.id]); }
  checkObjectives() {
    if (this.inv.count('stick') >= 2 && this.inv.count('fiber') >= 3 && this.inv.count('stone') >= 1) this.complete('gather');
    if (this.hasTool('axe')) this.complete('axe');
    if (this.structures.list.some((s) => s.type === 'campfire' && s.progress >= 1)) this.complete('fire');
    if (this.inv.count('fishSpear') || this.inv.count('woodSpear') || this.inv.count('stoneSpear')) this.complete('spear');
    if (this.boats.list.length) this.complete('boat');
  }

  // ------------------------------------------------------------------ main update
  update(dtRaw) {
    let dt = Math.min(dtRaw, 0.05);
    this.input.update();
    if (!this.started || this.paused) {
      this.updateWorldUniforms(dt * 0.3);
      this.render(dt);
      this.input.endFrame();
      return;
    }
    this.time += dt;
    const p = this.player;
    const sleeping = p.state === 'sleep';
    // game time: 24 game hours per dayLength real minutes; fast-forward while asleep
    const scale = sleeping ? 60 : 1;
    const dtH = (dt * scale / 60) * (24 / this.env.dayLengthMin);
    this.env.update(dt, dtH);
    for (const d of this.env.thunderQueue) { setTimeout(() => this.audio.thunder(1 + Math.random()), d * 1000); }
    this.env.thunderQueue.length = 0;

    this.handleGlobalKeys();
    const ctl = this.readControls();

    // building placement
    if (this.buildMode) this.structures.updateGhost(p);

    // boat driving
    if (p.state === 'boat' && this.boat) {
      const b = this.boat;
      this.boats.update(dt, this.env, b, ctl.boat);
      this.boats.seatTransform(b, _v, _q);
      p.pos.copy(_v);
      p.pos.y -= 0.02;
      p.heading = b.heading;
      p.boatPose = Math.abs(ctl.boat.throttle) > 0.05 || Math.abs(ctl.boat.steer) > 0.1 ? 'paddle' : 'sit';
      p.paddleRate = 0.6 + Math.abs(ctl.boat.throttle) * 0.8;
      if (p.boatPose === 'paddle' && Math.random() < dt * 1.5) this.audio.paddle();
      if (Math.random() < dt * 0.3 * this.env.w.waves) this.audio.creak();
    } else {
      this.boats.update(dt, this.env, null, null);
    }

    p.carrying = this.inv.count('log') + this.inv.count('hardwood') >= 4;
    p.limp = this.surv.sprain > 0 ? 1 : 0;
    p.update(dt, ctl, this.worldIface);
    if (p.state === 'boat') this.alignBoatPose();

    // interactions
    this.target = this.findInteraction();
    if (this.input.hit('KeyE') || this.input.btnHit('interact')) this.interact();
    this.handleToolUse(dt, ctl);
    this.updateProjectiles(dt);
    this.updateFishing(dt);

    // systems
    const threats = [];
    if (p.state === 'dive' || p.state === 'swim') threats.push({ pos: p.pos.clone().add(_v.set(0, 1, 0)), radius: 3.5 + p.speed * 1.5, strength: 0.6 + p.speed * 0.4 });
    for (const pr of this.projectiles) if (pr.inWater) threats.push({ pos: pr.pos, radius: 3, strength: 1 });
    for (const b of this.boats.list) if (Math.abs(b.speed) > 0.5) threats.push({ pos: _v2.set(b.x, -0.5, b.z).clone(), radius: 5, strength: 0.8 });
    for (const t of this.wildlife.threats()) threats.push(t);
    this.fish.update(dt, p, threats);
    this.bloodTimer = Math.max(0, this.bloodTimer - dt);
    this.wildlife.update(dt, p, { bloodInWater: this.bloodTimer > 0 || (this.surv.bleeding > 0.1 && (p.state === 'swim' || p.state === 'dive')), carryingFish: this.inv.count('rawFish') > 0 });
    this.structures.update(dt, dtH, this.env);

    // survival
    const underwater = p.state === 'dive' && p.diveDepth > 0.3;
    const inWater = p.state === 'swim' || p.state === 'dive';
    const sheltered = this.structures.isSheltered(p.pos.x, p.pos.z);
    const heat = this.structures.fireHeat(p.pos.x, p.pos.z);
    this.surv.update({
      dtH, dtR: dt, airTemp: this.env.airTemp(p.pos.y), raining: this.env.w.rain, inWater, underwater,
      sprinting: ctl.sprint && p.speed > 3.5 && p.state === 'ground', swimming: inWater, fastSwim: inWater && ctl.sprint && p.speed > 1.5,
      nearFire: heat, sheltered: sheltered ? 1 : 0, sleeping, sleepQuality: this.sleepQuality || 0.3,
      working: !!p.action, wind: this.env.w.wind, sunExposure: this.env.daylight * (1 - this.env.w.cloud) * (sheltered ? 0 : 1),
    });
    if (this.surv.stamina < 2 && ctl.sprint) ctl.sprint = false;
    const spoiled = this.inv.tick(dtH, 1);
    if (spoiled) this.ui?.toast(`${spoiled} food item${spoiled > 1 ? 's' : ''} spoiled in the heat.`, 'bad');
    this.updateTorch(dtH);
    if (sleeping) this.updateSleep(dtH);
    this.checkDiscovery();
    this.checkObjectives();
    if (!this.surv.alive && p.state !== 'dead') this.onDeath();

    // autosave each in-game morning
    if (this.env.time > 6 && this.env.time < 6.2 && this.lastAutoDay !== this.env.day && !sleeping) { this.lastAutoDay = this.env.day; this.save(); }

    // camera
    let mode = 'explore';
    if (p.state === 'dive' && p.diveDepth > 0.7) mode = 'underwater';
    else if (p.state === 'boat') mode = 'boat';
    else if (this.buildMode) mode = 'build';
    else if (sleeping) mode = 'sleep';
    else if (this.player.equipped && /Spear|bow/.test(this.player.equipped) && p.state === 'ground') mode = 'hunt';
    this.rig.setMode(mode);
    this.rig.rotate(this.input.lookDX);
    if (this.input.down('KeyQ')) this.rig.targetYaw += dt * 1.6;
    if (this.input.down('KeyR') && !this.buildMode) this.rig.targetYaw -= dt * 1.6;
    if (this.input.zoomDelta) this.rig.zoomBy(this.input.zoomDelta);
    const focus = _v.copy(p.pos);
    if (p.state === 'dive') focus.y += 0.9;
    else if (p.state === 'swim') focus.y = this.ocean.level;
    this.rig.update(dt, focus, p.vel, this.ocean);

    this.updateWorldUniforms(dt);
    this.updateAudio(dt, sheltered);
    this.fx.update(dt, {
      waterAt: (x, z) => this.waterAt(x, z), focus: p.pos, camera: this.rig.camera.position, underwater: this.rig.underwater,
      rain: this.env.w.rain, wind: this.env.windDir, windStrength: this.env.w.wind, daylight: this.env.daylight, cloud: this.env.w.cloud,
      waterLevel: this.ocean.level, sunTilt: (this.env.lightDir.x) * 0.3,
    });
    // underwater bubbles from the diver
    if (p.state === 'dive' && Math.random() < dt * 3) { p.bones.head.getWorldPosition(_v2); this.fx.bubbles(_v2.x, _v2.y + 0.1, _v2.z, 3, 0.1); }
    if (p.state === 'swim' && p.speed > 0.4 && Math.random() < dt * 6) this.fx.foam(p.pos.x, this.ocean.level + 0.05, p.pos.z, 1, 0.8);
    for (const s of Object.values(this.nature.species)) s.updateLOD(this.rig.camera.position);
    this.updateRegrowth();
    this.ui?.update(dt);
    this.pipe.trackFrame(dtRaw);
    this.render(dt);
    this.input.endFrame();
  }

  render(dt) {
    const p = this.player;
    this.ocean.update(dt, this.rig.camera, this.pipe.rt, this.pipe.renderSize, this.env, this.rig.underwater);
    const cu = this.pipe.copyMat.uniforms;
    cu.uUnder.value = this.rig.underwater ? 1 : 0;
    cu.uFlash.value = this.env.flash;
    cu.uDamage.value = damp(cu.uDamage.value, this.damageFlash || 0, 6, dt);
    this.damageFlash = Math.max(0, (this.damageFlash || 0) - dt * 1.5);
    cu.uSleep.value = damp(cu.uSleep.value, p && p.state === 'sleep' ? 0.7 : p && p.state === 'dead' ? 0.5 : 0, 2, dt);
    this.pipe.render(this.scene, this.rig.camera, dt);
  }

  updateWorldUniforms(dt) {
    const env = this.env, rig = this.rig;
    const focus = this.player ? this.player.pos : rig.focus;
    this.sun.position.copy(focus).addScaledVector(env.lightDir, 150);
    this.sun.target.position.copy(focus);
    this.sun.color.copy(env.lightColor);
    this.sun.intensity = env.lightIntensity;
    this.hemi.color.copy(env.hemiSky).lerp(new THREE.Color(1, 0.97, 0.9), 0.35);
    this.hemi.groundColor.copy(env.hemiGround);
    this.hemi.intensity = env.hemiIntensity;
    const under = rig.underwater;
    if (under) { this.scene.fog.color.set(0x0c5866).multiplyScalar(0.25 + 0.75 * env.daylight); this.scene.fog.density = 0.05 + env.w.rain * 0.02; }
    else { this.scene.fog.color.copy(env.fogColor); this.scene.fog.density = env.fogDensity; }
    this.sky.mesh.position.copy(rig.camera.position);
    const su = this.sky.uniforms;
    su.uTime.value += dt;
    su.uCloud.value = env.w.cloud;
    su.uCloudDark.value = env.w.dark;
    su.uNight.value = env.night;
    su.uFlash.value = env.flash;
    SHARED.uTime.value += dt;
    SHARED.uLightDirW.value.copy(env.lightDir);
    SHARED.uCamUnder.value = under ? 1 : 0;
    SHARED.uCaustics.value = env.daylight * (1 - env.w.dark * 0.7);
    SHARED.uWetLine.value = 0.55 + Math.sin(this.ocean ? this.ocean.time * 0.9 : 0) * 0.1 * env.w.waves + (env.w.waves - 0.75) * 0.3;
    SHARED.uWind.value.set(env.windDir.x, env.windDir.y, 0.25 + env.w.wind);
    SHARED.uCamPos.value.copy(rig.camera.position);
    SHARED.uFocus.value.copy(focus);
    SHARED.uFadeOn.value = this.player && this.player.state !== 'dive' ? 1 : 0;
  }

  updateAudio(dt, sheltered) {
    const p = this.player;
    // nearest shoreline direction (sample ring)
    let best = 99, bx = 0, bz = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const r of [8, 20, 40, 70]) {
        const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
        const h = terrainHeight(x, z);
        if (h < 0.2 && h > -2.5) { if (r < best) { best = r; bx = x; bz = z; } break; }
      }
    }
    const here = terrainHeight(p.pos.x, p.pos.z);
    if (here < 0.3) best = 4;
    this.audio.listener = { x: p.pos.x, z: p.pos.z, yaw: this.rig.yaw };
    const fire = this.structures.nearest('campfire', p.pos.x, p.pos.z, 30);
    this.audio.update(dt, {
      shoreDist: best, shorePan: best < 99 ? this.audio.panFor(bx, bz) : 0, waves: this.env.w.waves, wind: this.env.w.wind, rain: this.env.w.rain,
      underwater: this.rig.underwater, daylight: this.env.daylight, night: this.env.night, sheltered,
      firePos: fire && fire.data.lit ? fire : null,
    });
  }

  // ------------------------------------------------------------------ controls
  readControls() {
    const inp = this.input;
    const f = this.rig.forward(new THREE.Vector3()), r = this.rig.right(new THREE.Vector3());
    const mx = f.x * inp.move.y + r.x * inp.move.x, mz = f.z * inp.move.y + r.z * inp.move.x;
    if (inp.hit('KeyC') || inp.btnHit('crouch')) this.crouchToggle = !this.crouchToggle;
    const sprint = (inp.down('ShiftLeft') || inp.down('ShiftRight') || inp.btn('sprint')) && this.surv.stamina > 3;
    const ctl = {
      moveX: mx, moveZ: mz, sprint,
      crouch: !!this.crouchToggle && this.player.state === 'ground',
      diveDown: inp.down('Space') || inp.btn('dive'),
      diveUp: inp.down('KeyX') || inp.btn('up') || inp.down('ControlLeft'),
    };
    // boat: forward/back relative to the hull, steer left/right
    let throttle = 0, steer = 0;
    if (this.boat) {
      const b = this.boat;
      const bf = Math.sin(b.heading), bz = Math.cos(b.heading);
      const mag = Math.hypot(mx, mz);
      if (mag > 0.1) {
        // steer toward stick direction, throttle by alignment
        const want = Math.atan2(mx, mz);
        let d = want - b.heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const backing = Math.abs(d) > 2.4;
        steer = backing ? 0 : clamp(-d * 1.4, -1, 1);
        throttle = backing ? -mag : mag * Math.max(0.15, Math.cos(d));
        void bf; void bz;
      }
      if (sprint && throttle > 0) throttle *= 1.35;
    }
    ctl.boat = { throttle, steer, sailUp: this.sailUp };
    if (this.player.state === 'sleep' || this.player.state === 'dead') { ctl.moveX = ctl.moveZ = 0; }
    return ctl;
  }

  handleGlobalKeys() {
    const inp = this.input;
    if (inp.hit('Tab') || inp.hit('KeyI')) this.ui?.togglePanel('inventory');
    if (inp.hit('KeyB')) this.ui?.togglePanel('build');
    if (inp.hit('KeyM')) this.ui?.togglePanel('map');
    if (inp.hit('Escape')) { if (this.buildMode) this.exitBuild(); else this.ui?.togglePause(); }
    if (this.buildMode) {
      if (inp.hit('KeyR') || inp.btnHit('rotate')) this.structures.rotateGhost(Math.PI / 8);
      if (inp.hit('KeyT')) this.structures.rotateGhost(-Math.PI / 8);
    }
    // number keys equip tools
    for (let i = 1; i <= 8; i++) {
      if (inp.hit('Digit' + i)) {
        const tools = this.inv.items.filter((it) => ITEMS[it.id].tool);
        if (tools[i - 1]) this.equipUid(tools[i - 1].uid);
      }
    }
    if (inp.hit('KeyH')) this.equip(null);
  }

  // ------------------------------------------------------------------ build mode
  enterBuild(type) {
    if (this.player.state !== 'ground') { this.ui?.toast('You need solid footing to build.'); return; }
    this.buildMode = true;
    this.structures.startPlacement(type);
    this.ui?.setBuildMode(true, type);
  }
  exitBuild() {
    this.buildMode = false;
    this.structures.cancelPlacement();
    this.ui?.setBuildMode(false);
  }
  confirmBuild() {
    const s = this.structures;
    if (!s.ghostValid) { this.ui?.toast(s.ghostReasons?.[0] || 'Cannot build here', 'bad'); this.audio.bad(); return; }
    const type = s.ghostType;
    const res = s.confirmPlacement();
    this.exitBuild();
    if (res?.boat) {
      this.ui?.toast(`Your ${BOAT_DEFS[res.boat.type].name.toLowerCase()} is in the water.`, 'good');
      this.audio.craft();
      this.stats.built++;
      return;
    }
    if (res?.site) {
      this.audio.hammer();
      this.buildSite(res.site);
      this.stats.built++;
    }
    void type;
  }
  buildSite(site) {
    const def = STRUCTURES[site.type];
    const hammer = this.hasTool('hammer');
    const dur = def.buildTime * (hammer ? 0.6 : 1);
    this.player.heading = Math.atan2(site.x - this.player.pos.x, site.z - this.player.pos.z);
    let tick = 0;
    this.player.startAction({
      pose: 'hammer', dur, noise: 0.6,
      onTick: (dt, a) => {
        site.progress = Math.min(0.99, a.elapsed / dur);
        tick -= dt;
        if (tick <= 0) { tick = 0.62; this.audio.hammer(); this.fx.chips(site.x, site.y + 0.5, site.z, [0.7, 0.55, 0.4], 3); }
      },
      onDone: () => {
        site.progress = 1;
        this.structures.refreshModel(site);
        this.fx.dust(site.x, site.y, site.z, 12);
        this.ui?.toast(`${def.name} built.`, 'good');
        if (hammer) this.wearTool(hammer, 1);
        this.surv.energy -= def.buildTime * 0.3;
      },
      interruptible: true,
    });
  }

  // ------------------------------------------------------------------ interactions
  findInteraction() {
    const p = this.player;
    if (p.state === 'dead' || p.state === 'sleep') return p.state === 'sleep' ? { label: 'Wake up', act: () => this.wake() } : null;
    if (p.busy) return null;
    const fwd = p.forward(_v2);
    const probe = _v.copy(p.pos).addScaledVector(fwd, 0.9);
    const cands = [];
    const add = (dist, label, act, pri = 0, needs = null) => cands.push({ dist: dist - pri, label, act, needs });
    if (p.state === 'boat') {
      const b = this.boat;
      cands.push({ dist: 0, label: 'Leave ' + BOAT_DEFS[b.type].name, act: () => this.leaveBoat() });
      if (b.def.sail) cands.push({ dist: 0.1, label: this.sailUp ? 'Lower the sail' : 'Raise the sail', act: () => { this.sailUp = !this.sailUp; this.audio.creak(); } });
      return cands.sort((a, b2) => a.dist - b2.dist)[0];
    }
    // boats
    for (const b of this.boats.list) {
      const d = Math.hypot(b.x - p.pos.x, b.z - p.pos.z);
      if (d < b.def.len * 0.6 + 1.2) {
        add(d, `Board ${BOAT_DEFS[b.type].name}`, () => this.boardBoat(b), 1);
        if (b.hp < b.def.hp - 1) add(d + 0.3, `Repair boat (${Math.round(b.hp / b.def.hp * 100)}%)`, () => this.repairBoat(b), 0.5);
      }
    }
    // structures
    for (const s of this.structures.list) {
      const def = STRUCTURES[s.type];
      const d = Math.hypot(s.x - probe.x, s.z - probe.z) - def.r * 0.6;
      if (d > 1.6) continue;
      for (const o of this.structureActions(s)) add(d, o.label, o.act, o.pri || 0.5, o.needs);
    }
    // carcasses
    const dead = this.wildlife.nearestDead(probe.x, probe.z, 1.8);
    if (dead) add(0.5, this.hasTool('knife') ? `Butcher ${dead.kind}` : `Butcher ${dead.kind} (needs knife)`, () => this.butcher(dead), 1);
    // live crab grab
    const crab = this.wildlife.nearestAlive('crab', probe.x, probe.z, 1.4);
    if (crab && p.state === 'ground') add(0.8, 'Grab crab', () => this.grabCrab(crab), 0.6);
    // projectiles lying around
    for (const pr of this.projectiles) {
      if (!pr.stuck) continue;
      const d = Math.hypot(pr.pos.x - probe.x, pr.pos.z - probe.z);
      if (d < 1.6 && Math.abs(pr.pos.y - p.pos.y) < 3) add(d, `Pick up ${ITEMS[pr.item].name.toLowerCase()}`, () => this.pickProjectile(pr), 1);
    }
    // nature nodes
    const near = this.nature.grid.query(probe.x, probe.z, 1.6);
    for (const o of near) {
      if (!o.inst.alive) continue;
      const d = Math.hypot(o.x - probe.x, o.z - probe.z) - (o.r || 0);
      if (Math.abs(o.inst.y - p.pos.y) > (p.state === 'dive' ? 2.5 : 2)) continue;
      const a = this.nodeAction(o);
      if (a) add(d, a.label, a.act, a.pri || 0, a.needs);
    }
    // fresh water
    const pond = PONDS.find((pd) => Math.hypot(pd.x - probe.x, pd.z - probe.z) < pd.r + 1.5);
    if (pond && p.state === 'ground') {
      add(1, 'Drink from the spring', () => this.drinkFromPond(), 0.4);
      if (this.inv.waterCount() < this.inv.waterCapacity()) add(1.1, `Fill water (${this.inv.waterCount()}/${this.inv.waterCapacity()})`, () => this.fillWater(), 0.4);
      this.complete('water');
    }
    // sea water
    if (!pond && p.state === 'ground' && this.ocean.heightAt(probe.x, probe.z) > terrainHeight(probe.x, probe.z) + 0.15 && this.surv.thirst < 60) {
      add(3, 'Seawater - undrinkable', () => this.ui?.toast('Drinking seawater would only dehydrate you further.'), -2);
    }
    // mangrove clay
    const isl = nearestIsland(p.pos.x, p.pos.z);
    if (isl.island.mangrove && isl.t < 1.05 && p.state === 'ground' && terrainHeight(probe.x, probe.z) < 1.4) add(2.2, 'Dig clay', () => this.digClay(), -1);
    // rest anywhere
    if (p.state === 'ground' && this.env.night > 0.5 && !cands.some((c) => /Sleep/.test(c.label))) add(5, 'Sleep on the ground', () => this.sleep(0.25), -3);
    if (!cands.length) return null;
    cands.sort((a, b) => a.dist - b.dist);
    return cands[0];
  }

  structureActions(s) {
    const def = STRUCTURES[s.type];
    const acts = [];
    const d = s.data;
    if (s.progress < 1) {
      acts.push({ label: `Continue building ${def.name} (${Math.round(s.progress * 100)}%)`, act: () => this.buildSite(s), pri: 1 });
      return acts;
    }
    const raw = this.inv.items.find((it) => ITEMS[it.id].cook);
    if (s.type === 'campfire' || s.type === 'cookingRack') {
      const fire = s.type === 'campfire' ? s : s.fire;
      if (!fire) return acts;
      const fd = fire.data;
      const list = fire.rack ? fire.rack.data.cook : fd.cook;
      const cap = fire.rack ? 8 : 1;
      if (!fd.lit && fd.fuel > 0.1) acts.push({ label: 'Light the fire', act: () => this.lightFire(fire), pri: 1 });
      if (fd.fuel < 6 && (this.inv.count('stick') || this.inv.count('log'))) acts.push({ label: `Add fuel (${Math.round(fd.fuel)}h left)`, act: () => this.addFuel(fire), pri: fd.fuel < 0.5 ? 1.2 : 0.2 });
      const done = list.filter((it) => it.cooked);
      if (done.length) acts.push({ label: `Take ${ITEMS[done[0].id].name.toLowerCase()}${done.length > 1 ? ` (+${done.length - 1})` : ''}`, act: () => this.takeCooked(fire), pri: 1.5 });
      if (raw && list.length < cap) acts.push({ label: `Cook ${ITEMS[raw.id].name.toLowerCase()}${fd.lit ? '' : ' (light the fire)'}`, act: () => this.cookItem(fire, raw), pri: 1.3 });
      if (fd.lit && this.inv.count('rawWater') && this.inv.count('clayPot') && !(fd.boil > 0)) acts.push({ label: 'Boil water in clay pot', act: () => this.boilWater(fire), pri: 1 });
      if (fd.lit && this.inv.count('rawWater') && !this.inv.count('clayPot')) acts.push({ label: 'Boil water (needs clay pot)', act: () => this.ui?.toast('Fire clay from Mangrove Island into a pot to boil water.'), pri: -1 });
    }
    if (s.type === 'dryingRack') {
      const dryable = this.inv.items.find((it) => ITEMS[it.id].dry);
      const done = d.items.filter((it) => it.done);
      if (done.length) acts.push({ label: `Collect ${ITEMS[done[0].id].name.toLowerCase()} (${done.length})`, act: () => this.collectDried(s), pri: 1.5 });
      if (dryable && d.items.length < 8) acts.push({ label: `Hang ${ITEMS[dryable.id].name.toLowerCase()} to dry`, act: () => this.hangDry(s, dryable), pri: 1 });
      if (!dryable && !done.length && d.items.length) acts.push({ label: `Drying... (${d.items.length} on rack)`, act: () => {}, pri: -1 });
    }
    if (s.type === 'waterCollector') {
      const n = Math.floor(d.water);
      if (n >= 1) acts.push({ label: `Collect rain water (${n})`, act: () => this.collectRain(s), pri: 1 });
      else acts.push({ label: 'Rain collector (empty)', act: () => this.ui?.toast('Wait for rain to fill the collector.'), pri: -1 });
    }
    if (s.storage) acts.push({ label: `Open ${s.type === 'woodenHut' ? 'hut storage' : 'basket'}`, act: () => this.ui?.openStorage(s), pri: 0.8 });
    if (def.shelter) acts.push({ label: `Sleep in the ${def.name.toLowerCase()}`, act: () => this.sleep(def.shelter), pri: this.env.night > 0.5 || this.surv.energy < 40 ? 1.2 : 0.1 });
    if (def.upgrade) {
      const up = STRUCTURES[def.upgrade];
      acts.push({ label: `Upgrade to ${up.name}${this.inv.has(up.in) ? '' : ' (materials)'}`, act: () => this.upgrade(s), pri: -0.5 });
    }
    if (s.hp < s.maxHp * 0.95) acts.push({ label: `Repair ${def.name} (${Math.round(s.hp / s.maxHp * 100)}%)`, act: () => this.repairStructure(s), pri: 0.3 });
    return acts;
  }

  nodeAction(o) {
    const inst = o.inst;
    const kind = o.kind;
    const p = this.player;
    const axe = this.hasTool('axe');
    switch (kind) {
      case 'palm': {
        const nuts = inst.nutIds?.filter((c) => c.alive).length || 0;
        const acts = [];
        if (nuts) return { label: `Shake palm for coconuts (${nuts})`, act: () => this.shakePalm(inst), pri: 0.2 };
        if ((inst.gathered || 0) < 2) return { label: 'Pull down palm fronds', act: () => this.gatherFronds(inst, o) };
        return axe ? { label: 'Chop palm [use axe]', act: () => this.useTool(), pri: -0.5 } : null;
      }
      case 'hardwood': return axe ? { label: 'Chop hardwood tree', act: () => this.useTool() } : { label: 'Hardwood tree (needs an axe)', act: () => this.ui?.toast('You need a stone axe to fell this tree.'), pri: -1 };
      case 'mangrove': return axe ? { label: 'Chop mangrove', act: () => this.useTool() } : { label: 'Gather mangrove sticks', act: () => this.gatherGeneric(o, { stick: 2 }, 'gather', 1) };
      case 'shrub': return { label: 'Gather fiber & branches', act: () => this.gatherGeneric(o, { fiber: 2, stick: 1, ...(inst.island === 'hunter' && Math.random() < 0.6 ? { fruit: 2 } : {}) }, 'gather', 1.4) };
      case 'fern': return { label: 'Pull plant fiber', act: () => this.gatherGeneric(o, { fiber: 2 }, 'gather', 1.1) };
      case 'broadleaf': return { label: 'Cut broad leaves', act: () => this.gatherGeneric(o, { palmLeaf: 1, fiber: 1, ...(Math.random() < 0.25 ? { aloe: 1 } : {}) }, 'gather', 1.1) };
      case 'driftwood': return { label: 'Pick up driftwood', act: () => this.gatherGeneric(o, { stick: 3 }, 'gather', 0.9) };
      case 'log': return axe ? { label: 'Chop fallen log', act: () => this.useTool() } : { label: 'Break off branches', act: () => this.gatherGeneric(o, { stick: 2 }, 'gather', 1.2, true) };
      case 'rock': {
        if (!o.solid) return { label: 'Pick up stone', act: () => this.gatherGeneric(o, { stone: 1, ...(inst.island === 'rocky' && Math.random() < 0.5 ? { flint: 1 } : Math.random() < 0.12 ? { flint: 1 } : {}) }, 'gather', 0.8) };
        return this.hasTool('hammer') || axe ? { label: 'Break rock for stone', act: () => this.useTool() } : null;
      }
      case 'cliff': {
        if (inst.island === 'rocky' && (inst.gathered || 0) < 1) return { label: 'Search seabird nests', act: () => this.searchNest(o) };
        return this.hasTool('hammer') || axe ? { label: 'Quarry stone & flint', act: () => this.useTool() } : null;
      }
      case 'shells': return { label: inst.y < 1.0 ? 'Collect shellfish & shells' : 'Collect seashells', act: () => this.gatherGeneric(o, inst.y < 1.0 ? { shellfish: 2, shell: 1 } : { shell: 2 }, 'gather', 1) };
      case 'coconutGround': return { label: 'Pick up coconut', act: () => this.gatherGeneric(o, { coconut: 1 }, 'gather', 0.7) };
      case 'fallenFrond': return { label: 'Pick up palm frond', act: () => this.gatherGeneric(o, { palmLeaf: 2 }, 'gather', 0.7) };
      case 'urchin': return p.state === 'dive' ? { label: 'Collect sea urchin', act: () => this.collectUrchin(o) } : null;
      case 'clam': return p.state === 'dive' ? { label: this.hasTool('knife') ? 'Pry open giant clam' : 'Giant clam (needs knife)', act: () => this.openClam(o) } : null;
      case 'brain': return null;
      default: return null;
    }
  }

  interact() {
    const t = this.target;
    if (!t) return;
    if (this.buildMode) return;
    t.act();
  }

  // ------------------------------------------------------------------ harvesting helpers
  markHarvest(o, gone, regrowDays) {
    const key = `${o.inst.species.id}:${o.inst.id}`;
    const h = this.harvest.get(key) || {};
    h.gone = gone;
    h.gathered = o.inst.gathered || 0;
    h.regrowAt = this.env.totalHours + regrowDays * 24;
    this.harvest.set(key, h);
    if (gone) o.inst.species.setAlive(o.inst, false);
  }
  updateRegrowth() {
    if ((this._regrowT = (this._regrowT || 0) + 1) % 120) return;
    const now = this.env.totalHours;
    for (const [key, h] of this.harvest) {
      if (h.regrowAt > now) continue;
      const [sp, id] = key.split(':');
      const inst = this.nature.species[sp]?.instances[+id];
      if (!inst) { this.harvest.delete(key); continue; }
      const d = Math.hypot(inst.x - this.player.pos.x, inst.z - this.player.pos.z);
      if (d < 30) continue; // don't pop in under the player's nose
      inst.gathered = 0; inst.hp = undefined;
      if (h.gone) inst.species.setAlive(inst, true);
      if (sp === 'palm') for (const c of inst.nutIds) if (!c.alive) this.nature.species.coconut.setAlive(c, true);
      this.harvest.delete(key);
    }
  }

  give(items, quiet = false) {
    const got = [];
    for (const [id, n] of Object.entries(items)) {
      const k = this.inv.add(id, n);
      if (k) got.push(`${k} ${ITEMS[id].name}`);
      if (k < n) this.ui?.toast('Your pack is full.', 'bad');
    }
    if (got.length && !quiet) this.ui?.toast('+ ' + got.join(', '), 'loot');
    this.ui?.refresh();
    return got.length > 0;
  }

  faceTo(x, z) { this.player.heading = Math.atan2(x - this.player.pos.x, z - this.player.pos.z); }

  gatherGeneric(o, items, pose, dur, keep = false) {
    this.faceTo(o.x, o.z);
    const big = ['shrub', 'fern', 'broadleaf'].includes(o.kind);
    this.player.startAction({
      pose: pose, dur, hitTime: 0.55, noise: 0.35,
      onHit: () => {
        if (big) { this.audio.rustle(); this.fx.leaves(o.x, o.inst.y + 0.5, o.z, 5); } else this.audio.pickup();
        this.give(items);
        if (keep) { o.inst.gathered = (o.inst.gathered || 0) + 1; if (o.inst.gathered >= 3) this.markHarvest(o, false, 2); }
        else this.markHarvest(o, true, big ? 2 : o.kind === 'rock' || o.kind === 'shells' ? 1.5 : 3);
        this.surv.energy -= 0.15;
      },
    });
  }

  gatherFronds(inst, o) {
    this.faceTo(o.x, o.z);
    this.player.startAction({ pose: 'chop', dur: 1.4, hitTime: 0.55, noise: 0.4, onHit: () => {
      this.audio.rustle(); this.fx.leaves(o.x, o.inst.y + 3, o.z, 6);
      this.give({ palmLeaf: 2 });
      inst.gathered = (inst.gathered || 0) + 1;
      this.markHarvest(o, false, 1.5);
    } });
  }

  shakePalm(inst) {
    this.faceTo(inst.x, inst.z);
    this.player.startAction({ pose: 'carry', dur: 1.6, hitTime: 0.6, noise: 0.5, onTick: () => { this.player.root.position.x += (Math.random() - 0.5) * 0.01; }, onHit: () => {
      const nuts = inst.nutIds.filter((c) => c.alive);
      const n = Math.min(nuts.length, 1 + Math.floor(Math.random() * 3));
      for (let i = 0; i < n; i++) { this.nature.species.coconut.setAlive(nuts[i], false); this.fx.leaves(nuts[i].x, nuts[i].y, nuts[i].z, 2); }
      this.audio.chop();
      if (n) this.give({ coconut: n });
      this.markHarvest({ inst }, false, 3);
    } });
  }

  searchNest(o) {
    this.player.startAction({ pose: 'gather', dur: 2, hitTime: 0.6, onHit: () => {
      o.inst.gathered = 1;
      this.markHarvest(o, false, 1);
      if (Math.random() < 0.7) this.give({ egg: 1 + Math.floor(Math.random() * 2), ...(Math.random() < 0.4 ? { flint: 1 } : {}) });
      else this.ui?.toast('The nests here are empty.');
    } });
  }

  digClay() {
    this.player.startAction({ pose: 'gather', dur: 2.2, hitTime: 0.7, noise: 0.4, onHit: () => { this.fx.dust(this.player.pos.x, this.player.pos.y, this.player.pos.z, 6, [0.4, 0.33, 0.25]); this.give({ clay: 1 }); } });
  }

  collectUrchin(o) {
    this.player.startAction({ pose: 'diveSpear', dur: 1.2, hitTime: 0.5, onHit: () => {
      if (!this.hasTool('knife') && Math.random() < 0.5) { this.surv.injure('cut', 0.25); this.surv.damage(4); this.damageFlash = 0.5; this.ui?.toast('Ouch! The spines broke off in your hand.', 'bad'); this.audio.hurt(); }
      this.give({ urchin: 1 }); this.markHarvest(o, true, 2);
    } });
  }
  openClam(o) {
    if (!this.hasTool('knife')) { this.ui?.toast('You need a knife to pry the clam open.'); return; }
    this.player.startAction({ pose: 'diveSpear', dur: 2, hitTime: 0.6, onHit: () => {
      const items = { shellfish: 3 };
      if (Math.random() < 0.35) items.pearl = 1;
      this.give(items);
      if (items.pearl) { this.fx.sparkle(o.x, o.inst.y + 0.5, o.z); this.ui?.toast('A pearl!', 'good'); }
      this.markHarvest(o, true, 4);
      this.complete('reef');
    } });
  }

  // ------------------------------------------------------------------ tools
  wearTool(it, n = 1) {
    if (!it) return;
    if (this.inv.wear(it.uid, n)) {
      this.ui?.toast(`Your ${ITEMS[it.id].name.toLowerCase()} broke!`, 'bad');
      this.audio.bad();
      if (this.player.equippedUid === it.uid) this.equip(null);
    }
  }

  handleToolUse(dt, ctl) {
    const inp = this.input;
    const p = this.player;
    if (this.buildMode) {
      if (inp.mouse.clicked || inp.btnHit('use') || inp.hit('KeyF') || inp.hit('Enter')) this.confirmBuild();
      return;
    }
    const pressed = inp.mouse.down || inp.btn('use') || inp.down('KeyF');
    const it = this.equippedItem;
    const kind = it ? ITEMS[it.id].tool : null;
    if (p.state === 'sleep' || p.state === 'dead') return;
    if (this.ui?.pointerOverUI) return;
    // hold-to-aim for throwing spears and the bow
    if (pressed) {
      this.useHeld += dt;
      if ((kind === 'spear' || kind === 'bow') && this.useHeld > 0.3 && p.state === 'ground' && !p.busy) {
        this.aiming = true;
        p.setLayer('act_aim', 1, dt, 10);
        p.layers.act_aim = Math.min(1, (p.layers.act_aim || 0) + dt * 6);
        // aim with movement stick / camera direction
        if (Math.hypot(ctl.moveX, ctl.moveZ) > 0.2) p.heading = Math.atan2(ctl.moveX, ctl.moveZ);
      }
    } else {
      if (this.aiming) { this.aiming = false; delete p.layers.act_aim; this.throwOrShoot(it); }
      else if (this.useHeld > 0) this.useTool();
      this.useHeld = 0;
    }
    if (p.state === 'boat' && (inp.hit('KeyF') || inp.btnHit('use')) && this.boat?.def.sail) this.sailUp = !this.sailUp;
  }

  useTool() {
    const p = this.player;
    if (p.busy) return;
    const it = this.equippedItem;
    const def = it ? ITEMS[it.id] : null;
    const kind = def?.tool;
    if (p.state === 'boat') return;
    // eat from hand
    if (!it) { this.punch(); return; }
    if (kind === 'axe' || kind === 'hammer') return this.swingTool(it);
    if (kind === 'spear' || kind === 'fishspear') return this.thrust(it);
    if (kind === 'knife') return this.knifeUse(it);
    if (kind === 'rod') return this.fishingAction(it);
    if (kind === 'bow') return this.ui?.toast('Hold to draw the bow, release to shoot.');
    if (kind === 'torch') return this.ui?.toast('The torch lights the way at night.');
  }

  punch() {
    const p = this.player;
    if (p.state !== 'ground') return;
    // empty hands: harvest the interaction target if any
    if (this.target) { this.interact(); return; }
  }

  swingTool(it) {
    const p = this.player;
    if (p.state !== 'ground') return;
    const fwd = p.forward(new THREE.Vector3());
    const probe = p.pos.clone().addScaledVector(fwd, 1.2);
    const near = this.nature.grid.query(probe.x, probe.z, 1.6).filter((o) => o.inst.alive && ['palm', 'hardwood', 'mangrove', 'log', 'rock', 'cliff'].includes(o.kind) && (o.solid || o.kind === 'log'));
    near.sort((a, b) => Math.hypot(a.x - probe.x, a.z - probe.z) - Math.hypot(b.x - probe.x, b.z - probe.z));
    const target = near[0];
    if (target) this.faceTo(target.x, target.z);
    const isAxe = ITEMS[it.id].tool === 'axe';
    p.startAction({
      pose: 'chop', dur: 0.95, hitTime: 0.55, noise: 0.8,
      onHit: () => {
        this.surv.stamina -= 4;
        this.surv.energy -= 0.08;
        // animals in the swing arc
        const a = this.wildlife.hitTest(p.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), p.forward(new THREE.Vector3()), 1.9, 0.8);
        if (a) { a.hit(isAxe ? 18 : 12, p); this.audio.chop(); return; }
        if (!target) { this.audio.rustle(); return; }
        const inst = target.inst;
        const rocky = target.kind === 'rock' || target.kind === 'cliff';
        if (rocky) { this.audio.stoneHit(); this.fx.chips(target.x, inst.y + 0.6, target.z, [0.6, 0.6, 0.58], 8); }
        else { this.audio.chop(); this.fx.chips(target.x, inst.y + 0.9, target.z, [0.8, 0.62, 0.42], 10); }
        if (!isAxe && !rocky) { this.ui?.toast('A hammer won\'t fell trees.'); return; }
        this.wearTool(it, 1);
        if (rocky) {
          // quarry: yields stone each hit, eventually exhausts
          inst.gathered = (inst.gathered || 0) + 1;
          const flint = inst.island === 'rocky' ? 0.45 : 0.12;
          this.give({ stone: 1, ...(Math.random() < flint ? { flint: 1 } : {}) });
          if (inst.gathered >= (target.kind === 'cliff' ? 6 : 3)) {
            if (target.kind === 'rock') this.markHarvest(target, true, 4); else this.markHarvest(target, false, 2);
          } else this.markHarvest(target, false, 2);
          return;
        }
        inst.hp = (inst.hp ?? inst.maxHp ?? (target.kind === 'hardwood' ? 7 : target.kind === 'log' ? 3 : 5)) - (ITEMS[it.id].power || 1);
        // tree sway feedback
        if (inst.hp > 0) { this.fx.leaves(target.x, inst.y + 5, target.z, 3); return; }
        // felled
        const drops = target.kind === 'palm' ? { log: 2, palmLeaf: 3 } : target.kind === 'hardwood' ? { hardwood: 2, stick: 3 } : target.kind === 'mangrove' ? { stick: 3, log: 1 } : { log: 2, stick: 1 };
        if (target.kind === 'palm') {
          const nuts = inst.nutIds.filter((c) => c.alive);
          if (nuts.length) drops.coconut = nuts.length;
          for (const c of nuts) this.nature.species.coconut.setAlive(c, false);
        }
        this.fx.leaves(target.x, inst.y + 6, target.z, 20);
        this.fx.dust(target.x, inst.y, target.z, 10);
        this.rig.shake = 0.6;
        this.audio.chop();
        this.markHarvest(target, true, target.kind === 'log' ? 3 : 5);
        this.give(drops);
        this.ui?.toast(target.kind === 'palm' ? 'Timber! The palm crashes down.' : 'The tree falls.');
      },
    });
  }

  thrust(it) {
    const p = this.player;
    const kind = ITEMS[it.id].tool;
    const under = p.state === 'dive' || p.state === 'swim';
    const pose = p.state === 'dive' ? 'diveSpear' : 'thrust';
    if (p.state === 'swim') { this.ui?.toast('Dive under [Space] to spearfish.'); return; }
    p.startAction({
      pose, dur: under ? 0.8 : 0.85, hitTime: 0.45, canMove: false, noise: 0.5,
      onHit: () => {
        const origin = new THREE.Vector3();
        p.handPos(origin);
        const dir = p.forward(new THREE.Vector3());
        if (p.state === 'dive') dir.y = Math.sin(p.divePitch || 0) * 0.6;
        dir.normalize();
        this.surv.stamina -= 3;
        // fish (underwater, or standing in the shallows)
        const shallow = p.state === 'ground' && this.ocean.heightAt(p.pos.x + dir.x * 1.5, p.pos.z + dir.z * 1.5) - terrainHeight(p.pos.x + dir.x * 1.5, p.pos.z + dir.z * 1.5) > 0.35;
        if (p.state === 'dive' || shallow) {
          const o2 = p.state === 'dive' ? origin : origin.clone().add(new THREE.Vector3(dir.x * 0.5, -0.9, dir.z * 0.5));
          const res = this.fish.strike(o2, dir, kind === 'fishspear' ? 2.3 : 1.9, kind === 'fishspear' ? 0.55 : 0.4);
          if (res && !res.missed) {
            this.give({ rawFish: res.sp.weight > 2 ? 2 : 1 });
            this.ui?.toast(`Speared a ${res.sp.name}!`, 'good');
            this.fx.blood(res.pos.x, res.pos.y, res.pos.z, true);
            this.fx.bubbles(res.pos.x, res.pos.y, res.pos.z, 12, 0.3);
            this.bloodTimer = 20;
            this.stats.fish++;
            this.complete('fish');
            this.wearTool(it, 1);
            return;
          }
          if (res?.missed) { this.ui?.toast('The fish darted away.'); this.fx.bubbles(origin.x, origin.y, origin.z, 6, 0.3); }
          else if (p.state === 'dive') this.fx.bubbles(origin.x + dir.x, origin.y, origin.z + dir.z, 5, 0.2);
        }
        const a = this.wildlife.hitTest(origin, dir, (ITEMS[it.id].range || 2) + 0.3, 0.5);
        if (a) {
          a.hit(ITEMS[it.id].dmg || 25, p);
          this.audio.chop();
          this.wearTool(it, 1);
          if (a.dead) this.onKill(a);
        }
      },
    });
  }

  knifeUse(it) {
    const p = this.player;
    if (this.target && /Butcher|clam|fiber|leaves/i.test(this.target.label)) { this.interact(); return; }
    p.startAction({ pose: 'thrust', dur: 0.6, hitTime: 0.4, onHit: () => {
      const a = this.wildlife.hitTest(p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), p.forward(new THREE.Vector3()), 1.4, 0.7);
      if (a) { a.hit(12, p); if (a.dead) this.onKill(a); this.wearTool(it, 1); }
    } });
  }

  throwOrShoot(it) {
    if (!it) return;
    const p = this.player;
    const def = ITEMS[it.id];
    if (def.tool === 'bow' && !this.inv.count('arrow')) { this.ui?.toast('You have no arrows.'); return; }
    p.startAction({
      pose: 'throw', dur: 0.7, hitTime: 0.42, noise: def.tool === 'bow' ? 0.2 : 0.5,
      onHit: () => {
        const origin = p.headPos.clone().add(new THREE.Vector3(0, 0.1, 0));
        const dir = p.forward(new THREE.Vector3());
        // auto-aim assist toward the nearest animal in front
        const target = this.wildlife.hitTest(origin, dir, def.tool === 'bow' ? 40 : 22, 0.35, (a) => a.kind !== 'turtle');
        const speed = def.tool === 'bow' ? 34 : 19;
        if (target) {
          const tp = target.pos.clone().add(new THREE.Vector3(0, target.kind === 'pig' ? 0.5 : 0.15, 0));
          const d = tp.distanceTo(origin);
          const t = d / speed;
          dir.subVectors(tp, origin).normalize();
          dir.y += 0.5 * 9.8 * t / speed;
        } else dir.y = 0.12;
        dir.normalize();
        let itemId = it.id;
        if (def.tool === 'bow') { this.inv.remove('arrow', 1); itemId = 'arrow'; this.wearTool(it, 1); }
        else {
          // the spear leaves your hand
          this.inv.removeUid(it.uid);
          this.equip(null);
        }
        this.spawnProjectile(itemId, origin, dir.multiplyScalar(speed), def.dmg || 30, it.dur);
        this.audio.rustle();
      },
    });
  }

  spawnProjectile(item, pos, vel, dmg, dur) {
    let mesh = makeItemModel(item === 'arrow' ? 'woodSpear' : item);
    if (item === 'arrow') mesh.scale.set(1, 0.4, 1);
    this.scene.add(mesh);
    this.projectiles.push({ item, mesh, pos: pos.clone(), vel: vel.clone(), dmg, dur, stuck: false, age: 0, inWater: false });
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.age += dt;
      if (!pr.stuck) {
        pr.vel.y -= 9.8 * dt * (pr.inWater ? 0.2 : 1);
        if (pr.inWater) pr.vel.multiplyScalar(1 - dt * 3);
        pr.pos.addScaledVector(pr.vel, dt);
        const water = this.ocean.heightAt(pr.pos.x, pr.pos.z);
        if (!pr.inWater && pr.pos.y < water) { pr.inWater = true; this.fx.splash(pr.pos.x, water, pr.pos.z, 0.3); this.audio.splash(0.3); }
        // hit animals
        const a = this.wildlife.hitTest(pr.pos.clone().addScaledVector(pr.vel, -dt), pr.vel.clone().normalize(), pr.vel.length() * dt + 0.6, 0.6);
        if (a) {
          a.hit(pr.dmg, this.player);
          if (a.dead) this.onKill(a);
          this.audio.chop();
          pr.stuck = true;
          pr.pos.copy(a.pos).add(new THREE.Vector3(0, 0.2, 0));
        }
        // fish (thrown into the water)
        if (pr.inWater && !pr.stuck) {
          const res = this.fish.strike(pr.pos, pr.vel.clone().normalize(), 0.6, 0.8);
          if (res && !res.missed) { this.give({ rawFish: 1 }); this.ui?.toast(`Your spear skewered a ${res.sp.name}!`, 'good'); this.stats.fish++; this.complete('fish'); pr.vel.multiplyScalar(0.2); }
        }
        const g = terrainHeight(pr.pos.x, pr.pos.z);
        if (pr.pos.y < g + 0.05) { pr.pos.y = g + 0.08; pr.stuck = true; this.fx.dust(pr.pos.x, g, pr.pos.z, 3); }
        _v.copy(pr.vel).normalize();
        if (_v.lengthSq() > 0.1) pr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
      }
      pr.mesh.position.copy(pr.pos);
      if (pr.stuck && pr.age > 600) pr.dead = true;
    }
    this.projectiles = this.projectiles.filter((pr) => { if (pr.dead) this.scene.remove(pr.mesh); return !pr.dead; });
  }
  pickProjectile(pr) {
    if (pr.item === 'arrow') this.inv.add('arrow', 1);
    else this.inv.add(pr.item, 1, { dur: pr.dur });
    this.scene.remove(pr.mesh);
    pr.dead = true;
    this.audio.pickup();
    const it = this.inv.items.filter((x) => x.id === pr.item).pop();
    if (it && ITEMS[pr.item].tool && !this.player.equippedUid) this.equipUid(it.uid);
  }

  onKill(a) {
    this.ui?.toast(a.kind === 'pig' ? 'The pig goes down. Butcher it with a knife.' : `You killed a ${a.kind}.`, 'good');
    if (a.kind === 'pig') { this.stats.pigs++; this.complete('hunt'); }
  }

  butcher(a) {
    const knife = this.hasTool('knife');
    if (!knife) { this.ui?.toast('You need a knife to butcher this.'); return; }
    this.faceTo(a.pos.x, a.pos.z);
    this.player.startAction({ pose: 'gather', dur: 3, hitTime: 0.8, noise: 0.4, onHit: () => {
      const drops = a.kind === 'pig' ? { rawMeat: a.boar ? 4 : 3, hide: 1, bone: 2 } : a.kind === 'crab' ? { crab: 1 } : a.kind === 'gull' ? { rawMeat: 1, bone: 1 } : a.kind === 'lizard' ? { rawMeat: 1 } : a.kind === 'shark' ? { rawMeat: 4, bone: 3 } : { rawMeat: 1 };
      this.give(drops);
      this.fx.blood(a.pos.x, a.pos.y + 0.3, a.pos.z, false);
      this.wearTool(knife, 2);
      a.butchered = true;
      this.wildlife.remove(a);
    } });
  }

  grabCrab(c) {
    this.faceTo(c.pos.x, c.pos.z);
    this.player.startAction({ pose: 'gather', dur: 0.9, hitTime: 0.5, onHit: () => {
      const d = Math.hypot(c.pos.x - this.player.pos.x, c.pos.z - this.player.pos.z);
      if (!c.dead && d < 2 && (c.state !== 'flee' || this.player.crouch) && Math.random() < (this.player.crouch ? 0.85 : 0.45)) {
        this.give({ crab: 1 }); this.wildlife.remove(c);
      } else { this.ui?.toast('The crab scuttles away. Sneak up slowly [C].'); c.state = 'flee'; c.timer = 2; }
    } });
  }

  // ------------------------------------------------------------------ fishing rod
  fishingAction(it) {
    const p = this.player;
    if (this.fishing) {
      const f = this.fishing;
      if (f.state === 'bite') {
        const sp = this.fish.speciesNear(f.x, f.z, f.depth);
        this.give({ rawFish: 1 });
        this.ui?.toast(`You landed a fish!`, 'good');
        this.stats.fish++;
        this.complete('fish');
        this.fx.splash(f.x, this.ocean.level, f.z, 0.5);
        this.wearTool(it, 1);
        void sp;
      } else this.ui?.toast('You reel in the line.');
      this.cancelFishing();
      p.cancelAction();
      return;
    }
    if (p.state !== 'ground' && p.state !== 'boat') return;
    const fwd = p.forward(new THREE.Vector3());
    let spot = null;
    for (let d = 4; d <= 11; d += 1) {
      const x = p.pos.x + fwd.x * d, z = p.pos.z + fwd.z * d;
      const depth = this.ocean.level - terrainHeight(x, z);
      if (depth > 1.2) { spot = { x, z, depth }; break; }
    }
    if (!spot) { this.ui?.toast('Face deeper water to cast.'); return; }
    p.startAction({ pose: 'fishCast', dur: 0.8, hitTime: 0.45, onHit: () => {
      const bob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe04030, roughness: 0.4 }));
      bob.layers.set(1);
      this.scene.add(bob);
      this.fx.splash(spot.x, this.ocean.level, spot.z, 0.15);
      this.fishing = { ...spot, bob, state: 'wait', t: 5 + Math.random() * 14 * (spot.depth > 4 ? 0.7 : 1) * (this.env.time < 8 || this.env.time > 17 ? 0.7 : 1) };
      this.player.startAction({ pose: 'fishCast', dur: 1, loop: true, interruptible: true });
      this.player.action.elapsed = 0.5;
    } });
  }
  updateFishing(dt) {
    const f = this.fishing;
    if (!f) return;
    const p = this.player;
    if (!p.action || p.action.pose !== 'fishCast' || Math.hypot(p.vel.x, p.vel.z) > 0.5) { this.cancelFishing(); return; }
    f.t -= dt;
    const y = this.ocean.heightAt(f.x, f.z);
    f.bob.position.set(f.x, y + (f.state === 'bite' ? -0.08 + Math.sin(this.time * 30) * 0.04 : 0.02), f.z);
    if (f.state === 'wait' && f.t <= 0) { f.state = 'bite'; f.t = 1.4; this.audio.splash(0.2); this.fx.splash(f.x, y, f.z, 0.15); this.ui?.toast('A bite! Strike now!', 'info', 1.2); }
    else if (f.state === 'bite' && f.t <= 0) { this.ui?.toast('It got away.'); f.state = 'wait'; f.t = 6 + Math.random() * 12; }
  }
  cancelFishing() {
    if (!this.fishing) return;
    this.scene.remove(this.fishing.bob);
    this.fishing = null;
    if (this.player?.action?.pose === 'fishCast') this.player.cancelAction();
  }

  // ------------------------------------------------------------------ fire, food & water
  lightFire(fire) {
    this.player.startAction({ pose: 'cook', dur: 2.5, hitTime: 0.9, onHit: () => {
      if (this.env.w.rain > 0.6 && !this.structures.isSheltered(fire.x, fire.z)) { this.ui?.toast('The kindling is too wet. Build a shelter over it or wait.', 'bad'); return; }
      fire.data.lit = true; this.audio.crackle(1); this.ui?.toast('The fire catches.');
    } });
  }
  addFuel(fire) {
    const useLog = this.inv.count('log') > 0 && fire.data.fuel > 2;
    if (useLog) { this.inv.remove('log', 1); fire.data.fuel += 4; } else if (this.inv.count('stick')) { this.inv.remove('stick', 1); fire.data.fuel += 1.5; } else { this.inv.remove('log', 1); fire.data.fuel += 4; }
    fire.data.fuel = Math.min(10, fire.data.fuel);
    this.fx.embers(fire.x, fire.y + 0.4, fire.z, 12);
    this.audio.crackle(1);
    this.ui?.refresh();
  }
  cookItem(fire, raw) {
    const list = fire.rack ? fire.rack.data.cook : fire.data.cook;
    this.inv.remove(raw.id, 1);
    list.push({ id: raw.id, t: 0 });
    this.structures.refreshFood(fire.rack || fire);
    this.player.startAction({ pose: 'cook', dur: 1.2 });
    this.ui?.toast(fire.data.lit ? `Cooking ${ITEMS[raw.id].name.toLowerCase()}... don't let it burn.` : 'Light the fire to cook.');
  }
  takeCooked(fire) {
    const holder = fire.rack || fire;
    const list = holder.data.cook;
    const done = list.filter((it) => it.cooked);
    for (const it of done) {
      this.inv.add(it.id, 1);
      if (it.id === 'cookedFish' || it.id === 'smokedFish') this.complete('cook');
      if (it.burnt) this.ui?.toast('Burnt to a crisp...', 'bad');
    }
    holder.data.cook = list.filter((it) => !it.cooked);
    if (fire.rack) fire.rack.data.cook = holder.data.cook; else fire.data.cook = holder.data.cook;
    this.structures.refreshFood(holder);
    this.audio.pickup();
    this.ui?.toast('+ ' + done.map((d) => ITEMS[d.id].name).join(', '), 'loot');
    this.complete('cook');
  }
  boilWater(fire) {
    const cap = this.inv.count('clayPot') * 4;
    const n = Math.min(cap, this.inv.count('rawWater'));
    this.inv.remove('rawWater', n);
    fire.data.boil = 0.5; fire.data.boilN = n;
    this.ui?.toast(`Boiling ${n} portions of water...`);
    this.player.startAction({ pose: 'cook', dur: 1.5 });
  }
  hangDry(s, it) {
    this.inv.remove(it.id, 1);
    s.data.items.push({ id: it.id, t: 0 });
    this.structures.refreshFood(s);
    this.player.startAction({ pose: 'drink', dur: 1 });
  }
  collectDried(s) {
    const done = s.data.items.filter((it) => it.done);
    for (const it of done) this.inv.add(it.id, 1);
    s.data.items = s.data.items.filter((it) => !it.done);
    this.structures.refreshFood(s);
    this.ui?.toast('+ ' + done.map((d) => ITEMS[d.id].name).join(', '), 'loot');
  }
  collectRain(s) {
    const space = this.inv.waterCapacity() - this.inv.waterCount();
    const n = Math.min(space, Math.floor(s.data.water));
    if (n <= 0) { this.surv.thirst = Math.min(100, this.surv.thirst + 25); s.data.water -= 1; this.audio.drink(); this.ui?.toast('You drink straight from the collector.'); return; }
    s.data.water -= n;
    this.give({ cleanWater: n });
  }
  drinkFromPond() {
    this.player.startAction({ pose: 'kneelDrink', dur: 2.4, hitTime: 0.6, onHit: () => {
      this.audio.drink();
      this.surv.thirst = Math.min(100, this.surv.thirst + 30);
      if (Math.random() < 0.12) { this.surv.injure('sick', 0.3); this.ui?.toast('The water tasted off... your stomach cramps.', 'bad'); }
      this.complete('water');
    } });
  }
  fillWater() {
    const n = this.inv.waterCapacity() - this.inv.waterCount();
    this.player.startAction({ pose: 'kneelDrink', dur: 1.8, hitTime: 0.5, onHit: () => { this.audio.drink(); this.give({ rawWater: n }); } });
  }

  consumeItem(it) {
    const p = this.player;
    const def = ITEMS[it.id];
    if (p.busy || p.state === 'dive' || p.state === 'dead') return;
    if (it.id === 'coconut') {
      // need something to crack it on
      const tool = this.hasTool('knife') || this.hasTool('axe');
      const rockNear = this.nature.grid.query(p.pos.x, p.pos.z, 3).some((o) => o.kind === 'rock' || o.kind === 'cliff');
      if (!tool && !rockNear && !this.inv.count('stone')) { this.ui?.toast('You need a knife, an axe or a rock to crack it open.'); return; }
      p.startAction({ pose: 'chop', dur: 1.2, hitTime: 0.55, onHit: () => { this.audio.chop(); this.inv.remove('coconut', 1); this.inv.add('coconutOpen', 1); this.ui?.refresh(); } });
      return;
    }
    if (def.cat === 'medical') {
      p.startAction({ pose: 'eat', dur: 1.6, hitTime: 0.5, onHit: () => { this.inv.remove(it.id, 1); this.surv.consume(it.id); this.ui?.toast(it.id === 'bandage' ? 'You bind the wound.' : 'You feel a little better.'); this.ui?.refresh(); } });
      return;
    }
    const drink = def.cat === 'water';
    p.startAction({
      pose: drink ? 'drink' : 'eat', dur: drink ? 1.6 : 2.2, hitTime: 0.6,
      onHit: () => {
        const fresh = it.fresh ?? 1;
        this.inv.remove(it.id, 1);
        const msg = this.surv.consume(it.id, fresh);
        if (def.gives) this.inv.add(def.gives, 1);
        drink ? this.audio.drink() : this.audio.eat();
        if (msg) { this.ui?.toast(msg, 'bad'); this.audio.bad(); }
        this.ui?.refresh();
      },
    });
  }

  dropItem(it, all = false) {
    const n = all ? it.n : 1;
    if (this.player.equippedUid === it.uid) this.equip(null);
    if (ITEMS[it.id].tool) this.inv.removeUid(it.uid); else this.inv.remove(it.id, n);
    this.ui?.toast(`Dropped ${ITEMS[it.id].name}.`);
    this.ui?.refresh();
  }

  craft(recipe) {
    const req = this.inv.has(recipe.in) ? recipe.in : recipe.alt && this.inv.has(recipe.alt) ? recipe.alt : null;
    if (!req) { this.ui?.toast('Missing materials.', 'bad'); return false; }
    if (recipe.tools && !this.inv.hasTools(recipe.tools)) { this.ui?.toast('Requires ' + recipe.tools.map((t) => ITEMS[t].name).join(', '), 'bad'); return false; }
    if (recipe.near && !this.structures.nearest(recipe.near, this.player.pos.x, this.player.pos.z, 4)) { this.ui?.toast(`Must be crafted next to a ${STRUCTURES[recipe.near].name.toLowerCase()}.`, 'bad'); return false; }
    if (this.player.busy) return false;
    this.player.startAction({
      pose: 'hammer', dur: recipe.time, noise: 0.3,
      onDone: () => {
        if (!this.inv.consume(req)) return;
        this.inv.add(recipe.out, recipe.n);
        this.audio.craft();
        this.stats.crafted++;
        this.ui?.toast(`Crafted ${recipe.n > 1 ? recipe.n + ' ' : ''}${ITEMS[recipe.out].name}.`, 'good');
        if (recipe.tools) { const t = this.hasTool(recipe.tools[0]); if (t) this.wearTool(t, 1); }
        // auto-equip new tools if hands are empty
        if (ITEMS[recipe.out].tool && !this.player.equippedUid) { const it = this.inv.items.filter((x) => x.id === recipe.out).pop(); this.equipUid(it.uid); }
        this.ui?.refresh();
      },
      interruptible: true,
    });
    return true;
  }

  upgrade(s) {
    const def = STRUCTURES[s.type];
    const up = STRUCTURES[def.upgrade];
    if (!this.inv.has(up.in)) { this.ui?.toast(`Upgrade needs: ${Object.entries(up.in).map(([k, n]) => `${n} ${ITEMS[k].name}`).join(', ')}`, 'bad'); return; }
    this.inv.consume(up.in);
    const { x, z, rot } = s;
    this.structures.remove(s);
    const site = this.structures.add(def.upgrade, x, z, rot, { progress: 0 });
    this.buildSite(site);
  }

  repairStructure(s) {
    const hammer = this.hasTool('hammer');
    if (!this.inv.count('stick') && !this.inv.count('palmLeaf')) { this.ui?.toast('Repairs need branches or palm fronds.'); return; }
    this.player.startAction({ pose: 'hammer', dur: hammer ? 2 : 4, onDone: () => {
      if (this.inv.count('stick')) this.inv.remove('stick', 1); else this.inv.remove('palmLeaf', 2);
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * (hammer ? 0.5 : 0.25));
      if (hammer) this.wearTool(hammer, 1);
      this.audio.hammer();
      this.ui?.toast(`${STRUCTURES[s.type].name} repaired.`);
    } });
  }

  // ------------------------------------------------------------------ boats
  boardBoat(b) {
    const p = this.player;
    this.cancelFishing();
    this.boat = b;
    p.state = 'boat';
    this.prevEquip = p.equippedUid;
    p.equip('paddle');
    p.equippedUid = null;
    this.sailUp = b.def.sail ? true : false;
    this.audio.creak();
    this.ui?.toast(`Aboard the ${b.def.name.toLowerCase()}. Steer with the movement controls.${b.def.sail ? ' Wind fills the sail.' : ''}`);
  }
  leaveBoat() {
    const p = this.player, b = this.boat;
    const side = new THREE.Vector3(Math.cos(b.heading), 0, -Math.sin(b.heading));
    // prefer the side nearest to land
    let best = null;
    for (const s of [1, -1]) {
      for (const dist of [1.4, 2.2, 3]) {
        const x = b.x + side.x * s * dist, z = b.z + side.z * s * dist;
        const h = terrainHeight(x, z);
        if (!best || h > best.h) best = { x, z, h };
      }
    }
    for (const dz of [b.def.len * 0.6, -b.def.len * 0.6]) {
      const x = b.x + Math.sin(b.heading) * dz, z = b.z + Math.cos(b.heading) * dz;
      const h = terrainHeight(x, z);
      if (h > best.h) best = { x, z, h };
    }
    p.pos.set(best.x, Math.max(best.h, this.ocean.level - 1.1), best.z);
    p.state = this.ocean.level - best.h > 1.25 ? 'swim' : 'ground';
    if (p.state === 'swim') this.player.onSplash(p, 0.6);
    this.boat = null;
    p.equip(null);
    if (this.prevEquip) { const it = this.inv.findUid(this.prevEquip); if (it) this.equipUid(it.uid); }
    this.sailUp = false;
  }
  repairBoat(b) {
    const need = b.type === 'raft' ? 'log' : 'hardwood';
    const hasMat = this.inv.count('rope') && (this.inv.count(need) || this.inv.count('stick') >= 2);
    if (!hasMat) { this.ui?.toast(`Repair needs cordage and ${b.type === 'raft' ? 'a log' : 'hardwood'} or 2 branches.`); return; }
    this.player.startAction({ pose: 'hammer', dur: 3, onDone: () => {
      this.inv.remove('rope', 1);
      if (this.inv.count(need)) this.inv.remove(need, 1); else this.inv.remove('stick', 2);
      b.hp = Math.min(b.def.hp, b.hp + b.def.hp * 0.4);
      this.audio.hammer();
      this.ui?.toast('Hull patched.');
    } });
  }
  onBoatHit(b, dmg) {
    this.audio.hammer();
    this.rig.shake = Math.min(1, dmg / 10);
    if (b === this.boat) this.ui?.toast(`The hull scrapes the reef! (${Math.round(b.hp / b.def.hp * 100)}%)`, 'bad');
  }
  onBoatDestroyed(b) {
    if (b === this.boat) { this.boat = null; this.player.state = 'swim'; this.player.equip(null); }
    this.ui?.toast(`Your ${b.def.name.toLowerCase()} broke apart!`, 'bad');
    this.fx.chips(b.x, this.ocean.level, b.z, [0.6, 0.45, 0.3], 30);
  }
  alignBoatPose() {
    const b = this.boat;
    if (!b) return;
    // tilt the survivor with the hull
    this.player.root.rotation.set(b.pitch, b.heading, b.roll, 'YXZ');
    this.player.root.rotation.y = b.heading;
  }

  // ------------------------------------------------------------------ sleep, death, discovery
  sleep(quality) {
    const p = this.player;
    if (this.surv.energy > 85 && this.env.night < 0.5) { this.ui?.toast('You are not tired.'); return; }
    if (this.surv.thirst < 10 || this.surv.hunger < 5) { this.ui?.toast('You are too hungry and thirsty to sleep.', 'bad'); return; }
    this.cancelFishing();
    this.sleepQuality = quality;
    p.state = 'sleep';
    p.equip(null);
    this.ui?.toast('You lie down to rest...');
    if (quality >= 0.7) this.complete('shelter');
  }
  updateSleep() {
    const s = this.surv;
    const morning = this.env.time > 6 && this.env.time < 9;
    if ((s.energy >= 98 && (morning || this.env.night < 0.3)) || s.thirst < 8 || s.hunger < 4 || s.health < 15) this.wake();
    // sleeping exposed during a storm
    if (this.env.w.rain > 0.6 && !this.structures.isSheltered(this.player.pos.x, this.player.pos.z) && Math.random() < 0.002) { this.ui?.toast('The rain soaks you awake.', 'bad'); this.wake(); }
  }
  wake() {
    const p = this.player;
    if (p.state !== 'sleep') return;
    p.state = 'ground';
    if (this.prevEquip) { const it = this.inv.findUid(this.prevEquip); if (it) this.equipUid(it.uid); }
    this.ui?.toast(`You wake. Day ${this.env.day}, ${this.env.clockString()}.`);
    this.save();
  }
  onDeath() {
    const p = this.player;
    p.state = 'dead';
    p.cancelAction();
    this.ui?.showDeath(this.surv.cause || 'perished', this.env.day, this.stats);
  }
  onAnimalAttack(a, dmg, kind) {
    const p = this.player;
    if (p.state === 'boat') return;
    this.surv.damage(dmg, a.kind === 'shark' ? 'taken by a shark' : 'gored by a wild boar');
    this.surv.injure(kind, a.kind === 'shark' ? 0.6 : 0.35);
    this.damageFlash = 1;
    this.rig.shake = 0.8;
    this.audio.bite();
    this.audio.hurt();
    p.startAction({ pose: 'hurt', dur: 0.5, interruptible: true });
    if (p.state === 'sleep') this.wake();
    this.ui?.toast(a.kind === 'shark' ? 'A shark bites you! Get out of the water!' : 'The boar gores you! You are bleeding.', 'bad', 3);
    if (a.kind === 'shark') this.bloodTimer = 30;
  }
  checkDiscovery() {
    const p = this.player;
    for (const isl of ISLANDS) {
      if (this.discovered.has(isl.id)) continue;
      if (Math.hypot(p.pos.x - isl.x, p.pos.z - isl.z) < isl.R * 1.35) {
        this.discovered.add(isl.id);
        this.ui?.discover(isl);
        if (isl.id === 'hunter') this.complete('explore');
      }
    }
    if (this.discovered.has('reef') && this.player.state === 'dive' && nearestIsland(p.pos.x, p.pos.z).island.id === 'reef') this.complete('reef');
  }
  updateTorch(dtH) {
    const it = this.equippedItem;
    const p = this.player;
    const torch = p.offModel && p.equipped === 'torch' ? p.offModel : null;
    if (torch) {
      const fl = torch.getObjectByName('flame'), li = torch.getObjectByName('light');
      const wet = p.state === 'dive' || p.state === 'swim';
      fl.visible = !wet; li.intensity = wet ? 0 : 5 + Math.sin(this.time * 17) * 0.8;
      fl.scale.y = 1 + Math.sin(this.time * 20) * 0.1;
      if (it && !wet) { it.dur -= dtH * 10; if (it.dur <= 0) { this.inv.removeUid(it.uid); this.equip(null); this.ui?.toast('Your torch burned out.'); } }
    }
  }
  footstep(p) {
    const h = terrainHeight(p.pos.x, p.pos.z);
    const onWood = this.structures.floorAt(p.pos.x, p.pos.z, p.pos.y) > h + 0.2;
    const water = this.ocean.heightAt(p.pos.x, p.pos.z);
    const surf = onWood ? 'wood' : water > h ? 'water' : h < 2.2 ? 'sand' : 'grass';
    this.audio.footstep(surf);
    if (surf === 'sand' && p.speed > 3) this.fx.dust(p.pos.x, h, p.pos.z, 2);
    if (surf === 'water') { this.fx.splash(p.pos.x, water, p.pos.z, 0.15); if (Math.random() < 0.5) this.ocean.addRipple(p.pos.x, p.pos.z, 0.5); }
  }
}
