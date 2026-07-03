import { beforeEach, describe, expect, it } from 'vitest';
import { assessBudget } from '../src/sim/budget';
import { createCity, type City } from '../src/sim/city';
import { COST, MAP_SIZE, TICKS_PER_YEAR, Tile } from '../src/sim/constants';
import { evaluateDemand, takeCensus } from '../src/sim/demand';
import { cityPopulation } from '../src/sim/evaluation';
import { computeCrime, computePollution, computePopDensity } from '../src/sim/maps';
import { checkScenario, createScenarioCity, SCENARIOS } from '../src/sim/scenarios';
import { applyTool } from '../src/sim/tools';
import { tick } from '../src/sim/tick';

function flatCity(): City {
  const city = createCity(1, { coast: false, river: false, lakes: 0, forest: 0 });
  city.tiles.fill(Tile.Dirt);
  city.funds = 1_000_000;
  city.disastersEnabled = false;
  return city;
}

let city: City;
beforeEach(() => {
  city = flatCity();
});

describe('cap-lifter buildings', () => {
  it('stadium, seaport, airport place at original prices and sizes', () => {
    expect(applyTool(city, 'stadium', 10, 10)).toEqual({ ok: true, cost: COST.stadium });
    expect(applyTool(city, 'seaport', 30, 10)).toEqual({ ok: true, cost: COST.seaport });
    expect(applyTool(city, 'airport', 60, 12)).toEqual({ ok: true, cost: COST.airport });
    let airportCells = 0;
    for (let i = 0; i < MAP_SIZE; i++) if (city.tiles[i] === Tile.Airport) airportCells++;
    expect(airportCells).toBe(36);
    takeCensus(city);
    expect(city.census.hasStadium).toBe(true);
    expect(city.census.hasSeaport).toBe(true);
    expect(city.census.hasAirport).toBe(true);
  });

  it('a big population stalls without a stadium and recovers with one', () => {
    city.census = { ...city.census, resPop: 1300, comPop: 600, indPop: 600 };
    evaluateDemand(city);
    expect(city.demand.r).toBeLessThanOrEqual(0);
    city.census = { ...city.census, hasStadium: true };
    evaluateDemand(city);
    expect(city.demand.r).toBeGreaterThan(0);
  });

  it('seaport and airport pollute', () => {
    applyTool(city, 'seaport', 30, 30);
    computePollution(city);
    expect(city.pollution[30 + 30 * 120]).toBeGreaterThan(0);
  });
});

describe('ordinances', () => {
  it('feed the budget as net income or cost', () => {
    takeCensus(city);
    city.ordinances.gambling = true;
    const withGambling = assessBudget(city).ordinanceNet;
    expect(withGambling).toBeGreaterThan(0);
    city.ordinances.freeClinics = true;
    const withBoth = assessBudget(city).ordinanceNet;
    expect(withBoth).toBeLessThan(withGambling);
  });

  it('gambling raises crime, anti-drug lowers it', () => {
    applyTool(city, 'res', 40, 40);
    city.stage[39 + 39 * 120] = 4;
    computePopDensity(city);
    computeCrime(city);
    const base = city.crime[40 + 40 * 120];
    city.ordinances.gambling = true;
    computeCrime(city);
    expect(city.crime[40 + 40 * 120]).toBeGreaterThan(base);
    city.ordinances.gambling = false;
    city.ordinances.antiDrug = true;
    computeCrime(city);
    expect(city.crime[40 + 40 * 120]).toBeLessThan(base);
  });

  it('demand ordinances nudge the valves without dominating them', () => {
    takeCensus(city);
    evaluateDemand(city);
    const base = { ...city.demand };
    city.ordinances.tourismAds = true;
    city.ordinances.freeClinics = true;
    evaluateDemand(city);
    expect(city.demand.c).toBeGreaterThan(base.c);
    expect(city.demand.r).toBeGreaterThan(base.r);
    expect(city.demand.c - base.c).toBeLessThan(200);
  });
});

describe('scenarios', () => {
  it('all eight build a populated, funded city with a deadline', () => {
    for (const def of SCENARIOS) {
      const c = createScenarioCity(def);
      expect(c.scenario?.id).toBe(def.id);
      expect(c.scenario?.outcome).toBe('open');
      expect(c.startYear).toBe(def.year);
      expect(cityPopulation(c)).toBeGreaterThan(0);
      expect(c.scenario?.deadline).toBe(def.timeLimitYears * TICKS_PER_YEAR);
    }
  });

  it('tokyo starts with a monster, boston with radioactive fallout', () => {
    const tokyo = createScenarioCity(SCENARIOS.find((s) => s.id === 'tokyo1957')!);
    expect(tokyo.monster).not.toBeNull();
    const boston = createScenarioCity(SCENARIOS.find((s) => s.id === 'boston2010')!);
    let rad = 0;
    for (let i = 0; i < MAP_SIZE; i++) if (boston.tiles[i] === Tile.Radioactive) rad++;
    expect(rad).toBeGreaterThan(0);
  });

  it('dullsville wins as soon as the population target is hit', () => {
    const c = createScenarioCity(SCENARIOS.find((s) => s.id === 'dullsville1900')!);
    // Fake the boom.
    c.census = { ...c.census, resPop: 600, comPop: 200, indPop: 200 }; // ×20 = 20,000
    c.cityTime = 8;
    checkScenario(c);
    expect(c.scenario?.outcome).toBe('won');
  });

  it('a scenario is lost when the deadline passes', () => {
    const c = createScenarioCity(SCENARIOS.find((s) => s.id === 'dullsville1900')!);
    c.cityTime = c.scenario!.deadline;
    c.census = { ...c.census, resPop: 0, comPop: 0, indPop: 0 };
    checkScenario(c);
    expect(c.scenario?.outcome).toBe('lost');
  });

  it('scenario cities keep simulating after the verdict', () => {
    const c = createScenarioCity(SCENARIOS.find((s) => s.id === 'dullsville1900')!);
    c.scenario!.outcome = 'lost';
    const t = c.cityTime;
    tick(c);
    expect(c.cityTime).toBe(t + 1);
    expect(c.scenario?.outcome).toBe('lost');
  });
});
