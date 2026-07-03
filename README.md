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
| `R` / `B` / `Esc` | Road / Bulldozer / Pan mode |
| `Space` | Pause toggle |
| `0` `1` `2` `3` | Paused / slow / normal / fast |

## Status

Phase 1 of 7 (engine skeleton) — see `DESIGN.md` for the data model and tick
pipeline, and `ART_DIRECTION.md` for the visual rules. Working now: deterministic
seeded terrain generation with 5 curated starter maps + random maps, tile
renderer with dirty-diffing and water animation, connection-aware road art,
camera pan/zoom, bulldozer + road/bridge tools with drag placement and live
cost readout, sim clock with speed controls, and a Vitest suite over the sim
core (RNG, terrain, tools, city state).

Coming next per the delivery plan: power + RCI zones, traffic/pollution/crime/
land value + overlays, budget cycle, disasters, scenarios + ordinances, and the
final polish pass (audio, minimap, save/load).
