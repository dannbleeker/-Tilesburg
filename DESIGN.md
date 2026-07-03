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

| Field | Type | Contents |
|---|---|---|
| `tiles` | `Uint16Array` | Base tile type per cell (see below) |
| `flags` | `Uint8Array` | Bit flags per cell (powered, conductor, burnable, …) |
| `funds` | `number` | Player money in §  |
| `cityTime` | `number` | Sim ticks since founding; 16 ticks = 1 month, start Jan 1900 |
| `rngState` | `number` | Current PRNG state (serialized with the city) |
| `seed` | `number` | The seed the map was generated from |

### Tile encoding

`tiles` stores a *semantic type*, not a sprite index. Visual variants (road connection
shapes, water edges, animation frames) are derived at render time from the neighborhood,
so the sim never deals in art.

Phase-1 types (`src/sim/constants.ts`):

```
0 Dirt   1 Water   2 Tree   3 Rubble   4 Road   5 Bridge (road over water)
```

Later phases append zone tiles. Zones (3×3) will be encoded as a *center* tile carrying
the zone type + growth stage, with the 8 surrounding cells marked as zone-member tiles
pointing at their center via offset — the same trick the original used. Per-cell scalar
fields (pollution, land value, crime, traffic density, population density) each get their
own `Uint8Array`/`Uint16Array` overlay added in phase 3; they are *derived* maps
recomputed by the tick pipeline, not authored state.

### Flags

`flags` is reserved now so the save format doesn't churn later:
bit 0 `POWERED`, bit 1 `CONDUCTOR`, bit 2 `BURNABLE`, bit 3 `BULLDOZABLE`.
Phase 1 only writes `BULLDOZABLE`-equivalent knowledge implicitly (the tools consult the
tile type); the power bits light up in phase 2.

## Tick pipeline

One call to `tick(city)` advances `cityTime` by 1. The full pipeline, in order (phase
that implements each stage in brackets):

1. Advance clock; fire month/year boundaries [1]
2. Power grid scan — flood-fill from plants through conductors [2]
3. Zone scan (staggered: ⅛ of the map per tick) — growth/decay decisions using demand,
   power, transport access, land value [2/3]
4. Traffic generation & decay [3]
5. Pollution / land value / crime diffusion passes (staggered, every N ticks) [3]
6. Disaster progression (fire spread, flood, monster movement…) [5]
7. RCI demand re-evaluation from census + external market [2]
8. January: budget collection (taxes − funding) unless auto-budget [4]
9. Census & evaluation bookkeeping [4]

Phase 1 implements stage 1 and stubs the rest behind a fixed ordered list so later
phases slot in without reordering. Stages that the original staggered across "passes"
keep that behavior (documented per stage) so the performance and *feel* (gradual map
updates) match.

## Time & money

- 16 ticks = 1 month; 192 ticks = 1 year. Start date January 1900. At normal speed
  (4 ticks/s) a month passes every 4 s.
- Starting funds: §20,000 (easy difficulty default; difficulty selection arrives with
  the content phase).
- Phase-1 tool costs (original values): bulldozer §1/tile, road §10/tile on land,
  §50/tile over water (bridge). Building over trees auto-bulldozes (+§1).

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

## Persistence (design, lands in phase 7)

The save is `{ version, seed, rngState, cityTime, funds, tiles, flags, …overlays }` with
typed arrays base64-encoded — JSON export/import and localStorage autosave share the
same codec. Because the RNG state is saved, a loaded city continues deterministically.

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
and no pollution. Traffic decays multiplicatively between passes.

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

## Phase status

Phase 1: scaffold, RNG, city state, terrain + 5 curated maps, tick clock, tile
renderer + camera, bulldozer/road tools, chrome, tests. Phase 2: power grid +
wire tools, R/C/I zones with growth stages, coal/nuclear plants, RCI demand model +
indicator, unpowered bolts. Phase 3: rail + level crossings, police/fire stations,
trip generation with access gating, traffic/pollution/land value/crime/coverage/
population maps, 9 overlay views, query tool.

Stubbed: budget/funding/evaluation, disasters, scenarios, ordinances, minimap,
save/load, audio, plant capacity limits, traffic animation.
