// Instanced placement of every natural asset, chunked for culling and LOD,
// with a spatial hash used by collision, harvesting and AI queries.
import * as THREE from 'three';
import { rng, noise2, fbm2, smoothstep, clamp } from '../util/math.js';
import { ISLANDS, HOME, terrainHeight, terrainNormal, PONDS } from './islands.js';
import * as F from './flora.js';
import * as P from './props.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();

export class SpatialHash {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); }
  key(x, z) { return (Math.floor(x / this.cell) * 73856093) ^ (Math.floor(z / this.cell) * 19349663); }
  add(o) { const k = this.key(o.x, o.z); let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(o); o._k = k; }
  remove(o) { const a = this.map.get(o._k); if (!a) return; const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); }
  query(x, z, r, out = []) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.map.get((i * 73856093) ^ (j * 19349663));
      if (a) for (const o of a) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (r + (o.r || 0)) ** 2) out.push(o);
    }
    return out;
  }
}

/**
 * A species = variant builders + instances, grouped into chunks.
 */
export class Species {
  constructor(id, mats, variants, { castShadow = true, receiveShadow = true, chunk = 64, lodDist = Infinity, layer = 0 } = {}) {
    this.id = id;
    this.mats = mats;
    this.variants = variants; // array of {parts:{matKey:geometry}, ...}
    this.instances = [];
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.chunk = chunk; // 0 = per island
    this.lodDist = lodDist;
    this.chunks = new Map();
    this.layer = layer;
  }
  add(v, x, y, z, rotY, scale, extra = {}) {
    const inst = { ...extra, species: this, id: this.instances.length, v, x, y, z, rotY, scale, sy: extra.sy || 1, tilt: extra.tilt || null, alive: true };
    this.instances.push(inst);
    return inst;
  }
  chunkKey(inst) {
    if (!this.chunk) return inst.island || 'x';
    return Math.floor(inst.x / this.chunk) + ',' + Math.floor(inst.z / this.chunk);
  }
  matrixOf(inst, out) {
    _p.set(inst.x, inst.y, inst.z);
    if (inst.tilt) _q.setFromUnitVectors(UP, inst.tilt);
    else _q.identity();
    const qy = new THREE.Quaternion().setFromAxisAngle(UP, inst.rotY);
    _q.multiply(qy);
    _s.set(inst.scale, inst.scale * inst.sy, inst.scale);
    if (!inst.alive) _s.set(0, 0, 0);
    return out.compose(_p, _q, _s);
  }
  build(parent) {
    // group instances by chunk + variant
    const groups = new Map();
    for (const inst of this.instances) {
      const k = this.chunkKey(inst) + '|' + inst.v;
      let g = groups.get(k);
      if (!g) groups.set(k, (g = { ck: this.chunkKey(inst), v: inst.v, list: [] }));
      g.list.push(inst);
    }
    for (const g of groups.values()) {
      let chunk = this.chunks.get(g.ck);
      if (!chunk) {
        chunk = { group: new THREE.Group(), center: new THREE.Vector3(), n: 0, meshes: [] };
        chunk.group.name = this.id + ':' + g.ck;
        this.chunks.set(g.ck, chunk);
        parent.add(chunk.group);
      }
      const variant = this.variants[g.v];
      for (const [matKey, geo] of Object.entries(variant.parts)) {
        const mesh = new THREE.InstancedMesh(geo, this.mats[matKey], g.list.length);
        mesh.castShadow = this.castShadow;
        mesh.receiveShadow = this.receiveShadow;
        mesh.layers.set(this.layer);
        const mat = this.mats[matKey];
        if (mat.userData.depthMat) mesh.customDepthMaterial = mat.userData.depthMat;
        g.list.forEach((inst, i) => {
          mesh.setMatrixAt(i, this.matrixOf(inst, _m));
          (inst.slots || (inst.slots = [])).push({ mesh, i });
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        chunk.group.add(mesh);
        chunk.meshes.push(mesh);
      }
      for (const inst of g.list) { chunk.center.x += inst.x; chunk.center.z += inst.z; chunk.n++; }
    }
    for (const c of this.chunks.values()) { c.center.x /= c.n; c.center.z /= c.n; }
  }
  refresh(inst) {
    if (!inst.slots) return;
    this.matrixOf(inst, _m);
    for (const s of inst.slots) { s.mesh.setMatrixAt(s.i, _m); s.mesh.instanceMatrix.needsUpdate = true; }
  }
  setAlive(inst, alive) { inst.alive = alive; this.refresh(inst); }
  updateLOD(cam) {
    if (this.lodDist === Infinity) return;
    const d2 = this.lodDist * this.lodDist;
    for (const c of this.chunks.values()) {
      const dx = c.center.x - cam.x, dz = c.center.z - cam.z;
      c.group.visible = dx * dx + dz * dz < d2;
    }
  }
}

function islandAt(x, z) {
  let best = null, bd = Infinity;
  for (const i of ISLANDS) { const d = Math.hypot(x - i.x, z - i.z) / i.R; if (d < bd) { bd = d; best = i; } }
  return { isl: best, t: bd };
}

function nearPond(x, z, pad = 2) {
  for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r + pad) return true;
  return false;
}

// keep the camp clearing and boat landing open
function reserved(x, z) {
  if (Math.hypot(x - HOME.camp.x, z - HOME.camp.z) < 13) return true;
  if (Math.hypot(x - HOME.spawn.x, z - HOME.spawn.z) < 6) return true;
  return false;
}

export function populateWorld(scene, quality) {
  const R = rng(4242);
  const fm = F.floraMaterials();
  const pm = P.propMaterials();
  const mats = { ...fm, ...pm };
  const grid = new SpatialHash(8);
  const veg = quality.veg;
  const root = new THREE.Group();
  root.name = 'nature';
  scene.add(root);

  const sp = {
    palm: new Species('palm', mats, [0, 1, 2, 3, 4, 5].map((i) => F.buildPalm(100 + i))),
    hardwood: new Species('hardwood', mats, [0, 1, 2, 3].map((i) => F.buildHardwood(200 + i))),
    mangrove: new Species('mangrove', mats, [0, 1, 2].map((i) => F.buildHardwood(300 + i, { scale: 0.75, mangrove: true }))),
    shrub: new Species('shrub', mats, [0, 1, 2, 3].map((i) => F.buildShrub(400 + i)), { chunk: 64, lodDist: 220 }),
    fern: new Species('fern', mats, [0, 1, 2].map((i) => F.buildFern(500 + i)), { chunk: 64, lodDist: 160, castShadow: false }),
    broadleaf: new Species('broadleaf', mats, [0, 1, 2].map((i) => F.buildBroadleaf(600 + i)), { chunk: 64, lodDist: 180 }),
    grass: new Species('grass', mats, [F.buildGrassTuft(700), F.buildGrassTuft(701), F.buildGrassTuft(702, true)], { chunk: 48, lodDist: 110, castShadow: false }),
    rock: new Species('rock', mats, [0, 1, 2, 3].map((i) => P.buildRock(800 + i, 'beach')).concat([0, 1, 2].map((i) => P.buildRock(810 + i, 'jungle')))),
    cliff: new Species('cliff', mats, [0, 1, 2].map((i) => P.buildRock(820 + i, 'cliff')).concat([0, 1, 2].map((i) => P.buildRock(830 + i, 'basalt')))),
    reefRock: new Species('reefRock', mats, [0, 1, 2].map((i) => P.buildRock(840 + i, 'reef')), { castShadow: false }),
    pebbles: new Species('pebbles', mats, [P.buildPebbles(900), P.buildPebbles(901)], { chunk: 64, lodDist: 120, castShadow: false }),
    driftwood: new Species('driftwood', mats, [0, 1, 2, 3].map((i) => P.buildDriftwood(1000 + i))),
    log: new Species('log', mats, [0, 1].map((i) => P.buildDriftwood(1100 + i, true))),
    shells: new Species('shells', mats, [0, 1, 2].map((i) => P.buildShells(1200 + i)), { chunk: 64, lodDist: 100, castShadow: false }),
    fallenFrond: new Species('fallenFrond', mats, [0, 1, 2].map((i) => P.buildFallenFrond(1300 + i)), { chunk: 64, lodDist: 140, castShadow: false }),
    coconutGround: new Species('coconutGround', mats, [{ parts: { coconut: F.coconutGeometry() } }], { chunk: 64, lodDist: 140 }),
    coconut: new Species('coconut', mats, [{ parts: { coconut: F.coconutGeometry() } }], { castShadow: false }),
    brain: new Species('brain', mats, [0, 1, 2, 3, 4].map((i) => P.buildBrainCoral(1400 + i)), { chunk: 64, lodDist: 160, castShadow: false }),
    staghorn: new Species('staghorn', mats, [0, 1, 2, 3].map((i) => P.buildStaghorn(1500 + i)), { chunk: 64, lodDist: 140, castShadow: false }),
    table: new Species('table', mats, [0, 1, 2].map((i) => P.buildTableCoral(1600 + i)), { chunk: 64, lodDist: 160, castShadow: false }),
    fan: new Species('fan', mats, [0, 1, 2].map((i) => P.buildSeaFan(1700 + i)), { chunk: 64, lodDist: 120, castShadow: false }),
    seagrass: new Species('seagrass', mats, [0, 1].map((i) => P.buildSeaGrass(1800 + i)), { chunk: 48, lodDist: 110, castShadow: false }),
    anemone: new Species('anemone', mats, [0, 1, 2].map((i) => P.buildAnemone(1900 + i)), { chunk: 64, lodDist: 90, castShadow: false }),
    urchin: new Species('urchin', mats, [P.buildUrchin(2000), P.buildUrchin(2001)], { chunk: 64, lodDist: 80, castShadow: false }),
    clam: new Species('clam', mats, [P.buildGiantClam()], { chunk: 64, lodDist: 100, castShadow: false }),
  };

  const place = (s, v, x, z, opts = {}) => {
    const y = (opts.y ?? terrainHeight(x, z)) + (opts.dy || 0);
    let tilt = null;
    if (opts.align) {
      terrainNormal(x, z, _n);
      tilt = new THREE.Vector3(0, 1, 0).lerp(_n, opts.align).normalize();
    }
    const inst = s.add(v, x, y, z, opts.rot ?? R() * Math.PI * 2, opts.scale ?? 1, { tilt, sy: opts.sy, island: opts.island, ...(opts.data || {}) });
    if (opts.collide) grid.add({ x, z, r: opts.collide, kind: s.id, inst, solid: true });
    else if (opts.interact) grid.add({ x, z, r: opts.interact, kind: s.id, inst });
    return inst;
  };

  for (const isl of ISLANDS) {
    const area = (isl.R * isl.reef) ** 2 * 4;
    const tries = Math.floor(area / 6 * veg);
    const ri = rng(isl.seed * 991);
    for (let k = 0; k < tries; k++) {
      const a = ri() * Math.PI * 2, d = Math.sqrt(ri()) * isl.R * (isl.reef + 0.15);
      const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
      const h = terrainHeight(x, z);
      if (reserved(x, z) || nearPond(x, z)) continue;
      terrainNormal(x, z, _n);
      const slope = _n.y;
      const n1 = fbm2(x * 0.04 + isl.seed, z * 0.04, 3);
      const roll = ri();
      const opt = { island: isl.id };
      const awayAng = Math.atan2(x - isl.x, z - isl.z); // lean palms toward the sea
      if (h > 0.5) {
        // ---------------- land ----------------
        const beach = h < 2.2;
        const rockyZone = isl.rocky || (isl.id === 'home' && Math.hypot(x - HOME.lookout.x, z - HOME.lookout.z) < HOME.lookout.r * 0.55);
        const eastRocks = isl.id === 'home' && x > 60 && Math.abs(z + 6) < 45;
        if (slope < 0.75 || (rockyZone && roll < 0.05)) {
          if (roll < 0.04) place(sp.cliff, isl.rocky ? 3 + ri.int(0, 2) : ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.6, 1.2), dy: -0.8, collide: 2.8, data: { res: 'stone' } });
          continue;
        }
        if (eastRocks && roll < 0.12) { place(sp.rock, ri.int(0, 3), x, z, { ...opt, scale: ri.range(0.6, 1.6), dy: -0.15, align: 0.6, collide: 1.0, data: { res: 'stone' } }); continue; }
        if (isl.mangrove && h < 1.6) {
          if (roll < 0.22) place(sp.mangrove, ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.8, 1.2), collide: 0.6, data: { res: 'mangrove', hp: 4 } });
          else if (roll < 0.3) place(sp.grass, 2, x, z, { ...opt, scale: ri.range(0.7, 1.2) });
          continue;
        }
        if (beach) {
          const pDens = isl.mangrove ? 0.02 : isl.rocky ? 0.015 : isl.atoll ? 0.09 : 0.06;
          if (roll < pDens) {
            const pal = place(sp.palm, ri.int(0, 5), x, z, { ...opt, rot: awayAng + ri.range(-0.6, 0.6), scale: ri.range(0.85, 1.15), collide: 0.45, data: { res: 'palm', hp: 5 } });
            pal.nutIds = [];
            continue;
          }
          if (roll < pDens + 0.012 && h < 1.6) { place(sp.driftwood, ri.int(0, 3), x, z, { ...opt, interact: 1.2, data: { res: 'driftwood' } }); continue; }
          if (roll < pDens + 0.05 && h < 1.4) { place(sp.shells, ri.int(0, 2), x, z, { ...opt, interact: 0.8, data: { res: 'shells' } }); continue; }
          if (roll < pDens + 0.065) { place(sp.rock, ri.int(0, 3), x, z, { ...opt, scale: ri.range(0.25, 0.6), dy: -0.1, align: 0.5, interact: 0.8, data: { res: 'stone' } }); continue; }
          if (h > 1.4 && roll < pDens + 0.2 && n1 > -0.1) { place(sp.grass, 2, x, z, { ...opt, scale: ri.range(0.8, 1.3) }); continue; }
          if (h > 1.6 && roll < pDens + 0.24) { place(sp.shrub, ri.int(0, 3), x, z, { ...opt, scale: ri.range(0.7, 1.1), interact: 1, data: { res: 'fiber' } }); continue; }
          continue;
        }
        // interior
        const forest = isl.id === 'hunter' ? 0.16 : isl.rocky ? 0.01 : 0.045;
        const palmIn = isl.id === 'hunter' ? 0.02 : isl.rocky ? 0.008 : 0.035;
        if (roll < forest * (0.6 + n1)) { place(sp.hardwood, ri.int(0, 3), x, z, { ...opt, scale: ri.range(0.8, 1.3) * (isl.id === 'hunter' ? 1.25 : 1), collide: 0.6, data: { res: 'hardwood', hp: 7 } }); continue; }
        if (roll < forest + palmIn) { place(sp.palm, ri.int(0, 5), x, z, { ...opt, scale: ri.range(0.9, 1.2), collide: 0.45, data: { res: 'palm', hp: 5 } }); continue; }
        if (rockyZone && roll < 0.25) { place(sp.rock, 4 + ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.5, 1.8), dy: -0.2, align: 0.6, collide: 1.0, data: { res: 'stone' } }); continue; }
        if (roll < 0.11) { place(sp.shrub, ri.int(0, 3), x, z, { ...opt, scale: ri.range(0.8, 1.4), interact: 1, data: { res: 'fiber' } }); continue; }
        if (roll < 0.2 && n1 > -0.2) { place(sp.fern, ri.int(0, 2), x, z, { ...opt, interact: 0.8, data: { res: 'fiber' } }); continue; }
        if (roll < 0.25) { place(sp.broadleaf, ri.int(0, 2), x, z, { ...opt, interact: 0.8, data: { res: 'leaves' } }); continue; }
        if (roll < 0.255) { place(sp.log, ri.int(0, 1), x, z, { ...opt, collide: 0.5, data: { res: 'log' } }); continue; }
        if (roll < 0.27) { place(sp.rock, 4 + ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.3, 0.9), dy: -0.15, align: 0.6, collide: 0.6, data: { res: 'stone' } }); continue; }
        if (roll < 0.28) { place(sp.fallenFrond, ri.int(0, 2), x, z, { ...opt, interact: 1.2, data: { res: 'palmleaf' } }); continue; }
        if (roll < 0.28 + 0.35 * quality.grass) { place(sp.grass, ri.int(0, 1), x, z, { ...opt, scale: ri.range(0.8, 1.4), align: 0.5 }); continue; }
      } else if (h > -0.5) {
        // swash zone
        if (isl.mangrove && roll < 0.12) { place(sp.mangrove, ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.8, 1.2), dy: -0.2, collide: 0.6, data: { res: 'mangrove', hp: 4 } }); continue; }
        if (roll < 0.015) place(sp.rock, ri.int(0, 3), x, z, { ...opt, scale: ri.range(0.3, 0.9), dy: -0.15, align: 0.6, collide: 0.6, data: { res: 'stone' } });
        else if (roll < 0.05) place(sp.shells, ri.int(0, 2), x, z, { ...opt, interact: 0.8, data: { res: 'shells' } });
      } else {
        // ---------------- underwater ----------------
        const shelf = h > -9;
        if (!shelf) { if (roll < 0.004) place(sp.reefRock, ri.int(0, 2), x, z, { ...opt, scale: ri.range(1, 2.5), dy: -0.3 }); continue; }
        const reefZone = isl.atoll ? 1 : isl.id === 'home' ? smoothstep(150, 40, Math.hypot(x - HOME.reef.x, z - HOME.reef.z)) * 0.85 + 0.25 : 0.35;
        const grassBed = fbm2(x * 0.035 + 9, z * 0.035, 3) > 0.15 && h > -6;
        const cd = (0.1 + 0.5 * smoothstep(-0.05, 0.4, n1)) * reefZone * (isl.mangrove ? 0.25 : 1);
        if (grassBed && roll < 0.35) { place(sp.seagrass, ri.int(0, 1), x, z, { ...opt, scale: ri.range(0.8, 1.3) }); continue; }
        let acc = 0;
        if (roll < (acc += cd * 0.12)) { place(sp.brain, ri.int(0, 4), x, z, { ...opt, scale: ri.range(0.7, 1.4), dy: -0.05, align: 0.5, interact: 0.6, data: { res: 'coral' } }); continue; }
        if (roll < (acc += cd * 0.12)) { place(sp.staghorn, ri.int(0, 3), x, z, { ...opt, scale: ri.range(0.8, 1.6), dy: -0.05 }); continue; }
        if (roll < (acc += cd * 0.04)) { place(sp.table, ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.8, 1.4), dy: -0.05 }); continue; }
        if (roll < (acc += cd * 0.06)) { place(sp.fan, ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.8, 1.4) }); continue; }
        if (roll < (acc += cd * 0.05)) { place(sp.anemone, ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.8, 1.6) }); continue; }
        if (roll < (acc += cd * 0.05)) { place(sp.urchin, ri.int(0, 1), x, z, { ...opt, scale: ri.range(0.8, 1.4), interact: 0.6, data: { res: 'urchin' } }); continue; }
        if (roll < (acc += cd * 0.03)) { place(sp.reefRock, ri.int(0, 2), x, z, { ...opt, scale: ri.range(0.4, 1.4), dy: -0.2, align: 0.4 }); continue; }
        if (isl.atoll && roll < acc + 0.006) { place(sp.clam, 0, x, z, { ...opt, scale: ri.range(0.8, 1.3), align: 0.6, interact: 0.8, data: { res: 'clam' } }); continue; }
        if (roll < acc + 0.004) { place(sp.log, ri.int(0, 1), x, z, { ...opt, dy: -0.1 }); continue; }
      }
    }
  }

  // hand-placed set dressing at the home camp & lookout
  const homeOpts = { island: 'home' };
  place(sp.driftwood, 1, HOME.camp.x + 6, HOME.camp.z + 5, { ...homeOpts, rot: 0.4, interact: 1.2, data: { res: 'driftwood' } });
  place(sp.driftwood, 2, HOME.camp.x - 7, HOME.camp.z + 3, { ...homeOpts, rot: 2.1, interact: 1.2, data: { res: 'driftwood' } });
  place(sp.rock, 1, HOME.camp.x + 9, HOME.camp.z - 6, { ...homeOpts, scale: 0.5, dy: -0.1, interact: 0.8, data: { res: 'stone' } });
  place(sp.rock, 2, HOME.camp.x - 4, HOME.camp.z + 9, { ...homeOpts, scale: 0.4, dy: -0.1, interact: 0.8, data: { res: 'stone' } });
  place(sp.fallenFrond, 0, HOME.camp.x + 3, HOME.camp.z - 9, { ...homeOpts, interact: 1.2, data: { res: 'palmleaf' } });
  place(sp.fallenFrond, 1, HOME.camp.x - 9, HOME.camp.z - 4, { ...homeOpts, interact: 1.2, data: { res: 'palmleaf' } });
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + 0.35 + (i / 4) * (Math.PI - 0.7);
    place(sp.palm, i % 6, HOME.camp.x + Math.cos(a) * 15.5, HOME.camp.z + Math.sin(a) * 15.5 - 2, { ...homeOpts, rot: Math.atan2(Math.cos(a), Math.sin(a)) + 0.3, scale: 1, collide: 0.45, data: { res: 'palm', hp: 5 } });
  }

  // coconuts hanging in palm crowns
  for (const p of sp.palm.instances) {
    const variant = sp.palm.variants[p.v];
    p.nutIds = [];
    for (const n of variant.nuts) {
      const local = n.clone().multiplyScalar(p.scale).applyAxisAngle(UP, p.rotY);
      const c = sp.coconut.add(0, p.x + local.x, p.y + local.y, p.z + local.z, R() * 6, p.scale, { island: p.island, palm: p });
      p.nutIds.push(c);
    }
  }
  // fallen coconuts under some palms
  for (const p of sp.palm.instances) {
    if (R() < 0.35) {
      const a = R() * Math.PI * 2, d = 1 + R() * 2;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (terrainHeight(x, z) > 0.4) place(sp.coconutGround, 0, x, z, { island: p.island, dy: 0.1, interact: 0.7, data: { res: 'coconut' } });
    }
  }

  for (const s of Object.values(sp)) s.build(root);
  return { species: sp, grid, root, mats };
}
