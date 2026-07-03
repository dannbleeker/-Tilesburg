import { beforeEach, describe, expect, it } from 'vitest';
import { createCity, idx, type City } from '../src/sim/city';
import { COST, MAX_STAGE, Tile } from '../src/sim/constants';
import { evaluateDemand, takeCensus } from '../src/sim/demand';
import { applyTool, applyToolLine } from '../src/sim/tools';
import { tick } from '../src/sim/tick';

function flatCity(): City {
  const city = createCity(1, { coast: false, river: false, lakes: 0, forest: 0 });
  city.tiles.fill(Tile.Dirt);
  return city;
}

let city: City;
beforeEach(() => {
  city = flatCity();
});

describe('zone placement', () => {
  it('places a 3x3 residential zone for §100 with anchor bookkeeping', () => {
    const funds = city.funds;
    const r = applyTool(city, 'res', 10, 10);
    expect(r).toEqual({ ok: true, cost: COST.zone });
    expect(city.funds).toBe(funds - COST.zone);
    const anchorIdx = idx(9, 9);
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const i = idx(9 + dx, 9 + dy);
        expect(city.tiles[i]).toBe(Tile.ZoneR);
        expect(city.anchor[i]).toBe(anchorIdx);
      }
    }
    expect(city.stage[anchorIdx]).toBe(0);
  });

  it('places 4x4 power plants at their original prices', () => {
    expect(applyTool(city, 'coal', 10, 10)).toEqual({ ok: true, cost: COST.coal });
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        expect(city.tiles[idx(9 + dx, 9 + dy)]).toBe(Tile.Coal);
      }
    }
    expect(applyTool(city, 'nuclear', 30, 30)).toEqual({ ok: true, cost: COST.nuclear });
  });

  it('charges §1 extra per auto-bulldozed tree', () => {
    city.tiles[idx(9, 9)] = Tile.Tree;
    city.tiles[idx(10, 10)] = Tile.Tree;
    const r = applyTool(city, 'res', 10, 10);
    expect(r.cost).toBe(COST.zone + 2 * COST.bulldozer);
  });

  it('refuses water, overlap, and map edges', () => {
    city.tiles[idx(10, 10)] = Tile.Water;
    expect(applyTool(city, 'res', 10, 10).ok).toBe(false);

    city.tiles[idx(10, 10)] = Tile.Dirt;
    applyTool(city, 'res', 10, 10);
    expect(applyTool(city, 'com', 11, 11).ok).toBe(false); // overlaps

    expect(applyTool(city, 'res', 0, 0).ok).toBe(false); // anchor would be (-1,-1)
  });

  it('bulldozing any cell levels the whole footprint to rubble', () => {
    applyTool(city, 'res', 10, 10);
    const r = applyTool(city, 'bulldozer', 11, 11); // corner cell, not anchor
    expect(r).toEqual({ ok: true, cost: COST.bulldozer });
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const i = idx(9 + dx, 9 + dy);
        expect(city.tiles[i]).toBe(Tile.Rubble);
        expect(city.anchor[i]).toBe(-1);
      }
    }
  });
});

describe('demand model', () => {
  it('a fresh city wants all three, residential most', () => {
    takeCensus(city);
    evaluateDemand(city);
    expect(city.demand.r).toBeGreaterThan(0);
    expect(city.demand.c).toBeGreaterThan(0);
    expect(city.demand.i).toBeGreaterThan(0);
    expect(city.demand.r).toBeGreaterThan(city.demand.c);
    expect(city.demand.r).toBeGreaterThan(city.demand.i);
  });

  it('a large jobless population turns residential demand negative', () => {
    city.census = { resPop: 2000, comPop: 0, indPop: 0 };
    evaluateDemand(city);
    expect(city.demand.r).toBeLessThan(0);
    expect(city.demand.c).toBeGreaterThan(0); // all those residents want shops
  });

  it('jobs pull residents back in', () => {
    city.census = { resPop: 1000, comPop: 400, indPop: 600 };
    evaluateDemand(city);
    expect(city.demand.r).toBeGreaterThan(0);
  });
});

describe('zone growth', () => {
  // Powered R + I pair with a road between them, so both have power AND a
  // transport counterpart (growth past stage 1 requires access).
  function buildPoweredPair(): { r: number; i: number } {
    applyTool(city, 'coal', 10, 10); // (9,9)-(12,12)
    applyToolLine(city, 'wire', 13, 10, 30, 10); // wire row east
    applyTool(city, 'res', 20, 8); // (19,7)-(21,9), south edge touches wire
    applyTool(city, 'ind', 26, 8); // (25,7)-(27,9)
    applyToolLine(city, 'road', 18, 6, 29, 6); // road along the north edge
    return { r: idx(19, 7), i: idx(25, 7) };
  }

  it('a powered, connected zone under demand grows through stages', () => {
    const { r } = buildPoweredPair();
    for (let i = 0; i < 3000 && city.stage[r] < MAX_STAGE; i++) tick(city);
    expect(city.stage[r]).toBe(MAX_STAGE);
    expect(city.census.resPop).toBeGreaterThan(0);
  });

  it('an unpowered zone never grows', () => {
    applyTool(city, 'res', 40, 40);
    const anchorIdx = idx(39, 39);
    for (let i = 0; i < 500; i++) tick(city);
    expect(city.stage[anchorIdx]).toBe(0);
  });

  it('losing power decays a grown zone', () => {
    const { r } = buildPoweredPair();
    for (let i = 0; i < 3000 && city.stage[r] < MAX_STAGE; i++) tick(city);
    expect(city.stage[r]).toBe(MAX_STAGE);
    // Rip out the plant.
    applyTool(city, 'bulldozer', 10, 10);
    for (let i = 0; i < 4000 && city.stage[r] > 0; i++) tick(city);
    expect(city.stage[r]).toBe(0);
  });

  it('is deterministic: same seed, same actions, same city', () => {
    const run = () => {
      const c = flatCity();
      applyTool(c, 'coal', 10, 10);
      applyToolLine(c, 'wire', 13, 10, 30, 10);
      applyTool(c, 'res', 20, 8);
      applyTool(c, 'ind', 26, 8);
      applyToolLine(c, 'road', 18, 6, 29, 6);
      for (let i = 0; i < 1000; i++) tick(c);
      return c;
    };
    const a = run();
    const b = run();
    expect(a.tiles).toEqual(b.tiles);
    expect(a.stage).toEqual(b.stage);
    expect(a.funds).toBe(b.funds);
    expect(a.demand).toEqual(b.demand);
    expect(a.trafficDensity).toEqual(b.trafficDensity);
    expect(a.rng.state).toBe(b.rng.state);
  });
});
