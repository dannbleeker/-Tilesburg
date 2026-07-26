import { beforeEach, describe, expect, it } from 'vitest';
import { createCity, idx, type City } from '../src/sim/city';
import { COST, Tile } from '../src/sim/constants';
import {
  computeCrime,
  computeLandValue,
  computePoliceCoverage,
  computePollution,
  computePopDensity,
  decayTraffic,
} from '../src/sim/maps';
import { queryTile } from '../src/sim/query';
import { applyTool } from '../src/sim/tools';

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

describe('pollution', () => {
  it('industry and coal pollute and it diffuses outward', () => {
    applyTool(city, 'coal', 30, 30);
    computePollution(city);
    const atPlant = city.pollution[idx(30, 30)];
    const near = city.pollution[idx(34, 30)];
    const far = city.pollution[idx(50, 30)];
    expect(atPlant).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(0);
    expect(atPlant).toBeGreaterThan(near);
    expect(far).toBe(0);
  });

  it('traffic pollutes roads', () => {
    applyTool(city, 'road', 20, 20);
    city.trafficDensity[idx(20, 20)] = 200;
    computePollution(city);
    expect(city.pollution[idx(20, 20)]).toBeGreaterThan(0);
  });

  it('rail does not pollute', () => {
    applyTool(city, 'rail', 20, 20);
    computePollution(city);
    expect(city.pollution[idx(20, 20)]).toBe(0);
  });
});

describe('land value', () => {
  it('water proximity raises value, pollution lowers it', () => {
    // Lake west of center; compare two cells equidistant from the map
    // centroid so only the amenity differs.
    for (let y = 48; y <= 52; y++) for (let x = 32; x <= 38; x++) city.tiles[idx(x, y)] = Tile.Water;
    computeLandValue(city);
    const lakeside = city.landValue[idx(40, 50)];
    const inland = city.landValue[idx(80, 50)];
    expect(lakeside).toBeGreaterThan(inland);

    const before = city.landValue[idx(40, 50)];
    city.pollution[idx(40, 50)] = 200;
    computeLandValue(city);
    expect(city.landValue[idx(40, 50)]).toBeLessThan(before);
  });
});

describe('crime and police', () => {
  it('dense population breeds crime; a police station suppresses it', () => {
    // Fake a dense neighborhood.
    applyTool(city, 'res', 40, 40);
    city.stage[idx(39, 39)] = 4;
    computePopDensity(city);
    computeLandValue(city);
    computeCrime(city);
    const unpoliced = city.crime[idx(40, 40)];
    expect(unpoliced).toBeGreaterThan(0);

    applyTool(city, 'police', 44, 40);
    computePoliceCoverage(city, 1);
    computeCrime(city);
    expect(city.crime[idx(40, 40)]).toBeLessThan(unpoliced);
  });

  it('police coverage spreads beyond the station footprint and fades out', () => {
    applyTool(city, 'police', 40, 40); // footprint (39,39)-(41,41)
    computePoliceCoverage(city, 1);
    expect(city.policeCov[idx(40, 40)]).toBeGreaterThan(0);
    expect(city.policeCov[idx(45, 40)]).toBeGreaterThan(0); // 4 tiles past the edge
    expect(city.policeCov[idx(40, 40)]).toBeGreaterThan(city.policeCov[idx(45, 40)]);
    expect(city.policeCov[idx(60, 40)]).toBe(0); // far away
  });
});

describe('traffic decay', () => {
  it('fades toward zero', () => {
    city.trafficDensity[100] = 200;
    decayTraffic(city);
    expect(city.trafficDensity[100]).toBeLessThan(200);
    for (let i = 0; i < 60; i++) decayTraffic(city);
    expect(city.trafficDensity[100]).toBe(0);
  });
});

describe('rail & station tools', () => {
  it('rail costs §20 on land, §100 over water, and crosses roads', () => {
    expect(applyTool(city, 'rail', 5, 5)).toEqual({ ok: true, cost: COST.rail });
    city.tiles[idx(6, 5)] = Tile.Water;
    expect(applyTool(city, 'rail', 6, 5)).toEqual({ ok: true, cost: COST.railWater });
    expect(city.tiles[idx(6, 5)]).toBe(Tile.RailWater);
    applyTool(city, 'road', 7, 5);
    expect(applyTool(city, 'rail', 7, 5)).toEqual({ ok: true, cost: COST.rail });
    expect(city.tiles[idx(7, 5)]).toBe(Tile.RoadRail);
  });

  it('police and fire stations cost §500 each', () => {
    expect(applyTool(city, 'police', 10, 10)).toEqual({ ok: true, cost: COST.police });
    expect(applyTool(city, 'fire', 20, 10)).toEqual({ ok: true, cost: COST.fire });
    expect(city.tiles[idx(10, 10)]).toBe(Tile.Police);
    expect(city.tiles[idx(20, 10)]).toBe(Tile.FireStation);
  });
});

describe('query', () => {
  it('reports zone status and overlay values', () => {
    applyTool(city, 'res', 10, 10);
    const info = queryTile(city, 10, 10);
    expect(info?.name).toBe('Residential zone');
    expect(info?.building?.stage).toBe('Undeveloped');
    expect(info?.building?.powered).toBe(false);
    const water = queryTile(city, -5, 0);
    expect(water).toBeNull();
  });
});
