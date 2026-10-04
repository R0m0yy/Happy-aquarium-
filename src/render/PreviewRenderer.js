// Offscreen renderer for item thumbnails (shop, inventory, collection, fish
// portraits) and the single live animated preview shown in detail views.
import * as THREE from 'three';
import { FishActor } from '../aquarium/FishActor.js';
import { buildPlant } from '../aquarium/PlantModels.js';
import { buildDecor } from '../aquarium/DecorModels.js';
import { PLANT_BY_ID, DECOR_BY_ID } from '../data/items.js';
import { genomeKey } from '../systems/Genetics.js';

const W = 256, H = 192;

export class PreviewRenderer {
  constructor(envMap) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.r.setPixelRatio(1);
    this.r.setSize(W, H, false);
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.environment = envMap ?? null;
    this.cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 20);
    this.root = new THREE.Group();
    this.root.position.set(0, 1.4, 50); // far in front of any tank so water fog is negligible
    this.scene.add(this.root);
    const hemi = new THREE.HemisphereLight(0xdff2ff, 0x1a2a3a, 1.4);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 3);
    const rim = new THREE.DirectionalLight(0x7fd8ff, 1.6);
    rim.position.set(-2, 1, -2);
    this.scene.add(hemi, key, rim, key.target);
    key.target.position.copy(this.root.position);
    this.cache = new Map();
    this.queue = [];
    this.live = null;
    this.liveCanvas = null;
  }

  clearRoot() {
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      if (c.userData.actor) c.userData.actor.dispose?.();
    }
  }

  frameObject(obj, pad = 1.25, yaw = 0.5, pitch = 0.25) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y * 1.3, size.z) * 0.5 * pad;
    const dist = r / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) + r * 0.3;
    this.cam.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.cam.lookAt(center);
  }

  makeFish(rec) {
    const a = new FishActor(rec, {});
    a.inner.rotation.y = -0.35;
    a.group.userData.actor = a;
    if (a.uniforms) {
      a.uniforms.uSwim.value.set(1.2, 0.05, 6.5, 0);
      a.uniforms.uFish.value.set(0.5, 1, 0.5, 0.015);
    }
    return a;
  }

  build(kind, data) {
    if (kind === 'fish') {
      const a = this.makeFish(data);
      return { obj: a.group, actor: a, yaw: 0.15, pitch: 0.12, pad: 1.05 };
    }
    if (kind === 'plant') {
      const g = buildPlant(PLANT_BY_ID[data], 3);
      return { obj: g, yaw: 0.3, pitch: 0.35, pad: 1.15 };
    }
    if (kind === 'decor') {
      const d = buildDecor(DECOR_BY_ID[data]);
      return { obj: d.group, yaw: 0.6, pitch: 0.4, pad: 1.1 };
    }
    return null;
  }

  key(kind, data) {
    if (kind === 'fish') return `fish:${genomeKey(data.species, data.genome)}:${data.stage}:${data.sex}`;
    return `${kind}:${data}`;
  }

  // Returns a cached data URL immediately or null + schedules generation.
  thumb(kind, data, cb) {
    const k = this.key(kind, data);
    if (this.cache.has(k)) return this.cache.get(k);
    if (!this.queue.find((q) => q.k === k)) this.queue.push({ k, kind, data, cbs: [cb] });
    else if (cb) this.queue.find((q) => q.k === k).cbs.push(cb);
    return null;
  }

  renderNow(kind, data) {
    this.clearRoot();
    const b = this.build(kind, data);
    if (!b) return null;
    this.root.add(b.obj);
    this.root.updateMatrixWorld(true);
    this.frameObject(b.obj, b.pad, b.yaw, b.pitch);
    this.r.setClearColor(0x000000, 0);
    this.r.render(this.scene, this.cam);
    const url = this.canvas.toDataURL('image/png');
    this.clearRoot();
    return url;
  }

  // process a few queued thumbnails per frame (keeps the main loop smooth)
  process(budgetMs = 6) {
    if (this.live) return;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const q = this.queue.shift();
      let url = null;
      try {
        url = this.renderNow(q.kind, q.data);
      } catch (e) {
        console.warn('thumb failed', q.k, e);
      }
      if (url) this.cache.set(q.k, url);
      for (const cb of q.cbs) cb?.(url);
    }
  }

  // ------------------------------------------------------- live preview
  startLive(kind, data, host) {
    this.stopLive();
    this.clearRoot();
    const b = this.build(kind, data);
    if (!b) return;
    this.root.add(b.obj);
    this.root.updateMatrixWorld(true);
    this.frameObject(b.obj, b.pad, b.yaw, b.pitch);
    this.live = { b, t: 0 };
    host.innerHTML = '';
    host.appendChild(this.canvas);
  }

  stopLive() {
    if (!this.live) return;
    this.live = null;
    this.clearRoot();
    this.canvas.remove();
  }

  tick(dt) {
    if (!this.live) return;
    if (!this.canvas.isConnected) {
      this.stopLive();
      return;
    }
    const L = this.live;
    L.t += dt;
    if (L.b.actor?.uniforms) {
      const u = L.b.actor.uniforms;
      u.uSwim.value.x = L.t * 6;
      u.uSwim.value.y = 0.06;
      u.uFish.value.z = L.t * 3;
      L.b.actor.inner.rotation.y = -0.35 + Math.sin(L.t * 0.6) * 0.5;
      L.b.obj.position.y = Math.sin(L.t * 1.3) * 0.01;
      for (const p of L.b.actor.pecs) p.rotation.y = p.userData.side * (0.6 + Math.sin(L.t * 7) * 0.3);
    } else {
      L.b.obj.rotation.y = L.t * 0.5;
    }
    this.r.setClearColor(0x000000, 0);
    this.r.render(this.scene, this.cam);
  }
}
