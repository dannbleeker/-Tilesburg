# CLAUDE.md — working notes for AI sessions

Tilesburg is a complete, playable clean-room browser clone of the 1989 classic
city simulator. All 7 delivery phases are done and deployed. This file is the
session handoff: read it first, then `DESIGN.md` (authoritative for the data
model and tick pipeline) and `ART_DIRECTION.md` (mandatory before drawing any
new art). `README.md` covers player-facing controls and hosting.

## State of the project

- Live at https://dannbleeker.github.io/-Tilesburg/ via `.github/workflows/deploy.yml`
  (build → test → publish to GitHub Pages on every push; a transient
  "Deployment failed, try again later" from deploy-pages just needs a re-run).
- History is one commit per phase — `git log --oneline` is the build story.
  Development happened on `claude/tilesburg-simcity-clone-gtlypk`; `main`
  mirrors it.
- 118 Vitest tests, all sim-level and Node-only (no DOM needed). CI runs them.

## Commands

```bash
npm run dev        # Vite dev server
npm test           # Vitest (headless sim tests; slowest file ~15s, timeout 30s)
npm run build      # tsc --noEmit && vite build → dist/ (fully static)
```

## Architecture contract (do not break these)

1. **`src/sim/` is headless and deterministic.** No DOM, no PixiJS, no
   `Date.now()`/`Math.random()` — every random draw goes through `city.rng`
   (serializable mulberry32). Same seed + same actions ⇒ identical city; a
   test asserts tick-for-tick determinism and another asserts save/load
   resume. If you add randomness outside `city.rng`, you break saves.
2. **The renderer only reads.** `src/render/renderer.ts` diffs shadow copies
   of tiles/stage/power/traffic each frame and re-textures changed cells plus
   their 4 neighbors (connection-aware art). All grid mutation goes through
   `src/sim/tools.ts` or sim systems.
3. **Tick pipeline order is fixed** (see `src/sim/tick.ts` and DESIGN.md).
   New systems slot into the existing order; never reorder stages.
4. **All art is programmatic** — canvas-drawn tileset (`src/render/tileset.ts`),
   inline SVG UI icons, synthesized audio (`src/audio/audio.ts`). Never commit
   binary assets. Follow ART_DIRECTION.md's palette/rules and document new
   sprites there *before* drawing them.
5. **Save format**: `src/sim/save.ts` serializes authored state only (derived
   overlay maps are recomputed on load). Any change to persisted `City` fields
   needs a `SAVE_VERSION` bump + migration or explicit rejection, and the
   round-trip tests updated.

## File map

- `src/sim/` — constants (tile ids, costs, footprints), city state (typed
  arrays + anchor/stage building encoding), rng, terrain gen + starter maps,
  tick pipeline, tools, power flood-fill, zones growth, demand valves,
  traffic BFS trips, diffusion maps, budget, evaluation, disasters,
  ordinances, scenarios, save codec, query.
- `src/render/` — palette tokens, tileset generation, layered renderer
  (ground/buildings/crossing-overlays/bolts/actors/heat-overlay), camera.
- `src/ui/` — DOM chrome (`ui.ts`: toolbar/topbar/modals/cheat), minimap.
- `src/input.ts` — pointer/touch/wheel/keys; pinch-zoom lives here.
- `src/main.ts` — wiring + game loop (fixed-timestep accumulator).
- `test/` — one file per system; tests build tiny flat cities with
  `city.tiles.fill(Tile.Dirt)` and drive real ticks.

## Verification workflow (how previous sessions tested)

Unit tests are not enough for UI/renderer work — drive the real game:

```bash
npm run build && npx vite preview --port 4173 --strictPort &
# then playwright-core (installed in the session scratchpad, not the repo)
# against the preinstalled Chromium, e.g. executablePath:
#   /opt/pw-browsers/chromium-1194/chrome-linux/chrome   (check /opt/pw-browsers)
```

Screenshot and read the frames; several real bugs (unpowered scenario towns,
instant scenario wins, a Chromium raster artifact) were only visible this way.
For mobile, use a touch device profile and dispatch synthetic PointerEvents
for pinch.

## Gotchas learned the hard way

- **Opaque fixed DOM over the WebGL canvas leaves white raster damage in
  software-rendered Chromium.** Every floating element uses `opacity: 0.98`
  (see `.query-popup` in `style.css`). Keep doing this for new overlays.
- **Pixi is pinned to WebGL** (`preference: 'webgl'` in main.ts) — WebGPU on
  software renderers shows the same class of artifacts.
- **Roads don't conduct power.** Zones need wires or building-adjacency;
  scenario street grids are `RoadWire` crossings for exactly this reason
  (regression test in `test/content.test.ts`).
- Tile ids are a `const` object, not a TS `enum` (isolatedModules);
  `noUncheckedIndexedAccess` is deliberately off for typed-array ergonomics.
- The 500 ms `waterFrame` flip in the renderer is the global animation clock
  (water, fire, flood, traffic cars, coal smoke, bolt blink) — hook new
  animations into it rather than adding timers.
- Vite `base: './'` keeps the app working from the `/-Tilesburg/` Pages
  subpath — don't change it to absolute.
- Cheat: typing `fund` grants §10,000 (handled in `ui.ts` `feedCheat`; it
  restores the tool selected before the letters walked over hotkeys).
- Balance tuning lives in plain numbers near the top of each sim file
  (demand valve formula, growth chances, decay rates); tests pin behavior
  ranges, not exact values, so retuning is safe within reason.

## Deliberate simplifications (documented, not bugs)

No power plant capacity/brownouts, free-form bridges (original required
straight spans), no stadium crowd animation, no rail+wire three-way stacks.
Listed at the end of DESIGN.md — good candidates for future work.
