// Two-pass renderer:
//  1. opaque world (layer 0) -> HDR target with depth texture
//  2. composite to screen (tonemap, grade, depth restore), then water & transparent fx (layer 1)
//     which read the scene colour/depth for refraction and absorption.
import * as THREE from 'three';

export const QUALITY = {
  low: {
    id: 'low', pixelRatio: 1, minScale: 0.55, shadows: 1024, shadowRange: 28, oceanRes: 128, hmRes: 256,
    terrainHome: 2.0, terrainFar: 4.0, veg: 0.45, msaa: 0, waterDetail: 0, particles: 0.4, fishCount: 0.5, grass: 0.3,
  },
  medium: {
    id: 'medium', pixelRatio: 1.5, minScale: 0.6, shadows: 2048, shadowRange: 34, oceanRes: 192, hmRes: 384,
    terrainHome: 1.4, terrainFar: 2.8, veg: 0.75, msaa: 0, waterDetail: 1, particles: 0.7, fishCount: 0.8, grass: 0.65,
  },
  ultra: {
    id: 'ultra', pixelRatio: 2, minScale: 0.7, shadows: 4096, shadowRange: 42, oceanRes: 256, hmRes: 512,
    terrainHome: 1.0, terrainFar: 2.2, veg: 1.0, msaa: 4, waterDetail: 1, particles: 1, fishCount: 1, grass: 1,
  },
};

export function defaultQuality() {
  const ua = navigator.userAgent;
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  return mobile ? 'medium' : 'ultra';
}

export class Pipeline {
  constructor(canvas, qualityId) {
    this.q = QUALITY[qualityId] || QUALITY.medium;
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
    }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 1);
    this.halfFloat = r.extensions.has('EXT_color_buffer_half_float') || r.extensions.has('EXT_color_buffer_float');
    this.scale = 1;
    this.size = new THREE.Vector2(1, 1);
    this.renderSize = new THREE.Vector2(1, 1);
    this.createTargets();
    this.underwater = 0;
    this.time = 0;
    this.frameTimes = [];
    this.adaptTimer = 0;

    this.copyMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        uUnder: { value: 0 },
        uTime: { value: 0 },
        uUnderCol: { value: new THREE.Color(0x0e6a78) },
        uFlash: { value: 0 },
        uDamage: { value: 0 },
        uSleep: { value: 0 },
        uSat: { value: 1.08 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor, tDepth;
        uniform float uUnder, uTime, uFlash, uDamage, uSleep, uSat;
        uniform vec3 uUnderCol;
        varying vec2 vUv;
        void main(){
          vec2 uv = vUv;
          if (uUnder > 0.0) uv += vec2(sin(uv.y * 24.0 + uTime * 2.0), cos(uv.x * 20.0 + uTime * 1.7)) * 0.0022 * uUnder;
          vec3 c = texture2D(tColor, uv).rgb;
          gl_FragDepth = texture2D(tDepth, uv).r;
          // subtle grade
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          if (uUnder > 0.0) {
            c = mix(c, c * vec3(0.55, 0.95, 1.05), uUnder * 0.6);
          }
          c += vec3(0.6, 0.65, 0.8) * uFlash * 0.25;
          vec2 q = vUv - 0.5;
          float vig = 1.0 - dot(q, q) * (0.55 + uUnder * 0.6);
          c *= vig;
          c = mix(c, c * vec3(1.4, 0.35, 0.3), uDamage * smoothstep(0.15, 0.5, length(q)));
          c *= 1.0 - uSleep;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: true,
    });
    // Note: depthTest must be enabled for gl_FragDepth writes to land; use ALWAYS
    this.copyMat.depthTest = true;
    this.copyMat.depthFunc = THREE.AlwaysDepth;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.copyQuad = new THREE.Mesh(tri, this.copyMat);
    this.copyQuad.frustumCulled = false;
    this.copyScene = new THREE.Scene();
    this.copyScene.add(this.copyQuad);
    this.copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  createTargets() {
    if (this.rt) { this.rt.dispose(); this.rt.depthTexture.dispose(); }
    const dt = new THREE.DepthTexture(1, 1);
    dt.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthTexture: dt,
      samples: this.q.msaa,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    if (this.copyMat) {
      this.copyMat.uniforms.tColor.value = this.rt.texture;
      this.copyMat.uniforms.tDepth.value = this.rt.depthTexture;
    }
  }

  setQuality(id) {
    this.q = QUALITY[id];
    this.createTargets();
    this.resize(this.size.x, this.size.y);
  }

  resize(w, h) {
    this.size.set(w, h);
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    const rw = Math.max(2, Math.floor(w * pr)), rh = Math.max(2, Math.floor(h * pr));
    this.renderSize.set(rw, rh);
    this.rt.setSize(rw, rh);
  }

  // adaptive resolution
  trackFrame(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.adaptTimer += dt;
    if (this.adaptTimer < 2) return;
    this.adaptTimer = 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length * 0.6)];
    let s = this.scale;
    if (med > 1 / 40) s = Math.max(this.q.minScale, s - 0.1);
    else if (med < 1 / 56) s = Math.min(1, s + 0.05);
    if (Math.abs(s - this.scale) > 0.01) {
      this.scale = s;
      this.resize(this.size.x, this.size.y);
    }
  }

  render(scene, camera, dt) {
    const r = this.renderer;
    this.time += dt;
    this.copyMat.uniforms.uTime.value = this.time;
    // pass 1
    camera.layers.set(0);
    r.setRenderTarget(this.rt);
    r.autoClear = true;
    r.render(scene, camera);
    // pass 2
    r.setRenderTarget(null);
    r.autoClear = false;
    r.clear(true, true, false);
    r.render(this.copyScene, this.copyCam);
    camera.layers.set(1);
    const su = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    const bg = scene.background;
    scene.background = null;
    r.render(scene, camera);
    scene.background = bg;
    r.shadowMap.autoUpdate = su;
    r.autoClear = true;
    camera.layers.set(0);
  }
}
