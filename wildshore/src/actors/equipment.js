// Hand-held tools & worn gear. Origin = grip, +Y = along the handle toward the working end.
import * as THREE from 'three';
import { tube, merge, normalizeAttrs, rockGeometry } from '../render/geo.js';
import { woodTexture, ropeTexture, stoneTexture } from '../render/textures.js';
import { rng } from '../util/math.js';
import { patchMaterial } from '../render/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
let M = null;
function mats() {
  if (M) return M;
  M = {
    wood: patchMaterial(new THREE.MeshStandardMaterial({ map: woodTexture('fresh'), roughness: 0.75, vertexColors: true })),
    stone: patchMaterial(new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.6, vertexColors: true })),
    rope: patchMaterial(new THREE.MeshStandardMaterial({ map: ropeTexture(), roughness: 0.9 })),
    cloth: patchMaterial(new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.95 })),
    canvas: patchMaterial(new THREE.MeshStandardMaterial({ color: 0x4f5b3a, roughness: 0.92 })),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    string: new THREE.LineBasicMaterial({ color: 0xe8e0c8 }),
  };
  return M;
}

function stick(len, r0, r1, color = 0xc49a6c, segs = 6) {
  return tube((t) => V(Math.sin(t * 9) * 0.004, t * len, Math.cos(t * 7) * 0.004), (t) => r0 + (r1 - r0) * t, { segs, radial: 6, vScale: 0.8, colorFn: () => C(color) });
}
function lashing(y, r, n = 3) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.TorusGeometry(r, 0.008, 4, 10);
    g.rotateX(Math.PI / 2);
    g.translate(0, y + i * 0.018, 0);
    list.push(g);
  }
  return merge(list);
}
function mesh(g, m) { const x = new THREE.Mesh(g, m); x.castShadow = true; return x; }

export const ITEM_MODELS = {
  axe() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(stick(0.62, 0.018, 0.022), m.wood));
    const head = rockGeometry(rng(5), { detail: 1, sx: 0.12, sy: 0.05, sz: 0.035, rough: 0.25, color: C(0x6f6d68) });
    const hm = mesh(head, m.stone); hm.position.set(0.07, 0.56, 0); g.add(hm);
    g.add(mesh(lashing(0.52, 0.03), m.rope));
    return g;
  },
  knife() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(stick(0.11, 0.016, 0.014, 0x8a6a48), m.wood));
    const blade = new THREE.ConeGeometry(0.022, 0.16, 4); blade.scale(1, 1, 0.3); blade.translate(0, 0.19, 0);
    g.add(mesh(normalizeAttrs(blade, C(0x55534f)), m.stone));
    g.add(mesh(lashing(0.09, 0.019, 2), m.rope));
    return g;
  },
  spear(kind = 'wood') {
    const m = mats(), g = new THREE.Group();
    const shaft = stick(2.1, 0.02, 0.016, 0xc8a274, 10);
    shaft.translate(0, -0.7, 0);
    g.add(mesh(shaft, m.wood));
    if (kind === 'wood') {
      const tip = new THREE.ConeGeometry(0.017, 0.16, 6); tip.translate(0, 1.48, 0);
      g.add(mesh(normalizeAttrs(tip, C(0x9a7048)), m.wood));
    } else if (kind === 'stone') {
      const tip = new THREE.ConeGeometry(0.035, 0.18, 4); tip.scale(1, 1, 0.35); tip.translate(0, 1.5, 0);
      g.add(mesh(normalizeAttrs(tip, C(0x3d3b39)), m.stone));
      g.add(mesh(lashing(1.36, 0.022, 3), m.rope));
    } else {
      // fishing spear: three barbed prongs
      for (let i = -1; i <= 1; i++) {
        const p = tube((t) => V(i * 0.025 * t + i * 0.006, 1.38 + t * 0.26, 0), () => 0.006, { segs: 2, radial: 4, colorFn: () => C(0xd4b48a) });
        g.add(mesh(p, m.wood));
      }
      g.add(mesh(lashing(1.33, 0.024, 3), m.rope));
    }
    return g;
  },
  rod() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(tube((t) => V(0, t * 2.2, Math.pow(t, 2) * 0.12), (t) => 0.016 * (1 - t * 0.7), { segs: 8, radial: 5, colorFn: () => C(0xb89a68) }), m.wood));
    const line = new THREE.BufferGeometry().setFromPoints([V(0, 2.2, 0.12), V(0, 1.2, 0.5)]);
    const l = new THREE.Line(line, m.string); l.name = 'line'; g.add(l);
    return g;
  },
  bow() {
    const m = mats(), g = new THREE.Group();
    const bowG = tube((t) => V(0, (t - 0.5) * 1.3, -Math.sin(t * Math.PI) * 0.16 + 0.08), (t) => 0.014 + 0.008 * Math.sin(t * Math.PI), { segs: 12, radial: 5, colorFn: () => C(0x9c7448) });
    g.add(mesh(bowG, m.wood));
    const s = new THREE.BufferGeometry().setFromPoints([V(0, -0.65, 0.08), V(0, 0.65, 0.08)]);
    g.add(new THREE.Line(s, m.string));
    return g;
  },
  hammer() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(stick(0.45, 0.018, 0.02), m.wood));
    const head = rockGeometry(rng(9), { detail: 1, sx: 0.07, sy: 0.06, sz: 0.06, rough: 0.2, color: C(0x7a7670) });
    const hm = mesh(head, m.stone); hm.position.set(0, 0.44, 0); g.add(hm);
    g.add(mesh(lashing(0.38, 0.025), m.rope));
    return g;
  },
  torch() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(stick(0.55, 0.02, 0.028, 0x7a5a3a), m.wood));
    const wrap = new THREE.CylinderGeometry(0.045, 0.035, 0.12, 8); wrap.translate(0, 0.52, 0);
    g.add(mesh(wrap, m.cloth));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 8, 1, true), m.flame);
    flame.position.y = 0.72; flame.name = 'flame'; g.add(flame);
    const light = new THREE.PointLight(0xff9a40, 6, 14, 1.6);
    light.position.y = 0.8; light.name = 'light';
    light.layers.enableAll();
    g.add(light);
    return g;
  },
  paddle() {
    const m = mats(), g = new THREE.Group();
    const shaft = stick(1.5, 0.018, 0.018, 0xc49a6c, 6); shaft.translate(0, -0.6, 0);
    g.add(mesh(shaft, m.wood));
    const blade = new THREE.BoxGeometry(0.16, 0.45, 0.02); blade.translate(0, 1.05, 0);
    g.add(mesh(normalizeAttrs(blade, C(0xb88e60)), m.wood));
    return g;
  },
  // worn rucksack
  backpack() {
    const m = mats(), g = new THREE.Group();
    const body = new THREE.BoxGeometry(0.32, 0.42, 0.18, 2, 2, 2);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * (1 - y * 0.25), y, z * (1 + 0.2 * Math.cos(x * 6))); }
    body.computeVertexNormals();
    g.add(mesh(body, m.canvas));
    const flap = new THREE.BoxGeometry(0.33, 0.12, 0.2); flap.translate(0, 0.17, 0.01);
    g.add(mesh(flap, m.cloth));
    const roll = new THREE.CylinderGeometry(0.06, 0.06, 0.36, 10); roll.rotateZ(Math.PI / 2); roll.translate(0, 0.27, 0.0);
    g.add(mesh(roll, m.cloth));
    const pocket = new THREE.BoxGeometry(0.2, 0.14, 0.05); pocket.translate(0, -0.08, -0.11);
    g.add(mesh(pocket, m.cloth));
    return g;
  },
  // straw survival hat
  hat() {
    const g = new THREE.Group();
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 0.9 }));
    const brim = new THREE.CylinderGeometry(0.2, 0.21, 0.012, 20);
    const crown = new THREE.CylinderGeometry(0.095, 0.11, 0.1, 16); crown.translate(0, 0.05, 0);
    const band = new THREE.CylinderGeometry(0.112, 0.112, 0.025, 16); band.translate(0, 0.012, 0);
    g.add(mesh(brim, mat), mesh(crown, mat), mesh(band, new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.8 })));
    return g;
  },
};

export function makeItemModel(id) {
  switch (id) {
    case 'stoneAxe': return ITEM_MODELS.axe();
    case 'knife': return ITEM_MODELS.knife();
    case 'woodSpear': return ITEM_MODELS.spear('wood');
    case 'stoneSpear': return ITEM_MODELS.spear('stone');
    case 'fishSpear': return ITEM_MODELS.spear('fish');
    case 'fishingRod': return ITEM_MODELS.rod();
    case 'bow': return ITEM_MODELS.bow();
    case 'hammer': return ITEM_MODELS.hammer();
    case 'torch': return ITEM_MODELS.torch();
    case 'paddle': return ITEM_MODELS.paddle();
    default: return null;
  }
}
