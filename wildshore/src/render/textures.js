// Runtime-painted texture library. Natural-material textures (bark, wood grain,
// thatch, foliage cards, coral fans...) are painted procedurally on canvases so
// they stay crisp, tile correctly and cost nothing to download.
import * as THREE from 'three';
import { rng } from '../util/math.js';

const cache = new Map();
let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// periodic value-noise fbm in [0,1], tileable over `period` cells
function makePeriodicNoise(seed, period) {
  const r = rng(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function tileFbm(seed, size, basePeriod, oct = 5) {
  const layers = [];
  for (let o = 0; o < oct; o++) layers.push(makePeriodicNoise(seed + o * 31, basePeriod << o));
  return (px, py) => {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < oct; o++) {
      const p = basePeriod << o;
      s += a * layers[o]((px / size) * p, (py / size) * p);
      n += a; a *= 0.5;
    }
    return s / n;
  };
}

function finish(c, { repeat = true, srgb = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// R: fine grain, G: blotches, B: ripples, A: cellular pebbles  (linear data)
export function detailTexture() {
  return memo('detail', () => {
    const S = 256;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const fine = tileFbm(3, S, 32, 3), blot = tileFbm(7, S, 4, 4), warp = tileFbm(9, S, 4, 2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const w = warp(x, y);
      const rip = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 9 + w * 9 + Math.sin((x / S) * Math.PI * 2 * 2) * 1.5);
      img.data[i] = fine(x, y) * 255;
      img.data[i + 1] = blot(x, y) * 255;
      img.data[i + 2] = rip * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, { srgb: false });
  });
}

// Palm trunk: stacked leaf-scar rings with fibrous grain
export function palmBarkTexture() {
  return memo('palmBark', () => {
    const W = 128, H = 256;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const r = rng(5);
    ctx.fillStyle = '#7d6a55'; ctx.fillRect(0, 0, W, H);
    const n = tileFbm(4, W, 8, 4);
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const ring = (y % 32) / 32;
      const ridge = Math.pow(Math.sin(ring * Math.PI), 0.6);
      const v = 0.55 + 0.45 * n(x, y * 0.5) * ridge + 0.1 * Math.sin(x * 0.9 + y * 0.05);
      const dark = ring < 0.12 ? 0.55 : 1;
      img.data[i] = Math.min(255, 128 * v * dark + 12);
      img.data[i + 1] = Math.min(255, 110 * v * dark + 8);
      img.data[i + 2] = Math.min(255, 88 * v * dark + 6);
    }
    ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = 0.25;
    for (let k = 0; k < 120; k++) {
      ctx.strokeStyle = r() < 0.5 ? '#3d3125' : '#b7a58a';
      ctx.beginPath();
      const x = r() * W, y = r() * H;
      ctx.moveTo(x, y); ctx.lineTo(x + r() * 2 - 1, y + 6 + r() * 14);
      ctx.stroke();
    }
    return finish(c);
  });
}

export function hardwoodBarkTexture() {
  return memo('hardBark', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const n = tileFbm(12, W, 4, 5), m = tileFbm(13, W, 16, 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const furrow = Math.pow(Math.abs(Math.sin((x / W) * Math.PI * 14 + n(x, y) * 7)), 0.5);
      const v = 0.35 + 0.5 * furrow * (0.6 + 0.4 * m(x, y));
      img.data[i] = 105 * v + 20; img.data[i + 1] = 92 * v + 16; img.data[i + 2] = 78 * v + 12; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return finish(c);
  });
}

// Planks / beams: long grain, knots, colour variation
export function woodTexture(tone = 'fresh') {
  return memo('wood_' + tone, () => {
    const W = 256, H = 512;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const n = tileFbm(21, W, 4, 4), f = tileFbm(22, W, 32, 2);
    const base = tone === 'weathered' ? [150, 135, 115] : tone === 'dark' ? [110, 78, 52] : [176, 132, 86];
    const r = rng(77);
    const knots = Array.from({ length: 5 }, () => ({ x: r() * W, y: r() * H, s: 4 + r() * 8 }));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let gx = x + n(x, y * 0.25) * 30;
      for (const k of knots) {
        const dx = x - k.x, dy = (y - k.y) * 0.5;
        const d2 = dx * dx + dy * dy;
        gx += (k.s * 40 * dx) / (d2 + 60);
      }
      const ring = 0.5 + 0.5 * Math.sin(gx * 0.45);
      const fib = f(x, y);
      let v = 0.72 + 0.18 * ring + 0.1 * fib;
      for (const k of knots) {
        const d = Math.hypot(x - k.x, (y - k.y) * 0.6);
        if (d < k.s) v *= 0.55 + 0.45 * (d / k.s);
      }
      img.data[i] = base[0] * v; img.data[i + 1] = base[1] * v; img.data[i + 2] = base[2] * v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return finish(c);
  });
}

// Woven palm thatch for roofs
export function thatchTexture() {
  return memo('thatch', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#6b5a33'; ctx.fillRect(0, 0, W, H);
    const r = rng(31);
    for (let row = 0; row < 12; row++) {
      const y0 = row * 22 - 6;
      for (let k = 0; k < 90; k++) {
        const x = r() * W, len = 26 + r() * 16;
        const g = 0.6 + r() * 0.5;
        const dry = r();
        ctx.strokeStyle = `rgb(${(150 + dry * 60) * g | 0},${(128 + dry * 40) * g | 0},${(66 + dry * 20) * g | 0})`;
        ctx.lineWidth = 1 + r() * 2.2;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + r() * 4 - 2, y0 + len * 0.5, x + r() * 6 - 3, y0 + len); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,22,10,0.35)';
      ctx.fillRect(0, y0 + 20, W, 3);
    }
    // wrap tile vertically
    const t = finish(c);
    return t;
  });
}

export function ropeTexture() {
  return memo('rope', () => {
    const W = 64, H = 64;
    const c = canvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#9c8452'; ctx.fillRect(0, 0, W, H);
    for (let i = -W; i < W * 2; i += 8) {
      ctx.strokeStyle = '#6e5a35'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + W, H); ctx.stroke();
      ctx.strokeStyle = '#c4ac78'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(i + 3, 0); ctx.lineTo(i + 3 + W, H); ctx.stroke();
    }
    return finish(c);
  });
}

export function stoneTexture() {
  return memo('stone', () => {
    const S = 256;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const n = tileFbm(41, S, 8, 5), cr = tileFbm(42, S, 4, 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const crack = Math.abs(cr(x, y) - 0.5) < 0.012 ? 0.6 : 1;
      const v = (0.6 + 0.4 * n(x, y)) * crack;
      img.data[i] = 150 * v; img.data[i + 1] = 146 * v; img.data[i + 2] = 138 * v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return finish(c);
  });
}

// ---------- Foliage cards (alpha-tested) ----------

// Coconut palm frond: central rachis with drooping pinnae
export function palmFrondTexture() {
  return memo('palmFrond', () => {
    const W = 256, H = 512;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const r = rng(101);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const n = 46;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = H * 0.04 + t * H * 0.94;
      const len = W * 0.5 * Math.sin(Math.min(1, 0.12 + t * 1.05) * Math.PI * 0.92) * (0.85 + r() * 0.2);
      for (const side of [-1, 1]) {
        const ang = 0.35 + t * 0.35 + r() * 0.08;
        const ex = cx + side * len * Math.cos(ang * 0.6);
        const ey = y + len * Math.sin(ang) * 0.85;
        const hue = 78 + r() * 16 - t * 6;
        const light = 30 + r() * 12 + (1 - t) * 5;
        ctx.fillStyle = `hsl(${hue},${48 + r() * 12}%,${light}%)`;
        ctx.beginPath();
        ctx.moveTo(cx + side * 2, y - 2);
        ctx.quadraticCurveTo(cx + side * len * 0.55, y + (ey - y) * 0.2 - 5, ex, ey);
        ctx.quadraticCurveTo(cx + side * len * 0.5, y + (ey - y) * 0.35 + 3, cx + side * 2, y + 4);
        ctx.fill();
        // midrib highlight
        ctx.strokeStyle = `hsla(${hue},40%,${light + 14}%,0.5)`;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + side * len * 0.55, y + (ey - y) * 0.25, ex, ey); ctx.stroke();
        // occasional torn / dry tip
        if (r() < 0.18) {
          ctx.fillStyle = 'rgba(160,140,80,0.9)';
          ctx.beginPath(); ctx.arc(ex, ey, 2 + r() * 2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // rachis
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#8a8a3c'); grd.addColorStop(1, '#5d6b2a');
    ctx.strokeStyle = grd; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    return finish(c, { repeat: false });
  });
}

export function fernTexture() {
  return memo('fern', () => {
    const W = 128, H = 256;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const r = rng(202);
    const cx = W / 2;
    for (let i = 0; i < 34; i++) {
      const t = i / 33;
      const y = 6 + t * (H - 10);
      const len = (W * 0.46) * Math.sin(Math.min(1, 0.15 + t) * Math.PI * 0.95);
      for (const side of [-1, 1]) {
        ctx.fillStyle = `hsl(${100 + r() * 16},${50 + r() * 10}%,${24 + r() * 10}%)`;
        // pinna made of small lobes
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const u = s / steps;
          const px = cx + side * (4 + u * len), py = y + u * len * 0.35;
          const rr = (1 - u) * 3.6 + 1.2;
          ctx.beginPath(); ctx.ellipse(px, py, rr * 1.3, rr, side * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.strokeStyle = '#4b5a22'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    return finish(c, { repeat: false });
  });
}

// Big glossy tropical leaf (elephant ear / banana style)
export function broadleafTexture() {
  return memo('broadleaf', () => {
    const W = 256, H = 256;
    const c = canvas(W, H), ctx = c.getContext('2d');
    const cx = W / 2;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#3f7a2c'); g.addColorStop(0.6, '#2c5e22'); g.addColorStop(1, '#244e1c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, 4);
    ctx.bezierCurveTo(W * 1.02, H * 0.2, W * 0.95, H * 0.75, cx, H - 2);
    ctx.bezierCurveTo(W * 0.05, H * 0.75, -W * 0.02, H * 0.2, cx, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,220,140,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx, H - 4); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(170,210,120,0.35)';
    for (let i = 1; i < 12; i++) {
      const y = (i / 12) * H;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + s * W * 0.25, y + 6, cx + s * W * 0.42, y + 26); ctx.stroke();
      }
    }
    return finish(c, { repeat: false });
  });
}

// cluster of small leaves for shrubs / tree canopies
export function leafClusterTexture(kind = 'shrub') {
  return memo('leaves_' + kind, () => {
    const S = 256;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const r = rng(kind === 'shrub' ? 303 : kind === 'canopy' ? 304 : 305);
    const hueBase = kind === 'mangrove' ? 88 : kind === 'canopy' ? 104 : 98;
    for (let i = 0; i < (kind === 'canopy' ? 190 : 140); i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * S * 0.42;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      const ang = a + r() - 0.5;
      const len = (kind === 'canopy' ? 13 : 16) + r() * 10;
      const shade = d / (S * 0.42);
      ctx.fillStyle = `hsl(${hueBase + r() * 20},${44 + r() * 18}%,${18 + (1 - shade) * 14 + r() * 10}%)`;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.ellipse(len * 0.5, 0, len * 0.5, len * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (kind === 'shrub') {
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2, d = r() * S * 0.35;
        const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
        const col = r() < 0.5 ? '#e0473a' : r() < 0.5 ? '#f2a03a' : '#f4f0e6';
        for (let p = 0; p < 5; p++) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(x + Math.cos(p * 1.256) * 4, y + Math.sin(p * 1.256) * 4, 4.5, 2.6, p * 1.256, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#f7d54a'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    return finish(c, { repeat: false });
  });
}

export function seaFanTexture() {
  return memo('seafan', () => {
    const S = 256;
    const c = canvas(S, S), ctx = c.getContext('2d');
    const r = rng(404);
    ctx.strokeStyle = '#b8467a';
    const branch = (x, y, a, len, w, depth) => {
      if (depth > 7 || len < 4) return;
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      branch(ex, ey, a - 0.35 - r() * 0.2, len * 0.8, w * 0.75, depth + 1);
      branch(ex, ey, a + 0.35 + r() * 0.2, len * 0.8, w * 0.75, depth + 1);
    };
    branch(S / 2, S, -Math.PI / 2, 52, 5, 0);
    // lattice web
    ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const a = -Math.PI * (0.1 + r() * 0.8), d = r() * S * 0.48;
      const x = S / 2 + Math.cos(a) * d, y = S + Math.sin(a) * d;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + r() * 12 - 6, y + r() * 12 - 6); ctx.stroke();
    }
    return finish(c, { repeat: false });
  });
}

// Generic icon atlas glyph painter for inventory (returns dataURL)
export function paintIcon(draw, size = 64) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  draw(ctx, size);
  return c.toDataURL();
}

export function loadTexture(url, { srgb = false, repeat = true } = {}) {
  return memo('url_' + url, () => {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    return t;
  });
}
