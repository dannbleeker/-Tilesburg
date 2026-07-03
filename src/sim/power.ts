import type { City } from './city';
import { Flag, isConductor, MAP_SIZE, MAP_W, Tile } from './constants';

/**
 * Power grid scan: clear all POWERED bits, then flood-fill (4-connected)
 * from every power plant cell through conductor tiles — wires, underwater
 * cables, road/wire crossings, and every building cell (buildings pass power
 * to adjacent buildings, like the original).
 *
 * Plant output capacity (brownouts when overloaded) is a later-phase
 * refinement; for now a connected grid is simply powered.
 */
// Reused across ticks; the sim is single-threaded and a full-map stack can't
// overflow MAP_SIZE entries.
const stack = new Int32Array(MAP_SIZE);
let top = 0;

export function scanPower(city: City): void {
  const { tiles, flags } = city;
  top = 0;

  for (let i = 0; i < MAP_SIZE; i++) {
    flags[i] &= ~Flag.Powered;
    if (tiles[i] === Tile.Coal || tiles[i] === Tile.Nuclear) {
      flags[i] |= Flag.Powered;
      stack[top++] = i;
    }
  }

  while (top > 0) {
    const i = stack[--top];
    const x = i % MAP_W;
    if (i >= MAP_W) visit(tiles, flags, i - MAP_W);
    if (i < MAP_SIZE - MAP_W) visit(tiles, flags, i + MAP_W);
    if (x > 0) visit(tiles, flags, i - 1);
    if (x < MAP_W - 1) visit(tiles, flags, i + 1);
  }
}

function visit(tiles: Uint16Array, flags: Uint8Array, j: number): void {
  if ((flags[j] & Flag.Powered) === 0 && isConductor(tiles[j])) {
    flags[j] |= Flag.Powered;
    stack[top++] = j;
  }
}

/** A zone develops only when its anchor cell is powered. */
export function isPowered(city: City, anchorIdx: number): boolean {
  return (city.flags[anchorIdx] & Flag.Powered) !== 0;
}
