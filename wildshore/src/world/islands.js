// Archipelago layout + analytic terrain height function.
// Everything (terrain meshes, water depth texture, collision, placement) samples this.
import { fbm2, noise2, ridge2, smoothstep, clamp } from '../util/math.js';

export const SEA_FLOOR = -30;

export const ISLANDS = [
  {
    id: 'home', name: 'Castaway Key', x: 0, z: 0, R: 92, H: 7, seed: 11,
    beach: 0.13, reef: 1.62, desc: 'Your starting island. White sand, coconut palms, a spring and a shallow reef.',
    resources: ['wood', 'palm', 'coconut', 'stone', 'fiber', 'fish', 'shellfish', 'water'],
  },
  {
    id: 'hunter', name: "Hunter's Island", x: 470, z: -250, R: 112, H: 16, seed: 23,
    beach: 0.12, reef: 1.32, desc: 'Dense hardwood forest. Wild pigs, a freshwater creek and heavy timber.',
    resources: ['hardwood', 'meat', 'hide', 'bone', 'water', 'fruit'],
  },
  {
    id: 'rocky', name: 'Rocky Island', x: -400, z: -330, R: 58, H: 22, seed: 37,
    beach: 0.07, reef: 1.25, rocky: true, desc: 'Basalt cliffs and tide pools. Flint, seabird eggs and crabs.',
    resources: ['flint', 'stone', 'eggs', 'shellfish'],
  },
  {
    id: 'mangrove', name: 'Mangrove Island', x: -430, z: 330, R: 84, H: 2.2, seed: 41,
    beach: 0.35, reef: 1.5, mangrove: true, desc: 'Low tidal flats and tangled mangroves. Clay, crabs and mud.',
    resources: ['clay', 'mangrove', 'crab', 'fiber'],
  },
  {
    id: 'reef', name: 'Outer Reef', x: 360, z: 400, R: 24, H: 1.6, seed: 53,
    beach: 0.6, reef: 3.6, atoll: true, desc: 'A tiny sand cay inside a vast coral reef. Turtles, giant clams and big fish.',
    resources: ['pearl', 'fish', 'shellfish', 'coral'],
  },
];
export const ISLAND_BY_ID = Object.fromEntries(ISLANDS.map((i) => [i.id, i]));

// Hand-placed features on the home island (world coords)
export const HOME = {
  spawn: { x: 5, z: 89 },
  camp: { x: 0, z: 74 },
  lookout: { x: -34, z: -42, r: 26, h: 15 },
  spring: { x: 16, z: -6, r: 6.5, depth: 1.4 },
  cove: { x: -74, z: 52, r: 28 },
  rockyShore: { x: 86, z: -6 },
  reef: { x: 70, z: 92 },
};
export const HUNTER = { creek: { x: 470 + 10, z: -250 + 20, r: 9, depth: 1.6 } };

// Piecewise profile (t = normalised distance, 1 = shoreline)
function profile(t, isl) {
  const H = isl.H;
  const b = isl.beach;
  if (t < 1) {
    const u = 1 - t; // 0 at shore -> 1 centre
    const beachRise = 0.15 + 1.25 * smoothstep(0, b, u);
    const inland = smoothstep(b * 0.6, b + 0.35, u);
    const dome = Math.pow(clamp(u / (1 - b * 0.5), 0, 1), 0.85);
    return beachRise + inland * H * dome;
  }
  const s = t - 1;
  const reef = isl.reef - 1; // width of shallow shelf
  if (s < 0.06) return 0.15 - (s / 0.06) * 1.05; // swash zone
  if (s < reef) {
    const k = (s - 0.06) / (reef - 0.06);
    return -0.9 - k * k * 2.4 - k * 0.8;
  }
  const k = s - reef;
  return -4.1 - smoothstep(0, 0.45, k) * 14 - smoothstep(0.3, 1.3, k) * 12;
}

function islandHeight(isl, x, z) {
  const dx = x - isl.x, dz = z - isl.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const R = isl.R;
  if (d > R * (isl.reef + 1.6) + 40) return SEA_FLOOR;
  const sx = isl.seed * 17.13;
  let warp = fbm2(x * 0.011 + sx, z * 0.011 - sx, 3) * R * 0.2 + noise2(x * 0.045 + sx, z * 0.045) * R * 0.035;
  if (isl.id === 'home') {
    // carve the protected boat cove on the south west
    const cx = x - HOME.cove.x, cz = z - HOME.cove.z;
    warp += Math.exp(-(cx * cx + cz * cz) / (HOME.cove.r * HOME.cove.r)) * R * 0.3;
    // widen the southern camp beach
    warp -= smoothstep(20, 80, z) * smoothstep(60, 10, Math.abs(x)) * R * 0.05;
  }
  const t = (d + warp) / R;
  let h = profile(t, isl);

  if (t < 1.05) {
    const landMask = smoothstep(0.98, 0.8, t);
    // undulating interior
    h += landMask * (fbm2(x * 0.03 + sx, z * 0.03, 4) * 1.6 + fbm2(x * 0.11, z * 0.11 + sx, 2) * 0.35) * (isl.H > 3 ? 1 : 0.25);
    if (isl.rocky) {
      h += landMask * Math.pow(ridge2(x * 0.03 + sx, z * 0.03, 4), 2.2) * 14 * smoothstep(0.95, 0.6, t);
      // cliffs: steepen the edge
      h += smoothstep(1.02, 0.86, t) * 5 * (0.6 + 0.4 * noise2(x * 0.08, z * 0.08));
    }
  }
  if (t >= 1 && t < isl.reef + 0.2) {
    // seabed variation: sand ripples / coral bommies / channels
    const shelf = smoothstep(1.02, 1.12, t) * smoothstep(isl.reef + 0.2, isl.reef - 0.1, t);
    h += shelf * (fbm2(x * 0.06 + sx, z * 0.06, 3) * 0.9 + Math.pow(Math.max(0, noise2(x * 0.09 - sx, z * 0.09)), 3) * 2.2);
  }
  if (isl.atoll) {
    // ring reef crest
    const ring = Math.exp(-Math.pow((t - 2.7) / 0.35, 2));
    h += ring * (2.4 + noise2(x * 0.1, z * 0.1) * 0.6);
  }
  return h;
}

function homeFeatures(x, z, h) {
  // Lookout hill
  const L = HOME.lookout;
  let dx = x - L.x, dz = z - L.z;
  let g = Math.exp(-(dx * dx + dz * dz) / (L.r * L.r));
  if (g > 0.001) {
    h += g * L.h + g * Math.pow(ridge2(x * 0.08, z * 0.08, 3), 2) * 3.5;
  }
  // Spring pond depression
  const S = HOME.spring;
  dx = x - S.x; dz = z - S.z;
  const ds = Math.sqrt(dx * dx + dz * dz);
  if (ds < S.r * 2.2) {
    const bowl = smoothstep(S.r * 1.6, S.r * 0.3, ds);
    h -= bowl * S.depth * 2.1;
  }
  // Rocky eastern shore: jagged
  const ex = smoothstep(55, 95, x) * smoothstep(60, 20, Math.abs(z + 6));
  if (ex > 0) h += ex * Math.pow(ridge2(x * 0.12, z * 0.12, 3), 3) * 2.6 * smoothstep(-2.5, 1.5, h);
  return h;
}

function hunterFeatures(x, z, h) {
  const C = HUNTER.creek;
  const dx = x - C.x, dz = z - C.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < C.r * 2.5) h -= smoothstep(C.r * 1.8, C.r * 0.4, d) * C.depth * 2.2;
  return h;
}

export function terrainHeight(x, z) {
  let h = SEA_FLOOR;
  for (let i = 0; i < ISLANDS.length; i++) {
    const v = islandHeight(ISLANDS[i], x, z);
    if (v > h) h = v;
  }
  // gentle undulating sea floor
  if (h <= SEA_FLOOR + 0.01) h = SEA_FLOOR + noise2(x * 0.01, z * 0.01) * 2.5;
  else h = Math.max(h, SEA_FLOOR + noise2(x * 0.01, z * 0.01) * 2.5);
  const dh = x * x + z * z;
  if (dh < 260 * 260) h = homeFeatures(x, z, h);
  const hx = x - 470, hz = z + 250;
  if (hx * hx + hz * hz < 200 * 200) h = hunterFeatures(x, z, h);
  return h;
}

export function terrainNormal(x, z, out, e = 0.5) {
  const hl = terrainHeight(x - e, z), hr = terrainHeight(x + e, z);
  const hd = terrainHeight(x, z - e), hu = terrainHeight(x, z + e);
  out.set(hl - hr, 2 * e, hd - hu).normalize();
  return out;
}

export function nearestIsland(x, z) {
  let best = null, bd = Infinity;
  for (const isl of ISLANDS) {
    const d = Math.hypot(x - isl.x, z - isl.z) / isl.R;
    if (d < bd) { bd = d; best = isl; }
  }
  return { island: best, t: bd };
}

// Fresh water bodies (surface height + radius) for drinking / rendering
export const PONDS = [
  { id: 'spring', x: HOME.spring.x, z: HOME.spring.z, r: HOME.spring.r * 1.15, island: 'home' },
  { id: 'creek', x: HUNTER.creek.x, z: HUNTER.creek.z, r: HUNTER.creek.r * 1.1, island: 'hunter' },
];
export function initPondLevels() {
  for (const p of PONDS) {
    // surface sits a little below the lowest rim sample
    let rim = Infinity;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
      rim = Math.min(rim, terrainHeight(p.x + Math.cos(a) * p.r * 1.25, p.z + Math.sin(a) * p.r * 1.25));
    }
    p.level = rim - 0.25;
  }
}
export function pondAt(x, z) {
  for (const p of PONDS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.4 && terrainHeight(x, z) < p.level) return p;
  }
  return null;
}
