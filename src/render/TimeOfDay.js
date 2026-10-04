// Morning / Day / Sunset / Night lighting. Interpolates keyframes for the sun,
// sky, lamps, window view and the aquarium light schedule.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { TANK_UNIFORMS } from './materials.js';

const KEYS = [
  { t: 0.0, w: [0, 0, 0, 1], sun: 0.0, sunCol: 0x6a80c0, hemi: 0.16, sky: 0x283a6a, ground: 0x140e0a, lamps: 1, tank: 0.42, exp: 1.05 },
  { t: 0.2, w: [0, 0, 0, 1], sun: 0.0, sunCol: 0x6a80c0, hemi: 0.16, sky: 0x283a6a, ground: 0x140e0a, lamps: 1, tank: 0.42, exp: 1.05 },
  { t: 0.26, w: [1, 0, 0, 0], sun: 2.0, sunCol: 0xffc29a, hemi: 0.5, sky: 0xc8d4f0, ground: 0x4a3a2a, lamps: 0.25, tank: 1, exp: 1.0 },
  { t: 0.36, w: [0, 1, 0, 0], sun: 3.0, sunCol: 0xfff0dc, hemi: 0.75, sky: 0xdce8ff, ground: 0x5a4a3a, lamps: 0, tank: 1, exp: 0.95 },
  { t: 0.66, w: [0, 1, 0, 0], sun: 3.0, sunCol: 0xfff0dc, hemi: 0.75, sky: 0xdce8ff, ground: 0x5a4a3a, lamps: 0, tank: 1, exp: 0.95 },
  { t: 0.74, w: [0, 0, 1, 0], sun: 2.4, sunCol: 0xff8a50, hemi: 0.45, sky: 0xf0a8a0, ground: 0x4a2a20, lamps: 0.7, tank: 1, exp: 1.0 },
  { t: 0.82, w: [0, 0, 0, 1], sun: 0.0, sunCol: 0x6a80c0, hemi: 0.18, sky: 0x283a6a, ground: 0x140e0a, lamps: 1, tank: 0.42, exp: 1.05 },
  { t: 1.0, w: [0, 0, 0, 1], sun: 0.0, sunCol: 0x6a80c0, hemi: 0.16, sky: 0x283a6a, ground: 0x140e0a, lamps: 1, tank: 0.42, exp: 1.05 },
];

const cA = new THREE.Color(), cB = new THREE.Color();

export function phaseName(t) {
  if (t >= 0.22 && t < 0.33) return 'Morning';
  if (t >= 0.33 && t < 0.68) return 'Day';
  if (t >= 0.68 && t < 0.8) return 'Sunset';
  return 'Night';
}

export class TimeOfDay {
  constructor() {
    this.t = 0.3;
    this.state = {};
  }

  sample(t) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = smoothstep(0, 1, (t - a.t) / Math.max(1e-6, b.t - a.t));
    const mix = (x, y) => lerp(x, y, k);
    return {
      w: a.w.map((v, j) => mix(v, b.w[j])),
      sun: mix(a.sun, b.sun),
      sunCol: cA.set(a.sunCol).lerp(cB.set(b.sunCol), k).getHex(),
      hemi: mix(a.hemi, b.hemi),
      sky: cA.set(a.sky).lerp(cB.set(b.sky), k).getHex(),
      ground: cA.set(a.ground).lerp(cB.set(b.ground), k).getHex(),
      lamps: mix(a.lamps, b.lamps),
      tank: mix(a.tank, b.tank),
      exp: mix(a.exp, b.exp),
    };
  }

  apply(t, room, aq, renderer, tankLightOverride) {
    this.t = t;
    const s = this.sample(t);
    this.state = s;
    const rig = room.lightRig;
    if (!rig) return s;
    rig.sun.intensity = s.sun;
    rig.sun.color.setHex(s.sunCol);
    // sun travels across the windows over the day
    const sunA = lerp(-0.6, 1.2, clamp((t - 0.22) / 0.6, 0, 1));
    rig.sun.position.set(room.windowRange[0] - 6 + Math.sin(sunA) * 2, 3 + Math.sin(clamp((t - 0.22) / 0.6, 0, 1) * Math.PI) * 5, -5 - Math.cos(sunA) * 4);
    rig.hemi.intensity = s.hemi;
    rig.hemi.color.setHex(s.sky);
    rig.hemi.groundColor.setHex(s.ground);
    const L = s.lamps;
    rig.floorLamp.intensity = L * 5.5;
    rig.tableLamp.intensity = L * 3.2;
    rig.pendant.intensity = L * 4;
    rig.cabinetGlow.intensity = 0.5 + L * 1.2;
    rig.shelfGlow.intensity = 0.4 + L * 1.4;
    for (const l of room.lamps) {
      const sh = l.obj.userData.shade;
      if (sh) {
        sh.emissive.copy(rig.lampColor);
        sh.emissiveIntensity = L * 1.6;
      }
      if (l.obj.userData.bulb) l.obj.userData.bulb.visible = L > 0.05;
    }
    for (const p of room.pendants) {
      p.userData.glass.emissive.copy(rig.lampColor);
      p.userData.glass.emissiveIntensity = 0.2 + L * 2.2;
      p.userData.fil.material.color.copy(rig.lampColor).multiplyScalar(0.5 + L * 1.5);
    }
    for (const led of room.leds) led.material.color.setHex(0xffa860).multiplyScalar(0.6 + L * 1.4);
    if (room.viewMat) {
      room.viewMat.uniforms.uW.value.set(...s.w);
      room.viewMat.uniforms.uBright.value = 0.9 + s.w[3] * 0.2;
    }
    const tank = tankLightOverride ?? s.tank;
    TANK_UNIFORMS.uTankLight.value = tank;
    TANK_UNIFORMS.uTankAmbient.value = 0.12 + tank * 0.12;
    TANK_UNIFORMS.uNightGlow.value = 1 - tank;
    renderer.toneMappingExposure = s.exp;
    return s;
  }

  isNight(t = this.t) {
    return t < 0.22 || t > 0.8;
  }
}
