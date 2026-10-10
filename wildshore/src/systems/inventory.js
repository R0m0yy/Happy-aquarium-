// Slot-based inventory with weight, tool durability and food spoilage.
import { ITEMS } from '../data/items.js';

let UID = 1;

export class Inventory {
  constructor(slots = 24, maxWeight = 38) {
    this.slots = slots;
    this.maxWeight = maxWeight;
    this.items = [];
    this.listeners = new Set();
  }

  changed() { for (const f of this.listeners) f(this); }

  weight() {
    let w = 0;
    for (const it of this.items) w += (ITEMS[it.id]?.w || 0) * it.n;
    return w;
  }

  count(id) { let n = 0; for (const it of this.items) if (it.id === id) n += it.n; return n; }
  find(id) { return this.items.find((it) => it.id === id); }
  findUid(uid) { return this.items.find((it) => it.uid === uid); }

  // returns how many were added
  add(id, n = 1, opts = {}) {
    const def = ITEMS[id];
    if (!def) return 0;
    let left = n;
    if (def.tool) {
      while (left > 0 && this.items.length < this.slots) {
        this.items.push({ id, n: 1, dur: opts.dur ?? def.dur, uid: UID++ });
        left--;
      }
    } else {
      const stack = def.stack || 20;
      for (const it of this.items) {
        if (left <= 0) break;
        if (it.id !== id || it.n >= stack) continue;
        const k = Math.min(stack - it.n, left);
        if (def.shelf) it.fresh = (it.fresh * it.n + (opts.fresh ?? 1) * k) / (it.n + k);
        it.n += k; left -= k;
      }
      while (left > 0 && this.items.length < this.slots) {
        const k = Math.min(stack, left);
        const it = { id, n: k, uid: UID++ };
        if (def.shelf) it.fresh = opts.fresh ?? 1;
        this.items.push(it);
        left -= k;
      }
    }
    if (left !== n) this.changed();
    return n - left;
  }

  remove(id, n = 1) {
    let left = n;
    // consume the stalest first
    const list = this.items.filter((it) => it.id === id).sort((a, b) => (a.fresh ?? 1) - (b.fresh ?? 1));
    for (const it of list) {
      if (left <= 0) break;
      const k = Math.min(it.n, left);
      it.n -= k; left -= k;
    }
    this.items = this.items.filter((it) => it.n > 0);
    if (left !== n) this.changed();
    return n - left;
  }

  removeUid(uid) {
    const i = this.items.findIndex((it) => it.uid === uid);
    if (i >= 0) { this.items.splice(i, 1); this.changed(); }
  }

  has(req) {
    for (const [id, n] of Object.entries(req || {})) if (this.count(id) < n) return false;
    return true;
  }
  hasTools(tools) {
    for (const t of tools || []) if (!this.items.some((it) => it.id === t || ITEMS[it.id]?.tool === t)) return false;
    return true;
  }
  consume(req) {
    if (!this.has(req)) return false;
    for (const [id, n] of Object.entries(req)) this.remove(id, n);
    return true;
  }

  // durability wear; returns true if the tool broke
  wear(uid, amount = 1) {
    const it = this.findUid(uid);
    if (!it) return false;
    it.dur -= amount;
    if (it.dur <= 0) { this.removeUid(uid); return true; }
    this.changed();
    return false;
  }

  waterCapacity() {
    let c = 2; // cupped hands / a found plastic bottle to start
    for (const it of this.items) if (ITEMS[it.id]?.capacity) c += ITEMS[it.id].capacity * it.n;
    return c;
  }
  waterCount() { return this.count('rawWater') + this.count('cleanWater'); }

  // spoilage: dtH = game hours, mult = storage modifier
  tick(dtH, mult = 1) {
    let spoiledN = 0;
    for (const it of this.items) {
      const def = ITEMS[it.id];
      if (!def.shelf) continue;
      it.fresh -= (dtH / def.shelf) * mult;
      if (it.fresh <= 0) { spoiledN += it.n; it.n = 0; }
    }
    if (spoiledN) {
      this.items = this.items.filter((it) => it.n > 0);
      this.add('spoiled', spoiledN);
      return spoiledN;
    }
    return 0;
  }

  serialize() { return this.items.map((it) => ({ ...it })); }
  restore(list) { this.items = list.map((it) => ({ ...it, uid: UID++ })); this.changed(); }
}
