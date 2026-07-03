import type { City } from './city';
import { DEMAND_MAX, MAP_SIZE, MAX_STAGE, Tile } from './constants';
import { isPowered } from './power';

// The zone scan is staggered like the original: each tick handles 1/SLICES
// of the map, so every zone gets a growth decision every SLICES ticks and
// the map visibly develops piecemeal rather than in lockstep.
const SLICES = 8;
const SLICE_SIZE = Math.ceil(MAP_SIZE / SLICES);

/**
 * Growth/decay pass over zone anchors in this tick's slice.
 *
 * A powered zone with positive demand for its type has a chance to step up a
 * stage; demand must exceed a rising bar (stage * 200) so high densities only
 * appear under strong demand. Strongly negative demand decays zones, and an
 * unpowered zone can't grow and slowly decays — the classic death spiral
 * when the grid goes down. Transport access joins the growth requirements in
 * phase 3.
 */
export function scanZones(city: City): void {
  const slice = city.cityTime % SLICES;
  const start = slice * SLICE_SIZE;
  const end = Math.min(start + SLICE_SIZE, MAP_SIZE);
  const { tiles, anchor, stage, rng, demand } = city;

  for (let i = start; i < end; i++) {
    if (anchor[i] !== i) continue;
    const t = tiles[i];
    let d: number;
    if (t === Tile.ZoneR) d = demand.r;
    else if (t === Tile.ZoneC) d = demand.c;
    else if (t === Tile.ZoneI) d = demand.i;
    else continue; // power plants don't grow

    if (!isPowered(city, i)) {
      if (stage[i] > 0 && rng.chance(0.03)) stage[i]--;
      continue;
    }

    const effective = d - stage[i] * 200;
    if (effective > 0 && stage[i] < MAX_STAGE) {
      if (rng.chance((effective / DEMAND_MAX) * 0.3)) stage[i]++;
    } else if (d < -400 && stage[i] > 0) {
      if (rng.chance((-d / DEMAND_MAX) * 0.1)) stage[i]--;
    }
  }
}
