// Procedural WebAudio soundscape: surf, wind, rain, thunder, birds, insects, fire,
// underwater ambience and one-shot effects with simple distance/stereo spatialisation.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.listener = { x: 0, z: 0, yaw: 0 };
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    // global muffling filter (underwater)
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.connect(this.master);
    this.noiseBuf = this.makeNoise(4, 'pink');
    this.whiteBuf = this.makeNoise(2, 'white');
    // ambience beds
    this.surf = this.bed(this.noiseBuf, 'lowpass', 600, 0);
    this.surfHi = this.bed(this.whiteBuf, 'bandpass', 2500, 0);
    this.wind = this.bed(this.noiseBuf, 'bandpass', 400, 0);
    this.rain = this.bed(this.whiteBuf, 'highpass', 3000, 0);
    this.rainLow = this.bed(this.noiseBuf, 'lowpass', 900, 0);
    this.under = this.bed(this.noiseBuf, 'lowpass', 280, 0, true);
    this.fire = this.bed(this.whiteBuf, 'bandpass', 1800, 0);
    this.birdTimer = 1;
    this.insectTimer = 1;
    this.crackTimer = 0;
    this.time = 0;
  }

  makeNoise(sec, kind) {
    const ctx = this.ctx;
    const n = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') { d[i] = w * 0.5; continue; }
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return buf;
  }

  bed(buf, type, freq, gain, bypassMuffle = false) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = type === 'bandpass' ? 0.8 : 0.7;
    const g = ctx.createGain(); g.gain.value = gain;
    const pan = ctx.createStereoPanner();
    src.connect(f); f.connect(g); g.connect(pan); pan.connect(bypassMuffle ? this.master : this.muffle);
    src.start(0, Math.random() * buf.duration);
    return { src, f, g, pan };
  }

  set(b, gain, freq, pan = 0, k = 0.3) {
    const t = this.ctx.currentTime;
    b.g.gain.setTargetAtTime(gain, t, k);
    if (freq) b.f.frequency.setTargetAtTime(freq, t, k);
    b.pan.pan.setTargetAtTime(pan, t, k);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  panFor(x, z) {
    const dx = x - this.listener.x, dz = z - this.listener.z;
    const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
    const d = Math.hypot(dx, dz) || 1;
    return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8;
  }
  att(x, z, ref = 6, max = 50) {
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    if (d > max) return 0;
    return Math.min(1, ref / Math.max(ref, d)) * (1 - d / max);
  }

  // ctx: { shoreDist, shoreDir(x,z), waves, wind, rain, underwater, daylight, night, fireDist, firePos, time }
  update(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.time += dt;
    const swell = 0.6 + 0.4 * Math.sin(this.time * 0.55) + 0.25 * Math.sin(this.time * 1.3 + 1);
    const near = Math.max(0, 1 - s.shoreDist / 70);
    const uw = s.underwater ? 1 : 0;
    this.muffle.frequency.setTargetAtTime(uw ? 450 : 20000, this.ctx.currentTime, 0.1);
    this.set(this.surf, (0.08 + near * 0.32 * swell) * (0.7 + s.waves * 0.4), 380 + swell * 500, s.shorePan || 0);
    this.set(this.surfHi, near * 0.06 * Math.max(0, swell - 0.6) * s.waves, 2600, s.shorePan || 0);
    this.set(this.wind, 0.03 + s.wind * 0.22, 300 + s.wind * 700 + Math.sin(this.time * 0.3) * 120);
    this.set(this.rain, s.rain * 0.25 * (s.sheltered ? 0.6 : 1), s.sheltered ? 1800 : 3500);
    this.set(this.rainLow, s.rain * 0.18, 900);
    this.set(this.under, uw * 0.35, 280);
    const fa = s.firePos ? this.att(s.firePos.x, s.firePos.z, 3, 25) : 0;
    this.set(this.fire, fa * 0.05, 1600 + Math.random() * 600, s.firePos ? this.panFor(s.firePos.x, s.firePos.z) : 0, 0.05);
    if (fa > 0.05 && (this.crackTimer -= dt) <= 0) { this.crackTimer = 0.05 + Math.random() * 0.4; this.crackle(fa); }
    // birds by day, insects at night
    if (!uw && (this.birdTimer -= dt) <= 0) {
      this.birdTimer = 1.5 + Math.random() * 5 / Math.max(0.2, s.daylight);
      if (s.daylight > 0.3 && s.rain < 0.5) this.bird(Math.random() * 2 - 1, 0.04 + Math.random() * 0.05);
    }
    if (!uw && (this.insectTimer -= dt) <= 0) {
      this.insectTimer = 0.25 + Math.random() * 0.6;
      if (s.night > 0.5 && s.rain < 0.3) this.cricket(Math.random() * 2 - 1);
    }
    if (uw && Math.random() < dt * 1.2) this.bubble();
  }

  env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  osc(type, f0, f1, dur, peak, pan = 0, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.005, dur, peak);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(this.muffle);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, type, freq, peak, pan = 0, q = 1, delay = 0, buf = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = buf || this.whiteBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); this.env(g, t, 0.004, dur, peak);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(f); f.connect(g); g.connect(p); p.connect(this.muffle);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.1);
  }

  // ---- one-shots
  bird(pan, vol) {
    const base = 1800 + Math.random() * 2200;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.osc('sine', base * (1 + Math.random() * 0.3), base * (0.7 + Math.random() * 0.6), 0.06 + Math.random() * 0.08, vol, pan, i * (0.09 + Math.random() * 0.06));
  }
  cricket(pan) { for (let i = 0; i < 3; i++) this.osc('sine', 4300, 4200, 0.03, 0.012, pan, i * 0.05); }
  crackle(a) { this.noise(0.02 + Math.random() * 0.03, 'bandpass', 2000 + Math.random() * 3000, 0.1 * a, 0, 2); }
  bubble() { this.osc('sine', 300 + Math.random() * 400, 900 + Math.random() * 600, 0.08, 0.04); }
  footstep(surface = 'sand') {
    const f = surface === 'wood' ? 300 : surface === 'grass' ? 1200 : surface === 'water' ? 900 : 800;
    this.noise(surface === 'wood' ? 0.06 : 0.09, surface === 'wood' ? 'lowpass' : 'bandpass', f, surface === 'water' ? 0.12 : 0.07, 0, 0.8);
    if (surface === 'wood') this.osc('triangle', 160, 120, 0.05, 0.05);
  }
  chop() { this.osc('triangle', 220, 90, 0.12, 0.35); this.noise(0.08, 'bandpass', 1400, 0.25, 0, 1.5); }
  stoneHit() { this.osc('square', 900, 600, 0.05, 0.08); this.noise(0.06, 'highpass', 3000, 0.2); }
  rustle() { this.noise(0.25, 'bandpass', 3000, 0.08, 0, 0.6); }
  splash(s = 1) { this.noise(0.4 * s + 0.2, 'lowpass', 1800, 0.25 * s, 0, 0.7); this.noise(0.25, 'bandpass', 4000, 0.08 * s); }
  pickup() { this.osc('sine', 600, 900, 0.08, 0.06); }
  craft() { this.noise(0.15, 'bandpass', 900, 0.1); this.osc('triangle', 300, 200, 0.1, 0.08, 0, 0.12); }
  hammer() { this.osc('triangle', 180, 90, 0.08, 0.3); this.noise(0.05, 'bandpass', 1500, 0.15); }
  eat() { for (let i = 0; i < 3; i++) this.noise(0.05, 'bandpass', 1200 + Math.random() * 800, 0.08, 0, 2, i * 0.18); }
  drink() { for (let i = 0; i < 3; i++) this.osc('sine', 500, 300, 0.1, 0.06, 0, i * 0.22); }
  thunder(dist = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180 + 300 / dist;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 / dist, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.25 / dist, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    s.connect(f); f.connect(g); g.connect(this.muffle);
    s.start(t); s.stop(t + 5);
  }
  creak() { this.osc('sawtooth', 120 + Math.random() * 60, 90, 0.35, 0.025); }
  paddle() { this.noise(0.3, 'lowpass', 900, 0.1); }
  hurt() { this.osc('sawtooth', 220, 140, 0.25, 0.12); }
  ui() { this.osc('sine', 880, 660, 0.05, 0.04); }
  bad() { this.osc('triangle', 300, 150, 0.25, 0.1); }
  gull(pos) { const p = pos ? this.panFor(pos.x, pos.z) : 0; const a = pos ? this.att(pos.x, pos.z, 8, 60) : 0.5; if (a < 0.02) return; for (let i = 0; i < 3; i++) this.osc('sawtooth', 1500, 900, 0.18, 0.03 * a, p, i * 0.22); }
  grunt(pos, alarm = false) { const a = this.att(pos.x, pos.z, 5, 40); if (a < 0.02) return; this.osc('sawtooth', alarm ? 260 : 140, alarm ? 180 : 90, alarm ? 0.3 : 0.18, 0.12 * a, this.panFor(pos.x, pos.z)); }
  squeal(pos) { const a = this.att(pos.x, pos.z, 6, 50); this.osc('sawtooth', 900, 500, 0.5, 0.15 * a, this.panFor(pos.x, pos.z)); }
  bite() { this.noise(0.2, 'lowpass', 600, 0.4); this.osc('sawtooth', 120, 60, 0.3, 0.2); }
}
