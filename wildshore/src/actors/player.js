// The survivor: skinned GLB character with clip blending + procedural action layers,
// grounded locomotion (acceleration, turning, slopes, collisions), swimming, diving,
// boating, sleeping, and equipment held in the hands.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PoseRig, POSES, AX } from './rig.js';
import { ITEM_MODELS, makeItemModel } from './equipment.js';
import { damp, dampAngle, clamp, angleDiff } from '../util/math.js';
import { patchMaterial } from '../render/materials.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export async function loadSurvivor() {
  const gltf = await new GLTFLoader().loadAsync('assets/models/survivor.glb');
  return gltf;
}

export class Player {
  constructor(gltf, scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'survivor';
    this.model = gltf.scene;
    this.model.rotation.y = Math.PI; // asset faces -Z; character space faces +Z
    this.root.add(this.model);
    scene.add(this.root);
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        if (o.name.includes('visor')) {
          // re-dress the visor as sunglasses-dark lenses
          o.material = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.25, metalness: 0.4 });
        } else {
          const m = o.material;
          // earthy, sun-bleached survival clothing
          m.color = new THREE.Color(0xe9dcc2);
          m.roughness = 0.85;
          m.metalness = 0;
          patchMaterial(m, { caustics: true });
        }
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name.toLowerCase()] = c;
    this.actions = {};
    for (const n of ['idle', 'walk', 'run']) {
      const a = this.mixer.clipAction(this.clips[n]);
      a.play();
      a.setEffectiveWeight(n === 'idle' ? 1 : 0);
      this.actions[n] = a;
    }
    this.rig = new PoseRig(this.model, this.root);
    this.bones = this.rig.bones;

    // kinematics
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.state = 'ground'; // ground | swim | dive | boat | sleep | dead
    this.crouch = false;
    this.sprint = false;
    this.diveDepth = 0;
    this.verticalVel = 0;
    this.time = 0;
    this.layers = {}; // pose name -> weight
    this.action = null;
    this.equipped = null;
    this.handModel = null;
    this.offModel = null;
    this.noise = 0; // how loud the survivor currently is (for wildlife hearing)
    this.footTimer = 0;
    this.onFootstep = null;
    this.onSplash = null;
    this.limp = 0;

    // worn gear
    this.backpack = ITEM_MODELS.backpack();
    scene.add(this.backpack);
    this.hat = ITEM_MODELS.hat();
    scene.add(this.hat);
  }

  // ----- equipment -----
  equip(itemId) {
    if (this.equipped === itemId) return;
    if (this.handModel) { this.scene.remove(this.handModel); this.handModel = null; }
    if (this.offModel) { this.scene.remove(this.offModel); this.offModel = null; }
    this.equipped = itemId;
    if (!itemId) return;
    const m = makeItemModel(itemId);
    if (!m) return;
    if (itemId === 'torch' || itemId === 'bow') { this.offModel = m; } else { this.handModel = m; }
    this.scene.add(m);
  }

  attach(obj, bone, offPos, offRot) {
    if (!obj || !bone) return;
    bone.updateWorldMatrix(true, false);
    bone.matrixWorld.decompose(_p, _q, _s);
    obj.position.copy(offPos).applyQuaternion(_q).add(_p);
    obj.quaternion.copy(_q).multiply(offRot);
  }

  // ----- actions -----
  startAction(a) {
    if (this.action && !this.action.interruptible) return false;
    this.action = { t: 0, elapsed: 0, fired: false, canMove: false, interruptible: false, ...a };
    return true;
  }
  cancelAction() { this.action = null; }
  get busy() { return !!this.action; }

  setLayer(name, target, dt, rate = 8) {
    const w = this.layers[name] || 0;
    const nw = damp(w, target, rate, dt);
    if (nw < 0.002 && target === 0) delete this.layers[name];
    else this.layers[name] = nw;
  }

  /**
   * ctl: { moveX, moveZ (world dir, magnitude 0..1), sprint, crouch, diveDown, diveUp }
   * world: { groundAt(x,z), waterAt(x,z), collide(pos, r), stamina() }
   */
  update(dt, ctl, world) {
    this.time += dt;
    const st = this.state;
    if (st === 'sleep' || st === 'dead' || st === 'boat') {
      this.vel.set(0, 0, 0);
      this.speed = 0;
    } else if (st === 'ground') this.updateGround(dt, ctl, world);
    else this.updateWater(dt, ctl, world);

    this.root.rotation.y = this.heading;

    // ---- action progression
    let actionPose = null;
    if (this.action) {
      const a = this.action;
      a.elapsed += dt;
      a.t = a.loop ? (a.elapsed / a.dur) % 1 : Math.min(1, a.elapsed / a.dur);
      if (!a.fired && a.hitTime !== undefined && a.elapsed / a.dur >= a.hitTime) { a.fired = true; a.onHit && a.onHit(); }
      if (a.onTick) a.onTick(dt, a);
      actionPose = a.pose;
      if (!a.loop && a.elapsed >= a.dur) { const done = a.onDone; this.action = null; done && done(); }
    }

    // ---- locomotion clip weights
    const sp = this.speed;
    const ground = this.state === 'ground';
    const wWalk = ground ? clamp(sp / 1.6, 0, 1) * (1 - clamp((sp - 2.6) / 1.6, 0, 1)) : 0;
    const wRun = ground ? clamp((sp - 2.6) / 1.6, 0, 1) : 0;
    const wIdle = Math.max(0, 1 - wWalk - wRun);
    this.actions.idle.setEffectiveWeight(wIdle);
    this.actions.walk.setEffectiveWeight(wWalk);
    this.actions.run.setEffectiveWeight(wRun);
    this.actions.walk.timeScale = clamp(sp / 1.45, 0.5, 1.6) * (this.crouch ? 0.8 : 1);
    this.actions.run.timeScale = clamp(sp / 4.4, 0.7, 1.3);
    this.mixer.update(dt * (this.state === 'swim' || this.state === 'dive' ? 0.4 : 1));

    // ---- procedural layers
    const L = (n, on, rate) => this.setLayer(n, on ? 1 : 0, dt, rate);
    L('swim', this.state === 'swim' && this.speed > 0.3, 5);
    L('tread', this.state === 'swim' && this.speed <= 0.3, 5);
    L('dive', this.state === 'dive', 4);
    L('crouch', ground && this.crouch && !actionPose, 8);
    L('paddle', this.state === 'boat' && this.boatPose === 'paddle', 6);
    L('sit', this.state === 'boat' && this.boatPose !== 'paddle', 6);
    L('sleep', this.state === 'sleep', 3);
    L('limp', ground && this.limp > 0.3 && sp > 0.3, 4);
    const holding = this.equipped && !actionPose && ground;
    L('holdSpear', holding && /Spear/.test(this.equipped), 6);
    L('holdTool', holding && /Axe|knife|hammer|fishingRod/.test(this.equipped || ''), 6);
    L('holdTorch', (this.equipped === 'torch') && (ground || this.state === 'swim'), 6);
    L('carry', ground && this.carrying && !actionPose, 6);
    for (const k of Object.keys(POSES)) if (k !== actionPose && this.layers['act_' + k] !== undefined) L('act_' + k, false, 10);
    if (actionPose) L('act_' + actionPose, true, 14);

    this.rig.reset();
    const p = { time: this.time, pitch: this.divePitch || 0, rate: this.paddleRate || 1 };
    for (const [n, w] of Object.entries(this.layers)) {
      if (w <= 0.001) continue;
      if (n.startsWith('act_')) {
        const name = n.slice(4);
        const t = this.action && this.action.pose === name ? this.action.t : 1;
        POSES[name](this.rig, t, w, { ...p, time: this.action ? this.action.elapsed : this.time });
      } else POSES[n](this.rig, 0, w, p);
    }
    this.rig.apply();

    // ---- body height adjustments (crouch / swim / sleep)
    this.model.position.y = damp(this.model.position.y, this.bodyOffset(), 8, dt);

    // ---- attachments
    this.updateAttachments();
  }

  bodyOffset() {
    const w = this.layers;
    let y = 0;
    y -= (w.crouch || 0) * 0.42;
    y -= (w.act_gather || 0) * 0.25;
    y -= (w.act_hammer || 0) * 0.3;
    y -= (w.act_cook || 0) * 0.42;
    y -= (w.act_kneelDrink || 0) * 0.42;
    y -= (w.sit || 0) * 0.55 + (w.paddle || 0) * 0.55;
    y -= (w.sleep || 0) * 0.85;
    return y;
  }

  updateAttachments() {
    const b = this.bones;
    if (this.handModel) {
      const id = this.equipped;
      const rot = new THREE.Quaternion().setFromEuler(
        /Spear|paddle/.test(id) ? new THREE.Euler(0, 0, -Math.PI / 2) : new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2)
      );
      this.fixAttachScale(this.handModel, b.rHand, new THREE.Vector3(0.0, 0.08, 0.025), rot);
    }
    if (this.offModel) {
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2));
      this.fixAttachScale(this.offModel, b.lHand, new THREE.Vector3(0, 0.08, 0.025), rot);
    }
    if (b.spine2) {
      this.fixAttachScale(this.backpack, b.spine2, new THREE.Vector3(0, 0.1, -0.2), new THREE.Quaternion());
      this.backpack.visible = this.state !== 'sleep';
    }
    if (b.head) {
      this.fixAttachScale(this.hat, b.head, new THREE.Vector3(0, 0.17, 0.0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0)));
      this.hat.visible = this.state !== 'dive' && this.state !== 'swim';
    }
  }

  // places obj at bone with offset given in metres in the bone's (unscaled) frame
  fixAttachScale(obj, bone, off, rot) {
    bone.updateWorldMatrix(true, false);
    bone.matrixWorld.decompose(_p, _q, _s);
    obj.position.copy(off).applyQuaternion(_q).add(_p);
    obj.quaternion.copy(_q).multiply(rot);
    obj.scale.setScalar(1);
  }

  updateGround(dt, ctl, world) {
    const moving = !this.action || this.action.canMove;
    const mx = moving ? ctl.moveX : 0, mz = moving ? ctl.moveZ : 0;
    const mag = Math.hypot(mx, mz);
    this.crouch = ctl.crouch;
    let maxSp = this.crouch ? 1.3 : ctl.sprint && mag > 0.5 ? 5.2 : 2.3 * Math.min(1, mag * 1.25);
    if (this.limp > 0.3) maxSp *= 0.6;
    if (this.carrying) maxSp *= 0.75;
    maxSp *= world.speedMul ? world.speedMul() : 1;
    // slope
    if (mag > 0.01) {
      const dx = mx / mag, dz = mz / mag;
      const h0 = world.groundAt(this.pos.x, this.pos.z), h1 = world.groundAt(this.pos.x + dx * 0.6, this.pos.z + dz * 0.6);
      const slope = (h1 - h0) / 0.6;
      if (slope > 0.25) maxSp *= clamp(1 - (slope - 0.25) * 1.2, 0.25, 1);
      this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 10, dt);
    }
    const targetVx = mag > 0.01 ? (mx / mag) * maxSp : 0;
    const targetVz = mag > 0.01 ? (mz / mag) * maxSp : 0;
    const acc = mag > 0.01 ? 9 : 12;
    this.vel.x = damp(this.vel.x, targetVx, acc, dt);
    this.vel.z = damp(this.vel.z, targetVz, acc, dt);
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    // steep slopes block
    const hn = world.groundAt(nx, nz), hc = world.groundAt(this.pos.x, this.pos.z);
    if (hn - hc > 0.9 * Math.hypot(nx - this.pos.x, nz - this.pos.z) + 0.25) { nx = this.pos.x; nz = this.pos.z; this.vel.x *= 0.2; this.vel.z *= 0.2; }
    _v.set(nx, 0, nz);
    world.collide(_v, 0.35);
    this.pos.x = _v.x; this.pos.z = _v.z;
    const g = world.groundAt(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, g, 18, dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.noise = this.speed < 0.2 ? 0.05 : this.crouch ? 0.15 : this.speed > 3.5 ? 1.0 : 0.45;
    if (this.action && this.action.noise) this.noise = Math.max(this.noise, this.action.noise);
    // footsteps
    if (this.speed > 0.4) {
      this.footTimer -= dt * (this.speed > 3 ? 2.6 : 1.9) * (this.speed / 2.3 + 0.4) * 0.6;
      if (this.footTimer <= 0) { this.footTimer = 0.5; this.onFootstep && this.onFootstep(this); }
    }
    // enter water
    const water = world.waterAt(this.pos.x, this.pos.z);
    if (water - g > 1.25) { this.state = 'swim'; this.onSplash && this.onSplash(this, 0.8); }
  }

  updateWater(dt, ctl, world) {
    const mag = Math.hypot(ctl.moveX, ctl.moveZ);
    const diving = this.state === 'dive';
    const fast = ctl.sprint && mag > 0.5;
    const maxSp = (diving ? 1.9 : 1.5) * (fast ? 1.55 : 1) * Math.min(1, mag * 1.25);
    if (mag > 0.01) this.heading = dampAngle(this.heading, Math.atan2(ctl.moveX, ctl.moveZ), 4, dt);
    const tvx = mag > 0.01 ? (ctl.moveX / mag) * maxSp : 0, tvz = mag > 0.01 ? (ctl.moveZ / mag) * maxSp : 0;
    this.vel.x = damp(this.vel.x, tvx, 2.2, dt);
    this.vel.z = damp(this.vel.z, tvz, 2.2, dt);
    _v.set(this.pos.x + this.vel.x * dt, 0, this.pos.z + this.vel.z * dt);
    world.collide(_v, 0.4, true);
    this.pos.x = _v.x; this.pos.z = _v.z;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const water = world.waterAt(this.pos.x, this.pos.z);
    const ground = world.groundAt(this.pos.x, this.pos.z);
    this.noise = 0.3 + this.speed * 0.15;
    if (!diving) {
      // float at the surface (body pivot sits ~1m above the hips)
      this.pos.y = damp(this.pos.y, water - 1.15, 6, dt);
      this.diveDepth = 0;
      if (ctl.diveDown && water - ground > 2.2) {
        this.state = 'dive';
        this.verticalVel = -1.2;
        this.onSplash && this.onSplash(this, 0.6);
      }
      if (water - ground < 1.1) { this.state = 'ground'; this.vel.multiplyScalar(0.5); }
    } else {
      const target = ctl.diveDown ? -1.6 : ctl.diveUp ? 1.8 : 0.35; // slight positive buoyancy
      this.verticalVel = damp(this.verticalVel, target, 2.5, dt);
      this.pos.y += this.verticalVel * dt;
      const minY = ground - 0.6;
      if (this.pos.y < minY) { this.pos.y = minY; this.verticalVel = Math.max(0, this.verticalVel); }
      this.diveDepth = water - (this.pos.y + 1.05);
      this.divePitch = damp(this.divePitch || 0, clamp(this.verticalVel * 0.45, -0.7, 0.8), 3, dt);
      if (this.pos.y > water - 1.15) {
        this.state = 'swim';
        this.divePitch = 0;
        this.onSplash && this.onSplash(this, 0.4);
      }
      if (water - ground < 1.1) { this.state = 'ground'; }
    }
  }

  get headPos() {
    const b = this.bones.head;
    if (!b) return this.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    return b.getWorldPosition(new THREE.Vector3());
  }
  handPos(out = new THREE.Vector3()) { return this.bones.rHand ? this.bones.rHand.getWorldPosition(out) : out.copy(this.pos); }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  setVisible(v) { this.root.visible = v; this.backpack.visible = v; this.hat.visible = v; if (this.handModel) this.handModel.visible = v; if (this.offModel) this.offModel.visible = v; }
}
