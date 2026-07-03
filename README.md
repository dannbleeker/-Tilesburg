# Tilesburg

A browser city-building game inspired by the classic 1989 city simulator —
a clean-room implementation, faithful in mechanics, with modern flat-geometric
art generated entirely in code.

**Stack:** TypeScript (strict) · PixiJS · Vite · Vitest. No backend, no binary
assets.

## Run it

```bash
npm install
npm run dev        # dev server
npm test           # sim engine unit tests
npm run build      # typecheck + production build
```

## Controls

| Input | Action |
|---|---|
| Left drag (tool active) | Paint road / bulldoze along the pointer path |
| Left drag (Pan mode), or middle/right drag | Pan the map |
| Mouse wheel, `+` / `-` | Zoom (anchored at cursor) |
| Arrow keys | Pan |
| `B` / `R` / `T` / `W` | Bulldozer / Road / Rail / Power line |
| `Z` / `X` / `C` | Residential / Commercial / Industrial zone |
| `O` / `F` | Police station / Fire station |
| `P` / `N` | Coal plant / Nuclear plant |
| `Q` | Query tool |
| `M` | Cycle overlay maps |
| `G` / `E` | Budget window / City evaluation |
| `Esc` | Pan mode |
| `Space` | Pause toggle |
| `0` `1` `2` `3` | Paused / slow / normal / fast |

## Status

Phase 5 of 7 (chaos) — see `DESIGN.md` for the data model and tick
pipeline, and `ART_DIRECTION.md` for the visual rules. Working now: seeded
deterministic terrain (5 curated maps + random), roads/bridges, rail with
level crossings and water trestles, power lines with crossings and underwater
cables, R/C/I zones growing through five density stages gated on power *and*
road/rail access to counterpart zones, coal/nuclear plants, police and fire
stations, trip-based traffic that pollutes roads and fades over time,
pollution/land value/crime/population/coverage maps, 9 overlay views, a query
tool, the RCI demand indicator, an annual budget cycle (0–20% property tax,
police/fire/transit funding sliders, auto-budget, infrastructure decay when
transit is underfunded), a city evaluation window, and all seven disasters —
fire (suppressed by fire coverage), flood, tornado, earthquake, monster
(hunts pollution), plane crash, and nuclear meltdown with radioactive
fallout — random (toggleable) or triggered from the Disasters menu, with a
message ticker. 101-test Vitest suite.

Coming next per the delivery plan: scenarios + ordinances +
stadium/seaport/airport, then the final polish pass (audio, minimap,
save/load, traffic animation).
