// Floor navigation grid with A* path finding and path smoothing.
export class NavGrid {
  constructor(bounds, cell = 0.12) {
    this.b = bounds;
    this.cell = cell;
    this.w = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.h = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
  }

  toCell(x, z) {
    return [Math.floor((x - this.b.minX) / this.cell), Math.floor((z - this.b.minZ) / this.cell)];
  }
  toWorld(cx, cz) {
    return [this.b.minX + (cx + 0.5) * this.cell, this.b.minZ + (cz + 0.5) * this.cell];
  }
  inside(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h;
  }
  isBlocked(cx, cz) {
    return !this.inside(cx, cz) || this.blocked[cz * this.w + cx] === 1;
  }

  // obstacles: {x,z,r} circles or {minX,maxX,minZ,maxZ} boxes; pad = agent radius
  bake(obstacles, pad = 0.18) {
    this.blocked.fill(0);
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const [x, z] = this.toWorld(cx, cz);
      for (const o of obstacles) {
        if (o.r !== undefined) {
          if (Math.hypot(x - o.x, z - o.z) < o.r + pad) {
            this.blocked[cz * this.w + cx] = 1;
            break;
          }
        } else if (x > o.minX - pad && x < o.maxX + pad && z > o.minZ - pad && z < o.maxZ + pad) {
          this.blocked[cz * this.w + cx] = 1;
          break;
        }
      }
    }
  }

  isFree(x, z) {
    const [cx, cz] = this.toCell(x, z);
    return !this.isBlocked(cx, cz);
  }

  nearestFree(x, z) {
    const [cx, cz] = this.toCell(x, z);
    if (!this.isBlocked(cx, cz)) return [x, z];
    for (let r = 1; r < 30; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        if (!this.isBlocked(cx + dx, cz + dz)) return this.toWorld(cx + dx, cz + dz);
      }
    }
    return [x, z];
  }

  lineFree(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      if (!this.isFree(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  findPath(x0, z0, x1, z1) {
    [x0, z0] = this.nearestFree(x0, z0);
    [x1, z1] = this.nearestFree(x1, z1);
    if (this.lineFree(x0, z0, x1, z1)) return [[x1, z1]];
    const [sx, sz] = this.toCell(x0, z0);
    const [gx, gz] = this.toCell(x1, z1);
    const W = this.w, N = this.w * this.h;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open = [];
    const start = sz * W + sx, goal = gz * W + gx;
    g[start] = 0;
    f[start] = Math.hypot(gx - sx, gz - sz);
    open.push(start);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      closed[cur] = 1;
      const cx = cur % W, cz = (cur / W) | 0;
      for (const [dx, dz, cost] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (this.isBlocked(nx, nz)) continue;
        if (dx && dz && (this.isBlocked(cx + dx, cz) || this.isBlocked(cx, cz + dz))) continue;
        const ni = nz * W + nx;
        if (closed[ni]) continue;
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          f[ni] = ng + Math.hypot(gx - nx, gz - nz);
          came[ni] = cur;
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells = [];
    for (let c = goal; c !== -1 && c !== start; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.toWorld(c % W, (c / W) | 0));
    pts[pts.length - 1] = [x1, z1];
    // string-pull smoothing
    const out = [];
    let ax = x0, az = z0, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineFree(ax, az, pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      [ax, az] = pts[j];
      i = j + 1;
    }
    return out;
  }
}
