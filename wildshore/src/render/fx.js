// Particles & atmospheric effects: splashes, bubbles, chips, leaves, embers, smoke,
// foam, rain streaks, marine snow and underwater light shafts.
import * as THREE from 'three';

const MAX = 2400;

function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

class ParticlePool {
  constructor(scene, additive, sprite, scale) {
    this.n = 0;
    this.max = MAX;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX);
    this.grow = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: sprite }, uScale: { value: scale } },
      vertexShader: /* glsl */`
        attribute float size; attribute vec4 color; varying vec4 vColor;
        uniform float uScale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; varying vec4 vColor;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
          if (gl_FragColor.a < 0.01) discard;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.layers.set(1);
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, a, size, life, kind = 0, grow = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.kind[i] = kind; this.grow[i] = grow;
  }
  update(dt, waterAt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const k = this.kind[i];
      const p = i * 3;
      // kinds: 0 ballistic, 1 buoyant bubble, 2 smoke, 3 flutter leaf, 4 surface foam, 5 ember
      if (k === 0) { this.vel[p + 1] -= 9.8 * dt; this.vel[p] *= 0.99; this.vel[p + 2] *= 0.99; }
      else if (k === 1) {
        this.vel[p + 1] += (1.2 - this.vel[p + 1]) * dt * 2; this.vel[p] += Math.sin(this.life[i] * 9 + i) * dt * 0.4;
        if (waterAt && this.pos[p + 1] > waterAt(this.pos[p], this.pos[p + 2]) - 0.05) { this.kill(i); continue; }
      }
      else if (k === 2) { this.vel[p + 1] += (0.9 - this.vel[p + 1]) * dt * 0.8; this.vel[p] *= 0.995; }
      else if (k === 3) { this.vel[p + 1] = Math.max(this.vel[p + 1] - 3 * dt, -0.8); this.vel[p] += Math.sin(this.life[i] * 5 + i) * dt * 1.5; }
      else if (k === 4) { this.vel[p] *= 0.98; this.vel[p + 2] *= 0.98; if (waterAt) this.pos[p + 1] = waterAt(this.pos[p], this.pos[p + 2]) + 0.05; }
      else if (k === 5) { this.vel[p + 1] += 0.4 * dt; this.vel[p] += (Math.random() - 0.5) * dt * 2; this.vel[p + 2] += (Math.random() - 0.5) * dt * 2; }
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const lf = this.life[i] / this.maxLife[i];
      if (k === 2 || k === 4) this.col[i * 4 + 3] = Math.min(this.col[i * 4 + 3], lf * 0.8);
      else if (lf < 0.3) this.col[i * 4 + 3] *= 0.9;
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size']) this.geo.attributes[k].needsUpdate = true;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.pos.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.col.copyWithin(i * 4, j * 4, j * 4 + 4);
    this.size[i] = this.size[j]; this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.kind[i] = this.kind[j]; this.grow[i] = this.grow[j];
  }
}

export class FX {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    const sprite = softSprite();
    this.normal = new ParticlePool(scene, false, sprite, 300);
    this.add = new ParticlePool(scene, true, sprite, 300);
    this.rain = this.makeRain();
    this.snow = this.makeMarineSnow();
    this.shafts = this.makeShafts();
    this.time = 0;
    this.density = quality.particles;
  }

  makeRain() {
    const N = 2600;
    const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      for (let k = 0; k < 2; k++) {
        seed.set([x, y, z], (i * 2 + k) * 3);
        pos.set([0, k, 0], (i * 2 + k) * 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(0xaabbcc) } },
      vertexShader: /* glsl */`
        attribute vec3 seed; uniform float uTime, uAmount; uniform vec3 uCenter; uniform vec2 uWind; varying float vA;
        void main(){
          float box = 40.0, hgt = 26.0;
          float fall = 22.0;
          vec3 p;
          p.x = (seed.x - 0.5) * box; p.z = (seed.z - 0.5) * box;
          p.y = fract(seed.y - uTime * fall / hgt) * hgt;
          vec3 base = vec3(uCenter.x + mod(p.x - uCenter.x + box*0.5, box) - box*0.5, uCenter.y - 6.0 + p.y, uCenter.z + mod(p.z - uCenter.z + box*0.5, box) - box*0.5);
          base.xz += uWind * (p.y) * 0.08;
          vec3 dir = normalize(vec3(uWind.x * 0.25, -1.0, uWind.y * 0.25));
          vec3 wp = base + dir * position.y * 0.55;
          vA = step(seed.x * 0.97, uAmount) * 0.45;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      transparent: true, depthWrite: false,
    });
    const l = new THREE.LineSegments(g, mat);
    l.frustumCulled = false;
    l.layers.set(1);
    l.renderOrder = 6;
    this.scene.add(l);
    return l;
  }

  makeMarineSnow() {
    const N = 900;
    const seed = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uOn: { value: 0 }, uLight: { value: 1 } },
      vertexShader: /* glsl */`
        uniform float uTime; uniform vec3 uCenter; varying float vA;
        void main(){
          float box = 18.0;
          vec3 p = position * box;
          p.y += sin(uTime * 0.3 + position.x * 30.0) * 0.4 - uTime * 0.05;
          p.x += uTime * 0.12;
          vec3 wp = uCenter + mod(p - uCenter + box * 0.5, box) - box * 0.5;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_PointSize = (1.5 + position.z * 2.5) * 120.0 / -mv.z;
          vA = 0.5;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uOn, uLight; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * vA * uOn; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.75, 0.9, 0.9) * uLight, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.layers.set(1);
    this.scene.add(pts);
    return pts;
  }

  makeShafts() {
    const group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uColor: { value: new THREE.Color(0x9fe8e0) } },
      vertexShader: `varying vec2 vUv; varying float vSeed; attribute float seed; void main(){ vUv = uv; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uOn; uniform vec3 uColor; varying vec2 vUv; varying float vSeed;
        void main(){
          float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float fade = smoothstep(0.0, 0.7, vUv.y);
          float flick = 0.6 + 0.4 * sin(uTime * 0.7 + vSeed * 20.0);
          float a = edge * fade * flick * 0.13 * uOn;
          gl_FragColor = vec4(uColor * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.PlaneGeometry(1.2 + Math.random() * 1.8, 16, 1, 1);
      g.translate(0, -8, 0);
      const s = new Float32Array(4).fill(Math.random());
      g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
      const m = new THREE.Mesh(g, mat);
      m.userData.off = new THREE.Vector3((Math.random() - 0.5) * 22, 0, (Math.random() - 0.5) * 22);
      m.userData.tilt = (Math.random() - 0.5) * 0.3;
      m.layers.set(1);
      m.frustumCulled = false;
      group.add(m);
    }
    group.userData.mat = mat;
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  // ---------- emitters ----------
  splash(x, y, z, strength = 1) {
    const n = Math.floor(24 * strength * this.density) + 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 2.2 * strength;
      this.normal.emit(x, y + 0.05, z, Math.cos(a) * s, 2 + Math.random() * 3.5 * strength, Math.sin(a) * s, 0.92, 0.97, 1, 0.85, 0.12 + Math.random() * 0.16, 0.9 + Math.random() * 0.4, 0, -0.05);
    }
    for (let i = 0; i < 10 * strength; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 1.2;
      this.normal.emit(x, y, z, Math.cos(a) * s, 0, Math.sin(a) * s, 0.95, 0.98, 1, 0.7, 0.4 + Math.random() * 0.4, 2.2, 4, 0.25);
    }
  }
  bubbles(x, y, z, n = 6, spread = 0.2) {
    n = Math.ceil(n * this.density);
    for (let i = 0; i < n; i++) {
      this.normal.emit(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, 0.85, 0.97, 1, 0.75, 0.04 + Math.random() * 0.08, 5, 1, 0);
    }
  }
  chips(x, y, z, color = [0.75, 0.6, 0.42], n = 10) {
    n = Math.ceil(n * this.density) + 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
      const v = 0.8 + Math.random() * 0.4;
      this.normal.emit(x, y, z, Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s, color[0] * v, color[1] * v, color[2] * v, 1, 0.06 + Math.random() * 0.06, 0.8 + Math.random() * 0.6, 0, 0);
    }
  }
  leaves(x, y, z, n = 8) {
    n = Math.ceil(n * this.density) + 1;
    for (let i = 0; i < n; i++) {
      this.normal.emit(x + (Math.random() - 0.5) * 2, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1.5, Math.random() * 1, (Math.random() - 0.5) * 1.5, 0.35 + Math.random() * 0.2, 0.5 + Math.random() * 0.2, 0.18, 1, 0.1 + Math.random() * 0.06, 2.5 + Math.random() * 2, 3, 0);
    }
  }
  dust(x, y, z, n = 4, col = [0.85, 0.8, 0.7]) {
    n = Math.ceil(n * this.density);
    for (let i = 0; i < n; i++) {
      this.normal.emit(x + (Math.random() - 0.5) * 0.3, y + 0.05, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6, col[0], col[1], col[2], 0.35, 0.18 + Math.random() * 0.15, 0.7, 2, 0.4);
    }
  }
  embers(x, y, z, n = 1) {
    for (let i = 0; i < n; i++) {
      this.add.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4, 1, 0.55, 0.2, 1, 0.04 + Math.random() * 0.05, 1 + Math.random() * 1.5, 5, 0);
    }
  }
  smoke(x, y, z, n = 1, dark = 0.5) {
    for (let i = 0; i < n; i++) {
      const c = 0.45 + dark * 0.2 + Math.random() * 0.1;
      this.normal.emit(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, c, c, c * 1.02, 0.3, 0.5 + Math.random() * 0.4, 4 + Math.random() * 3, 2, 0.55);
    }
  }
  foam(x, y, z, n = 2, spread = 0.6) {
    for (let i = 0; i < n * this.density; i++) {
      this.normal.emit(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5, 0.95, 0.98, 1, 0.75, 0.25 + Math.random() * 0.3, 2.5 + Math.random() * 1.5, 4, 0.3);
    }
  }
  blood(x, y, z, under) {
    for (let i = 0; i < 8; i++) {
      this.normal.emit(x, y, z, (Math.random() - 0.5) * 0.6, under ? 0.1 : 1.5, (Math.random() - 0.5) * 0.6, 0.55, 0.06, 0.05, 0.6, under ? 0.3 : 0.08, under ? 2.5 : 0.8, under ? 2 : 0, under ? 0.3 : 0);
    }
  }
  sparkle(x, y, z) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add.emit(x, y, z, Math.cos(a) * 0.8, 1.2 + Math.random(), Math.sin(a) * 0.8, 1, 0.92, 0.6, 1, 0.07, 0.9, 0, 0);
    }
  }

  update(dt, ctx) {
    this.time += dt;
    this.normal.update(dt, ctx.waterAt);
    this.add.update(dt, ctx.waterAt);
    const ru = this.rain.material.uniforms;
    ru.uTime.value = this.time;
    ru.uCenter.value.copy(ctx.focus);
    ru.uAmount.value = ctx.underwater ? 0 : ctx.rain * this.density;
    ru.uWind.value.copy(ctx.wind).multiplyScalar(ctx.windStrength * 6);
    ru.uColor.value.setRGB(0.6, 0.66, 0.75).multiplyScalar(0.4 + 0.6 * ctx.daylight);
    this.rain.visible = ctx.rain > 0.02 && !ctx.underwater;
    const su = this.snow.material.uniforms;
    su.uTime.value = this.time;
    su.uCenter.value.copy(ctx.camera);
    su.uOn.value = ctx.underwater ? 1 : 0;
    su.uLight.value = 0.3 + ctx.daylight * 0.7;
    this.snow.visible = ctx.underwater;
    const sh = this.shafts;
    sh.visible = ctx.underwater && ctx.daylight > 0.2;
    if (sh.visible) {
      sh.userData.mat.uniforms.uTime.value = this.time;
      sh.userData.mat.uniforms.uOn.value = ctx.daylight * (1 - ctx.cloud * 0.6);
      for (const m of sh.children) {
        m.position.set(ctx.focus.x + m.userData.off.x, ctx.waterLevel, ctx.focus.z + m.userData.off.z);
        m.lookAt(ctx.camera.x, m.position.y, ctx.camera.z);
        m.rotateZ(m.userData.tilt + ctx.sunTilt);
      }
    }
  }
}
