# Tilesburg — Design Document

Tilesburg is a clean-room, browser-based city simulator faithful to the mechanics of the
classic 1989 city-building game. This document defines the data model, the simulation
tick pipeline, and the architectural rules that every phase builds on.

## Architecture rules

1. **The simulation is headless.** Everything under `src/sim/` is plain TypeScript
   operating on typed arrays and numbers. It never imports PixiJS, the DOM, or anything
   under `src/render/` / `src/ui/`. This makes the whole engine unit-testable in Node.
2. **The simulation is deterministic.** All randomness flows through a single seeded
   PRNG (`mulberry32`) stored on the city state. Same seed + same player actions in the
   same tick order ⇒ identical city, forever. `Date.now()` / `Math.random()` are banned
   in `src/sim/`.
3. **Rendering is a pure function of state.** The renderer diffs a shadow copy of the
   tile grid each frame and only re-textures cells that changed (plus their 4 neighbors,
   for connection-aware tiles like roads). The sim never calls into the renderer.
4. **Fixed-timestep sim, free-running render.** `requestAnimationFrame` drives drawing
   at up to 60 fps; an accumulator converts wall time into whole sim ticks at the current
   speed (slow = 1 tick/s, normal = 4, fast = 12; pause = 0).

## Map & tile data model

- Map size: **120 × 100** tiles (`MAP_W × MAP_H`), matching the original.
- Index convention: `i = y * MAP_W + x`. `x` grows east, `y` grows south.

The city state (`src/sim/city.ts`) is a plain object of typed arrays:

Authored state (persisted; see "Persistence"):

| Field | Type | Contents |
|---|---|---|
| `tiles` | `Uint16Array` | Semantic tile type per cell (see below) |
| `flags` | `Uint8Array` | Bit flags per cell — see "Flags" |
| `anchor` | `Int32Array` | For a building cell, the index of its footprint's top-left cell; -1 elsewhere |
| `stage` | `Uint8Array` | Zone growth stage 0–4; meaningful only at anchor cells |
| `trafficDensity` | `Uint8Array` | Road load 0–255 (authored by trip generation, so it is saved) |
| `funds` | `number` | Player money in § |
| `cityTime` | `number` | Sim ticks since founding; 16 ticks = 1 month |
| `startYear` | `number` | Clock year at founding (1900, or the scenario's year) |
| `rng` | `Rng` | Seeded mulberry32; `rng.state` is saved as `rngState` |
| `seed` | `number` | The seed the map was generated from |

Plus scalar game state: `taxRate`, `funding`, `autoBudget`, `pendingBudget`, `demand`,
`census`, `lastYearPop`, `ordinances`, `scenario`, `disastersEnabled`, `monster`,
`tornado`, `floodTicks`, `messages`.

**Derived** maps — `pollution`, `landValue`, `crime`, `popDensity`, `policeCov`,
`fireCov` — are `Uint8Array` overlays recomputed by the tick pipeline and deliberately
*not* saved; `recomputeDerivedMaps()` rebuilds them on load.

### Tile encoding

`tiles` stores a *semantic type*, not a sprite index. Visual variants (road connection
shapes, water edges, animation frames) are derived at render time from the neighborhood,
so the sim never deals in art. `Tile` in `src/sim/constants.ts` is the authoritative
list (25 ids, `Dirt` through `Airport`); it is not transcribed here because a copy would
drift.

**Buildings** (3×3 zones and stations, 4×4 plants, 6×6 airport) are stored per-cell, not
as a center tile with offsets: every covered cell carries the building's tile type, so
power conduction and bulldozing stay simple per-cell operations. `anchor[i]` points every
covered cell at the footprint's top-left cell, and a cell is the anchor exactly when
`anchor[i] === i` — that is the idiom the whole codebase uses to iterate buildings once.
`stage[anchor]` holds the growth stage.

### Flags

Per-cell bits in `flags` (`Flag` in `src/sim/constants.ts`):

- bit 0 `Powered` — set by the power flood-fill each tick.
- bit 1 `Access` — set on a zone anchor when trip generation found a transport route to
  a counterpart zone; required to grow past stage 1.
- bit 2 `Burnable` — reserved; fire currently decides flammability from the tile type.

Conduction is *not* a flag: it is the pure function `isConductor()` on the tile type.

## Tick pipeline

One call to `tick(city)` advances `cityTime` by 1. This order is fixed — new systems slot
into it, they do not reorder it. It matches `src/sim/tick.ts` exactly:

1. Advance clock.
2. Power grid scan — flood-fill from plants through conductors.
3. Zone scan (staggered: ⅛ of the map per tick) — growth/decay from demand, power and
   transport access.
4. Traffic generation — trips from the same ⅛ slice.
5. Derived maps: traffic decay every 4 ticks; then one map per staggered monthly phase
   (population → pollution → coverage → land value → crime), ordered so each reads fresh
   upstream data.
6. Disaster progression (fire spread, flood, actors, the random-disaster roll).
7. Monthly (`cityTime % 16 === 0`): census, then RCI demand re-evaluation.
8. Scenario check — win/lose predicate, twice a month.
9. January (`cityTime % 192 === 0`): infrastructure decay, budget assessment, then either
   auto-settle or post `pendingBudget` for the player; snapshot population for net
   migration.

Stages the original staggered across "passes" keep that behavior, so the performance and
*feel* (gradual map updates) match.

## Time & money

- 16 ticks = 1 month; 192 ticks = 1 year. Start date January 1900 for sandbox maps;
  scenarios set their own `startYear`. At normal speed (4 ticks/s) a month passes
  every 4 s.
- Starting funds: §20,000 in sandbox; each scenario overrides it.
- Tool costs live in `COST` (`src/sim/constants.ts`) and follow the original's prices:
  bulldozer §1, road §10 (§50 as a bridge), rail §20 (§100 over water), power line §5
  (§25 underwater), zones §100, police/fire §500, coal §3000, nuclear §5000,
  stadium §3000, seaport §5000, airport §10000. Building over trees auto-bulldozes (+§1
  per tile).

## Terrain generation

`generateTerrain(seed, params)` produces the map deterministically:

1. Fill with dirt.
2. Optional **coast**: carve an ocean band along one edge, with a 1-D random-walk
   shoreline so it reads organic.
3. **River**: meandering random walk from one map edge to another, width 2–4, with a
   50% chance of a tributary branching midway.
4. **Lakes**: 0–3 elliptical blobs.
5. **Forests**: cluster seeds grown by random blob expansion, plus light scatter.
   Trees never overwrite water.

Five curated starter maps (`STARTER_MAPS`) are named seed+parameter presets chosen for
good build space, plus a "Random" option that rolls a fresh seed.

## Tools

`applyTool(city, tool, x, y)` validates terrain + funds and mutates the grid, returning
`{ ok, cost, reason }`. Drag placement rasterizes the pointer path with Bresenham
between successive cells so fast mouse moves leave no gaps — matching the original's
"paint as you drag" behavior — while the UI shows a running §-cost readout at the
cursor. All mutation goes through the tools module; the renderer never writes tiles.

## Persistence (phase 7)

`src/sim/save.ts` is a pure city ↔ JSON codec: all authored state (tiles, flags,
anchors, stages, traffic, scalars, ordinances, scenario progress, disaster actors,
an unsettled January budget, RNG state) with typed arrays base64-encoded. Derived
overlay maps are recomputed on load via `recomputeDerivedMaps()` — which seeds
police/fire coverage at the city's *stored funding*, since rebuilding it at full
funding would change fire spread and crime and break the resume guarantee.
localStorage autosave (every sim year), three manual slots, and JSON file
export/import all share the codec. Because the RNG state is saved, a loaded city
continues deterministically — verified by a tick-for-tick equality test.

Format is **v2**; v1 saves still load with `pendingBudget` defaulting to null.
Every grid payload is length-checked on load, so a truncated array is rejected
rather than quietly poisoning the census with NaN.

## Audio (phase 7)

Everything is synthesized with the Web Audio API — no audio assets. SFX (place,
bulldoze, error, disaster alarm, budget chime) are short envelope blips or filtered
noise; the ambient city hum is a low sawtooth chord whose gain tracks population;
music is two alternating 16-step A-pentatonic patterns on soft triangle voices with
an occasional low fifth. SFX and music mute independently and persist. The context
unlocks on the first user gesture per browser autoplay policy.

## Art direction

See `ART_DIRECTION.md`. Summary: crisp flat-geometric tiles at 24 px, warm restrained
palette, all textures generated programmatically on a canvas at boot (no binary assets
in the repo), nearest-neighbor scaling for a clean look at every zoom.

## Buildings & zones (phase 2)

Multi-tile buildings (3×3 zones, 4×4 plants) are stored as: every covered cell gets
the building's tile type (so power conduction and bulldozing stay per-cell simple),
plus `anchor: Int32Array` mapping each covered cell to its footprint's top-left cell
(-1 elsewhere), plus `stage: Uint8Array` holding the growth stage at anchor cells.
Bulldozing any cell levels the whole footprint to rubble, like the original.

**Power**: `scanPower` clears all POWERED bits then flood-fills (4-connected) from
plant cells through conductors — wires, underwater cables, road/wire crossings, and
building cells. A zone develops only if its anchor is powered; unpowered zones decay
and show the blinking bolt. Plant output capacity (brownouts) is deferred.

**Zone growth**: the scan is staggered (⅛ of the map per tick). A powered zone grows
a stage with probability scaled by its demand valve minus a rising per-stage bar, so
high density needs strong demand; strongly negative demand (and power loss) decays.
Transport access joins the requirements in phase 3.

**Demand**: monthly census (population = stage × 8 per zone) feeds three valves in
[-1500, 1500]: residents chase jobs + a fixed external market, commerce serves the
labor pool, industry employs it. Tax, pollution, unemployment, and the stadium/
seaport/airport cap-lifters plug in during later phases.

## Traffic, overlays & derived maps (phase 3)

**Trips**: every zone anchor periodically BFSes from its perimeter through the
road/rail network (≤ 40 steps) for a counterpart zone type — R seeks C/I jobs, C and
I seek R. Success sets the anchor's ACCESS flag (required to grow past stage 1) and
deposits traffic along the route's *road* tiles; rail carries trips with no traffic
and no pollution.

Traffic decays multiplicatively every 4 ticks — the same cadence trips are
generated on. Deposit size (`TRIP_LOAD`) and decay interval together fix the
equilibrium, so they are tuned as a pair: when decay ran only monthly against a
32-per-trip load, every routed tile pinned at the 255 ceiling and the density map
became binary. A lightly-used street now settles in the low tens and only genuinely
shared arteries approach the ceiling, which is what the renderer's three traffic
art tiers and the Bern scenario's congestion goal both read.

**Derived maps** (all `Uint8Array`, 0..255, recomputed on a staggered monthly
schedule ordered so downstream reads fresh upstream): population density (zone
stages, smoothed), pollution (industry + coal + traffic, 2 blur passes), police/fire
coverage (station seeds spread by 6 blur passes; funding scales reach in phase 4),
land value (water/tree amenity + population-centroid centrality − pollution −
crime), crime (population pressure − land value − police coverage, smoothed).

**Overlay view**: a 1-px-per-tile canvas stretched over the map (nearest scaling)
with a green→yellow→red heat ramp; power and transport get categorical modes. The
query tool reads the same arrays.

Rendering note: fully-opaque fixed DOM over the WebGL canvas triggers white raster
damage in software-rendered Chromium; floating UI uses `opacity: 0.98` to sidestep
it (see `style.css`).

## Budget & evaluation (phase 4)

Each January the pipeline: decays under-funded infrastructure (every road/rail
tile risks crumbling with probability 0.12 × the transit funding gap; spans over
water wash away), assesses the year (tax income = zone population × rate × yield;
maintenance §100/station, §1/road tile, §2/rail tile), then settles silently under
auto-budget or posts a `pendingBudget` the UI turns into the pausing budget
window. Funding sliders (0–100%) live on the city and scale police/fire coverage
reach and transit decay. Tax rate drags all three demand valves (±60/point around
the 7% default). Funds may go negative (debt) — the tools already refuse to build
while broke.

The evaluation window computes on demand: population (zone pop × 20), city class
(Village → Megalopolis), net migration vs. last January, assessed value, mayor
approval (crime/pollution/traffic averages, tax excess, unemployment, blackout
fraction), and the top-4 complaints above a nuisance threshold.

## Disasters (phase 5)

All seven, manually triggerable from the Disasters menu and rolled randomly
(toggleable) once a month at low odds, weighted toward fire. Everything runs on
the city RNG inside the tick, so disasters replay deterministically.

- **Fire** — a tile type. Spreads every other tick to trees (20%) and building
  cells (10%, leveling the footprint); fire coverage damps ignition by up to 80%
  and speeds burnout. Burnt cells become rubble.
- **Flood** — rises from shoreline tiles, creeps over land/buildings while a
  global countdown runs, then recedes to dirt (30% rubble).
- **Tornado / monster** — roaming actors stored on the city (`x, y, ttl, dir`).
  The tornado drunk-walks from the north edge wrecking its path; the monster
  comes ashore aimed at the max-pollution cell, stomps a wider trail, starts
  fires, and wanders off when bored.
- **Earthquake** — instant scattered destruction plus a few ignitions.
- **Plane crash** — a 3×3 blast with fires at a random site.
- **Meltdown** — needs a nuclear plant: the footprint burns and radioactive
  tiles scatter nearby. Radioactive land can't be bulldozed and blocks building.

Sim → UI messaging: `city.messages` queue drained by the ticker each frame.

## Content (phase 6)

**Cap-lifters**: stadium (§3000, 4×4), seaport (§5000, 4×4), airport (§10000,
6×6). Without them each sector's demand valve is clamped to fade out as its
population approaches a cap (R 1200 / I 700 / C 700 zone-pop); the census tracks
presence and the ticker nags yearly when a cap binds. Seaport and airport add
pollution sources.

**Ordinances**: 10 toggles on `city.ordinances`, defined in `ordinances.ts` with
an annual § effect that flows into the budget's `ordinanceNet` line, plus factor
hooks read by crime (gambling/anti-drug/watch), pollution (controls/energy
conservation), demand (clinics/smoking ban/reading/tourism/parking/controls), and
approval. Deliberately mild — they shade the RCI loop, never dominate it.

**Scenarios**: the eight classics in `scenarios.ts`. Each defines terrain, start
year (the clock is city-relative now), funds, a hand-authored starting city
(stamped road-grid towns with powered zones at a given stage, plants, stations,
and cap-lifters for the big metropolises), an optional start/recurring disaster,
a win predicate checked twice a month, and a deadline. Outcomes land on
`city.scenario.outcome`; the UI shows briefing and verdict modals, and the city
keeps simulating afterward either way. Win targets sit meaningfully above the
stamped starting populations so recovery scenarios demand actual rebuilding.

A goal measured on a fluctuating quantity can be satisfied by a lucky sample, so
`ScenarioDef.sustainedChecks` requires N consecutive passing checks (tracked as
`scenario.streak`). Bern 1965 uses it: its goal counts *congested* road tiles
rather than a map-wide traffic average — an average is dominated by the many
empty streets in a grid and improves when you pave more road, which is the
opposite of the intended lesson. Every scenario must be verified to fail an idle
run and to be winnable by fair play; both directions are asserted in
`test/regressions.test.ts`.

## Phase status

Phase 1: scaffold, RNG, city state, terrain + 5 curated maps, tick clock, tile
renderer + camera, bulldozer/road tools, chrome, tests. Phase 2: power grid +
wire tools, R/C/I zones with growth stages, coal/nuclear plants, RCI demand model +
indicator, unpowered bolts. Phase 3: rail + level crossings, police/fire stations,
trip generation with access gating, traffic/pollution/land value/crime/coverage/
population maps, 9 overlay views, query tool. Phase 4: annual budget cycle with
tax + funding sliders, infrastructure decay, auto-budget, evaluation window.
Phase 5: all seven disasters with random rolls, the Disasters menu, and the
message ticker queue. Phase 6: stadium/seaport/airport cap-lifters, the
10-ordinance layer, and the eight classic scenarios with briefing/verdict flow.
Phase 7: save/load (autosave + slots + JSON export/import), minimap with
click-to-jump, synthesized audio (SFX / ambient hum / procedural music), and
traffic + smokestack animation.

All seven phases delivered. Known deliberate simplifications: no power plant
output capacity (grids never brown out), free-form bridges (the original
required straight spans), stadium crowds are not animated, and rail/wire
three-way stacks are out of scope.
