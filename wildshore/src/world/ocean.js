// Signature ocean: Gerstner swell + chop (GPU & CPU in sync), refraction of the
// already-rendered seabed through the opaque scene buffer, physically inspired
// per-channel absorption, depth-tinted scattering, sun glints, Fresnel sky reflection,
// shoreline foam, swash run-up, rain rings and an underwater (Snell's window) view.
import * as THREE from 'three';
import { GLSL_NOISE } from '../util/math.js';
import { terrainHeight } from './islands.js';
import { loadTexture } from '../render/textures.js';

const G = 9.81;
// [dirAngle, wavelength, amplitude, steepness]
const WAVES = [
  [0.65, 38, 0.32, 0.55],
  [0.25, 21, 0.17, 0.6],
  [1.1, 13, 0.1, 0.55],
  [-0.35, 8.5, 0.06, 0.5],
  [1.9, 5.2, 0.035, 0.45],
];
const NW = WAVES.length;
const wDir = [], wK = [], wW = [], wA = [], wQ = [];
for (const [a, L, A, Q] of WAVES) {
  wDir.push(new THREE.Vector2(Math.cos(a), Math.sin(a)));
  const k = (Math.PI * 2) / L;
  wK.push(k); wW.push(Math.sqrt(G * k)); wA.push(A); wQ.push(Q);
}

export class Ocean {
  constructor(renderer, env, quality) {
    this.env = env;
    this.time = 0;
    this.waveScale = 1;
    this.level = 0;
    const N = quality.oceanRes;
    this.geometry = this.buildGeometry(N, 1100);
    this.heightTex = buildHeightTexture(-1000, -1000, 2000, quality.hmRes);
    this.heightTexHi = buildHeightTexture(-200, -200, 400, quality.hmRes);
    this.normalTex = loadTexture('assets/textures/waternormals.jpg');
    const waveData = [];
    for (let i = 0; i < NW; i++) waveData.push(new THREE.Vector4(wDir[i].x, wDir[i].y, wK[i], wA[i]));
    this.uniforms = {
      uTime: { value: 0 },
      uWaves: { value: waveData },
      uSteep: { value: wQ },
      uWaveScale: { value: 1 },
      uLevel: { value: 0 },
      uSwash: { value: 1 },
      uHeight: { value: this.heightTex.texture },
      uHeightHi: { value: this.heightTexHi.texture },
      uHB: { value: new THREE.Vector4(-1000, -1000, 2000, 0) },
      uHBHi: { value: new THREE.Vector4(-200, -200, 400, 0) },
      uSceneColor: { value: null },
      uSceneDepth: { value: null },
      uNormalMap: { value: this.normalTex },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uNearFar: { value: new THREE.Vector2(0.1, 2000) },
      uSunDir: { value: env.sunDir },
      uLightDir: { value: env.lightDir },
      uSunColor: { value: env.sunColor },
      uLightColor: { value: env.lightColor },
      uLightI: { value: 1 },
      uZenith: { value: env.skyZenith },
      uHorizon: { value: env.skyHorizon },
      uFogColor: { value: env.fogColor },
      uFogDensity: { value: 0.001 },
      uDaylight: { value: 1 },
      uNight: { value: 0 },
      uRain: { value: 0 },
      uCloud: { value: 0 },
      uAbsorb: { value: new THREE.Vector3(0.42, 0.075, 0.052) },
      uShallowCol: { value: new THREE.Color(0x2fd3c6) },
      uDeepCol: { value: new THREE.Color(0x053a63) },
      uUnderwater: { value: 0 },
      uUnderCol: { value: new THREE.Color(0x0d6b78) },
      uFresh: { value: 0 },
      uRipples: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0)) },
      uDetail: { value: quality.waterDetail },
    };
    this.material = this.makeMaterial(this.uniforms);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.ripples = [];
  }

  makeMaterial(uniforms) {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: OCEAN_VS,
      fragmentShader: OCEAN_FS,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      fog: false,
    });
  }

  // a clear freshwater pool sharing the shader (no swell, green-ish tint)
  makePond(pond) {
    const u = THREE.UniformsUtils.clone(this.uniforms);
    // share live references
    for (const k of ['uTime', 'uSceneColor', 'uSceneDepth', 'uResolution', 'uInvProj', 'uCamWorld', 'uNearFar', 'uSunDir', 'uLightDir', 'uSunColor', 'uLightColor', 'uLightI', 'uZenith', 'uHorizon', 'uFogColor', 'uFogDensity', 'uDaylight', 'uNight', 'uRain', 'uCloud', 'uUnderwater', 'uRipples', 'uDetail', 'uHeight', 'uHeightHi', 'uNormalMap']) u[k] = this.uniforms[k];
    u.uWaveScale = { value: 0 };
    u.uSwash = { value: 0 };
    u.uLevel = { value: pond.level };
    u.uFresh = { value: 1 };
    u.uAbsorb = { value: new THREE.Vector3(0.6, 0.22, 0.3) };
    u.uShallowCol = { value: new THREE.Color(0x6aa877) };
    u.uDeepCol = { value: new THREE.Color(0x1b3f2c) };
    const geo = new THREE.CircleGeometry(pond.r * 1.6, 40);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, this.makeMaterial(u));
    m.position.set(pond.x, pond.level, pond.z);
    m.renderOrder = 1;
    return m;
  }

  buildGeometry(N, extent) {
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const du = 2 / N;
    const c = 0.55 / (extent * du);
    const f = (u) => Math.sign(u) * extent * (c * Math.abs(u) + (1 - c) * Math.pow(Math.abs(u), 3.2));
    let p = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      pos[p++] = f(-1 + i * du); pos[p++] = 0; pos[p++] = f(-1 + j * du);
    }
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  addRipple(x, z, strength = 1) {
    this.ripples.push({ x, z, t0: this.time, s: strength });
    if (this.ripples.length > 8) this.ripples.shift();
  }

  // CPU wave sampling (matches the vertex shader)
  displacement(x, z, t, out, depthAtt = 1) {
    let dx = 0, dy = 0, dz = 0;
    const s = this.waveScale * depthAtt;
    for (let i = 0; i < NW; i++) {
      const d = wDir[i];
      const th = wK[i] * (d.x * x + d.y * z) - wW[i] * t;
      const A = wA[i] * s;
      const c = Math.cos(th), sn = Math.sin(th);
      dx += wQ[i] * A * d.x * c;
      dz += wQ[i] * A * d.y * c;
      dy += A * sn;
    }
    out.x = dx; out.y = dy; out.z = dz;
    return out;
  }

  depthAtt(x, z) {
    const depth = this.level - terrainHeight(x, z);
    return Math.min(1, Math.max(0.06, depth / 7));
  }

  heightAt(x, z, t = this.time) {
    const att = this.depthAtt(x, z);
    const o = this._o || (this._o = { x: 0, y: 0, z: 0 });
    let px = x, pz = z;
    for (let i = 0; i < 2; i++) {
      this.displacement(px, pz, t, o, att);
      px = x - o.x; pz = z - o.z;
    }
    this.displacement(px, pz, t, o, att);
    return this.level + o.y + this.swash(x, z, t);
  }

  swash(x, z, t) {
    const depth = this.level - terrainHeight(x, z);
    if (depth > 3.5 || depth < -1) return 0;
    const sh = 1 - Math.min(1, Math.max(0, depth / 3.5));
    return Math.sin(t * 0.9 - depth * 1.6) * 0.14 * sh * Math.min(1.6, this.waveScale);
  }

  normalAt(x, z, out) {
    const e = 0.6;
    const h = this.heightAt(x, z), hx = this.heightAt(x + e, z), hz = this.heightAt(x, z + e);
    out.set(h - hx, e, h - hz).normalize();
    return out;
  }

  update(dt, camera, sceneRT, renderSize, env, underwater) {
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    this.waveScale = env.w.waves;
    u.uWaveScale.value = this.waveScale;
    u.uSceneColor.value = sceneRT.texture;
    u.uSceneDepth.value = sceneRT.depthTexture;
    u.uResolution.value.copy(renderSize);
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uNearFar.value.set(camera.near, camera.far);
    u.uLightI.value = env.lightIntensity;
    u.uFogDensity.value = env.fogDensity;
    u.uDaylight.value = env.daylight;
    u.uNight.value = env.night;
    u.uRain.value = env.w.rain;
    u.uCloud.value = env.w.cloud;
    u.uUnderwater.value = underwater ? 1 : 0;
    for (let i = 0; i < 8; i++) {
      const r = this.ripples[i];
      if (r) u.uRipples.value[i].set(r.x, r.z, r.t0, r.s);
      else u.uRipples.value[i].set(0, 0, -100, 0);
    }
    // follow camera (snapped)
    const s = 2.0;
    this.mesh.position.set(Math.round(camera.position.x / s) * s, 0, Math.round(camera.position.z / s) * s);
  }
}

function buildHeightTexture(x0, z0, size, res) {
  const data = new Uint16Array(res * res);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < res; j++) {
    const z = z0 + ((j + 0.5) / res) * size;
    for (let i = 0; i < res; i++) {
      const x = x0 + ((i + 0.5) / res) * size;
      data[j * res + i] = toHalf(terrainHeight(x, z));
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { texture: tex };
}

const OCEAN_VS = /* glsl */`
#define NW ${NW}
uniform float uTime, uWaveScale, uLevel, uSwash;
uniform vec4 uWaves[NW];
uniform float uSteep[NW];
uniform sampler2D uHeight, uHeightHi;
uniform vec4 uHB, uHBHi;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vDepth;
varying float vCrest;
varying vec4 vClip;
varying float vViewZ;

float seabed(vec2 p){
  vec2 uvh = (p - uHBHi.xy) / uHBHi.z;
  if (uvh.x > 0.0 && uvh.x < 1.0 && uvh.y > 0.0 && uvh.y < 1.0) return texture2D(uHeightHi, uvh).r;
  return texture2D(uHeight, (p - uHB.xy) / uHB.z).r;
}
void main(){
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  float ground = seabed(wp.xz);
  float depth = uLevel - ground;
  float att = clamp(depth / 7.0, 0.06, 1.0) * uWaveScale;
  vec3 disp = vec3(0.0);
  vec3 tx = vec3(1.0, 0.0, 0.0), tz = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;
  for (int i = 0; i < NW; i++) {
    vec4 w = uWaves[i];
    float k = w.z;
    float om = sqrt(9.81 * k);
    float A = w.w * att;
    float Q = uSteep[i];
    float th = k * dot(w.xy, wp.xz) - om * uTime;
    float c = cos(th), s = sin(th);
    disp.x += Q * A * w.x * c;
    disp.z += Q * A * w.y * c;
    disp.y += A * s;
    // analytic tangents
    tx += vec3(-Q*A*k*w.x*w.x*s, A*k*w.x*c, -Q*A*k*w.x*w.y*s);
    tz += vec3(-Q*A*k*w.x*w.y*s, A*k*w.y*c, -Q*A*k*w.y*w.y*s);
    crest += max(s, 0.0) * A * k * Q;
  }
  // swash run-up near beaches
  float sh = 1.0 - clamp(depth / 3.5, 0.0, 1.0);
  float runup = sin(uTime * 0.9 - depth * 1.6) * 0.14 * sh * min(1.6, uWaveScale) * uSwash * step(-1.0, depth);
  disp.y += runup;
  wp += disp;
  wp.y += uLevel - (modelMatrix * vec4(0.0,0.0,0.0,1.0)).y;
  vWorld = wp;
  vNormalW = normalize(cross(tz, tx));
  vDepth = depth;
  vCrest = crest;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
  vClip = gl_Position;
}`;

const OCEAN_FS = /* glsl */`
#include <packing>
uniform float uTime, uWaveScale, uLevel, uSwash, uLightI, uFogDensity, uDaylight, uNight, uRain, uCloud, uUnderwater, uFresh, uDetail;
uniform sampler2D uSceneColor, uSceneDepth, uNormalMap;
uniform vec2 uResolution, uNearFar;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uSunDir, uLightDir, uSunColor, uLightColor, uZenith, uHorizon, uFogColor, uAbsorb, uShallowCol, uDeepCol, uUnderCol;
uniform vec4 uRipples[8];
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vDepth;
varying float vCrest;
varying vec4 vClip;
varying float vViewZ;
${GLSL_NOISE}

vec3 skyColor(vec3 d){
  float h = max(d.y, 0.0);
  vec3 c = mix(uZenith, uHorizon, pow(1.0 - h, 3.0));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunColor * pow(sd, 10.0) * 0.4 * (1.0 - uCloud * 0.6);
  c = mix(c, vec3(dot(c, vec3(0.33))), uCloud * 0.3);
  return c;
}
float viewZAt(vec2 uv){
  float d = texture2D(uSceneDepth, uv).r;
  return -perspectiveDepthToViewZ(d, uNearFar.x, uNearFar.y);
}
vec3 worldAt(vec2 uv){
  float d = texture2D(uSceneDepth, uv).r;
  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * ndc; v /= v.w;
  return (uCamWorld * v).xyz;
}
void main(){
  vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  // ---- normals: geometric + two scrolling detail layers + rain rings + ripples
  vec2 p = vWorld.xz;
  float detailFade = 1.0 - smoothstep(60.0, 260.0, dist);
  vec3 n1 = texture2D(uNormalMap, p * 0.045 + vec2(uTime * 0.012, uTime * 0.008)).xzy * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormalMap, p * 0.11 - vec2(uTime * 0.018, -uTime * 0.011)).xzy * 2.0 - 1.0;
  vec3 n3 = texture2D(uNormalMap, p * 0.37 + vec2(-uTime * 0.03, uTime * 0.025)).xzy * 2.0 - 1.0;
  float chop = (0.35 + 0.35 * uWaveScale) * (uFresh > 0.5 ? 0.25 : 1.0);
  vec3 N = normalize(vNormalW + (n1 * 0.55 + n2 * 0.45 + n3 * 0.35 * uDetail) * vec3(1.0, 0.0, 1.0) * chop * detailFade);
  // rain impact rings
  if (uRain > 0.01) {
    vec2 rp = p * 1.6;
    vec2 cell = floor(rp); vec2 f = fract(rp) - 0.5;
    float h = hash12(cell);
    float ph = fract(uTime * 1.3 + h);
    float r = length(f - (hash22(cell) - 0.5) * 0.4);
    float ring = sin((r - ph * 0.5) * 60.0) * smoothstep(0.5, 0.0, r) * (1.0 - ph) * step(h, uRain);
    N = normalize(N + vec3(f.x, 0.0, f.y) * ring * 0.9 * detailFade);
  }
  // interaction ripples
  for (int i = 0; i < 8; i++) {
    vec4 R = uRipples[i];
    float age = uTime - R.z;
    if (age > 0.0 && age < 3.0) {
      vec2 dvec = p - R.xy; float d = length(dvec);
      float front = age * 2.2;
      float w = sin((d - front) * 7.0) * exp(-abs(d - front) * 2.0) * (1.0 - age / 3.0) * R.w;
      N = normalize(N + vec3(dvec.x, 0.0, dvec.y) / max(d, 0.01) * w * 0.5);
    }
  }
  bool below = uUnderwater > 0.5 && !gl_FrontFacing;
  if (below || (uUnderwater > 0.5)) {
    // ---- seen from underneath: Snell's window + total internal reflection
    vec3 Nu = -N;
    vec3 I = -V;
    vec3 T = refract(I, Nu, 1.33);
    vec3 col;
    if (dot(T, T) < 0.001) {
      col = uUnderCol * (0.25 + 0.6 * uDaylight);
    } else {
      col = skyColor(normalize(T)) * 1.4 + uSunColor * pow(max(dot(normalize(T), uSunDir), 0.0), 60.0) * 3.0 * uDaylight;
      col = mix(col, uUnderCol * 0.6, 0.35);
    }
    float fog = 1.0 - exp(-dist * 0.07);
    col = mix(col, uUnderCol * (0.15 + 0.6 * uDaylight), fog);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  // ---- refraction
  float sceneZ = viewZAt(suv);
  float thickRaw = max(sceneZ - vViewZ, 0.0);
  vec2 offs = N.xz * 0.045 * clamp(thickRaw / 2.0, 0.0, 1.0) * (1.0 - smoothstep(30.0, 200.0, dist));
  vec2 ruv = clamp(suv + offs, vec2(0.001), vec2(0.999));
  float rz = viewZAt(ruv);
  if (rz < vViewZ) { ruv = suv; rz = sceneZ; }
  vec3 under = texture2D(uSceneColor, ruv).rgb;
  vec3 bottom = worldAt(ruv);
  float thick = max(rz - vViewZ, 0.0) * length(vec3((ruv*2.0-1.0), 1.0)) * 0.8;
  float vdepth = clamp(uLevel - bottom.y, 0.0, 60.0);
  if (rz > uNearFar.y * 0.98) { thick = 80.0; vdepth = 40.0; }
  // light travels down to the object then up to the eye
  vec3 T = exp(-uAbsorb * (thick + vdepth * 0.9));
  // scattering colour: bright turquoise over shallows, deep sapphire offshore
  float deepK = smoothstep(1.0, 22.0, vDepth);
  vec3 scatter = mix(uShallowCol, uDeepCol, deepK);
  float lightAmt = uLightI * 0.32 * (0.55 + 0.45 * max(uLightDir.y, 0.0)) + 0.06 + uDaylight * 0.12;
  vec3 inscatter = scatter * lightAmt;
  // subsurface glow through steep wave crests facing the sun
  float sss = pow(max(dot(V, -uSunDir + N * 0.6), 0.0), 3.0) * clamp(vCrest * 2.0, 0.0, 1.0) * uDaylight;
  inscatter += uShallowCol * sss * 0.6;
  vec3 water = under * T + inscatter * (1.0 - T);

  // ---- reflection
  vec3 Rv = reflect(-V, N);
  Rv.y = abs(Rv.y);
  vec3 refl = skyColor(Rv);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  fres = clamp(fres, 0.0, 1.0) * (0.9 - 0.25 * uFresh);
  vec3 col = mix(water, refl, fres);

  // ---- sun / moon glints
  vec3 H = normalize(uLightDir + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 1200.0) * 6.0 + pow(nh, 180.0) * 0.35;
  float sparkle = step(0.992, hash12(floor(p * 9.0) + floor(uTime * 6.0))) * pow(nh, 80.0) * 3.0 * uDetail;
  col += uLightColor * (spec + sparkle) * uLightI * 0.35 * (1.0 - uCloud * 0.7);

  // ---- foam
  float foam = 0.0;
  if (uFresh < 0.5) {
    // contact foam where water is thin over the seabed / rocks
    float fn = fbm(p * 0.9 + vec2(uTime * 0.15, -uTime * 0.1));
    float lace = smoothstep(0.42, 0.62, fbm(p * 3.2 + vec2(uTime * 0.3, uTime * 0.2)));
    float edge = 1.0 - smoothstep(0.0, 0.025 + fn * 0.09, thickRaw);
    float edge2 = (1.0 - smoothstep(0.0, 0.18 + fn * 0.2, thickRaw)) * lace;
    foam += edge * 0.8 + edge2 * 0.55;
    // rolling surf lines over shallow sand
    if (vDepth < 2.8 && vDepth > -0.5) {
      float wave = sin(vDepth * 3.4 - uTime * 0.9 * 1.0 + fn * 2.2);
      float band = smoothstep(0.9, 0.99, wave) * (1.0 - smoothstep(0.3, 2.2, vDepth));
      foam += band * smoothstep(0.45, 0.7, fbm(p * 1.3 - uTime * 0.2)) * 0.8 * min(1.4, uWaveScale + 0.2);
    }
    // whitecaps on steep crests (storms)
    foam += smoothstep(0.32, 0.55, vCrest * (0.6 + 0.6 * fn)) * smoothstep(1.0, 1.6, uWaveScale) * 0.9;
    foam = clamp(foam, 0.0, 1.0);
    float bubbles = smoothstep(0.4, 0.7, vnoise(p * 6.0 + uTime));
    foam *= 0.65 + 0.35 * bubbles;
  }
  vec3 foamCol = vec3(0.95, 0.98, 1.0) * (uLightI * 0.28 + 0.12 + uDaylight * 0.2);
  col = mix(col, foamCol, foam * 0.75);

  // ---- atmospheric fog
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
