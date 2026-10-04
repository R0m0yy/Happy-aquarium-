// Fully synthesised audio (Web Audio API): aquarium filter hum, water trickle,
// bubbles, room ambience, UI/reward sounds, footsteps, cat sounds and a calm
// generative piano + pad score.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.vol = { music: 0.45, sfx: 0.7, ambience: 0.55 };
    this.muted = false;
    this.night = false;
  }

  start() {
    if (this.started) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.started = true;
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(c.destination);
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.ambBus = c.createGain();
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.2);
    const revGain = c.createGain();
    revGain.gain.value = 0.55;
    this.reverb.connect(revGain).connect(this.master);
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.reverb);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.applyVolumes();
    this.noiseBuf = this.noiseBuffer(2);
    this.startAmbience();
    this.startMusic();
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.1);
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.2);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.8, t, 0.1);
    this.ambBus.gain.setTargetAtTime(this.vol.ambience * 0.6, t, 0.2);
  }

  impulse(dur, decay) {
    const c = this.ctx;
    const len = c.sampleRate * dur;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  noiseBuffer(sec, brown = false) {
    const c = this.ctx;
    const len = c.sampleRate * sec;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  // -------------------------------------------------------------- ambience
  startAmbience() {
    const c = this.ctx;
    // filter hum: brown noise + low mains hum
    const hum = c.createBufferSource();
    hum.buffer = this.noiseBuffer(4, true);
    hum.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const hg = c.createGain();
    hg.gain.value = 0.22;
    hum.connect(lp).connect(hg).connect(this.ambBus);
    hum.start();
    const osc = c.createOscillator();
    osc.frequency.value = 58;
    const og = c.createGain();
    og.gain.value = 0.012;
    osc.connect(og).connect(this.ambBus);
    osc.start();
    // water trickle from the filter outflow
    const tr = c.createBufferSource();
    tr.buffer = this.noiseBuf;
    tr.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const tg = c.createGain();
    tg.gain.value = 0.035;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.3;
    const lfoG = c.createGain();
    lfoG.gain.value = 600;
    lfo.connect(lfoG).connect(bp.frequency);
    lfo.start();
    tr.connect(bp).connect(tg).connect(this.ambBus);
    tr.start();
    // room tone
    const room = c.createBufferSource();
    room.buffer = this.noiseBuffer(3, true);
    room.loop = true;
    const rl = c.createBiquadFilter();
    rl.type = 'lowpass';
    rl.frequency.value = 600;
    this.roomGain = c.createGain();
    this.roomGain.gain.value = 0.05;
    room.connect(rl).connect(this.roomGain).connect(this.ambBus);
    room.start();
    // random bubble plinks
    const tick = () => {
      if (!this.ctx) return;
      if (Math.random() < 0.7) this.bubble(0.25 + Math.random() * 0.3);
      setTimeout(tick, 250 + Math.random() * 900);
    };
    tick();
  }

  // ---------------------------------------------------------------- music
  startMusic() {
    const c = this.ctx;
    // gentle chord progression; voicings in Hz-friendly MIDI numbers
    const prog = [
      [60, 64, 67, 71], // Cmaj7
      [57, 60, 64, 67], // Am7
      [53, 57, 60, 64], // Fmaj7
      [55, 59, 62, 69], // G6/9
      [52, 55, 59, 62], // Em7
      [53, 57, 60, 67], // Fadd9
      [50, 53, 57, 60], // Dm7
      [55, 59, 62, 65], // G7
    ];
    const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79];
    let step = 0;
    const beat = 0.95;
    const play = () => {
      if (!this.ctx) return;
      const now = c.currentTime + 0.05;
      const chord = prog[Math.floor(step / 8) % prog.length];
      const inBar = step % 8;
      if (inBar === 0) {
        // pad + low piano chord
        this.pad(chord.map((n) => n - 12), now, beat * 8);
        chord.forEach((n, i) => this.piano(n - (i === 0 ? 12 : 0), now + i * 0.06, 0.22 + (i === 0 ? 0.06 : 0)));
      }
      // sparse melodic notes
      if ((inBar === 2 || inBar === 5 || (inBar === 7 && Math.random() < 0.5)) && Math.random() < 0.8) {
        const n = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.3 ? 12 : 0);
        this.piano(n, now, 0.16 + Math.random() * 0.08);
      }
      step++;
      this.musicTimer = setTimeout(play, beat * 1000 * (this.night ? 1.15 : 1));
    };
    play();
  }

  mtof(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  piano(midi, when, vel = 0.2) {
    const c = this.ctx;
    const f = this.mtof(midi);
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.008);
    g.gain.exponentialRampToValueAtTime(vel * 0.35, when + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 3.2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(8000, f * 7), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), when + 2);
    for (const [mult, amp, type] of [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4.01, 0.05, 'sine']]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = (Math.random() - 0.5) * 6;
      const og = c.createGain();
      og.gain.value = amp;
      o.connect(og).connect(lp);
      o.start(when);
      o.stop(when + 3.4);
    }
    lp.connect(g).connect(this.musicBus);
  }

  pad(notes, when, dur) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.045, when + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0, when + dur * 1.05);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(g).connect(this.musicBus);
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = this.mtof(n);
        o.detune.value = det;
        const og = c.createGain();
        og.gain.value = 0.25;
        o.connect(og).connect(lp);
        o.start(when);
        o.stop(when + dur * 1.1);
      }
    }
  }

  // ------------------------------------------------------------------- sfx
  env(node, when, a, peak, d) {
    node.gain.setValueAtTime(0.0001, when);
    node.gain.exponentialRampToValueAtTime(peak, when + a);
    node.gain.exponentialRampToValueAtTime(0.0001, when + a + d);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, when = 0, bus } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { freq = 2000, q = 1, vol = 0.2, type = 'bandpass', when = 0, sweep } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.004, vol, dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  bubble(vol = 0.4) {
    if (!this.ctx) return;
    const f = 500 + Math.random() * 900;
    this.tone(f, 0.08, { vol: 0.03 * vol, slide: 2.2, bus: this.ambBus });
  }

  click() {
    this.tone(1250, 0.05, { type: 'sine', vol: 0.08 });
    this.tone(2500, 0.03, { type: 'sine', vol: 0.03, when: 0.01 });
  }
  open() {
    this.tone(660, 0.12, { vol: 0.06, slide: 1.5 });
  }
  close() {
    this.tone(880, 0.1, { vol: 0.05, slide: 0.6 });
  }
  splash() {
    this.noise(0.35, { freq: 1200, q: 0.6, vol: 0.12, sweep: 400 });
    for (let i = 0; i < 4; i++) this.tone(700 + Math.random() * 900, 0.07, { vol: 0.03, slide: 2, when: 0.05 + i * 0.05 });
  }
  sprinkle() {
    for (let i = 0; i < 8; i++) this.noise(0.04, { freq: 5000 + Math.random() * 3000, q: 4, vol: 0.05, when: i * 0.06 + Math.random() * 0.03 });
  }
  shakeJar() {
    for (let i = 0; i < 10; i++) this.noise(0.05, { freq: 3500, q: 2, vol: 0.06, when: i * 0.13 });
  }
  squeak() {
    this.noise(0.12, { freq: 2600, q: 8, vol: 0.05, sweep: 3600 });
  }
  sparkle() {
    [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.25, { vol: 0.04, when: i * 0.06 }));
  }
  coin() {
    this.tone(1318, 0.08, { type: 'square', vol: 0.03 });
    this.tone(1760, 0.18, { type: 'square', vol: 0.03, when: 0.07 });
  }
  reward() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.08, when: i * 0.09 }));
  }
  discovery() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.06, when: i * 0.07 }));
    this.noise(0.6, { freq: 8000, q: 0.5, vol: 0.03, type: 'highpass' });
  }
  levelUp() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.45, { type: 'triangle', vol: 0.09, when: i * 0.1 }));
  }
  shutter() {
    this.noise(0.05, { freq: 3000, q: 1, vol: 0.2 });
    this.noise(0.08, { freq: 1500, q: 1, vol: 0.15, when: 0.07 });
  }
  tapGlass() {
    this.tone(1900, 0.12, { vol: 0.07, type: 'sine' });
    this.tone(3100, 0.06, { vol: 0.03, when: 0.005 });
  }
  footstep(run) {
    if (!this.ctx) return;
    this.noise(0.06, { freq: run ? 500 : 350, q: 1.2, vol: run ? 0.05 : 0.035, type: 'lowpass' });
  }
  meow() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t);
    o.frequency.linearRampToValueAtTime(780, t + 0.15);
    o.frequency.linearRampToValueAtTime(480, t + 0.5);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1600, t + 0.2);
    f.frequency.linearRampToValueAtTime(800, t + 0.5);
    const g = c.createGain();
    this.env(g, t, 0.05, 0.08, 0.5);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.6);
  }
  purr(dur = 3) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuffer(1, true);
    s.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const am = c.createGain();
    am.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.frequency.value = 24;
    const lg = c.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(am.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(lp).connect(am).connect(g).connect(this.sfxBus);
    lfo.start(t);
    s.start(t);
    s.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }
  waterChange() {
    this.noise(2.5, { freq: 900, q: 0.5, vol: 0.12, sweep: 400 });
  }

  setNight(n) {
    this.night = n;
    if (this.roomGain) this.roomGain.gain.setTargetAtTime(n ? 0.025 : 0.05, this.ctx.currentTime, 1);
  }
}
