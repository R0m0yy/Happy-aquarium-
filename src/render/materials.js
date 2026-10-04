// Shader patches shared by everything that lives inside the aquarium:
// moving caustics, water depth tint, tank-light ambience, plant sway and the
// fish swimming deformation. One set of global uniforms drives them all.
import * as THREE from 'three';

export const TANK_UNIFORMS = {
  uTime: { value: 0 },
  uCaustic: { value: 0.75 },
  uCausticIter: { value: 4 },
  uCausticScale: { value: 1.4 },
  uTankLight: { value: 1.0 },
  uTankLightColor: { value: new THREE.Color(0xf2f7ff) },
  uTankAmbient: { value: 0.22 },
  uWaterColor: { value: new THREE.Color(0x1a6fa0) },
  uWaterFog: { value: 0.55 },
  uWaterTop: { value: 1.8 },
  uTankH: { value: 1.1 },
  uTankFrontZ: { value: 0 },
  uCloudy: { value: 0 },
  uSwayAmp: { value: 1 },
  uNightGlow: { value: 0 },
};

const CAUSTIC_GLSL = /* glsl */ `
uniform float uTime;
uniform float uCaustic;
uniform int uCausticIter;
uniform float uCausticScale;
uniform float uTankLight;
uniform vec3 uTankLightColor;
uniform float uTankAmbient;
uniform vec3 uWaterColor;
uniform float uWaterFog;
uniform float uWaterTop;
uniform float uTankH;
uniform float uTankFrontZ;
uniform float uCloudy;
varying vec3 vTankWorld;
varying vec3 vTankNormal;
float tankCaustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 6; n++) {
    if (n >= uCausticIter) break;
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= float(uCausticIter);
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.0);
}
`;

const TANK_FRAG = /* glsl */ `
{
  vec3 wp = vTankWorld;
  float up = clamp(vTankNormal.y * 0.65 + 0.35, 0.0, 1.0);
  float depth01 = clamp((uWaterTop - wp.y) / uTankH, 0.0, 1.0);
  float ca = tankCaustic(wp.xz * uCausticScale + vec2(wp.y * 0.35), uTime * 0.55);
  float ca2 = tankCaustic(wp.xz * uCausticScale * 0.7 + vec2(3.1, wp.y), uTime * 0.4 + 2.0);
  float caus = (ca * 0.65 + ca2 * 0.45) * up * (1.0 - depth01 * 0.45);
  outgoingLight += diffuseColor.rgb * uTankLightColor * caus * uCaustic * uTankLight * 0.9;
  outgoingLight += diffuseColor.rgb * uTankLightColor * uTankAmbient * (0.55 + 0.45 * (1.0 - depth01));
  float dist = max(0.0, uTankFrontZ - wp.z) * 0.9 + depth01 * 0.45;
  float fogF = 1.0 - exp(-dist * uWaterFog * (1.0 + uCloudy * 2.5));
  vec3 waterCol = uWaterColor * (0.25 + 0.75 * uTankLight) + vec3(0.18, 0.2, 0.12) * uCloudy;
  outgoingLight = mix(outgoingLight, waterCol, clamp(fogF * 0.6, 0.0, 0.85));
}
`;

const SWAY_VERT = /* glsl */ `
attribute float aSway;
uniform float uSwayAmp;
`;

const FISH_VERT_DECL = /* glsl */ `
attribute float aFlex;
uniform vec4 uSwim;   // phase, amplitude, wave number, turn bend
uniform vec4 uFish;   // noseX, length, flutter phase, flutter amp
uniform float uRoll;
`;

const FISH_VERT_BODY = /* glsl */ `
{
  float tt = clamp((uFish.x - transformed.x) / uFish.y, -0.2, 1.9);
  float env = 0.12 + tt * tt * 0.95;
  float ph = uSwim.x - tt * uSwim.z;
  float lat = uSwim.y * env * sin(ph) + uSwim.w * tt * tt;
  float flut = aFlex * uFish.w * sin(uFish.z + transformed.x * 18.0 + transformed.y * 11.0);
  transformed.z += lat + flut;
  transformed.y += aFlex * uFish.w * 0.35 * cos(uFish.z * 0.8 + transformed.x * 9.0);
  float dz = uSwim.y * (2.0 * tt * sin(ph) * 0.95 - env * cos(ph) * uSwim.z) / uFish.y;
  objectNormal = normalize(objectNormal + vec3(dz * objectNormal.z, 0.0, 0.0));
}
`;

/**
 * Patch a standard/physical material with aquarium effects.
 * opts: { tank: bool, sway: bool, fish: bool, fishUniforms, glow }
 */
export function patchMaterial(material, opts = {}) {
  const { tank = true, sway = false, fish = false } = opts;
  const key = `tank${+tank}sway${+sway}fish${+fish}`;
  material.userData.fxKey = key;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, TANK_UNIFORMS);
    if (fish) {
      shader.uniforms.uSwim = opts.fishUniforms.uSwim;
      shader.uniforms.uFish = opts.fishUniforms.uFish;
    }
    // vertex
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\nvarying vec3 vTankWorld;\nvarying vec3 vTankNormal;\n${sway ? SWAY_VERT + 'uniform float uTime;\n' : ''}${fish ? FISH_VERT_DECL : ''}`);
    if (fish) {
      // normal must be bent before normal transform; do deformation early
      vs = vs.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 transformed = vec3( position );\n' + FISH_VERT_BODY);
      vs = vs.replace('#include <begin_vertex>', '');
    }
    if (sway) {
      vs = vs.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 orgW = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
          float ph = dot(orgW.xz, vec2(3.1, 1.7)) + position.y * 2.5;
          float s = aSway * aSway * uSwayAmp;
          transformed.x += (sin(uTime * 0.9 + ph) * 0.045 + sin(uTime * 2.1 + ph * 1.7) * 0.012) * s;
          transformed.z += cos(uTime * 0.7 + ph * 1.3) * 0.03 * s;
        }`
      );
    }
    vs = vs.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vTankWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vTankNormal = normalize(mat3(modelMatrix) * objectNormal);`
    );
    shader.vertexShader = vs;
    // fragment
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\n${CAUSTIC_GLSL}`);
    if (tank) fs = fs.replace('#include <opaque_fragment>', `${TANK_FRAG}\n#include <opaque_fragment>`);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => key;
  return material;
}

export function tankStandard(params, opts) {
  return patchMaterial(new THREE.MeshStandardMaterial(params), opts);
}

// Glass: physical material whose alpha rises with fresnel and reflection brightness.
export function glassMaterial(envMap, { opacity = 0.06, tint = 0xdff4ff } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: tint,
    metalness: 0,
    roughness: 0.03,
    transparent: true,
    opacity,
    envMap,
    envMapIntensity: 1.6,
    specularIntensity: 1,
    ior: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      {
        vec3 vd = normalize(vViewPosition);
        float fr = pow(1.0 - abs(dot(normalize(normal), -vd)), 3.0);
        float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.a = clamp(opacity + fr * 0.55 + smoothstep(0.25, 1.2, lum) * 0.45, 0.0, 0.92);
      }`
    );
  };
  m.customProgramCacheKey = () => 'aquaGlass';
  return m;
}
