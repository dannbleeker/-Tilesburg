# CLAUDE.md — working notes for AI sessions

Tilesburg is a complete, playable clean-room browser clone of the 1989 classic
city simulator. All 7 delivery phases are done and deployed. This file is the
session handoff: read it first, then `DESIGN.md` (authoritative for the data
model and tick pipeline) and `ART_DIRECTION.md` (mandatory before drawing any
new art). `README.md` covers player-facing controls and hosting.

## State of the project

- Live at https://dannbleeker.github.io/-Tilesburg/ via `.github/workflows/deploy.yml`
  (`npm ci` → `npm test` → `npm run build` → publish to GitHub Pages, on every push
  to `main`; a transient "Deployment failed, try again later" from deploy-pages just
  needs a re-run from the Actions tab).
- `main` is the only branch — the original development branch was deleted after the
  merge. History is roughly one commit per delivery phase, so `git log --oneline` is
  the build story.
- 133 Vitest tests, all sim-level and Node-only (no DOM needed). CI runs them.
  `test/regressions.test.ts` pins previously-fixed bugs; if you touch save,
  coverage/funding, traffic tuning or scenario goals, read it first — those
  cases exist because each of them broke once.

## Commands

```bash
npm run dev        # Vite dev server
npm test           # Vitest (headless sim tests; ~40s total, slowest file ~26s,
                   #   slowest single test ~13s against the 30s per-test timeout)
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
   round-trip tests updated. Currently at v2 (v1 still loads; `pendingBudget`
   defaults to null). When you add a `City` field, ask first whether it is
   *authored* — if so it MUST round-trip, and `test/regressions.test.ts` should
   grow a case. `pendingBudget` was missed exactly this way and silently ate a
   year's budget out of every autosave.
6. **Loading is not the same as priming.** `primeDemand()` is for *fresh*
   cities (census + demand + maps). A loaded city must call
   `recomputeDerivedMaps()` only — re-running the census would discard restored
   demand/census and re-fire that year's messages.

## File map

- `src/sim/` — constants (tile ids, costs, footprints), city state (typed
  arrays + anchor/stage building encoding), rng, terrain gen + starter maps,
  tick pipeline, tools, power flood-fill, zones growth, demand valves,
  traffic BFS trips, diffusion maps, budget, evaluation, disasters,
  ordinances, scenarios, save codec, query.
- `src/render/` — palette tokens, tileset generation, layered renderer
  (ground/buildings/crossing-overlays/bolts/actors), `overlay.ts` (the 10 city-map
  views: heat-ramp canvas + power/transport modes), camera.
- `src/ui/` — DOM chrome (`ui.ts`: toolbar/topbar/modals/cheat), minimap.
- `src/audio/audio.ts` — Web Audio SFX, ambient hum, procedural music. No assets.
- `src/style.css` — all chrome styling (note the `opacity: 0.98` gotcha below).
- `src/input.ts` — pointer/touch/wheel/keys; pinch-zoom lives here.
- `src/main.ts` — wiring + game loop (fixed-timestep accumulator).
- `test/` — one file per system; tests build tiny flat cities with
  `city.tiles.fill(Tile.Dirt)` and drive real ticks.

## Verification workflow (how previous sessions tested)

Unit tests are not enough for UI/renderer work — drive the real game:

```bash
npm run build && npx vite preview --port 4173 --strictPort &
# Drive it with Playwright. Keep it out of package.json — it is a debugging tool,
# not a dependency of the game:
#   npm i --no-save playwright-core && npx playwright install chromium
# then launch with Playwright's own browser resolution (chromium.launch({})).
```

Earlier sessions ran inside a sandbox with Chromium preinstalled at
`/opt/pw-browsers/...` and passed an explicit `executablePath`. That path is
sandbox-specific — do not expect it to exist.

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
- **Deposit and decay rates must be tuned as a pair.** `TRIP_LOAD`
  (traffic.ts) and `decayTraffic`'s cadence (every 4 ticks, from `tick.ts`)
  set the equilibrium `load / (1 - decay^interval)`. They were once far apart
  and every routed road pinned at 255, which silently made the renderer's
  mid-traffic art unreachable and turned a scenario goal into a coin flip.
- **Scenario goals must be checked against an idle run.** A goal measured on
  a quantity that drifts (or on a one-shot seeded fill) can complete itself
  with no player input. `sustainedChecks` on a `ScenarioDef` requires N
  consecutive passing checks; `test/regressions.test.ts` asserts Bern 1965
  both fails when idle and is winnable by converting streets to rail.
- Coverage maps take funding as a **required** argument on purpose — the old
  default of 1 let a caller rebuild them as if every department were fully
  funded.

## Deliberate simplifications (documented, not bugs)

No power plant capacity/brownouts, free-form bridges (original required
straight spans), no stadium crowd animation, no rail+wire three-way stacks.
Listed at the end of DESIGN.md — good candidates for future work.
