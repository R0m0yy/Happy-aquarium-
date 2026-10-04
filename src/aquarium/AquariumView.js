// The physical aquarium: glass, frame edges, water volume & surface, substrate,
// backdrop, light bar, light rays, bubbles, floating particles, debris & algae.
import * as THREE from 'three';
import { TANKS, TANK_BY_ID, SUBSTRATE_BY_ID, LIGHTING_BY_ID } from '../data/items.js';
import { TANK_UNIFORMS, tankStandard, glassMaterial } from '../render/materials.js';
import { toTexture, gravelTexture, aquariumBackground, softDot, lightRayTexture, noiseBumpTexture, canvas } from '../render/textures.js';
import { makeNoise2D, makeRng, clamp, randRange } from '../core/util.js';
import { CAB_H, BACK_Z } from '../render/RoomBuilder.js';

const G = 0.022; // glass thickness

export class AquariumView {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'aquarium';
    scene.add(this.group);
    this.contents = new THREE.Group(); // fish/plants/decor attach here (world space)
    this.contents.name = 'contents';
    scene.add(this.contents);
    this.ripples = [];
    this.bubbleEmitters = [];
    this.time = 0;
  }

  static dims(sizeId) {
    return TANK_BY_ID[sizeId] ?? TANKS[2];
  }

  build(tank, tankX, quality) {
    this.dispose();
    this.tank = tank;
    const dim = AquariumView.dims(tank.size);
    this.dim = dim;
    const { w, h, d } = dim;
    const zc = BACK_Z + 0.16 + d / 2;
    this.center = new THREE.Vector3(tankX, CAB_H, zc);
    this.group.position.copy(this.center);
    this.waterLocal = h - 0.07;
    this.waterY = CAB_H + this.waterLocal;
    this.frontZ = zc + d / 2 - G;
    this.backZ = zc - d / 2 + G;
    this.minX = tankX - w / 2 + G;
    this.maxX = tankX + w / 2 - G;
    this.noise = makeNoise2D(tank.algae?.seed ?? 3);
    this.quality = quality;

    TANK_UNIFORMS.uWaterTop.value = this.waterY;
    TANK_UNIFORMS.uTankH.value = this.waterLocal;
    TANK_UNIFORMS.uTankFrontZ.value = this.frontZ;
    TANK_UNIFORMS.uCausticScale.value = 1.25;

    this.buildGlass();
    this.buildSubstrate(tank.substrate);
    this.buildBackground(tank.background);
    this.buildWater();
    this.buildLightBar();
    this.buildRays();
    this.buildBubbles(quality.bubbles);
    this.buildParticles(quality.particles);
    this.buildAlgae();
    this.buildDebris();
    this.setLighting(tank.lighting);
    this.updateEnvironment(tank);
  }

  dispose() {
    for (const g of [this.group]) {
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      g.clear();
    }
    this.ripples = [];
  }

  // ---------------------------------------------------------------- glass
  buildGlass() {
    const { w, h, d } = this.dim;
    const env = this.scene.environment;
    this.glassMat = glassMaterial(env, { opacity: 0.05 });
    const sideGlass = glassMaterial(env, { opacity: 0.09 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.glassMat);
    front.position.set(0, h / 2, d / 2);
    front.renderOrder = 10;
    front.name = 'frontGlass';
    this.frontGlass = front;
    const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), sideGlass);
    left.rotation.y = -Math.PI / 2;
    left.position.set(-w / 2, h / 2, 0);
    left.renderOrder = 10;
    const right = left.clone();
    right.rotation.y = Math.PI / 2;
    right.position.x = w / 2;
    // inner faces for the sides so the glass reads from inside too
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ visible: false }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = h;
    this.group.add(front, left, right);
    // bottom plate (thick glass edge visible from front)
    const bottomM = new THREE.MeshPhysicalMaterial({ color: 0x9fe8e0, transmission: 0, roughness: 0.05, transparent: true, opacity: 0.55, envMapIntensity: 1.5, clearcoat: 1 });
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), bottomM);
    bottom.position.y = 0.0125;
    this.group.add(bottom);
    // polished glowing edges (signature look)
    const edgeM = new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.75, toneMapped: false });
    this.edgeMat = edgeM;
    const e = 0.012;
    const edges = [
      [w, e, e, 0, h, d / 2], [w, e, e, 0, 0.025, d / 2], [w, e, e, 0, h, -d / 2],
      [e, h, e, -w / 2, h / 2, d / 2], [e, h, e, w / 2, h / 2, d / 2], [e, h, e, -w / 2, h / 2, -d / 2], [e, h, e, w / 2, h / 2, -d / 2],
      [e, e, d, -w / 2, h, 0], [e, e, d, w / 2, h, 0], [e, e, d, -w / 2, 0.025, 0], [e, e, d, w / 2, 0.025, 0],
    ];
    for (const [ew, eh, ed, x, y, z] of edges) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ew, eh, ed), edgeM);
      m.position.set(x, y, z);
      m.renderOrder = 11;
      this.group.add(m);
    }
    // black silicone seams on the back corners
    const sil = new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.4 });
    for (const x of [-w / 2 + 0.008, w / 2 - 0.008]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.016, h, 0.016), sil);
      s.position.set(x, h / 2, -d / 2 + 0.008);
      this.group.add(s);
    }
  }

  // ------------------------------------------------------------ substrate
  substrateLocal(lx, lz) {
    const { w, d } = this.dim;
    const zf = clamp((lz + d / 2) / d, 0, 1); // 0 back, 1 front
    const xf = (lx + w / 2) / w;
    const base = 0.07 + 0.14 * Math.pow(1 - zf, 1.15);
    const bump = (this.noise(xf * 7, zf * 4) - 0.5) * 0.035 + (this.noise(xf * 23 + 5, zf * 13) - 0.5) * 0.01;
    const mound = Math.exp(-Math.pow((xf - 0.32) * 4, 2) - Math.pow((zf - 0.35) * 3, 2)) * 0.035;
    return base + bump + mound;
  }
  substrateY(x, z) {
    return CAB_H + this.substrateLocal(x - this.center.x, z - this.center.z);
  }

  buildSubstrate(subId) {
    const sub = SUBSTRATE_BY_ID[subId] ?? SUBSTRATE_BY_ID.gravel;
    const { w, d } = this.dim;
    const iw = w - G * 2, id = d - G * 2;
    const nx = 72, nz = 36;
    const geo = new THREE.PlaneGeometry(iw, id, nx, nz);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.substrateLocal(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const tex = toTexture(gravelTexture(sub), { repeat: [w * 1.6, d * 1.6] });
    const bump = toTexture(noiseBumpTexture(7, 0.25), { repeat: [w * 3, d * 3], srgb: false });
    const mat = tankStandard({ map: tex, roughness: 0.9, bumpMap: bump, bumpScale: 2.5 });
    this.substrateMat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'substrate';
    this.substrate = mesh;
    this.group.add(mesh);
    // front & side skirts (visible cross-section through the glass)
    const skirtTex = toTexture(gravelTexture(sub), { repeat: [w * 1.6, 0.35] });
    const skirtM = tankStandard({ map: skirtTex, roughness: 0.95, color: 0xd8d0c8 });
    const fs = new THREE.PlaneGeometry(iw, 1, nx, 1);
    const fp = fs.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const top = fp.getY(i) > 0;
      fp.setY(i, top ? this.substrateLocal(fp.getX(i), id / 2 - 0.001) : 0.025);
    }
    fs.computeVertexNormals();
    const frontSkirt = new THREE.Mesh(fs, skirtM);
    frontSkirt.position.z = id / 2;
    this.group.add(frontSkirt);
    for (const s of [-1, 1]) {
      const ss = new THREE.PlaneGeometry(id, 1, nz, 1);
      const sp = ss.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const top = sp.getY(i) > 0;
        sp.setY(i, top ? this.substrateLocal(s * (iw / 2 - 0.001), -s * sp.getX(i)) : 0.025);
      }
      const sk = new THREE.Mesh(ss, skirtM);
      sk.rotation.y = s * Math.PI / 2;
      sk.position.x = s * iw / 2;
      this.group.add(sk);
    }
    // scattered pebbles on top for detail
    const pebbleGeo = new THREE.DodecahedronGeometry(1, 1);
    const pp = pebbleGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) * 0.6);
    pebbleGeo.computeVertexNormals();
    const count = Math.round(w * d * (this.quality.particles > 200 ? 260 : 120));
    const pm = tankStandard({ roughness: 0.6, color: 0xffffff });
    const inst = new THREE.InstancedMesh(pebbleGeo, pm, count);
    const rng = makeRng(subId + w);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = (rng() - 0.5) * (iw - 0.02), z = (rng() - 0.5) * (id - 0.02);
      const sz = (0.006 + rng() * 0.012) * sub.grain * 0.5;
      v3.set(x, this.substrateLocal(x, z) + sz * 0.2, z);
      q.setFromEuler(new THREE.Euler(rng() * 0.4, rng() * 6, rng() * 0.4));
      s3.set(sz, sz, sz * (0.7 + rng() * 0.5));
      m4.compose(v3, q, s3);
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.set(sub.colors[Math.floor(rng() * sub.colors.length)]));
    }
    inst.receiveShadow = true;
    this.group.add(inst);
  }

  setSubstrate(id) {
    this.tank.substrate = id;
    this.build(this.tank, this.center.x, this.quality);
  }

  // ------------------------------------------------------------ backdrop
  buildBackground(bgId) {
    const { w, h, d } = this.dim;
    const tex = toTexture(aquariumBackground(bgId));
    const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true });
    this.bgMat = m;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w - G * 2, h - 0.02), m);
    bg.position.set(0, h / 2 + 0.01, -d / 2 + G + 0.002);
    this.group.add(bg);
    this.bgMesh = bg;
  }
  setBackground(id) {
    this.tank.background = id;
    this.bgMat.map = toTexture(aquariumBackground(id));
    this.bgMat.needsUpdate = true;
  }

  // ------------------------------------------------------------ water
  buildWater() {
    const { w, d } = this.dim;
    const iw = w - G * 2, id = d - G * 2;
    const ripUniform = [];
    for (let i = 0; i < 8; i++) ripUniform.push(new THREE.Vector4(0, 0, -100, 0));
    this.rippleData = ripUniform;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: TANK_UNIFORMS.uTime,
        uLight: TANK_UNIFORMS.uTankLight,
        uLightColor: TANK_UNIFORMS.uTankLightColor,
        uWater: TANK_UNIFORMS.uWaterColor,
        uRipples: { value: ripUniform },
        uEnv: { value: null },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec4 uRipples[8];
        varying vec3 vW; varying vec3 vN; varying vec2 vUv;
        float hgt(vec2 p){
          float h = sin(p.x*7.0+uTime*1.3)*0.004 + sin(p.y*9.0-uTime*1.1)*0.003 + sin((p.x+p.y)*15.0+uTime*2.2)*0.0015;
          for(int i=0;i<8;i++){ vec4 r=uRipples[i]; float age=uTime-r.z; if(age<0.0||age>3.0) continue;
            float dd=length(p-r.xy); float k=dd-age*0.35; h += sin(k*45.0)*exp(-k*k*60.0)*exp(-age*1.4)*0.012*r.w; }
          return h; }
        void main(){ vUv=uv; vec4 wp = modelMatrix*vec4(position,1.0); vec2 p=wp.xz;
          float h0=hgt(p); float hx=hgt(p+vec2(0.01,0.0)); float hz=hgt(p+vec2(0.0,0.01));
          wp.y += h0; vN = normalize(vec3(-(hx-h0)/0.01, 1.0, -(hz-h0)/0.01)); vW = wp.xyz;
          gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uLight; uniform vec3 uLightColor; uniform vec3 uWater;
        varying vec3 vW; varying vec3 vN; varying vec2 vUv;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          vec3 N = gl_FrontFacing ? vN : -vN;
          float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 L = normalize(vec3(0.2, 1.0, 0.3));
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 220.0) * 2.5;
          float sparkle = pow(max(sin(vW.x*90.0+uTime*3.0)*sin(vW.z*70.0-uTime*2.0),0.0), 24.0);
          vec3 col; float a;
          if (gl_FrontFacing) {
            col = mix(uWater*0.55, vec3(0.75,0.88,1.0), fr) + uLightColor*(spec + sparkle*0.6)*uLight;
            a = 0.16 + fr*0.5 + spec*0.4;
          } else {
            // seen from below: shimmering mirror of the tank (total internal reflection)
            float sh = 0.55 + 0.45*sin(vW.x*28.0 + vN.x*90.0 + uTime*1.7)*sin(vW.z*24.0 + vN.z*80.0 - uTime*1.3);
            col = mix(uWater*1.4, vec3(0.75,0.95,1.0), sh*0.55) * (0.35 + 0.9*uLight);
            a = 0.62;
          }
          gl_FragColor = vec4(col, clamp(a,0.0,0.95));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(iw, id, 96, 48), mat);
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = this.waterLocal;
    surf.renderOrder = 5;
    this.surface = surf;
    this.group.add(surf);
    // waterline meniscus along the front glass
    const lineM = new THREE.MeshBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(iw, 0.012), lineM);
    line.position.set(0, this.waterLocal, d / 2 - G - 0.001);
    line.renderOrder = 6;
    this.group.add(line);
    this.waterline = line;
    // faint volume tint on the empty space above the waterline (air gap) is left clear.
    // subtle inner water tint on front glass for depth
    const tintM = new THREE.MeshBasicMaterial({ color: 0x2a9ac8, transparent: true, opacity: 0.05, depthWrite: false });
    this.tintMat = tintM;
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(iw, this.waterLocal - 0.03), tintM);
    tint.position.set(0, (this.waterLocal + 0.03) / 2, d / 2 - G - 0.003);
    tint.renderOrder = 7;
    this.group.add(tint);
  }

  addRipple(x, z, strength = 1) {
    const r = this.rippleData;
    let idx = 0, oldest = Infinity;
    for (let i = 0; i < r.length; i++) if (r[i].z < oldest) {
      oldest = r[i].z;
      idx = i;
    }
    r[idx].set(x, z, TANK_UNIFORMS.uTime.value, strength);
  }

  // ------------------------------------------------------------ light bar
  buildLightBar() {
    const { w, h, d } = this.dim;
    const bar = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.05, Math.min(0.28, d * 0.3)), new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.6, roughness: 0.35 }));
    bar.add(housing);
    const glowM = new THREE.MeshBasicMaterial({ color: 0xf4fbff, toneMapped: false });
    this.barGlow = glowM;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.93, Math.min(0.22, d * 0.24)), glowM);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -0.026;
    bar.add(glow);
    // accent strip on the front edge (warm, like the reference)
    const accent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffc080, toneMapped: false }));
    accent.position.set(0, -0.02, Math.min(0.14, d * 0.15));
    bar.add(accent);
    this.accentMat = accent.material;
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), housing.material);
      arm.position.set(s * w * 0.42, -0.1, 0);
      bar.add(arm);
    }
    bar.position.set(0, h + 0.2, 0);
    this.group.add(bar);
    this.bar = bar;
    this.spot = new THREE.SpotLight(0xffffff, 18, h * 2.4, 1.15, 0.7, 1.2);
    this.spot.position.set(0, h + 0.15, 0.05);
    this.spot.target.position.set(0, 0, 0.05);
    this.spot.castShadow = !!this.quality.tankShadow;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0008;
    this.spot.shadow.camera.near = 0.1;
    this.spot.shadow.camera.far = h + 0.6;
    this.group.add(this.spot, this.spot.target);
    // spill light onto the room in front of the tank
    this.spill = new THREE.PointLight(0x7fd8ff, 1.2, 5.5, 1.6);
    this.spill.position.set(0, h * 0.5, d / 2 + 0.5);
    this.group.add(this.spill);
  }

  setLighting(id) {
    const l = LIGHTING_BY_ID[id] ?? LIGHTING_BY_ID.daylight;
    this.tank.lighting = l.id;
    this.lightDef = l;
    TANK_UNIFORMS.uTankLightColor.value.set(l.color);
    TANK_UNIFORMS.uWaterColor.value.set(l.water);
    this.spot.color.set(l.color);
    this.barGlow.color.set(l.color);
    this.spill.color.set(l.water).lerp(new THREE.Color(0x9fe8ff), 0.6);
  }

  // ------------------------------------------------------------- light rays
  buildRays() {
    const { w, h, d } = this.dim;
    const tex = toTexture(lightRayTexture(), { srgb: false });
    this.rays = [];
    const rng = makeRng(w * 10);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.MeshBasicMaterial({ map: tex, color: 0xbfeaff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const rw = 0.15 + rng() * 0.35;
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(rw, this.waterLocal * 1.05), m);
      ray.position.set((rng() - 0.5) * (w - 0.4), this.waterLocal / 2, (rng() - 0.5) * d * 0.6);
      ray.rotation.z = 0.12 + rng() * 0.12;
      ray.rotation.y = (rng() - 0.5) * 0.4;
      ray.userData.phase = rng() * 10;
      ray.userData.base = 0.05 + rng() * 0.08;
      ray.renderOrder = 4;
      this.group.add(ray);
      this.rays.push(ray);
    }
  }

  // --------------------------------------------------------------- bubbles
  buildBubbles(max) {
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uLight: TANK_UNIFORMS.uTankLight },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uLight; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float rim = pow(f, 2.5); float hl = pow(max(dot(normalize(vN), normalize(vec3(-0.4,0.6,0.7))),0.0), 30.0);
        vec3 c = vec3(0.8,0.95,1.0) * (rim*0.9 + hl*1.6) * (0.4+0.8*uLight); gl_FragColor = vec4(c, clamp(rim*0.8 + hl, 0.04, 0.9)); }`,
      transparent: true,
      depthWrite: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, max);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.frustumCulled = false;
    inst.renderOrder = 8;
    this.group.add(inst);
    this.bubbleMesh = inst;
    this.bubbles = [];
    for (let i = 0; i < max; i++) this.bubbles.push({ active: false, x: 0, y: 0, z: 0, r: 0, vy: 0, ph: 0 });
    this.bubbleMax = max;
    this._m4 = new THREE.Matrix4();
    this.bubbleEmitters = [];
  }

  setBubbleEmitters(list) {
    // list of {x,y,z (local), rate, spread, size}
    const { w, d } = this.dim;
    const base = [{ x: w / 2 - 0.18, y: 0.15, z: -d / 2 + 0.12, rate: 5, spread: 0.02, size: 1 }];
    if (this.tank.equipment?.air) {
      for (let i = 0; i < 6; i++) base.push({ x: -w / 2 + 0.3 + (i / 5) * (w - 0.6), y: 0.12, z: -d / 2 + 0.06, rate: 2.5, spread: 0.04, size: 0.7 });
    }
    this.bubbleEmitters = [...base, ...list].map((e) => ({ ...e, acc: Math.random() }));
  }

  spawnBubble(x, y, z, r) {
    const b = this.bubbles.find((bb) => !bb.active);
    if (!b) return;
    b.active = true;
    b.x = x;
    b.y = y;
    b.z = z;
    b.r = r;
    b.vy = 0.12 + r * 18;
    b.ph = Math.random() * 6;
  }

  updateBubbles(dt) {
    for (const e of this.bubbleEmitters) {
      e.acc += dt * e.rate;
      while (e.acc > 1) {
        e.acc -= 1;
        this.spawnBubble(e.x + randRange(-e.spread, e.spread), e.y, e.z + randRange(-e.spread, e.spread), (0.004 + Math.random() * 0.008) * e.size);
      }
    }
    const m = this._m4;
    let n = 0;
    const wy = this.waterLocal;
    for (const b of this.bubbles) {
      if (!b.active) continue;
      b.vy = Math.min(b.vy + dt * 0.4, 0.5);
      b.y += b.vy * dt;
      b.ph += dt * 8;
      b.x += Math.sin(b.ph) * 0.02 * dt;
      b.z += Math.cos(b.ph * 0.7) * 0.015 * dt;
      if (b.y > wy - b.r) {
        b.active = false;
        if (Math.random() < 0.15) this.addRipple(b.x + this.center.x, b.z + this.center.z, 0.25);
        continue;
      }
      const s = b.r * (1 + Math.sin(b.ph * 1.7) * 0.08);
      m.makeScale(s, s * 0.9, s);
      m.setPosition(b.x, b.y, b.z);
      this.bubbleMesh.setMatrixAt(n++, m);
    }
    this.bubbleMesh.count = n;
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------- particles
  buildParticles(count) {
    const { w, d } = this.dim;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (w - 0.1);
      pos[i * 3 + 1] = 0.12 + Math.random() * (this.waterLocal - 0.16);
      pos[i * 3 + 2] = (Math.random() - 0.5) * (d - 0.1);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: TANK_UNIFORMS.uTime, uTex: { value: toTexture(softDot(), { srgb: false }) }, uLight: TANK_UNIFORMS.uTankLight, uScale: { value: 400 }, uH: { value: this.waterLocal }, uCloudy: TANK_UNIFORMS.uCloudy },
      vertexShader: `uniform float uTime; uniform float uScale; uniform float uH; attribute float aSeed; varying float vA;
        void main(){ vec3 p = position; float t = uTime*0.02*(0.5+aSeed);
          p.x += sin(t*3.0 + aSeed*30.0)*0.05; p.z += cos(t*2.0+aSeed*20.0)*0.04; p.y = 0.12 + mod(p.y - 0.12 + t*(aSeed-0.4)*0.6, uH-0.16);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          gl_PointSize = (0.6 + aSeed*1.6) * uScale / -mv.z * 0.012; vA = 0.25 + aSeed*0.5; }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uLight; uniform float uCloudy; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vec3(0.85,0.95,1.0)*(0.4+0.7*uLight), a*vA*(0.55+uCloudy)); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particleMat = mat;
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 9;
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  // ----------------------------------------------------------------- algae
  buildAlgae() {
    const { w, h, d } = this.dim;
    this.algaeCanvas = canvas(512, 256);
    this.algaeCtx = this.algaeCanvas.getContext('2d', { willReadFrequently: true });
    this.algaeTex = toTexture(this.algaeCanvas, { srgb: false, mips: false });
    const m = new THREE.MeshStandardMaterial({ color: 0x5c8a3a, alphaMap: this.algaeTex, transparent: true, roughness: 0.9, depthWrite: false, opacity: 1 });
    this.algaeMat = m;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w - G * 2, h - 0.03), m);
    mesh.position.set(0, h / 2 + 0.015, d / 2 - G - 0.004);
    mesh.renderOrder = 9;
    this.group.add(mesh);
    this.algaeMesh = mesh;
    this.paintAlgae(this.tank.algae?.level ?? 0);
  }

  // Paint the algae coverage implied by a level 0..1 (deterministic per seed).
  paintAlgae(level) {
    const ctx = this.algaeCtx;
    const W = 512, H = 256;
    const img = ctx.createImageData(W, H);
    const n = this.noise;
    const thr = 1 - level * 0.85;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = n.fbm(x * 0.012, y * 0.02, 4) * 0.75 + n(x * 0.08, y * 0.08) * 0.25;
      // algae prefers the lower glass and corners
      const bias = (y / H) * 0.18 + (Math.min(x, W - x) < 60 ? 0.08 : 0);
      const a = clamp((v + bias - thr) * 6, 0, 1);
      const i = (y * W + x) * 4;
      const val = a > 0 ? Math.floor(clamp(a * 200 + n(x * 0.3, y * 0.3) * 40, 0, 230)) : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.algaeTex.needsUpdate = true;
    this.computeAlgaeCells();
  }

  // gradually increase algae in its preferred spots
  growAlgae(amount) {
    if (amount <= 0) return;
    const ctx = this.algaeCtx;
    const W = 512, H = 256;
    const img = ctx.getImageData(0, 0, W, H);
    const n = this.noise;
    const lvl = this.tank.algae.level;
    const thr = 1 - lvl * 0.85;
    const inc = amount * 900;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const v = n.fbm(x * 0.012, y * 0.02, 2) * 0.75 + n(x * 0.08, y * 0.08) * 0.25 + (y / H) * 0.18;
      if (v > thr) {
        const i = (y * W + x) * 4;
        const val = Math.min(230, img.data[i] + inc * (v - thr + 0.2));
        img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.algaeTex.needsUpdate = true;
    this.computeAlgaeCells();
  }

  computeAlgaeCells() {
    const data = this.algaeCtx.getImageData(0, 0, 512, 256).data;
    const cells = [];
    const cw = 64, ch = 64;
    let total = 0;
    for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 8; cx++) {
      let s = 0;
      for (let y = cy * ch; y < (cy + 1) * ch; y += 4) for (let x = cx * cw; x < (cx + 1) * cw; x += 4) s += data[(y * 512 + x) * 4];
      const v = s / ((cw / 4) * (ch / 4) * 230);
      cells.push(v);
      total += v;
    }
    this.algaeCells = cells;
    this.algaeCoverage = total / cells.length;
    return cells;
  }

  // erase algae at a uv point; returns amount removed (0..1-ish)
  scrubAlgae(u, v, radius = 26) {
    const ctx = this.algaeCtx;
    const x = u * 512, y = (1 - v) * 256;
    const before = this.algaeCoverage;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.algaeTex.needsUpdate = true;
    const prevCells = this.algaeCells.slice();
    this.computeAlgaeCells();
    let cleared = 0;
    for (let i = 0; i < prevCells.length; i++) if (prevCells[i] > 0.12 && this.algaeCells[i] <= 0.04) cleared++;
    return { removed: Math.max(0, before - this.algaeCoverage), cleared };
  }

  // ---------------------------------------------------------------- debris
  buildDebris() {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = tankStandard({ color: 0x4a3a24, roughness: 1 });
    const inst = new THREE.InstancedMesh(geo, mat, 80);
    inst.count = 0;
    this.group.add(inst);
    this.debrisMesh = inst;
    this.setDebris(this.tank.debris ?? 0);
  }
  setDebris(level) {
    const { w, d } = this.dim;
    const n = Math.round(clamp(level, 0, 1) * 80);
    const rng = makeRng(42);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * (w - 0.2), z = (rng() * 0.6 - 0.1) * d * 0.5 + d * 0.1;
      const s = 0.006 + rng() * 0.008;
      m.makeScale(s, s * 0.5, s * 1.4);
      m.setPosition(x, this.substrateLocal(x, z) + 0.002, z);
      this.debrisMesh.setMatrixAt(i, m);
    }
    this.debrisMesh.count = n;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }

  updateEnvironment(tank) {
    const cloudy = clamp(1 - (tank.water?.cleanliness ?? 1), 0, 1);
    TANK_UNIFORMS.uCloudy.value = Math.max(0, cloudy - 0.25) * 0.8;
    this.algaeMat.opacity = 0.92;
  }

  // ------------------------------------------------------------- per frame
  update(dt, t, tankLight) {
    this.time = t;
    this.updateBubbles(dt);
    for (const r of this.rays) {
      r.material.opacity = (r.userData.base + Math.sin(t * 0.4 + r.userData.phase) * 0.04) * tankLight;
    }
    this.edgeMat.opacity = 0.45 + tankLight * 0.35;
    this.spot.intensity = 20 * tankLight * (this.lightDef?.intensity ?? 1);
    this.spill.intensity = 0.6 + tankLight * 1.4;
    this.barGlow.color.set(this.lightDef?.color ?? 0xffffff).multiplyScalar(0.25 + tankLight * 0.9);
  }

  // world-space interior bounds for swimmers
  bounds(margin = 0.05) {
    return {
      minX: this.minX + margin,
      maxX: this.maxX - margin,
      minZ: this.backZ + margin,
      maxZ: this.frontZ - margin,
      minY: CAB_H + 0.08,
      maxY: this.waterY - margin,
    };
  }

  // tank-local → world helpers for normalised layout coordinates
  layoutToWorld(nx, nz) {
    const { w, d } = this.dim;
    const x = this.center.x + nx * (w - 0.2);
    const z = this.center.z + nz * (d - 0.15);
    return new THREE.Vector3(x, this.substrateY(x, z), z);
  }
  worldToLayout(x, z) {
    const { w, d } = this.dim;
    return { nx: clamp((x - this.center.x) / (w - 0.2), -0.5, 0.5), nz: clamp((z - this.center.z) / (d - 0.15), -0.5, 0.5) };
  }
}
