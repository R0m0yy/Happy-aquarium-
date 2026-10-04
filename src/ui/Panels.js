// Panel contents and their actions (tank, fish, shop, quests, collection,
// care, gallery, room, settings, mail...). Also the decorate / clean / photo
// mode toolbars and the fish card sub-panels.
import { icon } from './icons.js';
import { esc } from './UIManager.js';
import { bus } from '../core/EventBus.js';
import { SPECIES, SPECIES_BY_ID, RARITY_COLORS, PERSONALITY_TRAITS } from '../data/species.js';
import {
  FOODS, FOOD_BY_ID, PLANTS, PLANT_BY_ID, DECOR, DECOR_BY_ID, SUBSTRATES, BACKGROUNDS, LIGHTING, EQUIPMENT, EQUIPMENT_BY_ID, TANKS, TANK_BY_ID,
  ROOMS, ROOM_BY_ID, ROOM_OPTIONS, ROOM_OPTION_LABELS, CHARACTER_OPTIONS,
} from '../data/items.js';
import { ACHIEVEMENTS } from '../data/progression.js';
import { createFish, canBreed, describeGenome, express, fishValue, cap, MARKINGS } from '../systems/Genetics.js';
import { TRICKS } from '../systems/Simulation.js';
import { formatNumber, formatDuration, rating, clamp } from '../core/util.js';
import { allFish } from '../core/GameState.js';
import { phaseName } from '../render/TimeOfDay.js';

export const NEW_TANKS = [
  { id: 'nursery', name: 'Nursery Tank', size: 't20', env: 'fresh', type: 'nursery', price: 1200, unlock: 3, desc: 'A calm 20 gallon tank where eggs and fry grow up safely.' },
  { id: 'display', name: 'Second Display Tank', size: 't40', env: 'fresh', type: 'display', price: 3000, unlock: 4, desc: 'Another freshwater aquarium to design from scratch.' },
  { id: 'marine', name: 'Marine Reef Tank', size: 't75', env: 'marine', type: 'display', price: 9000, unlock: 7, desc: 'A saltwater aquarium for reef fish like clownfish and tangs.' },
];

const priceTag = (price, currency = 'coins') => (price ? `<span class="price">${icon(currency === 'pearls' ? 'pearl' : 'coin')}${formatNumber(price)}</span>` : '<span class="price" style="color:var(--green)">Free</span>');
const rarityPill = (r) => `<span class="pill" style="background:${RARITY_COLORS[r]}33;color:${RARITY_COLORS[r]}">${r}</span>`;
const pct = (v) => `${Math.round(v * 100)}%`;

export class Panels {
  constructor(ui) {
    this.ui = ui;
    this.tab = { shop: 'fish', quests: 'quests', fish: 'tank', room: 'rooms', collection: 'species', decor: 'rocks' };
    this.sel = {};
    this.samples = {};
    this.decorScaleOpen = false;
    this.confirmReset = false;
  }
  get game() {
    return this.ui.game;
  }
  get s() {
    return this.ui.game.state;
  }
  thumb(k, d) {
    return this.ui.thumb(k, d);
  }
  sample(spId) {
    if (!this.samples[spId]) this.samples[spId] = createFish(spId, { name: SPECIES_BY_ID[spId].name, sex: 'M' });
    return this.samples[spId];
  }
  tabs(panel, list) {
    return `<div class="tabs">${list.map(([id, label, ic]) => `<button class="tab ${this.tab[panel] === id ? 'active' : ''}" data-act="tab:${panel}:${id}">${ic ? icon(ic) : ''}${label}</button>`).join('')}</div>`;
  }

  render(name, arg) {
    const fn = this[`p_${name}`];
    return fn ? fn.call(this, arg) : null;
  }

  // ================================================================ TANK
  p_tank() {
    const g = this.game, s = this.s;
    const t = g.activeTank;
    const dim = TANK_BY_ID[t.size];
    const room = ROOM_BY_ID[s.room.id];
    const idx = TANKS.findIndex((x) => x.id === t.size);
    const next = TANKS[idx + 1];
    const beauty = g.beautyScore ?? g.sim.beauty(t);
    const w = t.water;
    const stat = (ic, label, v, cls, txt) => `<div class="stat">${icon(ic)}<span>${label}</span><div class="bar ${cls}"><div style="width:${pct(v)}"></div></div><span>${txt ?? rating(v).slice(0, 4)}</span></div>`;
    const tanks = s.tanks.map((tk) => `<div class="list-item">
        <div class="thumb-sm" style="display:grid;place-items:center;color:var(--cyan)">${icon(tk.env === 'marine' ? 'bubbles' : tk.type === 'nursery' ? 'egg' : 'tank')}</div>
        <div style="flex:1"><div class="title">${esc(tk.name)}</div><div class="sub">${TANK_BY_ID[tk.size].name} · ${tk.env === 'marine' ? 'Marine' : 'Freshwater'} · ${tk.fish.length} fish</div></div>
        ${tk.id === t.id ? '<span class="pill" style="color:var(--cyan)">Viewing</span>' : `<button class="btn sm primary" data-act="tank:switch:${tk.id}">View</button>`}
      </div>`).join('');
    const canUp = next && idx + 1 <= room.maxTank;
    const eq = ['filter', 'heater', 'air', 'co2', 'uv', 'feeder'].map((slot) => {
      const id = t.equipment[slot];
      return `<span class="pill">${esc(cap(slot))}: ${id ? esc(EQUIPMENT_BY_ID[id].name) : '—'}</span>`;
    }).join(' ');
    return {
      title: esc(t.name),
      icon: 'tank',
      body: `
        <div class="kv"><dt>Size</dt><dd>${dim.name} (${t.fish.length}/${dim.cap} fish)</dd><dt>Type</dt><dd>${t.env === 'marine' ? 'Marine reef' : 'Freshwater'}${t.type === 'nursery' ? ' nursery' : ''}</dd><dt>Beauty</dt><dd style="color:var(--gold)">${beauty} / 100</dd><dt>Time</dt><dd>${phaseName(g.timeOfDay)}</dd></div>
        <div class="section-title">Water</div>
        ${stat('water', 'Quality', w.quality, 'water')}
        ${stat('sparkle', 'Cleanliness', w.cleanliness, 'health')}
        ${stat('bubbles', 'Oxygen', w.oxygen, 'happy')}
        ${stat('sun', 'Temperature', clamp((w.temp - 18) / 14, 0, 1), 'hunger', `${w.temp.toFixed(1)}°`)}
        ${stat('fish', 'Population', clamp(t.fish.length / dim.cap, 0, 1), 'beauty', `${t.fish.length}/${dim.cap}`)}
        ${stat('decor', 'Algae', t.algae.level, 'hunger', pct(t.algae.level))}
        <div class="section-title">Equipment</div><div class="traits" style="display:flex;flex-wrap:wrap;gap:6px">${eq}</div>
        <div class="btn-row" style="margin-top:10px"><button class="btn sm" data-act="open:shop:equipment">${icon('filter')}Equipment Store</button><button class="btn sm" data-act="open:care">${icon('care')}Care</button></div>
        <div class="section-title">Upgrade</div>
        ${next ? `<div class="list-item"><div style="flex:1"><div class="title">${next.name}</div><div class="sub">${canUp ? `Room for ${next.cap} fish · physically larger tank` : `Your ${room.name} can't fit it — move to a bigger room`}${s.player.level < next.unlock ? ` · Requires Lv.${next.unlock}` : ''}</div></div>
          <button class="btn sm primary" data-act="tank:upgrade" ${canUp && s.player.level >= next.unlock ? '' : 'disabled'}>${priceTag(next.price, next.currency)}</button></div>` : '<div class="muted small">This is the largest aquarium available.</div>'}
        <div class="row" style="margin-top:4px"><span class="small muted">Rename:</span><input class="input" style="height:34px" id="tankName" value="${esc(t.name)}" maxlength="28"><button class="btn sm" data-act="tank:rename">${icon('check')}</button></div>
        <div class="section-title">Your Aquariums</div>${tanks}
        <div class="section-title">Add an Aquarium</div>
        ${NEW_TANKS.map((nt) => {
          const owned = nt.id !== 'display' && s.tanks.some((x) => (nt.id === 'nursery' ? x.type === 'nursery' : x.env === 'marine'));
          const locked = s.player.level < nt.unlock;
          return `<div class="list-item"><div style="flex:1"><div class="title">${nt.name}</div><div class="sub">${nt.desc}${locked ? ` · Requires Lv.${nt.unlock}` : ''}</div></div>
            ${owned ? '<span class="pill">Owned</span>' : `<button class="btn sm primary" data-act="tank:buy:${nt.id}" ${locked || s.tanks.length >= 5 ? 'disabled' : ''}>${priceTag(nt.price)}</button>`}</div>`;
        }).join('')}`,
    };
  }

  // ================================================================ FISH
  p_fish() {
    const g = this.game, s = this.s;
    const tab = this.tab.fish;
    let list;
    if (tab === 'tank') list = g.activeTank.fish.map((f) => [f, g.activeTank]);
    else if (tab === 'babies') list = s.tanks.flatMap((t) => t.fish.filter((f) => f.stage !== 'ADULT').map((f) => [f, t]));
    else list = s.tanks.flatMap((t) => t.fish.map((f) => [f, t]));
    const body = list.length ? list.map(([f, t]) => {
      const sp = SPECIES_BY_ID[f.species];
      const parents = f.parents ? `${esc(g.fishRecord(f.parents.mother)?.name ?? '?')} × ${esc(g.fishRecord(f.parents.father)?.name ?? '?')}` : '';
      return `<div class="list-item" data-act="fish:select:${f.id}" style="cursor:pointer">
        <div class="thumb-sm">${this.thumb('fish', f)}</div>
        <div style="flex:1;min-width:0"><div class="title">${esc(f.name)} ${f.favorite ? `<span style="color:var(--pink)">${icon('heartFill')}</span>` : ''}</div>
        <div class="sub">${esc(sp.name)} · ${esc(cap(f.stage.toLowerCase()))}${f.stage !== 'ADULT' ? ` ${pct(f.stageProgress ?? 0)}` : ''}${tab !== 'tank' ? ` · ${esc(t.name)}` : ''}</div>
        ${tab === 'babies' && parents ? `<div class="sub">Gen ${f.generation} · ${parents}</div>` : ''}
        ${tab === 'babies' ? `<div class="sub">${describeGenome(f.species, f.genome).slice(0, 2).map(esc).join(' · ')}</div>` : ''}</div>
        ${rarityPill(f.rarity)}</div>`;
    }).join('') : `<div class="empty">${icon(tab === 'babies' ? 'egg' : 'fish')}${tab === 'babies' ? 'No babies yet. Pair two compatible adults with Breed!' : 'No fish here yet. Visit the Store.'}</div>`;
    return {
      title: 'Fish',
      icon: 'fish',
      tabs: this.tabs('fish', [['tank', 'This Tank'], ['babies', 'Nursery', 'egg'], ['all', 'All Tanks']]),
      body: `${body}<div class="btn-row" style="margin-top:8px"><button class="btn sm" data-act="open:collection">${icon('book')}Collection Book</button><button class="btn sm" data-act="open:shop:fish">${icon('shop')}Buy Fish</button></div>`,
    };
  }

  // ============================================================== PLANTS
  p_plants() {
    const g = this.game;
    const t = g.activeTank;
    const over = t.plants.filter((p) => p.growth >= 1).length;
    const rows = t.plants.map((p) => {
      const def = PLANT_BY_ID[p.plantId];
      return `<div class="list-item"><div class="thumb-sm">${this.thumb('plant', p.plantId)}</div>
        <div style="flex:1"><div class="title">${esc(def.name)}${p.bloom ? ' <span class="pill" style="color:#ffb0d0">Blooming</span>' : ''}</div>
        <div class="stat" style="grid-template-columns:60px 1fr 40px;margin:2px 0"><span class="small muted">Growth</span><div class="bar health"><div style="width:${pct(Math.min(1, p.growth / 1.3))}"></div></div><span class="small">${pct(p.growth)}</span></div></div>
        ${p.growth >= 0.85 ? `<button class="btn sm" data-act="care:trim:${p.uid}">${icon('scissors')}Trim</button>` : ''}</div>`;
    }).join('');
    const inv = Object.entries(this.s.inventory.plants).filter(([, n]) => n > 0);
    return {
      title: 'Plants',
      icon: 'plant',
      body: `<div class="row"><div class="muted small" style="flex:1">${t.plants.length} plants growing · growth rate ×${g.plants.growthRate(t).toFixed(2)}</div>${over ? `<button class="btn sm good" data-act="care:trim:all">${icon('scissors')}Trim all (${over})</button>` : ''}</div>
        ${inv.length ? `<div class="section-title">Ready to plant</div>${inv.map(([id, n]) => `<div class="list-item"><div class="thumb-sm">${this.thumb('plant', id)}</div><div style="flex:1"><div class="title">${esc(PLANT_BY_ID[id].name)} ×${n}</div></div><button class="btn sm primary" data-act="deco:place:plant:${id}">Plant</button></div>`).join('')}` : ''}
        <div class="section-title">In this tank</div>${rows || `<div class="empty">${icon('plant')}No plants yet.</div>`}
        <div class="btn-row"><button class="btn sm primary" data-act="decor:plants">${icon('decorate')}Add Plants</button><button class="btn sm" data-act="open:shop:plants">${icon('shop')}Plant Shop</button></div>`,
    };
  }

  // ================================================================ SHOP
  shopEntries(tab) {
    const s = this.s;
    const lvl = s.player.level;
    const t = this.game.activeTank;
    switch (tab) {
      case 'fish':
        return SPECIES.map((sp) => ({ kind: 'fish', id: sp.id, name: sp.name, price: sp.price, unlock: sp.unlock.level, thumb: ['fish', this.sample(sp.id)], rarity: sp.rarity, meta: sp.env === 'marine' ? 'Marine' : 'Freshwater', owned: s.collection.owned[sp.id] }));
      case 'plants':
        return PLANTS.map((p) => ({ kind: 'plant', id: p.id, name: p.name, price: p.price, unlock: p.unlock, thumb: ['plant', p.id], owned: s.inventory.plants[p.id] }));
      case 'decor':
        return DECOR.map((d) => ({ kind: 'decor', id: d.id, name: d.name, price: d.price, currency: d.currency, unlock: d.unlock, thumb: ['decor', d.id], meta: cap(d.cat), owned: s.inventory.decor[d.id] }));
      case 'food':
        return FOODS.map((f) => ({ kind: 'food', id: f.id, name: f.name, price: f.price, currency: f.currency, unlock: f.unlock ?? 1, ic: 'feed', meta: f.price ? '+10 servings' : 'Unlimited', owned: s.inventory.food[f.id] === -1 ? '∞' : s.inventory.food[f.id] }));
      case 'equipment':
        return [
          ...EQUIPMENT.map((e) => ({ kind: 'equipment', id: e.id, name: e.name, price: e.price, currency: e.currency, unlock: e.unlock ?? 1, ic: e.slot === 'filter' ? 'filter' : e.slot === 'air' ? 'bubbles' : e.slot === 'heater' ? 'sun' : e.slot === 'feeder' ? 'feed' : 'sparkle', meta: cap(e.slot), owned: s.inventory.equipment.includes(e.id) ? (t.equipment[e.slot] === e.id ? 'In use' : 'Owned') : null })),
          ...SUBSTRATES.map((x) => ({ kind: 'substrate', id: x.id, name: x.name, price: x.price, currency: x.currency, unlock: 1, ic: 'decor', meta: 'Substrate', owned: s.inventory.substrates.includes(x.id) ? (t.substrate === x.id ? 'In use' : 'Owned') : null })),
          ...BACKGROUNDS.map((x) => ({ kind: 'background', id: x.id, name: x.name, price: x.price, currency: x.currency, unlock: 1, ic: 'backgrounds', meta: 'Background', owned: s.inventory.backgrounds.includes(x.id) ? (t.background === x.id ? 'In use' : 'Owned') : null })),
          ...LIGHTING.map((x) => ({ kind: 'lighting', id: x.id, name: x.name, price: x.price, currency: x.currency, unlock: 1, ic: 'sun', meta: 'Lighting', owned: s.inventory.lighting.includes(x.id) ? (t.lighting === x.id ? 'In use' : 'Owned') : null })),
        ];
      default:
        return [];
    }
  }

  p_shop(arg) {
    if (arg) this.tab.shop = arg === 'tanks' ? 'tanks' : arg;
    const tab = this.tab.shop;
    if (tab === 'tanks') return { ...this.p_tank(), title: 'Store · Aquariums', tabs: this.shopTabs() };
    if (tab === 'room') return { ...this.p_room(), title: 'Store · Room', tabs: this.shopTabs() };
    const entries = this.shopEntries(tab);
    const lvl = this.s.player.level;
    const sel = this.sel.shop?.tab === tab ? entries.find((e) => e.id === this.sel.shop.id) : null;
    const card = (e) => {
      const locked = lvl < e.unlock;
      return `<button class="card ${locked ? 'locked' : ''} ${sel?.id === e.id ? 'selected' : ''}" data-act="shop:sel:${tab}:${e.id}">
        <div class="thumb">${e.thumb ? this.thumb(...e.thumb) : `<span style="width:44px;height:44px;color:var(--cyan)">${icon(e.ic ?? 'sparkle')}</span>`}</div>
        ${locked ? `<span class="lockico">${icon('lock')}</span>` : ''}${e.owned ? `<span class="pill count-pill">${typeof e.owned === 'number' ? `×${e.owned}` : esc(e.owned)}</span>` : ''}
        <div class="name">${esc(e.name)}</div>
        <div class="meta">${locked ? `Lv.${e.unlock}` : priceTag(e.price, e.currency)}${e.rarity ? rarityPill(e.rarity) : ''}${e.meta ? `<span>${esc(e.meta)}</span>` : ''}</div>
      </button>`;
    };
    return {
      title: 'Store',
      icon: 'store',
      cls: 'wide',
      tabs: this.shopTabs(),
      body: `${sel ? this.shopDetail(sel) : `<div class="muted small" style="margin-bottom:10px">Select an item to preview it.</div>`}<div class="grid">${entries.map(card).join('')}</div>`,
      after: (panel) => {
        if (sel?.kind === 'fish' || sel?.kind === 'plant' || sel?.kind === 'decor') {
          const host = panel.querySelector('#livePreview');
          if (host) this.game.preview.startLive(sel.kind, sel.kind === 'fish' ? this.sample(sel.id) : sel.id, host);
        }
      },
    };
  }
  shopTabs() {
    return this.tabs('shop', [['fish', 'Fish', 'fish'], ['plants', 'Plants', 'plant'], ['decor', 'Decor', 'decor'], ['food', 'Food', 'feed'], ['equipment', 'Equipment', 'filter'], ['tanks', 'Aquariums', 'tank'], ['room', 'Room', 'home']]);
  }
  shopDetail(e) {
    const lvl = this.s.player.level;
    const t = this.game.activeTank;
    let info = '', desc = '';
    if (e.kind === 'fish') {
      const sp = SPECIES_BY_ID[e.id];
      desc = sp.desc;
      const compatible = sp.env === t.env;
      const tempOk = t.water.temp >= sp.temp[0] - 1 && t.water.temp <= sp.temp[1] + 1;
      info = `<div class="kv"><dt>Adult size</dt><dd>${Math.round(sp.adultSize * 100)} cm-scale · ${esc(sp.sci)}</dd><dt>Social</dt><dd>${cap(sp.social)}</dd><dt>Diet</dt><dd>${sp.diet.map(cap).join(', ')}</dd><dt>Temperature</dt><dd>${sp.temp[0]}–${sp.temp[1]}°C</dd>
        <dt>Compatibility</dt><dd style="color:${compatible && tempOk ? 'var(--green)' : 'var(--gold)'}">${!compatible ? `Needs a ${sp.env === 'marine' ? 'marine' : 'freshwater'} tank` : tempOk ? 'Great fit for this tank' : 'Consider a heater'}</dd></div>`;
    } else if (e.kind === 'plant') {
      const p = PLANT_BY_ID[e.id];
      desc = p.desc;
      info = `<div class="kv"><dt>Height</dt><dd>${Math.round(p.height * 100)} cm-scale</dd><dt>Placement</dt><dd>${cap(p.zone)}</dd><dt>Growth</dt><dd>${p.growth > 0.55 ? 'Fast' : p.growth > 0.35 ? 'Medium' : 'Slow'}</dd></div>`;
    } else if (e.kind === 'decor') {
      const d = DECOR_BY_ID[e.id];
      desc = d.cave ? 'A hideaway for shy fish — they will rest and hide inside.' : d.cat === 'driftwood' ? 'Natural wood that shy fish and plecos love to explore.' : d.cat === 'rocks' ? 'Natural hardscape stone for building your aquascape.' : 'A decorative centerpiece for your aquascape.';
      info = `<div class="kv"><dt>Category</dt><dd>${cap(d.cat)}</dd><dt>Owned</dt><dd>${this.s.inventory.decor[e.id] ?? 0}</dd></div>`;
    } else if (e.kind === 'food') {
      desc = FOOD_BY_ID[e.id].desc;
      info = `<div class="kv"><dt>Type</dt><dd>${cap(FOOD_BY_ID[e.id].kind)}</dd><dt>In stock</dt><dd>${this.s.inventory.food[e.id] === -1 ? 'Unlimited' : this.s.inventory.food[e.id] ?? 0}</dd><dt>Selected</dt><dd>${this.s.selectedFood === e.id ? 'Yes' : 'No'}</dd></div>`;
    } else {
      const src = { equipment: EQUIPMENT, substrate: SUBSTRATES, background: BACKGROUNDS, lighting: LIGHTING }[e.kind].find((x) => x.id === e.id);
      desc = src.desc;
    }
    const locked = lvl < e.unlock;
    const owned = e.owned && (e.kind === 'equipment' || e.kind === 'substrate' || e.kind === 'background' || e.kind === 'lighting');
    let btn;
    if (locked) btn = `<button class="btn" disabled>${icon('lock')}Unlocks at Lv.${e.unlock}</button>`;
    else if (owned) btn = e.owned === 'In use' ? '<button class="btn" disabled>In use</button>' : `<button class="btn primary" data-act="shop:use:${e.kind}:${e.id}">Use in this tank</button>`;
    else btn = `<button class="btn primary" data-act="shop:buy:${e.kind}:${e.id}">Buy ${priceTag(e.price, e.currency)}</button>`;
    const extra = e.kind === 'food' && (this.s.inventory.food[e.id] ?? 0) !== 0 ? `<button class="btn" data-act="shop:selectfood:${e.id}">Use for feeding</button>` : '';
    const place = (e.kind === 'plant' || e.kind === 'decor') && (e.owned ?? 0) > 0 ? `<button class="btn good" data-act="deco:place:${e.kind}:${e.id}">Place in tank</button>` : '';
    const hasPreview = ['fish', 'plant', 'decor'].includes(e.kind);
    return `<div class="detail"><div class="preview" id="livePreview">${hasPreview ? '' : `<div style="display:grid;place-items:center;height:100%;color:var(--cyan)"><span style="width:64px;height:64px">${icon(e.ic ?? 'sparkle')}</span></div>`}</div>
      <div><h3>${esc(e.name)}</h3><div class="row">${e.rarity ? rarityPill(e.rarity) : ''}${priceTag(e.price, e.currency)}<span class="muted small">${locked ? `Requires Lv.${e.unlock}` : 'Available'}</span></div>
      <p>${esc(desc)}</p>${info}<div class="btn-row" style="margin-top:10px">${btn}${extra}${place}</div></div></div>`;
  }

  // ============================================================== QUESTS
  p_quests() {
    const pg = this.game.progression;
    const s = this.s;
    if (this.tab.quests === 'achievements') {
      return {
        title: 'Quests',
        icon: 'quests',
        tabs: this.tabs('quests', [['quests', 'Quests'], ['achievements', 'Achievements', 'trophy']]),
        body: ACHIEVEMENTS.map((a) => {
          const got = s.achievements.unlocked.includes(a.id);
          const v = Math.min(a.goal, s.stats[a.stat] ?? 0);
          return `<div class="list-item quest ${got ? 'done' : ''}"><span style="width:30px;height:30px;color:${got ? 'var(--gold)' : 'var(--dim)'}">${icon('trophy')}</span>
            <div style="flex:1"><div class="title">${a.name}</div><div class="sub">${esc(a.desc)}</div>
            <div class="bar beauty progress"><div style="width:${pct(v / a.goal)}"></div></div></div><div class="small muted">${v}/${a.goal}</div></div>`;
        }).join(''),
      };
    }
    const active = pg.activeQuests();
    return {
      title: 'Quests',
      icon: 'quests',
      tabs: this.tabs('quests', [['quests', 'Quests'], ['achievements', 'Achievements', 'trophy']]),
      body: (active.length ? active.map((q) => {
        const done = s.quests.completed.includes(q.id);
        const p = Math.min(q.count, pg.questProgress(q.id));
        const r = q.reward;
        return `<div class="list-item quest ${done ? 'done' : ''}" style="display:block">
          <div class="row"><div style="flex:1"><div class="title">${esc(q.title)}</div><div class="sub">${esc(q.desc)}</div></div>
          ${done ? `<button class="btn sm good" data-act="quest:claim:${q.id}">${icon('check')}Claim</button>` : `<span class="small muted">${p}/${q.count}</span>`}</div>
          <div class="bar health progress"><div style="width:${pct(p / q.count)}"></div></div>
          <div class="reward" style="margin-top:6px">${r.coins ? `<span class="price">${icon('coin')}${r.coins}</span>` : ''}${r.pearls ? `<span class="price">${icon('pearl')}${r.pearls}</span>` : ''}${r.xp ? `<span class="small muted">+${r.xp} XP</span>` : ''}</div></div>`;
      }).join('') : `<div class="empty">${icon('trophy')}All quests complete — you are a master aquarist!</div>`) + `<div class="muted small" style="margin-top:8px">${s.quests.claimed.length} quests completed</div>`,
    };
  }

  // ============================================================== EVENTS
  p_events() {
    const le = this.game.progression.liveEvent();
    const d = le.def;
    const done = le.progress >= d.count;
    const log = this.s.notifications.slice(0, 20);
    return {
      title: 'Events',
      icon: 'events',
      body: `<div class="list-item quest ${done ? 'done' : ''}" style="display:block"><div class="row"><span style="width:34px;height:34px;color:var(--gold)">${icon('events')}</span>
        <div style="flex:1"><div class="title">${esc(d.name)}</div><div class="sub">${esc(d.desc)} · ends in ${formatDuration(le.endsIn)}</div></div>
        ${le.claimed ? '<span class="pill">Claimed</span>' : done ? `<button class="btn sm good" data-act="event:claim">Claim</button>` : `<span class="small muted">${le.progress}/${d.count}</span>`}</div>
        <div class="bar beauty progress"><div style="width:${pct(le.progress / d.count)}"></div></div>
        <div class="reward" style="margin-top:6px"><span class="price">${icon('coin')}${d.reward.coins}</span><span class="price">${icon('pearl')}${d.reward.pearls}</span></div></div>
        <div class="section-title">Aquarium Diary</div>
        ${log.length ? log.map((n) => `<div class="list-item"><span style="width:22px;height:22px;color:var(--cyan)">${icon(n.icon ?? 'sparkle')}</span><div style="flex:1"><div class="title" style="font-size:13px">${esc(n.title)}</div>${n.sub ? `<div class="sub">${esc(n.sub)}</div>` : ''}</div><span class="small muted">${new Date(n.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('') : `<div class="empty">${icon('events')}Life in your aquarium will be recorded here.</div>`}`,
    };
  }
  p_notifications() {
    return { ...this.p_events(), title: 'Notifications', icon: 'bell' };
  }

  // ========================================================== COLLECTION
  p_collection() {
    const s = this.s;
    const c = s.collection;
    const tab = this.tab.collection;
    if (tab === 'records') {
      const r = c.records;
      const rec = (label, x, val) => `<div class="list-item"><div style="flex:1"><div class="title">${label}</div><div class="sub">${x ? `${esc(x.name)} · ${esc(SPECIES_BY_ID[x.species]?.name ?? '')}` : '—'}</div></div><span class="pill">${x ? val : ''}</span></div>`;
      return {
        title: 'Collection Book', icon: 'book', cls: 'wide', tabs: this.collTabs(),
        body: `${rec('Largest Fish', r.largest, `${r.largest?.len} cm`)}${rec('Oldest Fish', r.oldest, formatDuration(r.oldest?.age ?? 0))}${rec('Rarest Fish', r.rarest, r.rarest?.rarity)}${rec('Most Valuable', r.valuable, `${formatNumber(r.valuable?.value ?? 0)} coins`)}
          <div class="section-title">Mutations discovered (${c.mutations.length})</div><div style="display:flex;flex-wrap:wrap;gap:6px">${c.mutations.map((m) => `<span class="pill" style="color:#ff9ac0">${esc(m)}</span>`).join('') || '<span class="muted small">Breed fish to discover mutations.</span>'}</div>
          <div class="section-title">Breeding records</div>${c.breedingRecords.map((b) => `<div class="list-item"><div style="flex:1"><div class="title" style="font-size:13px">${esc(b.mother)} × ${esc(b.father)}</div><div class="sub">${esc(SPECIES_BY_ID[b.species].name)} · ${b.count} babies${b.mutations ? ` · ${b.mutations} mutated` : ''}</div></div><span class="small muted">${new Date(b.time).toLocaleDateString()}</span></div>`).join('') || '<div class="muted small">No breeding yet.</div>'}`,
      };
    }
    const disc = Object.keys(c.discovered).length;
    return {
      title: 'Collection Book', icon: 'book', cls: 'wide', tabs: this.collTabs(),
      body: `<div class="muted small" style="margin-bottom:10px">${disc} / ${SPECIES.length} species discovered · ${Object.values(c.variants).reduce((a, v) => a + v.length, 0)} colour variants</div>
        <div class="grid">${SPECIES.map((sp) => {
          const known = !!c.discovered[sp.id];
          return `<div class="card"><div class="thumb ${known ? '' : 'silhouette'}">${this.thumb('fish', this.sample(sp.id))}</div>
            <div class="name">${known ? esc(sp.name) : '???'}</div><div class="meta">${known ? `${rarityPill(sp.rarity)}<span>Owned ${c.owned[sp.id] ?? 0}</span><span>${(c.variants[sp.id] ?? []).length} variants</span>` : `<span>${sp.env === 'marine' ? 'Marine' : 'Freshwater'} · Lv.${sp.unlock.level}</span>`}</div></div>`;
        }).join('')}</div>`,
    };
  }
  collTabs() {
    return this.tabs('collection', [['species', 'Species', 'fish'], ['records', 'Records', 'trophy']]);
  }

  // ================================================================ CARE
  p_care() {
    const g = this.game, t = g.activeTank, w = t.water;
    const over = t.plants.filter((p) => p.growth >= 1).length;
    const r = rating(w.quality);
    const advice = w.cleanliness < 0.6 ? 'The water is getting cloudy — a water change will help.' : t.algae.level > 0.4 ? 'Algae is building up on the glass. Give it a wipe!' : t.debris > 0.3 ? 'Leftover food and debris — vacuum the gravel.' : t.filterHealth < 0.5 ? 'The filter needs maintenance.' : 'Everything looks great. Your fish are comfortable.';
    const act = (cmd, ic, title, sub, disabled) => `<button class="list-item" style="width:100%;text-align:left" data-act="${cmd}" ${disabled ? 'disabled' : ''}><span style="width:30px;height:30px;color:var(--cyan)">${icon(ic)}</span><div style="flex:1"><div class="title">${title}</div><div class="sub">${sub}</div></div>${icon('chevronRight')}</button>`;
    return {
      title: 'Care',
      icon: 'care',
      cls: 'right',
      body: `<div class="list-item" style="display:block"><div class="row"><span class="title" style="flex:1">Water Quality</span><span class="pill" style="color:${w.quality > 0.65 ? 'var(--green)' : w.quality > 0.45 ? 'var(--gold)' : 'var(--danger)'}">${r}</span></div><div class="sub" style="margin-top:4px">${advice}</div></div>
        ${act('care:wipe', 'wipe', 'Wipe Glass', `Scrub algae with your finger or mouse · ${pct(t.algae.level)} algae`)}
        ${act('care:vacuum', 'vacuum', 'Vacuum Gravel', `Drag across the substrate · ${pct(t.debris ?? 0)} debris`)}
        ${act('care:water', 'water', 'Water Change', `Refresh 30% of the water · cleanliness ${pct(w.cleanliness)}`, g.waterChanging)}
        ${act('care:filter', 'filter', 'Filter Maintenance', `Rinse the filter media · filter ${pct(t.filterHealth)}`)}
        ${act('care:trim:all', 'scissors', 'Trim Plants', over ? `${over} overgrown plants` : 'Nothing to trim right now', !over)}
        <div class="section-title">Feeding</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${FOODS.filter((f) => (this.s.inventory.food[f.id] ?? 0) !== 0).map((f) => `<button class="chip ${this.s.selectedFood === f.id ? 'selected' : ''}" data-act="shop:selectfood:${f.id}">${esc(f.name)} ${this.s.inventory.food[f.id] === -1 ? '' : `×${this.s.inventory.food[f.id]}`}</button>`).join('')}</div>
        <div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="feed">${icon('feed')}Feed now</button><button class="btn" data-act="open:shop:food">${icon('shop')}More food</button></div>`,
    };
  }

  liveRefresh() {
    // keep live stat panels fresh without resetting scroll
    if (!this._lr || performance.now() - this._lr > 2500) {
      this._lr = performance.now();
      this.ui.renderPanel();
    }
  }

  // ============================================================= GALLERY
  p_gallery() {
    const photos = this.s.photos;
    return {
      title: 'Gallery',
      icon: 'gallery',
      cls: 'wide',
      body: photos.length ? `<div class="photo-grid">${photos.map((p) => `<div class="ph"><img data-photo="${p.id}" src="${this.game.photoCache.get(p.id) ?? ''}" data-act="photo:view:${p.id}" alt="">
          <div class="ph-actions"><button class="icon-btn" style="background:rgba(0,0,0,.5)" data-act="photo:dl:${p.id}" title="Download">${icon('download')}</button><button class="icon-btn" style="background:rgba(0,0,0,.5)" data-act="photo:del:${p.id}" title="Delete">${icon('trash')}</button></div></div>`).join('')}</div>`
        : `<div class="empty">${icon('photo')}No photos yet. Tap Photo to capture your aquarium.</div><div style="text-align:center"><button class="btn primary" data-act="mode:photo">${icon('photo')}Photo mode</button></div>`,
      after: (panel) => {
        panel.querySelectorAll('img[data-photo]').forEach((img) => {
          if (!img.getAttribute('src')) this.game.loadPhoto(img.dataset.photo).then((u) => u && (img.src = u));
        });
      },
    };
  }

  // ================================================================ ROOM
  p_room(arg) {
    if (arg === 'keeper') this.tab.room = 'keeper';
    const s = this.s;
    const tab = this.tab.room;
    const tabs = this.tabs('room', [['rooms', 'Rooms', 'home'], ['custom', 'Customize', 'decorate'], ['keeper', 'Keeper', 'user']]);
    if (tab === 'keeper') {
      const c = s.character;
      const sw = (key, list) => `<div class="swatches">${list.map((col) => `<button class="swatch ${c[key] === col ? 'selected' : ''}" style="background:${col}" data-act="look:${key}:${col.slice(1)}"></button>`).join('')}</div>`;
      const chips = (key, list) => `<div style="display:flex;flex-wrap:wrap;gap:6px">${list.map((o) => `<button class="chip ${c[key] === o.id ? 'selected' : ''}" data-act="look:${key}:${o.id}">${esc(o.name)}</button>`).join('')}</div>`;
      return {
        title: 'Aquarium Room', icon: 'home', tabs,
        body: `<div class="row"><span class="small muted">Name</span><input class="input" style="height:36px" id="playerName" value="${esc(s.player.name)}" maxlength="24"><button class="btn sm" data-act="room:name">${icon('check')}</button></div>
          <div class="section-title">Skin tone</div>${sw('skin', CHARACTER_OPTIONS.skin)}
          <div class="section-title">Hairstyle</div>${chips('hairStyle', CHARACTER_OPTIONS.hairStyle)}
          <div class="section-title">Hair colour</div>${sw('hairColor', CHARACTER_OPTIONS.hairColor)}
          <div class="section-title">Top</div>${chips('top', CHARACTER_OPTIONS.top)}<div style="height:8px"></div>${sw('topColor', CHARACTER_OPTIONS.topColor)}
          <div class="section-title">Pants</div>${sw('pants', CHARACTER_OPTIONS.pants)}
          <div class="section-title">Shoes</div>${sw('shoes', CHARACTER_OPTIONS.shoes)}
          <div class="section-title">Accessory</div>${chips('accessory', CHARACTER_OPTIONS.accessory)}`,
      };
    }
    if (tab === 'custom') {
      const locked = !this.game.progression.feature('roomCustom');
      const o = s.room.options, owned = s.room.ownedOptions;
      return {
        title: 'Aquarium Room', icon: 'home', tabs,
        body: locked ? `<div class="empty">${icon('lock')}Room customization unlocks at Lv.2</div>` : Object.entries(ROOM_OPTIONS).map(([catId, list]) => `<div class="section-title">${ROOM_OPTION_LABELS[catId]}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${list.map((x) => {
            const has = owned[catId]?.includes(x.id) || !x.price;
            const on = o[catId] === x.id;
            return `<button class="chip ${on ? 'selected' : ''}" data-act="room:opt:${catId}:${x.id}">${x.color ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${x.color};margin-right:6px;vertical-align:-1px"></span>` : ''}${esc(x.name)} ${has ? '' : priceTag(x.price)}</button>`;
          }).join('')}</div>`).join(''),
      };
    }
    return {
      title: 'Aquarium Room', icon: 'home', tabs,
      body: ROOMS.map((r) => {
        const own = s.room.owned.includes(r.id);
        const lock = s.player.level < r.unlock;
        return `<div class="list-item"><span style="width:30px;height:30px;color:${s.room.id === r.id ? 'var(--cyan)' : 'var(--muted)'}">${icon('home')}</span><div style="flex:1"><div class="title">${esc(r.name)}</div><div class="sub">${esc(r.desc)} · up to ${TANKS[r.maxTank].name}${lock ? ` · Lv.${r.unlock}` : ''}</div></div>
          ${s.room.id === r.id ? '<span class="pill" style="color:var(--cyan)">Home</span>' : own ? `<button class="btn sm primary" data-act="room:move:${r.id}">Move in</button>` : `<button class="btn sm primary" data-act="room:buy:${r.id}" ${lock ? 'disabled' : ''}>${priceTag(r.price, r.currency)}</button>`}</div>`;
      }).join(''),
    };
  }

  // ============================================================ SETTINGS
  p_settings() {
    const st = this.s.settings;
    const q = ['auto', 'low', 'medium', 'high', 'ultra'];
    return {
      title: 'Settings',
      icon: 'settings',
      cls: 'right',
      body: `<div class="section-title">Graphics</div><div style="display:flex;flex-wrap:wrap;gap:6px">${q.map((x) => `<button class="chip ${st.quality === x ? 'selected' : ''}" data-act="set:quality:${x}">${x.toUpperCase()}</button>`).join('')}</div>
        <div class="muted small" style="margin-top:6px">Active: ${this.game.renderer.qualityName.toUpperCase()}. High/Ultra add sharper shadows, tank shadows, more bubbles & particles and richer caustics.</div>
        <div class="row" style="margin-top:10px"><span style="flex:1;font-weight:700">Show FPS</span><button class="toggle ${st.showFps ? 'on' : ''}" data-act="set:fps"></button></div>
        <div class="section-title">Audio</div>
        ${['music', 'sfx', 'ambience'].map((k) => `<div class="row" style="margin:6px 0"><span style="width:90px;font-weight:700">${{ music: 'Music', sfx: 'Effects', ambience: 'Ambience' }[k]}</span><input type="range" min="0" max="1" step="0.05" value="${st[k]}" data-set="${k}"></div>`).join('')}
        <div class="row"><span style="flex:1;font-weight:700">Mute all</span><button class="toggle ${st.muted ? 'on' : ''}" data-act="set:mute"></button></div>
        <div class="section-title">Time of day</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${[['cycle', 'Day cycle'], ['real', 'Real clock'], ['morning', 'Morning'], ['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']].map(([id, l]) => `<button class="chip ${st.timeMode === id ? 'selected' : ''}" data-act="set:time:${id}">${l}</button>`).join('')}</div>
        <div class="row" style="margin-top:8px"><span style="width:120px;font-weight:700">Cycle length</span><input type="range" min="6" max="60" step="2" value="${st.cycleMinutes}" data-set="cycleMinutes"><span class="small muted" style="width:50px">${st.cycleMinutes}m</span></div>
        <div class="section-title">Controls</div>
        <div class="kv small"><dt>Select fish</dt><dd>Click / tap</dd><dt>Look around</dt><dd>Drag</dd><dt>Pan</dt><dd>Right-drag / two fingers</dd><dt>Zoom</dt><dd>Wheel / pinch</dd><dt>Details</dt><dd>Long-press a fish</dd><dt>Decorate</dt><dd>Drag objects · R rotate · [ ] scale · Del</dd></div>
        <div class="section-title">Game</div>
        <div class="btn-row"><button class="btn" data-act="set:save">${icon('download')}Save now</button><button class="btn" data-act="set:tutorial">Replay tutorial</button><button class="btn" data-act="set:intro">Replay intro</button></div>
        <div class="btn-row" style="margin-top:8px"><button class="btn danger" data-act="set:reset">${this.confirmReset ? 'Tap again to erase everything' : 'Reset save'}</button></div>
        <div class="muted small" style="margin-top:10px">Saved locally on this device (IndexedDB). Last save ${new Date(this.s.lastSaved).toLocaleTimeString()}.</div>`,
    };
  }
  onInput(e) {
    const k = e.target.dataset?.set;
    if (!k) return;
    const v = parseFloat(e.target.value);
    this.s.settings[k] = v;
    if (k === 'cycleMinutes') e.target.nextElementSibling.textContent = `${v}m`;
    else this.game.audio.setVolumes({ [k]: v });
  }

  // ================================================================ MAIL
  p_mail() {
    const inbox = this.s.inbox;
    return {
      title: 'Mail',
      icon: 'mail',
      cls: 'right',
      body: inbox.length ? inbox.map((m) => `<div class="list-item" style="display:block"><div class="row"><div style="flex:1"><div class="title">${esc(m.title)}</div><div class="sub">${esc(m.body)}</div></div>
        ${m.claimed ? '<span class="pill">Claimed</span>' : `<button class="btn sm good" data-act="mail:claim:${m.id}">Claim</button>`}</div>
        ${m.reward ? `<div class="reward" style="margin-top:6px">${m.reward.coins ? `<span class="price">${icon('coin')}${m.reward.coins}</span>` : ''}${m.reward.pearls ? `<span class="price">${icon('pearl')}${m.reward.pearls}</span>` : ''}</div>` : ''}</div>`).join('') : `<div class="empty">${icon('mail')}No mail.</div>`,
    };
  }

  // ============================================================== FAMILY
  p_family(id) {
    const g = this.game;
    const rec = g.fishRecord(id ?? this.ui.fishCardId);
    if (!rec) return { title: 'Family Tree', icon: 'family', body: `<div class="empty">${icon('family')}Select a fish first.</div>` };
    const node = (r, self = false) => r ? `<div class="tree-node ${self ? 'self' : ''}" ${g.findFish(r.id) ? `data-act="fish:select:${r.id}"` : ''}>${this.thumb('fish', r)}<div>${esc(r.name)}</div><div class="sub">${esc(SPECIES_BY_ID[r.species].name)}${g.findFish(r.id) ? '' : ' · gone'}</div><div class="sub">Gen ${r.generation ?? 1} · ${r.rarity}</div></div>` : '<div class="tree-node"><div class="sub">Unknown</div></div>';
    const mother = rec.parents ? g.fishRecord(rec.parents.mother) : null;
    const father = rec.parents ? g.fishRecord(rec.parents.father) : null;
    const gp = [mother, father].flatMap((p) => (p?.parents ? [g.fishRecord(p.parents.mother), g.fishRecord(p.parents.father)] : [])).filter(Boolean);
    const kids = (rec.children ?? []).map((c) => g.fishRecord(c)).filter(Boolean);
    const ph = express(rec.species, rec.genome);
    return {
      title: `${esc(rec.name)}'s Family`,
      icon: 'family',
      cls: 'wide',
      body: `<div class="tree">
        ${gp.length ? `<div class="small muted">Grandparents</div><div class="tree-row">${gp.map((x) => node(x)).join('')}</div><div class="tree-link"></div>` : ''}
        ${rec.parents ? `<div class="small muted">Parents</div><div class="tree-row">${node(mother)}${node(father)}</div><div class="tree-link"></div>` : '<div class="small muted">Wild-caught founder</div>'}
        <div class="tree-row">${node(rec, true)}</div>
        ${kids.length ? `<div class="tree-link"></div><div class="small muted">Children (${kids.length})</div><div class="tree-row">${kids.slice(0, 18).map((x) => node(x)).join('')}</div>` : ''}
      </div>
      <div class="section-title">Inherited traits</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${describeGenome(rec.species, rec.genome).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}<span class="pill">Generation ${rec.generation ?? 1}</span></div>
      ${rec.genome.mutations?.length ? `<div class="section-title">Mutations</div><div style="display:flex;flex-wrap:wrap;gap:6px">${rec.genome.mutations.map((m) => `<span class="pill" style="color:#ff9ac0">${esc(m)}</span>`).join('')}</div>` : ''}
      <div class="section-title">Genotype</div>
      <div class="kv small"><dt>Pattern</dt><dd>${rec.genome.pattern.map(cap).join(' / ')} → ${cap(ph.pattern)}</dd><dt>Fins</dt><dd>${rec.genome.fin.map(cap).join(' / ')} → ${cap(ph.fin)}</dd><dt>Fin length</dt><dd>${ph.finLength.toFixed(2)}</dd><dt>Body size</dt><dd>${ph.size.toFixed(2)}</dd><dt>Eyes</dt><dd>${rec.genome.eye.map(cap).join(' / ')}</dd><dt>Marking</dt><dd>${rec.genome.marking.map(cap).join(' / ')}</dd><dt>Glow</dt><dd>${rec.genome.glow.join(' / ')}</dd></div>`,
    };
  }

  // ======================================================= FISH SUB VIEWS
  fishSub(rec, sub) {
    const g = this.game, s = this.s;
    switch (sub) {
      case 'rename':
        return `<div class="row"><input class="input" id="renameInput" value="${esc(rec.name)}" maxlength="18"><button class="btn primary sm" data-act="fish:renameOk:${rec.id}">${icon('check')}</button></div>`;
      case 'train': {
        if (!g.progression.feature('training')) return `<div class="muted small">${icon('lock')} Training unlocks at Lv.4.</div>`;
        return `<div class="small muted" style="margin-bottom:6px">Bond ${pct(rec.bond)} — training builds trust.</div>${TRICKS.map((t) => {
          const p = rec.tricks[t.id] ?? 0;
          return `<div class="row" style="margin:4px 0"><div style="flex:1"><div style="font-weight:800;font-size:13px">${t.name}${p >= 1 ? ' ✓' : ''}</div><div class="bar bond" style="height:6px"><div style="width:${pct(p)}"></div></div></div><button class="btn sm" data-act="fish:train:${rec.id}" data-trick="${t.id}">${p >= 1 ? 'Perform' : 'Train'}</button></div>`;
        }).join('')}`;
      }
      case 'breed': {
        if (!g.progression.feature('breeding')) return `<div class="muted small">${icon('lock')} Breeding unlocks at Lv.3.</div>`;
        const tank = g.findFish(rec.id)?.tank;
        const cands = (tank?.fish ?? []).filter((f) => f.id !== rec.id && f.species === rec.species);
        if (!cands.length) return `<div class="muted small">No other ${esc(SPECIES_BY_ID[rec.species].name)} in this tank. Buy one of the opposite sex to breed.</div>`;
        return cands.map((f) => {
          const chk = canBreed(rec, f);
          return `<div class="row" style="margin:4px 0"><div class="thumb-sm" style="width:46px;height:34px;border-radius:8px;overflow:hidden">${this.thumb('fish', f)}</div><div style="flex:1"><div style="font-weight:800;font-size:13px">${esc(f.name)} ${f.sex === 'M' ? '♂' : '♀'}</div><div class="small muted">${chk.ok ? 'Compatible pair' : esc(chk.reason)}</div></div><button class="btn sm good" data-act="fish:breedWith:${rec.id}:${f.id}" ${chk.ok ? '' : 'disabled'}>Pair</button></div>`;
        }).join('');
      }
      case 'move': {
        const from = g.findFish(rec.id)?.tank;
        const env = SPECIES_BY_ID[rec.species].env;
        const ts = s.tanks.filter((t) => t !== from);
        if (!ts.length) return '<div class="muted small">You only own one aquarium. Buy another in Tank → Add an Aquarium.</div>';
        return ts.map((t) => {
          const ok = t.env === env && t.fish.length < TANK_BY_ID[t.size].cap;
          return `<div class="row" style="margin:4px 0"><div style="flex:1;font-weight:800;font-size:13px">${esc(t.name)}<div class="small muted">${t.env !== env ? 'Wrong water type' : ok ? `${t.fish.length} fish` : 'Full'}</div></div><button class="btn sm primary" data-act="fish:moveTo:${rec.id}:${t.id}" ${ok ? '' : 'disabled'}>Move</button></div>`;
        }).join('');
      }
      case 'sell': {
        const v = fishValue(rec);
        return `<div class="small" style="margin-bottom:6px">Rehome ${esc(rec.name)} with a local aquarist for ${priceTag(v)}? This can't be undone.</div><div class="btn-row"><button class="btn sm danger" data-act="fish:sellOk:${rec.id}">Rehome</button><button class="btn sm" data-act="fish:sub:">Keep</button></div>`;
      }
      case 'info':
        return `<div class="kv small"><dt>Weight</dt><dd>${rec.weight} g-scale</dd><dt>Value</dt><dd>${formatNumber(fishValue(rec))} coins</dd><dt>Bond</dt><dd>${pct(rec.bond)}</dd><dt>Energy</dt><dd>${pct(rec.energy)}</dd><dt>Eaten</dt><dd>${rec.eaten ?? 0} morsels</dd><dt>Tricks</dt><dd>${Object.entries(rec.tricks).filter(([, v]) => v >= 1).map(([k]) => TRICKS.find((t) => t.id === k)?.name).join(', ') || 'None yet'}</dd></div>`;
      default:
        return '';
    }
  }

  // ======================================================== MODE TOOLBARS
  renderDecorUI(tabArg) {
    const tabMap = { plants: 'plants', ornaments: 'ornaments', backgrounds: 'backgrounds' };
    if (tabArg && tabMap[tabArg]) this.tab.decor = tabMap[tabArg];
    const tab = this.tab.decor;
    const s = this.s, t = this.game.activeTank;
    const tabs = [['rocks', 'Rocks', 'decor'], ['plants', 'Plants', 'plant'], ['driftwood', 'Driftwood', 'decor'], ['ornaments', 'Ornaments', 'tank'], ['caves', 'Caves', 'decor'], ['substrate', 'Substrate', 'decor'], ['backgrounds', 'Backgrounds', 'backgrounds'], ['lighting', 'Lighting', 'sun']];
    let items = '';
    const lvl = s.player.level;
    const item = (sel, thumbHtml, name, meta, act, owned, locked) => `<button class="tray-item ${sel ? 'selected' : ''} ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}" data-act="${act}" ${locked ? 'disabled' : ''}><div class="thumb">${thumbHtml}</div><div class="name">${esc(name)}</div><div class="meta">${meta}</div></button>`;
    const symbol = (ic) => `<div style="display:grid;place-items:center;height:100%;color:var(--cyan)"><span style="width:34px;height:34px">${icon(ic)}</span></div>`;
    if (tab === 'plants') {
      items = PLANTS.map((p) => {
        const n = s.inventory.plants[p.id] ?? 0;
        const locked = lvl < p.unlock;
        return item(false, this.thumb('plant', p.id), p.name, locked ? `${icon('lock')}Lv.${p.unlock}` : n ? `×${n} owned` : priceTag(p.price), `deco:place:plant:${p.id}`, n > 0, locked);
      }).join('');
    } else if (['rocks', 'driftwood', 'ornaments', 'caves'].includes(tab)) {
      items = DECOR.filter((d) => d.cat === tab).map((d) => {
        const n = s.inventory.decor[d.id] ?? 0;
        const locked = lvl < d.unlock;
        return item(false, this.thumb('decor', d.id), d.name, locked ? `${icon('lock')}Lv.${d.unlock}` : n ? `×${n} owned` : priceTag(d.price, d.currency), `deco:place:decor:${d.id}`, n > 0, locked);
      }).join('');
    } else {
      const src = { substrate: [SUBSTRATES, 'substrates', 'substrate'], backgrounds: [BACKGROUNDS, 'backgrounds', 'background'], lighting: [LIGHTING, 'lighting', 'lighting'] }[tab];
      items = src[0].map((x) => {
        const own = s.inventory[src[1]].includes(x.id);
        const on = t[src[2]] === x.id;
        const sw = tab === 'substrate' ? `<div style="height:100%;background:radial-gradient(circle at 30% 30%, ${x.colors[2]} 0 18%, transparent 20%), radial-gradient(circle at 70% 60%, ${x.colors[0]} 0 22%, transparent 24%), ${x.colors[1]}"></div>` : tab === 'lighting' ? `<div style="height:100%;background:linear-gradient(180deg,#${x.color.toString(16).padStart(6, '0')},#${x.water.toString(16).padStart(6, '0')})"></div>` : `<img src="${this.game.bgThumb(x.id)}" alt="">`;
        return item(on, sw, x.name, on ? 'In use' : own ? 'Owned' : priceTag(x.price, x.currency), `shop:${own ? 'use' : 'buy'}:${src[2]}:${x.id}`, own, false);
      }).join('');
    }
    const sel = this.game.decor.selection;
    this.ui.modeEl.innerHTML = `
      <div class="mode-tools glass">
        <button class="rail-btn head" data-act="deco:done">${icon('check')}<span>Done</span></button>
        <button class="rail-btn ${sel ? 'active' : ''}" data-act="deco:hint">${icon('move')}<span>Move</span></button>
        <button class="rail-btn ${sel ? '' : 'off'}" data-act="deco:rotate" ${sel ? '' : 'disabled'}>${icon('rotate')}<span>Rotate</span></button>
        <button class="rail-btn ${sel ? '' : 'off'}" data-act="deco:scaleUp" ${sel ? '' : 'disabled'}>${icon('scale')}<span>Bigger</span></button>
        <button class="rail-btn ${sel ? '' : 'off'}" data-act="deco:scaleDown" ${sel ? '' : 'disabled'}>${icon('minus')}<span>Smaller</span></button>
        <button class="rail-btn ${sel ? '' : 'off'}" data-act="deco:delete" ${sel ? '' : 'disabled'}>${icon('trash')}<span>Delete</span></button>
        <button class="rail-btn" data-act="deco:undo">${icon('undo')}<span>Undo</span></button>
        <button class="rail-btn" data-act="deco:redo">${icon('redo')}<span>Redo</span></button>
      </div>
      <div class="tray glass pe">
        <div class="tray-tabs">${tabs.map(([id, l, ic]) => `<button class="tray-tab ${tab === id ? 'active' : ''}" data-act="deco:tab:${id}">${icon(ic)}${l}</button>`).join('')}</div>
        <div class="tray-items">${items}</div>
      </div>`;
  }

  renderCleanUI(tool) {
    this.cleanTool = tool ?? this.cleanTool ?? 'glass';
    this.ui.modeEl.innerHTML = `<div class="clean-bar glass">
      <button class="chip ${this.cleanTool === 'glass' ? 'selected' : ''}" data-act="clean:tool:glass">${icon('wipe')} Wipe Glass</button>
      <button class="chip ${this.cleanTool === 'vacuum' ? 'selected' : ''}" data-act="clean:tool:vacuum">${icon('vacuum')} Vacuum</button>
      <div class="meter"><div class="small muted" id="cleanLabel"></div><div class="bar health"><div id="cleanMeter"></div></div></div>
      <button class="btn primary sm" data-act="clean:done">${icon('check')}Done</button></div>`;
    this.updateCleanUI();
  }
  updateCleanUI() {
    const t = this.game.activeTank;
    const lab = this.ui.root.querySelector('#cleanLabel');
    const m = this.ui.root.querySelector('#cleanMeter');
    if (!lab) return;
    const v = this.cleanTool === 'glass' ? 1 - t.algae.level : 1 - (t.debris ?? 0);
    lab.textContent = this.cleanTool === 'glass' ? `Glass ${pct(v)} clean — drag across the algae` : `Gravel ${pct(v)} clean — drag over the substrate`;
    m.style.width = pct(v);
  }

  renderPhotoUI() {
    const g = this.game;
    this.ui.modeEl.innerHTML = `<div class="photo-bar glass pe">
      <button class="pbtn" data-act="ph:exit">${icon('close')}Exit</button>
      <button class="pbtn ${g.photoHideUI ? 'on' : ''}" data-act="ph:hide">${icon('hide')}Hide UI</button>
      <button class="pbtn" data-act="ph:zout">${icon('zoomOut')}Zoom</button>
      <button class="pbtn" data-act="ph:zin">${icon('zoomIn')}Zoom</button>
      <button class="shutter" data-act="ph:shutter" title="Take photo">${icon('photo')}</button>
      <button class="pbtn" data-act="ph:fish">${icon('fish')}Fish</button>
      <button class="pbtn" data-act="ph:keeper">${icon('user')}Keeper</button>
      <button class="pbtn" data-act="ph:tank">${icon('tank')}Tank</button>
      <div class="pbtn photo-time" style="width:110px">${icon('sun')}<input type="range" min="0" max="1" step="0.01" value="${g.photoTime ?? g.timeOfDay}" id="photoTime"></div>
    </div>`;
    const r = this.ui.modeEl.querySelector('#photoTime');
    r.addEventListener('input', () => (g.photoTime = parseFloat(r.value)));
  }

  // ============================================================== ACTIONS
  action(cmd, a, b, el, e) {
    const g = this.game, s = this.s, ui = this.ui;
    switch (cmd) {
      case 'tab':
        this.tab[a] = b;
        if (a === 'shop') this.sel.shop = null;
        ui.renderPanel();
        break;
      case 'shop': {
        if (a === 'sel') {
          const [tab, id] = [b, el.dataset.act.split(':')[3]];
          this.sel.shop = { tab, id };
          ui.renderPanel();
          ui.panelsEl.querySelector('.panel-body').scrollTop = 0;
        } else if (a === 'buy' || a === 'use') {
          const id = el.dataset.act.split(':')[3];
          const r = a === 'buy' ? g.buy(b, id) : g.useItem(b, id);
          if (!r.ok) ui.toast(r.reason, '', 'info');
          if (g.mode === 'decorate') this.renderDecorUI();
          ui.renderPanel();
        } else if (a === 'selectfood') {
          s.selectedFood = b;
          ui.toast(`Feeding with ${FOOD_BY_ID[b].name}`, '', 'feed');
          ui.renderPanel();
        }
        break;
      }
      case 'fish': {
        const id = b;
        if (a === 'close') {
          g.selectFish(null);
        } else if (a === 'select') {
          g.selectFish(b, true);
        } else if (a === 'fav') g.toggleFavorite(id);
        else if (a === 'follow') g.followFish(id);
        else if (a === 'feed') g.feed(null, id);
        else if (a === 'photo') g.setMode('photo', id);
        else if (a === 'family') ui.open('family', id);
        else if (a === 'sub') {
          ui.fishSub = ui.fishSub === b || !b ? null : b;
          ui.renderFishCard();
          return;
        } else if (a === 'renameOk') {
          const v = ui.cardEl.querySelector('#renameInput')?.value?.trim();
          if (v) g.renameFish(id, v);
          ui.fishSub = null;
        } else if (a === 'train') {
          const r = g.trainFish(id, el.dataset.trick);
          if (!r.ok) ui.toast(r.reason, '', 'train');
        } else if (a === 'breedWith') {
          const other = el.dataset.act.split(':')[3];
          const r = g.breedFish(id, other);
          if (!r.ok) ui.toast(r.reason, '', 'breed');
          else ui.fishSub = null;
        } else if (a === 'moveTo') {
          g.moveFish(id, el.dataset.act.split(':')[3]);
          ui.fishSub = null;
          return;
        } else if (a === 'sellOk') {
          g.sellFish(id);
          return;
        }
        if (ui.fishCardId) ui.renderFishCard();
        break;
      }
      case 'quest':
        g.progression.claimQuest(b);
        ui.renderPanel();
        break;
      case 'event':
        if (g.progression.claimLiveEvent()) ui.renderPanel();
        break;
      case 'mail': {
        const m = s.inbox.find((x) => x.id === b);
        if (m && !m.claimed) {
          m.claimed = true;
          if (m.reward) g.progression.give(m.reward, 'mail');
          ui.refreshHUD();
          ui.renderPanel();
        }
        break;
      }
      case 'tank':
        if (a === 'switch') g.switchTank(b);
        else if (a === 'upgrade') {
          const r = g.upgradeTank();
          if (!r.ok) ui.toast(r.reason, '', 'tank');
        } else if (a === 'buy') {
          const r = g.buyTank(b);
          if (!r.ok) ui.toast(r.reason, '', 'tank');
        } else if (a === 'rename') {
          const v = ui.panelsEl.querySelector('#tankName')?.value?.trim();
          if (v) g.activeTank.name = v;
        }
        ui.renderPanel();
        break;
      case 'care':
        if (a === 'wipe') {
          ui.close();
          g.setMode('clean', 'glass');
        } else if (a === 'vacuum') {
          ui.close();
          g.setMode('clean', 'vacuum');
        } else if (a === 'water') g.waterChange();
        else if (a === 'filter') g.maintainFilter();
        else if (a === 'trim') g.trim(b);
        ui.refreshPanel('care', 'plants');
        break;
      case 'clean':
        if (a === 'tool') {
          g.cleanTool = b;
          this.renderCleanUI(b);
          g.character.cleanSequence(g.aquarium.center.x);
        } else if (a === 'done') g.setMode('normal');
        break;
      case 'ph':
        g.photoAction(a);
        if (a === 'hide') this.renderPhotoUI();
        break;
      case 'deco': {
        if (a === 'tab') {
          this.tab.decor = b;
          this.renderDecorUI();
        } else if (a === 'place') {
          const id = el.dataset.act.split(':')[3];
          if (g.mode !== 'decorate') {
            ui.close();
            g.setMode('decorate', b === 'plant' ? 'plants' : null);
          }
          const r = g.placeItem(b, id);
          if (!r.ok) ui.toast(r.reason, '', 'info');
          this.renderDecorUI();
        } else if (a === 'done') g.setMode('normal');
        else if (a === 'hint') ui.toast('Drag an object in the tank to move it', 'Tap an object to select it', 'move');
        else {
          g.decorTool(a);
          this.renderDecorUI();
        }
        break;
      }
      case 'photo':
        if (a === 'view') {
          const src = el.src;
          ui.modalEl.innerHTML = `<div class="photo-view" data-act="modal-close"><img src="${src}" alt=""></div>`;
        } else if (a === 'dl') g.downloadPhoto(b);
        else if (a === 'del') g.deletePhoto(b).then(() => ui.renderPanel());
        break;
      case 'room':
        if (a === 'buy') {
          const r = g.buyRoom(b);
          if (!r.ok) ui.toast(r.reason, '', 'home');
        } else if (a === 'move') g.moveRoom(b);
        else if (a === 'opt') {
          const id = el.dataset.act.split(':')[3];
          const r = g.setRoomOption(b, id);
          if (!r.ok) ui.toast(r.reason, '', 'home');
        } else if (a === 'name') {
          const v = ui.panelsEl.querySelector('#playerName')?.value?.trim();
          if (v) s.player.name = v.slice(0, 24);
          ui.refreshHUD();
        }
        ui.renderPanel();
        break;
      case 'look': {
        const val = ['hairStyle', 'top', 'accessory'].includes(a) ? b : `#${b}`;
        g.setLook(a, val);
        ui.renderPanel();
        break;
      }
      case 'set':
        if (a === 'quality') g.setQuality(b);
        else if (a === 'fps') s.settings.showFps = !s.settings.showFps;
        else if (a === 'mute') {
          s.settings.muted = !s.settings.muted;
          g.audio.setMuted(s.settings.muted);
        } else if (a === 'time') s.settings.timeMode = b;
        else if (a === 'save') g.save(true);
        else if (a === 'tutorial') {
          ui.close();
          ui.tutorial.restart();
        } else if (a === 'intro') {
          ui.close();
          g.playIntro();
        } else if (a === 'reset') {
          if (this.confirmReset) {
            g.resetSave();
            return;
          }
          this.confirmReset = true;
          setTimeout(() => (this.confirmReset = false), 4000);
        }
        ui.renderPanel();
        break;
      default:
        break;
    }
  }
}
