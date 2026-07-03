# Tilesburg — Art Direction

## The style: "Crisp Flat Geometric"

One coherent style across every tile, sprite, and UI element: **flat geometric shapes,
hard edges, no gradients, no outlines**, rendered at a fixed 24 × 24 px tile size and
scaled with nearest-neighbor so zooming stays crisp. Detail comes from *shape and a
restrained second tone*, never from noise or texture photography. Think modern flat
illustration meeting classic tile grids.

All art is generated programmatically (Canvas 2D at boot, or inline SVG for UI icons).
No binary image assets are ever committed to the repo.

## Rules

1. **Tile size** is 24 px. Everything snaps to a 2 px sub-grid inside the tile (12 × 12
   effective cells) — no shape edge may land on an odd pixel. This keeps the flat look
   deliberate rather than fuzzy.
2. **No outlines.** Shapes are separated by value contrast, not strokes. The map grid
   itself is implied by a 1 px darker edge on the south and east of ground tiles only.
3. **Light comes from the north-west.** Any tile that fakes elevation (buildings, tree
   canopies) puts its lighter tone toward the top-left and its shade toward the
   bottom-right. One highlight tone + one shade tone maximum per element.
4. **Two tones per material.** Every material is exactly a base color plus one accent
   (lighter or darker by a fixed step in HSL lightness, ±8–12). Never three.
5. **Animation is minimal and functional**: 2–3 frame loops, 500 ms cadence. Water
   shimmers, smokestacks puff, traffic dots move. Nothing bounces or squashes.
6. **Readability beats decoration.** Zone colors are reserved and never reused for
   terrain: Residential = green family, Commercial = blue family, Industrial =
   yellow/ochre family (matching the classic mental model). Powered/unpowered is shown
   with the classic blinking lightning-bolt glyph in high-contrast yellow.

## Palette

A single fixed palette; new art picks from it, never invents colors ad hoc.

| Token | Hex | Use |
|---|---|---|
| `ground` | `#c9b581` | dirt/base land |
| `groundShade` | `#b9a571` | land checker accent, tile edges |
| `water` | `#2e6f9e` | open water |
| `waterHi` | `#4a8dbd` | wave dashes, shore lapping |
| `treeDark` | `#3e6b3a` | canopy base |
| `treeHi` | `#548a4b` | canopy light side |
| `asphalt` | `#4b4f55` | road surface |
| `asphaltHi` | `#5d626a` | road edge wear |
| `laneline` | `#d8d3c0` | road lane markings |
| `rubble` | `#8a8377` | bulldozed debris |
| `rubbleHi` | `#a09a8d` | debris highlights |
| `wireYellow` | `#e3b93d` | power lines, unpowered bolt |
| `uiBg` | `#20242b` | chrome background |
| `uiPanel` | `#2a2f38` | panels, buttons |
| `uiText` | `#e8e6df` | primary text |
| `uiAccent` | `#e3b93d` | funds, active tool, warnings |
| `pad` | `#9aa0a8` | concrete pad under developed buildings |
| `padShade` | `#8a909a` | pad south/east edge |
| `steel` | `#7b8087` | rail trestle decks |
| `steelHi` | `#9298a1` | rails |
| `alertRed` | `#c0483e` | fire station identity, disaster effects |
| `alertRedHi` | `#d4675d` | fire-red NW-light tone |
| `rZone` | `#3f8f4f` | residential identity color |
| `rZoneHi` | `#54a862` | residential NW-light tone |
| `cZone` | `#3f6fb5` | commercial identity color |
| `cZoneHi` | `#5c8bc9` | commercial NW-light tone |
| `iZone` | `#c2a23c` | industrial identity color |
| `iZoneHi` | `#d4b954` | industrial NW-light tone |

## UI chrome

Dark, quiet chrome (`uiBg`/`uiPanel`) so the sunlit map is the brightest thing on
screen. Buttons are flat rectangles with a 2 px accent underline when active. Icons are
single-color inline SVG glyphs drawn on the same 24 px grid discipline as the tiles.
Font: system UI stack; tabular numerals for funds and date.

## Per-tile specs (phase 1)

- **Dirt** — `ground` fill, sparse 2 px `groundShade` flecks (deterministic pattern,
  4 variants), 1 px `groundShade` south+east edge.
- **Water** — `water` fill; 2–3 horizontal 4×2 px `waterHi` dashes that alternate
  position across 2 animation frames.
- **Trees** — dirt base; 2–3 overlapping `treeDark` rounded canopies with `treeHi` on
  the NW arc. 4 deterministic variants keyed on tile position.
- **Road** — `asphalt` full-bleed with connection-aware `laneline` markings: dashes run
  along the axis of travel; intersections get no dashes, just the asphalt plate. 16
  variants from the 4-neighbor connection mask. `asphaltHi` 1 px edge on unconnected
  sides.
- **Bridge** — road plate narrowed by 4 px, `water` visible on both sides, `asphaltHi`
  guard rails.
- **Rubble** — dirt base scattered with 3–5 `rubble`/`rubbleHi` chips.

## Per-tile specs (phase 2)

- **Power line** — dirt base; 2 px `wireYellow` strokes running center-to-edge along
  each connection, 4×4 `asphalt` pole where they meet. Over roads, just the strokes
  on transparency layered above the road plate. Underwater cable: dashed
  `wireYellow` run on water.
- **Zone plate (stage 0)** — land plate with a 2 px identity-color border inset 2 px,
  identity-color letter glyph (R/C/I) centered. The glyph is typography, not
  outline art, and doubles as the colorblind-safe zone identity.
- **Zone stages 1–4** — `pad` base; deterministic cluster of NW-lit blocks in the
  identity color pair, count and size scaling with stage; `laneline` window dots
  from stage 2; stage 4 is a single full-plate structure.
- **Coal plant** — `pad` base, `asphalt`/`asphaltHi` halls, two smokestack circles
  (`rubbleHi` ring, `asphalt` bore), `wireYellow` bolt emblem. Stack smoke animates
  in the polish phase.
- **Nuclear plant** — `pad` base, hall, NW-lit containment dome (`uiText` over
  `rubble`), `wireYellow` trefoil badge.
- **Unpowered bolt** — `wireYellow` lightning glyph on the zone's center tile,
  blinking at the 500 ms global cadence.

## Per-tile specs (phase 3)

- **Rail** — dirt base; two 2 px `steelHi` rails with 2 px `asphalt` ties every
  6 px, connection-aware like roads. Over water: a 12 px `steel` trestle deck
  under the track. Level crossings layer the track strokes over the road plate.
- **Police / fire station** — pad base + one NW-lit hall (police = `cZone` blues,
  fire = `alertRed` pair) with `laneline` windows and a `uiText` letter glyph
  (P / F).
- **Overlay maps** — 1 px per tile, nearest-scaled: scalar maps use a
  green→yellow→red heat ramp that stays transparent at negligible values; the
  power view shows powered conductors green / unpowered red; transport shows
  roads white, rails steel-blue.

## Per-tile specs (phase 5)

- **Fire** — `alertRed` plate with 2-frame `wireYellow` flame-triangle loop on
  the global 500 ms cadence.
- **Flood** — water tile with pale `uiText` churn streaks, animated.
- **Radioactive** — dirt base + `wireYellow` disc with `asphalt` trefoil.
- **Tornado** — stacked funnel discs, `rubbleHi` over `rubble` (NW light),
  rendered 2× tile size and anchored to the actor's tile.
- **Monster** — boxy kaiju in the tree-green pair with `wireYellow` eyes and
  back spines, 2× tile size.

Later phases extend this file with stadium/seaport/airport sprites and traffic
animation specs before any of that art is drawn.
