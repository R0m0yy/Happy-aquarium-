// Elevated 2.5D perspective camera with mode-dependent framing, smooth tracking,
// limited rotation, zoom, terrain/water awareness and an underwater framing.
import * as THREE from 'three';
import { damp, dampAngle, clamp } from '../util/math.js';
import { terrainHeight } from '../world/islands.js';

const MODES = {
  explore: { pitch: 50, dist: 30, min: 10, max: 55, fov: 42, lead: 1.6 },
  hunt: { pitch: 44, dist: 11.5, min: 7, max: 20, fov: 38, lead: 2.6 },
  build: { pitch: 62, dist: 24, min: 12, max: 40, fov: 40, lead: 0 },
  boat: { pitch: 47, dist: 30, min: 16, max: 60, fov: 40, lead: 4 },
  underwater: { pitch: 30, dist: 8.5, min: 5, max: 14, fov: 50, lead: 1 },
  sleep: { pitch: 58, dist: 12, min: 8, max: 20, fov: 36, lead: 0 },
  map: { pitch: 80, dist: 900, min: 900, max: 900, fov: 45, lead: 0 },
};

export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.3, 2400);
    this.mode = 'explore';
    this.yaw = 0; // radians, 0 = looking north (-z)
    this.targetYaw = 0;
    this.zoom = { explore: 30, hunt: 11.5, build: 24, boat: 30, underwater: 8.5, sleep: 12, map: 900 };
    this.pitch = 52;
    this.dist = 17;
    this.fov = 38;
    this.focus = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this.underwater = false;
  }

  setMode(m) { if (MODES[m]) this.mode = m; }

  rotate(dx) { this.targetYaw -= dx * 0.006; }
  zoomBy(d) {
    const M = MODES[this.mode];
    this.zoom[this.mode] = clamp(this.zoom[this.mode] * (1 + d * 0.09), M.min, M.max);
  }

  update(dt, target, vel, ocean) {
    const M = MODES[this.mode];
    this.yaw = dampAngle(this.yaw, this.targetYaw, 8, dt);
    this.pitch = damp(this.pitch, M.pitch, 3.5, dt);
    this.dist = damp(this.dist, this.zoom[this.mode], 4, dt);
    if (Math.abs(this.fov - M.fov) > 0.01) {
      this.fov = damp(this.fov, M.fov, 3, dt);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    // lead the framing slightly in the direction of travel
    const lx = target.x + (vel ? vel.x * 0.35 * M.lead / 2 : 0);
    const lz = target.z + (vel ? vel.z * 0.35 * M.lead / 2 : 0);
    const k = this.mode === 'boat' ? 5 : 8;
    this.focus.x = damp(this.focus.x, lx, k, dt);
    this.focus.z = damp(this.focus.z, lz, k, dt);
    this.focus.y = damp(this.focus.y, target.y, this.mode === 'underwater' ? 4 : 6, dt);

    const p = THREE.MathUtils.degToRad(this.pitch);
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(p) * this.dist,
      Math.sin(p) * this.dist,
      Math.cos(this.yaw) * Math.cos(p) * this.dist
    );
    const cam = this.camera;
    cam.position.copy(this.focus).add(off);
    const water = ocean ? ocean.heightAt(cam.position.x, cam.position.z) : 0;
    if (this.mode === 'underwater') {
      // stay below the rolling surface, above the seabed
      const maxY = water - 0.6;
      if (cam.position.y > maxY) cam.position.y = maxY;
      const g = terrainHeight(cam.position.x, cam.position.z) + 0.8;
      if (cam.position.y < g) cam.position.y = g;
    } else {
      // obstacle awareness: lift over hills between camera and survivor
      let lift = 0;
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const sx = this.focus.x + off.x * t, sz = this.focus.z + off.z * t;
        const lineY = this.focus.y + off.y * t;
        const h = terrainHeight(sx, sz) + 1.5;
        if (h > lineY) lift = Math.max(lift, (h - lineY) / t);
      }
      cam.position.y += lift;
      const minY = Math.max(terrainHeight(cam.position.x, cam.position.z) + 2, water + 1.2);
      if (cam.position.y < minY) cam.position.y = minY;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
    this.lookAt.copy(this.focus);
    this.lookAt.y += this.mode === 'underwater' ? 0.2 : 0.8;
    cam.lookAt(this.lookAt);
    this.underwater = cam.position.y < water - 0.05;
  }

  // world-space basis for movement input (camera-relative)
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
}
