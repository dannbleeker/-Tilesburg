import type { BudgetSummary, City } from './city';
import { MAP_SIZE, START_YEAR, TICKS_PER_YEAR, Tile } from './constants';

// Annual maintenance per the original's feel: stations are the big line
// items, transport is per-tile.
const STATION_MAINT = 100;
const ROAD_MAINT = 1;
const RAIL_MAINT = 2;
/** § of tax income per point of zone population at 1% tax. */
const TAX_YIELD = 0.5;

/** Count the year's income and full-funding costs without applying them. */
export function assessBudget(city: City): BudgetSummary {
  const { tiles } = city;
  let police = 0;
  let fire = 0;
  let roadTiles = 0;
  let railTiles = 0;
  for (let i = 0; i < MAP_SIZE; i++) {
    const t = tiles[i];
    if (t === Tile.Police) police++;
    else if (t === Tile.FireStation) fire++;
    else if (t === Tile.Road || t === Tile.Bridge || t === Tile.RoadWire) roadTiles++;
    else if (t === Tile.Rail || t === Tile.RailWater) railTiles++;
    else if (t === Tile.RoadRail) {
      roadTiles++;
      railTiles++;
    }
  }
  const pop = city.census.resPop + city.census.comPop + city.census.indPop;
  return {
    year: START_YEAR + Math.floor(city.cityTime / TICKS_PER_YEAR),
    taxIncome: Math.round(pop * city.taxRate * TAX_YIELD),
    policeMaint: (police / 9) * STATION_MAINT, // 9 cells per 3x3 station
    fireMaint: (fire / 9) * STATION_MAINT,
    transitMaint: roadTiles * ROAD_MAINT + railTiles * RAIL_MAINT,
  };
}

/** § actually spent on a department at the current slider position. */
export function fundedCost(maint: number, funding: number): number {
  return Math.round(maint * funding);
}

export function cashFlow(city: City, s: BudgetSummary): number {
  return (
    s.taxIncome -
    fundedCost(s.policeMaint, city.funding.police) -
    fundedCost(s.fireMaint, city.funding.fire) -
    fundedCost(s.transitMaint, city.funding.transit)
  );
}

/**
 * Settle the year: income minus funded expenses. Funds can go negative
 * (debt); the tools already refuse to build while broke.
 */
export function applyBudget(city: City, s: BudgetSummary): void {
  city.funds += cashFlow(city, s);
  city.pendingBudget = null;
}

/**
 * Underfunded transit lets infrastructure crumble: each January every
 * road/rail tile risks decay with probability scaled by the funding gap.
 * Land tiles become rubble; spans over water wash away entirely.
 */
export function decayInfrastructure(city: City): void {
  const gap = 1 - city.funding.transit;
  if (gap <= 0) return;
  const p = gap * 0.12;
  const { tiles, rng } = city;
  for (let i = 0; i < MAP_SIZE; i++) {
    const t = tiles[i];
    switch (t) {
      case Tile.Road:
      case Tile.RoadWire:
      case Tile.Rail:
      case Tile.RoadRail:
        if (rng.chance(p)) tiles[i] = Tile.Rubble;
        break;
      case Tile.Bridge:
      case Tile.RailWater:
        if (rng.chance(p)) tiles[i] = Tile.Water;
        break;
    }
  }
}
