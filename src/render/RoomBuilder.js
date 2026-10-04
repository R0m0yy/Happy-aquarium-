// Builds the furnished room around the aquarium. Rebuilt whenever the room,
// its customisation options, or the tank size changes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOM_BY_ID, ROOM_OPTIONS } from '../data/items.js';
import {
  toTexture, woodTexture, plasterTexture, rugTexture, marbleTexture, concreteTexture, windowView, artworkTexture, posterTexture,
} from './textures.js';
import {
  makeSofa, makeCoffeeTable, makeFloorLamp, makePendant, makeTableLamp, makeSideTable, makeShelf, makeBooks, makeGlobeTerrarium,
  makeFrame, makeHouseplant, makeSupplies, makeCoralPiece, shadowAll, rbox,
} from './props.js';

export const BACK_Z = -3.0;
export const CEIL = 4.4;
export const CAB_H = 0.68;

export class RoomBuilder {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'room';
    scene.add(this.group);
    this.lamps = [];
    this.pendants = [];
    this.leds = [];
    this.obstacles = []; // {x,z,r} or {minX,maxX,minZ,maxZ}
    this.seats = [];
    this.viewMat = null;
  }

  clear() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.group.clear();
    this.lamps = [];
    this.pendants = [];
    this.leds = [];
    this.obstacles = [];
    this.seats = [];
    this.windowLights = [];
  }

  build(roomState, tankDims, tankX) {
    this.clear();
    const room = ROOM_BY_ID[roomState.id] ?? ROOM_BY_ID.apartment;
    const opt = roomState.options;
    const W = room.width;
    this.W = W;
    this.tankX = tankX;
    this.tankDims = tankDims;
    const left = -W / 2, right = W / 2;
    const front = 12;
    this.bounds = { minX: left + 0.35, maxX: right - 0.35, minZ: BACK_Z + 0.3, maxZ: 4.2 };

    // ------------------------------------------------------------ floor
    const floorStyle = opt.floor === 'default' ? room.floor : opt.floor;
    let floorTex, floorRough = 0.68;
    if (floorStyle === 'marble') {
      floorTex = toTexture(marbleTexture(), { repeat: [W / 3, 3] });
      floorRough = 0.18;
    } else if (floorStyle === 'concrete') {
      floorTex = toTexture(concreteTexture(), { repeat: [W / 4, 2.5] });
      floorRough = 0.4;
    } else floorTex = toTexture(woodTexture(floorStyle), { repeat: [W / 4, 2.6] });
    const floorM = new THREE.MeshStandardMaterial({ map: floorTex, roughness: floorRough, metalness: 0.0, envMapIntensity: 0.8 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, front - BACK_Z), floorM);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (front + BACK_Z) / 2);
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.group.add(floor);
    this.floor = floor;

    // ------------------------------------------------------------- walls
    const wallColor = opt.walls === 'default' ? room.wall : ROOM_OPTIONS.walls.find((w) => w.id === opt.walls)?.color ?? room.wall;
    const wallM = new THREE.MeshStandardMaterial({ map: toTexture(plasterTexture(wallColor), { repeat: [4, 2] }), roughness: 0.92 });
    const winLeftEnd = Math.min(tankX - tankDims.w / 2 - 1.5, left + 4.6);
    this.windowRange = [left, winLeftEnd];
    // back wall (solid part)
    const solidW = right - winLeftEnd;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(solidW, CEIL), wallM);
    back.position.set(winLeftEnd + solidW / 2, CEIL / 2, BACK_Z);
    back.receiveShadow = true;
    this.group.add(back);
    // wood feature panel behind the tank
    const panelW = tankDims.w + 1.4;
    const panelM = new THREE.MeshStandardMaterial({ map: toTexture(woodTexture('cabinet', '#3a2618'), { repeat: [1, 1] }), roughness: 0.6 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, CEIL, 0.06), panelM);
    panel.position.set(tankX, CEIL / 2, BACK_Z + 0.03);
    panel.receiveShadow = true;
    this.group.add(panel);
    // vertical slats on the panel for richness
    const slatM = new THREE.MeshStandardMaterial({ color: 0x24170e, roughness: 0.7 });
    const slats = [];
    for (let x = -panelW / 2 + 0.1; x < panelW / 2; x += 0.16) slats.push(new THREE.BoxGeometry(0.025, CEIL, 0.02).translate(tankX + x, CEIL / 2, BACK_Z + 0.07));
    this.group.add(new THREE.Mesh(mergeGeometries(slats), slatM));
    // left wall: big window wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(front - BACK_Z, CEIL), wallM);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(left, CEIL / 2, (front + BACK_Z) / 2);
    this.group.add(leftWall);
    // right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(front - BACK_Z, CEIL), wallM);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(right, CEIL / 2, (front + BACK_Z) / 2);
    rightWall.receiveShadow = true;
    this.group.add(rightWall);
    // front wall (behind the camera; seen during the intro fly-in)
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(W, CEIL), wallM);
    frontWall.rotation.y = Math.PI;
    frontWall.position.set(0, CEIL / 2, front);
    this.group.add(frontWall);
    // ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, front - BACK_Z), new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, CEIL, (front + BACK_Z) / 2);
    this.group.add(ceil);
    // ceiling beams
    const beamM = new THREE.MeshStandardMaterial({ map: toTexture(woodTexture('walnut')), roughness: 0.7 });
    for (let z = BACK_Z + 0.6; z < front; z += 1.6) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, 0.14), beamM);
      b.position.set(0, CEIL - 0.08, z);
      this.group.add(b);
    }
    // baseboards
    const bbM = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.6 });
    const bb = new THREE.Mesh(new THREE.BoxGeometry(solidW, 0.1, 0.03), bbM);
    bb.position.set(winLeftEnd + solidW / 2, 0.05, BACK_Z + 0.015);
    this.group.add(bb);

    // ------------------------------------------------------------ windows
    const view = opt.view === 'default' ? room.view : opt.view;
    this.buildWindowView(view, left, winLeftEnd);
    this.buildWindowFrames(left, winLeftEnd);

    // ----------------------------------------------------------- cabinet
    this.buildCabinet(roomState, tankDims, tankX);

    // -------------------------------------------- shelves above the tank
    const shelfColor = ROOM_OPTIONS.shelves.find((s) => s.id === opt.shelves)?.color ?? '#4a2f1e';
    const tankTop = CAB_H + tankDims.h;
    const shelfY1 = Math.max(tankTop + 0.75, 2.6);
    const shelfY2 = shelfY1 + 0.72;
    for (const [i, y] of [[0, shelfY1], [1, shelfY2]]) {
      if (y > CEIL - 0.3) continue;
      const sw = tankDims.w + 0.9;
      const shelf = makeShelf(sw, shelfColor);
      shelf.position.set(tankX, y, BACK_Z + 0.2);
      this.group.add(shelf);
      this.leds.push(shelf.userData.led);
      if (opt.decorations !== 'zen') {
        const books = makeBooks(sw * 0.32, 3 + i * 7);
        books.position.set(tankX - sw * 0.28, y + 0.03, BACK_Z + 0.2);
        this.group.add(books);
      }
      if (i === 0) {
        const globe = makeGlobeTerrarium();
        globe.position.set(tankX + sw * 0.05, y + 0.03, BACK_Z + 0.22);
        this.group.add(globe);
        const poster = makeFrame(toTexture(posterTexture()), 0.62, 0.4, 0x0e0e10);
        poster.position.set(tankX - sw * 0.04 - 0.5, y + 0.28, BACK_Z + 0.08);
        poster.rotation.x = -0.05;
        if (opt.decorations !== 'zen') this.group.add(poster);
        const pothos = makeHouseplant('pothos', 3, 0xd8d0c4);
        pothos.scale.setScalar(0.8);
        pothos.position.set(tankX + sw * 0.4, y + 0.03, BACK_Z + 0.2);
        this.group.add(pothos);
      } else {
        const small = makeHouseplant('small', 9, 0x2a2a2a);
        small.position.set(tankX + sw * 0.25, y + 0.03, BACK_Z + 0.2);
        this.group.add(small);
        if (opt.decorations === 'collector') {
          for (let k = 0; k < 3; k++) {
            const coral = makeCoralPiece([0xf0d8c8, 0xe8a0a0, 0xd0c0f0][k]);
            coral.scale.setScalar(1.2);
            coral.position.set(tankX + sw * (0.05 + k * 0.08), y + 0.03, BACK_Z + 0.2);
            this.group.add(coral);
          }
        }
      }
    }
    // framed art on the back wall to the right of the panel
    const artStyle = opt.artwork ?? 'fishprints';
    const artX = tankX + panelW / 2 + 0.75;
    if (artX < right - 0.5) {
      for (let i = 0; i < 2; i++) {
        const f = makeFrame(toTexture(artworkTexture(artStyle, i)), 0.48, 0.64);
        f.position.set(artX + i * 0.0, 2.25 + i * 0.85, BACK_Z + 0.03);
        this.group.add(f);
      }
    }
    // framed fish print on the panel above the shelves
    const topArt = makeFrame(toTexture(artworkTexture(artStyle, 2)), 0.5, 0.66);
    topArt.position.set(tankX + tankDims.w * 0.12, Math.min(shelfY2 + 0.55, CEIL - 0.45), BACK_Z + 0.08);
    if (shelfY2 + 0.55 < CEIL - 0.4) this.group.add(topArt);

    // ------------------------------------------------------- living area
    const sofaColor = ROOM_OPTIONS.furniture.find((f) => f.id === opt.furniture)?.color ?? '#d6cfc4';
    const sofa = makeSofa(sofaColor);
    const sofaX = Math.max(left + 1.4, tankX - tankDims.w / 2 - 3.3);
    sofa.position.set(sofaX, 0, 0.1);
    sofa.rotation.y = Math.PI / 2;
    this.group.add(sofa);
    this.sofa = sofa;
    this.obstacles.push({ minX: sofaX - 0.55, maxX: sofaX + 0.55, minZ: 0.1 - 1.4, maxZ: 0.1 + 1.4 });
    this.seats.push({ x: sofaX + 0.1, z: 0.4, y: sofa.userData.seatHeight, face: Math.PI / 2, kind: 'sofa' });
    this.seats.push({ x: sofaX + 0.1, z: -0.4, y: sofa.userData.seatHeight, face: Math.PI / 2, kind: 'sofa' });

    const side = makeSideTable();
    side.position.set(sofaX, 0, -1.65);
    this.group.add(side);
    this.obstacles.push({ x: sofaX, z: -1.65, r: 0.35 });
    const tlamp = makeTableLamp();
    tlamp.position.set(sofaX, 0.58, -1.65);
    this.group.add(tlamp);
    this.lamps.push({ obj: tlamp, pos: new THREE.Vector3(sofaX, 1.0, -1.65), kind: 'table' });

    const table = makeCoffeeTable();
    const tableX = sofaX + 1.45;
    table.position.set(tableX, 0, 0.25);
    this.group.add(table);
    this.obstacles.push({ x: tableX, z: 0.25, r: 0.68 });

    if (opt.rug !== 'none') {
      const rugOpt = ROOM_OPTIONS.rug.find((r) => r.id === opt.rug) ?? ROOM_OPTIONS.rug[0];
      const rugStyle = opt.rug === 'ocean' ? 'wave' : opt.rug === 'rust' ? 'kilim' : 'shag';
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), new THREE.MeshStandardMaterial({ map: toTexture(rugTexture(rugOpt.color, rugStyle)), roughness: 1 }));
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(tableX - 0.2, 0.006, 0.4);
      rug.receiveShadow = true;
      this.group.add(rug);
    }

    const flamp = makeFloorLamp();
    flamp.position.set(sofaX - 0.2, 0, 1.75);
    this.group.add(flamp);
    this.obstacles.push({ x: sofaX - 0.2, z: 1.75, r: 0.3 });
    this.lamps.push({ obj: flamp, pos: new THREE.Vector3(sofaX - 0.2, 1.7, 1.75), kind: 'floor' });

    // pendants near the window
    for (let i = 0; i < 3; i++) {
      const p = makePendant(0.9 + i * 0.35);
      p.position.set(winLeftEnd - 0.8 - i * 0.9, CEIL, BACK_Z + 1.2 + i * 0.6);
      this.group.add(p);
      this.pendants.push(p);
    }

    // ------------------------------------------------------------ plants
    const plantTheme = opt.plants ?? 'lush';
    const placePlant = (kind, x, z, s, seed, pot) => {
      const p = makeHouseplant(kind, seed, pot);
      p.position.set(x, 0, z);
      p.scale.setScalar(s);
      this.group.add(p);
      this.obstacles.push({ x, z, r: 0.32 * s + 0.05 });
      return p;
    };
    const tl = tankX - tankDims.w / 2, tr = tankX + tankDims.w / 2;
    if (plantTheme === 'tropical') {
      placePlant('palm', tl - 0.75, BACK_Z + 0.45, 1.2, 2, 0xd8d0c4);
      placePlant('palm', Math.min(tr + 0.8, right - 0.5), BACK_Z + 0.5, 1.3, 5, 0x2a2a2a);
      placePlant('monstera', left + 0.6, 2.6, 1.1, 8, 0xc8b8a0);
    } else if (plantTheme === 'minimal') {
      placePlant('snake', tl - 0.7, BACK_Z + 0.45, 1.1, 2, 0xe8e4dc);
      placePlant('snake', Math.min(tr + 0.7, right - 0.5), BACK_Z + 0.45, 1, 3, 0x2a2a2a);
    } else {
      placePlant('monstera', tl - 0.8, BACK_Z + 0.5, 1.25, 2, 0xe8e4dc);
      placePlant('fiddle', Math.min(tr + 0.85, right - 0.55), BACK_Z + 0.5, 1.35, 5, 0x2a2a2a);
      placePlant('snake', left + 0.55, 2.7, 1.0, 7, 0xc8b8a0);
      placePlant('small', sofaX + 0.05, -2.3, 1.0, 11, 0xe8e4dc).position.y = 0;
    }

    // ------------------------------------------------------------ lights
    this.lightRig = this.buildLights(roomState, W, left, winLeftEnd, tankX, tankDims, sofaX);
    return this;
  }

  buildWindowView(view, left, winRight) {
    const phases = ['morning', 'day', 'sunset', 'night'];
    const texs = phases.map((p) => toTexture(windowView(view, p)));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: texs[0] }, tB: { value: texs[1] }, tC: { value: texs[2] }, tD: { value: texs[3] },
        uW: { value: new THREE.Vector4(0, 1, 0, 0) },
        uBright: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tA,tB,tC,tD; uniform vec4 uW; uniform float uBright; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tA,vUv).rgb*uW.x + texture2D(tB,vUv).rgb*uW.y + texture2D(tC,vUv).rgb*uW.z + texture2D(tD,vUv).rgb*uW.w;
        gl_FragColor = vec4(c*uBright, 1.0);
        #include <colorspace_fragment>
        }`,
      depthWrite: true,
    });
    texs.forEach((t) => (t.colorSpace = THREE.SRGBColorSpace));
    // make sampled textures linear->sRGB consistent: ShaderMaterial doesn't decode automatically, emulate
    mat.onBeforeCompile = () => {};
    this.viewMat = mat;
    const backView = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), mat);
    backView.position.set(left + 6, 4.2, BACK_Z - 7);
    this.group.add(backView);
    const leftView = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), mat);
    leftView.rotation.y = Math.PI / 2;
    leftView.position.set(left - 7, 4.2, 2);
    this.group.add(leftView);
  }

  buildWindowFrames(left, right) {
    const frameM = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.5, metalness: 0.3 });
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.02, envMapIntensity: 1.2, depthWrite: false });
    // back-wall window opening (left section)
    const w = right - left;
    const add = (geo, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(geo, frameM);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      this.group.add(m);
    };
    const n = Math.max(2, Math.round(w / 1.15));
    for (let i = 0; i <= n; i++) add(new THREE.BoxGeometry(0.07, CEIL, 0.12), left + (i / n) * w, CEIL / 2, BACK_Z);
    add(new THREE.BoxGeometry(w, 0.07, 0.12), left + w / 2, 3.15, BACK_Z);
    add(new THREE.BoxGeometry(w, 0.12, 0.2), left + w / 2, 0.06, BACK_Z);
    add(new THREE.BoxGeometry(w, 0.12, 0.14), left + w / 2, CEIL - 0.06, BACK_Z);
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(w, CEIL), glassM);
    g1.position.set(left + w / 2, CEIL / 2, BACK_Z - 0.01);
    this.group.add(g1);
    // left wall window: openings from z=BACK_Z to ~3
    const lz0 = BACK_Z, lz1 = 3.4, lw = lz1 - lz0;
    const ln = Math.round(lw / 1.15);
    for (let i = 0; i <= ln; i++) add(new THREE.BoxGeometry(0.12, CEIL, 0.07), left, CEIL / 2, lz0 + (i / ln) * lw);
    add(new THREE.BoxGeometry(0.12, 0.07, lw), left, 3.15, lz0 + lw / 2);
    const g2 = new THREE.Mesh(new THREE.PlaneGeometry(lw, CEIL), glassM);
    g2.rotation.y = Math.PI / 2;
    g2.position.set(left + 0.01, CEIL / 2, lz0 + lw / 2);
    this.group.add(g2);
    // hide the solid left wall section behind the window by cutting: overlay wall only beyond lz1
    this.group.children.forEach((c) => {
      if (c.geometry?.type === 'PlaneGeometry' && Math.abs(c.position.x - left) < 0.001 && c.rotation.y === Math.PI / 2 && c.geometry.parameters.width > lw + 1) {
        const len = 12 - lz1;
        c.geometry.dispose();
        c.geometry = new THREE.PlaneGeometry(len, CEIL);
        c.position.z = lz1 + len / 2;
      }
    });
    // curtains
    const curtainM = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
    const curtainGeo = new THREE.PlaneGeometry(0.8, CEIL - 0.3, 24, 1);
    const p = curtainGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.04);
    curtainGeo.computeVertexNormals();
    const c1 = new THREE.Mesh(curtainGeo, curtainM);
    c1.position.set(right - 0.5, (CEIL - 0.3) / 2 + 0.05, BACK_Z + 0.15);
    this.group.add(c1);
    const c2 = new THREE.Mesh(curtainGeo, curtainM);
    c2.rotation.y = Math.PI / 2;
    c2.position.set(left + 0.15, (CEIL - 0.3) / 2 + 0.05, lz1 - 0.45);
    this.group.add(c2);
  }

  buildCabinet(roomState, tankDims, tankX) {
    const opt = roomState.options;
    const cabColor = ROOM_OPTIONS.cabinet.find((c) => c.id === opt.cabinet)?.color ?? '#4a2e1c';
    const W = tankDims.w + 0.24, D = tankDims.d + 0.16;
    const g = new THREE.Group();
    const woodM = new THREE.MeshStandardMaterial({ map: toTexture(woodTexture('cabinet', cabColor)), roughness: opt.cabinet === 'white' ? 0.25 : 0.5 });
    const top = new THREE.Mesh(rbox(W, 0.06, D, 0.01), woodM);
    top.position.y = CAB_H - 0.03;
    g.add(top);
    const bottom = new THREE.Mesh(rbox(W, 0.06, D, 0.01), woodM);
    bottom.position.y = 0.07;
    g.add(bottom);
    const backP = new THREE.Mesh(new THREE.BoxGeometry(W, CAB_H, 0.03), woodM);
    backP.position.set(0, CAB_H / 2, -D / 2 + 0.015);
    g.add(backP);
    // compartments: closed doors on outside, open shelf in the middle
    const third = W / 3;
    for (const s of [-1, 1]) {
      const door = new THREE.Mesh(rbox(third - 0.02, CAB_H - 0.16, 0.04, 0.008), woodM);
      door.position.set(s * third, CAB_H / 2 + 0.02, D / 2 - 0.02);
      g.add(door);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.02), new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.9, roughness: 0.3 }));
      handle.position.set(s * third - s * (third / 2 - 0.12), CAB_H - 0.16, D / 2 + 0.01);
      g.add(handle);
      const sideP = new THREE.Mesh(new THREE.BoxGeometry(0.04, CAB_H - 0.1, D), woodM);
      sideP.position.set(s * (W / 2 - 0.02), CAB_H / 2, 0);
      g.add(sideP);
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.03, CAB_H - 0.1, D - 0.04), woodM);
      div.position.set(s * (third / 2), CAB_H / 2, 0);
      g.add(div);
    }
    // middle open shelf with books and coral
    const midShelf = new THREE.Mesh(new THREE.BoxGeometry(third, 0.03, D - 0.06), woodM);
    midShelf.position.set(0, CAB_H * 0.5, 0);
    g.add(midShelf);
    const books = makeBooks(third * 0.55, 21);
    books.scale.setScalar(0.85);
    books.rotation.y = 0;
    books.position.set(-third * 0.15, CAB_H * 0.5 + 0.015, 0);
    g.add(books);
    const coral = makeCoralPiece(0xf0e0d0);
    coral.scale.setScalar(1.6);
    coral.position.set(third * 0.3, 0.1, 0.05);
    g.add(coral);
    const supplies = makeSupplies();
    supplies.position.set(-third * 0.3, 0.1, 0.05);
    g.add(supplies);
    // warm LED strips (reference look)
    const ledM = new THREE.MeshBasicMaterial({ color: 0xffa050 });
    for (const y of [0.035, CAB_H - 0.065]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.012, 0.012), ledM);
      strip.position.set(0, y, D / 2 + 0.005);
      g.add(strip);
      this.leds.push(strip);
    }
    g.position.set(tankX, 0, BACK_Z + 0.08 + D / 2);
    shadowAll(g);
    this.group.add(g);
    this.cabinet = g;
    this.cabinetFront = BACK_Z + 0.08 + D;
    this.obstacles.push({ minX: tankX - W / 2 - 0.05, maxX: tankX + W / 2 + 0.05, minZ: BACK_Z, maxZ: this.cabinetFront + 0.05 });
  }

  buildLights(roomState, W, left, winRight, tankX, tankDims, sofaX) {
    const rig = {};
    rig.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a2a20, 0.6);
    this.group.add(rig.hemi);
    rig.sun = new THREE.DirectionalLight(0xffe0b8, 2.5);
    rig.sun.position.set(left - 6, 7, BACK_Z - 5);
    rig.sun.target.position.set(tankX - 1, 0, 1);
    rig.sun.castShadow = true;
    rig.sun.shadow.camera.left = -9;
    rig.sun.shadow.camera.right = 9;
    rig.sun.shadow.camera.top = 7;
    rig.sun.shadow.camera.bottom = -5;
    rig.sun.shadow.camera.near = 1;
    rig.sun.shadow.camera.far = 30;
    rig.sun.shadow.bias = -0.0006;
    rig.sun.shadow.normalBias = 0.02;
    this.group.add(rig.sun, rig.sun.target);
    const lampColor = ROOM_OPTIONS.lighting.find((l) => l.id === roomState.options.lighting)?.color ?? 0xffb46b;
    rig.lampColor = new THREE.Color(lampColor);
    rig.floorLamp = new THREE.PointLight(lampColor, 0, 7, 1.6);
    rig.floorLamp.position.copy(this.lamps.find((l) => l.kind === 'floor').pos);
    rig.tableLamp = new THREE.PointLight(lampColor, 0, 5, 1.8);
    rig.tableLamp.position.copy(this.lamps.find((l) => l.kind === 'table').pos);
    rig.pendant = new THREE.PointLight(lampColor, 0, 6, 1.6);
    rig.pendant.position.set(winRight - 1.7, 2.9, BACK_Z + 1.8);
    rig.cabinetGlow = new THREE.PointLight(0xff9a50, 0.6, 2.4, 2);
    rig.cabinetGlow.position.set(tankX, 0.2, this.cabinetFront + 0.35);
    rig.shelfGlow = new THREE.PointLight(0xffb870, 0.5, 3, 2);
    rig.shelfGlow.position.set(tankX, CAB_H + tankDims.h + 0.9, BACK_Z + 0.5);
    this.group.add(rig.floorLamp, rig.tableLamp, rig.pendant, rig.cabinetGlow, rig.shelfGlow);
    return rig;
  }
}
