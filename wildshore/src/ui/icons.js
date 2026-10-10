// Painted inventory icons (canvas vector illustrations, cached as data URLs).
const cache = new Map();

function grad(ctx, x0, y0, x1, y1, a, b) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function rgrad(ctx, x, y, r, a, b) { const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function stick(ctx, x0, y0, x1, y1, w, col = '#9b7448') {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = w * 0.3;
  ctx.beginPath(); ctx.moveTo(x0 - 1, y0 - 1); ctx.lineTo(x1 - 1, y1 - 1); ctx.stroke();
}
function rock(ctx, x, y, r, a = '#a7a29a', b = '#5f5b55') {
  ctx.fillStyle = rgrad(ctx, x, y, r, a, b);
  ctx.beginPath();
  for (let i = 0; i < 9; i++) { const ang = (i / 9) * Math.PI * 2; const rr = r * (0.82 + ((i * 37) % 7) / 30); ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.8); }
  ctx.closePath(); ctx.fill();
}
function leaf(ctx, x, y, len, ang, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(len / 2, 0, len / 2, len / 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,200,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.restore();
}
function fish(ctx, col, belly, x = 32, y = 34, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = grad(ctx, 0, -10, 0, 10, col, belly);
  ctx.beginPath(); ctx.ellipse(-2, 0, 18, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(26, -9); ctx.lineTo(24, 0); ctx.lineTo(26, 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-13, -2, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drop(ctx, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(32, 12); ctx.bezierCurveTo(46, 30, 46, 50, 32, 52); ctx.bezierCurveTo(18, 50, 18, 30, 32, 12); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(27, 36, 3, 6, -0.3, 0, Math.PI * 2); ctx.fill();
}

const DRAW = {
  stick(c) { stick(c, 14, 50, 50, 14, 5); stick(c, 18, 40, 30, 46, 3); stick(c, 34, 22, 44, 30, 3); },
  log(c) { c.fillStyle = grad(c, 0, 20, 0, 44, '#8a6a48', '#5a4028'); c.fillRect(10, 22, 40, 20); c.fillStyle = '#d8b88a'; c.beginPath(); c.ellipse(50, 32, 6, 10, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#a07a50'; c.beginPath(); c.ellipse(50, 32, 3, 5, 0, 0, Math.PI * 2); c.stroke(); for (let i = 0; i < 4; i++) { c.strokeStyle = 'rgba(40,25,10,0.5)'; c.beginPath(); c.moveTo(14 + i * 9, 22); c.lineTo(14 + i * 9, 42); c.stroke(); } },
  hardwood(c) { c.fillStyle = grad(c, 0, 20, 0, 44, '#5a3a24', '#3a2414'); c.fillRect(8, 22, 42, 20); c.fillStyle = '#b57a4a'; c.beginPath(); c.ellipse(50, 32, 6, 10, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#7a4a2a'; for (const r of [2, 4]) { c.beginPath(); c.ellipse(50, 32, r * 0.6, r, 0, 0, Math.PI * 2); c.stroke(); } },
  palmLeaf(c) { stick(c, 12, 54, 52, 10, 2.5, '#8a8a3c'); for (let i = 0; i < 11; i++) { const t = i / 11; const x = 12 + t * 40, y = 54 - t * 44; leaf(c, x, y, 16 - t * 6, -0.2, '#5d8a2e'); leaf(c, x, y, 16 - t * 6, -2.5, '#4f7a26'); } },
  fiber(c) { c.strokeStyle = '#b8a96a'; c.lineWidth = 1.5; for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(16 + i * 2, 54); c.quadraticCurveTo(20 + i * 2 + Math.sin(i) * 8, 32, 30 + i * 1.5, 10); c.stroke(); } c.strokeStyle = '#7a6a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(22, 38); c.lineTo(44, 34); c.stroke(); },
  rope(c) { c.strokeStyle = '#a88c58'; c.lineWidth = 6; for (let r = 18; r > 6; r -= 6) { c.beginPath(); c.arc(32, 32, r, 0, Math.PI * 2); c.stroke(); } c.strokeStyle = 'rgba(80,60,30,0.5)'; c.lineWidth = 1; for (let a = 0; a < 40; a++) { const ang = a * 0.4; c.beginPath(); c.moveTo(32 + Math.cos(ang) * 8, 32 + Math.sin(ang) * 8); c.lineTo(32 + Math.cos(ang + 0.2) * 20, 32 + Math.sin(ang + 0.2) * 20); c.stroke(); } },
  stone(c) { rock(c, 32, 34, 18); },
  flint(c) { c.fillStyle = grad(c, 16, 16, 48, 48, '#5a5a62', '#26262c'); c.beginPath(); c.moveTo(20, 48); c.lineTo(30, 12); c.lineTo(46, 22); c.lineTo(44, 48); c.closePath(); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.moveTo(30, 12); c.lineTo(36, 40); c.stroke(); },
  clay(c) { c.fillStyle = rgrad(c, 32, 36, 18, '#b07a50', '#6a4028'); c.beginPath(); c.ellipse(32, 38, 20, 13, 0, 0, Math.PI * 2); c.fill(); },
  bone(c) { c.strokeStyle = '#eee6d2'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(18, 46); c.lineTo(46, 18); c.stroke(); c.fillStyle = '#eee6d2'; for (const [x, y] of [[15, 44], [20, 49], [44, 15], [49, 20]]) { c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); } },
  hide(c) { c.fillStyle = grad(c, 0, 10, 0, 54, '#7a5a3a', '#4a3020'); c.beginPath(); c.moveTo(14, 14); c.lineTo(50, 12); c.lineTo(54, 30); c.lineTo(48, 52); c.lineTo(16, 54); c.lineTo(10, 32); c.closePath(); c.fill(); },
  shell(c) { c.fillStyle = grad(c, 32, 12, 32, 52, '#f6e6d6', '#d89a7a'); c.beginPath(); c.moveTo(32, 52); c.lineTo(10, 26); c.quadraticCurveTo(32, 4, 54, 26); c.closePath(); c.fill(); c.strokeStyle = 'rgba(150,80,60,0.5)'; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(32, 52); c.lineTo(14 + i * 6, 18 + Math.abs(3 - i) * 2); c.stroke(); } },
  coconutShell(c) { c.fillStyle = rgrad(c, 32, 34, 20, '#8a6a48', '#4a3020'); c.beginPath(); c.arc(32, 30, 20, 0, Math.PI); c.fill(); c.fillStyle = '#f2ead6'; c.beginPath(); c.ellipse(32, 31, 17, 4, 0, 0, Math.PI * 2); c.fill(); },
  palmMat(c) { for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { c.fillStyle = (i + j) % 2 ? '#c9b07a' : '#a8905a'; c.fillRect(12 + i * 7, 12 + j * 7, 7, 7); } },
  pearl(c) { c.fillStyle = rgrad(c, 32, 32, 14, '#ffffff', '#c8c0d8'); c.beginPath(); c.arc(32, 32, 13, 0, Math.PI * 2); c.fill(); },
  coconut(c) { c.fillStyle = rgrad(c, 32, 34, 20, '#8aa040', '#4a5a20'); c.beginPath(); c.ellipse(32, 34, 17, 19, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2a2a14'; for (const [x, y] of [[28, 22], [36, 22], [32, 27]]) { c.beginPath(); c.arc(x, y, 1.8, 0, Math.PI * 2); c.fill(); } },
  coconutOpen(c) { c.fillStyle = rgrad(c, 32, 34, 20, '#8a6a48', '#4a3020'); c.beginPath(); c.arc(32, 32, 20, 0, Math.PI); c.fill(); c.fillStyle = '#fbf6ea'; c.beginPath(); c.ellipse(32, 33, 17, 5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#dde8ee'; c.beginPath(); c.ellipse(32, 33, 12, 3, 0, 0, Math.PI * 2); c.fill(); },
  rawFish(c) { fish(c, '#9aa8b2', '#e2e8ec'); },
  cookedFish(c) { fish(c, '#b06a2a', '#e0a860'); c.strokeStyle = '#3a200a'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(18 + i * 8, 26); c.lineTo(24 + i * 8, 42); c.stroke(); } },
  driedFish(c) { fish(c, '#8a6a3a', '#c8a070', 32, 34, 0.9); },
  smokedFish(c) { fish(c, '#6a3a1a', '#a8683a', 32, 34, 0.95); },
  rawMeat(c) { c.fillStyle = rgrad(c, 32, 32, 20, '#e07070', '#a03040'); c.beginPath(); c.ellipse(32, 34, 20, 14, -0.3, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#f6d6d0'; c.lineWidth = 3; c.beginPath(); c.ellipse(32, 34, 14, 8, -0.3, 0.5, 2.5); c.stroke(); },
  cookedMeat(c) { c.fillStyle = rgrad(c, 32, 32, 20, '#b06a3a', '#5a2a14'); c.beginPath(); c.ellipse(32, 34, 20, 14, -0.3, 0, Math.PI * 2); c.fill(); stick(c, 44, 24, 56, 12, 4, '#f0e6d0'); },
  driedMeat(c) { c.fillStyle = '#6a3a22'; for (let i = 0; i < 3; i++) { c.save(); c.translate(20 + i * 12, 32); c.rotate(0.3); c.fillRect(-4, -16, 8, 32); c.restore(); } },
  shellfish(c) { for (const [x, y] of [[24, 34], [40, 30]]) { c.fillStyle = grad(c, x, y - 10, x, y + 10, '#3a3048', '#1a1420'); c.beginPath(); c.ellipse(x, y, 12, 8, 0.4, 0, Math.PI * 2); c.fill(); } },
  cookedShellfish(c) { for (const [x, y] of [[24, 34], [40, 30]]) { c.fillStyle = '#2a2030'; c.beginPath(); c.ellipse(x, y, 12, 8, 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f0a060'; c.beginPath(); c.ellipse(x, y - 1, 8, 4, 0.4, 0, Math.PI * 2); c.fill(); } },
  crab(c) { c.fillStyle = rgrad(c, 32, 34, 16, '#e08050', '#a04020'); c.beginPath(); c.ellipse(32, 36, 16, 11, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#a04020'; c.lineWidth = 2.5; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(32 + s * 12, 38 + i * 3); c.lineTo(32 + s * 24, 44 + i * 4); c.stroke(); } for (const s of [-1, 1]) { c.beginPath(); c.arc(32 + s * 16, 20, 5, 0, Math.PI * 2); c.fillStyle = '#c05030'; c.fill(); } },
  cookedCrab(c) { DRAW.crab(c); c.fillStyle = 'rgba(255,90,40,0.35)'; c.fillRect(0, 0, 64, 64); },
  fruit(c) { for (const [x, y, col] of [[24, 36, '#f0a020'], [40, 38, '#e05030'], [32, 26, '#f0c030']]) { c.fillStyle = rgrad(c, x, y, 11, col, '#7a3010'); c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill(); } leaf(c, 32, 16, 14, -0.8, '#4a7a20'); },
  egg(c) { c.fillStyle = rgrad(c, 32, 34, 16, '#fff8ea', '#c8b898'); c.beginPath(); c.ellipse(32, 34, 13, 17, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(120,90,60,0.4)'; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(26 + (i * 7) % 14, 26 + (i * 5) % 18, 1.5, 0, Math.PI * 2); c.fill(); } },
  cookedEgg(c) { DRAW.egg(c); c.fillStyle = 'rgba(120,60,20,0.3)'; c.beginPath(); c.ellipse(32, 34, 13, 17, 0, 0, Math.PI * 2); c.fill(); },
  urchin(c) { c.strokeStyle = '#2a1d38'; c.lineWidth = 1.5; for (let i = 0; i < 30; i++) { const a = i * 0.21; c.beginPath(); c.moveTo(32, 34); c.lineTo(32 + Math.cos(a) * 24, 34 + Math.sin(a) * 20); c.stroke(); } c.fillStyle = '#3a2a48'; c.beginPath(); c.arc(32, 34, 10, 0, Math.PI * 2); c.fill(); },
  spoiled(c) { fish(c, '#5a5a3a', '#7a7a4a'); c.fillStyle = 'rgba(120,140,40,0.6)'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(18 + i * 7, 20 - (i % 2) * 5, 3, 0, Math.PI * 2); c.fill(); } },
  rawWater(c) { drop(c, '#8aa8a0'); c.fillStyle = 'rgba(90,80,40,0.3)'; c.beginPath(); c.arc(34, 44, 4, 0, Math.PI * 2); c.fill(); },
  cleanWater(c) { drop(c, '#4ab0e8'); },
  coconutFlask(c) { c.fillStyle = rgrad(c, 32, 36, 20, '#8a6a48', '#4a3020'); c.beginPath(); c.ellipse(32, 38, 16, 18, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#c8a46a'; c.fillRect(28, 12, 8, 10); c.strokeStyle = '#a88c58'; c.lineWidth = 2; c.beginPath(); c.moveTo(18, 30); c.quadraticCurveTo(32, 8, 46, 30); c.stroke(); },
  clayPot(c) { c.fillStyle = rgrad(c, 32, 36, 22, '#c07a50', '#6a3a20'); c.beginPath(); c.moveTo(20, 16); c.lineTo(44, 16); c.bezierCurveTo(56, 30, 52, 52, 32, 54); c.bezierCurveTo(12, 52, 8, 30, 20, 16); c.fill(); c.fillStyle = '#4a2a14'; c.beginPath(); c.ellipse(32, 17, 12, 3, 0, 0, Math.PI * 2); c.fill(); },
  bandage(c) { c.fillStyle = '#e8dcc0'; c.save(); c.translate(32, 32); c.rotate(-0.6); c.fillRect(-22, -8, 44, 16); c.fillStyle = '#c84040'; c.fillRect(-4, -8, 8, 16); c.restore(); },
  aloe(c) { for (let i = 0; i < 6; i++) leaf(c, 32, 52, 28, -Math.PI / 2 + (i - 2.5) * 0.35, i % 2 ? '#5aa060' : '#4a8a50'); },
  stoneAxe(c) { stick(c, 18, 54, 42, 14, 5); rock(c, 42, 18, 11, '#9a968e', '#4a4844'); c.strokeStyle = '#a88c58'; c.lineWidth = 3; c.beginPath(); c.moveTo(36, 20); c.lineTo(44, 26); c.stroke(); },
  knife(c) { stick(c, 16, 50, 28, 38, 6, '#6a4a2a'); c.fillStyle = grad(c, 28, 38, 50, 14, '#6a6a72', '#2a2a30'); c.beginPath(); c.moveTo(26, 36); c.lineTo(52, 10); c.lineTo(32, 40); c.closePath(); c.fill(); },
  woodSpear(c) { stick(c, 8, 58, 52, 12, 3.5, '#c8a274'); c.fillStyle = '#9a7048'; c.beginPath(); c.moveTo(50, 14); c.lineTo(58, 6); c.lineTo(54, 16); c.fill(); },
  stoneSpear(c) { stick(c, 8, 58, 48, 16, 3.5, '#c8a274'); c.fillStyle = '#3d3b39'; c.beginPath(); c.moveTo(44, 18); c.lineTo(58, 6); c.lineTo(50, 22); c.closePath(); c.fill(); },
  fishSpear(c) { stick(c, 8, 58, 44, 20, 3.5, '#c8a274'); c.strokeStyle = '#d4b48a'; c.lineWidth = 2; for (const o of [-5, 0, 5]) { c.beginPath(); c.moveTo(44, 20); c.lineTo(56 + o * 0.4, 6 + o); c.stroke(); } },
  fishingRod(c) { c.strokeStyle = '#b89a68'; c.lineWidth = 3; c.beginPath(); c.moveTo(10, 56); c.quadraticCurveTo(30, 20, 54, 8); c.stroke(); c.strokeStyle = '#ddd'; c.lineWidth = 1; c.beginPath(); c.moveTo(54, 8); c.lineTo(54, 40); c.stroke(); c.fillStyle = '#e04030'; c.beginPath(); c.arc(54, 42, 3, 0, Math.PI * 2); c.fill(); },
  bow(c) { c.strokeStyle = '#9c7448'; c.lineWidth = 4; c.beginPath(); c.arc(14, 32, 30, -1.1, 1.1); c.stroke(); c.strokeStyle = '#eee'; c.lineWidth = 1; c.beginPath(); c.moveTo(14 + 30 * Math.cos(-1.1), 32 + 30 * Math.sin(-1.1)); c.lineTo(14 + 30 * Math.cos(1.1), 32 + 30 * Math.sin(1.1)); c.stroke(); },
  arrow(c) { stick(c, 10, 54, 50, 14, 2.5, '#c8a274'); c.fillStyle = '#3d3b39'; c.beginPath(); c.moveTo(48, 16); c.lineTo(56, 8); c.lineTo(52, 18); c.fill(); c.fillStyle = '#e8e0d0'; c.beginPath(); c.moveTo(12, 52); c.lineTo(8, 46); c.lineTo(16, 50); c.fill(); },
  hammer(c) { stick(c, 18, 54, 38, 22, 5); rock(c, 40, 18, 12, '#a8a49c', '#5a5852'); },
  torch(c) { stick(c, 22, 58, 36, 26, 6, '#7a5a3a'); c.fillStyle = rgrad(c, 38, 18, 14, '#fff0a0', 'rgba(255,90,20,0)'); c.beginPath(); c.arc(38, 18, 14, 0, Math.PI * 2); c.fill(); },
  trap(c) { stick(c, 14, 50, 50, 50, 3); stick(c, 18, 50, 32, 16, 3); stick(c, 46, 50, 32, 16, 3); c.strokeStyle = '#a88c58'; c.lineWidth = 1.5; c.beginPath(); c.arc(32, 44, 9, 0, Math.PI * 2); c.stroke(); },
  // structures / ui glyphs
  campfire(c) { for (let i = 0; i < 7; i++) rock(c, 14 + i * 6, 50, 5); stick(c, 18, 46, 42, 30, 4); stick(c, 46, 46, 24, 30, 4); c.fillStyle = rgrad(c, 32, 30, 16, '#fff0a0', 'rgba(255,80,20,0.2)'); c.beginPath(); c.moveTo(22, 44); c.quadraticCurveTo(24, 20, 32, 12); c.quadraticCurveTo(40, 22, 42, 44); c.fill(); },
  cookingRack(c) { stick(c, 12, 56, 14, 14, 3); stick(c, 52, 56, 50, 14, 3); stick(c, 8, 18, 56, 18, 3); for (let i = 0; i < 4; i++) stick(c, 18, 32 + i * 3, 46, 32 + i * 3, 1.5); fish(c, '#c98a4a', '#e0b070', 32, 28, 0.5); },
  dryingRack(c) { stick(c, 10, 56, 20, 12, 3); stick(c, 54, 56, 44, 12, 3); stick(c, 8, 14, 56, 14, 3); for (let i = 0; i < 3; i++) fish(c, '#9a6a3a', '#c8a070', 18 + i * 14, 28, 0.35); },
  waterCollector(c) { stick(c, 14, 58, 32, 20, 2); stick(c, 50, 58, 32, 20, 2); for (let i = 0; i < 5; i++) leaf(c, 32, 30, 20, -Math.PI + i * 0.78 - 0.1, '#6a8a3a'); c.fillStyle = '#9a5a3a'; c.fillRect(24, 44, 16, 12); drop(c, 'rgba(80,170,230,0.7)'); },
  storageBasket(c) { c.fillStyle = grad(c, 0, 20, 0, 56, '#d8c08a', '#8a7040'); c.beginPath(); c.moveTo(14, 22); c.lineTo(50, 22); c.lineTo(46, 56); c.lineTo(18, 56); c.closePath(); c.fill(); c.strokeStyle = 'rgba(80,60,30,0.5)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(14, 26 + i * 5); c.lineTo(50, 26 + i * 5); c.stroke(); } },
  palmShelter(c) { stick(c, 12, 56, 14, 22, 3); stick(c, 52, 56, 50, 22, 3); stick(c, 8, 22, 56, 22, 3); c.fillStyle = '#7a8a3a'; c.beginPath(); c.moveTo(6, 22); c.lineTo(58, 22); c.lineTo(58, 56); c.lineTo(40, 56); c.closePath(); c.fill(); for (let i = 0; i < 8; i++) leaf(c, 8 + i * 7, 22, 22, 1.0, '#5d7a2a'); },
  woodenHut(c) { c.fillStyle = '#7a5a3a'; c.fillRect(14, 30, 36, 20); for (const x of [16, 30, 46]) stick(c, x, 50, x, 60, 3); c.fillStyle = '#c9a868'; c.beginPath(); c.moveTo(6, 32); c.lineTo(32, 8); c.lineTo(58, 32); c.closePath(); c.fill(); c.fillStyle = '#3a2a1a'; c.fillRect(27, 36, 10, 14); },
  raisedPlatform(c) { for (const x of [12, 52]) stick(c, x, 58, x, 22, 4); c.fillStyle = '#b8905a'; c.fillRect(6, 28, 52, 6); stick(c, 8, 18, 56, 18, 2); },
  dock(c) { c.fillStyle = '#4ab0d8'; c.fillRect(0, 40, 64, 24); c.fillStyle = '#b8905a'; for (let i = 0; i < 6; i++) c.fillRect(8 + i * 8, 24, 6, 20); for (const x of [10, 54]) stick(c, x, 58, x, 24, 3); },
  boatShelter(c) { DRAW.palmShelter(c); },
  raft(c) { c.fillStyle = '#4ab0d8'; c.fillRect(0, 44, 64, 20); for (let i = 0; i < 6; i++) { c.fillStyle = grad(c, 0, 28, 0, 46, '#9a7a50', '#5a4028'); c.fillRect(8, 26 + i * 0, 48, 0); c.beginPath(); c.ellipse(32, 30 + i * 3, 26, 3, 0, 0, Math.PI * 2); c.fill(); } },
  canoe(c) { c.fillStyle = '#4ab0d8'; c.fillRect(0, 42, 64, 22); c.fillStyle = grad(c, 0, 26, 0, 46, '#8a5a34', '#4a2a14'); c.beginPath(); c.moveTo(4, 30); c.quadraticCurveTo(32, 56, 60, 30); c.closePath(); c.fill(); },
  sailboat(c) { DRAW.canoe(c); stick(c, 30, 40, 30, 6, 2); c.fillStyle = '#e8dcb8'; c.beginPath(); c.moveTo(30, 8); c.lineTo(54, 30); c.lineTo(30, 36); c.closePath(); c.fill(); },
};

export function icon(id, size = 64) {
  const key = id + size;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.scale(size / 64, size / 64);
  // soft shadow
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  (DRAW[id] || ((x) => { x.fillStyle = '#888'; x.beginPath(); x.arc(32, 32, 16, 0, Math.PI * 2); x.fill(); }))(ctx);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
