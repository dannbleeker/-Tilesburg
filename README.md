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
| `B` / `R` / `W` | Bulldozer / Road / Power line |
| `Z` / `X` / `C` | Residential / Commercial / Industrial zone |
| `P` / `N` | Coal plant / Nuclear plant |
| `Esc` | Pan mode |
| `Space` | Pause toggle |
| `0` `1` `2` `3` | Paused / slow / normal / fast |

## Status

Phase 2 of 7 (power + zones) — see `DESIGN.md` for the data model and tick
pipeline, and `ART_DIRECTION.md` for the visual rules. Working now: seeded
deterministic terrain (5 curated starter maps + random), bulldozer, roads and
bridges, power lines with road crossings and underwater cables, R/C/I zones
(§100) that grow through five density stages, coal (§3000) and nuclear (§5000)
plants, power grid flood-fill with blinking unpowered bolts, an RCI demand
model driving an always-visible indicator, drag placement with live cost
readout, camera pan/zoom, four sim speeds, and a 58-test Vitest suite over the
sim core.

Coming next per the delivery plan: traffic/pollution/crime/land value +
overlay maps + query tool, budget cycle + evaluation, disasters, scenarios +
ordinances, and the final polish pass (audio, minimap, save/load).
