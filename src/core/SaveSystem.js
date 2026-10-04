// IndexedDB-backed persistence with localStorage fallback and versioned migrations.
const DB_NAME = 'aquaria-living-aquarium';
const STORE = 'kv';
export const SAVE_VERSION = 3;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Migrations transform older save shapes forward. Never drop player data.
const MIGRATIONS = {
  1: (s) => {
    s.photos = s.photos ?? [];
    return s;
  },
  2: (s) => {
    for (const t of s.tanks ?? []) {
      t.algae = t.algae ?? { level: 0.1, seed: 1 };
      t.debris = t.debris ?? 0;
    }
    s.liveEvent = s.liveEvent ?? { week: -1, progress: 0, claimed: false };
    return s;
  },
};

export class SaveSystem {
  constructor() {
    this.db = null;
    this.ready = openDB()
      .then((db) => (this.db = db))
      .catch(() => (this.db = null));
  }

  async _get(key) {
    await this.ready;
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result ?? null);
        r.onerror = () => resolve(null);
      });
    }
    try {
      const raw = localStorage.getItem(`${DB_NAME}:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async _put(key, value) {
    await this.ready;
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    }
    try {
      localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  async _del(key) {
    await this.ready;
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    }
    try {
      localStorage.removeItem(`${DB_NAME}:${key}`);
    } catch {
      /* ignore */
    }
    return true;
  }

  async load() {
    const data = await this._get('save');
    if (!data) return null;
    return this.migrate(data);
  }

  migrate(data) {
    let v = data.version ?? 1;
    while (v < SAVE_VERSION) {
      const m = MIGRATIONS[v];
      if (m) data = m(data);
      v++;
      data.version = v;
    }
    return data;
  }

  async save(state) {
    state.version = SAVE_VERSION;
    state.lastSaved = Date.now();
    // keep a rolling backup of the previous save so a bad write is recoverable
    const prev = await this._get('save');
    if (prev) await this._put('save_backup', prev);
    return this._put('save', JSON.parse(JSON.stringify(state)));
  }

  async savePhoto(id, dataUrl) {
    return this._put(`photo:${id}`, dataUrl);
  }
  async loadPhoto(id) {
    return this._get(`photo:${id}`);
  }
  async deletePhoto(id) {
    return this._del(`photo:${id}`);
  }

  async reset() {
    await this._del('save');
    await this._del('save_backup');
  }
}
