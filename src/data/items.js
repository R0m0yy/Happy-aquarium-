// Data-driven content tables: food, plants, decorations, substrates, backgrounds,
// lighting, equipment, tanks and rooms.

export const FOODS = [
  { id: 'flakes', name: 'Basic Flakes', cat: 'flake', price: 0, unit: 'Free refill', nutrition: 0.18, happy: 0.02, color: [0xd8a35a, 0xc0503a, 0x7fae4b], kind: 'flake', count: 22, desc: 'Floats on the surface for a moment before drifting down.' },
  { id: 'flakes_premium', name: 'Premium Flakes', cat: 'flake', price: 60, nutrition: 0.24, happy: 0.05, color: [0xf0b84a, 0xe0603a, 0x68c27a, 0x5aa0e0], kind: 'flake', count: 24, desc: 'Richer flakes that fish love. Small happiness boost.', unlock: 2 },
  { id: 'micro_pellets', name: 'Micro Pellets', cat: 'pellet', price: 40, nutrition: 0.22, happy: 0.03, color: [0x9c5a2c, 0xb06a34], kind: 'pellet', count: 20, desc: 'Tiny pellets that sink slowly through the water column.', unlock: 1 },
  { id: 'color_pellets', name: 'Color Pellets', cat: 'pellet', price: 90, nutrition: 0.22, happy: 0.04, beauty: 0.04, color: [0xe04a3a, 0xf08a2a], kind: 'pellet', count: 18, desc: 'Astaxanthin-rich pellets that intensify colours.', unlock: 3 },
  { id: 'algae_wafers', name: 'Algae Wafers', cat: 'wafer', price: 50, nutrition: 0.35, happy: 0.03, color: [0x4f7a2a], kind: 'wafer', count: 3, desc: 'Sink straight to the substrate for bottom dwellers.', unlock: 1 },
  { id: 'frozen', name: 'Frozen Bloodworms', cat: 'frozen', price: 80, nutrition: 0.3, happy: 0.08, color: [0x8a1d22, 0xa52a2a], kind: 'frozen', count: 3, desc: 'A frozen cube that breaks apart into wriggly morsels.', unlock: 2 },
  { id: 'veggie', name: 'Vegetable Mix', cat: 'veggie', price: 45, nutrition: 0.24, happy: 0.04, color: [0x6cc04a, 0x3f8f3a, 0xe0c040], kind: 'veggie', count: 14, desc: 'Blanched greens for grazers like mollies and tangs.', unlock: 2 },
  { id: 'treat', name: 'Species Treats', cat: 'treat', price: 10, currency: 'pearls', nutrition: 0.2, happy: 0.2, color: [0xffd27a, 0xff8fb0], kind: 'treat', count: 10, desc: 'Sparkling treats. Big happiness and bond boost.', unlock: 4 },
];
export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// Plant definitions; `model` keys into PlantModels builders.
export const PLANTS = [
  { id: 'anubias', name: 'Anubias', model: 'anubias', price: 120, unlock: 1, height: 0.22, color: 0x2f6b2c, zone: 'front', growth: 0.25, desc: 'Hardy broad-leaved rhizome plant. Grows slowly, loved as a resting spot.' },
  { id: 'javafern', name: 'Java Fern', model: 'javafern', price: 140, unlock: 1, height: 0.38, color: 0x3d7a32, zone: 'mid', growth: 0.35, desc: 'Long lance leaves that sway gracefully. Fish hide among them.' },
  { id: 'amazon', name: 'Amazon Sword', model: 'sword', price: 180, unlock: 1, height: 0.5, color: 0x3f8a36, zone: 'back', growth: 0.45, desc: 'A lush rosette of long sword-shaped leaves.' },
  { id: 'rotala', name: 'Rotala Red', model: 'rotala', price: 160, unlock: 1, height: 0.55, color: 0xc0402e, zone: 'back', growth: 0.7, desc: 'Fast-growing stems blushing red at the tips. Needs trimming.' },
  { id: 'vallisneria', name: 'Vallisneria', model: 'vallis', price: 130, unlock: 1, height: 0.85, color: 0x5a9a3c, zone: 'back', growth: 0.6, desc: 'Tall ribbon leaves that reach for the surface.' },
  { id: 'moss', name: 'Aquatic Moss', model: 'moss', price: 90, unlock: 1, height: 0.07, color: 0x3c7a2a, zone: 'front', growth: 0.3, desc: 'Soft carpet clumps; fry love to hide in it.' },
  { id: 'floaters', name: 'Floating Plants', model: 'floaters', price: 100, unlock: 2, height: 0.02, color: 0x6aaa3e, zone: 'surface', growth: 0.5, desc: 'Tiny round leaves drifting on the surface, casting dappled shade.' },
  { id: 'ludwigia', name: 'Ludwigia', model: 'ludwigia', price: 170, unlock: 2, height: 0.5, color: 0xa8502e, zone: 'mid', growth: 0.6, desc: 'Copper-red stems with oval leaves.' },
  { id: 'crypt', name: 'Cryptocoryne', model: 'crypt', price: 150, unlock: 2, height: 0.18, color: 0x6a5a2a, zone: 'front', growth: 0.3, desc: 'Wavy bronze leaves, perfect for midground.' },
  { id: 'hairgrass', name: 'Hairgrass', model: 'hairgrass', price: 110, unlock: 3, height: 0.14, color: 0x6fb244, zone: 'front', growth: 0.5, desc: 'Fine grassy tufts that spread into a meadow.' },
  { id: 'lotus', name: 'Tiger Lotus', model: 'lotus', price: 260, unlock: 4, height: 0.4, color: 0x9a2a3a, zone: 'mid', growth: 0.4, blooms: true, desc: 'Mottled crimson leaves. Occasionally blooms at the surface.' },
  { id: 'monte', name: 'Pearl Carpet', model: 'carpet', price: 140, unlock: 3, height: 0.04, color: 0x5ab03a, zone: 'front', growth: 0.4, desc: 'A dense, bright carpet that pearls with oxygen under strong light.' },
];
export const PLANT_BY_ID = Object.fromEntries(PLANTS.map((p) => [p.id, p]));

// Decorations. `model` keys into DecorModels builders; `seed` gives each
// variant a stable procedural shape.
export const DECOR = [
  // Rocks (10)
  { id: 'seiryu', name: 'Seiryu-style Stone', cat: 'rocks', model: 'rock', style: 'seiryu', price: 90, unlock: 1, scale: 1, seed: 11 },
  { id: 'lava', name: 'Lava Rock', cat: 'rocks', model: 'rock', style: 'lava', price: 70, unlock: 1, scale: 0.8, seed: 23 },
  { id: 'dragon', name: 'Dragon-style Stone', cat: 'rocks', model: 'rock', style: 'dragon', price: 120, unlock: 1, scale: 1, seed: 31 },
  { id: 'river', name: 'River Stone', cat: 'rocks', model: 'rock', style: 'river', price: 50, unlock: 1, scale: 0.7, seed: 41 },
  { id: 'slate', name: 'Slate Stack', cat: 'rocks', model: 'slate', style: 'slate', price: 110, unlock: 2, scale: 0.9, seed: 53 },
  { id: 'emberhole', name: 'Holey Ember Stone', cat: 'rocks', model: 'rock', style: 'holey', price: 130, unlock: 2, scale: 0.9, seed: 61 },
  { id: 'quartz', name: 'White Quartz', cat: 'rocks', model: 'rock', style: 'quartz', price: 160, unlock: 3, scale: 0.7, seed: 71 },
  { id: 'mossyboulder', name: 'Mossy Boulder', cat: 'rocks', model: 'rock', style: 'mossy', price: 140, unlock: 2, scale: 1.1, seed: 83 },
  { id: 'pebbles', name: 'Pebble Cluster', cat: 'rocks', model: 'pebbles', style: 'river', price: 60, unlock: 1, scale: 1, seed: 97 },
  { id: 'spire', name: 'Mountain Spire', cat: 'rocks', model: 'spire', style: 'seiryu', price: 220, unlock: 4, scale: 1, seed: 101 },
  // Driftwood (8)
  { id: 'spiderwood', name: 'Spider Wood', cat: 'driftwood', model: 'wood', style: 'spider', price: 150, unlock: 1, scale: 1, seed: 7 },
  { id: 'mopani', name: 'Mopani-style Wood', cat: 'driftwood', model: 'wood', style: 'mopani', price: 170, unlock: 1, scale: 1, seed: 13 },
  { id: 'manzanita', name: 'Manzanita Branch', cat: 'driftwood', model: 'wood', style: 'manzanita', price: 190, unlock: 2, scale: 1, seed: 19 },
  { id: 'roottangle', name: 'Root Tangle', cat: 'driftwood', model: 'wood', style: 'root', price: 160, unlock: 2, scale: 1, seed: 29 },
  { id: 'bonsai', name: 'Bonsai Driftwood', cat: 'driftwood', model: 'bonsai', style: 'mopani', price: 320, unlock: 4, scale: 1, seed: 37 },
  { id: 'stump', name: 'Old Stump', cat: 'driftwood', model: 'stump', style: 'root', price: 140, unlock: 2, scale: 1, seed: 43 },
  { id: 'archroot', name: 'Arch Root', cat: 'driftwood', model: 'archwood', style: 'spider', price: 210, unlock: 3, scale: 1, seed: 47 },
  { id: 'twig', name: 'Twig Bundle', cat: 'driftwood', model: 'wood', style: 'twig', price: 90, unlock: 1, scale: 0.8, seed: 59 },
  // Ornaments (15)
  { id: 'ruins', name: 'Ancient Ruins', cat: 'ornaments', model: 'ruins', price: 260, unlock: 1, scale: 1 },
  { id: 'temple', name: 'Sunken Temple', cat: 'ornaments', model: 'temple', price: 420, unlock: 3, scale: 1 },
  { id: 'arch', name: 'Stone Arch', cat: 'ornaments', model: 'arch', price: 180, unlock: 1, scale: 1 },
  { id: 'chest', name: 'Treasure Chest', cat: 'ornaments', model: 'chest', price: 220, unlock: 2, scale: 1 },
  { id: 'crystal', name: 'Crystal Formation', cat: 'ornaments', model: 'crystal', price: 30, currency: 'pearls', unlock: 3, scale: 1 },
  { id: 'shells', name: 'Shell Arrangement', cat: 'ornaments', model: 'shells', price: 120, unlock: 1, scale: 1 },
  { id: 'amphora', name: 'Amphora', cat: 'ornaments', model: 'amphora', price: 160, unlock: 2, scale: 1 },
  { id: 'guardian', name: 'Stone Guardian', cat: 'ornaments', model: 'guardian', price: 380, unlock: 3, scale: 1 },
  { id: 'lighthouse', name: 'Lighthouse', cat: 'ornaments', model: 'lighthouse', price: 300, unlock: 4, scale: 1 },
  { id: 'shipbow', name: 'Shipwreck Bow', cat: 'ornaments', model: 'ship', price: 450, unlock: 5, scale: 1 },
  { id: 'helmet', name: 'Diver Helmet', cat: 'ornaments', model: 'helmet', price: 280, unlock: 3, scale: 1 },
  { id: 'pagoda', name: 'Pagoda', cat: 'ornaments', model: 'pagoda', price: 340, unlock: 4, scale: 1 },
  { id: 'mushrooms', name: 'Glow Mushrooms', cat: 'ornaments', model: 'mushrooms', price: 20, currency: 'pearls', unlock: 2, scale: 1 },
  { id: 'lantern', name: 'Stone Lantern', cat: 'ornaments', model: 'lantern', price: 200, unlock: 2, scale: 1 },
  { id: 'tower', name: 'Castle Tower', cat: 'ornaments', model: 'tower', price: 360, unlock: 4, scale: 1 },
  // Caves (6)
  { id: 'caverock', name: 'Cave Rock', cat: 'caves', model: 'caverock', style: 'dragon', price: 180, unlock: 1, scale: 1, seed: 5, cave: true },
  { id: 'tunnel', name: 'Stone Tunnel', cat: 'caves', model: 'tunnel', style: 'seiryu', price: 200, unlock: 2, scale: 1, cave: true },
  { id: 'hollowlog', name: 'Hollow Log', cat: 'caves', model: 'log', price: 170, unlock: 1, scale: 1, cave: true },
  { id: 'coconut', name: 'Coconut Hut', cat: 'caves', model: 'coconut', price: 90, unlock: 1, scale: 1, cave: true },
  { id: 'tubes', name: 'Ceramic Tube Stack', cat: 'caves', model: 'tubes', price: 130, unlock: 2, scale: 1, cave: true },
  { id: 'archcave', name: 'Rock Arch Cave', cat: 'caves', model: 'archcave', style: 'lava', price: 260, unlock: 3, scale: 1, seed: 9, cave: true },
];
export const DECOR_BY_ID = Object.fromEntries(DECOR.map((d) => [d.id, d]));

export const SUBSTRATES = [
  { id: 'gravel', name: 'Natural Gravel', price: 0, colors: ['#c9b28a', '#8a7556', '#e6d6b0', '#5a4a38', '#a89070'], grain: 3.2, desc: 'Warm mixed gravel.' },
  { id: 'sand', name: 'White Sand', price: 150, colors: ['#f2ead8', '#e4d8bc', '#fffaf0', '#d6c8a8'], grain: 1.2, desc: 'Fine pale sand that brightens the scape.' },
  { id: 'soil', name: 'Black Aqua Soil', price: 220, colors: ['#2a2420', '#3a302a', '#1a1614', '#4a3e34'], grain: 2.2, desc: 'Nutrient-rich soil. Plants grow faster.', plantBonus: 0.3 },
  { id: 'pebble', name: 'River Pebbles', price: 180, colors: ['#9a9088', '#6e6660', '#c0b8ae', '#857a6e', '#504a46'], grain: 5.5, desc: 'Smooth polished pebbles.' },
  { id: 'coral', name: 'Coral Sand', price: 200, colors: ['#fbf3e4', '#f0dcc4', '#ffe9d4', '#e8cfb4'], grain: 1.6, desc: 'Bright aragonite sand for marine tanks.', marine: true },
];
export const SUBSTRATE_BY_ID = Object.fromEntries(SUBSTRATES.map((s) => [s.id, s]));

export const BACKGROUNDS = [
  { id: 'deepblue', name: 'Deep Blue', price: 0, desc: 'A luminous blue gradient that adds depth.' },
  { id: 'jungle', name: 'Planted Jungle', price: 200, desc: 'Silhouettes of distant aquatic forest.' },
  { id: 'cliffs', name: 'Rocky Cliffs', price: 220, desc: 'Layered stone walls fading into the haze.' },
  { id: 'black', name: 'Midnight Black', price: 120, desc: 'Makes colours pop with dramatic contrast.' },
  { id: 'frost', name: 'Frosted Glow', price: 15, currency: 'pearls', desc: 'Soft diffused white light, gallery style.' },
];
export const BACKGROUND_BY_ID = Object.fromEntries(BACKGROUNDS.map((b) => [b.id, b]));

export const LIGHTING = [
  { id: 'daylight', name: 'Daylight', price: 0, color: 0xf2f7ff, water: 0x1a6fa0, intensity: 1.0, desc: 'Balanced white light.' },
  { id: 'tropical', name: 'Tropical', price: 150, color: 0xd8f6ff, water: 0x0a8aa8, intensity: 1.1, desc: 'Crisp aqua tones.' },
  { id: 'planted', name: 'Planted Pro', price: 250, color: 0xfff1de, water: 0x2a7a6a, intensity: 1.15, desc: 'Warm full spectrum. Plants grow faster.', plantBonus: 0.25 },
  { id: 'sunset', name: 'Sunset Amber', price: 180, color: 0xffd2a0, water: 0x3a6a8a, intensity: 0.9, desc: 'Golden evening glow.' },
  { id: 'moonlight', name: 'Moonlight', price: 20, currency: 'pearls', color: 0x9ab8ff, water: 0x0a3a8a, intensity: 0.75, desc: 'Deep blue, mysterious and calm.' },
];
export const LIGHTING_BY_ID = Object.fromEntries(LIGHTING.map((l) => [l.id, l]));

export const EQUIPMENT = [
  { id: 'filter_basic', name: 'Basic Filter', slot: 'filter', price: 0, power: 1, desc: 'Keeps water moving.' },
  { id: 'filter_canister', name: 'Canister Filter', slot: 'filter', price: 900, unlock: 3, power: 1.6, desc: 'Much slower water decay.' },
  { id: 'filter_pro', name: 'Pro Bio Filter', slot: 'filter', price: 60, currency: 'pearls', unlock: 6, power: 2.3, desc: 'Water stays pristine far longer.' },
  { id: 'heater', name: 'Smart Heater', slot: 'heater', price: 300, unlock: 2, power: 1, desc: 'Holds the ideal temperature for your fish.' },
  { id: 'airstone', name: 'Bubble Wall', slot: 'air', price: 250, unlock: 1, power: 1, desc: 'More oxygen and a curtain of bubbles.' },
  { id: 'co2', name: 'CO₂ Diffuser', slot: 'co2', price: 500, unlock: 3, power: 1, desc: 'Plants grow 40% faster and pearl with oxygen.' },
  { id: 'uv', name: 'UV Clarifier', slot: 'uv', price: 700, unlock: 4, power: 1, desc: 'Algae and cloudiness build up much slower.' },
  { id: 'feeder', name: 'Auto Feeder', slot: 'feeder', price: 40, currency: 'pearls', unlock: 4, power: 1, desc: 'Keeps your fish fed while you are away.' },
];
export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]));

// Tank sizes. Dimensions are in world units (width, height, depth).
export const TANKS = [
  { id: 't20', name: '20 Gallon', w: 2.0, h: 0.95, d: 0.85, cap: 8, price: 0, unlock: 1 },
  { id: 't40', name: '40 Gallon', w: 2.5, h: 1.0, d: 0.95, cap: 12, price: 1500, unlock: 2 },
  { id: 't75', name: '75 Gallon', w: 3.0, h: 1.1, d: 1.05, cap: 18, price: 3500, unlock: 3 },
  { id: 't120', name: '120 Gallon', w: 3.5, h: 1.15, d: 1.12, cap: 24, price: 7000, unlock: 5 },
  { id: 't180', name: '180 Gallon', w: 4.0, h: 1.2, d: 1.2, cap: 32, price: 12000, unlock: 7 },
  { id: 't300', name: '300 Gallon', w: 4.6, h: 1.3, d: 1.3, cap: 42, price: 20000, unlock: 9 },
  { id: 'twall', name: 'Wall Aquarium', w: 5.4, h: 1.4, d: 1.0, cap: 48, price: 150, currency: 'pearls', unlock: 11 },
  { id: 'tshow', name: 'Custom Showcase', w: 6.0, h: 1.5, d: 1.4, cap: 60, price: 300, currency: 'pearls', unlock: 13 },
];
export const TANK_BY_ID = Object.fromEntries(TANKS.map((t) => [t.id, t]));

export const ROOMS = [
  { id: 'apartment', name: 'Starter Apartment', price: 0, unlock: 1, maxTank: 3, width: 12, wall: '#c9b9a6', floor: 'oak', view: 'city', desc: 'A cozy apartment with a glittering city view.' },
  { id: 'loft', name: 'Modern Loft', price: 6000, unlock: 4, maxTank: 4, width: 14, wall: '#8f8478', floor: 'walnut', view: 'mountains', desc: 'High ceilings, warm wood and mountain sunsets.' },
  { id: 'studio', name: 'Aquarium Studio', price: 14000, unlock: 6, maxTank: 5, width: 15, wall: '#3e4a52', floor: 'concrete', view: 'harbor', desc: 'A creative studio built around fishkeeping.' },
  { id: 'penthouse', name: 'Luxury Penthouse', price: 120, currency: 'pearls', unlock: 9, maxTank: 6, width: 16, wall: '#d8d2c8', floor: 'marble', view: 'skyline', desc: 'Floor-to-ceiling glass high above the city.' },
  { id: 'gallery', name: 'Aquarium Gallery', price: 45000, unlock: 11, maxTank: 7, width: 17, wall: '#20262c', floor: 'darkwood', view: 'night', desc: 'A dramatic gallery space for showcase tanks.' },
  { id: 'research', name: 'Ocean Research Room', price: 250, currency: 'pearls', unlock: 13, maxTank: 7, width: 17, wall: '#e2ebee', floor: 'concrete', view: 'ocean', desc: 'A seaside lab overlooking the open ocean.' },
];
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

// Room customisation options per category.
export const ROOM_OPTIONS = {
  walls: [
    { id: 'default', name: 'Room Default', price: 0 },
    { id: 'sage', name: 'Sage Plaster', price: 400, color: '#9fae95' },
    { id: 'navy', name: 'Deep Navy', price: 500, color: '#2a3550' },
    { id: 'cream', name: 'Warm Cream', price: 300, color: '#e8dcc6' },
    { id: 'terracotta', name: 'Terracotta', price: 500, color: '#b8735a' },
    { id: 'charcoal', name: 'Charcoal', price: 450, color: '#3a3a3e' },
  ],
  floor: [
    { id: 'default', name: 'Room Default', price: 0 },
    { id: 'oak', name: 'Honey Oak', price: 600 },
    { id: 'walnut', name: 'Walnut Planks', price: 800 },
    { id: 'darkwood', name: 'Smoked Wood', price: 900 },
    { id: 'marble', name: 'White Marble', price: 1200 },
    { id: 'concrete', name: 'Polished Concrete', price: 700 },
  ],
  rug: [
    { id: 'cream', name: 'Cream Shag', price: 0, color: '#d9cdb8' },
    { id: 'ocean', name: 'Ocean Wave', price: 350, color: '#4a7a9a' },
    { id: 'rust', name: 'Rust Kilim', price: 350, color: '#a0553a' },
    { id: 'none', name: 'No Rug', price: 0 },
  ],
  furniture: [
    { id: 'linen', name: 'Linen Sofa', price: 0, color: '#d6cfc4' },
    { id: 'velvet', name: 'Teal Velvet Sofa', price: 900, color: '#2f6b70' },
    { id: 'leather', name: 'Cognac Leather Sofa', price: 1200, color: '#8a4a28' },
    { id: 'mustard', name: 'Mustard Sofa', price: 800, color: '#c99a2e' },
  ],
  lighting: [
    { id: 'warm', name: 'Warm Glow', price: 0, color: 0xffb46b },
    { id: 'neutral', name: 'Neutral White', price: 300, color: 0xfff0dc },
    { id: 'rose', name: 'Rose Gold', price: 400, color: 0xffa08a },
    { id: 'cool', name: 'Cool Moon', price: 400, color: 0xbfd6ff },
  ],
  plants: [
    { id: 'lush', name: 'Lush Jungle', price: 0 },
    { id: 'minimal', name: 'Minimal Greens', price: 200 },
    { id: 'tropical', name: 'Tropical Palms', price: 600 },
  ],
  artwork: [
    { id: 'fishprints', name: 'Fish Prints', price: 0 },
    { id: 'waves', name: 'Wave Studies', price: 300 },
    { id: 'botanical', name: 'Botanical Plates', price: 300 },
    { id: 'abstract', name: 'Abstract Tide', price: 500 },
  ],
  shelves: [
    { id: 'walnut', name: 'Walnut Shelves', price: 0, color: '#4a2f1e' },
    { id: 'oak', name: 'Light Oak Shelves', price: 400, color: '#b08a5a' },
    { id: 'black', name: 'Black Steel Shelves', price: 500, color: '#222226' },
  ],
  view: [
    { id: 'default', name: 'Room Default', price: 0 },
    { id: 'city', name: 'City Lights', price: 500 },
    { id: 'mountains', name: 'Mountain Lake', price: 500 },
    { id: 'harbor', name: 'Harbor Bay', price: 600 },
    { id: 'ocean', name: 'Open Ocean', price: 700 },
    { id: 'forest', name: 'Misty Forest', price: 600 },
  ],
  cabinet: [
    { id: 'walnut', name: 'Walnut Cabinet', price: 0, color: '#4a2e1c' },
    { id: 'white', name: 'Gloss White', price: 700, color: '#e8e6e2' },
    { id: 'black', name: 'Matte Black', price: 700, color: '#1e1e22' },
    { id: 'oak', name: 'Natural Oak', price: 700, color: '#a8804e' },
  ],
  decorations: [
    { id: 'cozy', name: 'Cozy Clutter', price: 0 },
    { id: 'collector', name: 'Collector Shelf', price: 500 },
    { id: 'zen', name: 'Zen Minimal', price: 400 },
  ],
};
export const ROOM_OPTION_LABELS = {
  walls: 'Walls', floor: 'Floor', rug: 'Rugs', furniture: 'Furniture', lighting: 'Lighting', plants: 'Plants',
  artwork: 'Artwork', shelves: 'Shelves', view: 'Window View', cabinet: 'Aquarium Cabinet', decorations: 'Decorations',
};

export const CHARACTER_OPTIONS = {
  skin: ['#f6d7c3', '#eac0a0', '#d9a07a', '#b97a52', '#8d5a3a', '#5e3a26'],
  hairStyle: [
    { id: 'curly', name: 'Curly' },
    { id: 'short', name: 'Short' },
    { id: 'bob', name: 'Bob' },
    { id: 'bun', name: 'Bun' },
    { id: 'spiky', name: 'Spiky' },
    { id: 'long', name: 'Long' },
  ],
  hairColor: ['#4a2a1a', '#2a1a12', '#7a4a2a', '#c8904a', '#e8c890', '#1a1a1e', '#b8462e', '#6a7ab8', '#e88aa8'],
  top: [
    { id: 'hoodie', name: 'Hoodie' },
    { id: 'tee', name: 'T-Shirt' },
    { id: 'sweater', name: 'Sweater' },
  ],
  topColor: ['#f1ece4', '#3a5a8a', '#e0a040', '#5a8a5a', '#c84a5a', '#2a2a30', '#9a7ac8', '#f2b8c8'],
  pants: ['#2a3a5a', '#3a3a40', '#8a7050', '#5a6a4a', '#c8c0b0', '#6a3a3a'],
  shoes: ['#f4f4f2', '#2a2a2e', '#c84a3a', '#4a7ac8', '#e0c050'],
  accessory: [
    { id: 'none', name: 'None' },
    { id: 'glasses', name: 'Round Glasses' },
    { id: 'cap', name: 'Cap' },
    { id: 'headphones', name: 'Headphones' },
    { id: 'scarf', name: 'Scarf' },
  ],
};
