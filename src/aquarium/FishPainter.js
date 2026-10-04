// Paints per-individual fish textures from the expressed genome.
// Body canvas: x = nose→tail, y = dorsal→belly. Fin canvas: left half is the
// tail, right half the other fins; x = across the fin, y = tip→base.
import * as THREE from 'three';
import { makeNoise2D, makeRng, hashString, clamp } from '../core/util.js';
import { canvas, toTexture } from '../render/textures.js';

const BW = 512, BH = 256, FW = 256, FH = 128;
const hsl = (c, dl = 0, ds = 0, a = 1) => `hsla(${((c.h % 360) + 360) % 360},${clamp(c.s + ds, 0, 100)}%,${clamp(c.l + dl, 0, 100)}%,${a})`;
const noiseA = makeNoise2D(1234);
const noiseB = makeNoise2D(987);

function blob(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + Math.sin(a * 3 + x) * 0.18 + Math.cos(a * 5 + y) * 0.1;
    const px = Math.cos(a) * rx * r, py = Math.sin(a) * ry * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function noisePatches(ctx, seed, color, threshold, scale = 0.012, region = [0, 0, BW, BH]) {
  const img = ctx.getImageData(0, 0, BW, BH);
  const d = img.data;
  const tmp = document.createElement('canvas').getContext('2d');
  tmp.fillStyle = color;
  tmp.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = tmp.getImageData(0, 0, 1, 1).data;
  const n = makeNoise2D(seed);
  for (let y = region[1]; y < region[3]; y += 1) for (let x = region[0]; x < region[2]; x += 1) {
    const v = n.fbm(x * scale, y * scale * 1.6, 3);
    if (v > threshold) {
      const k = clamp((v - threshold) * 14, 0, 1) * (a / 255);
      const i = (y * BW + x) * 4;
      d[i] = d[i] + (r - d[i]) * k;
      d[i + 1] = d[i + 1] + (g - d[i + 1]) * k;
      d[i + 2] = d[i + 2] + (b - d[i + 2]) * k;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function hband(ctx, y0, y1, color, x0 = 0, x1 = BW, soft = 6) {
  const g = ctx.createLinearGradient(0, y0 - soft, 0, y1 + soft);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(soft / (y1 - y0 + soft * 2), color);
  g.addColorStop(1 - soft / (y1 - y0 + soft * 2), color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0 - soft, x1 - x0, y1 - y0 + soft * 2);
}

function vbar(ctx, x, w, color, y0 = 0, y1 = BH, curve = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y0);
  ctx.quadraticCurveTo(x - w / 2 + curve, (y0 + y1) / 2, x - w / 2, y1);
  ctx.lineTo(x + w / 2, y1);
  ctx.quadraticCurveTo(x + w / 2 + curve, (y0 + y1) / 2, x + w / 2, y0);
  ctx.closePath();
  ctx.fill();
}

function dots(ctx, rng, count, color, rMin, rMax, region = [0, 0, BW, BH]) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = region[0] + rng() * (region[2] - region[0]);
    const y = region[1] + rng() * (region[3] - region[1]);
    const r = rMin + rng() * (rMax - rMin);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function baseGradient(ctx, c, belly, dorsalDark = -18) {
  const g = ctx.createLinearGradient(0, 0, 0, BH);
  g.addColorStop(0, hsl(c, dorsalDark, -5));
  g.addColorStop(0.35, hsl(c, 0));
  g.addColorStop(0.62, hsl(c, 6));
  g.addColorStop(1, belly);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BW, BH);
}

// ------------------------------------------------------------------ looks
const LOOKS = {
  solid(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 22, -10));
  },
  koi(ctx, P) {
    baseGradient(ctx, { h: P.p.h, s: 10, l: 90 }, 'hsl(40,20%,96%)', -6);
    noisePatches(ctx, P.seed, hsl(P.p, -4, 5), 0.56, 0.011);
    noisePatches(ctx, P.seed + 9, hsl(P.s, 0, 5), 0.6, 0.013);
  },
  butterfly(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 15));
  },
  marble(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 20));
    noisePatches(ctx, P.seed, hsl(P.s, 0, 0, 0.9), 0.52, 0.016);
    noisePatches(ctx, P.seed + 5, 'rgba(245,240,235,0.85)', 0.62, 0.02);
  },
  dragon(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 10));
    P.scaleBoost = 2.6;
  },
  galaxy(ctx, P) {
    baseGradient(ctx, { h: P.p.h, s: P.p.s * 0.8, l: Math.min(P.p.l, 28) }, hsl({ h: P.p.h, s: 50, l: 30 }), -8);
    dots(ctx, P.rng, 140, hsl(P.s, 15, 10, 0.95), 1.2, 3.5);
    dots(ctx, P.rng, 60, 'rgba(255,255,255,0.9)', 0.8, 2);
  },
  platinum(ctx, P) {
    baseGradient(ctx, { h: P.p.h, s: 12, l: 88 }, 'hsl(200,20%,97%)', -6);
    P.scaleBoost = 1.8;
  },
  mosaic(ctx, P) {
    const g = ctx.createLinearGradient(0, 0, BW, 0);
    g.addColorStop(0, 'hsl(40,10%,72%)');
    g.addColorStop(0.45, 'hsl(40,10%,78%)');
    g.addColorStop(0.75, hsl(P.p, 0));
    g.addColorStop(1, hsl(P.s, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BW, BH);
    noisePatches(ctx, P.seed, hsl(P.s, 0, 5, 0.9), 0.55, 0.02, [BW * 0.4, 0, BW, BH]);
    hband(ctx, 0, BH * 0.18, 'rgba(60,60,60,0.25)');
  },
  tuxedo(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 20));
    const g = ctx.createLinearGradient(BW * 0.45, 0, BW * 0.6, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, hsl({ h: P.s.h, s: 40, l: 14 }, 0, 0, 0.92));
    ctx.fillStyle = g;
    ctx.fillRect(BW * 0.45, 0, BW * 0.55, BH);
  },
  cobra(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 18));
    ctx.strokeStyle = hsl(P.s, -5, 0, 0.85);
    ctx.lineWidth = 4;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      let x = P.rng() * BW, y = P.rng() * BH;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (P.rng() - 0.3) * 30;
        y += (P.rng() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },
  neon(ctx, P) {
    baseGradient(ctx, { h: 60, s: 15, l: 55 }, 'hsl(40,15%,90%)', -25);
    // red lower rear
    const rg = ctx.createLinearGradient(BW * 0.42, 0, BW * 0.55, 0);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, hsl(P.s, 0, 5));
    ctx.fillStyle = rg;
    ctx.fillRect(BW * 0.42, BH * 0.5, BW * 0.5, BH * 0.36);
    // electric stripe
    const end = P.pattern === 'longstripe' ? BW * 0.96 : BW * 0.8;
    hband(ctx, BH * 0.36, BH * 0.5, hsl(P.p, 8, 10), BW * 0.1, end, 5);
    hband(ctx, BH * 0.4, BH * 0.46, hsl(P.p, 25, 10), BW * 0.12, end * 0.98, 3);
    P.glowStripe = [BH * 0.36, BH * 0.5, BW * 0.1, end];
  },
  cardinal(ctx, P) {
    baseGradient(ctx, { h: 60, s: 10, l: 50 }, 'hsl(40,15%,90%)', -25);
    ctx.fillStyle = hsl(P.s, 2, 5);
    ctx.fillRect(BW * 0.06, BH * 0.5, BW * 0.92, BH * 0.38);
    hband(ctx, BH * 0.34, BH * 0.5, hsl(P.p, 8, 10), BW * 0.1, BW * 0.97, 5);
    hband(ctx, BH * 0.39, BH * 0.46, hsl(P.p, 25, 10), BW * 0.12, BW * 0.95, 3);
    P.glowStripe = [BH * 0.34, BH * 0.5, BW * 0.1, BW * 0.97];
  },
  gold(ctx, P) {
    baseGradient(ctx, { h: 45, s: 85, l: 60 }, 'hsl(45,60%,88%)');
    hband(ctx, BH * 0.38, BH * 0.48, 'hsla(50,100%,80%,0.8)', BW * 0.1, BW * 0.85, 4);
  },
  dalmatian(ctx, P) {
    baseGradient(ctx, { h: 40, s: 10, l: 92 }, 'hsl(40,10%,97%)', -6);
    dots(ctx, P.rng, 70, 'rgba(15,15,18,0.92)', 3, 9);
  },
  lyre(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 15));
  },
  mickey(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 18));
    const x = BW * 0.94, y = BH * 0.5;
    ctx.fillStyle = 'rgba(12,12,14,0.95)';
    for (const [dx, dy, r] of [[0, 0, 22], [-14, -26, 13], [-14, 26, 13]]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  sunset(ctx, P) {
    const g = ctx.createLinearGradient(0, 0, BW, 0);
    g.addColorStop(0, 'hsl(48,95%,58%)');
    g.addColorStop(0.6, 'hsl(18,95%,52%)');
    g.addColorStop(1, 'hsl(355,85%,45%)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BW, BH);
    hband(ctx, BH * 0.7, BH, 'rgba(255,240,200,0.4)');
  },
  zebra(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 10), -8);
    const bar = hsl({ h: P.s.h, s: P.s.s, l: Math.min(P.s.l, 18) }, 0, 0, 0.92);
    vbar(ctx, BW * 0.12, BW * 0.05, bar, 0, BH, -8);
    vbar(ctx, BW * 0.36, BW * 0.09, bar, 0, BH, -16);
    vbar(ctx, BW * 0.62, BW * 0.07, bar, 0, BH, -12);
    vbar(ctx, BW * 0.88, BW * 0.05, bar, 0, BH, -6);
  },
  striated(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 10), -6);
    ctx.strokeStyle = hsl(P.s, 0, 5, 0.85);
    ctx.lineWidth = 5;
    for (let y = 8; y < BH; y += 16) {
      ctx.beginPath();
      for (let x = 0; x <= BW; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.04 + y) * 6 + noiseA(x * 0.05, y) * 8);
      ctx.stroke();
    }
    for (let i = 0; i < 9; i++) vbar(ctx, BW * (0.1 + i * 0.1), 6, 'rgba(30,20,10,0.18)');
  },
  pigeon(ctx, P) {
    baseGradient(ctx, { h: 30, s: 30, l: 88 }, 'hsl(30,30%,94%)', -6);
    noisePatches(ctx, P.seed, hsl(P.s, 0, 0, 0.85), 0.5, 0.012);
    dots(ctx, P.rng, 220, 'rgba(40,20,10,0.7)', 0.8, 2.2);
  },
  snakeskin(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 10));
    ctx.strokeStyle = hsl(P.s, 0, 0, 0.8);
    ctx.lineWidth = 2.5;
    for (let y = 0; y < BH; y += 9) for (let x = 0; x < BW; x += 14) {
      ctx.beginPath();
      ctx.arc(x + (y % 18 ? 7 : 0), y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  checker(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 10));
    ctx.fillStyle = hsl(P.s, 0, 0, 0.85);
    for (let y = 0; y < BH; y += 20) for (let x = 0; x < BW; x += 20) if (((x + y) / 20) % 2 === 0) ctx.fillRect(x + 3, y + 3, 14, 14);
  },
  peppered(ctx, P) {
    baseGradient(ctx, P.p, 'hsl(40,20%,92%)', -15);
    noisePatches(ctx, P.seed, hsl(P.s, 0, 0, 0.9), 0.56, 0.03, [0, 0, BW, BH * 0.75]);
    dots(ctx, P.rng, 80, hsl(P.s, -5, 0, 0.8), 1.5, 4, [0, 0, BW, BH * 0.7]);
    hband(ctx, BH * 0.45, BH * 0.5, 'rgba(255,255,255,0.15)');
  },
  panda(ctx, P) {
    baseGradient(ctx, { h: 40, s: 15, l: 90 }, 'hsl(40,15%,96%)', -8);
    ctx.fillStyle = 'rgba(15,15,18,0.95)';
    blob(ctx, BW * 0.12, BH * 0.3, 26, 40, 'rgba(15,15,18,0.95)');
    blob(ctx, BW * 0.35, BH * 0.1, 40, 26, 'rgba(15,15,18,0.95)');
    blob(ctx, BW * 0.95, BH * 0.5, 22, 38, 'rgba(15,15,18,0.95)');
  },
  albino(ctx, P) {
    baseGradient(ctx, { h: 20, s: 45, l: 85 }, 'hsl(20,50%,92%)', -6);
  },
  bronze(ctx, P) {
    baseGradient(ctx, { h: 80, s: 35, l: 40 }, 'hsl(40,30%,80%)', -12);
    P.scaleBoost = 1.6;
  },
  spotted(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 10), -8);
    dots(ctx, P.rng, 160, hsl(P.s, 0, 0, 0.9), 1.5, 3.5);
  },
  calico(ctx, P) {
    baseGradient(ctx, { h: 35, s: 80, l: 60 }, 'hsl(35,40%,90%)');
    noisePatches(ctx, P.seed, 'rgba(15,12,10,0.9)', 0.56, 0.02);
    noisePatches(ctx, P.seed + 3, 'rgba(250,245,235,0.9)', 0.62, 0.02);
  },
  pearl(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 20));
    const throat = ctx.createRadialGradient(BW * 0.12, BH * 0.85, 5, BW * 0.2, BH, BW * 0.35);
    throat.addColorStop(0, hsl(P.s, 0, 0, P.pattern === 'redthroat' ? 0.95 : 0.6));
    throat.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = throat;
    ctx.fillRect(0, BH * 0.4, BW * 0.6, BH * 0.6);
    dots(ctx, P.rng, 380, 'rgba(255,250,240,0.85)', 1.2, 2.6, [BW * 0.08, BH * 0.05, BW, BH * 0.9]);
    ctx.strokeStyle = 'rgba(20,15,10,0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = BW * 0.08; x < BW * 0.92; x += 6) ctx.lineTo(x, BH * 0.55 + Math.sin(x * 0.07) * 3);
    ctx.stroke();
  },
  moonlight(ctx, P) {
    baseGradient(ctx, { h: 200, s: 10, l: 82 }, 'hsl(200,15%,94%)', -8);
    P.scaleBoost = 1.8;
  },
  redthroat(ctx, P) {
    LOOKS.pearl(ctx, P);
  },
  split(ctx, P) {
    const g = ctx.createLinearGradient(BW * 0.1, 0, BW * 0.9, BH);
    g.addColorStop(0, hsl(P.p, -5));
    g.addColorStop(0.45, hsl(P.p, 10));
    g.addColorStop(0.62, hsl(P.s, 0));
    g.addColorStop(1, hsl(P.s, -6));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BW, BH);
    for (let i = 0; i < 4; i++) vbar(ctx, BW * (0.4 + i * 0.06), 7, 'rgba(15,15,30,0.35)', BH * 0.15, BH * 0.8);
    hband(ctx, BH * 0.75, BH, 'rgba(255,250,240,0.35)');
  },
  clown(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 6), -6);
    const white = 'rgba(252,252,250,1)';
    const edge = 'rgba(10,10,12,0.95)';
    const bands = P.pattern === 'snowflake' ? [[0.17, 0.12], [0.5, 0.16], [0.86, 0.08]] : [[0.17, 0.07], [0.5, 0.1], [0.88, 0.05]];
    for (const [x, w] of bands) {
      vbar(ctx, BW * x, BW * w + 10, edge, 0, BH, x === 0.5 ? 10 : -6);
      vbar(ctx, BW * x, BW * w, white, 0, BH, x === 0.5 ? 10 : -6);
    }
    if (P.pattern === 'picasso') {
      noisePatches(ctx, P.seed, white, 0.48, 0.02);
    }
  },
  bluetang(ctx, P) {
    baseGradient(ctx, P.p, hsl(P.p, 10), -10);
    ctx.fillStyle = 'rgba(8,10,25,0.95)';
    ctx.beginPath();
    ctx.moveTo(BW * 0.15, BH * 0.22);
    ctx.bezierCurveTo(BW * 0.4, BH * 0.05, BW * 0.7, BH * 0.1, BW * 0.95, BH * 0.45);
    ctx.bezierCurveTo(BW * 0.7, BH * 0.35, BW * 0.55, BH * 0.4, BW * 0.5, BH * 0.62);
    ctx.bezierCurveTo(BW * 0.4, BH * 0.4, BW * 0.25, BH * 0.4, BW * 0.15, BH * 0.22);
    ctx.fill();
    ctx.fillStyle = hsl(P.s, 0, 0);
    ctx.fillRect(BW * 0.9, BH * 0.35, BW * 0.1, BH * 0.3);
  },
  gramma(ctx, P) {
    const g = ctx.createLinearGradient(BW * 0.4, 0, BW * 0.55, BH * 0.3);
    g.addColorStop(0, hsl(P.p, 0));
    g.addColorStop(1, hsl(P.s, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BW, BH);
    ctx.strokeStyle = 'rgba(10,10,20,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, BH * 0.4);
    ctx.lineTo(BW * 0.18, BH * 0.5);
    ctx.stroke();
    blob(ctx, BW * 0.22, BH * 0.05, 14, 10, 'rgba(10,10,20,0.9)');
  },
  firefish(ctx, P) {
    const g = ctx.createLinearGradient(0, 0, BW, 0);
    g.addColorStop(0, hsl({ h: 50, s: 90, l: 70 }));
    g.addColorStop(0.25, hsl(P.p, 0));
    g.addColorStop(0.6, hsl(P.p, -5));
    g.addColorStop(0.85, hsl(P.s, 5));
    g.addColorStop(1, hsl(P.s, -10));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BW, BH);
  },
  banggai(ctx, P) {
    baseGradient(ctx, P.p, 'hsl(40,10%,94%)', -6);
    const bar = 'rgba(10,10,12,0.95)';
    vbar(ctx, BW * 0.12, BW * 0.06, bar, 0, BH);
    vbar(ctx, BW * 0.36, BW * 0.08, bar, 0, BH);
    vbar(ctx, BW * 0.78, BW * 0.1, bar, BH * 0.2, BH);
    dots(ctx, P.rng, 60, 'rgba(255,255,255,0.95)', 1.5, 3.5, [BW * 0.5, 0, BW, BH]);
  },
};

// ------------------------------------------------------------------ fins
function paintFins(ctx, P, sp) {
  ctx.clearRect(0, 0, FW, FH);
  const half = FW / 2;
  const look = P.pattern;
  // default palette per species family
  let baseC, tipC, alphaBase = 0.85, alphaTip = 0.45;
  const clear = ['neon', 'cardinal', 'longstripe', 'gold', 'peppered', 'panda', 'albino', 'bronze', 'moonlight'].includes(look);
  if (clear) {
    baseC = hsl({ h: 50, s: 20, l: 80 }, 0, 0, 0.3);
    tipC = 'rgba(255,255,255,0.12)';
  } else if (look === 'mosaic' || look === 'tuxedo' || look === 'cobra' || look === 'galaxy') {
    baseC = hsl(P.p, 0, 10, 0.95);
    tipC = hsl(P.s, 0, 10, 0.8);
  } else if (look === 'koi') {
    baseC = hsl(P.s, 5, 5, 0.9);
    tipC = hsl(P.p, 10, 0, 0.7);
  } else if (look === 'clown' || look === 'snowflake' || look === 'picasso') {
    baseC = hsl(P.p, 0, 0, 0.95);
    tipC = 'rgba(15,12,10,0.9)';
  } else if (look === 'bluetang') {
    baseC = hsl(P.p, -10, 0, 0.95);
    tipC = 'rgba(10,10,25,0.95)';
  } else if (look === 'firefish' || look === 'gramma') {
    baseC = hsl(P.s, 0, 0, 0.9);
    tipC = hsl(P.s, -15, 0, 0.8);
  } else {
    baseC = hsl(P.p, 0, 5, 0.9);
    tipC = hsl(P.p, 12, 5, 0.55);
  }
  for (const [x0, w, isTail] of [[0, half, true], [half, half, false]]) {
    const g = ctx.createLinearGradient(0, FH, 0, 0);
    g.addColorStop(0, baseC);
    g.addColorStop(1, tipC);
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, w, FH);
    // species accents
    if (isTail && (look === 'mosaic' || look === 'cobra' || look === 'galaxy')) {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = i % 2 ? hsl(P.s, 5, 10, 0.8) : 'rgba(20,20,30,0.45)';
        ctx.beginPath();
        ctx.arc(x0 + P.rng() * w, P.rng() * FH * 0.8, 2 + P.rng() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (isTail && look === 'bluetang') {
      ctx.fillStyle = hsl(P.s, 0, 0, 0.95);
      ctx.fillRect(x0 + w * 0.2, 0, w * 0.6, FH);
    }
    if (look === 'butterfly') {
      ctx.fillStyle = 'rgba(250,250,255,0.85)';
      ctx.fillRect(x0, 0, w, FH * 0.38);
    }
    if (look === 'koi' || look === 'marble') {
      for (let i = 0; i < 10; i++) blobFin(ctx, x0 + P.rng() * w, P.rng() * FH, 8 + P.rng() * 14, hsl(P.p, 0, 0, 0.6));
    }
    if (look === 'zebra' && !isTail) {
      ctx.fillStyle = 'rgba(15,15,15,0.5)';
      ctx.fillRect(x0 + w * 0.3, 0, w * 0.12, FH);
    }
    if (look === 'banggai') {
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(x0 + P.rng() * w, P.rng() * FH * 0.85, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(10,10,12,0.85)';
      ctx.fillRect(x0, FH * 0.75, w, FH * 0.25);
    }
    if (look === 'firefish' && isTail) {
      ctx.fillStyle = 'rgba(15,10,10,0.7)';
      ctx.fillRect(x0 + w * 0.42, 0, w * 0.16, FH * 0.6);
    }
    // rays
    ctx.strokeStyle = clear ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2;
    const rays = isTail ? 18 : 12;
    for (let i = 0; i <= rays; i++) {
      const x = x0 + (i / rays) * w;
      ctx.beginPath();
      ctx.moveTo(x, FH);
      ctx.lineTo(x + Math.sin(i) * 2, 0);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < rays; i++) {
      const x = x0 + ((i + 0.5) / rays) * w;
      ctx.beginPath();
      ctx.moveTo(x, FH);
      ctx.lineTo(x, 0);
      ctx.stroke();
    }
    // iridescent edge for long-finned fish
    if (!clear && P.finLength > 1.15) {
      ctx.fillStyle = hsl({ h: P.p.h + 30, s: 90, l: 75 }, 0, 0, 0.35);
      ctx.fillRect(x0, 0, w, 6);
    }
  }
  // soft alpha falloff at the tip and edges
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, 0, 0, FH * 0.3);
  fade.addColorStop(0, `rgba(0,0,0,${clear ? 0.75 : 0.45})`);
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, FW, FH * 0.3);
  for (const x0 of [0, half]) {
    for (const [ex, dir] of [[x0, 1], [x0 + half, -1]]) {
      const eg = ctx.createLinearGradient(ex, 0, ex + dir * 8, 0);
      eg.addColorStop(0, 'rgba(0,0,0,0.85)');
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(dir > 0 ? ex : ex - 8, 0, 8, FH);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function blobFin(ctx, x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.7, x, 0, Math.PI * 2);
  ctx.fill();
}

function scales(ctx, P) {
  const boost = P.scaleBoost ?? 1;
  ctx.save();
  ctx.globalAlpha = 0.09 * boost;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  const s = 11;
  for (let y = 0; y < BH + s; y += s * 0.7) for (let x = BW * 0.18; x < BW * 0.98; x += s) {
    const ox = (Math.round(y / (s * 0.7)) % 2) * s * 0.5;
    ctx.beginPath();
    ctx.arc(x + ox, y, s * 0.6, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.07 * boost;
  ctx.strokeStyle = '#000000';
  for (let y = s * 0.35; y < BH + s; y += s * 0.7) for (let x = BW * 0.18; x < BW * 0.98; x += s) {
    const ox = (Math.round(y / (s * 0.7)) % 2) * s * 0.5;
    ctx.beginPath();
    ctx.arc(x + ox + 2, y, s * 0.6, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

function details(ctx, P) {
  // countershading & belly highlight
  const sh = ctx.createLinearGradient(0, 0, 0, BH);
  sh.addColorStop(0, 'rgba(0,0,0,0.22)');
  sh.addColorStop(0.3, 'rgba(0,0,0,0)');
  sh.addColorStop(0.75, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, BW, BH);
  // iridescent sheen along the flank
  const ir = ctx.createLinearGradient(0, BH * 0.3, 0, BH * 0.65);
  ir.addColorStop(0, 'rgba(255,255,255,0)');
  ir.addColorStop(0.5, `hsla(${(P.p.h + 40) % 360},80%,85%,0.13)`);
  ir.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ir;
  ctx.fillRect(0, BH * 0.3, BW, BH * 0.35);
  // gill cover
  ctx.strokeStyle = 'rgba(20,10,10,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(BW * 0.13, BH * 0.52, BH * 0.36, -0.95, 0.95);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(BW * 0.125, BH * 0.52, BH * 0.36, -0.9, 0.9);
  ctx.stroke();
  // head shading & mouth
  const hd = ctx.createLinearGradient(0, 0, BW * 0.12, 0);
  hd.addColorStop(0, 'rgba(0,0,0,0.25)');
  hd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hd;
  ctx.fillRect(0, 0, BW * 0.12, BH);
  ctx.strokeStyle = 'rgba(15,8,8,0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, BH * 0.52);
  ctx.quadraticCurveTo(BW * 0.03, BH * 0.56, BW * 0.05, BH * 0.54);
  ctx.stroke();
  // lateral line
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(BW * 0.22, BH * 0.4);
  ctx.quadraticCurveTo(BW * 0.55, BH * 0.36, BW * 0.95, BH * 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
}

function markings(ctx, P) {
  const m = P.marking;
  if (m === 'sparkle') dots(ctx, P.rng, 120, 'rgba(255,255,255,0.75)', 0.6, 1.6);
  if (m === 'blaze') blob(ctx, BW * 0.08, BH * 0.3, 40, 50, 'rgba(255,250,240,0.85)');
  if (m === 'halo') {
    hband(ctx, 0, BH * 0.06, 'rgba(220,250,255,0.85)', 0, BW, 4);
    hband(ctx, BH * 0.94, BH, 'rgba(220,250,255,0.85)', 0, BW, 4);
  }
  if (m === 'stars') {
    ctx.fillStyle = 'rgba(255,245,200,0.95)';
    for (let i = 0; i < 26; i++) {
      const x = P.rng() * BW, y = P.rng() * BH, r = 2 + P.rng() * 3;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const rr = k % 2 ? r * 0.4 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
    }
  }
}

const eyeCache = new Map();
export function eyeTexture(kind) {
  if (eyeCache.has(kind)) return eyeCache.get(kind);
  const W = 256, H = 128, cv = canvas(W, H), ctx = cv.getContext('2d');
  const iris = { dark: ['#3a2a10', '#c89a3a'], gold: ['#a86a10', '#ffd060'], blue: ['#103a7a', '#6ab8ff'], red: ['#7a1010', '#ff5a5a'] }[kind] ?? ['#3a2a10', '#c89a3a'];
  ctx.fillStyle = '#d8d4c8';
  ctx.fillRect(0, 0, W, H);
  const cx = W * 0.25, cy = H * 0.5;
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, W * 0.11);
  g.addColorStop(0, iris[0]);
  g.addColorStop(0.6, iris[1]);
  g.addColorStop(0.95, iris[0]);
  g.addColorStop(1, '#202020');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.11, H * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.06, H * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = toTexture(cv);
  eyeCache.set(kind, tex);
  return tex;
}

export function paintFish(fish, sp, ph, j = 0) {
  const seed = hashString(fish.id);
  const rng = makeRng(seed);
  // juveniles & females are paler
  const dull = (fish.sex === 'F' && sp.sexDimorphism ? sp.sexDimorphism.femaleDull ?? 1 : 1) * (1 - j * 0.7);
  const tone = (c) => ({ h: c.h, s: c.s * (0.35 + 0.65 * dull), l: c.l + (1 - dull) * (75 - c.l) * 0.45 });
  const P = { p: tone(ph.primary), s: tone(ph.secondary), pattern: ph.pattern, marking: ph.marking, rng, seed, finLength: ph.finLength, scaleBoost: 1 };

  const bc = canvas(BW, BH);
  const ctx = bc.getContext('2d', { willReadFrequently: true });
  const look = LOOKS[ph.pattern] ?? LOOKS[sp.id] ?? LOOKS.solid;
  look(ctx, P);
  if (j > 0.05) {
    // translucent, washed-out baby look
    ctx.fillStyle = `rgba(230,236,230,${j * 0.55})`;
    ctx.fillRect(0, 0, BW, BH);
  }
  scales(ctx, P);
  details(ctx, P);
  markings(ctx, P);

  const fc = canvas(FW, FH);
  paintFins(fc.getContext('2d'), P, sp);

  const bodyMap = toTexture(bc);
  const finMap = toTexture(fc);
  let emissiveMap = null;
  if (ph.glow || P.glowStripe) {
    const ec = canvas(BW / 2, BH / 2);
    const ectx = ec.getContext('2d');
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, BW / 2, BH / 2);
    if (P.glowStripe) {
      const [y0, y1, x0, x1] = P.glowStripe.map((v) => v / 2);
      ectx.fillStyle = hsl(P.p, 10, 10);
      ectx.fillRect(x0, y0 + 2, x1 - x0, y1 - y0 - 4);
    }
    if (ph.glow) {
      ectx.globalAlpha = 0.85;
      ectx.drawImage(bc, 0, 0, BW / 2, BH / 2);
    }
    emissiveMap = toTexture(ec);
  }
  return { bodyMap, finMap, emissiveMap, glowStripe: !!P.glowStripe };
}
