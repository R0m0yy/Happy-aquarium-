// Shared shader patches injected into stock PBR materials:
//  - animated sun caustics on anything below the waterline
//  - underwater light falloff when the camera is submerged
//  - wet-sand darkening along the swash line
//  - wind sway for foliage (height-weighted, per-instance phase)
//  - camera-occlusion dithering so foliage never hides the survivor
import * as THREE from 'three';
import { GLSL_NOISE } from '../util/math.js';

export const SHARED = {
  uTime: { value: 0 },
  uWaterLevel: { value: 0 },
  uCaustics: { value: 1 },
  uCamUnder: { value: 0 },
  uLightDirW: { value: new THREE.Vector3(0, 1, 0) },
  uWind: { value: new THREE.Vector3(0.8, 0.6, 0.3) }, // dir.xy, strength
  uWetLine: { value: 0.6 },
  uFocus: { value: new THREE.Vector3() }, // survivor position (occlusion fade)
  uCamPos: { value: new THREE.Vector3() },
  uFadeOn: { value: 1 },
  uAbsorbW: { value: new THREE.Vector3(0.42, 0.075, 0.052) },
};

const COMMON_VS = /* glsl */`
varying vec3 vWPos;
uniform float uTime;
uniform vec3 uWind;
`;

/**
 * opts: { caustics, wet, wind: 0..1 (sway amount), windMode: 'tree'|'plant'|'grass', fade, underwaterTint }
 */
export function patchMaterial(mat, opts = {}) {
  const o = { caustics: true, wet: false, wind: 0, windMode: 'plant', fade: false, ...opts };
  mat.customProgramCacheKey = () => JSON.stringify(o) + mat.type;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED);
    shader.vertexShader = COMMON_VS + shader.vertexShader;
    let windCode = '';
    if (o.wind > 0) {
      windCode = /* glsl */`
      {
        vec3 wpos0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #ifdef USE_INSTANCING
          vec3 inst = instanceMatrix[3].xyz;
        #else
          vec3 inst = modelMatrix[3].xyz;
        #endif
        float ph = dot(inst.xz, vec2(0.37, 0.71));
        float hgt = max(transformed.y, 0.0);
        float str = uWind.z * ${o.wind.toFixed(3)};
        ${o.windMode === 'tree'
          ? `float bend = pow(hgt * 0.12, 1.6) * (0.35 + 0.65 * sin(uTime * 0.9 + ph)) * str * 0.35;
             float flutter = sin(uTime * 4.0 + transformed.x * 2.1 + transformed.z * 1.7 + ph) * 0.05 * str * smoothstep(3.0, 8.0, hgt);`
          : o.windMode === 'grass'
          ? `float bend = hgt * hgt * (0.5 + 0.5 * sin(uTime * 2.2 + ph + wpos0.x * 0.4)) * str * 0.5;
             float flutter = 0.0;`
          : `float bend = hgt * (0.4 + 0.6 * sin(uTime * 1.7 + ph)) * str * 0.14;
             float flutter = sin(uTime * 5.0 + transformed.x * 3.0 + ph) * 0.03 * str * hgt;`}
        transformed.x += uWind.x * bend + flutter;
        transformed.z += uWind.y * bend + flutter * 0.6;
        transformed.y += flutter * 0.4;
      }`;
    }
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' + windCode
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      /* glsl */`#include <worldpos_vertex>
      {
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = (modelMatrix * wp4).xyz;
      }`
    );
    shader.fragmentShader = /* glsl */`
      varying vec3 vWPos;
      uniform float uTime, uWaterLevel, uCaustics, uCamUnder, uWetLine, uFadeOn;
      uniform vec3 uLightDirW, uFocus, uCamPos, uAbsorbW;
      ${GLSL_NOISE}
    ` + shader.fragmentShader;

    if (o.fade) {
      // screen-door fade where geometry sits between camera and survivor
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        /* glsl */`#include <clipping_planes_fragment>
        if (uFadeOn > 0.5) {
          vec3 toF = uFocus + vec3(0.0, 0.9, 0.0) - uCamPos;
          float L = length(toF);
          vec3 dirF = toF / L;
          vec3 rel = vWPos - uCamPos;
          float along = dot(rel, dirF);
          float perp = length(rel - dirF * along);
          float occl = step(1.5, L - along) * step(0.0, along) * (1.0 - smoothstep(1.4, 3.6, perp));
          if (occl > 0.0) {
            float pat = hash12(floor(gl_FragCoord.xy));
            if (pat < occl * 0.82) discard;
          }
        }`
      );
    }
    if (o.wet) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */`#include <roughnessmap_fragment>
        float wetK = 1.0 - smoothstep(uWetLine - 0.05, uWetLine + 0.35, vWPos.y);
        wetK *= step(uWaterLevel - 6.0, vWPos.y);
        diffuseColor.rgb *= mix(1.0, 0.62, wetK);
        roughnessFactor = mix(roughnessFactor, 0.5, wetK * step(uWaterLevel - 0.05, vWPos.y));`
      );
    }
    if (o.caustics) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */`
        {
          float depthW = uWaterLevel - vWPos.y;
          if (depthW > 0.0) {
            // refracted sun projected onto the seabed
            vec2 cp = vWPos.xz * 0.85 + uLightDirW.xz * depthW * 0.3;
            float ca = caustics(cp, uTime * 1.1);
            float fade = smoothstep(0.0, 0.5, depthW) * exp(-depthW * 0.06);
            float facing = clamp(inverseTransformDirection(normal, viewMatrix).y * 0.6 + 0.4, 0.0, 1.0);
            outgoingLight += diffuseColor.rgb * ca * fade * uCaustics * facing * 0.38;
            if (uCamUnder > 0.5) {
              // light lost on its way down from the surface
              outgoingLight *= exp(-uAbsorbW * depthW * 0.55);
            }
          }
        }
        #include <opaque_fragment>`
      );
    }
    mat.userData.shader = shader;
  };
  return mat;
}
