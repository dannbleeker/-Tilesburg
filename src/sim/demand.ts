import type { City } from './city';
import { DEMAND_MAX, MAP_SIZE, POP_PER_STAGE, Tile } from './constants';

/**
 * External market pull: the reason a brand-new city has positive demand at
 * all. Phase 4 modulates this with tax rate and city age; the stadium /
 * seaport / airport cap-lifters arrive with those buildings.
 */
const EXTERNAL_MARKET = 600;

/** Recount zone populations from the grid (anchor cells only). */
export function takeCensus(city: City): void {
  let resPop = 0;
  let comPop = 0;
  let indPop = 0;
  const { tiles, anchor, stage } = city;
  for (let i = 0; i < MAP_SIZE; i++) {
    if (anchor[i] !== i) continue;
    const pop = stage[i] * POP_PER_STAGE;
    if (tiles[i] === Tile.ZoneR) resPop += pop;
    else if (tiles[i] === Tile.ZoneC) comPop += pop;
    else if (tiles[i] === Tile.ZoneI) indPop += pop;
  }
  city.census = { resPop, comPop, indPop };
}

function clampValve(v: number): number {
  return Math.max(-DEMAND_MAX, Math.min(DEMAND_MAX, Math.round(v)));
}

/**
 * RCI demand valves, re-evaluated monthly from the census.
 *
 * The loop mirrors the original's feel: residents chase jobs (commercial +
 * industrial population) plus the external market; commerce serves the local
 * labor pool; industry employs it and exports. Each valve is the gap between
 * what the city could support and what it has, so growth in one sector feeds
 * demand in the others. Tax, pollution, and unemployment modifiers plug in
 * here in later phases.
 */
export function evaluateDemand(city: City): void {
  const { resPop, comPop, indPop } = city.census;
  const labor = resPop;
  const jobs = comPop + indPop;
  city.demand = {
    r: clampValve((jobs * 1.4 + EXTERNAL_MARKET - labor) * 2),
    c: clampValve((labor * 0.5 - comPop) * 3 + 100),
    i: clampValve((labor * 0.7 - indPop) * 3 + 300),
  };
}
