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
  /** Cap-lifters present on the map (checked during the census). */
  hasStadium: boolean;
  hasSeaport: boolean;
  hasAirport: boolean;
}

/** Department funding levels, 0..1 (the budget window's sliders). */
export interface Funding {
  police: number;
  fire: number;
  transit: number;
}

/** One January's assessment, shown in the budget window before applying. */
export interface BudgetSummary {
  year: number;
  taxIncome: number;
  /** Full-funding annual maintenance costs. */
  policeMaint: number;
  fireMaint: number;
  transitMaint: number;
  /** Net § from active ordinances (positive = income). */
  ordinanceNet: number;
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
  // Derived overlay maps, recomputed by the tick pipeline (0..255 each).
  pollution: Uint8Array;
  landValue: Uint8Array;
  crime: Uint8Array;
  trafficDensity: Uint8Array;
  popDensity: Uint8Array;
  policeCov: Uint8Array;
  fireCov: Uint8Array;
  funds: number;
  /** Sim ticks since founding. TICKS_PER_MONTH ticks = 1 month. */
  cityTime: number;
  seed: number;
  rng: Rng;
  demand: Demand;
  census: Census;
  /** Property tax rate, 0..20 percent. */
  taxRate: number;
  funding: Funding;
  autoBudget: boolean;
  /** Set each January when auto-budget is off; the UI opens the window. */
  pendingBudget: BudgetSummary | null;
  /** Population at the last January, for net migration. */
  lastYearPop: number;
  /** Random disasters toggle (manual triggers always work). */
  disastersEnabled: boolean;
  /** Roaming disaster actors; null when absent. */
  monster: DisasterActor | null;
  tornado: DisasterActor | null;
  /** Ticks until active flood water recedes. */
  floodTicks: number;
  /** Sim events for the message ticker; the UI drains this each frame. */
  messages: string[];
  /** Founding year shown on the clock (scenarios override 1900). */
  startYear: number;
  ordinances: Record<string, boolean>;
  /** Active scenario progress; null in sandbox play. */
  scenario: ScenarioState | null;
}

export interface ScenarioState {
  id: string;
  /** cityTime at which the scenario is judged lost if not won. */
  deadline: number;
  outcome: 'open' | 'won' | 'lost';
}

export interface DisasterActor {
  x: number;
  y: number;
  /** Ticks left before it leaves. */
  ttl: number;
  /** Current heading (radians) — tornado wanders, monster steers. */
  dir: number;
  /** Monster destination (max-pollution cell at spawn). */
  targetX: number;
  targetY: number;
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
    pollution: new Uint8Array(MAP_SIZE),
    landValue: new Uint8Array(MAP_SIZE),
    crime: new Uint8Array(MAP_SIZE),
    trafficDensity: new Uint8Array(MAP_SIZE),
    popDensity: new Uint8Array(MAP_SIZE),
    policeCov: new Uint8Array(MAP_SIZE),
    fireCov: new Uint8Array(MAP_SIZE),
    funds: START_FUNDS,
    cityTime: 0,
    seed,
    rng,
    demand: { r: 0, c: 0, i: 0 },
    census: { resPop: 0, comPop: 0, indPop: 0, hasStadium: false, hasSeaport: false, hasAirport: false },
    taxRate: 7,
    funding: { police: 1, fire: 1, transit: 1 },
    autoBudget: false,
    pendingBudget: null,
    lastYearPop: 0,
    disastersEnabled: true,
    monster: null,
    tornado: null,
    floodTicks: 0,
    messages: [],
    startYear: START_YEAR,
    ordinances: {},
    scenario: null,
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
    year: city.startYear + Math.floor(city.cityTime / TICKS_PER_YEAR),
    month: months % 12,
  };
}
