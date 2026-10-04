// The keeper: procedural animation, navigation with acceleration/braking,
// a task queue for physical interactions (feed, clean, photo, pet, decorate)
// and an idle-life AI that keeps the room alive.
import * as THREE from 'three';
import { CharacterModel, JOINTS, DIM } from './CharacterModel.js';
import { makeStool } from '../render/props.js';
import { clamp, lerp, damp, dampAngle, angleDiff, randRange, pick, weightedPick, easeInOut } from '../core/util.js';
import { bus } from '../core/EventBus.js';

const Z = () => [0, 0, 0];
function basePose() {
  const p = {};
  for (const n of JOINTS) p[n] = Z();
  p.hipsY = 0;
  p.hipsZ = 0;
  return p;
}

// ------------------------------------------------------------------ poses
const POSES = {
  idle(t, p) {
    const b = Math.sin(t * 1.6) * 0.012;
    p.chest[0] = b;
    p.spine[0] = -0.02;
    p.lShoulder = [0.05, 0, 0.12 + b];
    p.rShoulder = [0.05, 0, -0.12 - b];
    p.lElbow[0] = -0.15;
    p.rElbow[0] = -0.15;
    p.hipsY = Math.sin(t * 1.6) * 0.003;
    p.head[1] = Math.sin(t * 0.4) * 0.1;
    p.lHip = [0, 0, 0.03];
    p.rHip = [0, 0, -0.03];
  },
  walk(t, p, k) {
    // k: {phase, amount(0..1), run}
    const ph = k.phase;
    const a = k.amount;
    const run = k.run ? 1 : 0;
    const swing = (0.48 + run * 0.25) * a;
    const s = Math.sin(ph), c = Math.cos(ph);
    p.lHip[0] = -s * swing;
    p.rHip[0] = s * swing;
    p.lKnee[0] = Math.max(0, c) * (0.75 + run * 0.5) * a + 0.05;
    p.rKnee[0] = Math.max(0, -c) * (0.75 + run * 0.5) * a + 0.05;
    p.lAnkle[0] = s * 0.2 * a;
    p.rAnkle[0] = -s * 0.2 * a;
    p.lShoulder = [s * (0.42 + run * 0.3) * a + 0.05, 0, 0.12];
    p.rShoulder = [-s * (0.42 + run * 0.3) * a + 0.05, 0, -0.12];
    p.lElbow[0] = -0.25 - run * 0.9 * a;
    p.rElbow[0] = -0.25 - run * 0.9 * a;
    p.spine[1] = s * 0.08 * a;
    p.spine[0] = (0.04 + run * 0.12) * a;
    p.hipsY = -Math.abs(Math.sin(ph)) * 0.018 * a + 0.004 * a;
    p.head[0] = -0.04 * a;
  },
  crouch(t, p) {
    p.lHip[0] = -1.35;
    p.rHip[0] = -1.35;
    p.lKnee[0] = 2.2;
    p.rKnee[0] = 2.2;
    p.lAnkle[0] = -0.85;
    p.rAnkle[0] = -0.85;
    p.hipsY = -0.2;
    p.hipsZ = -0.05;
    p.spine[0] = 0.45;
    p.lShoulder = [-0.9, 0, 0.1];
    p.rShoulder = [-0.9, 0, -0.1];
    p.lElbow[0] = -0.3;
    p.rElbow[0] = -0.3;
    p.head[0] = 0.15;
  },
  sitFloor(t, p) {
    p.hipsY = -DIM.hipY + 0.06;
    p.lHip = [-1.45, 0.55, 0.2];
    p.rHip = [-1.45, -0.55, -0.2];
    p.lKnee[0] = 2.3;
    p.rKnee[0] = 2.3;
    p.spine[0] = 0.15 + Math.sin(t * 1.4) * 0.01;
    p.lShoulder = [-0.5, 0, 0.15];
    p.rShoulder = [-0.5, 0, -0.15];
    p.lElbow[0] = -1.4;
    p.rElbow[0] = -1.4;
    p.lWrist[0] = 0.3;
    p.rWrist[0] = 0.3;
  },
  sitChin(t, p) {
    // sitting, chin resting on hands, watching fish (reference pose)
    POSES.sitFloor(t, p);
    p.spine[0] = 0.4;
    p.lShoulder = [-1.0, 0, 0.25];
    p.rShoulder = [-1.0, 0, -0.25];
    p.lElbow[0] = -2.2;
    p.rElbow[0] = -2.2;
    p.lKnee[0] = 2.5;
    p.rKnee[0] = 2.5;
    p.lHip = [-1.75, 0.15, 0.12];
    p.rHip = [-1.75, -0.15, -0.12];
    p.head[0] = -0.2;
  },
  sitChair(t, p) {
    p.hipsY = -0.02;
    p.lHip = [-1.5, 0.1, 0.05];
    p.rHip = [-1.5, -0.1, -0.05];
    p.lKnee[0] = 1.45;
    p.rKnee[0] = 1.45;
    p.spine[0] = -0.12 + Math.sin(t * 1.4) * 0.01;
    p.lShoulder = [-0.25, 0, 0.2];
    p.rShoulder = [-0.25, 0, -0.2];
    p.lElbow[0] = -0.9;
    p.rElbow[0] = -0.9;
  },
  reach(t, p) {
    POSES.idle(t, p);
    p.rShoulder = [-2.7, 0, -0.1];
    p.rElbow[0] = -0.25;
    p.lShoulder = [-1.0, 0, 0.25];
    p.lElbow[0] = -0.9;
    p.spine[0] = -0.08;
    p.head[0] = -0.35;
  },
  shake(t, p) {
    POSES.reach(t, p);
    const s = Math.sin(t * 18);
    p.rShoulder[0] += s * 0.12;
    p.rWrist[2] = s * 0.5;
    p.rWrist[0] = 0.6 + s * 0.2;
  },
  point(t, p) {
    POSES.idle(t, p);
    p.rShoulder = [-1.45, 0, -0.3];
    p.rElbow[0] = -0.05;
    p.rWrist[0] = -0.1;
    p.spine[0] = 0.04;
  },
  wave(t, p) {
    POSES.idle(t, p);
    p.rShoulder = [-0.3, 0, -2.55];
    p.rElbow[0] = 0;
    p.rElbow[2] = -0.4 + Math.sin(t * 10) * 0.35;
    p.head[2] = 0.08;
  },
  palmGlass(t, p) {
    POSES.idle(t, p);
    p.rShoulder = [-1.75, 0, -0.15];
    p.rElbow[0] = -0.2;
    p.rWrist[0] = -1.0;
    p.spine[0] = 0.05;
  },
  wipe(t, p) {
    POSES.idle(t, p);
    const a = t * 5.5;
    p.rShoulder = [-1.75 + Math.sin(a) * 0.35, 0, -0.35 + Math.cos(a) * 0.35];
    p.rElbow[0] = -0.35 + Math.cos(a) * 0.15;
    p.rWrist[0] = -1.2;
    p.lShoulder = [-0.5, 0, 0.25];
    p.lElbow[0] = -0.8;
    p.spine[1] = Math.sin(a) * 0.08;
    p.hipsY = Math.sin(a * 2) * 0.004;
  },
  phone(t, p) {
    POSES.idle(t, p);
    p.rShoulder = [-1.5, 0, 0.12];
    p.lShoulder = [-1.5, 0, -0.12];
    p.rElbow[0] = -1.1;
    p.lElbow[0] = -1.1;
    p.rWrist[0] = 0.2;
    p.lWrist[0] = 0.2;
    p.rShoulder[1] = 0.25;
    p.lShoulder[1] = -0.25;
  },
  celebrate(t, p) {
    POSES.idle(t, p);
    const j = Math.max(0, Math.sin(t * 7));
    p.hipsY = j * 0.12;
    p.lShoulder = [-0.2, 0, 2.6];
    p.rShoulder = [-0.2, 0, -2.6];
    p.lElbow[0] = -0.3;
    p.rElbow[0] = -0.3;
    p.lKnee[0] = (1 - j) * 0.6;
    p.rKnee[0] = (1 - j) * 0.6;
    p.lHip[0] = -(1 - j) * 0.4;
    p.rHip[0] = -(1 - j) * 0.4;
  },
  pet(t, p) {
    POSES.crouch(t, p);
    const s = Math.sin(t * 3.2);
    p.rShoulder = [-1.0 + s * 0.2, 0, -0.1];
    p.rElbow[0] = -0.2 + s * 0.1;
    p.lShoulder = [-0.3, 0, 0.2];
    p.spine[0] = 0.5;
  },
  inspect(t, p) {
    POSES.idle(t, p);
    p.spine[0] = 0.35;
    p.lHip[0] = -0.3;
    p.rHip[0] = -0.3;
    p.lKnee[0] = 0.35;
    p.rKnee[0] = 0.35;
    p.hipsY = -0.025;
    p.lShoulder = [-0.55, 0, 0.18];
    p.rShoulder = [-0.55, 0, -0.18];
    p.lElbow[0] = -0.1;
    p.rElbow[0] = -0.1;
    p.head[0] = -0.25;
  },
  window(t, p) {
    POSES.idle(t, p);
    p.lShoulder = [0.35, 0, 0.18];
    p.rShoulder = [0.35, 0, -0.18];
    p.lElbow[0] = -0.9;
    p.rElbow[0] = -0.9;
    p.lElbow[1] = 0.6;
    p.rElbow[1] = -0.6;
    p.head[0] = -0.05;
  },
  carry(t, p, k) {
    POSES.walk(t, p, k);
    p.lShoulder = [-0.9, 0, 0.3];
    p.rShoulder = [-0.9, 0, -0.3];
    p.lElbow = [-0.7, 0, 0];
    p.rElbow = [-0.7, 0, 0];
    p.spine[0] -= 0.06;
  },
  climb(t, p, k) {
    // k.amount: 0..1 progress up the step
    const u = k.amount;
    const lift = Math.sin(u * Math.PI);
    p.lHip[0] = -lift * 1.2;
    p.lKnee[0] = lift * 1.6;
    p.rHip[0] = -lift * 0.2;
    p.rKnee[0] = lift * 0.4;
    p.spine[0] = lift * 0.3;
    p.lShoulder = [-0.4 * lift, 0, 0.2];
    p.rShoulder = [-0.4 * lift, 0, -0.2];
  },
  stretch(t, p) {
    POSES.idle(t, p);
    p.lShoulder = [-2.9, 0, 0.2];
    p.rShoulder = [-2.9, 0, -0.2];
    p.spine[0] = -0.12;
    p.head[0] = -0.2;
  },
};

// ------------------------------------------------------------- controller
export class Character {
  constructor(game, look) {
    this.game = game;
    this.model = new CharacterModel(look);
    this.root = this.model.root;
    this.pos = new THREE.Vector3(0, 0, 1.4);
    this.facing = Math.PI;
    this.speed = 0;
    this.path = null;
    this.queue = [];
    this.task = null;
    this.anim = 'idle';
    this.animTime = 0;
    this.walkPhase = 0;
    this.pose = basePose();
    this.target = basePose();
    this.lookAt = null;
    this.headYaw = 0;
    this.headPitch = 0;
    this.blinkT = 2;
    this.blink = 0;
    this.expr = 'smile';
    this.exprTimer = 0;
    this.idleTimer = 2;
    this.busy = false;
    this.elev = 0;
    this.stool = null;
    this.carryingStool = false;
    this.lastStepSign = 0;
    this.scrubTarget = null;
    this.activity = 'idle';
  }

  setLook(look) {
    const hadJar = this.model.props.jar?.visible;
    this.model.build(look);
    if (hadJar) this.model.attach('jar');
  }

  // Place the stool and character in a freshly built room.
  setup(room, aq, nav) {
    this.room = room;
    this.aq = aq;
    this.nav = nav;
    const rim = aq.center.y + aq.dim.h;
    const H = clamp(rim - 1.04, 0.32, 0.95);
    if (this.stool) this.stool.removeFromParent();
    this.stool = makeStool();
    this.stoolH = H * 1.0;
    this.stool.scale.set(1, H / this.stool.userData.topHeight, 1);
    this.stool.position.set(aq.center.x - aq.dim.w / 2 - 0.45, 0, room.cabinetFront + 0.35);
    this.stool.rotation.y = Math.PI;
    room.group.add(this.stool);
    this.carryingStool = false;
    const [x, z] = nav.nearestFree(aq.center.x - 0.6, room.cabinetFront + 0.9);
    this.pos.set(x, 0, z);
    this.elev = 0;
    this.queue = [];
    this.task = null;
    this.busy = false;
    this.root.position.copy(this.pos);
  }

  // --------------------------------------------------------------- tasks
  do(...tasks) {
    this.queue.push(...tasks.flat());
  }
  interrupt(...tasks) {
    this.cleanupTask();
    this.queue = tasks.flat();
    this.task = null;
    this.path = null;
  }
  cleanupTask() {
    if (this.elev > 0.05) {
      // never leave the keeper floating: step down first
      this.elev = 0;
      if (this.stool) this.pos.z = this.stool.position.z + 0.42;
    }
    this.model.detach('cloth');
    this.model.detach('phone');
    if (!this.feeding) this.model.detach('jar');
    if (this.carryingStool) this.dropStool();
    this.sitting = false;
  }

  walkTo(x, z, opts = {}) {
    return { type: 'walk', x, z, ...opts };
  }
  play(anim, dur, extra = {}) {
    return { type: 'anim', anim, dur, ...extra };
  }
  call(fn) {
    return { type: 'call', fn };
  }
  face(angle) {
    return { type: 'face', angle };
  }

  // ------------------------------------------------ high level actions
  feedSequence(onShake, foodX) {
    const room = this.room, aq = this.aq;
    const fx = clamp(foodX ?? aq.center.x + randRange(-0.3, 0.3) * aq.dim.w, aq.minX + 0.35, aq.maxX - 0.35);
    const fz = room.cabinetFront + 0.3;
    const seq = [];
    this.busy = true;
    seq.push(this.call(() => (this.activity = 'feed')));
    const stoolDist = Math.hypot(this.stool.position.x - fx, this.stool.position.z - fz);
    if (stoolDist > 0.25) {
      // fetch the stool and carry it to the tank
      const sx = this.stool.position.x, sz = this.stool.position.z;
      seq.push(this.walkTo(sx, sz + 0.38, { faceTo: [sx, sz] }));
      seq.push(this.play('crouch', 0.45, { onEnd: () => this.pickStool() }));
      seq.push(this.walkTo(fx, fz + 0.42, { faceTo: [fx, fz], carry: true }));
      seq.push(this.play('crouch', 0.45, { onEnd: () => this.placeStool(fx, fz) }));
    } else {
      seq.push(this.walkTo(fx, fz + 0.42, { faceTo: [fx, fz] }));
    }
    seq.push(this.face(Math.PI));
    seq.push(this.call(() => this.model.attach('jar', 'r')));
    seq.push({ type: 'climb', up: true, dur: 0.8 });
    seq.push(this.play('reach', 0.45));
    seq.push(this.play('shake', 1.6, { onStart: () => onShake?.(), look: 'food' }));
    seq.push(this.play('idle', 2.6, { look: 'fish', expr: 'joy' }));
    seq.push({ type: 'climb', up: false, dur: 0.7 });
    seq.push(this.call(() => {
      this.model.detach('jar');
      this.busy = false;
      this.activity = 'idle';
      this.idleTimer = 1;
    }));
    this.interrupt(seq);
  }

  cleanSequence(x) {
    const aq = this.aq, room = this.room;
    this.busy = true;
    const cx = clamp(x ?? aq.center.x, aq.minX + 0.3, aq.maxX - 0.3);
    this.interrupt([
      this.call(() => (this.activity = 'clean')),
      this.walkTo(aq.center.x + 0.15, room.cabinetFront + 0.35, { faceTo: [aq.center.x, room.cabinetFront] }),
      this.play('crouch', 0.5, { onEnd: () => this.model.attach('cloth', 'r') }),
      this.walkTo(cx, room.cabinetFront + 0.3, { faceTo: [cx, room.cabinetFront - 0.5] }),
      this.face(Math.PI),
      { type: 'wipe' },
    ]);
  }

  endClean() {
    if (this.activity !== 'clean') return;
    this.interrupt([
      this.play('celebrate', 1.0, { expr: 'joy' }),
      this.call(() => {
        this.model.detach('cloth');
        this.busy = false;
        this.activity = 'idle';
      }),
    ]);
  }

  photoSequence(onSnap) {
    const aq = this.aq, room = this.room;
    this.busy = true;
    const px = aq.center.x + randRange(-0.5, 0.5), pz = room.cabinetFront + 1.3;
    this.interrupt([
      this.call(() => (this.activity = 'photo')),
      this.walkTo(px, pz, { faceTo: [aq.center.x, aq.center.z] }),
      this.call(() => this.model.attach('phone', 'r')),
      this.play('phone', 1.1, { look: 'tank' }),
      this.call(() => {
        onSnap?.();
        this.model.props.phoneScreen.material.color.set(0xffffff);
        setTimeout(() => this.model.props.phoneScreen.material.color.set(0x6ac8ff), 160);
      }),
      this.play('phone', 0.8, { look: 'tank' }),
      this.play('idle', 0.6, { expr: 'joy' }),
      this.call(() => {
        this.model.detach('phone');
        this.busy = false;
        this.activity = 'idle';
      }),
    ]);
  }

  decorateMode(on) {
    const aq = this.aq, room = this.room;
    if (on) {
      this.busy = true;
      this.interrupt([
        this.call(() => (this.activity = 'decorate')),
        this.walkTo(aq.minX + 0.25, room.cabinetFront + 0.55, { faceTo: [aq.center.x, aq.center.z] }),
        this.play('point', 1.4, { look: 'tank' }),
        { type: 'hold', anim: 'idle', look: 'tank' },
      ]);
    } else if (this.activity === 'decorate') {
      this.interrupt([this.play('celebrate', 0.8, { expr: 'joy' }), this.call(() => {
        this.busy = false;
        this.activity = 'idle';
      })]);
    }
  }

  pointAtTank() {
    if (this.activity === 'decorate' && this.task?.type === 'hold') {
      this.queue.unshift(this.play('point', 1.2, { look: 'selection' }), { type: 'hold', anim: 'idle', look: 'tank' });
      this.task = null;
    }
  }

  petCat(cat) {
    if (this.busy) return;
    this.busy = true;
    const dir = Math.atan2(this.pos.x - cat.pos.x, this.pos.z - cat.pos.z);
    const tx = cat.pos.x + Math.sin(dir) * 0.38, tz = cat.pos.z + Math.cos(dir) * 0.38;
    this.interrupt([
      this.call(() => {
        this.activity = 'pet';
        cat.requestStay(6);
      }),
      this.walkTo(tx, tz, { faceTo: [cat.pos.x, cat.pos.z] }),
      this.call(() => cat.beingPetted(3)),
      this.play('pet', 3, { look: 'cat', expr: 'joy' }),
      this.call(() => {
        this.busy = false;
        this.activity = 'idle';
        bus.emit('cat:petted');
      }),
    ]);
  }

  celebrate() {
    if (this.busy || this.elev > 0.05) return;
    this.interrupt([this.play('celebrate', 1.6, { expr: 'joy' })]);
  }

  waveAt(point) {
    if (this.busy || this.elev > 0.05 || this.sitting) return;
    this.interrupt([this.play('wave', 1.6, { expr: 'joy', lookPoint: point })]);
  }

  // ----------------------------------------------------------- stool
  pickStool() {
    this.carryingStool = true;
  }
  placeStool(x, z) {
    this.carryingStool = false;
    this.stool.position.set(x, 0, z);
    this.stool.rotation.set(0, Math.PI, 0);
  }
  dropStool() {
    this.carryingStool = false;
    const [x, z] = this.nav.nearestFree(this.pos.x + Math.sin(this.facing) * 0.3, this.pos.z + Math.cos(this.facing) * 0.3);
    this.stool.position.set(x, 0, z);
    this.stool.rotation.set(0, this.facing, 0);
  }

  // ---------------------------------------------------------- idle AI
  chooseIdle() {
    const g = this.game;
    const aq = this.aq, room = this.room;
    const cat = g.cat;
    const options = [
      ['watch', 3],
      ['sitWatch', 2],
      ['sofa', 1.4],
      ['wander', 1.2],
      ['window', 1],
      ['inspect', 1.5],
      ['pet', cat && !cat.asleep && cat.pos.distanceTo(this.pos) < 4 ? 1.2 : 0],
      ['stretch', 0.4],
    ];
    const choice = weightedPick(options);
    const front = room.cabinetFront;
    const seq = [];
    switch (choice) {
      case 'watch': {
        const x = clamp(aq.center.x + randRange(-0.45, 0.45) * aq.dim.w, aq.minX + 0.2, aq.maxX - 0.2);
        seq.push(this.walkTo(x, front + randRange(0.35, 0.6), { faceTo: [x, aq.center.z] }));
        seq.push(this.play('idle', randRange(6, 12), { look: 'fish', activity: 'watch' }));
        break;
      }
      case 'sitWatch': {
        const x = clamp(aq.center.x + randRange(-0.4, 0.4) * aq.dim.w, aq.minX + 0.2, aq.maxX - 0.2);
        seq.push(this.walkTo(x, front + 0.55, { faceTo: [x, aq.center.z] }));
        seq.push(this.play(Math.random() < 0.6 ? 'sitChin' : 'sitFloor', randRange(10, 20), { look: 'fish', sit: true, activity: 'observe' }));
        break;
      }
      case 'sofa': {
        const seat = pick(room.seats);
        if (!seat) break;
        seq.push(this.walkTo(seat.x + 0.45, seat.z, { faceTo: [seat.x + 2, seat.z] }));
        seq.push({ type: 'sitOn', seat, dur: randRange(10, 18) });
        break;
      }
      case 'wander': {
        const b = room.bounds;
        const [x, z] = this.nav.nearestFree(randRange(b.minX + 1, b.maxX - 1), randRange(front + 0.5, b.maxZ - 0.6));
        seq.push(this.walkTo(x, z));
        seq.push(this.play('idle', randRange(2, 5), { look: 'tank' }));
        break;
      }
      case 'window': {
        const [w0, w1] = room.windowRange;
        const [x, z] = this.nav.nearestFree(randRange(w0 + 0.8, w1 - 0.4), -2.3);
        seq.push(this.walkTo(x, z, { faceTo: [x - 0.3, -4] }));
        seq.push(this.play('window', randRange(5, 9), { look: 'window' }));
        break;
      }
      case 'inspect': {
        const x = clamp(aq.center.x + randRange(-0.4, 0.4) * aq.dim.w, aq.minX + 0.2, aq.maxX - 0.2);
        seq.push(this.walkTo(x, front + 0.3, { faceTo: [x, aq.center.z] }));
        seq.push(this.play('inspect', randRange(3, 6), { look: 'fish', activity: 'inspect' }));
        if (Math.random() < 0.5) seq.push(this.play('palmGlass', 2, { look: 'fish' }));
        break;
      }
      case 'pet':
        this.petCat(cat);
        return;
      case 'stretch':
        seq.push(this.play('stretch', 2.2, { expr: 'smile' }));
        break;
      default:
        break;
    }
    this.do(seq);
  }

  // ---------------------------------------------------------- update
  update(dt, t) {
    const prevPos = this.pos.clone();
    this.processTasks(dt);
    // motion
    let moving = false;
    if (this.path && this.path.length) {
      moving = this.followPath(dt);
    } else {
      this.speed = damp(this.speed, 0, 8, dt);
    }
    // carried stool follows hands
    if (this.carryingStool) {
      const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
      this.stool.position.set(this.pos.x + fx * 0.28, 0.32, this.pos.z + fz * 0.28);
      this.stool.rotation.set(0, this.facing + Math.PI, 0);
    }
    // idle AI
    if (!this.task && !this.queue.length && !this.path) {
      this.activity = this.busy ? this.activity : 'idle';
      this.idleTimer -= dt;
      if (this.idleTimer <= 0 && !this.busy) {
        this.chooseIdle();
        this.idleTimer = randRange(1, 3);
      }
    }
    // animation target
    const tp = this.target;
    for (const n of JOINTS) tp[n] = Z();
    tp.hipsY = 0;
    tp.hipsZ = 0;
    this.animTime += dt;
    const travel = prevPos.distanceTo(this.pos);
    const run = this.speed > 1.05;
    const stride = run ? 0.62 : 0.4;
    this.walkPhase += (travel / stride) * Math.PI;
    const walkAmt = clamp(this.speed / 0.75, 0, 1);
    if (moving || walkAmt > 0.05) {
      (this.carryingStool ? POSES.carry : POSES.walk)(t, tp, { phase: this.walkPhase, amount: Math.max(walkAmt, 0.15), run });
      const sign = Math.sign(Math.sin(this.walkPhase));
      if (sign !== this.lastStepSign && walkAmt > 0.2) this.game.audio?.footstep(run);
      this.lastStepSign = sign;
    } else {
      const fn = POSES[this.anim] ?? POSES.idle;
      fn(this.animTime, tp, { amount: this.climbU ?? 0 });
    }
    // blend toward the target pose (no popping)
    const rate = moving ? 16 : 9;
    for (const n of JOINTS) {
      const a = this.pose[n], b = tp[n];
      a[0] = damp(a[0], b[0], rate, dt);
      a[1] = damp(a[1], b[1], rate, dt);
      a[2] = damp(a[2], b[2], rate, dt);
    }
    this.pose.hipsY = damp(this.pose.hipsY, tp.hipsY, rate, dt);
    this.pose.hipsZ = damp(this.pose.hipsZ, tp.hipsZ, rate, dt);
    // head / eye tracking layered on top
    this.updateLook(dt, t);
    this.model.applyPose(this.pose);
    this.model.j.head.rotation.y += this.headYaw * 0.7;
    this.model.j.neck.rotation.y += this.headYaw * 0.3;
    this.model.j.head.rotation.x += this.headPitch;
    // face
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 1;
      this.blinkT = randRange(2, 5);
    }
    this.blink = Math.max(0, this.blink - dt * 9);
    this.exprTimer -= dt;
    if (this.exprTimer < 0) this.expr = 'smile';
    this.model.setExpression(this.expr, this.blink > 0.5 ? 1 : 0);
    // transform
    this.root.position.set(this.pos.x, this.elev, this.pos.z);
    this.root.rotation.y = this.facing;
  }

  setExpr(e, dur = 2) {
    this.expr = e;
    this.exprTimer = dur;
  }

  updateLook(dt, t) {
    let target = null;
    const task = this.task;
    const mode = task?.look ?? (this.activity === 'idle' ? 'fish' : null);
    if (task?.lookPoint) target = task.lookPoint;
    else if (mode === 'fish') {
      const f = this.game.interestingFish?.(this.pos);
      if (f) target = f.pos;
    } else if (mode === 'food') target = new THREE.Vector3(this.pos.x, this.aq.waterY, this.aq.frontZ - 0.15);
    else if (mode === 'tank') target = this.aq.center.clone().setY(this.aq.center.y + this.aq.dim.h * 0.5);
    else if (mode === 'cat' && this.game.cat) target = this.game.cat.pos.clone().setY(0.2);
    else if (mode === 'window') target = new THREE.Vector3(this.pos.x - 1, 2, -6);
    else if (mode === 'selection') target = this.game.decorSelectionPoint?.() ?? this.aq.center;
    let yaw = 0, pitch = 0;
    if (target) {
      const headY = this.elev + 0.95;
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z, dy = target.y - headY;
      const ang = Math.atan2(dx, dz);
      yaw = clamp(angleDiff(this.facing, ang), -1.1, 1.1);
      pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.7, 0.5);
    }
    this.headYaw = damp(this.headYaw, yaw, 4, dt);
    this.headPitch = damp(this.headPitch, pitch * 0.7, 4, dt);
    this.model.lookEyes(clamp(yaw * 0.8, -1, 1), clamp(-pitch, -1, 1));
  }

  followPath(dt) {
    const wp = this.path[0];
    const dx = wp[0] - this.pos.x, dz = wp[1] - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const remaining = dist + this.pathRest();
    const maxSpeed = this.runPath ? 1.3 : 0.75;
    const accel = 1.8, decel = 2.2;
    const desiredFacing = Math.atan2(dx, dz);
    const turnNeeded = Math.abs(angleDiff(this.facing, desiredFacing));
    // brake for sharp turns & arrival
    let target = Math.min(maxSpeed, Math.sqrt(2 * decel * Math.max(0, remaining - 0.02)));
    if (turnNeeded > 1.2) target = Math.min(target, 0.15);
    if (this.speed < target) this.speed = Math.min(target, this.speed + accel * dt);
    else this.speed = Math.max(target, this.speed - decel * dt);
    this.facing = dampAngle(this.facing, desiredFacing, turnNeeded > 1.2 ? 7 : 9, dt);
    const step = Math.min(dist, this.speed * dt * Math.max(0.2, Math.cos(Math.min(turnNeeded, 1.4))));
    if (dist > 1e-4) {
      const nx = this.pos.x + (dx / dist) * step, nz = this.pos.z + (dz / dist) * step;
      // never walk through furniture
      if (this.nav.isFree(nx, nz) || !this.nav.isFree(this.pos.x, this.pos.z)) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else {
        this.path = this.nav.findPath(this.pos.x, this.pos.z, this.path[this.path.length - 1][0], this.path[this.path.length - 1][1]);
      }
    }
    if (dist < 0.03) {
      this.path?.shift();
      if (!this.path?.length) {
        this.path = null;
        return false;
      }
    }
    return true;
  }

  pathRest() {
    let s = 0;
    for (let i = 1; i < this.path.length; i++) s += Math.hypot(this.path[i][0] - this.path[i - 1][0], this.path[i][1] - this.path[i - 1][1]);
    return s;
  }

  processTasks(dt) {
    if (!this.task) {
      this.task = this.queue.shift() ?? null;
      if (!this.task) return;
      this.startTask(this.task);
    }
    const tk = this.task;
    tk.time = (tk.time ?? 0) + dt;
    let done = false;
    switch (tk.type) {
      case 'walk':
        if (!this.path) {
          if (tk.faceTo) {
            const ang = Math.atan2(tk.faceTo[0] - this.pos.x, tk.faceTo[1] - this.pos.z);
            this.facing = dampAngle(this.facing, ang, 6, dt);
            done = Math.abs(angleDiff(this.facing, ang)) < 0.05 || tk.time > 6;
          } else done = true;
          if (this.speed > 0.05) done = false;
        }
        if (tk.time > 25) {
          // safety: unreachable target
          this.path = null;
          done = true;
        }
        break;
      case 'face':
        this.facing = dampAngle(this.facing, tk.angle, 6, dt);
        done = Math.abs(angleDiff(this.facing, tk.angle)) < 0.04 || tk.time > 2;
        break;
      case 'anim':
        tk.onUpdate?.(dt, tk.time);
        done = tk.time >= tk.dur;
        break;
      case 'call':
        tk.fn();
        done = true;
        break;
      case 'climb': {
        const u = clamp(tk.time / tk.dur, 0, 1);
        const e = easeInOut(u);
        this.climbU = u;
        this.anim = 'climb';
        const top = this.stoolH;
        const sz = this.stool.position.z;
        if (tk.up) {
          this.elev = e * top;
          this.pos.z = lerp(tk.z0, sz + 0.02, e);
        } else {
          this.elev = (1 - e) * top;
          this.pos.z = lerp(tk.z0, sz + 0.42, e);
        }
        if (u >= 1) {
          done = true;
          this.climbU = 0;
          this.anim = 'idle';
        }
        break;
      }
      case 'wipe': {
        this.anim = this.scrubbing ? 'wipe' : 'idle';
        tk.look = 'tank';
        // follow the player's scrub position along the glass
        if (this.scrubTarget !== null) {
          const tx = clamp(this.scrubTarget - 0.42 * Math.sign(this.scrubTarget - this.aq.center.x || 1), this.aq.minX + 0.2, this.aq.maxX - 0.2);
          const dx = tx - this.pos.x;
          if (Math.abs(dx) > 0.05) {
            const step = Math.sign(dx) * Math.min(Math.abs(dx), 0.5 * dt);
            if (this.nav.isFree(this.pos.x + step, this.pos.z)) this.pos.x += step;
            this.walkPhase += Math.abs(step) / 0.3 * Math.PI;
          }
        }
        if (this.scrubbing && Math.random() < dt * 6) {
          // the keeper's own wiping also clears the glass in front of them
          const hx = this.pos.x;
          const hy = 1.0 + Math.sin(tk.time * 5.5) * 0.08;
          this.game.scrubAt?.(hx, hy, 0.6);
        }
        break;
      }
      case 'hold':
        this.anim = tk.anim ?? 'idle';
        break;
      case 'sitOn': {
        if (tk.phase === undefined) {
          tk.phase = 0;
          tk.from = this.pos.clone();
        }
        const s = tk.seat;
        if (tk.phase === 0) {
          const u = clamp(tk.time / 0.8, 0, 1);
          this.pos.x = lerp(tk.from.x, s.x, easeInOut(u));
          this.pos.z = lerp(tk.from.z, s.z, easeInOut(u));
          this.facing = dampAngle(this.facing, s.face, 8, dt);
          this.elev = easeInOut(u) * (s.y - DIM.hipY + 0.06);
          this.anim = 'sitChair';
          this.sitting = true;
          if (u >= 1) tk.phase = 1;
        } else if (tk.phase === 1) {
          tk.look = 'tank';
          if (tk.time > tk.dur) {
            tk.phase = 2;
            tk.t2 = tk.time;
          }
        } else {
          const u = clamp((tk.time - tk.t2) / 0.8, 0, 1);
          this.pos.x = lerp(s.x, tk.from.x, easeInOut(u));
          this.pos.z = lerp(s.z, tk.from.z, easeInOut(u));
          this.elev = (1 - easeInOut(u)) * (s.y - DIM.hipY + 0.06);
          if (u >= 1) {
            this.anim = 'idle';
            this.sitting = false;
            done = true;
          }
        }
        break;
      }
      default:
        done = true;
    }
    if (done) {
      tk.onEnd?.();
      if (tk.type === 'anim' && tk.sit) this.sitting = false;
      this.task = null;
      if (tk.type === 'anim') this.anim = 'idle';
    }
  }

  startTask(tk) {
    tk.time = 0;
    switch (tk.type) {
      case 'walk': {
        this.anim = 'idle';
        const p = this.nav.findPath(this.pos.x, this.pos.z, tk.x, tk.z);
        this.path = p && p.length ? p : null;
        this.runPath = !!tk.run || Math.hypot(tk.x - this.pos.x, tk.z - this.pos.z) > 4.5;
        break;
      }
      case 'anim':
        this.anim = tk.anim;
        this.animTime = 0;
        if (tk.expr) this.setExpr(tk.expr, tk.dur + 0.5);
        if (tk.sit) this.sitting = true;
        if (tk.activity) this.activity = tk.activity;
        tk.onStart?.();
        break;
      case 'climb':
        tk.z0 = this.pos.z;
        break;
      default:
        break;
    }
  }

  // world position of the right hand (for food drop etc.)
  handWorld(side = 'r') {
    const v = new THREE.Vector3();
    this.model.props[`${side}Hand`].getWorldPosition(v);
    return v;
  }
}
