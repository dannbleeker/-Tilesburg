import { createCity, idx, type City } from './city';
import { FOOTPRINT, MAP_SIZE, TICKS_PER_YEAR, Tile, type BuildingType } from './constants';
import { cityPopulation } from './evaluation';
import { triggerEarthquake, triggerFire, triggerFlood, triggerMeltdown, triggerMonster } from './disasters';
import { evaluateDemand, takeCensus } from './demand';
import { recomputeDerivedMaps } from './maps';
import type { TerrainParams } from './terrain';

export interface ScenarioDef {
  id: string;
  name: string;
  /** Clock year at scenario start. */
  year: number;
  description: string;
  goal: string;
  seed: number;
  terrain: TerrainParams;
  funds: number;
  timeLimitYears: number;
  /** Author the starting city (after terrain). */
  build: (city: City) => void;
  /** Fired once, right after build. */
  onStart?: (city: City) => void;
  /** Fired periodically while the scenario runs. */
  recurring?: { intervalTicks: number; fn: (city: City) => void };
  /** Checked twice a month; see sustainedChecks for how many must agree. */
  isWon: (city: City) => boolean;
  /**
   * Consecutive passing checks required to win (default 1). Goals measured
   * against a quantity that oscillates within the month need several so a
   * single favourable sample can't win the scenario.
   */
  sustainedChecks?: number;
}

// --- city stamping helpers (hand-authored approximations) ------------------

function clear(city: City, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const t = city.tiles[idx(x + dx, y + dy)];
      if (t === Tile.Tree || t === Tile.Water) city.tiles[idx(x + dx, y + dy)] = Tile.Dirt;
    }
  }
}

function stampBuilding(city: City, type: BuildingType, ax: number, ay: number, stage = 0): void {
  const size = FOOTPRINT[type];
  clear(city, ax, ay, size, size);
  const anchorIdx = idx(ax, ay);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = idx(ax + dx, ay + dy);
      city.tiles[i] = type;
      city.anchor[i] = anchorIdx;
    }
  }
  city.stage[anchorIdx] = stage;
}

// Scenario towns use road/wire crossings for their street grid — the classic
// wires-over-streets look — so the whole grid conducts and every zone that
// borders a street is powered.
function stampRoadRow(city: City, x0: number, x1: number, y: number): void {
  clear(city, x0, y, x1 - x0 + 1, 1);
  for (let x = x0; x <= x1; x++) city.tiles[idx(x, y)] = Tile.RoadWire;
}

function stampRoadCol(city: City, x: number, y0: number, y1: number): void {
  clear(city, x, y0, 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) city.tiles[idx(x, y)] = Tile.RoadWire;
}

/**
 * Stamp a working town: road grid, wire spine, alternating R/C/I blocks at
 * the given stage, one coal plant, police + fire. `blocks` scales size.
 */
function stampTown(city: City, ox: number, oy: number, blocksX: number, blocksY: number, stage: number): void {
  const zoneTypes: BuildingType[] = [Tile.ZoneR, Tile.ZoneR, Tile.ZoneC, Tile.ZoneR, Tile.ZoneI, Tile.ZoneR];
  // Road grid every 4 tiles (3-wide zones + 1 road).
  for (let by = 0; by <= blocksY; by++) {
    stampRoadRow(city, ox, ox + blocksX * 4, oy + by * 4);
  }
  for (let bx = 0; bx <= blocksX; bx++) {
    stampRoadCol(city, ox + bx * 4, oy, oy + blocksY * 4);
  }
  // Zones inside the grid.
  let n = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const type = zoneTypes[n++ % zoneTypes.length];
      stampBuilding(city, type, ox + bx * 4 + 1, oy + by * 4 + 1, stage);
    }
  }
  // Power: coal plant west of the town, a wire stub into the conducting grid.
  stampBuilding(city, Tile.Coal, ox - 6, oy + 1);
  clear(city, ox - 2, oy + 1, 2, 1);
  for (let x = ox - 2; x <= ox - 1; x++) city.tiles[idx(x, oy + 1)] = Tile.Wire;
  city.tiles[idx(ox, oy + 1)] = Tile.RoadWire; // joins the west street
  stampBuilding(city, Tile.Police, ox + 1, oy - 4);
  stampBuilding(city, Tile.FireStation, ox + 5, oy - 4);
}

/** Big established cities already have their cap-lifters. */
function stampMetropolisExtras(city: City, ox: number, oy: number): void {
  stampBuilding(city, Tile.Stadium, ox - 7, oy + 6);
  stampBuilding(city, Tile.Seaport, ox - 7, oy + 11);
  stampBuilding(city, Tile.Airport, ox - 9, oy + 16);
}

function averageCrime(city: City): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < MAP_SIZE; i++) {
    if (city.popDensity[i] > 0) {
      sum += city.crime[i];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Road tiles carrying heavy traffic. Counting congested blocks is a far better
 * goal metric than a map-wide average: the average is dominated by the many
 * empty roads in a grid, so it reads near zero even when the arteries are
 * jammed, and it moves when you *pave more road* rather than when you fix
 * congestion. This threshold matches the renderer's "busy" traffic art, so the
 * player can literally see what the goal is counting.
 */
const CONGESTED = 30;

function congestedRoads(city: City): number {
  let n = 0;
  for (let i = 0; i < MAP_SIZE; i++) {
    const t = city.tiles[i];
    if (t === Tile.Road || t === Tile.Bridge || t === Tile.RoadWire || t === Tile.RoadRail) {
      if (city.trafficDensity[i] > CONGESTED) n++;
    }
  }
  return n;
}

// --- the eight classics -----------------------------------------------------

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'sf1906',
    name: 'San Francisco 1906',
    year: 1906,
    description: 'A great earthquake has shattered the city. Dig out of the rubble and rebuild.',
    goal: 'Rebuild to a population of 30,000 within 10 years.',
    seed: 1906,
    terrain: { coast: true, river: false, lakes: 0, forest: 0.3 },
    funds: 20000,
    timeLimitYears: 10,
    build: (c) => stampTown(c, 30, 30, 8, 7, 3),
    onStart: (c) => {
      triggerEarthquake(c);
      triggerEarthquake(c);
    },
    isWon: (c) => cityPopulation(c) >= 30000,
  },
  {
    id: 'hamburg1944',
    name: 'Hamburg 1944',
    year: 1944,
    description: 'Firestorms rain down on the city. Contain the flames, then rebuild what is lost.',
    goal: 'Recover to a population of 30,000 within 8 years.',
    seed: 1944,
    terrain: { coast: false, river: true, lakes: 0, forest: 0.4 },
    funds: 20000,
    timeLimitYears: 8,
    build: (c) => stampTown(c, 34, 34, 8, 7, 3),
    onStart: (c) => {
      for (let i = 0; i < 12; i++) triggerFire(c);
    },
    isWon: (c) => cityPopulation(c) >= 30000,
  },
  {
    id: 'bern1965',
    name: 'Bern 1965',
    year: 1965,
    description: 'The capital is choking on cars. Untangle the streets — rail moves people without exhaust.',
    goal: 'Get the city down to fewer than 6 congested streets within 10 years — rail carries riders without adding traffic.',
    seed: 1965,
    terrain: { coast: false, river: true, lakes: 1, forest: 0.5 },
    funds: 20000,
    timeLimitYears: 10,
    build: (c) => {
      // No artificial trafficDensity fill: a one-shot fill just decays away
      // and hands the player a win for doing nothing. The congestion has to
      // come from the town's own generated trips, which is what rail relieves.
      stampTown(c, 28, 30, 10, 8, 4);
      stampMetropolisExtras(c, 28, 30);
    },
    // Sustained, not a lucky sample: traffic dips right after each decay pass,
    // so a single reading below the line proves nothing. The one-year grace
    // period lets the stamped town's trips build to their steady state first —
    // otherwise the city starts at zero traffic and wins before it congests.
    isWon: (c) => c.cityTime > TICKS_PER_YEAR && congestedRoads(c) < 6,
    sustainedChecks: 12,
  },
  {
    id: 'tokyo1957',
    name: 'Tokyo 1957',
    year: 1957,
    description: 'A monster rises from the bay, drawn to the industrial smog. Survive the rampage.',
    goal: 'Keep the population above 35,000 five years from now.',
    seed: 1957,
    terrain: { coast: true, river: false, lakes: 0, forest: 0.3 },
    funds: 20000,
    timeLimitYears: 5,
    build: (c) => {
      stampTown(c, 30, 30, 9, 8, 4);
      stampMetropolisExtras(c, 30, 30);
    },
    onStart: (c) => triggerMonster(c),
    isWon: (c) => c.cityTime >= 4 * TICKS_PER_YEAR && cityPopulation(c) >= 35000,
  },
  {
    id: 'detroit1972',
    name: 'Detroit 1972',
    year: 1972,
    description: 'Industry left and crime moved in. Police the streets and rebuild the economy.',
    goal: 'Bring average crime below 35 within 10 years.',
    seed: 1972,
    terrain: { coast: false, river: true, lakes: 0, forest: 0.2 },
    funds: 15000,
    timeLimitYears: 10,
    build: (c) => {
      stampTown(c, 30, 30, 9, 8, 4);
      stampMetropolisExtras(c, 30, 30);
      c.funding.police = 0.3;
      c.crime.fill(80);
    },
    isWon: (c) => c.cityTime > TICKS_PER_YEAR && averageCrime(c) < 35,
  },
  {
    id: 'boston2010',
    name: 'Boston 2010',
    year: 2010,
    description: 'The downtown reactor has melted down. Evacuate, contain, and rebuild around the exclusion zone.',
    goal: 'Grow past 40,000 despite the exclusion zone, within 10 years.',
    seed: 2010,
    terrain: { coast: true, river: false, lakes: 1, forest: 0.4 },
    funds: 20000,
    timeLimitYears: 10,
    build: (c) => {
      stampTown(c, 30, 30, 8, 7, 4);
      stampMetropolisExtras(c, 30, 30);
      stampBuilding(c, Tile.Nuclear, 66, 40);
    },
    onStart: (c) => {
      triggerMeltdown(c);
    },
    isWon: (c) => cityPopulation(c) >= 40000,
  },
  {
    id: 'rio2047',
    name: 'Rio de Janeiro 2047',
    year: 2047,
    description: 'The seas are rising. Coastal floods return again and again — keep the city alive.',
    goal: 'Keep the population above 35,000 fifteen years from now.',
    seed: 2047,
    terrain: { coast: true, river: false, lakes: 0, forest: 0.5 },
    funds: 20000,
    timeLimitYears: 15,
    build: (c) => {
      stampTown(c, 24, 30, 9, 8, 4);
      stampMetropolisExtras(c, 24, 30);
    },
    onStart: (c) => triggerFlood(c),
    recurring: { intervalTicks: 2 * TICKS_PER_YEAR, fn: (c) => triggerFlood(c) },
    isWon: (c) => c.cityTime >= 14 * TICKS_PER_YEAR && cityPopulation(c) >= 35000,
  },
  {
    id: 'dullsville1900',
    name: 'Dullsville 1900',
    year: 1900,
    description: 'Nothing ever happens here. The people are bored stiff — give them a real city.',
    goal: 'Grow to a population of 20,000 within 30 years.',
    seed: 1900,
    terrain: { coast: false, river: true, lakes: 1, forest: 0.6 },
    funds: 10000,
    timeLimitYears: 30,
    build: (c) => stampTown(c, 50, 44, 3, 3, 1),
    isWon: (c) => cityPopulation(c) >= 20000,
  },
];

/** Create a city running the given scenario. */
export function createScenarioCity(def: ScenarioDef): City {
  const city = createCity(def.seed, def.terrain);
  city.funds = def.funds;
  city.startYear = def.year;
  def.build(city);
  // Prime census, demand *and* the derived overlay maps before onStart runs:
  // start-of-scenario disasters read them (the monster steers by pollution),
  // and the player sees the overlays immediately.
  takeCensus(city);
  evaluateDemand(city);
  recomputeDerivedMaps(city);
  def.onStart?.(city);
  city.scenario = {
    id: def.id,
    deadline: def.timeLimitYears * TICKS_PER_YEAR,
    outcome: 'open',
    streak: 0,
  };
  return city;
}

/** Monthly scenario progress check (called from the tick pipeline). */
export function checkScenario(city: City): void {
  const state = city.scenario;
  if (!state || state.outcome !== 'open') return;
  const def = SCENARIOS.find((s) => s.id === state.id);
  if (!def) return;

  if (def.recurring && city.cityTime > 0 && city.cityTime % def.recurring.intervalTicks === 0) {
    def.recurring.fn(city);
  }

  if (city.cityTime % 8 !== 0) return; // twice a month is plenty

  if (def.isWon(city)) {
    state.streak++;
  } else {
    state.streak = 0;
  }

  if (state.streak >= (def.sustainedChecks ?? 1)) {
    state.outcome = 'won';
    city.messages.push(`Scenario complete — ${def.name} is saved!`);
  } else if (city.cityTime >= state.deadline) {
    state.outcome = 'lost';
    city.messages.push(`Time has run out. ${def.name} defeated you — the city carries on.`);
  }
}

