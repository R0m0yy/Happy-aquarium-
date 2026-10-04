// Stylised miniature keeper: a jointed rig built from smooth primitives with a
// customisable outfit, expressive face (blinking eyes, brows, mouth) and props.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeRng } from '../core/util.js';
import { canvas, toTexture, fabricTexture } from '../render/textures.js';

export const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'lShoulder', 'lElbow', 'lWrist', 'rShoulder', 'rElbow', 'rWrist', 'lHip', 'lKnee', 'lAnkle', 'rHip', 'rKnee', 'rAnkle'];

// dimensions (world units). Total height ≈ 1.12
export const DIM = { hipY: 0.42, thigh: 0.19, shin: 0.18, foot: 0.04, spine: 0.13, chest: 0.15, neck: 0.05, headR: 0.19, upperArm: 0.15, foreArm: 0.14, shoulderX: 0.115, hipX: 0.06 };

function mat(color, rough = 0.7, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
}
function fabric(color, rough = 0.95) {
  return new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: toTexture(fabricTexture(color, 3), { repeat: [2, 2] }), roughness: rough, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5) });
}

function capsule(r, len, m, seg = 12) {
  const g = new THREE.CapsuleGeometry(r, len, 6, seg);
  const mesh = new THREE.Mesh(g, m);
  return mesh;
}

function logoTexture() {
  const cv = canvas(256, 256), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#2f5f8f';
  ctx.beginPath();
  ctx.moveTo(200, 128);
  ctx.bezierCurveTo(170, 70, 90, 70, 70, 128);
  ctx.bezierCurveTo(90, 186, 170, 186, 200, 128);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(78, 128);
  ctx.lineTo(30, 88);
  ctx.quadraticCurveTo(45, 128, 30, 168);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(172, 118, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#10203a';
  ctx.beginPath();
  ctx.arc(174, 118, 4, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(cv);
}

export class CharacterModel {
  constructor(look) {
    this.root = new THREE.Group();
    this.root.name = 'keeper';
    this.j = {};
    this.props = {};
    this.build(look);
  }

  build(look) {
    this.look = { ...look };
    this.root.clear();
    const j = (this.j = {});
    for (const n of JOINTS) {
      j[n] = new THREE.Group();
      j[n].name = n;
    }
    const D = DIM;
    // hierarchy
    this.root.add(j.hips);
    j.hips.position.y = D.hipY;
    j.hips.add(j.spine, j.lHip, j.rHip);
    j.spine.position.y = 0.02;
    j.spine.add(j.chest);
    j.chest.position.y = D.spine;
    j.chest.add(j.neck, j.lShoulder, j.rShoulder);
    j.neck.position.y = D.chest;
    j.neck.add(j.head);
    j.head.position.y = D.neck;
    j.lShoulder.position.set(D.shoulderX, D.chest - 0.035, 0);
    j.rShoulder.position.set(-D.shoulderX, D.chest - 0.035, 0);
    j.lShoulder.add(j.lElbow);
    j.rShoulder.add(j.rElbow);
    j.lElbow.position.y = -D.upperArm;
    j.rElbow.position.y = -D.upperArm;
    j.lElbow.add(j.lWrist);
    j.rElbow.add(j.rWrist);
    j.lWrist.position.y = -D.foreArm;
    j.rWrist.position.y = -D.foreArm;
    j.lHip.position.set(D.hipX, -0.02, 0);
    j.rHip.position.set(-D.hipX, -0.02, 0);
    j.lHip.add(j.lKnee);
    j.rHip.add(j.rKnee);
    j.lKnee.position.y = -D.thigh;
    j.rKnee.position.y = -D.thigh;
    j.lKnee.add(j.lAnkle);
    j.rKnee.add(j.rAnkle);
    j.lAnkle.position.y = -D.shin;
    j.rAnkle.position.y = -D.shin;

    const skin = new THREE.MeshPhysicalMaterial({ color: look.skin, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xffc0a0), clearcoat: 0.05 });
    const top = fabric(look.topColor);
    const topDark = fabric(new THREE.Color(look.topColor).multiplyScalar(0.85).getStyle());
    const pants = fabric(look.pants, 0.9);
    const shoe = mat(look.shoes, 0.45);
    const sole = mat(0xf2f0ea, 0.6);
    this.mats = { skin, top, pants };

    // ---------------------------------------------------------- torso
    const torsoPts = [[0.0, -0.04], [0.105, -0.035], [0.118, 0.0], [0.115, 0.08], [0.108, 0.17], [0.09, 0.25], [0.05, 0.285], [0.0, 0.29]].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoPts, 28), top);
    torso.scale.set(1, 1, 0.78);
    torso.position.y = -0.0;
    j.spine.add(torso);
    // hem band
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.014, 8, 28), topDark);
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(1, 0.78, 1);
    hem.position.y = -0.03;
    j.spine.add(hem);
    if (look.top === 'hoodie') {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.035, 10, 20, Math.PI * 1.3), topDark);
      hood.rotation.set(Math.PI / 2 - 0.35, 0, Math.PI * 0.85 + 0.18);
      hood.position.set(0, 0.15, -0.045);
      hood.scale.set(1.15, 1, 1);
      j.chest.add(hood);
      const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.055, 0.02, 2, 0.01), topDark);
      pocket.position.set(0, 0.03, 0.085);
      j.spine.add(pocket);
      for (const s of [-1, 1]) {
        const string = capsule(0.004, 0.06, mat(0xe8e4dc, 0.8), 6);
        string.position.set(s * 0.025, 0.11, 0.075);
        j.chest.add(string);
      }
      // fish logo on the back, like the reference keeper
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, roughness: 0.9 }));
      logo.position.set(0, 0.16, -0.093);
      logo.rotation.y = Math.PI;
      j.spine.add(logo);
    } else {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), topDark);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.135;
      j.chest.add(collar);
    }
    // pelvis / seat
    const seat = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 12), pants);
    seat.scale.set(1.05, 0.62, 0.8);
    seat.position.y = -0.02;
    j.hips.add(seat);

    // ------------------------------------------------------------ neck & head
    const neck = capsule(0.035, 0.04, skin, 10);
    neck.position.y = 0.02;
    j.neck.add(neck);
    const headR = D.headR;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 36, 28), skin);
    head.scale.set(1, 0.95, 0.94);
    head.position.y = headR * 0.92;
    j.head.add(head);
    this.headCenter = new THREE.Vector3(0, headR * 0.92, 0);
    // cheeks / jaw softness
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.72, 24, 16), skin);
    jaw.scale.set(1, 0.8, 0.95);
    jaw.position.set(0, headR * 0.62, 0.03);
    j.head.add(jaw);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(s * headR * 0.97, headR * 0.85, 0);
      j.head.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), skin);
    nose.scale.set(1.1, 0.8, 0.9);
    nose.position.set(0, headR * 0.72, headR * 0.93);
    j.head.add(nose);
    // blush
    const blush = new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.28, depthWrite: false });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), blush);
      b.position.set(s * headR * 0.55, headR * 0.68, headR * 0.79);
      b.rotation.y = s * 0.6;
      j.head.add(b);
    }
    // eyes
    this.eyes = [];
    const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1 });
    const irisM = new THREE.MeshPhysicalMaterial({ color: 0x3a2414, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
    const pupilM = new THREE.MeshBasicMaterial({ color: 0x080404 });
    const hlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(s * headR * 0.36, headR * 0.92, headR * 0.82);
      eg.rotation.y = s * 0.3;
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.044, 18, 14), white);
      sclera.scale.set(0.85, 1.05, 0.45);
      eg.add(sclera);
      const irisG = new THREE.Group();
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.034, 18, 14), irisM);
      iris.scale.set(0.85, 1.0, 0.4);
      iris.position.z = 0.009;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), pupilM);
      pupil.scale.set(0.9, 1, 0.4);
      pupil.position.z = 0.017;
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), hlM);
      hl.position.set(0.01, 0.014, 0.024);
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), hlM);
      hl2.position.set(-0.01, -0.012, 0.023);
      irisG.add(iris, pupil, hl, hl2);
      eg.add(irisG);
      // brow
      const brow = capsule(0.006, 0.04, mat(new THREE.Color(look.hairColor).multiplyScalar(0.8), 0.9), 6);
      brow.rotation.z = Math.PI / 2 + s * 0.12;
      brow.position.set(0, 0.062, 0.018);
      eg.add(brow);
      j.head.add(eg);
      this.eyes.push({ group: eg, iris: irisG, brow, side: s });
    }
    // mouth: smile arc + open mouth variant
    const mouthM = mat(0x8a3a32, 0.6);
    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI * 0.8), mouthM);
    this.smile.rotation.z = Math.PI + Math.PI * 0.1;
    this.smile.position.set(0, headR * 0.6, headR * 0.86);
    this.smile.rotation.x = -0.2;
    j.head.add(this.smile);
    this.mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), mat(0x5a1a1a, 0.7));
    this.mouthOpen.scale.set(1.1, 0.9, 0.4);
    this.mouthOpen.position.set(0, headR * 0.56, headR * 0.86);
    this.mouthOpen.visible = false;
    j.head.add(this.mouthOpen);

    this.buildHair(look, j.head, headR);
    this.buildAccessory(look, j.head, j.chest, headR);

    // ------------------------------------------------------------- arms
    for (const side of ['l', 'r']) {
      const s = side === 'l' ? 1 : -1;
      const sh = j[`${side}Shoulder`];
      const upper = capsule(0.04, D.upperArm - 0.03, top);
      upper.position.y = -D.upperArm / 2;
      sh.add(upper);
      const shBall = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 10), top);
      sh.add(shBall);
      const el = j[`${side}Elbow`];
      const fore = capsule(look.top === 'tee' ? 0.029 : 0.036, D.foreArm - 0.04, look.top === 'tee' ? skin : top);
      fore.position.y = -D.foreArm / 2;
      el.add(fore);
      if (look.top !== 'tee') {
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.01, 6, 14), topDark);
        cuff.rotation.x = Math.PI / 2;
        cuff.position.y = -D.foreArm + 0.02;
        el.add(cuff);
      } else {
        const sleeve = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 14), topDark);
        sleeve.rotation.x = Math.PI / 2;
        sleeve.position.y = -D.upperArm + 0.03;
        sh.add(sleeve);
      }
      const wr = j[`${side}Wrist`];
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 12), skin);
      hand.scale.set(0.85, 1.05, 0.7);
      hand.position.y = -0.03;
      wr.add(hand);
      const thumb = capsule(0.012, 0.02, skin, 6);
      thumb.position.set(s * 0.02, -0.025, 0.02);
      thumb.rotation.set(0.5, 0, s * 0.6);
      wr.add(thumb);
      // hand anchor for props
      const anchor = new THREE.Group();
      anchor.position.set(0, -0.055, 0.0);
      wr.add(anchor);
      this.props[`${side}Hand`] = anchor;
    }

    // -------------------------------------------------------------- legs
    for (const side of ['l', 'r']) {
      const hip = j[`${side}Hip`];
      const thigh = capsule(0.052, D.thigh - 0.04, pants);
      thigh.position.y = -D.thigh / 2;
      hip.add(thigh);
      const knee = j[`${side}Knee`];
      const shin = capsule(0.045, D.shin - 0.05, pants);
      shin.position.y = -D.shin / 2;
      knee.add(shin);
      // rolled cuffs
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.016, 8, 18), pants);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -D.shin + 0.035;
      knee.add(cuff);
      const ank = j[`${side}Ankle`];
      const sock = capsule(0.033, 0.02, mat(0xf4f4f4, 0.9), 8);
      sock.position.y = 0.0;
      ank.add(sock);
      const shoeM = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.06, 0.15, 3, 0.028), shoe);
      shoeM.position.set(0, -0.012, 0.03);
      ank.add(shoeM);
      const soleM = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.022, 0.155, 2, 0.01), sole);
      soleM.position.set(0, -0.035, 0.03);
      ank.add(soleM);
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.05), mat(0xffffff, 0.9));
      lace.position.set(0, 0.019, 0.05);
      lace.rotation.x = -0.25;
      ank.add(lace);
    }
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.buildProps();
  }

  buildHair(look, headJ, R) {
    const hm = new THREE.MeshPhysicalMaterial({ color: look.hairColor, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(look.hairColor).lerp(new THREE.Color(0xffffff), 0.35), sheenRoughness: 0.4 });
    const g = new THREE.Group();
    g.position.copy(this.headCenter);
    const rng = makeRng(look.hairStyle);
    const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, hm);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    const cap = new THREE.SphereGeometry(R * 1.04, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const style = look.hairStyle;
    if (style !== 'spiky') add(cap, 0, 0.0, -0.005, 1.02, 1.0, 1.02, -0.15);
    if (style === 'curly') {
      const curl = new THREE.SphereGeometry(0.036, 12, 10);
      for (let i = 0; i < 64; i++) {
        const th = rng() * Math.PI * 2;
        const ph = rng() * Math.PI * 0.52;
        const back = Math.cos(th) < 0 ? 1 : 0;
        const r = R * (0.99 + rng() * 0.04);
        const x = Math.sin(ph) * Math.sin(th) * r * 1.05;
        const y = Math.cos(ph) * r * 0.98 - (back ? rng() * 0.05 : 0);
        const z = Math.sin(ph) * Math.cos(th) * r;
        if (z > R * 0.55 && y < R * 0.5) continue; // keep the face clear
        add(curl, x, y, z, 1 + rng() * 0.3, 0.85 + rng() * 0.25, 1 + rng() * 0.2);
      }
      // fringe curls over the forehead
      const t = new THREE.TorusGeometry(0.026, 0.013, 8, 14);
      for (let i = 0; i < 8; i++) add(t, -0.12 + i * 0.034, R * 0.64 + Math.sin(i) * 0.01, R * 0.78, 1, 1, 1, rng() * 3, rng() * 0.6, rng() * 3);
      // back fluff
      for (let i = 0; i < 6; i++) add(curl, (rng() - 0.5) * 0.22, -0.01 - rng() * 0.06, -R * 0.78, 1.1, 1.1, 0.9);
    } else if (style === 'short') {
      for (let i = 0; i < 10; i++) add(new THREE.SphereGeometry(0.06, 10, 8), -0.12 + i * 0.027, R * 0.62, R * 0.62, 1, 0.5, 0.7, 0.4);
    } else if (style === 'bob') {
      add(new THREE.SphereGeometry(R * 1.12, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.72), 0, -0.02, -0.02, 1.02, 1.05, 1.0);
      for (let i = 0; i < 9; i++) add(new THREE.SphereGeometry(0.05, 10, 8), -0.11 + i * 0.028, R * 0.6, R * 0.74, 1, 0.6, 0.6);
    } else if (style === 'bun') {
      add(new THREE.SphereGeometry(0.085, 16, 12), 0, R * 0.95, -R * 0.45, 1, 1, 1);
      for (let i = 0; i < 7; i++) add(new THREE.SphereGeometry(0.05, 10, 8), -0.09 + i * 0.03, R * 0.62, R * 0.7, 1, 0.55, 0.6);
    } else if (style === 'spiky') {
      add(cap, 0, -0.01, -0.005, 1.0, 0.92, 1.0, -0.1);
      const cone = new THREE.ConeGeometry(0.05, 0.14, 8);
      for (let i = 0; i < 18; i++) {
        const th = rng() * Math.PI * 2, ph = rng() * 0.9;
        const dir = new THREE.Vector3(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th) * 0.8 - 0.2).normalize();
        const m = add(cone, dir.x * R, dir.y * R, dir.z * R);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      }
    } else if (style === 'long') {
      add(new THREE.SphereGeometry(R * 1.1, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 0, -0.02, 1.02, 1.0, 1.02);
      add(new THREE.CapsuleGeometry(R * 0.85, 0.22, 8, 16), 0, -0.18, -0.08, 1.05, 1, 0.55);
      for (let i = 0; i < 8; i++) add(new THREE.SphereGeometry(0.05, 10, 8), -0.1 + i * 0.028, R * 0.62, R * 0.74, 1, 0.55, 0.6);
    }
    headJ.add(g);
    this.hair = g;
  }

  buildAccessory(look, headJ, chestJ, R) {
    const a = look.accessory;
    if (a === 'glasses') {
      const m = mat(0x1a1a1a, 0.3, { metalness: 0.4 });
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 20), m);
        ring.position.set(s * R * 0.36, 0, 0);
        g.add(ring);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.044, 20), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, roughness: 0 }));
        lens.position.set(s * R * 0.36, 0, 0.001);
        g.add(lens);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.17), m);
        arm.position.set(s * R * 0.9, 0.01, -0.09);
        g.add(arm);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), m);
      g.add(bridge);
      g.position.set(0, R * 0.92, R * 0.95);
      headJ.add(g);
    } else if (a === 'cap') {
      const m = fabric('#c84a3a', 0.8);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
      dome.position.copy(this.headCenter).add(new THREE.Vector3(0, 0.03, -0.01));
      dome.rotation.x = -0.12;
      headJ.add(dome);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 24, 1, false, -Math.PI / 2, Math.PI), m);
      brim.position.copy(this.headCenter).add(new THREE.Vector3(0, 0.05, R * 0.85));
      brim.rotation.x = 0.15;
      brim.scale.set(1, 1, 0.8);
      headJ.add(brim);
    } else if (a === 'headphones') {
      const m = mat(0x2a2a30, 0.4);
      const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.12, 0.014, 8, 24, Math.PI), m);
      band.position.copy(this.headCenter);
      headJ.add(band);
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 18), m);
        cup.rotation.z = Math.PI / 2;
        cup.position.copy(this.headCenter).add(new THREE.Vector3(s * R * 1.08, -0.01, 0));
        headJ.add(cup);
      }
    } else if (a === 'scarf') {
      const m = fabric('#3a7a9a', 0.9);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 10, 22), m);
      loop.rotation.x = Math.PI / 2;
      loop.position.y = 0.14;
      chestJ.add(loop);
      const tail = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.14, 0.025, 2, 0.01), m);
      tail.position.set(0.04, 0.06, 0.085);
      tail.rotation.z = 0.15;
      chestJ.add(tail);
    }
  }

  buildProps() {
    // food container
    const jar = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.09, 18), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.05 }));
    const food = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.06, 16), mat(0xc88a3a, 0.9));
    food.position.y = -0.012;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 18), mat(0xd84a2a, 0.5));
    lid.position.y = 0.054;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0385, 0.0385, 0.035, 18, 1, true), mat(0xf4ecd8, 0.8));
    jar.add(body, food, lid, label);
    jar.visible = false;
    this.props.jar = jar;
    // cleaning cloth
    const cloth = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.02, 0.06, 2, 0.008), mat(0x4ab8e8, 0.95));
    cloth.visible = false;
    this.props.cloth = cloth;
    // phone
    const phone = new THREE.Group();
    const pb = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.11, 0.01, 2, 0.006), mat(0x1e1e24, 0.3, { metalness: 0.5 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.1), new THREE.MeshBasicMaterial({ color: 0x6ac8ff }));
    screen.position.z = -0.006;
    screen.rotation.y = Math.PI;
    phone.add(pb, screen);
    phone.visible = false;
    this.props.phone = phone;
    this.props.phoneScreen = screen;
  }

  attach(propName, hand = 'r') {
    const p = this.props[propName];
    if (!p) return;
    this.props[`${hand}Hand`].add(p);
    p.visible = true;
    p.position.set(0, -0.02, 0.02);
    p.rotation.set(0, 0, 0);
    if (propName === 'jar') p.position.set(0, -0.03, 0.02);
    if (propName === 'phone') p.rotation.set(Math.PI / 2, 0, 0);
  }
  detach(propName) {
    const p = this.props[propName];
    if (!p) return;
    p.visible = false;
    p.removeFromParent();
  }

  // Apply a pose: map of joint -> [x,y,z] rotations, plus hips offset y
  applyPose(pose) {
    for (const n of JOINTS) {
      const r = pose[n];
      if (r) this.j[n].rotation.set(r[0], r[1], r[2]);
    }
    this.j.hips.position.y = DIM.hipY + (pose.hipsY ?? 0);
    this.j.hips.position.z = pose.hipsZ ?? 0;
  }

  setExpression(expr, blink) {
    this.smile.visible = expr !== 'wow';
    this.mouthOpen.visible = expr === 'wow' || expr === 'joy';
    this.smile.scale.setScalar(expr === 'joy' ? 1.25 : expr === 'focus' ? 0.6 : 1);
    for (const e of this.eyes) {
      e.brow.position.y = expr === 'wow' ? 0.075 : expr === 'focus' ? 0.055 : 0.062;
      e.brow.rotation.z = Math.PI / 2 + e.side * (expr === 'focus' ? -0.2 : 0.12);
      e.group.scale.y = (expr === 'joy' ? 0.7 : 1) * Math.max(0.08, 1 - blink);
    }
  }

  lookEyes(dx, dy) {
    for (const e of this.eyes) e.iris.position.set(dx * 0.012, dy * 0.012, 0);
  }
}
