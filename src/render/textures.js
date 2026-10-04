// Procedural canvas textures. Everything is generated at startup so the game
// ships without binary art assets; results are cached by key.
import * as THREE from 'three';
import { makeNoise2D, makeRng, clamp, lerp } from '../core/util.js';

const cache = new Map();
let maxAniso = 4;
export function setMaxAnisotropy(v) {
  maxAniso = v;
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(cv, { repeat, srgb = true, aniso = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  if (aniso) t.anisotropy = maxAniso;
  t.generateMipmaps = mips;
  t.needsUpdate = true;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const hex = (c) => {
  const col = new THREE.Color(c);
  return [col.r * 255, col.g * 255, col.b * 255];
};
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
function shade(c, f) {
  const [r, g, b] = hex(c);
  return f >= 0 ? rgb(lerp(r, 255, f), lerp(g, 255, f), lerp(b, 255, f)) : rgb(r * (1 + f), g * (1 + f), b * (1 + f));
}

// --------------------------------------------------------------------- wood
const WOOD_STYLES = {
  oak: { base: '#b98a56', dark: '#8a5e34', light: '#d6aa72', plank: 6 },
  walnut: { base: '#6a4428', dark: '#3e2614', light: '#8a6040', plank: 6 },
  darkwood: { base: '#3a2a20', dark: '#1e1410', light: '#5a4232', plank: 5 },
  cabinet: { base: '#4a2e1c', dark: '#2a180c', light: '#6a4228', plank: 1 },
};
export function woodTexture(style = 'oak', tint) {
  return cached(`wood:${style}:${tint ?? ''}`, () => {
    const s = { ...(WOOD_STYLES[style] ?? WOOD_STYLES.oak) };
    if (tint) {
      s.base = tint;
      s.dark = shade(tint, -0.4);
      s.light = shade(tint, 0.18);
    }
    const W = 1024, H = 1024;
    const cv = canvas(W, H);
    const ctx = cv.getContext('2d');
    const noise = makeNoise2D(style.length * 31 + 7);
    const rng = makeRng(style);
    const img = ctx.createImageData(W, H);
    const base = hex(s.base), dark = hex(s.dark), light = hex(s.light);
    const plankH = H / s.plank;
    for (let y = 0; y < H; y++) {
      const plank = Math.floor(y / plankH);
      const off = (plank * 377) % W;
      const shift = (plank * 0.137) % 1;
      for (let x = 0; x < W; x++) {
        const px = (x + off) % W;
        const grain = noise(px * 0.004, y * 0.09 + plank * 13) * 0.6 + noise(px * 0.02, y * 0.3) * 0.25;
        const ring = Math.sin((y * 0.12 + grain * 9 + shift * 6) * 1.7) * 0.5 + 0.5;
        let t = clamp(grain * 0.9 + ring * 0.25 - 0.1, 0, 1);
        const edge = Math.min(y % plankH, plankH - (y % plankH));
        let ao = edge < 2 ? 0.55 : edge < 5 ? 0.85 : 1;
        const seam = ((px + plank * 211) % 700) < 2 && s.plank > 1 ? 0.6 : 1;
        ao *= seam;
        const v = (plank * 0.071) % 0.12 - 0.06;
        const r = lerp(dark[0], light[0], t) * (1 + v);
        const g = lerp(dark[1], light[1], t) * (1 + v);
        const b = lerp(dark[2], light[2], t) * (1 + v);
        const i = (y * W + x) * 4;
        img.data[i] = r * ao * 0.6 + base[0] * 0.4 * ao;
        img.data[i + 1] = g * ao * 0.6 + base[1] * 0.4 * ao;
        img.data[i + 2] = b * ao * 0.6 + base[2] * 0.4 * ao;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // knots
    for (let k = 0; k < 6; k++) {
      const x = rng() * W, y = rng() * H;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 14);
      g.addColorStop(0, 'rgba(30,15,5,0.5)');
      g.addColorStop(1, 'rgba(30,15,5,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return cv;
  });
}

export function marbleTexture() {
  return cached('marble', () => {
    const W = 1024, cv = canvas(W, W), ctx = cv.getContext('2d');
    const n = makeNoise2D(91);
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const v = n.fbm(x * 0.004, y * 0.004, 5);
      const vein = Math.pow(1 - Math.abs(Math.sin((x * 0.006 + y * 0.003 + v * 6) * 3.0)), 18);
      const tile = (x % 512 < 2 || y % 512 < 2) ? 0.82 : 1;
      const c = (236 - vein * 90 - v * 14) * tile;
      const i = (y * W + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c - 2;
      img.data[i + 2] = c - 6;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  });
}

export function concreteTexture() {
  return cached('concrete', () => {
    const W = 512, cv = canvas(W, W), ctx = cv.getContext('2d');
    const n = makeNoise2D(5);
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const v = n.fbm(x * 0.01, y * 0.01, 5) * 40 + n(x * 0.2, y * 0.2) * 8;
      const c = 130 + v;
      const i = (y * W + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c + 3;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  });
}

export function plasterTexture(color = '#c9b9a6') {
  return cached(`plaster:${color}`, () => {
    const W = 512, cv = canvas(W, W), ctx = cv.getContext('2d');
    const n = makeNoise2D(17);
    const [r, g, b] = hex(color);
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const v = (n.fbm(x * 0.012, y * 0.012, 4) - 0.5) * 0.12 + (n(x * 0.3, y * 0.3) - 0.5) * 0.04;
      const i = (y * W + x) * 4;
      img.data[i] = r * (1 + v);
      img.data[i + 1] = g * (1 + v);
      img.data[i + 2] = b * (1 + v);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  });
}

export function fabricTexture(color = '#d6cfc4', weave = 4) {
  return cached(`fabric:${color}:${weave}`, () => {
    const W = 256, cv = canvas(W, W), ctx = cv.getContext('2d');
    const [r, g, b] = hex(color);
    const n = makeNoise2D(3);
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const wv = (Math.sin(x * Math.PI * 2 / weave) * Math.sin(y * Math.PI * 2 / weave)) * 0.05;
      const v = wv + (n(x * 0.08, y * 0.08) - 0.5) * 0.1;
      const i = (y * W + x) * 4;
      img.data[i] = r * (1 + v);
      img.data[i + 1] = g * (1 + v);
      img.data[i + 2] = b * (1 + v);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  });
}

export function rugTexture(color = '#d9cdb8', style = 'shag') {
  return cached(`rug:${color}:${style}`, () => {
    const W = 512, cv = canvas(W, W), ctx = cv.getContext('2d');
    const [r, g, b] = hex(color);
    const n = makeNoise2D(29);
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      let v = (n(x * 0.5, y * 0.5) - 0.5) * 0.35 + (n.fbm(x * 0.02, y * 0.02, 3) - 0.5) * 0.15;
      if (style === 'wave') v += Math.sin(y * 0.05 + Math.sin(x * 0.02) * 3) * 0.12;
      if (style === 'kilim') v += (Math.abs(((x + y) % 64) - 32) < 4 || Math.abs(((x - y + 2048) % 64) - 32) < 4) ? -0.25 : 0;
      const edge = Math.min(x, y, W - x, W - y);
      if (edge < 14) v -= 0.18;
      const i = (y * W + x) * 4;
      img.data[i] = r * (1 + v);
      img.data[i + 1] = g * (1 + v);
      img.data[i + 2] = b * (1 + v);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  });
}

// ------------------------------------------------------------- substrate
export function gravelTexture(sub) {
  return cached(`gravel:${sub.id}`, () => {
    const W = 1024, cv = canvas(W, W), ctx = cv.getContext('2d');
    const rng = makeRng(sub.id);
    ctx.fillStyle = sub.colors[1];
    ctx.fillRect(0, 0, W, W);
    const size = sub.grain * 3.2;
    const count = Math.floor((W * W) / (size * size) * 1.6);
    for (let i = 0; i < count; i++) {
      const x = rng() * W, y = rng() * W;
      const rx = size * (0.5 + rng() * 0.8), ry = rx * (0.6 + rng() * 0.4);
      const col = sub.colors[Math.floor(rng() * sub.colors.length)];
      const a = rng() * Math.PI;
      for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, W], [0, -W]]) {
        if (x + ox < -20 || x + ox > W + 20 || y + oy < -20 || y + oy > W + 20) continue;
        const g = ctx.createRadialGradient(x + ox - rx * 0.3, y + oy - ry * 0.3, 0, x + ox, y + oy, rx * 1.1);
        g.addColorStop(0, shade(col, 0.25));
        g.addColorStop(0.6, col);
        g.addColorStop(1, shade(col, -0.45));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return cv;
  });
}

// ---------------------------------------------------------- aquarium backdrop
export function aquariumBackground(id) {
  return cached(`bg:${id}`, () => {
    const W = 1024, H = 512, cv = canvas(W, H), ctx = cv.getContext('2d');
    const rng = makeRng(id);
    const n = makeNoise2D(id.length * 13);
    let g = ctx.createLinearGradient(0, 0, 0, H);
    if (id === 'black') {
      g.addColorStop(0, '#05080c');
      g.addColorStop(1, '#020304');
    } else if (id === 'frost') {
      g.addColorStop(0, '#e8f4fa');
      g.addColorStop(0.6, '#bcd8e6');
      g.addColorStop(1, '#8ab0c4');
    } else {
      g.addColorStop(0, '#2fa6d8');
      g.addColorStop(0.45, '#0e5f95');
      g.addColorStop(1, '#062a48');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (id === 'deepblue' || id === 'jungle' || id === 'cliffs') {
      // god rays
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const x = rng() * W;
        const w = 30 + rng() * 90;
        const gr = ctx.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, 'rgba(160,230,255,0.22)');
        gr.addColorStop(1, 'rgba(160,230,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + w, 0);
        ctx.lineTo(x + w * 2.2 + 60, H);
        ctx.lineTo(x + 40, H);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (id === 'jungle') {
      for (let layer = 0; layer < 3; layer++) {
        const col = ['rgba(10,60,70,0.55)', 'rgba(8,48,52,0.7)', 'rgba(6,34,36,0.85)'][layer];
        ctx.fillStyle = col;
        for (let i = 0; i < 40; i++) {
          const x = rng() * W, h = H * (0.25 + rng() * 0.45) * (1 - layer * 0.18);
          ctx.beginPath();
          ctx.moveTo(x, H);
          const sway = (rng() - 0.5) * 60;
          ctx.quadraticCurveTo(x + sway, H - h * 0.6, x + sway * 1.3, H - h);
          ctx.quadraticCurveTo(x + sway + 12, H - h * 0.5, x + 10 + rng() * 10, H);
          ctx.fill();
        }
      }
    }
    if (id === 'cliffs') {
      for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = ['rgba(30,70,95,0.6)', 'rgba(22,52,72,0.8)', 'rgba(15,35,50,0.95)'][layer];
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) {
          const y = H * (0.35 + layer * 0.15) + n.fbm(x * 0.006 + layer * 10, layer, 4) * 160 - 60;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.fill();
      }
    }
    if (id === 'deepblue') {
      ctx.fillStyle = 'rgba(4,30,50,0.6)';
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * 0.72 + n.fbm(x * 0.005, 3, 4) * 120 - 40);
      ctx.lineTo(W, H);
      ctx.fill();
    }
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, id === 'frost' ? 'rgba(80,110,130,0.25)' : 'rgba(0,0,0,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    return cv;
  });
}

// -------------------------------------------------------------- window view
const PHASE_SKY = {
  morning: ['#9ec4e8', '#f4c6a8', '#ffe2c0'],
  day: ['#5a9ee0', '#9fcaf0', '#d8ecfa'],
  sunset: ['#3a3a78', '#d86a7a', '#ffb070'],
  night: ['#060a1c', '#0e1836', '#1c2a50'],
};
export function windowView(view, phase) {
  return cached(`view:${view}:${phase}`, () => {
    const W = 1024, H = 512, cv = canvas(W, H), ctx = cv.getContext('2d');
    const rng = makeRng(`${view}`);
    const n = makeNoise2D(view.length * 7 + 3);
    const sky = PHASE_SKY[phase];
    const night = phase === 'night';
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, sky[0]);
    g.addColorStop(0.65, sky[1]);
    g.addColorStop(1, sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // sun / moon
    const sunX = phase === 'morning' ? W * 0.2 : phase === 'day' ? W * 0.55 : phase === 'sunset' ? W * 0.72 : W * 0.3;
    const sunY = phase === 'day' ? H * 0.12 : phase === 'night' ? H * 0.16 : H * 0.42;
    const sg = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, night ? 70 : 160);
    sg.addColorStop(0, night ? 'rgba(255,250,235,1)' : 'rgba(255,250,230,1)');
    sg.addColorStop(night ? 0.18 : 0.12, night ? 'rgba(240,240,225,0.95)' : 'rgba(255,240,200,0.9)');
    sg.addColorStop(0.25, night ? 'rgba(160,180,255,0.15)' : 'rgba(255,220,170,0.35)');
    sg.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 160, 0, Math.PI * 2);
    ctx.fill();
    if (night) {
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.6})`;
        ctx.fillRect(rng() * W, rng() * H * 0.45, 1.2, 1.2);
      }
    }
    // clouds
    for (let i = 0; i < 9; i++) {
      const cx = rng() * W, cy = H * (0.08 + rng() * 0.25), cw = 80 + rng() * 160;
      const col = night ? 'rgba(60,70,110,0.25)' : phase === 'sunset' ? 'rgba(255,170,150,0.35)' : 'rgba(255,255,255,0.4)';
      for (let k = 0; k < 6; k++) {
        const gg = ctx.createRadialGradient(cx + k * cw * 0.15, cy + Math.sin(k) * 6, 0, cx + k * cw * 0.15, cy, cw * 0.35);
        gg.addColorStop(0, col);
        gg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(cx - cw, cy - cw, cw * 3, cw * 2);
      }
    }
    const tone = (base, f) => {
      const [r, gg, b] = hex(base);
      const k = night ? 0.25 : phase === 'sunset' ? 0.65 : phase === 'morning' ? 0.85 : 1;
      const tint = phase === 'sunset' ? [1.1, 0.85, 0.9] : night ? [0.7, 0.8, 1.3] : phase === 'morning' ? [1.05, 0.95, 0.95] : [1, 1, 1];
      return rgb(r * k * tint[0] * f, gg * k * tint[1] * f, b * k * tint[2] * f);
    };
    const horizon = H * 0.62;
    const mountains = view === 'mountains' || view === 'city' || view === 'forest' || view === 'harbor';
    if (mountains) {
      for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = tone(['#8aa0c0', '#6a7fa0', '#4a5a78'][layer], 1);
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 6) {
          const y = horizon - 40 - (2 - layer) * 30 - n.fbm(x * 0.004 + layer * 3.3, layer * 2, 5) * (view === 'mountains' ? 200 : 110) + 40;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.fill();
      }
    }
    if (view === 'forest') {
      for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = tone(['#4a6a5a', '#30503e', '#1e3a2a'][layer], 1);
        for (let i = 0; i < 90; i++) {
          const x = rng() * W, h = 40 + rng() * 80 + layer * 30, y = horizon + layer * 30 + 30;
          ctx.beginPath();
          ctx.moveTo(x, y - h);
          ctx.lineTo(x - h * 0.22, y);
          ctx.lineTo(x + h * 0.22, y);
          ctx.fill();
        }
      }
      // mist
      const mg = ctx.createLinearGradient(0, horizon - 20, 0, H);
      mg.addColorStop(0, 'rgba(255,255,255,0)');
      mg.addColorStop(0.5, night ? 'rgba(80,90,120,0.25)' : 'rgba(240,240,240,0.35)');
      mg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(0, horizon - 20, W, H);
    }
    // water body
    if (view === 'mountains' || view === 'harbor' || view === 'ocean' || view === 'city') {
      const wy = view === 'ocean' ? H * 0.55 : horizon + 20;
      const wg = ctx.createLinearGradient(0, wy, 0, H);
      wg.addColorStop(0, tone(view === 'ocean' ? '#3a7ab0' : '#5a7a9a', 1.05));
      wg.addColorStop(1, tone('#1a3050', 1));
      ctx.fillStyle = wg;
      ctx.fillRect(0, wy, W, H - wy);
      // sun glitter
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 260; i++) {
        const x = sunX + (rng() - 0.5) * (60 + rng() * 140), y = wy + rng() * (H - wy);
        ctx.fillStyle = night ? 'rgba(200,210,255,0.25)' : 'rgba(255,230,180,0.35)';
        ctx.fillRect(x, y, 4 + rng() * 14, 1.2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (view === 'city' || view === 'skyline' || view === 'harbor' || view === 'night') {
      const base = view === 'harbor' ? horizon + 10 : view === 'city' ? horizon + 30 : H * 0.9;
      const layers = view === 'skyline' || view === 'night' ? 3 : 2;
      for (let layer = 0; layer < layers; layer++) {
        let x = -10;
        while (x < W) {
          const bw = 18 + rng() * 40 * (layer + 1) * 0.6;
          const bh = (view === 'skyline' || view === 'night' ? 120 + rng() * 260 : 30 + rng() * 90) * (1 - layer * 0.25);
          const top = base - bh;
          ctx.fillStyle = tone(['#5a6680', '#3e4860', '#2a3046'][layer], 1);
          ctx.fillRect(x, top, bw, bh + 60);
          // windows
          const lit = night || phase === 'sunset' ? 0.55 : 0.08;
          for (let wy2 = top + 6; wy2 < base - 4; wy2 += 7) for (let wx = x + 3; wx < x + bw - 3; wx += 6) {
            if (rng() < lit) {
              ctx.fillStyle = night ? `rgba(255,${200 + rng() * 40},${120 + rng() * 60},${0.6 + rng() * 0.4})` : 'rgba(255,240,200,0.5)';
              ctx.fillRect(wx, wy2, 2.5, 3);
            }
          }
          x += bw + 2 + rng() * 6;
        }
      }
      if (night || phase === 'sunset') {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 120; i++) {
          const x = rng() * W, y = base - rng() * 40;
          const r = 2 + rng() * 6;
          const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          gg.addColorStop(0, 'rgba(255,200,120,0.6)');
          gg.addColorStop(1, 'rgba(255,200,120,0)');
          ctx.fillStyle = gg;
          ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (view === 'ocean') {
      ctx.fillStyle = tone('#d8c8a0', 0.9);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * 0.86 + Math.sin(x * 0.01) * 10);
      ctx.lineTo(W, H);
      ctx.fill();
    }
    return cv;
  });
}

// ---------------------------------------------------------------- artwork
export function artworkTexture(style, index) {
  return cached(`art:${style}:${index}`, () => {
    const W = 384, H = 512, cv = canvas(W, H), ctx = cv.getContext('2d');
    const rng = makeRng(`${style}${index}`);
    ctx.fillStyle = style === 'abstract' ? '#1a2a3a' : '#efe8da';
    ctx.fillRect(0, 0, W, H);
    if (style === 'fishprints') {
      // ink-wash fish illustration
      ctx.fillStyle = 'rgba(40,70,110,0.08)';
      for (let i = 0; i < 40; i++) ctx.fillRect(rng() * W, rng() * H, 40 + rng() * 80, 2);
      for (let f = 0; f < 2 + index % 2; f++) {
        const cx = W * (0.35 + rng() * 0.3), cy = H * (0.25 + f * 0.3 + rng() * 0.05), L = 110 + rng() * 60;
        const dir = rng() < 0.5 ? 1 : -1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(dir, 1);
        const gg = ctx.createLinearGradient(0, -L * 0.3, 0, L * 0.3);
        gg.addColorStop(0, 'rgba(30,60,110,0.95)');
        gg.addColorStop(1, 'rgba(90,140,190,0.7)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(L * 0.5, 0);
        ctx.bezierCurveTo(L * 0.3, -L * 0.3, -L * 0.25, -L * 0.25, -L * 0.4, 0);
        ctx.bezierCurveTo(-L * 0.25, L * 0.22, L * 0.3, L * 0.25, L * 0.5, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-L * 0.38, 0);
        ctx.lineTo(-L * 0.7, -L * 0.25);
        ctx.quadraticCurveTo(-L * 0.6, 0, -L * 0.7, L * 0.25);
        ctx.fill();
        ctx.fillStyle = '#f5f0e6';
        ctx.beginPath();
        ctx.arc(L * 0.32, -L * 0.04, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#10203a';
        ctx.beginPath();
        ctx.arc(L * 0.33, -L * 0.04, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(240,240,255,0.25)';
        for (let s = 0; s < 6; s++) {
          ctx.beginPath();
          ctx.arc(L * (0.1 - s * 0.08), 0, L * 0.12, -1, 1);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.fillStyle = '#b03a2a';
      ctx.fillRect(W - 50, H - 70, 22, 30);
    } else if (style === 'waves') {
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = `rgba(30,${80 + i * 8},${140 + i * 6},0.8)`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 6) ctx.lineTo(x, H * 0.2 + i * 26 + Math.sin(x * 0.03 + i) * 14);
        ctx.stroke();
      }
    } else if (style === 'botanical') {
      ctx.strokeStyle = '#3a5a2a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.9);
      ctx.quadraticCurveTo(W * 0.45, H * 0.5, W / 2, H * 0.12);
      ctx.stroke();
      for (let i = 0; i < 9; i++) {
        const y = H * (0.2 + i * 0.075), s = i % 2 ? 1 : -1;
        ctx.fillStyle = `rgba(${60 + i * 6},${110 + i * 5},60,0.9)`;
        ctx.beginPath();
        ctx.ellipse(W / 2 + s * 40, y, 46, 14, s * -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = `hsla(${180 + rng() * 60},70%,${40 + rng() * 30}%,0.6)`;
        ctx.beginPath();
        ctx.arc(rng() * W, rng() * H, 30 + rng() * 120, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return cv;
  });
}

export function posterTexture() {
  return cached('poster', () => {
    const W = 512, H = 320, cv = canvas(W, H), ctx = cv.getContext('2d');
    ctx.fillStyle = '#121418';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8e2d4';
    ctx.font = '700 92px Georgia, serif';
    ctx.fillText('AQUARIUM', 22, 130);
    ctx.font = '700 120px Georgia, serif';
    ctx.fillText('LIFE', 24, 265);
    ctx.strokeStyle = 'rgba(232,226,212,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    return cv;
  });
}

export function bookSpines(seed = 1) {
  return cached(`books:${seed}`, () => {
    const W = 512, H = 256, cv = canvas(W, H), ctx = cv.getContext('2d');
    const rng = makeRng(seed);
    let x = 0;
    const cols = ['#7a2a2a', '#2a4a6a', '#d8c8a0', '#3a5a3a', '#c89a4a', '#5a3a5a', '#e8e0d0', '#1e2a3a', '#a85a3a'];
    while (x < W) {
      const w = 14 + rng() * 26;
      const h = H * (0.7 + rng() * 0.3);
      ctx.fillStyle = cols[Math.floor(rng() * cols.length)];
      ctx.fillRect(x, H - h, w - 1, h);
      ctx.fillStyle = 'rgba(255,230,160,0.55)';
      ctx.fillRect(x + 2, H - h + 14, w - 5, 2);
      ctx.fillRect(x + 2, H - 22, w - 5, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + w - 3, H - h, 2, h);
      x += w;
    }
    return cv;
  });
}

// soft round sprite for particles / bokeh
export function softDot() {
  return cached('softdot', () => {
    const cv = canvas(64, 64), ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return cv;
  });
}

export function lightRayTexture() {
  return cached('ray', () => {
    const cv = canvas(128, 256), ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    const h = ctx.createLinearGradient(0, 0, 128, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)');
    h.addColorStop(0.5, 'rgba(0,0,0,0)');
    h.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 128, 256);
    return cv;
  });
}

export function leafTexture(color = '#3d7a32', style = 'broad') {
  return cached(`leaf:${color}:${style}`, () => {
    const W = 128, H = 256, cv = canvas(W, H), ctx = cv.getContext('2d');
    const [r, g, b] = hex(color);
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, rgb(r * 0.7, g * 0.7, b * 0.7));
    grad.addColorStop(0.5, rgb(Math.min(255, r * 1.25), Math.min(255, g * 1.2), Math.min(255, b * 1.1)));
    grad.addColorStop(1, rgb(r * 0.7, g * 0.7, b * 0.7));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // tip/base gradient
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(255,255,220,0.12)');
    v.addColorStop(1, 'rgba(0,20,0,0.25)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    // midrib and veins
    ctx.strokeStyle = 'rgba(230,255,200,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, H);
    ctx.lineTo(W / 2, 0);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(220,255,190,0.22)';
    for (let y = 10; y < H; y += style === 'fern' ? 10 : 18) {
      ctx.beginPath();
      ctx.moveTo(W / 2, y + 14);
      ctx.quadraticCurveTo(W * 0.3, y + 6, 0, y);
      ctx.moveTo(W / 2, y + 14);
      ctx.quadraticCurveTo(W * 0.7, y + 6, W, y);
      ctx.stroke();
    }
    if (style === 'lotus') {
      const rng = makeRng(7);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = 'rgba(40,10,10,0.35)';
        ctx.beginPath();
        ctx.arc(rng() * W, rng() * H, 3 + rng() * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return cv;
  });
}

export function stoneTexture(style = 'seiryu') {
  return cached(`stone:${style}`, () => {
    const W = 512, cv = canvas(W, W), ctx = cv.getContext('2d');
    const n = makeNoise2D(style.length * 19 + 1);
    const palettes = {
      seiryu: [[70, 74, 78], [120, 124, 128], [200, 205, 210]],
      lava: [[40, 22, 18], [90, 40, 30], [130, 60, 40]],
      dragon: [[90, 70, 50], [140, 110, 80], [60, 45, 30]],
      river: [[110, 105, 100], [150, 145, 138], [90, 85, 80]],
      slate: [[50, 55, 60], [80, 85, 90], [35, 38, 42]],
      holey: [[150, 140, 120], [190, 180, 160], [110, 100, 85]],
      quartz: [[220, 222, 228], [250, 250, 252], [190, 195, 205]],
      mossy: [[70, 72, 66], [110, 112, 100], [60, 100, 40]],
      ceramic: [[150, 90, 60], [180, 110, 75], [120, 70, 45]],
      sandstone: [[180, 160, 120], [210, 190, 150], [140, 120, 90]],
      wood: [[70, 45, 28], [110, 75, 48], [45, 28, 18]],
      mopani: [[110, 70, 40], [60, 35, 20], [150, 100, 60]],
    };
    const p = palettes[style] ?? palettes.seiryu;
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const v = n.fbm(x * 0.01, y * 0.01, 5);
      const d = n(x * 0.08, y * 0.08);
      let c0 = p[0], c1 = p[1];
      let t = clamp(v * 1.3 - 0.15 + (d - 0.5) * 0.3, 0, 1);
      let r = lerp(c0[0], c1[0], t), g = lerp(c0[1], c1[1], t), b = lerp(c0[2], c1[2], t);
      if (style === 'seiryu' || style === 'quartz') {
        const vein = Math.pow(1 - Math.abs(Math.sin((x * 0.02 + v * 8) * 2)), 22);
        r = lerp(r, p[2][0], vein); g = lerp(g, p[2][1], vein); b = lerp(b, p[2][2], vein);
      }
      if (style === 'lava' || style === 'holey') {
        if (d > 0.72) { r *= 0.35; g *= 0.35; b *= 0.35; }
      }
      if (style === 'mossy') {
        const m = clamp((n.fbm(x * 0.02 + 9, y * 0.02, 3) - 0.48) * 4, 0, 1);
        r = lerp(r, p[2][0], m); g = lerp(g, p[2][1], m); b = lerp(b, p[2][2], m);
      }
      if (style === 'wood' || style === 'mopani') {
        const grain = Math.sin(y * 0.15 + v * 12) * 0.5 + 0.5;
        r = lerp(r, p[2][0], grain * 0.5); g = lerp(g, p[2][1], grain * 0.5); b = lerp(b, p[2][2], grain * 0.5);
      }
      if (style === 'slate') {
        const layer = Math.sin(y * 0.25 + v * 3) > 0.85 ? 0.75 : 1;
        r *= layer; g *= layer; b *= layer;
      }
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  });
}

export function noiseBumpTexture(seed = 1, scale = 0.04) {
  return cached(`bump:${seed}:${scale}`, () => {
    const W = 256, cv = canvas(W, W), ctx = cv.getContext('2d');
    const n = makeNoise2D(seed);
    const img = ctx.createImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const v = n.fbm(x * scale, y * scale, 4) * 255;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  });
}
