// Builds chunked terrain meshes (islands + seabed) from the analytic height field.
import * as THREE from 'three';
import { ISLANDS, terrainHeight, HOME } from './islands.js';
import { fbm2, noise2, smoothstep, clamp, lerp } from '../util/math.js';
import { detailTexture } from '../render/textures.js';
import { patchMaterial } from '../render/materials.js';

const col = new THREE.Color();
const c2 = new THREE.Color();
const SAND = new THREE.Color(0xeee3c8);
const SAND_WARM = new THREE.Color(0xe6d2a6);
const SAND_UW = new THREE.Color(0xf2ead2);
const SEAGRASS_BED = new THREE.Color(0x6f7a45);
const SOIL = new THREE.Color(0x5b4a33);
const LITTER = new THREE.Color(0x6e5d3c);
const GRASS = new THREE.Color(0x5f7d31);
const GRASS_DRY = new THREE.Color(0x8d8a4a);
const MOSS = new THREE.Color(0x46612a);
const ROCK = new THREE.Color(0x7f7a70);
const BASALT = new THREE.Color(0x4c4946);
const MUD = new THREE.Color(0x5e4f3b);
const REEF_ROCK = new THREE.Color(0x9a8f7c);

function surfaceColor(x, z, h, ny, isl) {
  const n = fbm2(x * 0.05, z * 0.05, 3);
  const n2 = noise2(x * 0.21, z * 0.21);
  const rocky = isl && isl.rocky;
  const mangrove = isl && isl.mangrove;
  if (h < -0.6) {
    // seabed
    col.copy(SAND_UW).lerp(SAND, 0.3);
    const grass = smoothstep(0.15, 0.45, fbm2(x * 0.035 + 9, z * 0.035, 3)) * smoothstep(-0.8, -2.0, h) * smoothstep(-9, -4, h);
    col.lerp(SEAGRASS_BED, grass * 0.75);
    const reef = smoothstep(0.25, 0.6, noise2(x * 0.08 + 3, z * 0.08)) * smoothstep(-1.2, -2.5, h);
    col.lerp(REEF_ROCK, reef * 0.6);
    if (ny < 0.8) col.lerp(rocky ? BASALT : REEF_ROCK, smoothstep(0.8, 0.6, ny));
    if (mangrove) col.lerp(MUD, 0.45);
    col.multiplyScalar(0.92 + n2 * 0.06);
    return col;
  }
  // beach -> inland blend
  const inland = smoothstep(1.1, 2.6, h + n * 0.9);
  col.copy(SAND).lerp(SAND_WARM, smoothstep(0.4, 1.4, h) * 0.6 + n2 * 0.08);
  if (inland > 0) {
    c2.copy(LITTER).lerp(SOIL, smoothstep(-0.2, 0.4, n2));
    const g = smoothstep(-0.25, 0.35, fbm2(x * 0.07 + 3, z * 0.07, 3));
    c2.lerp(GRASS, g * 0.7);
    c2.lerp(GRASS_DRY, smoothstep(0.3, 0.7, n) * 0.4 * (1 - g));
    c2.lerp(MOSS, smoothstep(0.4, 0.9, -n2) * 0.3);
    col.lerp(c2, inland);
  }
  if (mangrove) col.lerp(MUD, smoothstep(1.6, 0.2, h) * 0.75 * (0.7 + 0.3 * n));
  // rock on steep or rocky regions
  let rock = smoothstep(0.82, 0.62, ny);
  if (isl && isl.id === 'home') {
    const L = HOME.lookout;
    const dl = Math.hypot(x - L.x, z - L.z);
    rock = Math.max(rock, smoothstep(L.r * 0.75, L.r * 0.25, dl) * smoothstep(0.1, 0.5, n2 + 0.3));
    rock = Math.max(rock, smoothstep(62, 92, x) * smoothstep(55, 25, Math.abs(z + 6)) * smoothstep(3, -0.5, h) * (0.5 + 0.5 * n2));
  }
  if (rocky) rock = Math.max(rock, smoothstep(2.0, 6.0, h) * (0.7 + 0.3 * n2), smoothstep(0.93, 0.8, ny));
  if (rock > 0) {
    c2.copy(rocky ? BASALT : ROCK).multiplyScalar(0.85 + n2 * 0.15);
    col.lerp(c2, clamp(rock, 0, 1));
  }
  return col;
}

export function islandOf(x, z) {
  let best = null, bd = Infinity;
  for (const i of ISLANDS) {
    const d = Math.hypot(x - i.x, z - i.z) / i.R;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function createTerrain(quality) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const detail = detailTexture();
  const mat = patchMaterial(new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
    bumpMap: detail,
    bumpScale: 0.45,
  }), { caustics: true, wet: true });
  // grain variation through the detail map
  mat.onBeforeCompile = ((orig) => (shader) => {
    orig(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */`#include <color_fragment>
      {
        vec4 dt = texture2D(bumpMap, vWPos.xz * 0.55);
        vec4 dtf = texture2D(bumpMap, vWPos.xz * 2.3);
        vec4 dt2 = texture2D(bumpMap, vWPos.xz * 0.013);
        diffuseColor.rgb *= 0.84 + dt.g * 0.14 + dtf.r * 0.1 + (dt2.g - 0.5) * 0.16;
        // sand ripples on the seabed
        float uw = smoothstep(-0.2, -1.2, vWPos.y);
        diffuseColor.rgb *= 1.0 - uw * (dt2.b * 0.06 + texture2D(bumpMap, vWPos.xz * 0.06).b * 0.07);
      }`
    );
  })(mat.onBeforeCompile);
  mat.customProgramCacheKey = () => 'terrain-v1';
  mat.userData.isTerrain = true;

  const chunks = [];
  for (const isl of ISLANDS) {
    const spacing = isl.id === 'home' ? quality.terrainHome : quality.terrainFar;
    const ext = isl.R * (isl.reef + 0.75) + 30;
    buildGrid(group, mat, isl.x - ext, isl.z - ext, ext * 2, ext * 2, spacing, isl, chunks);
  }
  // global sea floor
  const floor = buildFloor(quality);
  group.add(floor);
  return { group, material: mat, chunks };
}

function buildGrid(group, mat, x0, z0, w, d, spacing, isl, chunks) {
  const CH = 48; // cells per chunk side
  const nx = Math.ceil(w / spacing), nz = Math.ceil(d / spacing);
  for (let cz = 0; cz < nz; cz += CH) {
    for (let cx = 0; cx < nx; cx += CH) {
      const cw = Math.min(CH, nx - cx), cd = Math.min(CH, nz - cz);
      const geo = buildChunk(x0 + cx * spacing, z0 + cz * spacing, cw, cd, spacing, isl);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.castShadow = false;
      m.matrixAutoUpdate = false;
      group.add(m);
      chunks.push(m);
    }
  }
}

function buildChunk(x0, z0, cw, cd, s, isl) {
  const vx = cw + 1, vz = cd + 1;
  const pos = new Float32Array(vx * vz * 3);
  const nor = new Float32Array(vx * vz * 3);
  const colr = new Float32Array(vx * vz * 3);
  const uv = new Float32Array(vx * vz * 2);
  const hs = new Float32Array((vx + 2) * (vz + 2));
  let maxH = -Infinity;
  for (let j = -1; j <= vz; j++) for (let i = -1; i <= vx; i++) {
    const h = terrainHeight(x0 + i * s, z0 + j * s);
    hs[(j + 1) * (vx + 2) + (i + 1)] = h;
    if (h > maxH) maxH = h;
  }
  if (maxH < -27.5) return null;
  const H = (i, j) => hs[(j + 1) * (vx + 2) + (i + 1)];
  let p = 0, q = 0;
  const nrm = new THREE.Vector3();
  for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
    const x = x0 + i * s, z = z0 + j * s, h = H(i, j);
    pos[p] = x; pos[p + 1] = h; pos[p + 2] = z;
    nrm.set(H(i - 1, j) - H(i + 1, j), 2 * s, H(i, j - 1) - H(i, j + 1)).normalize();
    nor[p] = nrm.x; nor[p + 1] = nrm.y; nor[p + 2] = nrm.z;
    const c = surfaceColor(x, z, h, nrm.y, isl);
    colr[p] = c.r; colr[p + 1] = c.g; colr[p + 2] = c.b;
    uv[q++] = x * 0.25; uv[q++] = z * 0.25;
    p += 3;
  }
  const idx = [];
  for (let j = 0; j < cd; j++) for (let i = 0; i < cw; i++) {
    const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
    // skip cells that are entirely abyssal (covered by the sea floor mesh)
    if (pos[a * 3 + 1] < -28 && pos[b * 3 + 1] < -28 && pos[c * 3 + 1] < -28 && pos[d * 3 + 1] < -28) continue;
    if ((i + j) % 2) idx.push(a, c, b, b, c, d);
    else idx.push(a, c, d, a, d, b);
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function buildFloor(quality) {
  const N = 90, S = 2400;
  const g = new THREE.PlaneGeometry(S, S, N, N);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, Math.min(terrainHeight(x, z), -26) - 1.2);
    const n = noise2(x * 0.01, z * 0.01);
    colr[i * 3] = lerp(0.72, 0.8, n); colr[i * 3 + 1] = lerp(0.7, 0.76, n); colr[i * 3 + 2] = 0.62;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { caustics: true }));
  m.receiveShadow = false;
  m.matrixAutoUpdate = false;
  return m;
}
