# Asset sources & licences

| Asset | File | Source | Licence / terms |
| --- | --- | --- | --- |
| Survivor character, skeleton and Idle/Walk/Run/T-pose clips | `assets/models/survivor.gltf.json` | three.js examples, `examples/models/gltf/Soldier.glb` (a Mixamo character), with textures downsized to 1024 px using gltf-transform and repacked as self-contained glTF JSON | Distributed with three.js (MIT repository). The character comes from Adobe Mixamo, whose terms allow royalty-free use in games and other projects but not redistribution as a standalone asset. Recolored in-engine. |
| Barramundi fish | `assets/models/fish.gltf.json` | Khronos Group glTF Sample Assets, `Models/BarramundiFish` (Microsoft), with textures resized to 512 px | CC0 1.0 for the model files |
| Water normal map | `assets/textures/waternormals.jpg` | three.js examples, `examples/textures/waternormals.jpg` | three.js repository, MIT |
| three.js r170 and addons | `vendor/three/` | npm `three@0.170.0` | MIT (see `vendor/three/LICENSE`) |

## Procedural content (generated at runtime by this project)

These are built in code with no external art files:
- **Plants:** coconut palms (curved ringed trunks; V-folded, alpha-tested fronds; coconuts), tropical hardwoods, mangroves with prop roots, shrubs with flowers, ferns, broadleaf plants, grass tufts and beach morning-glory.
- **Rocks and debris:** noise-displaced rocks and cliffs, driftwood, logs, shells, starfish, pebbles and fallen fronds.
- **Reef:** brain, staghorn and table coral, sea fans, seagrass, anemones, urchins and giant clams.
- **Structures and boats:** round poles with rope lashings, split planks and layered frond/thatch roofs; the raft, canoe hull loft and outrigger sail.
- **Animals:** crabs, seabirds, lizards, pigs, turtles and reef sharks.
- **Textures:** bark, wood grain with knots, thatch, rope, stone, foliage cards, sea-fan lattice and terrain detail, all painted on canvas.
- **Inventory icons:** all painted on canvas.
- **Audio:** the whole soundscape is synthesized with WebAudio.

## Why these sources

The build environment could only reach GitHub and npm. Poly Haven, ambientCG, Kenney, Quaternius and Sketchfab were blocked. Where those libraries would normally have supplied vegetation, rock and texture assets, this project generates them procedurally instead, to a consistent art direction.
