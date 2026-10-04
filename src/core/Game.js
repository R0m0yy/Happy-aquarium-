// Game: owns the single render loop and wires every system together.
import * as THREE from 'three';
import { bus } from './EventBus.js';
import { SaveSystem } from './SaveSystem.js';
import { createDefaultState, createTank, activeTank, allFish, findFish, fishRecord } from './GameState.js';
import { clamp, randRange, pick, uid, formatDuration, deepClone } from './util.js';
import { Renderer } from '../render/Renderer.js';
import { RoomBuilder, CAB_H } from '../render/RoomBuilder.js';
import { TimeOfDay, phaseName } from '../render/TimeOfDay.js';
import { TANK_UNIFORMS } from '../render/materials.js';
import { PreviewRenderer } from '../render/PreviewRenderer.js';
import { aquariumBackground } from '../render/textures.js';
import { AquariumView } from '../aquarium/AquariumView.js';
import { FoodSystem } from '../aquarium/FoodSystem.js';
import { PlantSystem } from '../aquarium/PlantSystem.js';
import { DecorationSystem } from '../aquarium/DecorationSystem.js';
import { FishManager } from '../aquarium/FishManager.js';
import { NavGrid } from '../actors/NavGrid.js';
import { Character } from '../actors/Character.js';
import { Cat } from '../actors/Cat.js';
import { CameraController } from '../camera/CameraController.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Progression } from '../systems/Progression.js';
import { Simulation } from '../systems/Simulation.js';
import { createFish, fishValue, rarityOf } from '../systems/Genetics.js';
import { UIManager } from '../ui/UIManager.js';
import { NEW_TANKS } from '../ui/Panels.js';
import { SPECIES_BY_ID, RARITIES } from '../data/species.js';
import {
  FOOD_BY_ID, PLANT_BY_ID, DECOR_BY_ID, EQUIPMENT_BY_ID, SUBSTRATE_BY_ID, BACKGROUND_BY_ID, LIGHTING_BY_ID, TANKS, TANK_BY_ID, ROOM_BY_ID, ROOM_OPTIONS,
} from '../data/items.js';

const TANK_X = 0.6;
const MOON = new THREE.Color(0x6f9cff);
const PHASE_TIME = { morning: 0.28, day: 0.5, sunset: 0.74, night: 0.92 };

export class Game {
  constructor() {
    this.mode = 'normal';
    this.t = 0;
    this.pointers = new Map();
    this.pointerNdc = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.photoCache = new Map();
    this.interest = new WeakMap();
    this.fpsSamples = [];
    this.lowFpsTime = 0;
    this.saveTimer = 0;
    this.envPhase = null;
    this.eventTimer = 80;
    this.beautyTimer = 0;
    this.beautyScore = 0;
    this.suppress = false;
    this.cleanTool = 'glass';
    this.pointerAttr = null;
    this.glassTapTime = -10;
  }

  get activeTank() {
    return activeTank(this.state);
  }
  get isNight() {
    return this.tod.isNight(this.timeOfDay);
  }
  fishRecord(id) {
    return fishRecord(this.state, id);
  }
  findFish(id) {
    return findFish(this.state, id);
  }

  // ===================================================================== init
  async init(progress = () => {}) {
    progress(0.05, 'Opening your home…');
    this.saveSys = new SaveSystem();
    let st = null;
    try {
      st = await this.saveSys.load();
    } catch (e) {
      console.warn('save load failed', e);
    }
    this.isNew = !st;
    this.state = this.normalize(st ?? createDefaultState());
    const s = this.state;
    this.timeOfDay = s.time.dayTime ?? 0.3;

    progress(0.15, 'Polishing the glass…');
    this.renderer = new Renderer(document.getElementById('stage'));
    s.settings.quality = s.settings.quality ?? 'auto';
    const params = new URLSearchParams(location.search);
    if (params.get('q')) s.settings.quality = params.get('q');
    if (params.has('nointro')) s.tutorial.introSeen = true;
    this.renderer.setQuality(s.settings.quality);
    this.scene = this.renderer.scene;
    this.tod = new TimeOfDay();
    this.room = new RoomBuilder(this.scene);
    this.aquarium = new AquariumView(this.scene, this.renderer);
    this.food = new FoodSystem(this.aquarium);
    this.plants = new PlantSystem(this.aquarium);
    this.decor = new DecorationSystem(this.aquarium, this.plants);
    this.fish = new FishManager(this.aquarium, this.food, this.plants, this.decor);
    this.audio = new AudioManager();
    this.audio.setVolumes({ music: s.settings.music, sfx: s.settings.sfx, ambience: s.settings.ambience });
    this.audio.muted = !!s.settings.muted;
    this.character = new Character(this, s.character);
    this.scene.add(this.character.root);
    this.cat = new Cat(this);
    this.scene.add(this.cat.root);
    this.camera = new CameraController(this.renderer.camera);
    this.renderer.onResize = () => {
      if (this.aquarium?.dim && this.camera.mode !== 'intro') this.camera.frame(this.aquarium, this.room);
    };
    this.progression = new Progression(this);
    this.sim = new Simulation(this);

    progress(0.35, 'Planting the aquascape…');
    await nextFrame();
    this.buildWorld();

    progress(0.6, 'Waking the fish…');
    await nextFrame();
    // offline progression (relaxing: nothing dies)
    const away = (Date.now() - (s.lastSaved ?? Date.now())) / 1000;
    let offline = null;
    if (!this.isNew && away > 30) {
      this.suppress = true;
      offline = this.sim.offline(away);
      if (s.settings.timeMode === 'cycle') this.timeOfDay = (this.timeOfDay + away / (s.settings.cycleMinutes * 60)) % 1;
      this.suppress = false;
      this.reloadTankContents();
    }
    for (const f of allFish(s)) this.progression.discover(f);

    this.preview = new PreviewRenderer(this.scene.environment);
    progress(0.8, 'Tuning the filter…');
    this.ui = new UIManager(this);
    this.wireEvents();
    this.setupInput();
    this.applyTime(0);
    this.captureEnv();
    // warm up shaders so the first frames don't hitch
    this.renderer.renderer.compile(this.scene, this.renderer.camera);
    progress(1, 'Ready');
    this.offlineSummary = offline;
    this.last = performance.now();
    this.renderer.renderer.setAnimationLoop((now) => this.frame(now));
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());
    window.__aquaria = this;
  }

  // fill in any fields missing from older saves
  normalize(st) {
    const d = createDefaultState();
    for (const k of Object.keys(d)) if (st[k] === undefined) st[k] = d[k];
    for (const k of Object.keys(d.settings)) if (st.settings[k] === undefined) st.settings[k] = d.settings[k];
    for (const k of Object.keys(d.stats)) if (st.stats[k] === undefined) st.stats[k] = 0;
    for (const k of Object.keys(d.room.options)) {
      if (st.room.options[k] === undefined) st.room.options[k] = d.room.options[k];
      if (!st.room.ownedOptions[k]) st.room.ownedOptions[k] = d.room.ownedOptions[k];
    }
    for (const k of Object.keys(d.inventory)) if (st.inventory[k] === undefined) st.inventory[k] = d.inventory[k];
    for (const t of st.tanks) {
      t.equipment = { filter: 'filter_basic', heater: null, air: null, co2: null, uv: null, feeder: null, ...(t.equipment ?? {}) };
      t.algae = t.algae ?? { level: 0.1, seed: 1 };
      t.debris = t.debris ?? 0;
      t.filterHealth = t.filterHealth ?? 0.9;
      for (const f of t.fish) {
        f.tricks = f.tricks ?? {};
        f.children = f.children ?? [];
        f.personality = f.personality ?? ['gentle', 'social'];
      }
    }
    if (!st.tanks.find((t) => t.id === st.activeTank)) st.activeTank = st.tanks[0].id;
    return st;
  }

  // ============================================================ world build
  buildWorld() {
    const s = this.state;
    const tank = this.activeTank;
    const dims = AquariumView.dims(tank.size);
    this.room.build(s.room, dims, TANK_X);
    this.aquarium.build(tank, TANK_X, this.renderer.q);
    this.reloadTankContents();
    this.nav = new NavGrid(this.room.bounds, 0.12);
    this.nav.bake(this.room.obstacles, 0.2);
    this.character.setup(this.room, this.aquarium, this.nav);
    this.cat.setup(this.room, this.nav, this.aquarium);
    this.camera.frame(this.aquarium, this.room);
    this.algaePainted = tank.algae.level;
    this.envPhase = null;
  }

  reloadTankContents() {
    const tank = this.activeTank;
    this.food.clear();
    this.plants.load(tank);
    this.decor.load(tank);
    this.fish.load(tank);
    this.fish.invalidateColliders();
    this.aquarium.paintAlgae(tank.algae.level);
    this.aquarium.setDebris(tank.debris);
    this.algaePainted = tank.algae.level;
  }

  captureEnv() {
    const pos = new THREE.Vector3(this.aquarium.center.x, 1.5, this.room.cabinetFront + 1.5);
    const env = this.renderer.captureEnvironment(pos, [this.aquarium.group, this.aquarium.contents, this.character.root, this.cat.root]);
    this.scene.environment = env;
    this.aquarium.group.traverse((o) => {
      if (o.material?.envMap !== undefined && o.material.isMeshPhysicalMaterial) {
        o.material.envMap = env;
        o.material.needsUpdate = true;
      }
    });
  }

  // ================================================================== loop
  frame(now) {
    const dt = Math.min(0.05, Math.max(0.0001, (now - this.last) / 1000));
    this.last = now;
    this.perf(dt);
    this.update(dt);
    this.renderer.render();
  }

  update(dt) {
    this.t += dt;
    const s = this.state;
    // time of day
    const tm = s.settings.timeMode;
    if (tm === 'cycle') this.timeOfDay = (this.timeOfDay + dt / (s.settings.cycleMinutes * 60)) % 1;
    else if (tm === 'real') {
      const d = new Date();
      this.timeOfDay = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
    } else if (PHASE_TIME[tm] !== undefined) this.timeOfDay += (PHASE_TIME[tm] - this.timeOfDay) * Math.min(1, dt * 0.8);
    this.applyTime(dt);
    this.runTimers();
    TANK_UNIFORMS.uTime.value = this.t;
    // simulation (paused while the intro plays)
    if (this.mode !== 'intro') this.sim.update(dt);
    const tankLight = TANK_UNIFORMS.uTankLight.value;
    this.aquarium.update(dt, this.t, tankLight);
    this.food.update(dt);
    this.updateAttractor(dt);
    this.fish.update(dt, this.t, tankLight, this.isNight);
    this.character.update(dt, this.t);
    this.cat.update(dt, this.t);
    this.camera.update(dt, this.mode === 'normal' ? this.pointerNdc : null);
    this.syncTankVisuals(dt);
    this.dynamicEvents(dt);
    this.preview.process();
    this.preview.tick(dt);
    this.ui.update(dt);
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      this.save();
    }
  }

  later(sec, fn) {
    (this.timers ??= []).push({ at: this.t + sec, fn });
  }
  runTimers() {
    if (!this.timers?.length) return;
    const due = this.timers.filter((x) => x.at <= this.t);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const d of due) d.fn();
  }

  // test/debug helper: advance the world without rendering
  advance(seconds, step = 0.05) {
    for (let t = 0; t < seconds; t += step) this.update(step);
  }

  applyTime(dt) {
    let t = this.timeOfDay;
    if (this.mode === 'photo' && this.photoTime !== undefined) t = this.photoTime;
    let override;
    if (this.introLight !== undefined) override = this.introLight;
    const st = this.tod.apply(t, this.room, this.aquarium, this.renderer.renderer, override);
    // the tank light shifts to a soft moonlight blue at night
    const def = this.aquarium.lightDef;
    if (def) {
      const k = clamp((1 - TANK_UNIFORMS.uTankLight.value) * 1.2, 0, 0.75);
      TANK_UNIFORMS.uTankLightColor.value.set(def.color).lerp(MOON, k);
      this.aquarium.spot.color.copy(TANK_UNIFORMS.uTankLightColor.value);
    }
    const ph = phaseName(t);
    if (ph !== this.envPhase) {
      const first = this.envPhase === null;
      this.envPhase = ph;
      if (!first) {
        this.captureEnv();
        if (ph === 'Night' && this.mode !== 'intro') this.notify('Night falls', this.nightLine(), 'moon');
        if (ph === 'Morning' && this.mode !== 'intro') this.notify('Good morning', 'The aquarium lights flicker on.', 'sun');
      }
      this.audio.setNight(ph === 'Night');
    }
    return st;
  }

  nightLine() {
    const sp = new Set(this.activeTank.fish.map((f) => f.species));
    if (sp.has('corydoras')) return 'Your corydoras become busier in the moonlight.';
    if (sp.has('pleco')) return 'Your pleco starts its night-time grazing.';
    return 'Most fish settle down to rest among the plants.';
  }

  // keep algae canvas / debris / plant growth in sync with the simulation
  syncTankVisuals(dt) {
    const tank = this.activeTank;
    this._syncT = (this._syncT ?? 0) + dt;
    if (this._syncT < 3) return;
    this._syncT = 0;
    if (tank.algae.level - this.algaePainted > 0.015) {
      this.aquarium.growAlgae(tank.algae.level - this.algaePainted);
      this.algaePainted = tank.algae.level;
    }
    this.aquarium.setDebris(tank.debris);
    this.aquarium.updateEnvironment(tank);
    this.plants.refresh();
    this.fish.invalidateColliders();
    // the stage scaling of growing fish
    for (const a of this.fish.list) if (a.inner && a.rec.stage !== 'EGG') a.updateScale();
    this.state.stats.plantsMax = Math.max(this.state.stats.plantsMax ?? 0, tank.plants.length);
    this.progression.stat('plantsMax', tank.plants.length, 'max');
    // beauty
    const b = this.sim.beauty(tank);
    for (const m of [50, 70, 75, 85, 95]) {
      if (b >= m && this.beautyScore < m && this.mode !== 'intro') {
        bus.emit('beauty', { value: b });
        this.notify(`Aquarium Beauty ${m}!`, 'Your aquascape is turning heads.', 'star', 'gold');
        break;
      }
    }
    this.beautyScore = b;
  }

  // what pulls curious fish toward the glass
  updateAttractor(dt) {
    const aq = this.aquarium;
    let attr = null;
    if (this.pointerAttr && this.t - this.pointerAttr.time < (this.pointerAttr.tap ? 3 : 0.6)) attr = { kind: 'pointer', pos: this.pointerAttr.pos };
    else {
      const c = this.character;
      if (c.pos.z < this.room.cabinetFront + 0.9 && c.pos.x > aq.minX - 0.2 && c.pos.x < aq.maxX + 0.2 && c.activity !== 'feed') {
        attr = { kind: 'keeper', pos: new THREE.Vector3(clamp(c.pos.x, aq.minX + 0.15, aq.maxX - 0.15), CAB_H + 0.25 + c.elev * 0.8, aq.frontZ - 0.08) };
      } else if (this.cat.state === 'watch') {
        attr = { kind: 'cat', pos: new THREE.Vector3(clamp(this.cat.pos.x, aq.minX + 0.15, aq.maxX - 0.15), CAB_H + 0.2, aq.frontZ - 0.08) };
      }
    }
    this.fish.attractor = attr;
    // bond moments: a favourite fish greets the keeper at the glass
    this._bondT = (this._bondT ?? 0) + dt;
    if (attr?.kind === 'keeper' && this._bondT > 6) {
      this._bondT = 0;
      for (const a of this.fish.list) {
        if (a.rec.stage === 'EGG' || a.rec.bond < 0.35) continue;
        if (a.pos.distanceTo(attr.pos) < 0.35) {
          this.character.waveAt(a.pos);
          this.character.setExpr('joy', 2);
          a.rec.bond = clamp(a.rec.bond + 0.01, 0, 1);
          if (Math.random() < 0.3) this.notify(`${a.rec.name} came to say hello`, 'Your bond is growing.', 'heart', 'pink');
          break;
        }
      }
    }
  }

  interestingFish(pos) {
    let cache = this.interest.get(pos);
    if (cache && this.t - cache.t < 2.5 && cache.a?.group.parent) return cache.a;
    const list = this.fish.list.filter((a) => a.rec.stage !== 'EGG');
    if (!list.length) return null;
    list.sort((x, y) => Math.abs(x.pos.x - pos.x) - Math.abs(y.pos.x - pos.x));
    const a = list[Math.floor(Math.random() * Math.min(3, list.length))];
    this.interest.set(pos, { t: this.t, a });
    return a;
  }

  decorSelectionPoint() {
    const t = this.decor.target();
    return t ? t.obj.position.clone().setY(t.obj.position.y + 0.1) : null;
  }

  // ========================================================= performance
  perf(dt) {
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length > 60) this.fpsSamples.shift();
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    const fps = 1 / avg;
    if (this.state.settings.showFps && this.ui) {
      const el = this.ui.root.querySelector('#fps');
      el.classList.remove('hidden');
      if (Math.random() < 0.1) el.textContent = `${fps.toFixed(0)} FPS · ${this.renderer.qualityName.toUpperCase()}`;
    } else this.ui?.root.querySelector('#fps')?.classList.add('hidden');
    if (this.state.settings.quality === 'auto' && this.mode !== 'intro' && this.fpsSamples.length >= 60) {
      if (fps < 34) this.lowFpsTime += dt;
      else this.lowFpsTime = Math.max(0, this.lowFpsTime - dt);
      if (this.lowFpsTime > 6) {
        this.lowFpsTime = 0;
        const order = ['ultra', 'high', 'medium', 'low'];
        const i = order.indexOf(this.renderer.qualityName);
        if (i >= 0 && i < order.length - 1) {
          this.renderer.setQuality(order[i + 1]);
          this.aquarium.spot.castShadow = !!this.renderer.q.tankShadow;
          this.fpsSamples = [];
        }
      }
    }
  }

  setQuality(q) {
    this.state.settings.quality = q;
    this.renderer.setQuality(q);
    // particle/bubble budgets live in the aquarium build
    this.buildWorld();
    this.captureEnv();
  }

  // ================================================================ input
  setupInput() {
    const el = this.renderer.renderer.domElement;
    this.canvas = el;
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  ray(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.renderer.camera);
    return this.raycaster;
  }

  // intersection with the outer front glass of the tank
  glassHit(e) {
    const r = this.ray(e).ray;
    const aq = this.aquarium;
    const z = aq.frontZ + 0.022;
    if (Math.abs(r.direction.z) < 1e-4) return null;
    const t = (z - r.origin.z) / r.direction.z;
    if (t < 0) return null;
    const p = r.origin.clone().addScaledVector(r.direction, t);
    if (p.x < aq.minX || p.x > aq.maxX || p.y < CAB_H + 0.03 || p.y > CAB_H + aq.dim.h) return null;
    return p;
  }

  substrateHit(e) {
    const hits = this.ray(e).intersectObject(this.aquarium.substrate, false);
    return hits[0]?.point ?? null;
  }

  onDown(e) {
    this.audio.start();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, t: performance.now(), moved: false });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
    this.dragObject = false;
    if (this.mode === 'decorate' && this.pointers.size === 1) {
      const hit = this.decor.pick(this.ray(e));
      if (hit) {
        if (!this.decor.selection || this.decor.selection.uid !== hit.uid) {
          this.decor.setSelection({ type: hit.type, uid: hit.uid });
          this.character.pointAtTank();
          this.ui.panels.renderDecorUI();
          this.audio.click();
        }
        this.decor.pushHistory();
        this.dragObject = true;
      }
    }
    if (this.mode === 'clean' && this.pointers.size === 1) this.cleanAt(e);
    // long press = detailed fish info
    clearTimeout(this.longPress);
    if (this.mode === 'normal' && this.pointers.size === 1) {
      this.longPress = setTimeout(() => {
        const p = this.pointers.get(e.pointerId);
        if (!p || p.moved) return;
        const a = this.fish.pickScreen(this.renderer.camera, e.clientX, e.clientY, window.innerWidth, window.innerHeight);
        if (a) {
          p.long = true;
          this.selectFish(a.rec.id);
          this.ui.open('family', a.rec.id);
        }
      }, 550);
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      // hover: curious fish follow the cursor along the glass
      if (this.mode === 'normal' && e.target === this.canvas) {
        this.pointerNdc.copy(this.ndc(e));
        const g = this.glassHit(e);
        if (g) this.pointerAttr = { pos: g.setZ(this.aquarium.frontZ - 0.06), time: this.t };
      }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.moved = true;
    if (!p.moved) return;
    clearTimeout(this.longPress);
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.camera.zoom(this.pinch.d / Math.max(10, d));
      this.camera.translate(cx - this.pinch.cx, cy - this.pinch.cy);
      this.pinch = { d, cx, cy };
      return;
    }
    if (this.mode === 'decorate' && this.dragObject) {
      const hit = this.substrateHit(e);
      if (hit) this.decor.moveTo(hit.x, hit.z);
      return;
    }
    if (this.mode === 'clean') {
      this.cleanAt(e);
      return;
    }
    if (this.mode === 'normal' || this.mode === 'photo' || this.mode === 'decorate') {
      this.canvas.classList.add('dragging');
      if (p.button === 2 || e.shiftKey) this.camera.translate(dx, dy);
      else this.camera.pan(dx, dy);
      if (Math.abs(dx) + Math.abs(dy) > 2) bus.emit('camera:panned');
      const g = this.glassHit(e);
      if (g && this.mode === 'normal') this.pointerAttr = { pos: g.setZ(this.aquarium.frontZ - 0.06), time: this.t };
    }
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    clearTimeout(this.longPress);
    this.canvas.classList.remove('dragging');
    if (this.pointers.size < 2) this.pinch = null;
    if (this.dragObject) {
      this.dragObject = false;
      this.decor.commitMove();
      this.fish.invalidateColliders();
      if (!p.moved) this.decor.history.pop();
      return;
    }
    if (p.moved || p.long) {
      if (this.mode === 'clean') this.character.scrubbing = false;
      return;
    }
    this.tap(e);
  }

  tap(e) {
    if (this.mode === 'decorate') {
      const hit = this.decor.pick(this.ray(e));
      if (!hit) {
        this.decor.setSelection(null);
        this.ui.panels.renderDecorUI();
      }
      return;
    }
    if (this.mode === 'clean' || this.mode === 'intro') return;
    const W = window.innerWidth, H = window.innerHeight;
    const a = this.fish.pickScreen(this.renderer.camera, e.clientX, e.clientY, W, H);
    if (a) {
      this.selectFish(a.rec.id);
      return;
    }
    // cat
    const cv = this.cat.root.position.clone().setY(this.cat.elev + 0.22).project(this.renderer.camera);
    if (Math.hypot((cv.x * 0.5 + 0.5) * W - e.clientX, (-cv.y * 0.5 + 0.5) * H - e.clientY) < 60) {
      this.audio.meow();
      this.character.petCat(this.cat);
      return;
    }
    // keeper
    const kv = this.character.root.position.clone().setY(this.character.elev + 0.7).project(this.renderer.camera);
    if (Math.hypot((kv.x * 0.5 + 0.5) * W - e.clientX, (-kv.y * 0.5 + 0.5) * H - e.clientY) < 60 && !this.character.busy) {
      this.character.celebrate();
      return;
    }
    const g = this.glassHit(e);
    if (g) {
      this.tapGlass(g);
      return;
    }
    if (this.ui.fishCardId) this.selectFish(null);
  }

  onKey(e) {
    if (e.target.closest?.('input')) return;
    if (this.mode === 'decorate') {
      const k = e.key.toLowerCase();
      if (k === 'r') this.decorTool('rotate');
      else if (k === ']') this.decorTool('scaleUp');
      else if (k === '[') this.decorTool('scaleDown');
      else if (k === 'delete' || k === 'backspace') this.decorTool('delete');
      else if ((e.ctrlKey || e.metaKey) && k === 'z') this.decorTool(e.shiftKey ? 'redo' : 'undo');
      else if ((e.ctrlKey || e.metaKey) && k === 'y') this.decorTool('redo');
      else if (k === 'escape') this.setMode('normal');
      else return;
      this.ui.panels.renderDecorUI();
    } else if (e.key === 'Escape') {
      if (this.camera.mode === 'intro') this.camera.skipIntro();
      else if (this.mode !== 'normal') this.setMode('normal');
      else if (this.ui.panelName) this.ui.close();
      else this.selectFish(null);
    } else if (e.key === 'f' && this.mode === 'normal') this.feed();
  }

  // ================================================================ modes
  setMode(mode, arg) {
    const prev = this.mode;
    if (prev === 'intro') return;
    if (prev === 'decorate' && mode !== 'decorate') {
      this.decor.setSelection(null);
      this.decor.editing = false;
      this.character.decorateMode(false);
      this.fish.invalidateColliders();
      this.camera.goHome();
    }
    if (prev === 'clean' && mode !== 'clean') {
      this.character.endClean();
      this.canvas.classList.remove('mode-clean');
    }
    if (prev === 'photo' && mode !== 'photo') {
      this.photoTime = undefined;
      this.photoHideUI = false;
      this.camera.goHome();
    }
    this.mode = mode;
    if (mode === 'decorate') {
      this.ui.close();
      this.selectFish(null);
      this.decor.editing = true;
      this.decor.history = [];
      this.decor.future = [];
      this.character.decorateMode(true);
      this.camera.focusOn(this.aquarium.center.clone().setY(this.aquarium.center.y + this.aquarium.dim.h * 0.42), this.camera.home.dist * 0.92);
    } else if (mode === 'clean') {
      this.cleanTool = arg ?? 'glass';
      this.selectFish(null);
      this.canvas.classList.add('mode-clean');
      this.character.cleanSequence(this.aquarium.center.x);
      this.camera.focusOn(this.aquarium.center.clone().setY(this.aquarium.center.y + this.aquarium.dim.h * 0.4), this.camera.home.dist * 0.85);
    } else if (mode === 'photo') {
      this.ui.close();
      this.photoTime = undefined;
      this.camera.mode = 'room';
      if (arg) {
        const a = this.fish.get(arg);
        if (a) this.camera.focusOn(a.pos, 1.2);
      }
      if (!this.character.busy) this.character.photoSequence(null);
      this.selectFish(null);
    }
    this.ui.setModeUI(mode, arg);
    this.ui.root.querySelectorAll('[data-act="mode:decorate"], [data-act="mode:photo"]').forEach((b) => b.classList.toggle('active', b.dataset.act === `mode:${mode}`));
  }

  // =============================================================== fish UI
  selectFish(id, focus = false) {
    if (!id) {
      this.ui.hideFishCard();
      if (this.camera.mode === 'follow' || this.camera.mode === 'focus') this.camera.goHome();
      return;
    }
    const found = this.findFish(id);
    if (!found) return;
    if (found.tank !== this.activeTank) {
      this.switchTank(found.tank.id);
    }
    this.ui.showFishCard(id);
    const a = this.fish.get(id);
    if (a && this.camera.mode !== 'follow') {
      const p = a.pos.clone().lerp(this.aquarium.center.clone().setY(a.pos.y), 0.35);
      if (window.innerWidth <= 760) p.y -= 0.22; // keep the fish above the bottom sheet
      this.camera.focusOn(p, this.camera.home.dist * (window.innerWidth <= 760 ? 0.45 : 0.62));
    }
    if (a) {
      a.rec.bond = clamp(a.rec.bond + 0.002, 0, 1);
      a.lookTarget = this.renderer.camera.position.clone();
    }
    this.audio.bubble(1);
    bus.emit('fish:selected', { id });
  }

  followFish(id) {
    const a = this.fish.get(id);
    if (!a) return;
    if (this.camera.mode === 'follow' && this.camera.follow === a) this.camera.stopFollow();
    else this.camera.startFollow(a);
  }

  renameFish(id, name) {
    const rec = this.fishRecord(id);
    if (!rec) return;
    rec.name = name.slice(0, 18);
    bus.emit('fish:renamed', { fish: rec });
  }

  toggleFavorite(id) {
    const rec = this.fishRecord(id);
    if (!rec) return;
    rec.favorite = !rec.favorite;
    if (rec.favorite) {
      rec.bond = clamp(rec.bond + 0.05, 0, 1);
      bus.emit('favorite', { fish: rec });
    }
  }

  trainFish(id, trick) {
    const rec = this.fishRecord(id);
    if (!rec) return { ok: false, reason: 'Fish not found.' };
    if (!this.progression.feature('training')) return { ok: false, reason: 'Training unlocks at Lv.4.' };
    if (this.findFish(id)?.tank !== this.activeTank) return { ok: false, reason: 'Visit this fish’s tank to train it.' };
    const learned = (rec.tricks[trick] ?? 0) >= 1;
    if (!learned) {
      const r = this.sim.train(rec, trick);
      if (!r.ok) return r;
      if (r.learned) this.character.celebrate();
    }
    this.fish.startTrick(id, trick, { x: this.character.pos.x });
    this.camera.focusOn(this.fish.get(id).pos, 1.5);
    return { ok: true };
  }

  breedFish(a, b) {
    const ra = this.fishRecord(a), rb = this.fishRecord(b);
    if (!this.progression.feature('breeding')) return { ok: false, reason: 'Breeding unlocks at Lv.3.' };
    const r = this.sim.startBreeding(ra, rb);
    if (!r.ok) return r;
    // courtship dance
    this.fish.startTrick(a, 'circle');
    this.fish.startTrick(b, 'circle');
    const sp = SPECIES_BY_ID[ra.species];
    this.notify(`${r.mother.name} & ${r.father.name} paired up`, `${sp.breeding.type === 'live' ? 'Babies' : 'Eggs'} expected in about ${formatDuration(sp.breeding.gestation)}.`, 'breed', 'pink');
    return r;
  }

  moveFish(id, tankId) {
    const found = this.findFish(id);
    const dest = this.state.tanks.find((t) => t.id === tankId);
    if (!found || !dest) return;
    found.tank.fish = found.tank.fish.filter((f) => f.id !== id);
    dest.fish.push(found.fish);
    if (found.tank === this.activeTank) this.fish.removeActor(id);
    this.ui.hideFishCard();
    this.notify(`${found.fish.name} moved`, `Now living in ${dest.name}.`, 'swap');
  }

  sellFish(id) {
    const found = this.findFish(id);
    if (!found) return;
    const f = found.fish;
    const v = fishValue(f);
    found.tank.fish = found.tank.fish.filter((x) => x.id !== id);
    this.state.archive[id] = { id, name: f.name, species: f.species, genome: f.genome, parents: f.parents, children: f.children, generation: f.generation, sex: f.sex, rarity: f.rarity, stage: f.stage, age: f.age };
    if (found.tank === this.activeTank) this.fish.removeActor(id);
    this.progression.give({ coins: v }, 'sell');
    this.ui.hideFishCard();
    this.camera.goHome();
    this.notify(`${f.name} found a new home`, `+${v} coins`, 'sell');
    this.progression.updateRecords();
    bus.emit('fish:sold', { fish: f });
  }

  // ================================================================ feeding
  feed(foodId, fishId) {
    this.audio.start();
    const s = this.state;
    if (this.mode !== 'normal') this.setMode('normal');
    foodId = foodId ?? s.selectedFood ?? 'flakes';
    let stock = s.inventory.food[foodId] ?? 0;
    if (stock === 0) {
      foodId = 'flakes';
      stock = -1;
      s.selectedFood = 'flakes';
    }
    if (this.character.activity === 'feed') return;
    const food = FOOD_BY_ID[foodId];
    if (food.currency === 'pearls' && stock === 0) return;
    if (stock > 0) s.inventory.food[foodId] = stock - 1;
    const target = fishId ? this.fish.get(fishId)?.pos.x : undefined;
    this.character.feedSequence(() => {
      this.audio.shakeJar();
      for (let i = 0; i < 3; i++) {
        this.later(0.15 + i * 0.45, () => {
          const hand = this.character.handWorld();
          const x = clamp(hand.x + randRange(-0.08, 0.08), this.aquarium.minX + 0.1, this.aquarium.maxX - 0.1);
          this.food.drop(foodId, x, this.aquarium.frontZ - 0.14 - Math.random() * 0.12);
          this.audio.sprinkle();
          if (i === 0) this.audio.splash();
        });
      }
      bus.emit('fish:fed', { food });
    }, target);
  }

  tapGlass(p) {
    this.audio.tapGlass();
    this.pointerAttr = { pos: p.clone().setZ(this.aquarium.frontZ - 0.06), time: this.t, tap: true };
    this.fish.startle(p.clone().setZ(this.aquarium.frontZ - 0.1), 0.45, p);
    bus.emit('glass:tapped');
  }

  // ================================================================= care
  cleanAt(e) {
    if (this.cleanTool === 'glass') {
      const g = this.glassHit(e);
      if (!g) return;
      this.scrubAt(g.x, g.y, 1);
      this.character.scrubTarget = g.x;
      this.character.scrubbing = true;
      clearTimeout(this._scrubOff);
      this._scrubOff = setTimeout(() => (this.character.scrubbing = false), 400);
    } else {
      const hit = this.substrateHit(e);
      if (!hit) return;
      const tank = this.activeTank;
      if ((tank.debris ?? 0) > 0) {
        tank.debris = Math.max(0, tank.debris - 0.012);
        tank.water.cleanliness = Math.min(1, tank.water.cleanliness + 0.002);
        this.aquarium.setDebris(tank.debris);
        if (Math.random() < 0.3) this.aquarium.spawnBubble(hit.x - this.aquarium.center.x, hit.y - CAB_H + 0.02, hit.z - this.aquarium.center.z, 0.008);
        if (Math.random() < 0.2) this.audio.noise(0.15, { freq: 700, q: 0.7, vol: 0.06 });
        if (tank.debris === 0) {
          this.notify('Gravel spotless', 'Water clarity improved.', 'vacuum', 'green');
          bus.emit('clean:done', { kind: 'vacuum' });
        }
      }
      this.character.scrubTarget = hit.x;
    }
  }

  // world-space scrub on the front glass; radiusK scales the brush
  scrubAt(x, y, radiusK = 1) {
    const aq = this.aquarium;
    const u = (x - (aq.center.x - aq.dim.w / 2)) / aq.dim.w;
    const v = (y - CAB_H) / aq.dim.h;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const r = aq.scrubAlgae(u, v, 26 * radiusK);
    const tank = this.activeTank;
    if (r.removed > 0) {
      tank.algae.level = Math.max(0, tank.algae.level - r.removed * 1.3);
      this.algaePainted = tank.algae.level;
      if (Math.random() < 0.25) this.audio.squeak();
    }
    for (let i = 0; i < r.cleared; i++) {
      this.audio.sparkle();
      bus.emit('clean:patch');
    }
  }

  waterChange() {
    if (this.waterChanging) return;
    const tank = this.activeTank;
    this.waterChanging = true;
    this.audio.waterChange();
    this.character.interrupt([this.character.walkTo(this.aquarium.center.x + 0.4, this.room.cabinetFront + 0.45, { faceTo: [this.aquarium.center.x, this.aquarium.center.z] }), this.character.play('inspect', 4, { look: 'tank' })]);
    const surf = this.aquarium.surface, line = this.aquarium.waterline;
    const base = this.aquarium.waterLocal;
    const t0 = performance.now();
    const anim = () => {
      const u = (performance.now() - t0) / 4500;
      const k = u < 0.4 ? u / 0.4 : u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.45);
      surf.position.y = base - k * 0.1;
      line.position.y = base - k * 0.1;
      if (u > 0.55 && Math.random() < 0.6) this.aquarium.spawnBubble(randRange(-0.5, 0.5) * this.aquarium.dim.w * 0.6, base - 0.15, randRange(-0.2, 0.2), 0.01);
      if (u < 1) requestAnimationFrame(anim);
      else {
        surf.position.y = base;
        line.position.y = base;
        this.waterChanging = false;
      }
    };
    anim();
    tank.water.cleanliness = Math.min(1, tank.water.cleanliness + 0.4);
    tank.debris = Math.max(0, (tank.debris ?? 0) - 0.15);
    this.sim.waterTick(tank, 0);
    this.notify('Fresh water!', 'Water quality improved.', 'water', 'green');
    bus.emit('water:changed');
  }

  maintainFilter() {
    const tank = this.activeTank;
    tank.filterHealth = 1;
    tank.water.cleanliness = Math.min(1, tank.water.cleanliness + 0.08);
    this.character.interrupt([this.character.walkTo(this.aquarium.center.x - 0.5, this.room.cabinetFront + 0.35, { faceTo: [this.aquarium.center.x - 0.5, this.aquarium.center.z] }), this.character.play('crouch', 2.5)]);
    this.notify('Filter cleaned', 'The water flows clear and strong.', 'filter', 'green');
    bus.emit('filter:maintained');
  }

  trim(uidOrAll) {
    const list = uidOrAll === 'all' ? this.plants.overgrown().map((it) => it.rec.uid) : [uidOrAll];
    let n = 0;
    for (const u of list) if (this.plants.trim(u)) n++;
    if (n) {
      this.audio.sparkle();
      this.fish.invalidateColliders();
    }
    return n;
  }

  // ============================================================ decorate
  invCount(type, id) {
    const inv = type === 'plant' ? this.state.inventory.plants : this.state.inventory.decor;
    return inv[id] ?? 0;
  }

  placeItem(type, id) {
    const s = this.state;
    const def = type === 'plant' ? PLANT_BY_ID[id] : DECOR_BY_ID[id];
    if (!def) return { ok: false, reason: 'Unknown item.' };
    if (s.player.level < (def.unlock ?? 1)) return { ok: false, reason: `Unlocks at Lv.${def.unlock}` };
    if (this.invCount(type, id) <= 0) {
      const r = this.buy(type, id);
      if (!r.ok) return r;
    }
    const inv = type === 'plant' ? s.inventory.plants : s.inventory.decor;
    inv[id]--;
    this.decor.pushHistory();
    const nx = randRange(-0.3, 0.3), nz = type === 'plant' && def.zone === 'back' ? randRange(-0.4, -0.2) : randRange(-0.1, 0.25);
    const it = type === 'plant' ? this.plants.add(id, nx, nz) : this.decor.add(id, nx, nz);
    this.decor.setSelection({ type, uid: it.rec.uid });
    this.fish.invalidateColliders();
    this.character.pointAtTank();
    this.audio.splash();
    return { ok: true };
  }

  decorTool(action) {
    const d = this.decor;
    const before = this.invSnapshot();
    switch (action) {
      case 'rotate':
        if (!d.selection) return;
        d.pushHistory();
        d.rotate(Math.PI / 6);
        break;
      case 'scaleUp':
        if (!d.selection) return;
        d.pushHistory();
        d.scale(1.12);
        break;
      case 'scaleDown':
        if (!d.selection) return;
        d.pushHistory();
        d.scale(1 / 1.12);
        break;
      case 'delete': {
        if (!d.selection) return;
        d.pushHistory();
        d.deleteSelection();
        break;
      }
      case 'undo':
        d.undo();
        break;
      case 'redo':
        d.redo();
        break;
      default:
        return;
    }
    // keep inventory consistent with what's in the tank
    this.reconcileInventory(before);
    this.fish.invalidateColliders();
    d.updateEmitters();
  }

  invSnapshot() {
    const t = this.activeTank;
    const c = {};
    for (const p of t.plants) c[`plant:${p.plantId}`] = (c[`plant:${p.plantId}`] ?? 0) + 1;
    for (const p of t.decor) c[`decor:${p.itemId}`] = (c[`decor:${p.itemId}`] ?? 0) + 1;
    return c;
  }
  reconcileInventory(before) {
    const after = this.invSnapshot();
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      const diff = (before[k] ?? 0) - (after[k] ?? 0);
      if (!diff) continue;
      const [type, id] = k.split(':');
      const inv = type === 'plant' ? this.state.inventory.plants : this.state.inventory.decor;
      inv[id] = Math.max(0, (inv[id] ?? 0) + diff);
    }
  }

  bgThumb(id) {
    this._bgThumbs = this._bgThumbs ?? {};
    if (!this._bgThumbs[id]) {
      const src = aquariumBackground(id);
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 100;
      c.getContext('2d').drawImage(src, 0, 0, 160, 100);
      this._bgThumbs[id] = c.toDataURL();
    }
    return this._bgThumbs[id];
  }

  // ================================================================= shop
  buy(kind, id) {
    const s = this.state, pg = this.progression;
    const lvl = s.player.level;
    const pay = (price, currency = 'coins') => {
      if (!pg.canAfford(price, currency)) return false;
      pg.spend(price, currency);
      this.audio.coin();
      return true;
    };
    const noMoney = (currency = 'coins') => ({ ok: false, reason: `Not enough ${currency}.` });
    switch (kind) {
      case 'fish': {
        const sp = SPECIES_BY_ID[id];
        if (lvl < sp.unlock.level) return { ok: false, reason: `Unlocks at Lv.${sp.unlock.level}` };
        let tank = this.activeTank;
        if (tank.env !== sp.env) {
          tank = s.tanks.find((t) => t.env === sp.env && t.fish.length < TANK_BY_ID[t.size].cap);
          if (!tank) return { ok: false, reason: sp.env === 'marine' ? 'You need a Marine Reef Tank for this fish.' : 'You need a freshwater tank.' };
        }
        if (tank.fish.length >= TANK_BY_ID[tank.size].cap) return { ok: false, reason: 'This tank is full. Upgrade or add another aquarium.' };
        if (!pay(sp.price)) return noMoney();
        const rec = createFish(id, { existingNames: allFish(s).map((f) => f.name), hunger: 0.4 });
        tank.fish.push(rec);
        if (tank === this.activeTank) {
          const b = this.aquarium.bounds();
          const a = this.fish.addActor(rec, b, new THREE.Vector3(randRange(b.minX + 0.3, b.maxX - 0.3), b.maxY - 0.05, randRange(b.minZ + 0.2, b.maxZ - 0.2)));
          a.burst = 0.6;
          this.aquarium.addRipple(a.pos.x, a.pos.z, 1.5);
          this.audio.splash();
        }
        this.progression.discover(rec);
        bus.emit('fish:bought', { fish: rec, env: sp.env });
        this.notify(`Welcome, ${rec.name}!`, `A ${rarityLabel(rec.rarity)} ${sp.name} joined ${tank.name}.`, 'fish', 'green');
        return { ok: true, rec };
      }
      case 'plant': {
        const p = PLANT_BY_ID[id];
        if (lvl < p.unlock) return { ok: false, reason: `Unlocks at Lv.${p.unlock}` };
        if (!pay(p.price)) return noMoney();
        s.inventory.plants[id] = (s.inventory.plants[id] ?? 0) + 1;
        bus.emit('plant:bought', { plant: p });
        if (this.mode !== 'decorate') this.notify(`${p.name} ready to plant`, 'Place it from Decorate → Plants.', 'plant');
        return { ok: true };
      }
      case 'decor': {
        const d = DECOR_BY_ID[id];
        if (lvl < d.unlock) return { ok: false, reason: `Unlocks at Lv.${d.unlock}` };
        if (!pay(d.price, d.currency)) return noMoney(d.currency);
        s.inventory.decor[id] = (s.inventory.decor[id] ?? 0) + 1;
        bus.emit('decor:bought', { item: d });
        if (this.mode !== 'decorate') this.notify(`${d.name} unlocked`, 'Place it from Decorate mode.', 'decor');
        return { ok: true };
      }
      case 'food': {
        const f = FOOD_BY_ID[id];
        if (lvl < (f.unlock ?? 1)) return { ok: false, reason: `Unlocks at Lv.${f.unlock}` };
        if (!f.price) return { ok: false, reason: 'Basic flakes are always free.' };
        if (!pay(f.price, f.currency)) return noMoney(f.currency);
        s.inventory.food[id] = Math.max(0, s.inventory.food[id] ?? 0) + 10;
        s.selectedFood = id;
        return { ok: true };
      }
      case 'equipment': {
        const e = EQUIPMENT_BY_ID[id];
        if (lvl < (e.unlock ?? 1)) return { ok: false, reason: `Unlocks at Lv.${e.unlock}` };
        if (!s.inventory.equipment.includes(id)) {
          if (!pay(e.price, e.currency)) return noMoney(e.currency);
          s.inventory.equipment.push(id);
        }
        return this.useItem('equipment', id);
      }
      case 'substrate':
      case 'background':
      case 'lighting': {
        const src = { substrate: [SUBSTRATE_BY_ID, 'substrates'], background: [BACKGROUND_BY_ID, 'backgrounds'], lighting: [LIGHTING_BY_ID, 'lighting'] }[kind];
        const item = src[0][id];
        if (!s.inventory[src[1]].includes(id)) {
          if (!pay(item.price, item.currency)) return noMoney(item.currency);
          s.inventory[src[1]].push(id);
        }
        return this.useItem(kind, id);
      }
      default:
        return { ok: false, reason: 'Not available.' };
    }
  }

  useItem(kind, id) {
    const t = this.activeTank;
    if (kind === 'equipment') {
      const e = EQUIPMENT_BY_ID[id];
      t.equipment[e.slot] = id;
      if (e.slot === 'air') this.decor.updateEmitters();
      this.notify(`${e.name} installed`, e.desc, 'filter', 'green');
    } else if (kind === 'substrate') {
      this.aquarium.setSubstrate(id);
      this.plants.refresh();
      this.decor.load(t);
      this.fish.invalidateColliders();
      this.captureEnv();
    } else if (kind === 'background') this.aquarium.setBackground(id);
    else if (kind === 'lighting') this.aquarium.setLighting(id);
    bus.emit('tank:styled', { kind, id });
    return { ok: true };
  }

  // ================================================================ tanks
  switchTank(id) {
    if (this.state.activeTank === id) return;
    this.state.activeTank = id;
    this.ui?.hideFishCard();
    this.buildWorld();
    this.captureEnv();
    this.notify(`Now viewing ${this.activeTank.name}`, '', 'tank');
  }

  upgradeTank() {
    const s = this.state;
    const t = this.activeTank;
    const idx = TANKS.findIndex((x) => x.id === t.size);
    const next = TANKS[idx + 1];
    const room = ROOM_BY_ID[s.room.id];
    if (!next) return { ok: false, reason: 'Already the largest aquarium.' };
    if (idx + 1 > room.maxTank) return { ok: false, reason: `Your ${room.name} can't fit a ${next.name}. Move to a bigger room.` };
    if (s.player.level < next.unlock) return { ok: false, reason: `Unlocks at Lv.${next.unlock}` };
    if (!this.progression.spend(next.price, next.currency ?? 'coins')) return { ok: false, reason: 'Not enough currency.' };
    t.size = next.id;
    this.buildWorld();
    this.captureEnv();
    this.character.celebrate();
    bus.emit('tank:upgraded', { size: next.id });
    this.notify(`Upgraded to ${next.name}!`, 'Your fish have so much more room.', 'tank', 'gold');
    return { ok: true };
  }

  buyTank(kind) {
    const s = this.state;
    const def = NEW_TANKS.find((n) => n.id === kind);
    if (!def) return { ok: false, reason: 'Unknown tank.' };
    if (s.player.level < def.unlock) return { ok: false, reason: `Unlocks at Lv.${def.unlock}` };
    if (s.tanks.length >= 5) return { ok: false, reason: 'You can own up to 5 aquariums.' };
    if (!this.progression.spend(def.price)) return { ok: false, reason: 'Not enough coins.' };
    const t = createTank({ name: def.name, size: def.size, env: def.env, type: def.type });
    t.plants.push({ uid: uid('pl'), plantId: def.env === 'marine' ? 'moss' : 'javafern', nx: -0.2, nz: -0.2, growth: 0.6, scale: 1, rot: 0 });
    t.decor.push({ uid: uid('dc'), itemId: def.env === 'marine' ? 'caverock' : 'river', nx: 0.15, nz: 0, rot: 0, scale: 1 });
    if (def.env === 'marine') {
      s.inventory.substrates.includes('coral') || s.inventory.substrates.push('coral');
      s.inventory.lighting.includes('tropical') || s.inventory.lighting.push('tropical');
    }
    s.tanks.push(t);
    bus.emit('tank:bought', { tank: t });
    this.notify(`${def.name} set up!`, 'Switch to it from the Tank panel.', 'tank', 'gold');
    return { ok: true };
  }

  // ================================================================= room
  buyRoom(id) {
    const s = this.state, r = ROOM_BY_ID[id];
    if (s.player.level < r.unlock) return { ok: false, reason: `Unlocks at Lv.${r.unlock}` };
    if (!this.progression.spend(r.price, r.currency ?? 'coins')) return { ok: false, reason: 'Not enough currency.' };
    s.room.owned.push(id);
    bus.emit('customize', { room: id });
    this.moveRoom(id);
    return { ok: true };
  }
  moveRoom(id) {
    this.state.room.id = id;
    // shrink the tank if the new room can't fit it (never lose fish)
    const max = ROOM_BY_ID[id].maxTank;
    for (const t of this.state.tanks) if (TANKS.findIndex((x) => x.id === t.size) > max) t.size = TANKS[max].id;
    this.buildWorld();
    this.captureEnv();
    this.notify(`Welcome to the ${ROOM_BY_ID[id].name}`, '', 'home', 'gold');
  }
  setRoomOption(cat, id) {
    const s = this.state;
    if (!this.progression.feature('roomCustom')) return { ok: false, reason: 'Unlocks at Lv.2.' };
    const opt = ROOM_OPTIONS[cat].find((o) => o.id === id);
    const owned = s.room.ownedOptions[cat] ?? (s.room.ownedOptions[cat] = []);
    if (!owned.includes(id) && opt.price) {
      if (!this.progression.spend(opt.price)) return { ok: false, reason: 'Not enough coins.' };
      owned.push(id);
      bus.emit('customize', { cat, id });
    }
    s.room.options[cat] = id;
    this.buildWorld();
    this.captureEnv();
    return { ok: true };
  }
  setLook(key, value) {
    this.state.character[key] = value;
    this.character.setLook(this.state.character);
    this.renderPortrait();
    if (!this._lookEmitted) {
      this._lookEmitted = true;
      bus.emit('customize', { look: key });
    }
  }

  renderPortrait() {
    // draw the keeper's face into the HUD portrait using the preview renderer
    const pr = this.preview;
    if (!pr) return;
    pr.clearRoot();
    const m = this.character.model;
    const clone = m.root.clone(true);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    pr.root.add(clone);
    pr.root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    clone.getObjectByName('head').getWorldPosition(head);
    head.y += 0.17;
    pr.cam.position.set(head.x + 0.12, head.y + 0.02, head.z + 0.75);
    pr.cam.lookAt(head);
    pr.r.setClearColor(0x2b6a9a, 1);
    pr.r.render(pr.scene, pr.cam);
    this.ui.setPortrait(pr.canvas.toDataURL('image/png'));
    pr.r.setClearColor(0x000000, 0);
    pr.root.remove(clone);
  }

  // ================================================================ photo
  photoAction(a) {
    const cam = this.camera;
    switch (a) {
      case 'exit':
        this.setMode('normal');
        break;
      case 'hide':
        this.photoHideUI = !this.photoHideUI;
        this.ui.modeEl.style.opacity = this.photoHideUI ? '0.15' : '1';
        break;
      case 'zin':
        cam.zoom(0.82);
        break;
      case 'zout':
        cam.zoom(1.2);
        break;
      case 'fish': {
        const list = this.fish.list.filter((f) => f.rec.stage !== 'EGG');
        if (!list.length) return;
        this._photoFish = ((this._photoFish ?? -1) + 1) % list.length;
        const f = list.find((x) => x.rec.favorite && this._photoFish === 0) ?? list[this._photoFish];
        cam.startFollow(f);
        cam.goal.dist = 1.2;
        this.photoSubject = f;
        break;
      }
      case 'keeper':
        cam.mode = 'focus';
        cam.goalTarget.copy(this.character.root.position).setY(this.character.elev + 0.75);
        cam.goal.dist = 1.6;
        this.photoSubject = null;
        break;
      case 'tank':
        cam.goHome();
        this.photoSubject = null;
        break;
      case 'shutter':
        this.takePhoto();
        break;
      default:
        break;
    }
  }

  async takePhoto() {
    const ui = this.ui;
    ui.root.classList.add('photo-hide');
    ui.modeEl.style.visibility = 'hidden';
    this.audio.shutter();
    const raw = await this.renderer.capture();
    ui.modeEl.style.visibility = '';
    ui.flash();
    // shrink for storage
    const img = new Image();
    img.src = raw;
    await img.decode();
    const w = Math.min(1600, img.width), h = Math.round(img.height * (w / img.width));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', 0.88);
    const id = uid('ph');
    this.photoCache.set(id, url);
    await this.saveSys.savePhoto(id, url);
    // was a favourite fish in the shot?
    const cam = this.renderer.camera;
    const favInView = this.fish.list.some((a) => {
      if (!a.rec.favorite) return false;
      const v = a.pos.clone().project(cam);
      return Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z < 1;
    });
    const subject = this.photoSubject?.rec;
    this.state.photos.unshift({ id, time: Date.now(), subject: subject?.name ?? null });
    if (this.state.photos.length > 40) {
      const old = this.state.photos.pop();
      this.saveSys.deletePhoto(old.id);
      this.photoCache.delete(old.id);
    }
    bus.emit('photo:taken', { favorite: favInView || !!subject?.favorite });
    this.notify('Photo saved to Gallery', subject ? `Starring ${subject.name}` : '', 'photo');
    this.save();
  }

  async loadPhoto(id) {
    if (this.photoCache.has(id)) return this.photoCache.get(id);
    const u = await this.saveSys.loadPhoto(id);
    if (u) this.photoCache.set(id, u);
    return u;
  }
  async downloadPhoto(id) {
    const u = await this.loadPhoto(id);
    if (!u) return;
    const a = document.createElement('a');
    a.href = u;
    a.download = `aquaria-${id}.jpg`;
    a.click();
  }
  async deletePhoto(id) {
    this.state.photos = this.state.photos.filter((p) => p.id !== id);
    this.photoCache.delete(id);
    await this.saveSys.deletePhoto(id);
  }

  // ================================================================ events
  notify(title, sub = '', ic = 'sparkle', tone = '') {
    if (this.suppress || !this.ui) return;
    this.ui.toast(title, sub, ic, tone);
  }

  wireEvents() {
    bus.on('fish:born', ({ babies, tank, species, live }) => {
      if (this.suppress) return;
      if (tank === this.activeTank) {
        const mom = this.fish.get(babies[0]?.parents?.mother);
        for (const b of babies) {
          const pos = live && mom ? mom.pos.clone().add(new THREE.Vector3(randRange(-0.05, 0.05), randRange(-0.03, 0.03), randRange(-0.05, 0.05))) : undefined;
          this.fish.addActor(b, this.aquarium.bounds(), pos);
        }
      }
      this.notify(live ? `${babies.length} ${species.name} fry were born!` : `${species.name} laid ${babies.length} eggs!`, tank.type === 'nursery' ? `They're safe in ${tank.name}.` : 'Watch them grow.', live ? 'fish' : 'egg', 'pink');
      for (const b of babies) this.progression.discover(b);
      this.audio.discovery();
    });
    bus.on('fish:hatched', ({ fish }) => {
      if (this.suppress) return;
      this._hatchNote = (this._hatchNote ?? 0) + 1;
      if (this._hatchNote === 1) setTimeout(() => {
        this.notify(this._hatchNote > 1 ? `${this._hatchNote} babies hatched!` : `${fish.name} hatched!`, 'Tiny fry are exploring the plants.', 'egg', 'pink');
        this._hatchNote = 0;
        this.character.celebrate();
      }, 300);
    });
    bus.on('fish:grew', ({ fish, stage }) => {
      if (this.suppress) return;
      if (stage === 'ADULT') return;
      this.notify(`${fish.name} is now a ${stage.toLowerCase()}`, 'Colours are starting to show.', 'sparkle');
    });
    bus.on('fish:adult', ({ fish }) => {
      if (this.suppress) return;
      this.notify(`${fish.name} reached adulthood!`, `${SPECIES_BY_ID[fish.species].name} · ${fish.rarity}`, 'star', 'gold');
      this.progression.discover(fish);
    });
    bus.on('mutation', ({ fish, mutations }) => {
      if (this.suppress) return;
      setTimeout(() => {
        this.notify(`Mutation discovered: ${mutations[0]}!`, `${fish.name} carries something rare (${fish.rarity}).`, 'dna', 'pink');
        this.audio.discovery();
      }, 1200);
    });
    bus.on('plant:bloom', ({ plant }) => this.notify(`${plant.name} is blooming!`, 'A flower opened at the surface.', 'plant', 'pink'));
    bus.on('trick:learned', ({ fish, trick }) => {
      this.notify(`${fish.name} learned ${trick.name}!`, 'Your bond grows stronger.', 'train', 'gold');
      this.audio.reward();
    });
    bus.on('food:decayed', () => {
      const t = this.activeTank;
      t.water.cleanliness = Math.max(0.05, t.water.cleanliness - 0.006);
      t.debris = Math.min(1, (t.debris ?? 0) + 0.004);
    });
    bus.on('fish:ate', ({ fish }) => {
      fish.bond = clamp(fish.bond + 0.003, 0, 1);
      if (Math.random() < 0.15) this.audio.bubble(0.8);
    });
    bus.on('water:rating', ({ rating }) => {
      if (this.suppress) return;
      if (rating === 'POOR' || rating === 'CRITICAL') this.notify(`Water quality ${rating.toLowerCase()}`, 'Try a water change in Care.', 'water');
    });
    bus.on('level:up', () => {
      this.character.celebrate();
      this.renderPortrait();
      // gift: the nursery tank when breeding unlocks
      const s = this.state;
      if (this.progression.feature('nursery') && !s.inbox.find((m) => m.id === 'nurseryGift')) {
        s.inbox.unshift({ id: 'nurseryGift', title: 'Breeding unlocked!', body: 'Pair compatible adults from the fish card. Babies grow best in a Nursery Tank (Tank → Add an Aquarium).', reward: { coins: 1200, pearls: 5 }, claimed: false, time: Date.now() });
      }
    });
    bus.on('achievement', () => this.character.celebrate());
  }

  dynamicEvents(dt) {
    if (this.mode === 'intro') return;
    this.eventTimer -= dt;
    // gentle hunger reminder
    this._hungerT = (this._hungerT ?? 0) + dt;
    if (this._hungerT > 45) {
      this._hungerT = 0;
      const hungry = this.activeTank.fish.filter((f) => f.stage !== 'EGG' && f.hunger > 0.8);
      if (hungry.length) this.notify(`${hungry[0].name}${hungry.length > 1 ? ` and ${hungry.length - 1} more` : ''} look hungry`, 'Tap Feed to call your keeper.', 'feed');
    }
    if (this.eventTimer > 0) return;
    this.eventTimer = randRange(90, 200);
    const roll = Math.random();
    const actors = this.fish.list.filter((a) => a.rec.stage !== 'EGG');
    if (!actors.length) return;
    if (roll < 0.35) {
      const sp = this.fish.startSchoolPattern();
      if (sp) this.notify('The school is forming a pattern', `Your ${SPECIES_BY_ID[sp].name}s swim in a shimmering loop.`, 'fish');
    } else if (roll < 0.7) {
      const a = actors.find((x) => x.sp.behavior.kind === 'bottom') ?? pick(actors);
      const pearl = Math.random() < 0.15;
      const coins = 20 + Math.floor(Math.random() * 50);
      this.progression.give(pearl ? { pearls: 1 } : { coins }, 'found');
      this.aquarium.spawnBubble(a.pos.x - this.aquarium.center.x, a.pos.y - CAB_H, a.pos.z - this.aquarium.center.z, 0.012);
      this.notify(`${a.rec.name} found ${pearl ? 'a shiny pearl' : 'a lost coin'} in the gravel!`, pearl ? '+1 pearl' : `+${coins} coins`, pearl ? 'pearl' : 'coin', 'gold');
    } else {
      const learned = actors.filter((a) => Object.values(a.rec.tricks).some((v) => v >= 1));
      if (learned.length) {
        const a = pick(learned);
        const trick = Object.entries(a.rec.tricks).find(([, v]) => v >= 1)[0];
        this.fish.startTrick(a.rec.id, trick, { x: this.character.pos.x });
        this.notify(`${a.rec.name} is showing off`, 'Practising a trick all by itself.', 'train');
      } else if (this.cat.state !== 'watch') {
        this.cat.goTo(this.aquarium.center.x + randRange(-0.6, 0.6), this.room.cabinetFront + 0.25, 'watch', 15, Math.PI);
      }
    }
  }

  // ================================================================ intro
  playIntro(first = false) {
    this.ui.close();
    this.ui.hideFishCard();
    this.mode = 'intro';
    this.ui.root.classList.add('hidden');
    this.introLight = 0;
    this.timeOfDay = 0.25;
    this.state.settings.timeMode = this.state.settings.timeMode ?? 'cycle';
    const title = document.getElementById('title-card');
    const skip = document.createElement('button');
    skip.className = 'btn';
    skip.style.cssText = 'position:absolute;right:20px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:60';
    skip.textContent = 'Skip';
    document.getElementById('app').appendChild(skip);
    // keeper walks in from the side
    const c = this.character;
    const [sx, sz] = this.nav.nearestFree(this.room.bounds.minX + 1.2, 2.2);
    c.pos.set(sx, 0, sz);
    c.interrupt([c.walkTo(this.aquarium.center.x - 0.4, this.room.cabinetFront + 0.6, { faceTo: [this.aquarium.center.x, this.aquarium.center.z] }), c.play('wave', 1.6, { expr: 'joy' })]);
    const timers = [];
    timers.push(setTimeout(() => {
      // aquarium lights power up
      const t0 = performance.now();
      const ramp = () => {
        const u = (performance.now() - t0) / 1500;
        this.introLight = Math.min(1, u * u + Math.random() * 0.15 * (u < 0.6 ? 1 : 0));
        if (u < 1 && this.mode === 'intro') requestAnimationFrame(ramp);
        else this.introLight = undefined;
      };
      ramp();
      this.audio.tone(220, 0.8, { vol: 0.05, slide: 2 });
    }, 3500));
    timers.push(setTimeout(() => title.classList.add('show'), 5600));
    timers.push(setTimeout(() => title.classList.remove('show'), 9200));
    const finish = () => {
      timers.forEach(clearTimeout);
      title.classList.remove('show');
      skip.remove();
      this.introLight = undefined;
      this.mode = 'normal';
      this.ui.root.classList.remove('hidden');
      this.state.tutorial.introSeen = true;
      this.renderPortrait();
      if (!this.state.tutorial.done) setTimeout(() => this.ui.tutorial.start(), 600);
    };
    skip.addEventListener('click', () => this.camera.skipIntro());
    this.camera.startIntro(() => setTimeout(finish, 600));
  }

  start() {
    this.ui.show();
    this.renderPortrait();
    if (!this.state.tutorial.introSeen) {
      this.playIntro(true);
    } else {
      if (!this.state.tutorial.done) setTimeout(() => this.ui.tutorial.start(), 800);
      const o = this.offlineSummary;
      if (o && o.seconds > 120) {
        const lines = [];
        if (o.hatched) lines.push(`${o.hatched} eggs hatched`);
        if (o.grew - o.hatched > 0) lines.push(`${o.grew - o.hatched} fish grew up a stage`);
        if (o.plants > 0.05) lines.push('Your plants grew taller');
        lines.push('Your fish are happy to see you');
        this.ui.modal(`<h2>Welcome back!</h2><p>You were away for ${formatDuration(o.seconds)}.</p>
          <div style="text-align:left">${lines.map((l) => `<div class="list-item">${l}</div>`).join('')}</div><button class="btn primary" data-act="modal-close">Say hello</button>`);
      }
    }
  }

  // ================================================================= save
  async save(manual = false) {
    if (!this.state) return;
    this.state.time.dayTime = this.timeOfDay;
    this.state.lastTick = Date.now();
    await this.saveSys.save(this.state);
    if (manual) this.notify('Game saved', '', 'check', 'green');
  }

  async resetSave() {
    this._resetting = true;
    this.save = async () => {};
    await this.saveSys.reset();
    location.reload();
  }
}

function rarityLabel(r) {
  return r.toLowerCase();
}
function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
