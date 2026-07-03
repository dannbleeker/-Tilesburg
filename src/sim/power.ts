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
export function scanPower(city: City): void {
  const { tiles, flags } = city;
  const stack: number[] = [];

  for (let i = 0; i < MAP_SIZE; i++) {
    flags[i] &= ~Flag.Powered;
    if (tiles[i] === Tile.Coal || tiles[i] === Tile.Nuclear) {
      flags[i] |= Flag.Powered;
      stack.push(i);
    }
  }

  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % MAP_W;
    if (i >= MAP_W) visit(tiles, flags, stack, i - MAP_W);
    if (i < MAP_SIZE - MAP_W) visit(tiles, flags, stack, i + MAP_W);
    if (x > 0) visit(tiles, flags, stack, i - 1);
    if (x < MAP_W - 1) visit(tiles, flags, stack, i + 1);
  }
}

function visit(tiles: Uint16Array, flags: Uint8Array, stack: number[], j: number): void {
  if ((flags[j] & Flag.Powered) === 0 && isConductor(tiles[j])) {
    flags[j] |= Flag.Powered;
    stack.push(j);
  }
}

/** A zone develops only when its anchor cell is powered. */
export function isPowered(city: City, anchorIdx: number): boolean {
  return (city.flags[anchorIdx] & Flag.Powered) !== 0;
}
