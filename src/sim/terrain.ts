import { MAP_H, MAP_SIZE, MAP_W, Tile } from './constants';
import type { Rng } from './rng';

export interface TerrainParams {
  /** Carve an ocean band along the east edge. */
  coast: boolean;
  /** Run a meandering river across the map. */
  river: boolean;
  /** Number of lakes (elliptical blobs). */
  lakes: number;
  /** Forest density, 0..1. Scales cluster count. */
  forest: number;
}

// Curated starter maps: named seed + parameter presets chosen for good build
// space. The UI offers these plus a "Random" roll.
export interface StarterMap {
  name: string;
  seed: number;
  params: TerrainParams;
}

export const STARTER_MAPS: StarterMap[] = [
  { name: 'Riverbend', seed: 1907, params: { coast: false, river: true, lakes: 1, forest: 0.6 } },
  { name: 'Cape Verdant', seed: 411, params: { coast: true, river: false, lakes: 2, forest: 0.8 } },
  { name: 'Twin Lakes', seed: 77, params: { coast: false, river: false, lakes: 3, forest: 0.5 } },
  { name: 'Delta Shores', seed: 2024, params: { coast: true, river: true, lakes: 0, forest: 0.4 } },
  { name: 'Plainsville', seed: 5150, params: { coast: false, river: false, lakes: 1, forest: 0.25 } },
];

/** Roll terrain params for a "Random" map from the given rng. */
export function randomTerrainParams(rng: Rng): TerrainParams {
  return {
    coast: rng.chance(0.4),
    river: rng.chance(0.8),
    lakes: rng.range(0, 3),
    forest: 0.2 + rng.next() * 0.7,
  };
}

/**
 * Deterministic terrain generation: dirt base, optional coast, meandering
 * river (with possible tributary), lakes, then forest clusters + scatter.
 */
export function generateTerrain(rng: Rng, params: TerrainParams): Uint16Array {
  const tiles = new Uint16Array(MAP_SIZE);
  tiles.fill(Tile.Dirt);

  if (params.coast) carveCoast(tiles, rng);
  if (params.river) carveRiver(tiles, rng);
  for (let i = 0; i < params.lakes; i++) carveLake(tiles, rng);
  plantForests(tiles, rng, params.forest);

  return tiles;
}

function set(tiles: Uint16Array, x: number, y: number, t: number): void {
  if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) tiles[y * MAP_W + x] = t;
}

function get(tiles: Uint16Array, x: number, y: number): number {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return Tile.Water;
  return tiles[y * MAP_W + x];
}

function paintDisc(tiles: Uint16Array, cx: number, cy: number, r: number, t: number): void {
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy <= r * r) set(tiles, cx + dx, cy + dy, t);
    }
  }
}

// Ocean band along the east edge with a random-walk shoreline.
function carveCoast(tiles: Uint16Array, rng: Rng): void {
  let depth = rng.range(8, 16);
  for (let y = 0; y < MAP_H; y++) {
    depth += rng.range(-1, 1);
    depth = Math.max(5, Math.min(22, depth));
    for (let x = MAP_W - depth; x < MAP_W; x++) set(tiles, x, y, Tile.Water);
  }
}

// Meandering walk from the west edge to the east edge, painting discs of
// slowly-varying radius. 50% chance of a tributary branching from midway
// toward the north or south edge.
function carveRiver(tiles: Uint16Array, rng: Rng): void {
  let x = 0;
  let y = rng.range(Math.floor(MAP_H * 0.25), Math.floor(MAP_H * 0.75));
  let angle = 0; // radians, 0 = due east
  let radius = 2;
  let midX = -1;
  let midY = -1;

  while (x < MAP_W) {
    paintDisc(tiles, Math.round(x), Math.round(y), radius, Tile.Water);
    angle += (rng.next() - 0.5) * 0.6;
    angle = Math.max(-1.0, Math.min(1.0, angle));
    radius = Math.max(1.5, Math.min(3.2, radius + (rng.next() - 0.5) * 0.4));
    x += Math.cos(angle) * 1.5;
    y += Math.sin(angle) * 1.5;
    y = Math.max(3, Math.min(MAP_H - 4, y));
    if (midX < 0 && x >= MAP_W / 2) {
      midX = Math.round(x);
      midY = Math.round(y);
    }
  }

  if (midX >= 0 && rng.chance(0.5)) {
    carveTributary(tiles, rng, midX, midY, rng.chance(0.5) ? -1 : 1);
  }
}

function carveTributary(tiles: Uint16Array, rng: Rng, startX: number, startY: number, dirY: number): void {
  let x = startX;
  let y = startY;
  let angle = (Math.PI / 2) * dirY; // toward north or south edge
  while (y > 0 && y < MAP_H - 1) {
    paintDisc(tiles, Math.round(x), Math.round(y), 1.6, Tile.Water);
    angle += (rng.next() - 0.5) * 0.5;
    const target = (Math.PI / 2) * dirY;
    angle = target + Math.max(-0.9, Math.min(0.9, angle - target));
    x += Math.cos(angle) * 1.4;
    y += Math.sin(angle) * 1.4;
    x = Math.max(2, Math.min(MAP_W - 3, x));
  }
}

function carveLake(tiles: Uint16Array, rng: Rng): void {
  const cx = rng.range(12, MAP_W - 13);
  const cy = rng.range(10, MAP_H - 11);
  const rx = rng.range(3, 7);
  const ry = rng.range(3, 7);
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      // Jitter the rim so lakes don't read as perfect ellipses.
      if (d <= 0.75 || (d <= 1.1 && rng.chance(0.55))) {
        set(tiles, cx + dx, cy + dy, Tile.Water);
      }
    }
  }
}

// Forest = clusters grown by random-walk blob painting, plus light scatter.
// Trees never overwrite water.
function plantForests(tiles: Uint16Array, rng: Rng, density: number): void {
  const clusters = Math.round(density * 18);
  for (let c = 0; c < clusters; c++) {
    let x = rng.range(2, MAP_W - 3);
    let y = rng.range(2, MAP_H - 3);
    const steps = rng.range(20, 60);
    for (let s = 0; s < steps; s++) {
      plantTreeBlob(tiles, x, y, rng);
      x += rng.range(-1, 1);
      y += rng.range(-1, 1);
      x = Math.max(1, Math.min(MAP_W - 2, x));
      y = Math.max(1, Math.min(MAP_H - 2, y));
    }
  }
  const scatter = Math.round(density * 220);
  for (let s = 0; s < scatter; s++) {
    const x = rng.range(0, MAP_W - 1);
    const y = rng.range(0, MAP_H - 1);
    if (get(tiles, x, y) === Tile.Dirt) set(tiles, x, y, Tile.Tree);
  }
}

function plantTreeBlob(tiles: Uint16Array, cx: number, cy: number, rng: Rng): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const edge = Math.abs(dx) + Math.abs(dy) === 2;
      if (edge && !rng.chance(0.5)) continue;
      if (get(tiles, cx + dx, cy + dy) === Tile.Dirt) set(tiles, cx + dx, cy + dy, Tile.Tree);
    }
  }
}
