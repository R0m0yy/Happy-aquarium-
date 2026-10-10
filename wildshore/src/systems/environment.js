// Day/night cycle + weather simulation. Drives lights, sky, fog, ocean and survival modifiers.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, rng } from '../util/math.js';

const C = (h) => new THREE.Color(h);
const PAL = {
  night: { z: C(0x06122a), h: C(0x1a2a4a), sun: C(0x6d82b8) },
  twilight: { z: C(0x1d2b52), h: C(0xd9785a), sun: C(0xff7a3a) },
  golden: { z: C(0x4a7bc0), h: C(0xf6c08a), sun: C(0xffc285) },
  day: { z: C(0x2a6fd0), h: C(0xb5dcf3), sun: C(0xfff4e2) },
};
const tmpA = new THREE.Color(), tmpB = new THREE.Color();

export const WEATHER = {
  clear: { cloud: 0.12, rain: 0, wind: 0.25, fog: 0, dark: 0, waves: 0.75, temp: 0 },
  cloudy: { cloud: 0.6, rain: 0, wind: 0.4, fog: 0.05, dark: 0.25, waves: 0.95, temp: -1.5 },
  rain: { cloud: 0.85, rain: 0.45, wind: 0.5, fog: 0.25, dark: 0.55, waves: 1.15, temp: -3 },
  heavyRain: { cloud: 0.95, rain: 0.85, wind: 0.65, fog: 0.4, dark: 0.75, waves: 1.45, temp: -4.5 },
  fog: { cloud: 0.5, rain: 0, wind: 0.1, fog: 0.85, dark: 0.2, waves: 0.55, temp: -2 },
  storm: { cloud: 1.0, rain: 1.0, wind: 1.0, fog: 0.45, dark: 0.9, waves: 2.3, temp: -6 },
};
const NEXT = {
  clear: [['clear', 4], ['cloudy', 3], ['fog', 1]],
  cloudy: [['clear', 3], ['cloudy', 1], ['rain', 3], ['fog', 1]],
  rain: [['cloudy', 3], ['heavyRain', 2], ['rain', 1]],
  heavyRain: [['rain', 3], ['storm', 1.4]],
  storm: [['heavyRain', 3], ['rain', 1]],
  fog: [['clear', 2], ['cloudy', 2]],
};
export const WEATHER_LABEL = { clear: 'Clear', cloudy: 'Overcast', rain: 'Rain', heavyRain: 'Heavy rain', fog: 'Sea fog', storm: 'Tropical storm' };

export class Environment {
  constructor() {
    this.dayLengthMin = 24; // real minutes per game day
    this.time = 7.0; // hours
    this.day = 1;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.skyZenith = new THREE.Color();
    this.skyHorizon = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.lightColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.hemiSky = new THREE.Color();
    this.hemiGround = new THREE.Color();
    this.weatherId = 'clear';
    this.weatherTimer = 3.5; // game hours until next roll
    this.w = { ...WEATHER.clear }; // current (blended) weather values
    this.windDir = new THREE.Vector2(0.8, 0.6).normalize();
    this.windAngle = Math.atan2(0.6, 0.8);
    this.flash = 0;
    this.thunderQueue = [];
    this.rand = rng(Date.now() & 0xffff);
    this.night = 0;
    this.daylight = 1;
    this.listeners = [];
    this.forced = null;
  }

  get hours() { return this.time; }
  get totalHours() { return (this.day - 1) * 24 + this.time; }

  setWeather(id, instant = false) {
    this.weatherId = id;
    this.weatherTimer = 2 + this.rand() * 5;
    if (instant) Object.assign(this.w, WEATHER[id]);
  }

  rollWeather() {
    const opts = NEXT[this.weatherId];
    let total = 0;
    for (const [, w] of opts) total += w;
    let r = this.rand() * total;
    for (const [id, w] of opts) { r -= w; if (r <= 0) { this.setWeather(id); return; } }
  }

  // dtGameHours: game-hours elapsed
  update(dtReal, dtGameHours) {
    this.time += dtGameHours;
    while (this.time >= 24) { this.time -= 24; this.day++; }
    this.weatherTimer -= dtGameHours;
    if (this.weatherTimer <= 0 && !this.forced) this.rollWeather();
    // blend weather values
    const target = WEATHER[this.weatherId];
    const k = 1 - Math.exp(-dtReal * 0.08);
    for (const key in target) this.w[key] = lerp(this.w[key], target[key], k);
    // wind direction drifts
    this.windAngle += Math.sin(this.totalHours * 0.13) * dtGameHours * 0.05;
    this.windDir.set(Math.cos(this.windAngle), Math.sin(this.windAngle));

    // celestial
    const t = this.time / 24;
    const sunAng = (t - 0.25) * Math.PI * 2; // sunrise at 6:00
    this.sunDir.set(Math.cos(sunAng) * 0.82, Math.sin(sunAng), -0.42).normalize();
    this.moonDir.set(-Math.cos(sunAng) * 0.7, -Math.sin(sunAng) * 0.9 + 0.12, 0.5).normalize();
    const e = this.sunDir.y;
    this.night = smoothstep(0.02, -0.18, e);
    this.daylight = smoothstep(-0.12, 0.25, e);

    // palette blend
    let a, b, f;
    if (e < -0.15) { a = PAL.night; b = PAL.night; f = 0; }
    else if (e < 0.0) { a = PAL.night; b = PAL.twilight; f = (e + 0.15) / 0.15; }
    else if (e < 0.16) { a = PAL.twilight; b = PAL.golden; f = e / 0.16; }
    else { a = PAL.golden; b = PAL.day; f = clamp((e - 0.16) / 0.3, 0, 1); }
    this.skyZenith.copy(a.z).lerp(b.z, f);
    this.skyHorizon.copy(a.h).lerp(b.h, f);
    this.sunColor.copy(a.sun).lerp(b.sun, f);
    // overcast desaturation
    const grey = tmpA.setRGB(0.42, 0.45, 0.5).multiplyScalar(0.25 + 0.75 * this.daylight);
    const dk = this.w.dark;
    this.skyZenith.lerp(grey, dk * 0.85);
    this.skyHorizon.lerp(tmpB.copy(grey).multiplyScalar(1.15), dk * 0.8);

    // key light: sun by day, moon by night
    const moonMix = this.night;
    this.lightDir.copy(this.sunDir).lerp(this.moonDir, moonMix).normalize();
    if (this.lightDir.y < 0.12) this.lightDir.y = 0.12;
    this.lightDir.normalize();
    this.lightColor.copy(this.sunColor).lerp(tmpA.set(0x8fa6d8), moonMix);
    const sunI = smoothstep(-0.04, 0.2, e) * 3.1 * (1 - dk * 0.75);
    const moonI = moonMix * 0.75 * (1 - dk * 0.7);
    this.lightIntensity = sunI + moonI;

    this.hemiSky.copy(this.skyZenith).lerp(this.skyHorizon, 0.4);
    this.hemiGround.set(0x8a7a5c).multiplyScalar(0.35 + 0.65 * this.daylight);
    this.hemiIntensity = 0.55 + 1.1 * this.daylight + 0.35 * this.night;

    this.fogColor.copy(this.skyHorizon).lerp(this.skyZenith, 0.18);
    this.fogDensity = 0.0009 + this.w.fog * 0.012 + this.w.rain * 0.003;

    // storms: lightning
    this.flash = Math.max(0, this.flash - dtReal * 3.5);
    if (this.w.rain > 0.8 && this.w.dark > 0.8 && this.rand() < dtReal * 0.12) {
      this.flash = 1;
      this.thunderQueue.push(0.6 + this.rand() * 2.5);
    }
  }

  // ambient air temperature in °C
  airTemp(altitude = 0) {
    const diurnal = Math.sin(((this.time - 9) / 24) * Math.PI * 2) * 4;
    return 28 + diurnal + this.w.temp - altitude * 0.05 - this.night * 2;
  }

  isNight() { return this.night > 0.6; }

  clockString() {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  serialize() { return { time: this.time, day: this.day, weather: this.weatherId, wt: this.weatherTimer }; }
  restore(s) {
    this.time = s.time; this.day = s.day; this.setWeather(s.weather || 'clear', true); this.weatherTimer = s.wt ?? 3;
  }
}
