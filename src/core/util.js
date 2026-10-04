// Shared math / random helpers used across systems.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function dampAngle(current, target, lambda, dt) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Seeded PRNG (mulberry32). Used so procedural assets are stable across reloads.
export function makeRng(seed = 1) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  return rng;
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const rand = Math.random;
export const randRange = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function weightedPick(entries, rng = Math.random) {
  // entries: [{w, ...}] or [[value, weight]]
  let total = 0;
  for (const e of entries) total += Array.isArray(e) ? e[1] : e.w ?? 1;
  let r = rng() * total;
  for (const e of entries) {
    r -= Array.isArray(e) ? e[1] : e.w ?? 1;
    if (r <= 0) return Array.isArray(e) ? e[0] : e;
  }
  const last = entries[entries.length - 1];
  return Array.isArray(last) ? last[0] : last;
}

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}${idCounter.toString(36)}`;
}

// 2D value noise for procedural textures.
export function makeNoise2D(seed = 1) {
  const rng = makeRng(seed);
  const size = 256;
  const perm = new Uint8Array(size * 2);
  const vals = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    perm[i] = i;
    vals[i] = rng();
  }
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < size; i++) perm[i + size] = perm[i];
  const fade = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const v00 = vals[perm[X + perm[Y]]];
    const v10 = vals[perm[X + 1 + perm[Y]]];
    const v01 = vals[perm[X + perm[Y + 1]]];
    const v11 = vals[perm[X + 1 + perm[Y + 1]]];
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  };
  noise.fbm = (x, y, oct = 4) => {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * noise(x * f, y * f);
      n += a;
      a *= 0.5;
      f *= 2;
    }
    return s / n;
  };
  return noise;
}

// 3D value-ish noise built from hashed lattice; used for rock displacement.
export function makeNoise3D(seed = 1) {
  const n2 = makeNoise2D(seed);
  const n2b = makeNoise2D(seed + 77);
  return (x, y, z) => (n2(x + z * 0.71, y) + n2b(y + x * 0.37, z)) * 0.5;
}

export function hsl(h, s, l, a = 1) {
  return `hsla(${((h % 360) + 360) % 360},${clamp(s, 0, 100)}%,${clamp(l, 0, 100)}%,${a})`;
}

export function formatNumber(n) {
  return Math.floor(n).toLocaleString('en-US');
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function rating(v) {
  if (v >= 0.85) return 'EXCELLENT';
  if (v >= 0.65) return 'GOOD';
  if (v >= 0.45) return 'FAIR';
  if (v >= 0.25) return 'POOR';
  return 'CRITICAL';
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}
