// Cinematic camera: damped orbit-pan-zoom around the aquarium, smooth focus
// transitions, fish follow mode, photo mode free look and the intro fly-in.
import * as THREE from 'three';
import { clamp, damp, lerp, easeInOut } from '../core/util.js';

export class CameraController {
  constructor(camera) {
    this.cam = camera;
    this.target = new THREE.Vector3();
    this.goalTarget = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0.1;
    this.dist = 4;
    this.goal = { yaw: 0, pitch: 0.1, dist: 4 };
    this.home = null;
    this.mode = 'room'; // room | focus | follow | photo | intro
    this.follow = null;
    this.limits = { yaw: [-0.55, 0.55], pitch: [-0.08, 0.5], dist: [1.0, 6] };
    this.parallax = new THREE.Vector2();
    this.intro = null;
    this.shake = 0;
  }

  frame(aq, room) {
    // home framing: aquarium ~65% of the screen with the room around it
    this.aq = aq;
    this.room = room;
    const w = aq.dim.w;
    const aspect = this.cam.aspect;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const portrait = aspect < 1;
    // fit the tank (plus some room) horizontally; portrait screens show the tank edge to edge
    const span = portrait ? w * 1.12 : w * 1.75;
    const dist = clamp(span / 2 / (tanH * aspect) + 0.4, 3.2, portrait ? 13 : 9);
    this.home = {
      target: new THREE.Vector3(aq.center.x - (portrait ? 0 : w * 0.12), aq.center.y + aq.dim.h * (portrait ? 0.15 : 0.3), aq.center.z + 0.35),
      yaw: portrait ? -0.06 : -0.2,
      pitch: portrait ? 0.07 : 0.1,
      dist,
    };
    this.limits.dist = [0.9, dist * 1.35];
    if (this.mode === 'room' || this.mode === 'intro') this.goHome(true);
  }

  goHome(instant = false) {
    const h = this.home;
    if (!h) return;
    this.mode = 'room';
    this.follow = null;
    this.goalTarget.copy(h.target);
    this.goal = { yaw: h.yaw, pitch: h.pitch, dist: h.dist };
    if (instant) {
      this.target.copy(h.target);
      this.yaw = h.yaw;
      this.pitch = h.pitch;
      this.dist = h.dist;
    }
  }

  focusOn(point, dist = 1.6) {
    this.mode = 'focus';
    this.goalTarget.copy(point);
    this.goal.dist = clamp(dist, this.limits.dist[0], this.limits.dist[1]);
    this.goal.pitch = clamp(this.goal.pitch, 0.02, 0.25);
  }

  startFollow(actor) {
    this.mode = 'follow';
    this.follow = actor;
    this.goal.dist = 1.15;
    this.goal.pitch = 0.06;
    this.goal.yaw = 0;
  }

  stopFollow() {
    this.follow = null;
    this.goHome();
  }

  startIntro(onDone) {
    const h = this.home;
    this.mode = 'intro';
    this.intro = {
      t: 0,
      dur: 9,
      onDone,
      // outside the window at sunrise → through the room → reveal the tank
      path: [
        new THREE.Vector3(this.room.windowRange[0] + 1.5, 2.6, -8.5),
        new THREE.Vector3(this.room.windowRange[0] + 2.2, 2.0, -2.0),
        new THREE.Vector3(h.target.x - 2.5, 1.7, 2.6),
        this.posFrom(h.target, h.yaw, h.pitch, h.dist),
      ],
      look: [
        new THREE.Vector3(this.room.windowRange[0] + 2.5, 1.8, 0),
        new THREE.Vector3(h.target.x - 1.4, 1.4, 0),
        h.target.clone(),
        h.target.clone(),
      ],
    };
  }

  skipIntro() {
    if (this.mode !== 'intro') return;
    const cb = this.intro.onDone;
    this.intro = null;
    this.goHome(true);
    cb?.(true);
  }

  posFrom(target, yaw, pitch, dist) {
    return new THREE.Vector3(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  }

  // input
  pan(dx, dy) {
    if (this.mode === 'intro') return;
    if (this.mode === 'follow') return;
    const k = 0.0032;
    this.goal.yaw = clamp(this.goal.yaw - dx * k, this.limits.yaw[0], this.limits.yaw[1]);
    this.goal.pitch = clamp(this.goal.pitch + dy * k * 0.6, this.limits.pitch[0], this.limits.pitch[1]);
    if (this.mode === 'focus' && Math.abs(dx) + Math.abs(dy) > 30) this.mode = 'room';
  }
  translate(dx, dy) {
    if (this.mode === 'intro' || this.mode === 'follow') return;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.goalTarget.addScaledVector(right, -dx * 0.002 * this.dist * 0.4);
    this.goalTarget.y = clamp(this.goalTarget.y + dy * 0.002 * this.dist * 0.4, 0.6, 2.6);
    this.clampTarget();
  }
  zoom(f) {
    if (this.mode === 'intro') return;
    this.goal.dist = clamp(this.goal.dist * f, this.limits.dist[0], this.limits.dist[1]);
    if (this.mode === 'room' && f < 1) {
      // zoom toward the aquarium centre
      this.goalTarget.lerp(this.aq.center.clone().setY(this.aq.center.y + this.aq.dim.h * 0.5), 0.08);
    }
  }
  clampTarget() {
    if (!this.aq) return;
    const a = this.aq;
    this.goalTarget.x = clamp(this.goalTarget.x, a.minX - 1.5, a.maxX + 1.5);
    this.goalTarget.z = clamp(this.goalTarget.z, a.backZ, a.frontZ + 1.5);
  }

  update(dt, pointerNdc) {
    const cam = this.cam;
    if (this.mode === 'intro' && this.intro) {
      const it = this.intro;
      it.t += dt;
      const u = clamp(it.t / it.dur, 0, 1);
      const e = easeInOut(u);
      it.curve ??= new THREE.CatmullRomCurve3(it.path);
      it.lookC ??= new THREE.CatmullRomCurve3(it.look);
      cam.position.copy(it.curve.getPoint(e));
      cam.lookAt(it.lookC.getPoint(e));
      if (u >= 1) {
        const cb = it.onDone;
        this.intro = null;
        this.goHome(true);
        cb?.(false);
      }
      return;
    }
    if (this.mode === 'follow' && this.follow) {
      const f = this.follow;
      // stay on the viewer side of the glass, tracking the fish
      this.goalTarget.lerp(f.pos, 1 - Math.exp(-4 * dt));
    }
    const lam = this.mode === 'follow' ? 3 : 4.5;
    this.target.x = damp(this.target.x, this.goalTarget.x, lam, dt);
    this.target.y = damp(this.target.y, this.goalTarget.y, lam, dt);
    this.target.z = damp(this.target.z, this.goalTarget.z, lam, dt);
    this.yaw = damp(this.yaw, this.goal.yaw, 4, dt);
    this.pitch = damp(this.pitch, this.goal.pitch, 4, dt);
    this.dist = damp(this.dist, this.goal.dist, 3.5, dt);
    // subtle parallax from the pointer for depth
    if (pointerNdc && this.mode === 'room') {
      this.parallax.x = damp(this.parallax.x, pointerNdc.x * 0.02, 2, dt);
      this.parallax.y = damp(this.parallax.y, pointerNdc.y * 0.01, 2, dt);
    } else {
      this.parallax.x = damp(this.parallax.x, 0, 2, dt);
      this.parallax.y = damp(this.parallax.y, 0, 2, dt);
    }
    const yaw = this.yaw + this.parallax.x;
    const pitch = this.pitch + this.parallax.y;
    const p = this.posFrom(this.target, yaw, pitch, this.dist);
    // never clip through the front glass or into the walls/floor
    if (this.aq) {
      const a = this.aq;
      const inFrontOfTankX = p.x > a.minX - 0.3 && p.x < a.maxX + 0.3;
      if (inFrontOfTankX && p.y < a.center.y + a.dim.h + 0.3) p.z = Math.max(p.z, a.frontZ + 0.18);
      p.y = clamp(p.y, 0.25, 4.1);
      if (this.room) {
        p.x = clamp(p.x, this.room.bounds.minX - 0.2, this.room.bounds.maxX + 0.2);
        p.z = Math.min(p.z, 11.5);
      }
    }
    cam.position.copy(p);
    cam.lookAt(this.target);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      cam.rotation.z += Math.sin(performance.now() * 0.05) * this.shake * 0.01;
    }
  }
}
