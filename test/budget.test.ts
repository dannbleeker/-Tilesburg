import { beforeEach, describe, expect, it } from 'vitest';
import { applyBudget, assessBudget, cashFlow, decayInfrastructure } from '../src/sim/budget';
import { createCity, idx, type City } from '../src/sim/city';
import { MAP_SIZE, TICKS_PER_YEAR, Tile } from '../src/sim/constants';
import { evaluateDemand } from '../src/sim/demand';
import { CITY_CLASSES, evaluate } from '../src/sim/evaluation';
import { applyTool, applyToolLine } from '../src/sim/tools';
import { tick } from '../src/sim/tick';

function flatCity(): City {
  const city = createCity(1, { coast: false, river: false, lakes: 0, forest: 0 });
  city.tiles.fill(Tile.Dirt);
  city.funds = 1_000_000;
  return city;
}

let city: City;
beforeEach(() => {
  city = flatCity();
});

describe('budget assessment', () => {
  it('counts stations and transport maintenance', () => {
    applyTool(city, 'police', 10, 10);
    applyTool(city, 'fire', 20, 10);
    applyToolLine(city, 'road', 0, 30, 9, 30); // 10 road tiles
    applyToolLine(city, 'rail', 0, 32, 4, 32); // 5 rail tiles
    const s = assessBudget(city);
    expect(s.policeMaint).toBe(100);
    expect(s.fireMaint).toBe(100);
    expect(s.transitMaint).toBe(10 * 1 + 5 * 2);
  });

  it('tax income scales with population and rate', () => {
    city.census = { ...city.census, resPop: 600, comPop: 200, indPop: 200 };
    city.taxRate = 7;
    const at7 = assessBudget(city).taxIncome;
    city.taxRate = 14;
    const at14 = assessBudget(city).taxIncome;
    expect(at7).toBeGreaterThan(0);
    expect(at14).toBe(at7 * 2);
    city.taxRate = 0;
    expect(assessBudget(city).taxIncome).toBe(0);
  });

  it('settles funds by income minus funded expenses', () => {
    applyTool(city, 'police', 10, 10);
    city.census = { ...city.census, resPop: 1000, comPop: 0, indPop: 0 };
    city.funding.police = 0.5;
    const s = assessBudget(city);
    const before = city.funds;
    const net = cashFlow(city, s);
    expect(net).toBe(s.taxIncome - 50);
    applyBudget(city, s);
    expect(city.funds).toBe(before + net);
    expect(city.pendingBudget).toBeNull();
  });
});

describe('infrastructure decay', () => {
  it('full transit funding preserves every tile', () => {
    applyToolLine(city, 'road', 0, 30, 39, 30);
    city.funding.transit = 1;
    const before = city.tiles.slice();
    decayInfrastructure(city);
    expect(city.tiles).toEqual(before);
  });

  it('zero funding crumbles roads to rubble and washes bridges away', () => {
    applyToolLine(city, 'road', 0, 30, 59, 30);
    for (let x = 20; x < 30; x++) city.tiles[idx(x, 40)] = Tile.Bridge;
    city.funding.transit = 0;
    for (let year = 0; year < 12; year++) decayInfrastructure(city);
    let roads = 0;
    let rubble = 0;
    for (let i = 0; i < MAP_SIZE; i++) {
      if (city.tiles[i] === Tile.Road) roads++;
      if (city.tiles[i] === Tile.Rubble) rubble++;
    }
    expect(roads).toBeLessThan(60);
    expect(rubble).toBeGreaterThan(0);
    let bridges = 0;
    for (let x = 20; x < 30; x++) if (city.tiles[idx(x, 40)] === Tile.Bridge) bridges++;
    expect(bridges).toBeLessThan(10);
  });
});

describe('january cycle in the tick pipeline', () => {
  it('posts a pending budget when auto-budget is off', () => {
    city.autoBudget = false;
    for (let i = 0; i < TICKS_PER_YEAR; i++) tick(city);
    expect(city.pendingBudget).not.toBeNull();
    expect(city.pendingBudget?.year).toBe(1901);
  });

  it('settles silently when auto-budget is on', () => {
    city.autoBudget = true;
    city.census = { ...city.census, resPop: 100, comPop: 0, indPop: 0 };
    for (let i = 0; i < TICKS_PER_YEAR; i++) tick(city);
    expect(city.pendingBudget).toBeNull();
  });
});

describe('tax drag on demand', () => {
  it('raising taxes suppresses all three valves', () => {
    city.census = { ...city.census, resPop: 300, comPop: 100, indPop: 100 };
    city.taxRate = 7;
    evaluateDemand(city);
    const base = { ...city.demand };
    city.taxRate = 20;
    evaluateDemand(city);
    expect(city.demand.r).toBeLessThan(base.r);
    expect(city.demand.c).toBeLessThan(base.c);
    expect(city.demand.i).toBeLessThan(base.i);
  });
});

describe('evaluation', () => {
  it('classifies city size', () => {
    expect(CITY_CLASSES.find((c) => 0 >= c.min)?.name).toBe('Village');
    city.census = { ...city.census, resPop: 0, comPop: 0, indPop: 0 };
    expect(evaluate(city).cityClass).toBe('Village');
    city.census = { ...city.census, resPop: 400, comPop: 150, indPop: 150 }; // ×20 = 14,000
    expect(evaluate(city).cityClass).toBe('City');
  });

  it('unemployment and taxes surface as complaints and drag approval', () => {
    city.census = { ...city.census, resPop: 1000, comPop: 0, indPop: 0 };
    city.taxRate = 20;
    const ev = evaluate(city);
    const names = ev.complaints.map((c) => c.name);
    expect(names).toContain('Unemployment');
    expect(names).toContain('Taxes');
    expect(ev.approval).toBeLessThan(50);
  });

  it('a healthy small town keeps approval high', () => {
    city.census = { ...city.census, resPop: 300, comPop: 120, indPop: 120 };
    const ev = evaluate(city);
    expect(ev.approval).toBeGreaterThan(70);
  });

  it('tracks net migration against last January', () => {
    city.census = { ...city.census, resPop: 100, comPop: 0, indPop: 0 };
    city.lastYearPop = 1000;
    expect(evaluate(city).netMigration).toBe(100 * 20 - 1000);
  });
});
