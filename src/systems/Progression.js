// Coins, pearls, XP/levels, quests, achievements, collection book & live events.
import { bus } from '../core/EventBus.js';
import { QUESTS, ACHIEVEMENTS, xpForLevel, LIVE_EVENTS, FEATURE_UNLOCKS } from '../data/progression.js';
import { SPECIES, SPECIES_BY_ID, RARITIES } from '../data/species.js';
import { DECOR, PLANTS, TANKS, ROOMS, FOODS, EQUIPMENT } from '../data/items.js';
import { express, fishValue } from './Genetics.js';
import { allFish } from '../core/GameState.js';

export class Progression {
  constructor(game) {
    this.game = game;
    this.wire();
  }
  get s() {
    return this.game.state;
  }

  // ---------------------------------------------------------------- economy
  canAfford(price, currency = 'coins') {
    return (this.s.player[currency] ?? 0) >= price;
  }
  spend(price, currency = 'coins') {
    if (!this.canAfford(price, currency)) return false;
    this.s.player[currency] -= price;
    bus.emit('wallet', this.s.player);
    return true;
  }
  give({ coins = 0, pearls = 0, xp = 0 } = {}, source) {
    if (coins) this.s.player.coins += coins;
    if (pearls) this.s.player.pearls += pearls;
    if (xp) this.addXP(xp, source);
    bus.emit('wallet', this.s.player);
    if (coins || pearls) bus.emit('reward', { coins, pearls, xp, source });
  }
  addXP(xp, source) {
    const p = this.s.player;
    p.xp += Math.round(xp);
    let leveled = false;
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      leveled = true;
      const pearls = 5 + Math.floor(p.level / 2) * 2;
      const coins = 200 + p.level * 100;
      p.pearls += pearls;
      p.coins += coins;
      bus.emit('level:up', { level: p.level, coins, pearls, unlocks: this.unlocksAt(p.level) });
    }
    bus.emit('xp', { xp, source, leveled });
  }
  unlocksAt(level) {
    const out = [];
    for (const sp of SPECIES) if (sp.unlock.level === level) out.push(sp.name);
    for (const d of DECOR) if (d.unlock === level) out.push(d.name);
    for (const p of PLANTS) if (p.unlock === level) out.push(p.name);
    for (const t of TANKS) if (t.unlock === level) out.push(t.name);
    for (const r of ROOMS) if (r.unlock === level) out.push(r.name);
    for (const f of FOODS) if (f.unlock === level) out.push(f.name);
    for (const e of EQUIPMENT) if (e.unlock === level) out.push(e.name);
    for (const [k, v] of Object.entries(FEATURE_UNLOCKS)) if (v === level) out.push({ breeding: 'Breeding', nursery: 'Nursery Tank', training: 'Fish Training', marine: 'Marine Aquariums', roomCustom: 'Room Customization' }[k]);
    return out;
  }
  feature(name) {
    return this.s.player.level >= (FEATURE_UNLOCKS[name] ?? 1);
  }

  // ------------------------------------------------------------- stats
  stat(name, v, mode = 'add') {
    const st = this.s.stats;
    if (mode === 'add') st[name] = (st[name] ?? 0) + v;
    else if (mode === 'max') st[name] = Math.max(st[name] ?? 0, v);
    else st[name] = v;
    this.checkAchievements();
  }

  // ------------------------------------------------------------- quests
  activeQuests() {
    const q = this.s.quests;
    const out = [];
    for (const quest of QUESTS) {
      if (q.claimed.includes(quest.id)) continue;
      if (quest.requires && !q.claimed.includes(quest.requires) && !q.completed.includes(quest.requires)) continue;
      out.push(quest);
      if (out.length >= 4) break;
    }
    return out;
  }
  questProgress(id) {
    return this.s.quests.progress[id] ?? 0;
  }
  onEvent(type, payload = {}) {
    const q = this.s.quests;
    for (const quest of this.activeQuests()) {
      if (quest.event !== type || q.completed.includes(quest.id)) continue;
      if (quest.filter) {
        const f = quest.filter;
        if (f.cat && payload.cat !== f.cat) continue;
        if (f.env && payload.env !== f.env) continue;
        if (f.favorite && !payload.favorite) continue;
        if (f.stage && payload.stage !== f.stage) continue;
        if (f.min && (payload.value ?? 0) < f.min) continue;
      }
      q.progress[quest.id] = (q.progress[quest.id] ?? 0) + 1;
      if (q.progress[quest.id] >= quest.count) {
        q.completed.push(quest.id);
        bus.emit('quest:complete', quest);
      } else bus.emit('quest:progress', quest);
    }
    // live event
    const le = this.liveEvent();
    if (le && le.def.event === type && !this.s.liveEvent.claimed) {
      this.s.liveEvent.progress = Math.min(le.def.count, this.s.liveEvent.progress + 1);
      bus.emit('liveevent:progress', le);
    }
  }
  claimQuest(id) {
    const q = this.s.quests;
    const quest = QUESTS.find((x) => x.id === id);
    if (!quest || !q.completed.includes(id) || q.claimed.includes(id)) return false;
    q.claimed.push(id);
    this.give(quest.reward, 'quest');
    bus.emit('quest:claimed', quest);
    return true;
  }

  liveEvent() {
    const week = Math.floor((Date.now() / 86400000 + 3) / 7);
    if (this.s.liveEvent.week !== week) this.s.liveEvent = { week, progress: 0, claimed: false };
    const def = LIVE_EVENTS[week % LIVE_EVENTS.length];
    const end = (week + 1) * 7 * 86400000 - 3 * 86400000;
    return { def, week, progress: this.s.liveEvent.progress, claimed: this.s.liveEvent.claimed, endsIn: (end - Date.now()) / 1000 };
  }
  claimLiveEvent() {
    const le = this.liveEvent();
    if (le.claimed || le.progress < le.def.count) return false;
    this.s.liveEvent.claimed = true;
    this.give({ ...le.def.reward, xp: 150 }, 'event');
    return true;
  }

  // -------------------------------------------------------- achievements
  checkAchievements() {
    const st = this.s.stats;
    const a = this.s.achievements;
    for (const ach of ACHIEVEMENTS) {
      if (a.unlocked.includes(ach.id)) continue;
      if ((st[ach.stat] ?? 0) >= ach.goal) {
        a.unlocked.push(ach.id);
        this.give({ ...ach.reward, xp: 100 }, 'achievement');
        bus.emit('achievement', ach);
      }
    }
  }

  // ----------------------------------------------------------- collection
  discover(fish) {
    const c = this.s.collection;
    const sp = SPECIES_BY_ID[fish.species];
    const ph = express(fish.species, fish.genome);
    let isNew = false;
    if (!c.discovered[fish.species]) {
      c.discovered[fish.species] = Date.now();
      isNew = true;
      this.stat('discovered', Object.keys(c.discovered).length, 'set');
      bus.emit('collection:species', sp);
    }
    c.variants[fish.species] = c.variants[fish.species] ?? [];
    const vkey = `${ph.pattern}/${ph.fin}`;
    if (!c.variants[fish.species].includes(vkey)) {
      c.variants[fish.species].push(vkey);
      if (!isNew) bus.emit('collection:variant', { sp, variant: vkey });
    }
    for (const m of fish.genome.mutations ?? []) {
      if (!c.mutations.includes(m)) c.mutations.push(m);
    }
    this.updateRecords();
  }
  updateRecords() {
    const c = this.s.collection;
    const fish = allFish(this.s).filter((f) => f.stage !== 'EGG');
    const recs = c.records;
    for (const f of fish) {
      const len = SPECIES_BY_ID[f.species].adultSize * express(f.species, f.genome).size * 100;
      if (f.stage === 'ADULT' && (!recs.largest || len > recs.largest.len)) recs.largest = { id: f.id, name: f.name, species: f.species, len: +len.toFixed(1) };
      if (!recs.oldest || f.age > recs.oldest.age) recs.oldest = { id: f.id, name: f.name, species: f.species, age: f.age };
      const ri = RARITIES.indexOf(f.rarity);
      if (!recs.rarest || ri > recs.rarest.ri) recs.rarest = { id: f.id, name: f.name, species: f.species, ri, rarity: f.rarity };
      if (!recs.valuable || fishValue(f) > recs.valuable.value) recs.valuable = { id: f.id, name: f.name, species: f.species, value: fishValue(f) };
    }
    const owned = {};
    for (const f of fish) owned[f.species] = (owned[f.species] ?? 0) + 1;
    c.owned = owned;
    this.stat('rareOwned', fish.filter((f) => RARITIES.indexOf(f.rarity) >= 2).length, 'set');
    this.stat('marineOwned', fish.filter((f) => SPECIES_BY_ID[f.species].env === 'marine').length, 'set');
  }

  // --------------------------------------------------------------- wiring
  wire() {
    const map = {
      'fish:fed': (p) => {
        this.stat('feeds', 1);
        this.addXP(6, 'feed');
      },
      'fish:renamed': () => this.addXP(10, 'name'),
      'clean:patch': () => {
        this.stat('patches', 1);
        this.addXP(8, 'clean');
      },
      'plant:placed': () => {
        this.stat('placed', 1);
        this.addXP(12, 'plant');
      },
      'decor:placed': () => {
        this.stat('placed', 1);
        this.addXP(12, 'decor');
      },
      'plant:trimmed': () => {
        this.give({ coins: 25, xp: 10 }, 'trim');
      },
      'fish:bought': () => {
        this.stat('fishBought', 1);
        this.addXP(25, 'buy');
      },
      'fish:bred': () => {
        this.stat('breeds', 1);
        this.addXP(60, 'breed');
      },
      'fish:hatched': () => {
        this.stat('hatched', 1);
        this.addXP(40, 'hatch');
      },
      'fish:grew': (p) => {
        this.addXP(30, 'grow');
        if (p.stage === 'ADULT') this.stat('raised', 1);
      },
      'mutation': () => {
        this.stat('mutations', 1);
        this.give({ pearls: 3, xp: 80 }, 'mutation');
      },
      'photo:taken': () => {
        this.stat('photos', 1);
        this.addXP(15, 'photo');
      },
      'trick:learned': () => {
        this.stat('tricks', 1);
        this.give({ pearls: 2, xp: 60 }, 'trick');
      },
      'cat:petted': () => {
        this.stat('catPets', 1);
        this.addXP(5, 'cat');
      },
      'tank:upgraded': (p) => {
        if (['t180', 't300', 'twall', 'tshow'].includes(p.size)) this.stat('bigTank', 1, 'set');
        this.addXP(150, 'tank');
      },
      'tank:bought': () => this.addXP(150, 'tank'),
      'customize': () => this.stat('roomItems', 1),
      'water:changed': () => this.addXP(15, 'water'),
    };
    for (const [type, fn] of Object.entries(map)) bus.on(type, fn);
    // every event can progress quests
    bus.on('*', ({ type, payload }) => this.onEvent(type, payload ?? {}));
  }
}
