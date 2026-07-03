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
| `rZone` | `#3f8f4f` | residential identity color |
| `cZone` | `#3f6fb5` | commercial identity color |
| `iZone` | `#c2a23c` | industrial identity color |

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

Later phases extend this file with zone growth stages, buildings, disaster effects, and
sprite specs before any of that art is drawn.
