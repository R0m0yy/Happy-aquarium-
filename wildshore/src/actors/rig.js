// Procedural pose layering on top of the survivor's skeletal clips.
// Rotations are authored in *character space* (+Z forward, -X right, +Y up) and converted
// into each bone's local frame at runtime, so poses are rig-agnostic and blendable.
import * as THREE from 'three';

export const AX = {
  R: new THREE.Vector3(-1, 0, 0), // character's right
  U: new THREE.Vector3(0, 1, 0),
  F: new THREE.Vector3(0, 0, 1),
};

const BONES = {
  hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head',
  lSh: 'LeftShoulder', lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand',
  rSh: 'RightShoulder', rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand',
  lUp: 'LeftUpLeg', lLeg: 'LeftLeg', lFoot: 'LeftFoot', rUp: 'RightUpLeg', rLeg: 'RightLeg', rFoot: 'RightFoot',
};
const ORDER = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'lSh', 'lArm', 'lFore', 'lHand', 'rSh', 'rArm', 'rFore', 'rHand', 'lUp', 'lLeg', 'lFoot', 'rUp', 'rLeg', 'rFoot'];

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion(), _rq = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion(), _rootQi = new THREE.Quaternion();
const _axis = new THREE.Vector3();

export class PoseRig {
  constructor(model, root) {
    this.root = root; // character-space reference object (faces +Z)
    this.bones = {};
    model.traverse((o) => {
      if (!o.isBone) return;
      const n = o.name.replace(/^mixamorig:?/, '');
      for (const [k, v] of Object.entries(BONES)) if (n === v) this.bones[k] = o;
    });
    this.acc = new Map(); // bone -> list of [axis, angle]
  }

  reset() { this.acc.clear(); }

  add(bone, axis, angle) {
    if (!angle) return;
    let l = this.acc.get(bone);
    if (!l) this.acc.set(bone, (l = []));
    l.push(axis, angle);
  }

  // apply accumulated rotations, parents first
  apply() {
    if (!this.acc.size) return;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(_rootQ);
    _rootQi.copy(_rootQ).invert();
    for (const key of ORDER) {
      const list = this.acc.get(key);
      if (!list) continue;
      const b = this.bones[key];
      if (!b) continue;
      b.parent.updateWorldMatrix(true, false);
      b.parent.getWorldQuaternion(_pq);
      // parent orientation expressed in character space
      _pq.premultiply(_rootQi);
      _pqi.copy(_pq).invert();
      for (let i = 0; i < list.length; i += 2) {
        _rq.setFromAxisAngle(list[i], list[i + 1]);
        // q' = P^-1 * R * P * q
        _q.copy(_pqi).multiply(_rq).multiply(_pq);
        b.quaternion.premultiply(_q);
      }
      b.updateMatrixWorld(true);
    }
  }
}

// ---------- pose library: fn(rig, t, w, p) where p = params ----------
const S = Math.sin, Cc = Math.cos, PI = Math.PI;
const ease = (x) => x * x * (3 - 2 * x);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

export const POSES = {
  crouch(r, t, w) {
    r.add('lUp', AX.R, 0.95 * w); r.add('rUp', AX.R, 0.95 * w);
    r.add('lLeg', AX.R, -1.5 * w); r.add('rLeg', AX.R, -1.5 * w);
    r.add('lFoot', AX.R, 0.5 * w); r.add('rFoot', AX.R, 0.5 * w);
    r.add('spine', AX.R, -0.35 * w);
    r.add('neck', AX.R, 0.3 * w);
  },
  // overhead axe swing, t = 0..1 over the action
  chop(r, t, w) {
    const up = ease(seg(t, 0, 0.45)), down = ease(seg(t, 0.45, 0.6)), back = ease(seg(t, 0.7, 1));
    const raise = (up * 2.6 - down * 2.1) * (1 - back * 0.25) - back * 0.5 * (1 - 0.0);
    const lean = (up * 0.18 - down * 0.55) * (1 - back);
    r.add('spine', AX.R, lean * w);
    r.add('spine1', AX.U, (up * 0.35 - down * 0.45) * (1 - back) * w);
    r.add('rArm', AX.R, raise * w);
    r.add('lArm', AX.R, raise * 0.9 * w);
    r.add('rArm', AX.F, 0.25 * w);
    r.add('lArm', AX.F, -0.25 * w);
    r.add('rFore', AX.R, (0.6 + up * 0.5 - down * 0.6) * w);
    r.add('lFore', AX.R, (0.6 + up * 0.5 - down * 0.6) * w);
    r.add('lUp', AX.R, 0.2 * w); r.add('lLeg', AX.R, -0.3 * w);
  },
  // bend down and gather from the ground / bush
  gather(r, t, w) {
    const k = S(Math.min(1, t * 1.2) * PI) * w;
    r.add('spine', AX.R, -0.75 * k); r.add('spine1', AX.R, -0.3 * k);
    r.add('lUp', AX.R, 0.6 * k); r.add('rUp', AX.R, 0.6 * k);
    r.add('lLeg', AX.R, -0.9 * k); r.add('rLeg', AX.R, -0.9 * k);
    r.add('lFoot', AX.R, 0.3 * k); r.add('rFoot', AX.R, 0.3 * k);
    r.add('rArm', AX.R, (1.1 + S(t * PI * 6) * 0.15) * k); r.add('lArm', AX.R, 0.9 * k);
    r.add('rFore', AX.R, 0.3 * k);
  },
  thrust(r, t, w) {
    const wind = ease(seg(t, 0, 0.4)), jab = ease(seg(t, 0.4, 0.55)), rec = ease(seg(t, 0.65, 1));
    const a = (1.4 + wind * 0.2 + jab * 0.2) * (1 - rec * 0.5);
    r.add('rArm', AX.R, a * w); r.add('lArm', AX.R, (1.3) * w * (1 - rec * 0.5));
    r.add('rFore', AX.R, (1.2 - wind * 0.0 + wind * 0.6 - jab * 1.6 + rec * 0.4) * w);
    r.add('lFore', AX.R, 0.8 * w);
    r.add('spine', AX.U, (wind * 0.4 - jab * 0.6) * (1 - rec) * w);
    r.add('spine', AX.R, (-jab * 0.3) * (1 - rec) * w);
    r.add('lUp', AX.R, 0.35 * w); r.add('lLeg', AX.R, -0.4 * w);
  },
  aim(r, t, w) {
    r.add('rArm', AX.R, 2.6 * w); r.add('rArm', AX.F, 0.3 * w);
    r.add('rFore', AX.R, 0.9 * w);
    r.add('lArm', AX.R, 1.3 * w); r.add('lArm', AX.F, -0.3 * w);
    r.add('spine', AX.U, 0.45 * w);
  },
  throw(r, t, w) {
    const wind = ease(seg(t, 0, 0.35)), rel = ease(seg(t, 0.35, 0.55)), rec = ease(seg(t, 0.6, 1));
    r.add('rArm', AX.R, (wind * 2.8 - rel * 2.0 - rec * 0.6) * w);
    r.add('rArm', AX.F, (wind * 0.4) * w * (1 - rec));
    r.add('rFore', AX.R, (wind * 1.0 - rel * 0.9) * w);
    r.add('spine', AX.U, (wind * 0.6 - rel * 0.9) * (1 - rec) * w);
    r.add('spine', AX.R, (-rel * 0.35) * (1 - rec) * w);
    r.add('lArm', AX.R, (wind * 1.2) * (1 - rec) * w);
    r.add('lUp', AX.R, 0.3 * w); r.add('lLeg', AX.R, -0.3 * w);
  },
  eat(r, t, w) {
    const k = ease(seg(t, 0, 0.25)) * (1 - ease(seg(t, 0.85, 1))) * w;
    const chew = S(t * PI * 10) * 0.08;
    r.add('rArm', AX.R, 0.9 * k); r.add('rArm', AX.F, -0.35 * k);
    r.add('rFore', AX.R, (2.0 + chew) * k);
    r.add('head', AX.R, (-0.15 + chew) * k);
  },
  drink(r, t, w) {
    const k = ease(seg(t, 0, 0.2)) * (1 - ease(seg(t, 0.85, 1))) * w;
    r.add('rArm', AX.R, 1.0 * k); r.add('lArm', AX.R, 1.0 * k);
    r.add('rFore', AX.R, 1.9 * k); r.add('lFore', AX.R, 1.9 * k);
    r.add('rArm', AX.F, -0.3 * k); r.add('lArm', AX.F, 0.3 * k);
    r.add('head', AX.R, 0.35 * k); r.add('neck', AX.R, 0.15 * k);
  },
  // scoop water from a pond / kneel
  kneelDrink(r, t, w) {
    POSES.crouch(r, t, w);
    const k = S(Math.min(1, t) * PI) * w;
    r.add('spine', AX.R, -0.6 * k);
    r.add('rArm', AX.R, (1.2 - S(t * PI * 4) * 0.4) * k); r.add('lArm', AX.R, 1.2 * k);
    r.add('rFore', AX.R, (0.6 + S(t * PI * 4) * 0.8) * k); r.add('lFore', AX.R, 0.8 * k);
  },
  hammer(r, t, w, p) {
    POSES.crouch(r, t, w * 0.8);
    const hit = (S((p?.time || t * 5) * PI * 2 * 1.6) * 0.5 + 0.5);
    r.add('spine', AX.R, -0.25 * w);
    r.add('rArm', AX.R, (0.9 + hit * 1.0) * w); r.add('rFore', AX.R, (0.5 + hit * 0.5) * w);
    r.add('lArm', AX.R, 0.9 * w); r.add('lFore', AX.R, 0.4 * w);
  },
  cook(r, t, w, p) {
    POSES.crouch(r, t, w);
    const s = S((p?.time || 0) * 2.2) * 0.2;
    r.add('rArm', AX.R, (1.1 + s) * w); r.add('lArm', AX.R, (0.9 - s) * w);
    r.add('rFore', AX.R, 0.6 * w); r.add('lFore', AX.R, 0.6 * w);
    r.add('spine', AX.R, -0.25 * w);
  },
  carry(r, t, w) {
    r.add('rArm', AX.R, 0.85 * w); r.add('lArm', AX.R, 0.85 * w);
    r.add('rArm', AX.F, 0.25 * w); r.add('lArm', AX.F, -0.25 * w);
    r.add('rFore', AX.R, 0.9 * w); r.add('lFore', AX.R, 0.9 * w);
    r.add('spine', AX.R, 0.1 * w);
  },
  holdTorch(r, t, w) {
    r.add('lArm', AX.R, 0.9 * w); r.add('lFore', AX.R, 1.0 * w); r.add('lArm', AX.F, 0.1 * w);
  },
  holdTool(r, t, w) {
    r.add('rArm', AX.R, 0.25 * w); r.add('rFore', AX.R, 0.55 * w);
  },
  holdSpear(r, t, w) {
    r.add('rArm', AX.R, 0.45 * w); r.add('rFore', AX.R, 1.0 * w); r.add('rArm', AX.F, -0.1 * w);
  },
  // surface freestyle swim; p.time drives the stroke cycle
  swim(r, t, w, p) {
    const ph = (p?.time || 0) * 3.2;
    r.add('hips', AX.R, -1.25 * w);
    r.add('neck', AX.R, 0.55 * w); r.add('head', AX.R, 0.35 * w);
    r.add('rArm', AX.R, (1.6 + S(ph) * 1.6) * w);
    r.add('lArm', AX.R, (1.6 + S(ph + PI) * 1.6) * w);
    r.add('rArm', AX.F, -0.35 * w); r.add('lArm', AX.F, 0.35 * w);
    r.add('rFore', AX.R, (0.3 + Math.max(0, Cc(ph)) * 0.8) * w);
    r.add('lFore', AX.R, (0.3 + Math.max(0, Cc(ph + PI)) * 0.8) * w);
    r.add('spine', AX.F, S(ph) * 0.12 * w);
    const kick = S(ph * 2.0) * 0.28;
    r.add('lUp', AX.R, kick * w); r.add('rUp', AX.R, -kick * w);
    r.add('lLeg', AX.R, (-0.25 - Math.max(0, kick)) * w); r.add('rLeg', AX.R, (-0.25 - Math.max(0, -kick)) * w);
    r.add('lFoot', AX.R, -0.6 * w); r.add('rFoot', AX.R, -0.6 * w);
  },
  tread(r, t, w, p) {
    const ph = (p?.time || 0) * 2.0;
    r.add('rArm', AX.F, (-1.1 + S(ph) * 0.25) * w); r.add('lArm', AX.F, (1.1 - S(ph) * 0.25) * w);
    r.add('rArm', AX.R, (0.5 + S(ph) * 0.4) * w); r.add('lArm', AX.R, (0.5 - S(ph) * 0.4) * w);
    r.add('rFore', AX.R, 0.5 * w); r.add('lFore', AX.R, 0.5 * w);
    r.add('lUp', AX.R, (0.4 + S(ph) * 0.3) * w); r.add('rUp', AX.R, (0.4 - S(ph) * 0.3) * w);
    r.add('lLeg', AX.R, -0.8 * w); r.add('rLeg', AX.R, -0.8 * w);
  },
  // underwater: p.pitch (+ up / - down) and frog-kick strokes
  dive(r, t, w, p) {
    const ph = (p?.time || 0) * 2.6;
    const pitch = p?.pitch || 0;
    r.add('hips', AX.R, (-1.45 + pitch) * w);
    r.add('neck', AX.R, 0.5 * w);
    const stroke = S(ph) * 0.5 + 0.5;
    r.add('rArm', AX.R, (2.4 - stroke * 1.6) * w); r.add('lArm', AX.R, (2.4 - stroke * 1.6) * w);
    r.add('rArm', AX.F, (-0.2 - stroke * 0.9) * w); r.add('lArm', AX.F, (0.2 + stroke * 0.9) * w);
    r.add('rFore', AX.R, (0.2 + stroke * 0.3) * w); r.add('lFore', AX.R, (0.2 + stroke * 0.3) * w);
    const kick = S(ph + 1.2) * 0.5 + 0.5;
    r.add('lUp', AX.R, (0.2 + kick * 0.5) * w); r.add('rUp', AX.R, (0.2 + kick * 0.5) * w);
    r.add('lUp', AX.F, -0.25 * kick * w); r.add('rUp', AX.F, 0.25 * kick * w);
    r.add('lLeg', AX.R, (-0.2 - kick * 1.2) * w); r.add('rLeg', AX.R, (-0.2 - kick * 1.2) * w);
    r.add('lFoot', AX.R, -0.7 * w); r.add('rFoot', AX.R, -0.7 * w);
  },
  diveSpear(r, t, w, p) {
    // spearfishing stab underwater (t: 0..1)
    const jab = ease(seg(t, 0.2, 0.45)), rec = ease(seg(t, 0.55, 1));
    r.add('rArm', AX.R, (1.6 + jab * 0.3 - rec * 0.3) * w);
    r.add('rFore', AX.R, (1.3 - jab * 1.4 + rec * 1.2) * w);
  },
  sit(r, t, w) {
    r.add('lUp', AX.R, 1.45 * w); r.add('rUp', AX.R, 1.45 * w);
    r.add('lLeg', AX.R, -0.35 * w); r.add('rLeg', AX.R, -0.35 * w);
    r.add('lUp', AX.F, -0.1 * w); r.add('rUp', AX.F, 0.1 * w);
  },
  paddle(r, t, w, p) {
    POSES.sit(r, t, w);
    const ph = (p?.time || 0) * 2.4 * (p?.rate || 1);
    const side = S(ph);
    r.add('spine', AX.U, side * 0.45 * w);
    r.add('spine', AX.R, (-0.2 - Math.abs(side) * 0.1) * w);
    r.add('rArm', AX.R, (1.1 + Cc(ph) * 0.3) * w); r.add('lArm', AX.R, (1.1 - Cc(ph) * 0.3) * w);
    r.add('rArm', AX.F, (-0.25 + side * 0.3) * w); r.add('lArm', AX.F, (0.25 + side * 0.3) * w);
    r.add('rFore', AX.R, 0.7 * w); r.add('lFore', AX.R, 0.7 * w);
  },
  sleep(r, t, w, p) {
    const br = S((p?.time || 0) * 1.3) * 0.03;
    r.add('hips', AX.F, -1.5 * w);
    r.add('lUp', AX.R, 0.6 * w); r.add('rUp', AX.R, 0.8 * w);
    r.add('lLeg', AX.R, -0.9 * w); r.add('rLeg', AX.R, -1.1 * w);
    r.add('rArm', AX.R, 1.2 * w); r.add('lArm', AX.R, 1.0 * w);
    r.add('rFore', AX.R, 1.3 * w); r.add('lFore', AX.R, 1.2 * w);
    r.add('spine', AX.R, (-0.25 + br) * w);
    r.add('neck', AX.R, -0.2 * w);
  },
  limp(r, t, w, p) {
    const ph = (p?.time || 0) * 5;
    r.add('hips', AX.F, S(ph) * 0.12 * w);
    r.add('spine', AX.F, -S(ph) * 0.1 * w);
    r.add('rUp', AX.R, -0.1 * w);
    r.add('spine', AX.R, -0.12 * w);
  },
  hurt(r, t, w) {
    const k = S(Math.min(1, t) * PI) * w;
    r.add('spine', AX.R, 0.35 * k); r.add('head', AX.R, 0.3 * k);
    r.add('rArm', AX.F, -0.6 * k); r.add('lArm', AX.F, 0.6 * k);
  },
  fishCast(r, t, w, p) {
    const wind = ease(seg(t, 0, 0.3)), cast = ease(seg(t, 0.3, 0.45));
    const hold = p?.hold ? 1 : 0;
    r.add('rArm', AX.R, (0.9 + wind * 1.6 - cast * 1.4) * w); r.add('rFore', AX.R, (0.8 - cast * 0.3) * w);
    r.add('lArm', AX.R, 0.7 * w); r.add('lFore', AX.R, 0.9 * w);
    r.add('spine', AX.R, (wind * 0.15 - cast * 0.25) * w);
    if (hold) r.add('rArm', AX.R, S((p?.time || 0) * 3) * 0.05 * w);
  },
};
