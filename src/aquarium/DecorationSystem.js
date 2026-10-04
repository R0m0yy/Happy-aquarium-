// Hardscape & ornaments in the active tank, plus the in-place editing tools
// (select / move / rotate / scale / delete / undo / redo) used by Decorate mode.
import * as THREE from 'three';
import { DECOR_BY_ID, PLANT_BY_ID } from '../data/items.js';
import { buildDecor } from './DecorModels.js';
import { bus } from '../core/EventBus.js';
import { clamp, uid, deepClone } from '../core/util.js';

const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x4fd8ff, side: THREE.BackSide, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });

export class DecorationSystem {
  constructor(aquarium, plants) {
    this.aq = aquarium;
    this.plants = plants;
    this.group = new THREE.Group();
    this.group.name = 'decor';
    aquarium.contents.add(this.group);
    this.items = new Map();
    this.selection = null;
    this.outline = null;
    this.history = [];
    this.future = [];
    this.editing = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    aquarium.contents.add(this.ring);
  }

  load(tank) {
    this.clear();
    this.tank = tank;
    for (const rec of tank.decor) this.spawn(rec);
    this.updateEmitters();
  }

  clear() {
    for (const it of this.items.values()) it.obj.removeFromParent();
    this.items.clear();
    this.setSelection(null);
  }

  spawn(rec) {
    const def = DECOR_BY_ID[rec.itemId];
    if (!def) return null;
    const built = buildDecor(def);
    const obj = built.group;
    obj.userData.decorUid = rec.uid;
    this.group.add(obj);
    const it = { rec, obj, def, built };
    this.items.set(rec.uid, it);
    this.place(it);
    return it;
  }

  place(it) {
    const { rec, obj, def } = it;
    const p = this.aq.layoutToWorld(rec.nx, rec.nz);
    p.y -= 0.012;
    obj.position.copy(p);
    obj.rotation.y = rec.rot ?? 0;
    obj.scale.setScalar((rec.scale ?? 1) * (def.scale ?? 1) * 1.15);
    obj.updateMatrixWorld(true);
  }

  add(itemId, nx = 0, nz = 0.1) {
    const rec = { uid: uid('dc'), itemId, nx, nz, rot: Math.random() * 0.8 - 0.4, scale: 1 };
    this.tank.decor.push(rec);
    const it = this.spawn(rec);
    this.updateEmitters();
    bus.emit('decor:placed', { item: DECOR_BY_ID[itemId], cat: DECOR_BY_ID[itemId]?.cat });
    return it;
  }

  remove(uidv) {
    const it = this.items.get(uidv);
    if (!it) return null;
    it.obj.removeFromParent();
    this.items.delete(uidv);
    this.tank.decor = this.tank.decor.filter((d) => d.uid !== uidv);
    this.updateEmitters();
    return it.rec;
  }

  updateEmitters() {
    const list = [];
    for (const it of this.items.values()) {
      if (it.built.bubbles) {
        const w = it.built.bubbles.clone().applyMatrix4(it.obj.matrixWorld);
        list.push({ x: w.x - this.aq.center.x, y: w.y - this.aq.center.y, z: w.z - this.aq.center.z, rate: 0.7, spread: 0.01, size: 1.4 });
      }
    }
    this.aq.setBubbleEmitters(list);
  }

  colliders() {
    const out = [];
    const v = new THREE.Vector3();
    for (const it of this.items.values()) {
      const s = it.obj.scale.x;
      for (const c of it.built.colliders) {
        v.set(c.x, c.y, c.z).applyMatrix4(it.obj.matrixWorld);
        out.push({ x: v.x, y: v.y, z: v.z, r: c.r * s, soft: !!c.soft });
      }
    }
    return out;
  }

  hideSpots() {
    const out = [];
    for (const it of this.items.values()) {
      if (it.built.hide) out.push(it.built.hide.clone().applyMatrix4(it.obj.matrixWorld));
    }
    return out;
  }

  // ------------------------------------------------------------ editing
  snapshot() {
    return { decor: deepClone(this.tank.decor), plants: deepClone(this.tank.plants) };
  }
  pushHistory() {
    this.history.push(this.snapshot());
    if (this.history.length > 40) this.history.shift();
    this.future = [];
  }
  restore(snap) {
    this.tank.decor = snap.decor;
    this.tank.plants = snap.plants;
    const sel = this.selection;
    this.load(this.tank);
    this.plants.load(this.tank);
    if (sel && this.exists(sel)) this.setSelection(sel);
  }
  undo() {
    if (!this.history.length) return false;
    this.future.push(this.snapshot());
    this.restore(this.history.pop());
    bus.emit('decor:changed');
    return true;
  }
  redo() {
    if (!this.future.length) return false;
    this.history.push(this.snapshot());
    this.restore(this.future.pop());
    bus.emit('decor:changed');
    return true;
  }

  exists(sel) {
    return sel.type === 'decor' ? this.items.has(sel.uid) : this.plants.items.has(sel.uid);
  }

  target(sel = this.selection) {
    if (!sel) return null;
    return sel.type === 'decor' ? this.items.get(sel.uid) : this.plants.items.get(sel.uid);
  }

  label(sel = this.selection) {
    const t = this.target(sel);
    if (!t) return null;
    if (sel.type === 'plant') return { name: t.def.name, cat: 'plants' };
    return { name: t.def.name, cat: t.def.cat };
  }

  setSelection(sel) {
    if (this.outline) {
      this.outline.removeFromParent();
      this.outline = null;
    }
    this.selection = sel && this.exists(sel) ? sel : null;
    this.ring.visible = false;
    const t = this.target();
    if (!t) return;
    // inverted-hull outline: duplicate meshes with a back-face glow material
    const hull = new THREE.Group();
    t.obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(t.obj);
    const center = box.getCenter(new THREE.Vector3());
    t.obj.traverse((m) => {
      if (!m.isMesh) return;
      const h = new THREE.Mesh(m.geometry, OUTLINE_MAT);
      h.matrixAutoUpdate = false;
      h.matrix.copy(m.matrixWorld);
      hull.add(h);
    });
    hull.matrixAutoUpdate = false;
    const s = 1.06;
    hull.matrix.makeTranslation(center.x, center.y, center.z).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    hull.renderOrder = 3;
    this.aq.contents.add(hull);
    this.outline = hull;
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.62 + 0.02;
    this.ring.scale.setScalar(r);
    this.ring.position.set(center.x, this.aq.substrateY(center.x, center.z) + 0.006, center.z);
    this.ring.visible = true;
  }

  refreshSelection() {
    if (this.selection) this.setSelection(this.selection);
  }

  pick(raycaster) {
    let best = null;
    const hits = raycaster.intersectObjects(this.group.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.decorUid) o = o.parent;
      if (o) {
        best = { type: 'decor', uid: o.userData.decorUid, distance: h.distance, point: h.point };
        break;
      }
    }
    const p = this.plants.pick(raycaster);
    if (p && (!best || p.distance < best.distance - 0.02)) best = { type: 'plant', uid: p.uid, distance: p.distance, point: p.point };
    return best;
  }

  // move the selection so its base sits under the given world point
  moveTo(x, z) {
    const t = this.target();
    if (!t) return;
    const l = this.aq.worldToLayout(x, z);
    t.rec.nx = clamp(l.nx, -0.47, 0.47);
    t.rec.nz = clamp(l.nz, -0.45, 0.45);
    if (this.selection.type === 'decor') this.place(t);
    else this.plants.place(t);
    this.refreshSelection();
  }

  rotate(delta) {
    const t = this.target();
    if (!t) return;
    t.rec.rot = (t.rec.rot ?? 0) + delta;
    if (this.selection.type === 'decor') this.place(t);
    else t.obj.rotation.y = t.rec.rot;
    this.refreshSelection();
  }

  scale(factor) {
    const t = this.target();
    if (!t) return;
    t.rec.scale = clamp((t.rec.scale ?? 1) * factor, 0.5, 1.8);
    if (this.selection.type === 'decor') this.place(t);
    else this.plants.place(t);
    this.refreshSelection();
  }

  deleteSelection() {
    const sel = this.selection;
    if (!sel) return null;
    let rec;
    if (sel.type === 'decor') rec = this.remove(sel.uid);
    else rec = this.plants.remove(sel.uid);
    this.setSelection(null);
    return rec ? { type: sel.type, id: sel.type === 'decor' ? rec.itemId : rec.plantId } : null;
  }

  commitMove() {
    if (this.selection?.type === 'decor') this.updateEmitters();
  }
}

export function itemName(type, id) {
  return type === 'decor' ? DECOR_BY_ID[id]?.name : PLANT_BY_ID[id]?.name;
}
