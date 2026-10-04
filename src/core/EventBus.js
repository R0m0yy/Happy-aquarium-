// Minimal pub/sub used to decouple gameplay systems from UI, audio and quests.
export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }
  off(type, fn) {
    this.map.get(type)?.delete(fn);
  }
  emit(type, payload) {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        console.warn('[event]', type, e);
      }
    }
    const any = this.map.get('*');
    if (any) for (const fn of [...any]) fn({ type, payload });
  }
}

export const bus = new EventBus();
