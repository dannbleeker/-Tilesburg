import {
  MAP_H,
  MAP_SIZE,
  MAP_W,
  START_FUNDS,
  START_YEAR,
  TICKS_PER_MONTH,
  TICKS_PER_YEAR,
  Tile,
  type TileType,
} from './constants';
import { Rng } from './rng';
import { generateTerrain, type TerrainParams } from './terrain';

/** RCI demand valves, each in [-DEMAND_MAX, DEMAND_MAX]. */
export interface Demand {
  r: number;
  c: number;
  i: number;
}

/** Zone population totals, recomputed monthly from the grid. */
export interface Census {
  resPop: number;
  comPop: number;
  indPop: number;
}

// The whole city is plain data + typed arrays: fully serializable, no DOM,
// no renderer references. See DESIGN.md "Map & tile data model".
export interface City {
  readonly width: number;
  readonly height: number;
  tiles: Uint16Array;
  flags: Uint8Array;
  /**
   * For cells covered by a building: index of the footprint's anchor
   * (top-left) cell. -1 everywhere else.
   */
  anchor: Int32Array;
  /** Zone growth stage, meaningful only at anchor cells. */
  stage: Uint8Array;
  funds: number;
  /** Sim ticks since founding. TICKS_PER_MONTH ticks = 1 month. */
  cityTime: number;
  seed: number;
  rng: Rng;
  demand: Demand;
  census: Census;
}

export function createCity(seed: number, params: TerrainParams): City {
  const rng = new Rng(seed);
  const anchor = new Int32Array(MAP_SIZE);
  anchor.fill(-1);
  return {
    width: MAP_W,
    height: MAP_H,
    tiles: generateTerrain(rng, params),
    flags: new Uint8Array(MAP_SIZE),
    anchor,
    stage: new Uint8Array(MAP_SIZE),
    funds: START_FUNDS,
    cityTime: 0,
    seed,
    rng,
    demand: { r: 0, c: 0, i: 0 },
    census: { resPop: 0, comPop: 0, indPop: 0 },
  };
}

export function idx(x: number, y: number): number {
  return y * MAP_W + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H;
}

export function getTile(city: City, x: number, y: number): TileType {
  if (!inBounds(x, y)) return Tile.Dirt;
  return city.tiles[idx(x, y)] as TileType;
}

export function setTile(city: City, x: number, y: number, t: TileType): void {
  if (!inBounds(x, y)) return;
  city.tiles[idx(x, y)] = t;
}

/** Deduct amount if affordable. Returns false (and charges nothing) if not. */
export function spend(city: City, amount: number): boolean {
  if (city.funds < amount) return false;
  city.funds -= amount;
  return true;
}

export interface CityDate {
  year: number;
  /** 0-based month, January = 0. */
  month: number;
}

export function getDate(city: City): CityDate {
  const months = Math.floor(city.cityTime / TICKS_PER_MONTH);
  return {
    year: START_YEAR + Math.floor(city.cityTime / TICKS_PER_YEAR),
    month: months % 12,
  };
}
