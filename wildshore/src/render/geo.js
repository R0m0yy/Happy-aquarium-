// Geometry construction helpers for procedural assets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise3 } from '../util/math.js';

export { mergeGeometries };

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3();

// Ensure a geometry has the attribute set used by all merged assets
export function normalizeAttrs(g, color = null) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3);
    const col = color || new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

export function merge(list) {
  const g = mergeGeometries(list.map((x) => normalizeAttrs(x)), false);
  g.computeBoundingSphere();
  return g;
}

export function tint(g, color, jitter = 0, rng = Math.random) {
  const c = g.attributes.color;
  for (let i = 0; i < c.count; i++) {
    const j = 1 + (rng() - 0.5) * jitter;
    c.setXYZ(i, c.getX(i) * color.r * j, c.getY(i) * color.g * j, c.getZ(i) * color.b * j);
  }
  return g;
}

/**
 * Tube along a sampled path.
 * pathFn(t) -> Vector3, radiusFn(t) -> number, colorFn(t, a) -> Color (optional)
 */
export function tube(pathFn, radiusFn, { segs = 12, radial = 7, vScale = 1, colorFn = null, capEnd = true, wobble = 0 } = {}) {
  const pts = [];
  for (let i = 0; i <= segs; i++) pts.push(pathFn(i / segs).clone());
  // parallel transport frames
  const tangents = [], normals = [], binormals = [];
  for (let i = 0; i <= segs; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(segs, i + 1)];
    tangents.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  let n0 = new THREE.Vector3(0, 0, 1);
  if (Math.abs(tangents[0].z) > 0.9) n0.set(1, 0, 0);
  n0 = new THREE.Vector3().crossVectors(tangents[0], n0).normalize();
  normals.push(n0);
  binormals.push(new THREE.Vector3().crossVectors(tangents[0], n0));
  for (let i = 1; i <= segs; i++) {
    const n = normals[i - 1].clone();
    const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
    if (axis.length() > 1e-6) {
      axis.normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
      n.applyAxisAngle(axis, ang);
    }
    normals.push(n);
    binormals.push(new THREE.Vector3().crossVectors(tangents[i], n));
  }
  const pos = [], nor = [], uv = [], col = [], idx = [];
  let len = 0;
  for (let i = 0; i <= segs; i++) {
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    const t = i / segs;
    const r = radiusFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      _n.copy(normals[i]).multiplyScalar(ca).addScaledVector(binormals[i], sa);
      let rr = r;
      if (wobble) rr *= 1 + wobble * noise3(pts[i].x * 3 + ca, pts[i].y * 3, pts[i].z * 3 + sa);
      _v.copy(pts[i]).addScaledVector(_n, rr);
      pos.push(_v.x, _v.y, _v.z);
      nor.push(_n.x, _n.y, _n.z);
      uv.push(j / radial, len * vScale);
      const c = colorFn ? colorFn(t, a) : null;
      if (c) col.push(c.r, c.g, c.b); else col.push(1, 1, 1);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  if (capEnd) {
    const end = pts[segs], base = pos.length / 3;
    pos.push(end.x, end.y, end.z); nor.push(tangents[segs].x, tangents[segs].y, tangents[segs].z); uv.push(0.5, len * vScale);
    const c = colorFn ? colorFn(1, 0) : null;
    if (c) col.push(c.r * 1.2, c.g * 1.15, c.b * 1.1); else col.push(1, 1, 1);
    const ring = segs * (radial + 1);
    for (let j = 0; j < radial; j++) idx.push(ring + j, base, ring + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Bent ribbon (frond / leaf / blade) along a path. Width direction is horizontal-ish side vector.
 * fold > 0 lowers the edges (V-shaped leaf).
 */
export function ribbon(pathFn, widthFn, { segs = 8, fold = 0, side = null, colorFn = null, uvFlip = false } = {}) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = pathFn(t);
    const p2 = pathFn(Math.min(1, t + 0.01)), p1 = pathFn(Math.max(0, t - 0.01));
    _t.subVectors(p2, p1).normalize();
    if (side) _b.copy(side); else _b.crossVectors(_t, up);
    if (_b.lengthSq() < 1e-6) _b.set(1, 0, 0);
    _b.normalize();
    _n.crossVectors(_b, _t).normalize();
    if (_n.y < 0) _n.negate();
    const w = widthFn(t);
    const c = colorFn ? colorFn(t) : null;
    for (let k = 0; k < 3; k++) {
      const s = k - 1; // -1,0,1
      _v.copy(p).addScaledVector(_b, s * w * 0.5);
      _v.y -= Math.abs(s) * fold * w * 0.5;
      pos.push(_v.x, _v.y, _v.z);
      // bent normal for the fold
      const nn = _n.clone().addScaledVector(_b, -s * fold * 0.6).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push(uvFlip ? t : k / 2, uvFlip ? k / 2 : 1 - t);
      if (c) col.push(c.r, c.g, c.b); else col.push(1, 1, 1);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  // make the winding agree with the (upward) shading normals so front faces are lit
  {
    const P = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    const fn = new THREE.Vector3().crossVectors(P(3).sub(P(0)), P(1).sub(P(0)));
    const nn = new THREE.Vector3(nor[3], nor[4], nor[5]);
    if (fn.dot(nn) < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// A camera-agnostic foliage card (quad) with normals bent outwards from `center` for volumetric shading
export function card(center, pos, size, rot, color, normalCenter) {
  let g = new THREE.PlaneGeometry(size, size);
  const m = new THREE.Matrix4().makeRotationFromEuler(rot);
  g.applyMatrix4(m);
  g.translate(pos.x, pos.y, pos.z);
  const p = g.attributes.position, n = g.attributes.normal;
  const nc = normalCenter || center;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(nc).normalize();
    _v.y = _v.y * 0.6 + 0.4;
    _v.normalize();
    n.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g = normalizeAttrs(g, color);
  return g;
}

// noise-displaced rock blob
export function rockGeometry(rng, { detail = 3, sx = 1, sy = 0.7, sz = 1, rough = 0.35, seed = 0, flatBottom = true, color, moss = 0, palette } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const p = g.attributes.position;
  const s0 = seed * 13.7;
  for (let i = 0; i < p.count; i++) {
    _v.set(p.getX(i), p.getY(i), p.getZ(i));
    const n1 = noise3(_v.x * 1.3 + s0, _v.y * 1.3, _v.z * 1.3);
    const n2 = noise3(_v.x * 3.1, _v.y * 3.1 + s0, _v.z * 3.1);
    const n3 = noise3(_v.x * 7.0 + s0, _v.y * 7.0, _v.z * 7.0);
    // faceted look: quantise large-scale displacement a little
    const d = 1 + rough * (n1 * 0.7 + n2 * 0.25 + n3 * 0.08);
    _v.multiplyScalar(d);
    _v.x *= sx; _v.y *= sy; _v.z *= sz;
    if (flatBottom && _v.y < -0.25 * sy) _v.y = -0.25 * sy + (_v.y + 0.25 * sy) * 0.2;
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  // uv via box projection + colours
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3);
  const base = color || new THREE.Color(0x8a857b);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    if (ny > 0.6) { uv[i * 2] = x * 0.6; uv[i * 2 + 1] = z * 0.6; }
    else if (nx > 0.6) { uv[i * 2] = z * 0.6; uv[i * 2 + 1] = y * 0.6; }
    else { uv[i * 2] = x * 0.6; uv[i * 2 + 1] = y * 0.6; }
    const cav = noise3(x * 2.5 + s0, y * 2.5, z * 2.5);
    c.copy(base).multiplyScalar(0.82 + cav * 0.22);
    if (palette) c.lerp(palette, Math.max(0, noise3(x * 1.2, y * 1.2 + s0, z * 1.2)) * 0.6);
    if (moss > 0) {
      const top = Math.max(0, n.getY(i));
      c.lerp(new THREE.Color(0x4f6b2a), Math.min(1, Math.pow(top, 3) * moss * (0.6 + 0.4 * cav)));
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function lathe(points, segs = 12) {
  const g = new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), segs);
  return g;
}
