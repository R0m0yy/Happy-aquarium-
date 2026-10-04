// Procedural fish anatomy. Builds a body tube from the species profile and
// separate fin sheets (tail, dorsal, anal, pelvic, adipose, barbels) that share
// the swim-deformation shader via the aFlex attribute. Geometry is normalised
// so the fish is 1 unit long, nose at +0.5, peduncle at -0.5.
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';

const cache = new Map();

function sampleProfile(pts, t) {
  // monotone-ish cubic interpolation of [t, top, bottom] control points
  if (t <= pts[0][0]) return [pts[0][1], pts[0][2]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0]);
      const p0 = pts[Math.max(0, i - 1)], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cr = (v0, v1, v2, v3) => {
        const k2 = k * k, k3 = k2 * k;
        return 0.5 * (2 * v1 + (-v0 + v2) * k + (2 * v0 - 5 * v1 + 4 * v2 - v3) * k2 + (-v0 + 3 * v1 - 3 * v2 + v3) * k3);
      };
      return [cr(p0[1], a[1], b[1], p3[1]), cr(p0[2], a[2], b[2], p3[2])];
    }
  }
  const l = pts[pts.length - 1];
  return [l[1], l[2]];
}

// Map genetic fin-shape ids onto concrete fin parameters.
export function resolveFins(sp, ph, sex, j) {
  const f = JSON.parse(JSON.stringify(sp.fins));
  const fl = ph.finLength;
  const dim = sp.sexDimorphism;
  const female = sex === 'F' && dim;
  let tailType = f.tail.type;
  switch (ph.fin) {
    case 'veil': tailType = sp.id === 'betta' ? 'veil' : tailType; if (sp.id !== 'betta') { f.dorsal.h *= 1.35; f.anal.h *= 1.35; f.tail.len *= 1.3; } break;
    case 'halfmoon': tailType = 'halfmoon'; break;
    case 'crown': tailType = 'crown'; break;
    case 'plakat': tailType = 'round'; f.tail.len *= 0.5; f.tail.spread *= 0.6; f.dorsal.h *= 0.55; f.anal.h *= 0.55; break;
    case 'doubletail': tailType = 'doubletail'; f.dorsal.from -= 0.12; break;
    case 'fan': tailType = 'fan'; break;
    case 'delta': tailType = 'delta'; break;
    case 'sword': tailType = 'sword'; break;
    case 'lyre': tailType = 'lyre'; f.tail.len *= 1.2; break;
    case 'long': f.tail.len *= 1.35; f.dorsal.h *= 1.5; f.anal.h *= 1.4; if (f.pelvic) f.pelvic.len *= 1.4; break;
    case 'hifin': f.dorsal.h *= 2.2; f.dorsal.shape = 'sail'; break;
    default: break;
  }
  f.tail.type = tailType;
  f.tail.len *= fl;
  f.tail.spread *= 0.8 + fl * 0.2;
  f.dorsal.h *= fl;
  f.anal.h *= fl;
  if (female) {
    f.tail.len *= dim.femaleTail ?? 1;
    f.tail.spread *= Math.sqrt(dim.femaleTail ?? 1);
    f.dorsal.h *= dim.femaleDorsal ?? Math.max(0.6, dim.femaleTail ?? 1);
    f.anal.h *= Math.max(0.6, dim.femaleTail ?? 1);
    if (dim.femaleTail < 0.8 && (tailType === 'veil' || tailType === 'halfmoon' || tailType === 'crown')) f.tail.type = 'round';
  }
  // babies: stubby fins
  const jf = 1 - j * 0.65;
  f.tail.len *= 1 - j * 0.45;
  f.tail.spread *= 1 - j * 0.35;
  f.dorsal.h *= jf;
  f.anal.h *= jf;
  if (f.pelvic) f.pelvic.len *= jf;
  if (f.dorsal2) f.dorsal2.h *= jf;
  return f;
}

function tailTip(type, s, len, spread) {
  const c = 2 * s - 1; // -1 bottom .. 1 top
  const a = Math.abs(c);
  let x, y = c * spread * 0.5;
  switch (type) {
    case 'fork': x = len * (0.38 + 0.62 * Math.pow(a, 0.75)); break;
    case 'fan': x = len * (0.82 + 0.18 * Math.cos(c * 1.3)); y = c * spread * 0.55; break;
    case 'delta': x = len * (0.96 - 0.04 * a); y = c * spread * 0.55; break;
    case 'sword': x = len * (0.75 + (s < 0.22 ? 0.95 * (1 - s / 0.22) : 0) - 0.1 * a); break;
    case 'veil': x = len * (0.75 + 0.25 * Math.sin(s * Math.PI)); y = c * spread * 0.5 - len * 0.32 * (1 - s) * 0.9; break;
    case 'halfmoon': { const phi = c * Math.PI * 0.49; x = len * (0.15 + 0.85 * Math.cos(phi)); y = Math.sin(phi) * spread * 0.62; break; }
    case 'crown': x = len * (0.72 + 0.18 * Math.sin(s * Math.PI) + 0.14 * Math.pow(Math.abs(Math.sin(s * Math.PI * 9)), 6)); y = c * spread * 0.55 - len * 0.12 * (1 - s); break;
    case 'doubletail': x = len * (0.45 + 0.55 * Math.abs(Math.sin(s * Math.PI * 2 + 0.0001)) ** 0.8); y = c * spread * 0.55; break;
    case 'round': x = len * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - c * c * 0.92))); break;
    case 'lyre': x = len * (0.38 + 0.95 * Math.pow(a, 3.2)); y = c * spread * 0.5; break;
    case 'truncate': x = len * (0.88 + 0.12 * a); break;
    case 'lunate': x = len * (0.35 + 0.65 * Math.pow(a, 1.6)); y = c * spread * 0.55; break;
    case 'spade': x = len * (1 - 0.6 * a); y = c * spread * 0.45; break;
    default: x = len; break;
  }
  return [x, y];
}

function heightProfile(shape, s) {
  switch (shape) {
    case 'tri': return Math.max(0.05, 1 - s * 0.95);
    case 'round': return Math.pow(Math.sin(s * Math.PI), 0.7);
    case 'sail': return 0.55 + 0.45 * Math.sin(s * Math.PI * 0.85 + 0.25);
    case 'long': return 0.45 + 0.55 * Math.sin(s * Math.PI * 0.9 + 0.1);
    case 'split': return 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(s * Math.PI * 1.6 + 0.4)), 0.8);
    case 'flag': return 1 - s * 0.35;
    case 'low': return 0.45 + 0.55 * Math.sin(s * Math.PI);
    default: return Math.sin(s * Math.PI);
  }
}

class GeoBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.flex = [];
    this.idx = [];
  }
  vert(x, y, z, u, v, f) {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    this.flex.push(f);
    return this.pos.length / 3 - 1;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  // fin sheet from base(s) and tip(s) functions; uvRegion = [u0,u1]
  sheet(base, tip, nS, nR, flexScale, uvRegion = [0.5, 1], curl = 0, zOff = 0) {
    const start = this.pos.length / 3;
    for (let i = 0; i <= nS; i++) {
      const s = i / nS;
      const b = base(s), t = tip(s);
      for (let k = 0; k <= nR; k++) {
        const r = k / nR;
        const x = lerp(b[0], t[0], r);
        const y = lerp(b[1], t[1], r);
        const z = (b[2] ?? 0) + zOff + curl * Math.sin(r * Math.PI) * 0.02;
        this.vert(x, y, z, lerp(uvRegion[0], uvRegion[1], s), r, r * r * flexScale + r * 0.15);
      }
    }
    for (let i = 0; i < nS; i++) for (let k = 0; k < nR; k++) {
      const a = start + i * (nR + 1) + k;
      const b = a + nR + 1;
      this.idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
}

export function buildFishGeometry(sp, ph, sex = 'M', j = 0) {
  const key = `${sp.id}|${ph.fin}|${ph.finLength.toFixed(2)}|${sex}|${j.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const fins = resolveFins(sp, ph, sex, j);
  const pts = sp.body.pts;
  const female = sex === 'F' && sp.sexDimorphism;
  const bodyMul = female ? sp.sexDimorphism.femaleBody ?? 1 : 1;
  const thick = sp.body.thick;
  const heightAt = (t) => {
    const [top, bot] = sampleProfile(pts, t);
    // babies: big head, slimmer rear
    const head = 1 + j * 0.35 * Math.max(0, 1 - t * 1.6);
    const belly = female ? 1 + (bodyMul - 1) * Math.sin(Math.PI * clamp(t * 1.4 - 0.1, 0, 1)) : 1;
    return [top * head * (1 - j * 0.1 * t), bot * head * belly * (1 - j * 0.1 * t)];
  };
  const widthAt = (t, half) => {
    const wf = t < 0.3 ? 0.75 + t / 0.3 * 0.25 : 1 - (t - 0.3) / 0.7 * 0.55;
    return Math.max(0.006, half * thick * wf * (1 + j * 0.2));
  };
  const mouthOff = sp.mouth === 'up' ? 0.25 : sp.mouth === 'down' ? -0.35 : sp.mouth === 'sucker' ? -0.55 : 0;

  // ---------------------------------------------------------------- body
  const body = new GeoBuilder();
  const N = 34, M = 22;
  const ts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    ts.push(0.012 + 0.988 * Math.pow(u, 1.15));
  }
  const ringStart = [];
  for (let i = 0; i <= N; i++) {
    const t = ts[i];
    const [top, bot] = heightAt(t);
    const mid = (top + bot) / 2 + (t < 0.12 ? mouthOff * (top - bot) * 0.5 * (1 - t / 0.12) : 0);
    const half = (top - bot) / 2;
    const wHalf = widthAt(t, half);
    ringStart.push(body.pos.length / 3);
    for (let k = 0; k < M; k++) {
      const th = (k / M) * Math.PI * 2;
      let cy = Math.cos(th), sz = Math.sin(th);
      // flatter belly for bottom dwellers
      if (sp.behavior.kind === 'bottom' || sp.behavior.kind === 'glass') {
        if (cy < 0) cy *= 0.75 + 0.25 * (1 - Math.abs(sz));
      }
      body.vert(0.5 - t, mid + half * cy, wHalf * sz, t, (Math.cos(th) + 1) / 2, 0);
    }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) {
    const a = ringStart[i] + k, b = ringStart[i] + ((k + 1) % M);
    const c = ringStart[i + 1] + k, d = ringStart[i + 1] + ((k + 1) % M);
    body.idx.push(a, c, b, b, c, d);
  }
  // nose cap
  {
    const [top, bot] = heightAt(0);
    const noseY = (top + bot) / 2 + mouthOff * (heightAt(0.02)[0] - heightAt(0.02)[1]) * 0.5;
    const tip = body.vert(0.5 + 0.006, noseY, 0, 0, 0.5, 0);
    for (let k = 0; k < M; k++) body.idx.push(tip, ringStart[0] + k, ringStart[0] + ((k + 1) % M));
  }
  // tail cap
  {
    const [top, bot] = heightAt(1);
    const tip = body.vert(-0.5 - 0.004, (top + bot) / 2, 0, 1, 0.5, 0);
    for (let k = 0; k < M; k++) body.idx.push(tip, ringStart[N] + ((k + 1) % M), ringStart[N] + k);
  }
  const bodyGeo = body.build();

  // ----------------------------------------------------------------- fins
  const fb = new GeoBuilder();
  const [ptTop, ptBot] = heightAt(1);
  // tail (uv region left half)
  {
    const tl = fins.tail.len, spr = fins.tail.spread;
    const t0 = 0.94;
    const [aTop, aBot] = heightAt(t0);
    fb.sheet(
      (s) => [0.5 - t0 - 0.02 * Math.sin(s * Math.PI), lerp(aBot * 0.85, aTop * 0.85, s), 0],
      (s) => {
        const [x, y] = tailTip(fins.tail.type, s, tl, spr);
        return [-0.5 - x, (ptTop + ptBot) / 2 + y, 0];
      },
      22, 12, fins.tail.type === 'veil' || fins.tail.type === 'halfmoon' || fins.tail.type === 'crown' ? 2.2 : 1.1, [0.0, 0.48]
    );
  }
  const addDorsal = (d, sign, shapeOverride) => {
    if (!d) return;
    const shape = shapeOverride ?? d.shape;
    const h = d.h;
    if (shape === 'angel') {
      const [top0, bot0] = heightAt(d.from);
      const P = [0.5 - d.from - h * d.sweep * 0.9, (sign > 0 ? top0 : bot0) + sign * h, 0];
      fb.sheet(
        (s) => {
          const t = lerp(d.from, d.to, s);
          const [top, bot] = heightAt(t);
          return [0.5 - t, (sign > 0 ? top : bot) * 0.96, 0];
        },
        (s) => {
          const t = lerp(d.from, d.to, s);
          const [top, bot] = heightAt(t);
          const b = [0.5 - t, (sign > 0 ? top : bot) * 0.96];
          const k = Math.pow(1 - s, 0.85);
          return [lerp(b[0], P[0], k) - 0.02 * (1 - k), lerp(b[1], P[1], k) + sign * 0.01, 0];
        },
        14, 10, 1.6
      );
      return;
    }
    fb.sheet(
      (s) => {
        const t = lerp(d.from, d.to, s);
        const [top, bot] = heightAt(t);
        return [0.5 - t, (sign > 0 ? top : bot) * (d.hug ? 0.97 : 0.95), 0];
      },
      (s) => {
        const t = lerp(d.from, d.to, s);
        const [top, bot] = heightAt(t);
        const hp = heightProfile(shape, s) * h;
        const sweep = d.sweep * hp * (shape === 'long' ? 1.3 : 1);
        const droop = shape === 'long' ? hp * 0.25 * s : 0;
        return [0.5 - t - sweep, (sign > 0 ? top : bot) + sign * (hp - droop), 0];
      },
      14, 8, shape === 'long' ? 1.8 : 0.8
    );
  };
  addDorsal(fins.dorsal, 1);
  addDorsal(fins.anal, -1);
  if (fins.dorsal2) addDorsal({ ...fins.dorsal2, shape: 'round', sweep: 0.3 }, 1);
  if (fins.adipose) {
    const t = fins.adipose;
    const [top] = heightAt(t);
    fb.sheet((s) => [0.5 - t + 0.025 - s * 0.05, top * 0.95, 0], (s) => [0.5 - t + 0.02 - s * 0.06, top + 0.025 * Math.sin(s * Math.PI), 0], 4, 3, 0.4);
  }
  // pelvic fins (paired)
  if (fins.pelvic) {
    const p = fins.pelvic;
    const [top, bot] = heightAt(p.at);
    const wHalf = widthAt(p.at, (top - bot) / 2);
    for (const side of [-1, 1]) {
      if (p.thin) {
        fb.sheet(
          (s) => [0.5 - p.at - s * 0.012, bot * 0.92, side * wHalf * 0.4],
          (s) => [0.5 - p.at - p.len * 0.55 - s * 0.01, bot - p.len * 0.85, side * (wHalf * 0.4 + p.len * 0.1)],
          2, 10, 1.6
        );
      } else {
        fb.sheet(
          (s) => [0.5 - p.at - s * 0.04, bot * 0.9, side * wHalf * 0.5],
          (s) => [0.5 - p.at - 0.03 - s * 0.04 - p.len * 0.5, bot - p.len * (0.8 - s * 0.4), side * (wHalf * 0.5 + 0.02)],
          4, 5, 0.6
        );
      }
    }
  }
  // barbels
  if (sp.barbels) {
    const [top, bot] = heightAt(0.03);
    for (const side of [-1, 1]) for (const k of [0, 1]) {
      fb.sheet(
        (s) => [0.48 - k * 0.02, bot * 0.6 + s * 0.006, side * 0.02],
        (s) => [0.5 + 0.02 - k * 0.05, bot - 0.06 + s * 0.006, side * (0.05 + k * 0.02)],
        1, 4, 0.5
      );
    }
  }
  const finGeo = fb.build();

  // ------------------------------------------------------------- pectorals
  const pec = new GeoBuilder();
  const ps = fins.pectoral.size * (1 - j * 0.3);
  pec.sheet((s) => [0, (s - 0.5) * ps * 0.35, 0], (s) => [-ps * (0.85 + 0.15 * Math.sin(s * Math.PI)), (s - 0.5) * ps * 0.9 - ps * 0.1, 0], 6, 5, 0.6);
  const pecGeo = pec.build();
  const pt = 0.24;
  const [pTop, pBot] = heightAt(pt);
  const pecPos = new THREE.Vector3(0.5 - pt, lerp(pBot, pTop, 0.35), widthAt(pt, (pTop - pBot) / 2) * 0.95);

  // ---------------------------------------------------------------- eyes
  const et = sp.eye.t;
  const [eTop, eBot] = heightAt(et);
  const eyeY = lerp(eBot, eTop, sp.eye.v);
  const halfH = (eTop - eBot) / 2;
  const midY = (eTop + eBot) / 2;
  const ny = clamp((eyeY - midY) / halfH, -0.95, 0.95);
  const eyeZ = widthAt(et, halfH) * Math.sqrt(1 - ny * ny) * 0.88;
  const eyeR = (sp.eye.size / 2) * (1 + j * 0.65);

  const out = { bodyGeo, finGeo, pecGeo, pecPos, eye: { pos: new THREE.Vector3(0.5 - et, eyeY, eyeZ), r: eyeR }, fins };
  cache.set(key, out);
  return out;
}
