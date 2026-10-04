// Diploid genetics: every gene has two alleles; expression rules differ per gene.
import { SPECIES_BY_ID, RARITIES, PERSONALITY_TRAITS, FISH_NAMES } from '../data/species.js';
import { weightedPick, clamp, pick, uid, randRange } from '../core/util.js';

export const EYE_ALLELES = [
  { id: 'dark', dom: 2 },
  { id: 'gold', dom: 1, rare: 1 },
  { id: 'blue', dom: 1, rare: 1 },
  { id: 'red', dom: 0, rare: 1 },
];
export const MARKINGS = [
  { id: 'none', dom: 0 },
  { id: 'sparkle', dom: 1, rare: 1, label: 'Sparkle Scales' },
  { id: 'blaze', dom: 1, rare: 1, label: 'Head Blaze' },
  { id: 'halo', dom: 1, rare: 2, label: 'Halo Rim' },
  { id: 'stars', dom: 1, rare: 2, label: 'Starfield' },
];
const UNIVERSAL_RARE_PATTERNS = [
  { id: 'galaxy', dom: 0, rare: 3 },
  { id: 'platinum', dom: 0, rare: 2 },
  { id: 'koi', dom: 0, rare: 2 },
];

const domOf = (list, id) => list.find((x) => x.id === id)?.dom ?? 0;
const rareOf = (list, id) => list.find((x) => x.id === id)?.rare ?? 0;

function patternList(sp) {
  const ids = new Set(sp.genes.patterns.map((p) => p.id));
  return [...sp.genes.patterns, ...UNIVERSAL_RARE_PATTERNS.filter((p) => !ids.has(p.id))];
}
function finList(sp) {
  return sp.genes.finShapes;
}

function wildColor(pool) {
  const c = weightedPick(pool.map((p) => [p, p.w ?? 1]));
  return { h: c.h + randRange(-8, 8), s: clamp(c.s + randRange(-6, 6), 0, 100), l: clamp(c.l + randRange(-5, 5), 4, 98) };
}
function wildAllele(list) {
  // rare alleles are much less likely in the wild
  return weightedPick(list.map((a) => [a.id, a.rare ? 0.12 / a.rare : 1])) ;
}

export function randomGenome(speciesId, opts = {}) {
  const sp = SPECIES_BY_ID[speciesId];
  const g = sp.genes;
  const pats = g.patterns;
  const genome = {
    primary: [wildColor(g.primary), wildColor(g.primary)],
    secondary: [wildColor(g.secondary), wildColor(g.secondary)],
    pattern: [wildAllele(pats), wildAllele(pats)],
    fin: [wildAllele(g.finShapes), wildAllele(g.finShapes)],
    finLength: [randRange(0.88, 1.12), randRange(0.88, 1.12)],
    size: [randRange(0.92, 1.08), randRange(0.92, 1.08)],
    eye: [Math.random() < 0.05 ? pick(['gold', 'blue']) : 'dark', 'dark'],
    marking: [Math.random() < 0.03 ? 'sparkle' : 'none', 'none'],
    glow: [Math.random() < 0.02 ? 1 : 0, 0],
    temper: [randRange(-1, 1), randRange(-1, 1)],
    mutations: [],
  };
  if (opts.pattern) genome.pattern = [opts.pattern, opts.pattern];
  if (opts.fin) genome.fin = [opts.fin, opts.fin];
  if (opts.primary) genome.primary = [{ ...opts.primary }, { ...opts.primary }];
  if (opts.secondary) genome.secondary = [{ ...opts.secondary }, { ...opts.secondary }];
  return genome;
}

function blendColor(a, b) {
  let dh = b.h - a.h;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  if (Math.abs(dh) < 70) return { h: (a.h + dh / 2 + 360) % 360, s: (a.s + b.s) / 2, l: (a.l + b.l) / 2 };
  // very different hues: the more saturated/bright allele dominates
  return a.s * (1 - Math.abs(a.l - 50) / 60) >= b.s * (1 - Math.abs(b.l - 50) / 60) ? { ...a } : { ...b };
}
function byDominance(list, alleles) {
  const [a, b] = alleles;
  return domOf(list, a) >= domOf(list, b) ? a : b;
}

// Phenotype: the visible traits computed from the genome.
export function express(speciesId, genome) {
  const sp = SPECIES_BY_ID[speciesId];
  const pats = patternList(sp);
  const pattern = byDominance(pats, genome.pattern);
  const fin = byDominance(finList(sp), genome.fin);
  const eye = genome.eye[0] === genome.eye[1] ? genome.eye[0] : byDominance(EYE_ALLELES, genome.eye);
  const marking = byDominance(MARKINGS, genome.marking);
  return {
    primary: blendColor(genome.primary[0], genome.primary[1]),
    secondary: blendColor(genome.secondary[0], genome.secondary[1]),
    pattern,
    fin,
    finLength: (genome.finLength[0] + genome.finLength[1]) / 2,
    size: (genome.size[0] + genome.size[1]) / 2,
    eye: eye === 'red' && genome.eye[0] !== genome.eye[1] ? 'dark' : eye,
    marking,
    glow: genome.glow[0] && genome.glow[1] ? 1 : 0,
    temper: (genome.temper[0] + genome.temper[1]) / 2,
  };
}

export function rarityOf(speciesId, genome) {
  const sp = SPECIES_BY_ID[speciesId];
  const ph = express(speciesId, genome);
  let score = RARITIES.indexOf(sp.rarity);
  score += rareOf(patternList(sp), ph.pattern);
  score += rareOf(finList(sp), ph.fin);
  score += rareOf(MARKINGS, ph.marking);
  score += ph.glow ? 2 : 0;
  score += ph.eye !== 'dark' ? 1 : 0;
  if (ph.finLength > 1.3) score += 1;
  if (ph.size > 1.14) score += 1;
  score += Math.min(2, genome.mutations?.length ?? 0) * 0.5;
  return RARITIES[clamp(Math.floor(score * 0.75), 0, RARITIES.length - 1)];
}

export function genomeKey(speciesId, genome) {
  const ph = express(speciesId, genome);
  return [speciesId, ph.pattern, ph.fin, Math.round(ph.primary.h), Math.round(ph.primary.s), Math.round(ph.primary.l),
    Math.round(ph.secondary.h), Math.round(ph.secondary.s), Math.round(ph.secondary.l), ph.marking, ph.glow, ph.eye,
    ph.finLength.toFixed(2)].join('|');
}

const MUTATION_RATE = 0.045;

export function inherit(speciesId, ga, gb, luck = 0) {
  const sp = SPECIES_BY_ID[speciesId];
  const rate = MUTATION_RATE * (1 + luck);
  const take = (gene) => [ga[gene][Math.random() < 0.5 ? 0 : 1], gb[gene][Math.random() < 0.5 ? 0 : 1]];
  const child = {
    primary: take('primary').map((c) => ({ ...c })),
    secondary: take('secondary').map((c) => ({ ...c })),
    pattern: take('pattern'),
    fin: take('fin'),
    finLength: take('finLength'),
    size: take('size'),
    eye: take('eye'),
    marking: take('marking'),
    glow: take('glow'),
    temper: take('temper').map((t) => clamp(t + randRange(-0.15, 0.15), -1, 1)),
    mutations: [],
  };
  // small natural drift
  child.finLength = child.finLength.map((v) => clamp(v + randRange(-0.04, 0.05), 0.7, 1.6));
  child.size = child.size.map((v) => clamp(v + randRange(-0.03, 0.035), 0.8, 1.3));
  const mutations = [];
  const roll = () => Math.random() < rate;
  if (roll()) {
    const i = Math.random() < 0.5 ? 0 : 1;
    child.primary[i] = { h: (child.primary[i].h + randRange(60, 300)) % 360, s: clamp(child.primary[i].s + randRange(-10, 25), 30, 100), l: clamp(child.primary[i].l + randRange(-15, 15), 15, 85) };
    child.primary[1 - i] = { ...child.primary[i] };
    mutations.push('Color Shift');
  }
  if (roll()) {
    const i = Math.random() < 0.5 ? 0 : 1;
    child.secondary[i] = { h: Math.random() * 360, s: randRange(60, 100), l: randRange(40, 70) };
    mutations.push('New Accent');
  }
  if (roll()) {
    const rarePats = patternList(sp).filter((p) => p.rare);
    if (rarePats.length) {
      const p = pick(rarePats).id;
      child.pattern = [p, Math.random() < 0.4 ? p : child.pattern[1]];
      mutations.push('Pattern Mutation');
    }
  }
  if (roll()) {
    const m = pick(MARKINGS.filter((x) => x.id !== 'none'));
    child.marking = [m.id, child.marking[1]];
    mutations.push(m.label);
  }
  if (Math.random() < rate * 0.5) {
    child.glow = [1, Math.random() < 0.35 ? 1 : child.glow[1]];
    mutations.push(child.glow[1] ? 'Bioluminescence' : 'Glow Carrier');
  }
  if (roll()) {
    child.finLength = child.finLength.map((v) => clamp(v + 0.3, 0.7, 1.7));
    mutations.push('Long Fins');
  }
  if (Math.random() < rate * 0.6) {
    child.size = child.size.map((v) => clamp(v + 0.14, 0.8, 1.35));
    mutations.push('Giant');
  }
  if (Math.random() < rate * 0.6) {
    const e = pick(['gold', 'blue', 'red']);
    child.eye = [e, e];
    mutations.push(`${e[0].toUpperCase()}${e.slice(1)} Eyes`);
  }
  child.mutations = mutations;
  return child;
}

export function rollPersonality(speciesId, genome) {
  const sp = SPECIES_BY_ID[speciesId];
  const ph = express(speciesId, genome);
  const weights = PERSONALITY_TRAITS.map((t) => {
    let w = (sp.personality[t] ?? 0.5) + 0.3;
    if (ph.temper > 0.3 && (t === 'brave' || t === 'energetic' || t === 'curious')) w += 1.5 * ph.temper;
    if (ph.temper < -0.3 && (t === 'shy' || t === 'gentle' || t === 'lazy')) w += 1.5 * -ph.temper;
    return [t, w];
  });
  const a = weightedPick(weights);
  const b = weightedPick(weights.filter(([t]) => t !== a && !(OPPOSITES[a] === t)));
  return [a, b];
}
const OPPOSITES = { shy: 'brave', brave: 'shy', lazy: 'energetic', energetic: 'lazy', social: 'independent', independent: 'social', gentle: 'territorial', territorial: 'gentle' };

export function randomName(existing = []) {
  const used = new Set(existing);
  const free = FISH_NAMES.filter((n) => !used.has(n));
  return free.length ? pick(free) : `${pick(FISH_NAMES)} ${Math.floor(Math.random() * 90 + 10)}`;
}

// Creates a full persistent fish record.
export function createFish(speciesId, opts = {}) {
  const sp = SPECIES_BY_ID[speciesId];
  const genome = opts.genome ?? randomGenome(speciesId, opts.genes ?? {});
  const sex = opts.sex ?? (Math.random() < 0.5 ? 'M' : 'F');
  const fish = {
    id: uid('fish'),
    name: opts.name ?? randomName(opts.existingNames),
    species: speciesId,
    sex,
    bornAt: opts.bornAt ?? Date.now(),
    age: opts.age ?? 0, // seconds alive (game-time)
    stage: opts.stage ?? 'ADULT',
    stageProgress: opts.stage && opts.stage !== 'ADULT' ? 0 : 1,
    genome,
    rarity: rarityOf(speciesId, genome),
    health: 0.95,
    hunger: opts.hunger ?? 0.35,
    happiness: 0.75,
    energy: 0.8,
    bond: opts.bond ?? 0.05,
    personality: opts.personality ?? rollPersonality(speciesId, genome),
    favoriteFood: opts.favoriteFood ?? pick(sp.diet),
    parents: opts.parents ?? null, // {mother, father}
    children: [],
    generation: opts.generation ?? 1,
    breedCooldown: 0,
    pregnant: null,
    tricks: {}, // trickId -> progress 0..1
    favorite: false,
    weight: 0,
    eaten: 0,
    raised: false,
    acquired: Date.now(),
  };
  fish.weight = +(sp.adultSize * 100 * express(speciesId, genome).size).toFixed(1);
  return fish;
}

export function fishValue(fish) {
  const sp = SPECIES_BY_ID[fish.species];
  const r = RARITIES.indexOf(fish.rarity);
  const stageMul = { EGG: 0, FRY: 0.2, JUVENILE: 0.45, 'YOUNG ADULT': 0.75, ADULT: 1 }[fish.stage] ?? 1;
  return Math.round(sp.value * (1 + r * r * 0.6) * express(fish.species, fish.genome).size * stageMul * (0.6 + fish.health * 0.4));
}

export function fishBeauty(fish) {
  const ph = express(fish.species, fish.genome);
  const r = RARITIES.indexOf(fish.rarity);
  return clamp(0.35 + r * 0.1 + ph.primary.s / 400 + ph.finLength * 0.08 + (ph.glow ? 0.1 : 0) + fish.health * 0.1 + fish.happiness * 0.1 - 0.25, 0, 1);
}

export function canBreed(a, b) {
  if (!a || !b || a === b) return { ok: false, reason: 'Pick two fish.' };
  if (a.species !== b.species) return { ok: false, reason: 'They must be the same species.' };
  if (a.sex === b.sex) return { ok: false, reason: 'Needs a male and a female.' };
  if (a.stage !== 'ADULT' || b.stage !== 'ADULT') return { ok: false, reason: 'Both fish must be adults.' };
  if (a.breedCooldown > 0 || b.breedCooldown > 0) return { ok: false, reason: 'One of them is still resting from breeding.' };
  if (a.pregnant || b.pregnant) return { ok: false, reason: 'Already expecting babies.' };
  if (a.health < 0.5 || b.health < 0.5) return { ok: false, reason: 'Both fish need good health.' };
  if (a.happiness < 0.45 || b.happiness < 0.45) return { ok: false, reason: 'Both fish need to be happy.' };
  const related = a.parents && b.parents && (a.parents.mother === b.parents.mother || a.parents.father === b.parents.father);
  if (related) return { ok: false, reason: 'Siblings cannot be paired.' };
  return { ok: true };
}

export function describeGenome(speciesId, genome) {
  const ph = express(speciesId, genome);
  const traits = [];
  traits.push(`Pattern: ${cap(ph.pattern)}`);
  traits.push(`Fins: ${cap(ph.fin)}${ph.finLength > 1.25 ? ' (long)' : ''}`);
  if (ph.eye !== 'dark') traits.push(`${cap(ph.eye)} eyes`);
  if (ph.marking !== 'none') traits.push(MARKINGS.find((m) => m.id === ph.marking)?.label ?? ph.marking);
  if (ph.glow) traits.push('Bioluminescent');
  else if (genome.glow[0] || genome.glow[1]) traits.push('Glow carrier');
  if (ph.size > 1.12) traits.push('Large build');
  return traits;
}
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
