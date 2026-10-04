// WebGL renderer, post-processing and graphics quality management.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TANK_UNIFORMS } from './materials.js';
import { setMaxAnisotropy } from './textures.js';

export const QUALITY = {
  low: { pixelRatio: 0.85, shadows: false, shadowSize: 512, bloom: false, caustic: 2, bubbles: 60, particles: 70, antialias: false, tankShadow: false, envSize: 64 },
  medium: { pixelRatio: 1.25, shadows: true, shadowSize: 1024, bloom: true, caustic: 3, bubbles: 120, particles: 150, antialias: true, tankShadow: false, envSize: 128 },
  high: { pixelRatio: 1.75, shadows: true, shadowSize: 2048, bloom: true, caustic: 4, bubbles: 200, particles: 260, antialias: true, tankShadow: true, envSize: 128 },
  ultra: { pixelRatio: 2.25, shadows: true, shadowSize: 4096, bloom: true, caustic: 5, bubbles: 320, particles: 420, antialias: true, tankShadow: true, envSize: 256 },
};

export function detectQuality() {
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return cores >= 6 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export class Renderer {
  constructor(container) {
    this.container = container;
    this.qualityName = 'high';
    this.q = QUALITY.high;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false, alpha: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    r.domElement.id = 'gl';
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 80);

    const pmrem = new THREE.PMREMGenerator(r);
    this.pmrem = pmrem;
    this.defaultEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.defaultEnv;
    this.envTarget = null;

    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.38, 0.55, 0.86);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.outputPass);

    this.size = { w: 1, h: 1 };
    this.captureNext = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(name) {
    if (name === 'auto') name = detectQuality();
    this.qualityName = name;
    this.q = QUALITY[name] ?? QUALITY.high;
    const r = this.renderer;
    r.shadowMap.enabled = this.q.shadows;
    this.bloom.enabled = this.q.bloom;
    TANK_UNIFORMS.uCausticIter.value = this.q.caustic;
    this.scene.traverse((o) => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => (m.needsUpdate = true));
      }
    });
    this.resize();
    return name;
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.size = { w, h };
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.();
  }

  // Capture the furnished room into a cube map so glass and water reflect it.
  captureEnvironment(position, hide = []) {
    const size = this.q.envSize;
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.1, 40, rt);
    cubeCam.position.copy(position);
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevEnv = this.scene.environment;
    this.scene.environment = this.defaultEnv;
    const shadows = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    cubeCam.update(this.renderer, this.scene);
    this.renderer.shadowMap.autoUpdate = shadows;
    hide.forEach((o, i) => (o.visible = vis[i]));
    const env = this.pmrem.fromCubemap(rt.texture).texture;
    rt.dispose();
    if (this.envTarget && this.envTarget !== this.defaultEnv) this.envTarget.dispose();
    this.envTarget = env;
    this.scene.environment = prevEnv;
    return env;
  }

  render() {
    if (this.q.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.captureNext) {
      const cb = this.captureNext;
      this.captureNext = null;
      cb(this.renderer.domElement.toDataURL('image/jpeg', 0.92));
    }
  }

  capture() {
    return new Promise((resolve) => (this.captureNext = resolve));
  }
}
