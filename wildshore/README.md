# WILDSHORE: Alone in the Wild

A 2.5D isometric wilderness survival game built with three.js (WebGL2). It is set on a small tropical archipelago. You are a lone castaway who has to find water, food and shelter, build boats, spearfish the reefs, hunt, and survive day after day.

This is the **tropical-island vertical slice**. Everything listed under "Implemented" can be played now. Larger expansions are listed separately under "Planned", and nothing in that list is in the game yet.

## Run it

Serve the repository root (or the `wildshore/` folder) with any static web server, then open `wildshore/index.html`:

```bash
python3 -m http.server 8080
# open http://localhost:8080/wildshore/
```

ES modules need HTTP, so opening the file straight from disk won't work. It runs in current Safari (iPhone/iPad), Chrome, Edge and Firefox. WebGL2 is required.

Useful URL flags:

| Flag | Effect |
| --- | --- |
| `?q=low\|medium\|ultra` | Force a graphics preset (default: Medium on phones/tablets, Ultra on desktop) |
| `?autostart` | Skip the title screen and start a new game (`?autostart=continue` loads the save) |
| `&t=18.5` | Start at a given hour (with `autostart`) |
| `&w=storm` | Force weather: `clear`, `cloudy`, `rain`, `heavyRain`, `fog`, `storm` |

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Left stick (push to the rim to run) |
| Sprint / sneak | Shift / C | Run / Sneak buttons |
| Interact (gather, drink, cook, board…) | E | E button (glows when something is in reach) |
| Use tool (chop, stab, cast, place a building) | Click / F | Use button |
| Throw spear / draw bow | Hold Click/F, then release | Hold Use, then release |
| Dive / surface | Space / X | Dive / Up buttons (shown when swimming) |
| Pack, Build, Map | Tab, B, M | Pack button → tabs |
| Equip tools | 1–8, H to holster | Tap the hotbar |
| Camera | Right-drag or Q/R to rotate, wheel to zoom | One-finger drag to rotate, pinch to zoom |

## Implemented

**World & rendering**
- An archipelago of five islands with an analytic height field: Castaway Key (beach camp, palm interior, a freshwater spring, a lookout hill, a rocky east shore, a south-east reef and a boat cove), Hunter's Island (hardwood forest, a creek and wild pigs), Rocky Island (basalt cliffs, flint, seabird nests), Mangrove Island (tidal flats, mangroves, clay) and the Outer Reef (a sand cay inside a ring reef).
- A custom GLSL ocean:
  - Swell and chop from five Gerstner waves. A CPU copy of the same waves drives boat buoyancy.
  - Three scrolling normal-map layers.
  - Refraction of the opaque scene, using a depth/colour pre-pass.
  - Per-channel absorption based on the real water thickness, giving a transparent turquoise near shore and deep sapphire offshore.
  - Depth-tinted scattering, subsurface glow on wave crests, Fresnel sky reflection, sun and moon glints with sparkle.
  - Shoreline contact foam, rolling surf lines, swash run-up, whitecaps in storms, rain rings and interaction ripples.
  - An underwater view with a Snell's-window effect.
- Animated caustics on everything below the waterline. The seabed, coral and fish are real geometry seen through the water.
- Day/night cycle (24 real minutes by default; adjustable). Weather runs as a state machine: clear, overcast, rain, heavy rain, sea fog and tropical storm with lightning and thunder. Weather drives the waves, wind sway, fog, temperature, fires, rain collection and boat handling.
- A procedural sky with sun, moon, stars and drifting clouds.
- Instanced, chunked vegetation and props with distance LOD and wind animation in the shaders: coconut palms, tropical hardwoods, mangroves, shrubs, ferns, broadleaf plants, grass, beach morning-glory, rocks and cliffs, driftwood, fallen logs, shells, pebbles and fallen fronds. Underwater there are brain, staghorn and table corals, sea fans, seagrass, anemones, urchins and giant clams.
- Foliage that sits between the camera and the survivor dithers out, so the survivor stays visible.
- Graphics presets (Low, Medium, Ultra) plus adaptive resolution scaling.

**Survivor**
- A rigged, skinned human model with Idle/Walk/Run clip blending.
- Procedural animation layers authored in character space: crouch, chop, gather, spear thrust, throw, aim, eat, drink, kneel-and-drink, hammer, cook, carry, swim (freestyle), treading water, dive (frog-kick with pitch), spear-stab underwater, sit, paddle, sleep, limp, hurt and fishing cast.
- Locomotion with acceleration and turning, slope slowdown, steep-slope blocking and collisions.
- Visible equipment held in the hands, plus a backpack and a straw hat.

**Survival**
- Health, hunger, thirst, energy, stamina, body temperature, wetness, oxygen, sickness, bleeding and sprains.
- Weather, sun, fire, shelter and exertion all affect these meters.
- Food spoils over time. Raw food and untreated water can make you ill.
- Tools lose durability as you use them.

**Harvesting & crafting**
- Gathering is animated, and the resource on the island visibly disappears (and regrows days later).
- Shake coconuts down, pull fronds, chop palms and hardwood (trees fall after several hits), and quarry rock for stone and flint.
- You can also gather fiber, driftwood, shells and shellfish; grab crabs; dig clay; search nests for eggs; collect urchins; and pry pearls from giant clams.
- 17 recipes: cordage (two batch sizes), mats, bandages, flasks, axe, knife, hammer, torch, three spear types, fishing rod, bow, arrows, clay pot and healing leaves.

**Fire, food & water**
- Campfire with fuel, rain extinguishing it, light and heat.
- Grill on the fire, or on a cooking rack with 8 slots. Fish left on the rack long enough becomes smoked fish, and anything left too long burns.
- A drying rack preserves food using sun and time; rain ruins it.
- Boil water in a clay pot. A rain collector gathers clean water. The spring is drinkable but carries a risk.

**Building**
- Placement preview with validation: terrain, slope, overlaps, trees, shoreline and depth rules, materials and tools.
- Construction is animated, and a hammer speeds it up.
- Structures: campfire, cooking rack, drying rack, rain collector, storage basket, palm lean-to, stilt hut (an upgrade from the lean-to), raised platform with steps, fishing dock, canoe shelter and spring-pole snare traps (which catch small game while you are away, more often in the forest).
- Structures take storm damage and can be repaired.
- Docks and platforms are walkable. Storage keeps food fresher.

**Ocean gameplay**
- Swim, dive and surface, with oxygen management and drowning.
- Boids fish schools in five species (including a realistic Barramundi model) with habitat depths. They avoid the seabed and surface, flee divers, boats and sharks, and dodge when they are alert.
- Spearfishing works underwater or from the shallows, and you can also throw a spear into the water. Rod fishing uses a cast, wait, bite and strike timing.
- Reef sharks are drawn by blood in the water and fish you are carrying. They circle and bite, and a spear hit drives them off.

**Boats**
- Three boats: log raft, dugout canoe and outrigger sailboat.
- Boat physics:
  - Four-point buoyancy that follows the waves, with pitch and roll.
  - Paddle thrust and turning, with keel drag and wind drift.
  - Sailing based on the wind angle, with a no-go zone.
  - Grounding, plus collision damage on reefs and rocks.
- Wakes, storm damage and repair. Each boat has a cargo hold you can open from the boat and that is saved with the game.

**Wildlife AI**
- Every animal is driven by needs, senses and states. Vision cones and hearing are scaled by how much noise you make, so crouching makes you quieter.
- Ghost crabs scuttle away and can be grabbed if you sneak.
- Seabirds take flight, circle and land.
- Monitor lizards bask and dart.
- Wild pig herds graze, drink at the creek, rest at night, become alert and flee. Boars may charge, and wounded pigs limp.
- Green turtles cruise the reef and surface to breathe.
- Hunting covers thrusts, thrown spears, the bow and aim assist. Carcasses can be butchered with a knife.

**UI, audio & saving**
- HUD with vitals, status chips, clock and weather, current goal, a contextual prompt, a hotbar with quick-eat, and toasts.
- Pack, Craft, Build, Map (fog of war plus wind) and Journal tabs; a storage panel; and title, pause, settings, help, credits and death screens.
- Touch controls for iPhone and iPad, with safe-area-aware layout.
- Procedural WebAudio soundscape: surf that follows the nearest shore, wind, rain, thunder, birds and insects by day and night, fire crackle, an underwater muffle and bubbles, footsteps that depend on the surface, chopping, splashes and animal calls.
- Local save (localStorage): autosave each morning and on sleep. Continue, Save, and Save & Quit options.

## Planned (not implemented)

- **Additional survival maps:** African Savanna, Northern Wilderness and Dense Jungle, each with its own wildlife and survival pressures.
- **Systems:** building pieces you can design freely, and animated snare catches.
- **Assets:** skeletal animal models from licensed sources once they are available. The current animals are procedural part rigs.

## Project layout

```
wildshore/
  index.html, css/style.css
  src/main.js                 bootstrap & frame loop
  src/game.js                 orchestration, interactions, tools, building, boating, sleep, saving
  src/render/                 two-pass pipeline, shader patches, textures, geometry helpers, particles
  src/world/                  islands/height field, terrain, ocean, sky, flora, props, scatter, structures, boats
  src/actors/                 survivor, pose rig, equipment, fish, wildlife
  src/systems/                environment (time & weather), survival, inventory
  src/ui/                     HUD/menus/panels, painted item icons
  src/audio/                  procedural WebAudio
  assets/models, assets/textures
  vendor/three                three.js r170 + GLTFLoader/BufferGeometryUtils/SkeletonUtils
```

Asset sources and licences are listed in [ASSETS.md](ASSETS.md).
