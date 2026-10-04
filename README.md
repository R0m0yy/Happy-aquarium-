# AQUARIA — Living Aquarium

A premium browser aquarium life-sim: a big glass aquarium inside a cozy, furnished room, a miniature keeper who physically cares for the fish, a cat who watches them, and fish with their own personalities, genetics and families.

Everything (models, fish, textures, audio, music) is generated procedurally at runtime: no binary art assets and no build step.

## Run it

Serve the folder with any static web server and open it in a modern browser (WebGL2):

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Opening `index.html` straight from disk won't work, because ES modules need HTTP.

Useful URL flags for development:

| Flag | Effect |
| --- | --- |
| `?q=low\|medium\|high\|ultra` | Force a graphics quality preset |
| `?nointro` | Skip the opening fly-through |

Your progress is saved locally in IndexedDB. Settings → Reset save erases it.

## Controls

| | Desktop | Touch |
| --- | --- | --- |
| Select a fish / object | Click | Tap |
| Look around | Drag | Drag |
| Pan | Right-drag or Shift-drag | Two-finger drag |
| Zoom | Mouse wheel | Pinch |
| Detailed fish info and family tree | — | Long-press a fish |
| Decorate | Drag objects, **R** rotate, **[ ]** scale, **Del** delete, **Ctrl+Z / Ctrl+Y** | Tap to select, drag to move, toolbar buttons |
| Feed | **F** | Feed button |

## What's in the game

- **Room & aquarium:** a furnished room with real depth (sofa, rug, shelves, lamps, houseplants, windows with a city or mountain view) and a rimless glass tank with glowing edges. The tank has a wavy water surface with ripples, moving caustics, depth tint, light rays, bubbles, floating particles, a substrate cross-section and an algae layer on the glass.
- **Day/night:** Morning, Day, Sunset and Night. Lamps switch on at sunset, the tank light turns moonlight-blue at night, and fish rest.
- **Fish:** 12 freshwater and 6 marine species built procedurally: body profile, tail and fin shapes, eyes and gills. Each fish has a painted pattern generated from its genes. Swimming is animated with tail-beat body bending, fin flutter, pectoral sculling, banking and eye tracking. Babies have their own proportions and pale colouring.
- **Fish AI:** steering-based wandering, schooling, separation, obstacle avoidance against decor, preferred depth, feeding on individual food particles, resting at night, hiding, curiosity (following your cursor or finger), territory, bottom foraging (corydoras) and glass grazing (pleco). Personality traits change how each fish behaves.
- **Keeper:** walks with acceleration and A* navigation around the furniture. To feed, they fetch the step stool, carry it over, climb up and shake food into the tank. They also wipe the glass, take photos, point while you decorate, sit and watch the fish, pet the cat, look out the window, wave at bonded fish and celebrate. Hairstyle, clothes and accessories can be customised.
- **Cat (Miso):** wanders, watches fish at the glass, sleeps on the sofa, grooms, stretches, follows the keeper and can be petted.
- **Care:** you scrub algae off the glass and vacuum gravel by dragging; water changes and filter maintenance are one tap each. Water quality covers cleanliness, oxygen, temperature and population, rated EXCELLENT to CRITICAL.
- **Plants & decor:** 12 plants that sway, grow, bloom and can be trimmed, plus 39 decorations (rocks, driftwood, ornaments and caves), 5 substrates, 5 backgrounds and 5 lighting presets. Decorate mode edits the tank in place with move, rotate, scale, delete, undo and redo.
- **Genetics & breeding:** every gene has two alleles with dominance rules. Babies inherit traits, and mutations can appear (colour shifts, patterns, markings, long fins, bioluminescence). Rarity runs COMMON to MYTHIC. Fish grow through EGG → FRY → JUVENILE → YOUNG ADULT → ADULT, and the game keeps a nursery tank and family trees.
- **Progression:** coins and pearls (both earned in play, with no purchases or ads), XP and levels with unlocks, a quest chain, achievements, weekly live events, mail, a collection book with silhouettes and records, fish training (6 tricks) and bond moments.
- **Expansion:** tank sizes from 20 gallons up to a custom showcase, up to 5 aquariums (including a nursery and a marine reef tank), 6 rooms and 11 room-customisation categories.
- **Photography:** hide the UI, zoom, focus on a fish, the keeper or the whole tank, and preview the time of day. Photos are saved to an in-game gallery and can be downloaded.
- **Audio:** synthesised filter hum, water, bubbles, feeding, cleaning, footsteps, cat sounds, UI and reward sounds, and a generative soft-piano and pad score.
- **Persistence:** IndexedDB saves with versioned migrations and offline progression (eggs hatch and fish grow while you're away, and nothing dies).
- **Performance:** one render loop, instancing for bubbles, food, pebbles and debris, cached geometry, LOW/MEDIUM/HIGH/ULTRA presets and automatic quality fallback.

## Code layout

```
src/
  main.js                 boot + loading screen
  core/                   Game (loop, input, actions), GameState, SaveSystem, EventBus, util
  data/                   species, items (food/plants/decor/tanks/rooms…), progression tables
  render/                 Renderer (post FX, quality), RoomBuilder, props, textures, materials (tank shaders),
                          TimeOfDay, PreviewRenderer (thumbnails & live previews)
  aquarium/               AquariumView (glass/water/substrate…), FishGeometry, FishPainter, FishActor (AI),
                          FishManager, FoodSystem, PlantModels/PlantSystem, DecorModels/DecorationSystem
  actors/                 CharacterModel, Character (animation, tasks, idle AI), Cat, NavGrid (A*)
  camera/                 CameraController
  audio/                  AudioManager (Web Audio synthesis)
  systems/                Genetics, Simulation (needs, growth, breeding, water, offline, beauty), Progression
  ui/                     UIManager, Panels, Tutorial, icons
vendor/three/             three.js r170 (MIT) and the few addons used
```

Content is data-driven. To add a species, add an entry to `src/data/species.js` (body profile, fins, behaviour, gene pools). You can optionally add a painter "look" in `FishPainter.js`.
