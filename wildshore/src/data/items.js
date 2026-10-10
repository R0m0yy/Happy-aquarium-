// Item, recipe and structure definitions.
// food: hunger/thirst restored; risk: chance of sickness; shelf: game-hours until spoiled.

export const ITEMS = {
  // ---- raw materials
  stick: { name: 'Branches', icon: 'stick', w: 0.4, stack: 30, cat: 'material', desc: 'Light branches. Kindling, handles and frames.' },
  log: { name: 'Palm Log', icon: 'log', w: 4, stack: 10, cat: 'material', desc: 'Fibrous palm trunk sections. Good for rafts and walls.' },
  hardwood: { name: 'Hardwood', icon: 'hardwood', w: 5, stack: 10, cat: 'material', desc: 'Dense tropical timber. Canoes, bows and beams.' },
  palmLeaf: { name: 'Palm Frond', icon: 'palmLeaf', w: 0.3, stack: 40, cat: 'material', desc: 'Thatching, baskets and roofing.' },
  fiber: { name: 'Plant Fiber', icon: 'fiber', w: 0.1, stack: 50, cat: 'material', desc: 'Twisted into cordage.' },
  rope: { name: 'Cordage', icon: 'rope', w: 0.2, stack: 30, cat: 'material', desc: 'Lashing for tools and structures.' },
  stone: { name: 'Stone', icon: 'stone', w: 1.2, stack: 20, cat: 'material', desc: 'Fire rings, tool heads and anchors.' },
  flint: { name: 'Flint', icon: 'flint', w: 0.5, stack: 20, cat: 'material', desc: 'Holds a razor edge. Best knife and spear tips.' },
  clay: { name: 'Clay', icon: 'clay', w: 1, stack: 20, cat: 'material', desc: 'Mangrove mud. Fire it into pots.' },
  bone: { name: 'Bone', icon: 'bone', w: 0.3, stack: 20, cat: 'material', desc: 'Hooks, needles and arrowheads.' },
  hide: { name: 'Pig Hide', icon: 'hide', w: 1.5, stack: 10, cat: 'material', desc: 'Tough leather for a sail or bedding.' },
  shell: { name: 'Seashell', icon: 'shell', w: 0.1, stack: 40, cat: 'material', desc: 'Scrapers, hooks and trade beads.' },
  coconutShell: { name: 'Coconut Shell', icon: 'coconutShell', w: 0.2, stack: 10, cat: 'material', desc: 'Half a husk. A natural cup.' },
  palmMat: { name: 'Woven Mat', icon: 'palmMat', w: 0.8, stack: 10, cat: 'material', desc: 'Tightly woven fronds. Sails and bedding.' },
  pearl: { name: 'Pearl', icon: 'pearl', w: 0.01, stack: 50, cat: 'treasure', desc: 'A rare find from the giant clams of the Outer Reef.' },
  // ---- food
  coconut: { name: 'Coconut', icon: 'coconut', w: 1, stack: 10, cat: 'food', open: true, shelf: 400, desc: 'Must be opened with a tool or a rock.' },
  coconutOpen: { name: 'Opened Coconut', icon: 'coconutOpen', w: 0.6, stack: 10, cat: 'food', food: 10, water: 22, shelf: 30, gives: 'coconutShell', desc: 'Sweet water and soft meat.' },
  rawFish: { name: 'Raw Fish', icon: 'rawFish', w: 0.8, stack: 10, cat: 'food', food: 12, risk: 0.25, shelf: 14, cook: 'cookedFish', dry: 'driedFish', desc: 'Cook or dry it soon.' },
  cookedFish: { name: 'Grilled Fish', icon: 'cookedFish', w: 0.6, stack: 10, cat: 'food', food: 34, water: 2, shelf: 30, desc: 'Flaky and filling.' },
  driedFish: { name: 'Dried Fish', icon: 'driedFish', w: 0.3, stack: 20, cat: 'food', food: 24, water: -4, shelf: 240, desc: 'Preserved for days.' },
  smokedFish: { name: 'Smoked Fish', icon: 'smokedFish', w: 0.4, stack: 20, cat: 'food', food: 30, shelf: 360, desc: 'Smoked over the fire. Keeps for weeks.' },
  rawMeat: { name: 'Raw Pork', icon: 'rawMeat', w: 1.2, stack: 10, cat: 'food', food: 14, risk: 0.45, shelf: 12, cook: 'cookedMeat', dry: 'driedMeat', desc: 'Dangerous raw. Cook it.' },
  cookedMeat: { name: 'Roast Pork', icon: 'cookedMeat', w: 1, stack: 10, cat: 'food', food: 48, shelf: 30, desc: 'Rich and energising.' },
  driedMeat: { name: 'Jerky', icon: 'driedMeat', w: 0.4, stack: 20, cat: 'food', food: 34, water: -6, shelf: 300, desc: 'Trail food.' },
  shellfish: { name: 'Shellfish', icon: 'shellfish', w: 0.3, stack: 20, cat: 'food', food: 6, risk: 0.3, shelf: 10, cook: 'cookedShellfish', desc: 'Mussels and clams. Cook first.' },
  cookedShellfish: { name: 'Steamed Shellfish', icon: 'cookedShellfish', w: 0.2, stack: 20, cat: 'food', food: 14, water: 3, shelf: 20 },
  crab: { name: 'Crab', icon: 'crab', w: 0.5, stack: 10, cat: 'food', food: 6, risk: 0.35, shelf: 12, cook: 'cookedCrab' },
  cookedCrab: { name: 'Boiled Crab', icon: 'cookedCrab', w: 0.4, stack: 10, cat: 'food', food: 22, shelf: 24 },
  fruit: { name: 'Wild Fruit', icon: 'fruit', w: 0.3, stack: 20, cat: 'food', food: 9, water: 6, shelf: 60, desc: 'Sweet and juicy.' },
  egg: { name: 'Seabird Egg', icon: 'egg', w: 0.1, stack: 12, cat: 'food', food: 5, risk: 0.2, shelf: 90, cook: 'cookedEgg' },
  cookedEgg: { name: 'Roasted Egg', icon: 'cookedEgg', w: 0.1, stack: 12, cat: 'food', food: 16, shelf: 40 },
  urchin: { name: 'Sea Urchin', icon: 'urchin', w: 0.2, stack: 10, cat: 'food', food: 8, shelf: 8, desc: 'Prized roe. Mind the spines.' },
  spoiled: { name: 'Spoiled Food', icon: 'spoiled', w: 0.3, stack: 20, cat: 'food', food: 4, risk: 0.9, desc: 'Rotten. Only if desperate.' },
  // ---- water
  rawWater: { name: 'Untreated Water', icon: 'rawWater', w: 0.5, stack: 20, cat: 'water', water: 25, risk: 0.18, desc: 'From a spring. Boil it to be safe.' },
  cleanWater: { name: 'Clean Water', icon: 'cleanWater', w: 0.5, stack: 20, cat: 'water', water: 28, desc: 'Boiled or collected rain water.' },
  // ---- containers
  coconutFlask: { name: 'Coconut Flask', icon: 'coconutFlask', w: 0.3, stack: 5, cat: 'tool', capacity: 2, desc: 'Holds 2 portions of water.' },
  clayPot: { name: 'Clay Pot', icon: 'clayPot', w: 1.2, stack: 3, cat: 'tool', capacity: 4, boils: true, desc: 'Holds 4 portions. Boil water over a fire.' },
  // ---- medicine
  bandage: { name: 'Fiber Bandage', icon: 'bandage', w: 0.1, stack: 10, cat: 'medical', heal: 12, desc: 'Stops bleeding.' },
  aloe: { name: 'Healing Leaves', icon: 'aloe', w: 0.1, stack: 10, cat: 'medical', heal: 6, cure: true, desc: 'Settles the stomach and soothes wounds.' },
  // ---- tools (unique; durability)
  stoneAxe: { name: 'Stone Axe', icon: 'stoneAxe', w: 1.4, tool: 'axe', dur: 60, cat: 'tool', power: 1, desc: 'Chop trees and break rock.' },
  knife: { name: 'Flint Knife', icon: 'knife', w: 0.3, tool: 'knife', dur: 80, cat: 'tool', power: 1, desc: 'Butcher, carve and cut fiber.' },
  woodSpear: { name: 'Wooden Spear', icon: 'woodSpear', w: 1.2, tool: 'spear', dur: 30, cat: 'tool', dmg: 30, range: 2.2, desc: 'Fire-hardened point. Thrust or throw.' },
  stoneSpear: { name: 'Stone Spear', icon: 'stoneSpear', w: 1.6, tool: 'spear', dur: 60, cat: 'tool', dmg: 55, range: 2.4, desc: 'Heavy hunting spear.' },
  fishSpear: { name: 'Fishing Spear', icon: 'fishSpear', w: 1.2, tool: 'fishspear', dur: 50, cat: 'tool', dmg: 40, range: 2.0, desc: 'Three barbed prongs for spearfishing.' },
  fishingRod: { name: 'Fishing Rod', icon: 'fishingRod', w: 0.8, tool: 'rod', dur: 60, cat: 'tool', desc: 'Cast from shore, rocks or a dock.' },
  bow: { name: 'Hunting Bow', icon: 'bow', w: 1, tool: 'bow', dur: 80, cat: 'tool', dmg: 45, desc: 'Silent ranged hunting. Needs arrows.' },
  arrow: { name: 'Arrows', icon: 'arrow', w: 0.05, stack: 30, cat: 'ammo', desc: 'Flint-tipped.' },
  hammer: { name: 'Stone Hammer', icon: 'hammer', w: 1, tool: 'hammer', dur: 80, cat: 'tool', desc: 'Build, repair and upgrade structures.' },
  torch: { name: 'Torch', icon: 'torch', w: 0.5, tool: 'torch', dur: 240, cat: 'tool', burn: true, desc: 'Light in the dark. Burns out.' },
  trap: { name: 'Snare Trap', icon: 'trap', w: 0.8, stack: 5, cat: 'tool', place: 'trap', desc: 'Place on animal trails.' },
};

export const TOOL_IDS = Object.keys(ITEMS).filter((k) => ITEMS[k].tool);

// requires: needed tools in inventory; near: structure type nearby
export const RECIPES = [
  { id: 'rope', out: 'rope', n: 1, in: { fiber: 3 }, time: 1.5, cat: 'basics' },
  { id: 'rope3', out: 'rope', n: 3, in: { fiber: 8 }, time: 3, cat: 'basics' },
  { id: 'palmMat', out: 'palmMat', n: 1, in: { palmLeaf: 4, fiber: 2 }, time: 3, cat: 'basics' },
  { id: 'bandage', out: 'bandage', n: 1, in: { fiber: 3, palmLeaf: 1 }, time: 2, cat: 'basics' },
  { id: 'coconutFlask', out: 'coconutFlask', n: 1, in: { coconutShell: 2, fiber: 1 }, time: 2, cat: 'basics' },
  { id: 'stoneAxe', out: 'stoneAxe', n: 1, in: { stick: 2, stone: 1, rope: 1 }, time: 3, cat: 'tools' },
  { id: 'knife', out: 'knife', n: 1, in: { flint: 1, stick: 1, fiber: 1 }, alt: { stone: 2, stick: 1, fiber: 1 }, time: 2.5, cat: 'tools' },
  { id: 'hammer', out: 'hammer', n: 1, in: { stick: 1, stone: 1, rope: 1 }, time: 2.5, cat: 'tools' },
  { id: 'torch', out: 'torch', n: 1, in: { stick: 1, fiber: 2 }, time: 1.5, cat: 'tools' },
  { id: 'woodSpear', out: 'woodSpear', n: 1, in: { stick: 3 }, tools: ['knife'], time: 2.5, cat: 'weapons' },
  { id: 'stoneSpear', out: 'stoneSpear', n: 1, in: { stick: 3, flint: 1, rope: 1 }, alt: { stick: 3, stone: 2, rope: 1 }, time: 3, cat: 'weapons' },
  { id: 'fishSpear', out: 'fishSpear', n: 1, in: { stick: 3, rope: 2 }, tools: ['knife'], time: 3, cat: 'weapons' },
  { id: 'fishingRod', out: 'fishingRod', n: 1, in: { stick: 2, rope: 2, shell: 1 }, time: 3, cat: 'tools' },
  { id: 'bow', out: 'bow', n: 1, in: { hardwood: 1, rope: 2 }, tools: ['knife'], time: 4, cat: 'weapons' },
  { id: 'arrow', out: 'arrow', n: 5, in: { stick: 2, flint: 1, fiber: 2 }, alt: { stick: 2, bone: 1, fiber: 2 }, tools: ['knife'], time: 3, cat: 'weapons' },
  { id: 'trap', out: 'trap', n: 1, in: { stick: 3, rope: 2 }, tools: ['knife'], time: 3, cat: 'tools' },
  { id: 'clayPot', out: 'clayPot', n: 1, in: { clay: 3 }, near: 'campfire', time: 5, cat: 'tools' },
  { id: 'aloe', out: 'aloe', n: 2, in: { fiber: 2, fruit: 1 }, time: 2, cat: 'basics' },
];

// placeable structures (built via the build menu)
export const STRUCTURES = {
  campfire: { name: 'Campfire', in: { stone: 5, stick: 4 }, hp: 60, r: 1.2, desc: 'Cook, boil water, keep warm and light the night.', place: 'land', buildTime: 4 },
  cookingRack: { name: 'Cooking Rack', in: { stick: 4, rope: 2 }, hp: 50, r: 1.0, desc: 'Grill and smoke food. Place over a campfire.', place: 'land', near: 'campfire', buildTime: 4 },
  dryingRack: { name: 'Drying Rack', in: { stick: 6, rope: 2 }, hp: 50, r: 1.2, desc: 'Sun-dry fish and meat to preserve it.', place: 'land', buildTime: 5 },
  waterCollector: { name: 'Rain Collector', in: { palmLeaf: 4, stick: 3, coconutShell: 2 }, hp: 40, r: 0.9, desc: 'Funnels rain into clean drinking water.', place: 'land', buildTime: 4 },
  storageBasket: { name: 'Storage Basket', in: { palmLeaf: 6, fiber: 4 }, hp: 40, r: 0.6, desc: '16 slots. Slows food spoilage.', place: 'land', buildTime: 3 },
  palmShelter: { name: 'Palm Lean-to', in: { stick: 6, palmLeaf: 10, rope: 2 }, hp: 90, r: 2.0, desc: 'Keeps the rain off. Sleep safely.', place: 'land', buildTime: 7, shelter: 0.75, upgrade: 'woodenHut' },
  woodenHut: { name: 'Stilt Hut', in: { log: 8, stick: 8, palmLeaf: 16, rope: 6 }, hp: 220, r: 3.0, desc: 'A raised hut with a thatched roof. Best rest and storm protection.', place: 'land', buildTime: 12, shelter: 1.0 },
  raisedPlatform: { name: 'Raised Platform', in: { log: 6, stick: 6, rope: 4 }, hp: 160, r: 2.4, desc: 'A level deck on stilts. Stand and build on it.', place: 'any', buildTime: 8, floor: 1.1 },
  dock: { name: 'Fishing Dock', in: { log: 6, stick: 6, rope: 4 }, hp: 160, r: 1.6, desc: 'A jetty into the water. Fish and moor boats.', place: 'shore', buildTime: 8, floor: 0.9 },
  boatShelter: { name: 'Canoe Shelter', in: { log: 4, palmLeaf: 10, rope: 4 }, hp: 120, r: 3.0, desc: 'Protects a beached boat from storms.', place: 'beach', buildTime: 8 },
  raft: { name: 'Log Raft', in: { log: 6, rope: 6 }, hp: 80, r: 2, desc: 'Slow and unstable, but it floats. Comes with a paddle.', place: 'water', buildTime: 8, boat: 'raft' },
  canoe: { name: 'Dugout Canoe', in: { hardwood: 3, rope: 2 }, tools: ['stoneAxe'], hp: 120, r: 2, desc: 'Fast, nimble and holds cargo.', place: 'water', buildTime: 10, boat: 'canoe' },
  sailboat: { name: 'Outrigger Sailboat', in: { hardwood: 5, log: 2, rope: 8, palmMat: 4 }, tools: ['stoneAxe'], hp: 180, r: 3, desc: 'A sail for long crossings. Rides the wind.', place: 'water', buildTime: 14, boat: 'sailboat' },
};
