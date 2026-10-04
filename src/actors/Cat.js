// Miso the household cat: procedural tabby model with a jointed tail and legs,
// plus a needs-driven behaviour loop (wander, watch fish, sleep, groom,
// stretch, follow the keeper, hop onto the sofa, get petted).
import * as THREE from 'three';
import { canvas, toTexture } from '../render/textures.js';
import { clamp, lerp, damp, dampAngle, angleDiff, randRange, weightedPick, makeRng, easeInOut } from '../core/util.js';
import { bus } from '../core/EventBus.js';

function furTexture(base = '#e08a3a', stripe = '#b05a1a', belly = '#fff4e6') {
  const W = 512, H = 256, cv = canvas(W, H), ctx = cv.getContext('2d');
  const rng = makeRng(17);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, stripe);
  g.addColorStop(0.25, base);
  g.addColorStop(0.62, base);
  g.addColorStop(0.85, belly);
  g.addColorStop(1, belly);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = stripe;
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * W + rng() * 8;
    ctx.lineWidth = 6 + rng() * 6;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + 10, H * 0.25, x - 4, H * 0.48 + rng() * 20);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // soft fur noise
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${rng() < 0.5 ? '255,240,220' : '120,60,20'},${0.05 + rng() * 0.08})`;
    ctx.fillRect(rng() * W, rng() * H, 1, 3 + rng() * 4);
  }
  return toTexture(cv);
}

export class Cat {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'cat';
    this.pos = new THREE.Vector3(-1.5, 0, 1.2);
    this.facing = 0.5;
    this.speed = 0;
    this.elev = 0;
    this.state = 'idle';
    this.stateTime = 0;
    this.stateDur = 3;
    this.path = null;
    this.walkPhase = 0;
    this.tailPhase = 0;
    this.asleep = false;
    this.headYaw = 0;
    this.headPitch = 0;
    this.blinkT = 3;
    this.stay = 0;
    this.petTime = 0;
    this.energy = 0.7;
    this.build();
  }

  build() {
    const fur = furTexture();
    const furM = new THREE.MeshPhysicalMaterial({ map: fur, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xffd0a0), sheenRoughness: 0.5 });
    const white = new THREE.MeshPhysicalMaterial({ color: 0xfff6ea, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xffffff) });
    const pink = new THREE.MeshStandardMaterial({ color: 0xf0a0a0, roughness: 0.6 });
    this.mats = { furM, white };
    const r = this.root;
    // body
    this.body = new THREE.Group();
    this.body.position.y = 0.2;
    r.add(this.body);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 18), furM);
    torso.scale.set(0.82, 0.85, 1.55);
    this.body.add(torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), white);
    chest.scale.set(0.9, 1.05, 0.9);
    chest.position.set(0, -0.01, 0.12);
    this.body.add(chest);
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), furM);
    haunch.scale.set(1, 1, 1.1);
    haunch.position.set(0, -0.01, -0.12);
    this.body.add(haunch);
    // head
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.06, 0.17);
    this.body.add(this.neck);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.06, 0.04);
    this.neck.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.085, 26, 20), furM);
    skull.scale.set(1.08, 0.95, 0.98);
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), white);
      cheek.position.set(s * 0.032, -0.03, 0.05);
      cheek.scale.set(1, 0.8, 0.9);
      this.head.add(cheek);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), furM);
      ear.position.set(s * 0.05, 0.075, -0.005);
      ear.rotation.set(-0.1, s * 0.6, s * -0.3);
      this.head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 4), pink);
      inner.position.set(0, -0.006, 0.012);
      ear.add(inner);
      ear.userData.side = s;
      (this.ears ??= []).push(ear);
      // eyes
      const eye = new THREE.Group();
      eye.position.set(s * 0.035, 0.012, 0.072);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0x9ac83a, roughness: 0.1, clearcoat: 1, emissive: 0x1a2a00 }));
      ball.scale.set(1, 1, 0.6);
      const slit = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      slit.scale.set(0.25, 0.85, 0.5);
      slit.position.z = 0.006;
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(0.006, 0.008, 0.013);
      eye.add(ball, slit, hl);
      eye.userData.slit = slit;
      this.head.add(eye);
      (this.eyes ??= []).push(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), pink);
    nose.scale.set(1.3, 0.8, 0.8);
    nose.position.set(0, -0.012, 0.09);
    this.head.add(nose);
    // whiskers
    const wm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s * 0.03, -0.02, 0.08), new THREE.Vector3(s * 0.12, -0.012 + (i - 1) * 0.015, 0.06)]);
      this.head.add(new THREE.Line(geo, wm));
    }
    // legs (shoulder/hip -> elbow/knee -> paw)
    this.legs = [];
    const legDefs = [[0.055, 0.13, 1], [-0.055, 0.13, 1], [0.06, -0.14, -1], [-0.06, -0.14, -1]];
    for (const [x, z, front] of legDefs) {
      const top = new THREE.Group();
      top.position.set(x, -0.03, z);
      this.body.add(top);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.07, 4, 10), front > 0 ? furM : furM);
      upper.position.y = -0.05;
      top.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.1;
      top.add(knee);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.06, 4, 10), white);
      lower.position.y = -0.04;
      knee.add(lower);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), white);
      paw.scale.set(1, 0.6, 1.25);
      paw.position.set(0, -0.08, 0.01);
      knee.add(paw);
      this.legs.push({ top, knee, front, x, z });
    }
    // tail: chain of segments
    this.tail = [];
    let parent = this.body;
    const tailRoot = new THREE.Group();
    tailRoot.position.set(0, 0.04, -0.22);
    this.body.add(tailRoot);
    parent = tailRoot;
    for (let i = 0; i < 9; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? 0 : -0.04;
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.02 - i * 0.0008, 0.03, 4, 8), i > 6 ? new THREE.MeshPhysicalMaterial({ color: 0xa04a10, roughness: 0.9 }) : furM);
      m.rotation.x = Math.PI / 2;
      m.position.z = -0.02;
      seg.add(m);
      parent.add(seg);
      parent = seg;
      this.tail.push(seg);
    }
    r.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  setup(room, nav, aq) {
    this.room = room;
    this.nav = nav;
    this.aq = aq;
    const [x, z] = nav.nearestFree(room.sofa.position.x + 1.4, 1.6);
    this.pos.set(x, 0, z);
    this.elev = 0;
    this.state = 'idle';
    this.path = null;
  }

  requestStay(t) {
    this.stay = t;
    if (this.state === 'walk' || this.state === 'follow') {
      this.path = null;
      this.setState('sit', t);
    }
  }
  beingPetted(t) {
    this.petTime = t;
    this.asleep = false;
    this.game.audio?.purr(t);
  }

  setState(s, dur) {
    this.state = s;
    this.stateTime = 0;
    this.stateDur = dur;
    this.asleep = s === 'sleep';
  }

  chooseNext() {
    const aq = this.aq, room = this.room;
    const keeper = this.game.character;
    this.energy = clamp(this.energy - 0.08, 0, 1);
    const opts = [
      ['watch', 3],
      ['wander', 2],
      ['sleep', this.energy < 0.4 ? 4 : 0.8],
      ['groom', 1.2],
      ['stretch', 0.6],
      ['follow', keeper && keeper.pos.distanceTo(this.pos) > 1.2 ? 1.2 : 0.2],
      ['sofa', 0.8],
    ];
    const c = weightedPick(opts);
    switch (c) {
      case 'watch': {
        const x = clamp(aq.center.x + randRange(-0.4, 0.4) * aq.dim.w, aq.minX + 0.2, aq.maxX - 0.2);
        this.goTo(x, room.cabinetFront + 0.25, 'watch', randRange(8, 18), Math.PI);
        break;
      }
      case 'wander': {
        const b = room.bounds;
        const [x, z] = this.nav.nearestFree(randRange(b.minX + 0.8, b.maxX - 0.8), randRange(room.cabinetFront + 0.5, b.maxZ - 0.5));
        this.goTo(x, z, 'sit', randRange(3, 7));
        break;
      }
      case 'sleep': {
        if (Math.random() < 0.6 && room.seats.length) {
          this.jumpOnSofa(randRange(18, 40));
        } else {
          const [x, z] = this.nav.nearestFree(room.sofa.position.x + 1.5, 0.5 + randRange(-0.4, 0.6));
          this.goTo(x, z, 'sleep', randRange(15, 35));
        }
        break;
      }
      case 'groom':
        this.setState('groom', randRange(4, 8));
        break;
      case 'stretch':
        this.setState('stretch', 2.4);
        break;
      case 'follow':
        this.setState('follow', randRange(8, 14));
        break;
      case 'sofa':
        this.jumpOnSofa(randRange(8, 14));
        break;
      default:
        this.setState('sit', 3);
    }
  }

  goTo(x, z, then, dur, face) {
    if (this.elev > 0.05) {
      this.jumpDown(() => this.goTo(x, z, then, dur, face));
      return;
    }
    this.path = this.nav.findPath(this.pos.x, this.pos.z, x, z);
    this.next = { then, dur, face };
    this.setState('walk', 30);
  }

  jumpOnSofa(dur) {
    const seat = this.room.seats[Math.floor(Math.random() * this.room.seats.length)];
    const fromX = seat.x + 0.55, fromZ = seat.z;
    this.path = this.nav.findPath(this.pos.x, this.pos.z, fromX, fromZ);
    this.next = { then: 'jumpUp', dur, seat };
    this.setState('walk', 30);
  }

  jumpDown(cb) {
    this.jump = { from: this.pos.clone(), fromY: this.elev, to: new THREE.Vector3(this.pos.x + 0.6, 0, this.pos.z), toY: 0, t: 0, dur: 0.6, cb };
    this.setState('jump', 1);
  }

  update(dt, t) {
    this.stateTime += dt;
    this.stay = Math.max(0, this.stay - dt);
    this.petTime = Math.max(0, this.petTime - dt);
    this.energy = clamp(this.energy + (this.asleep ? dt * 0.01 : -dt * 0.0005), 0, 1);
    const keeper = this.game.character;
    let moving = false;
    let lookTarget = null;
    switch (this.state) {
      case 'walk':
      case 'follow': {
        if (this.state === 'follow') {
          if (!this.path || this.stateTime % 2 < dt) {
            const kx = keeper.pos.x - Math.sin(keeper.facing) * 0.5 + 0.3, kz = keeper.pos.z - Math.cos(keeper.facing) * 0.5;
            if (Math.hypot(kx - this.pos.x, kz - this.pos.z) > 0.45) this.path = this.nav.findPath(this.pos.x, this.pos.z, kx, kz);
          }
          lookTarget = keeper.pos.clone().setY(0.6);
          if (this.stateTime > this.stateDur) {
            this.path = null;
            this.setState('sit', 3);
          }
        }
        moving = this.followPath(dt);
        if (!moving && this.state === 'walk') {
          const n = this.next;
          this.next = null;
          if (n?.then === 'jumpUp') {
            const s = n.seat;
            this.jump = { from: this.pos.clone(), fromY: 0, to: new THREE.Vector3(s.x + 0.05, 0, s.z), toY: s.y - 0.05, t: 0, dur: 0.65, then: 'sleep', thenDur: n.dur };
            this.setState('jump', 1);
          } else if (n) {
            this.setState(n.then, n.dur);
            if (n.face !== undefined) this.faceTarget = n.face;
          } else this.setState('sit', 3);
        }
        break;
      }
      case 'jump': {
        const j = this.jump;
        j.t += dt;
        const u = clamp(j.t / j.dur, 0, 1);
        const e = easeInOut(u);
        this.pos.x = lerp(j.from.x, j.to.x, e);
        this.pos.z = lerp(j.from.z, j.to.z, e);
        this.elev = lerp(j.fromY, j.toY, e) + Math.sin(u * Math.PI) * 0.35;
        this.facing = dampAngle(this.facing, Math.atan2(j.to.x - j.from.x, j.to.z - j.from.z), 10, dt);
        if (u >= 1) {
          this.elev = j.toY;
          if (j.cb) {
            this.setState('idle', 0.2);
            j.cb();
          } else this.setState(j.then ?? 'sit', j.thenDur ?? 3);
          if (j.then === 'sleep') this.facing = Math.random() * 6;
        }
        break;
      }
      case 'watch': {
        // sit by the glass, head tracking a fish, tail swishing
        if (this.faceTarget !== undefined) this.facing = dampAngle(this.facing, this.faceTarget, 5, dt);
        const f = this.game.interestingFish?.(this.pos);
        if (f) lookTarget = f.pos;
        if (this.stateTime > this.stateDur && this.stay <= 0) this.chooseNext();
        break;
      }
      default: {
        if (this.state === 'sit' && keeper && keeper.pos.distanceTo(this.pos) < 2) lookTarget = keeper.pos.clone().setY(0.9 + keeper.elev);
        if (this.stateTime > this.stateDur && this.stay <= 0 && this.petTime <= 0) {
          if (this.elev > 0.05 && Math.random() < 0.5) this.jumpDown();
          else this.chooseNext();
        }
      }
    }
    if (!moving) this.speed = damp(this.speed, 0, 8, dt);
    this.animate(dt, t, moving, lookTarget);
    this.root.position.set(this.pos.x, this.elev, this.pos.z);
    this.root.rotation.y = this.facing;
  }

  followPath(dt) {
    if (!this.path || !this.path.length) return false;
    const wp = this.path[0];
    const dx = wp[0] - this.pos.x, dz = wp[1] - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const turn = Math.abs(angleDiff(this.facing, want));
    const rem = dist + (this.path.length > 1 ? 1 : 0);
    let target = Math.min(this.state === 'follow' ? 0.9 : 0.55, Math.sqrt(2 * 2 * rem));
    if (turn > 1.3) target = 0.08;
    this.speed += clamp(target - this.speed, -3 * dt, 2 * dt);
    this.facing = dampAngle(this.facing, want, 8, dt);
    const step = Math.min(dist, this.speed * dt);
    if (dist > 1e-4) {
      this.pos.x += (dx / dist) * step;
      this.pos.z += (dz / dist) * step;
    }
    this.walkPhase += step / 0.18 * Math.PI;
    if (dist < 0.03) {
      this.path.shift();
      if (!this.path.length) {
        this.path = null;
        return false;
      }
    }
    return true;
  }

  animate(dt, t, moving, lookTarget) {
    const s = this.state;
    const walkAmt = clamp(this.speed / 0.5, 0, 1);
    // body posture
    let bodyY = 0.2, bodyPitch = 0, bodyZ = 0;
    const legRot = [0, 0, 0, 0], kneeRot = [0, 0, 0, 0];
    if (moving || walkAmt > 0.05) {
      const ph = this.walkPhase;
      // diagonal gait: FL with BR, FR with BL
      const phases = [0, Math.PI, Math.PI, 0];
      for (let i = 0; i < 4; i++) {
        const sn = Math.sin(ph + phases[i]);
        legRot[i] = sn * 0.55 * walkAmt;
        kneeRot[i] = (this.legs[i].front > 0 ? 1 : -1) * Math.max(0, Math.cos(ph + phases[i])) * 0.6 * walkAmt;
      }
      bodyY = 0.2 + Math.abs(Math.sin(ph)) * 0.008;
    } else if (s === 'sit' || s === 'watch' || s === 'groom') {
      bodyPitch = -0.55;
      bodyY = 0.17;
      bodyZ = -0.04;
      legRot[0] = 0.55;
      legRot[1] = 0.55;
      legRot[2] = -1.0;
      legRot[3] = -1.0;
      kneeRot[2] = 1.9;
      kneeRot[3] = 1.9;
      if (s === 'groom') {
        legRot[0] = -0.6 + Math.sin(t * 6) * 0.2;
        kneeRot[0] = 1.6;
      }
    } else if (s === 'sleep') {
      bodyY = 0.085;
      bodyPitch = 0;
      for (let i = 0; i < 4; i++) {
        legRot[i] = this.legs[i].front > 0 ? 1.35 : -1.35;
        kneeRot[i] = this.legs[i].front > 0 ? -0.4 : 0.4;
      }
    } else if (s === 'stretch') {
      const u = Math.min(1, this.stateTime / 0.6) * (this.stateTime > 1.8 ? Math.max(0, 1 - (this.stateTime - 1.8) / 0.6) : 1);
      bodyPitch = 0.35 * u;
      bodyY = 0.2 - 0.05 * u;
      legRot[0] = 0.9 * u;
      legRot[1] = 0.9 * u;
    } else if (s === 'jump') {
      bodyPitch = -0.3 + this.jump.t / this.jump.dur * 0.6;
      legRot[0] = 0.8;
      legRot[1] = 0.8;
      legRot[2] = -0.8;
      legRot[3] = -0.8;
    }
    this.body.position.y = damp(this.body.position.y, bodyY, 8, dt);
    this.body.position.z = damp(this.body.position.z, bodyZ, 8, dt);
    this.body.rotation.x = damp(this.body.rotation.x, bodyPitch, 8, dt);
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      L.top.rotation.x = damp(L.top.rotation.x, legRot[i] - (s === 'sit' || s === 'watch' || s === 'groom' ? 0 : 0), 12, dt) ;
      L.knee.rotation.x = damp(L.knee.rotation.x, kneeRot[i], 12, dt);
    }
    // keep feet planted when the body pitches up (sitting)
    // head look
    let yaw = 0, pitch = 0;
    if (lookTarget) {
      const dx = lookTarget.x - this.pos.x, dz = lookTarget.z - this.pos.z, dy = lookTarget.y - (this.elev + 0.32);
      yaw = clamp(angleDiff(this.facing, Math.atan2(dx, dz)), -1.2, 1.2);
      pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.9, 0.5);
    }
    if (s === 'sleep') {
      yaw = 0.9;
      pitch = 0.5;
    }
    if (s === 'groom') pitch = 0.4 + Math.sin(t * 6) * 0.15;
    this.headYaw = damp(this.headYaw, yaw, 5, dt);
    this.headPitch = damp(this.headPitch, pitch - bodyPitch * 0.6, 5, dt);
    this.neck.rotation.y = this.headYaw * 0.6;
    this.head.rotation.y = this.headYaw * 0.4;
    this.head.rotation.x = this.headPitch;
    this.neck.position.y = s === 'sleep' ? 0.0 : 0.06;
    // purr wiggle when petted
    if (this.petTime > 0) {
      this.head.rotation.z = Math.sin(t * 4) * 0.12;
      for (const e of this.eyes) e.scale.y = 0.15;
    } else {
      this.head.rotation.z = damp(this.head.rotation.z, 0, 6, dt);
      // blink / sleep eyes
      this.blinkT -= dt;
      const closed = s === 'sleep' || this.blinkT < 0.12;
      if (this.blinkT < 0) this.blinkT = randRange(2, 6);
      for (const e of this.eyes) e.scale.y = damp(e.scale.y, closed ? 0.1 : 1, 20, dt);
    }
    // pupils dilate when watching fish
    for (const e of this.eyes) e.userData.slit.scale.x = damp(e.userData.slit.scale.x, s === 'watch' ? 0.75 : 0.25, 3, dt);
    // ears twitch
    for (const ear of this.ears) ear.rotation.x = -0.1 + (Math.sin(t * 13 + ear.userData.side) > 0.97 ? 0.4 : 0);
    // tail: sinuous wave; faster swish when watching fish
    const swish = s === 'watch' ? 2.6 : moving ? 1.6 : s === 'sleep' ? 0.3 : 1;
    this.tailPhase += dt * swish * 2;
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      if (s === 'sleep') {
        seg.rotation.y = damp(seg.rotation.y, 0.32, 3, dt);
        seg.rotation.x = damp(seg.rotation.x, 0.05, 3, dt);
      } else {
        seg.rotation.y = Math.sin(this.tailPhase - i * 0.5) * 0.18 * (s === 'watch' ? 1.3 : 1);
        seg.rotation.x = damp(seg.rotation.x, i < 3 ? -0.35 : (s === 'sit' || s === 'watch' ? 0.2 : 0.05), 4, dt);
      }
    }
  }
}
