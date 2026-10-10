// Procedural sky dome: day gradient, sun + moon discs, stars, drifting fbm clouds.
import * as THREE from 'three';
import { GLSL_NOISE } from '../util/math.js';

export function createSky(env) {
  const uniforms = {
    uSunDir: { value: env.sunDir },
    uMoonDir: { value: env.moonDir },
    uZenith: { value: env.skyZenith },
    uHorizon: { value: env.skyHorizon },
    uSunColor: { value: env.sunColor },
    uCloud: { value: 0.3 },
    uCloudDark: { value: 0 },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uSunColor;
      uniform float uCloud, uCloudDark, uNight, uTime, uFlash;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, -0.2);
        float k = pow(1.0 - max(h,0.0), 3.0);
        vec3 col = mix(uZenith, uHorizon, k);
        // below horizon: fade towards a darker sea-haze
        col = mix(col, uHorizon*0.7, smoothstep(0.0,-0.2,d.y));
        float sd = max(dot(d, uSunDir), 0.0);
        // mie glow + disc
        col += uSunColor * (pow(sd, 8.0)*0.35 + pow(sd, 64.0)*0.6) * (1.0 - uCloud*0.6);
        col += uSunColor * smoothstep(0.9994, 0.9997, sd) * 30.0 * (1.0 - uCloud*0.9);
        // stars
        if (uNight > 0.01 && d.y > 0.0) {
          vec3 sp = d * 220.0;
          vec2 cell = floor(sp.xz / (sp.y*0.02 + 1.0) );
          float s = hash12(cell);
          float tw = 0.6 + 0.4*sin(uTime*3.0 + s*80.0);
          float star = step(0.9965, s) * tw * smoothstep(0.0, 0.25, d.y);
          col += vec3(star) * uNight * (1.0 - uCloud);
          // milky haze band
          float band = exp(-pow(dot(d, normalize(vec3(0.4,0.6,-0.7)))*3.0, 2.0));
          col += vec3(0.05,0.06,0.09) * band * uNight * fbm(d.xz*6.0) * (1.0-uCloud);
        }
        // moon
        float md = dot(d, uMoonDir);
        float moon = smoothstep(0.99935, 0.99965, md);
        float crater = 0.8 + 0.2*fbm(d.xy*900.0);
        col = mix(col, vec3(0.95,0.95,0.88)*crater*1.6, moon * uNight * (1.0 - uCloud*0.85));
        col += vec3(0.5,0.6,0.8) * pow(max(md,0.0), 200.0) * 0.4 * uNight;
        // clouds on a virtual plane
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 1.4;
          uv += vec2(uTime*0.006, uTime*0.002);
          float n = fbm(uv*1.3) * 0.65 + fbm(uv*3.7 + 7.0) * 0.35;
          float cov = smoothstep(1.0 - uCloud*0.95 - 0.12, 1.15 - uCloud*0.55, n + uCloud*0.25);
          float lit = 0.75 + 0.25*smoothstep(0.3, 1.0, sd) ;
          vec3 cc = mix(uHorizon*1.1 + vec3(0.12), uSunColor*0.55 + uZenith*0.4, 0.5) * lit;
          cc = mix(cc, vec3(0.32,0.34,0.38)*(0.4+0.6*(1.0-uNight)), uCloudDark);
          cc += uSunColor * pow(sd, 12.0) * 0.5 * (1.0 - cov*0.5);
          col = mix(col, cc, cov * smoothstep(0.0, 0.12, d.y));
        }
        col += vec3(0.7,0.75,0.9) * uFlash;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
