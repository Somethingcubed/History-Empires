TexturePacker workflow (optional HD sprites)
===========================================

1. Create PNG frames named: infantry.png archer.png miner.png tower.png (or add more keys — update frame names in JS draw calls).

2. TexturePacker → Data format “JSON (hash)” → publish battle-atlas.json + battle-atlas.png into this folder.

3. The game loads automatically from:
     assets/battle/battle-atlas.json
     assets/battle/battle-atlas.png
   (paths relative to empire-timeline/)

4. Trim / rotation supported; frame keys must match strip-extension names (e.g. infantry.png → drawSprite(..., "infantry", ...)).

5. Free packs: https://kenney.nl/assets — merge into one sheet with TexturePacker for fewer draw calls.

Without these files the canvas falls back to procedural vector art.
