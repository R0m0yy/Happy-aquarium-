// Authoritative, serialisable game state plus small helpers to query it.
import { createFish } from '../systems/Genetics.js';
import { uid } from './util.js';
import { SAVE_VERSION } from './SaveSystem.js';

export function createTank({ name, size = 't75', env = 'fresh', type = 'display', starter = false }) {
  const tank = {
    id: uid('tank'),
    name,
    size,
    env,
    type,
    fish: [],
    plants: [],
    decor: [],
    substrate: env === 'marine' ? 'coral' : 'gravel',
    background: 'deepblue',
    lighting: env === 'marine' ? 'tropical' : 'daylight',
    equipment: { filter: 'filter_basic', heater: null, air: null, co2: null, uv: null, feeder: null },
    water: { quality: 0.82, temp: 25, oxygen: 0.85, cleanliness: 0.8 },
    algae: { level: starter ? 0.26 : 0.03, seed: Math.floor(Math.random() * 1e6) },
    debris: starter ? 0.15 : 0,
    filterHealth: 0.9,
    created: Date.now(),
  };
  return tank;
}

export function createDefaultState() {
  const main = createTank({ name: 'Living Room Tank', size: 't75', starter: true });
  const betta = createFish('betta', {
    name: 'Mochi',
    sex: 'M',
    genes: { pattern: 'koi', fin: 'halfmoon', primary: { h: 228, s: 85, l: 48 }, secondary: { h: 355, s: 88, l: 52 } },
    hunger: 0.55,
  });
  betta.genome.marking = ['none', 'none'];
  betta.rarity = 'RARE';
  const guppyM = createFish('guppy', { name: 'Sunny', sex: 'M', genes: { pattern: 'mosaic', fin: 'fan', primary: { h: 200, s: 70, l: 55 }, secondary: { h: 22, s: 92, l: 56 } }, hunger: 0.55 });
  const guppyF = createFish('guppy', { name: 'Pip', sex: 'F', genes: { pattern: 'tuxedo', fin: 'delta', primary: { h: 30, s: 80, l: 58 }, secondary: { h: 210, s: 80, l: 55 } }, hunger: 0.55 });
  main.fish.push(betta, guppyM, guppyF);
  const P = (plantId, nx, nz, growth = 0.8, scale = 1, rot = Math.random() * 6) => ({ uid: uid('pl'), plantId, nx, nz, growth, scale, rot });
  main.plants = [
    // background: tall stems and ribbons
    P('vallisneria', -0.46, -0.42, 0.85), P('vallisneria', -0.36, -0.44, 0.8), P('vallisneria', 0.44, -0.42, 0.8),
    P('rotala', -0.22, -0.4, 0.95), P('rotala', 0.12, -0.42, 0.95), P('rotala', 0.28, -0.38, 0.85, 0.9),
    P('amazon', -0.08, -0.36, 0.8, 1.1), P('amazon', 0.34, -0.3, 0.75),
    // midground
    P('javafern', 0.22, -0.12, 0.8), P('javafern', -0.4, -0.12, 0.75), P('crypt', 0.42, 0.12, 0.8), P('crypt', -0.18, 0.02, 0.7),
    // foreground carpet & accents
    P('anubias', -0.05, 0.14, 0.85), P('moss', 0.08, 0.3, 0.8, 1.2), P('moss', -0.34, 0.26, 0.7, 1.1), P('moss', 0.3, 0.28, 0.7),
  ];
  main.decor = [
    { uid: uid('dc'), itemId: 'spiderwood', nx: 0.2, nz: -0.15, rot: 0.3, scale: 1.3 },
    { uid: uid('dc'), itemId: 'mopani', nx: -0.18, nz: -0.2, rot: 2.2, scale: 1.0 },
    { uid: uid('dc'), itemId: 'seiryu', nx: -0.3, nz: 0.05, rot: 0.6, scale: 1.1 },
    { uid: uid('dc'), itemId: 'dragon', nx: 0.36, nz: 0.12, rot: 2.2, scale: 0.85 },
    { uid: uid('dc'), itemId: 'river', nx: -0.1, nz: 0.3, rot: 1.2, scale: 0.7 },
  ];

  return {
    version: SAVE_VERSION,
    created: Date.now(),
    lastSaved: Date.now(),
    lastTick: Date.now(),
    playTime: 0,
    player: { name: 'My Aquarium', level: 1, xp: 0, coins: 2500, pearls: 25 },
    character: {
      skin: '#f0cdb4',
      hairStyle: 'curly',
      hairColor: '#5a3420',
      top: 'hoodie',
      topColor: '#f1ece4',
      pants: '#2a3a5a',
      shoes: '#f4f4f2',
      accessory: 'none',
    },
    room: {
      id: 'apartment',
      owned: ['apartment'],
      options: { walls: 'default', floor: 'default', rug: 'cream', furniture: 'linen', lighting: 'warm', plants: 'lush', artwork: 'fishprints', shelves: 'walnut', view: 'default', cabinet: 'walnut', decorations: 'cozy' },
      ownedOptions: { walls: ['default'], floor: ['default'], rug: ['cream', 'none'], furniture: ['linen'], lighting: ['warm'], plants: ['lush'], artwork: ['fishprints'], shelves: ['walnut'], view: ['default'], cabinet: ['walnut'], decorations: ['cozy'] },
    },
    tanks: [main],
    activeTank: main.id,
    inventory: {
      food: { flakes: -1, micro_pellets: 5, algae_wafers: 3 }, // -1 = unlimited
      decor: { ruins: 1 },
      plants: { anubias: 1 },
      substrates: ['gravel'],
      backgrounds: ['deepblue'],
      lighting: ['daylight'],
      equipment: ['filter_basic'],
    },
    selectedFood: 'flakes',
    quests: { progress: {}, completed: [], claimed: [] },
    achievements: { unlocked: [] },
    stats: {
      feeds: 0, placed: 0, maxBond: 0, hatched: 0, rareOwned: 0, breeds: 0, plantsMax: 0, raised: 0, patches: 0,
      discovered: 0, photos: 0, mutations: 0, tricks: 0, catPets: 0, marineOwned: 0, bigTank: 0, roomItems: 0, fishBought: 0,
    },
    collection: { discovered: {}, owned: {}, variants: {}, mutations: [], records: {}, breedingRecords: [] },
    archive: {}, // minimal records of fish no longer owned (for family trees)
    photos: [],
    settings: { quality: 'auto', music: 0.45, sfx: 0.7, ambience: 0.55, timeMode: 'cycle', cycleMinutes: 24, showFps: false, muted: false },
    time: { dayTime: 0.27 },
    tutorial: { step: 0, done: false, introSeen: false },
    inbox: [
      { id: 'welcome', title: 'Welcome to AQUARIA!', body: 'Your aquarium is ready. Here is a little gift to get started.', reward: { coins: 500, pearls: 10 }, claimed: false, time: Date.now() },
    ],
    notifications: [],
    liveEvent: { week: -1, progress: 0, claimed: false },
  };
}

export function activeTank(state) {
  return state.tanks.find((t) => t.id === state.activeTank) ?? state.tanks[0];
}

export function allFish(state) {
  return state.tanks.flatMap((t) => t.fish);
}

export function findFish(state, id) {
  for (const t of state.tanks) {
    const f = t.fish.find((x) => x.id === id);
    if (f) return { fish: f, tank: t };
  }
  return null;
}

export function fishRecord(state, id) {
  return findFish(state, id)?.fish ?? state.archive[id] ?? null;
}
