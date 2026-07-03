import { describe, expect, it } from 'vitest';
import { createCity, type City } from '../src/sim/city';
import { Tile } from '../src/sim/constants';
import { deserializeCity, serializeCity } from '../src/sim/save';
import { createScenarioCity, SCENARIOS } from '../src/sim/scenarios';
import { applyTool, applyToolLine } from '../src/sim/tools';
import { tick } from '../src/sim/tick';

function buildCity(): City {
  const city = createCity(1234, { coast: true, river: true, lakes: 1, forest: 0.5 });
  city.disastersEnabled = false;
  applyTool(city, 'coal', 30, 30);
  applyToolLine(city, 'wire', 33, 30, 45, 30);
  applyTool(city, 'res', 40, 28);
  applyTool(city, 'ind', 44, 28);
  applyToolLine(city, 'road', 38, 26, 47, 26);
  city.taxRate = 9;
  city.ordinances.gambling = true;
  for (let i = 0; i < 500; i++) tick(city);
  return city;
}

describe('save codec', () => {
  it('round-trips every persisted field', () => {
    const a = buildCity();
    const b = deserializeCity(serializeCity(a));
    expect(b.tiles).toEqual(a.tiles);
    expect(b.anchor).toEqual(a.anchor);
    expect(b.stage).toEqual(a.stage);
    expect(b.flags).toEqual(a.flags);
    expect(b.trafficDensity).toEqual(a.trafficDensity);
    expect(b.funds).toBe(a.funds);
    expect(b.cityTime).toBe(a.cityTime);
    expect(b.taxRate).toBe(9);
    expect(b.ordinances.gambling).toBe(true);
    expect(b.rng.state).toBe(a.rng.state);
    expect(b.demand).toEqual(a.demand);
    expect(b.census).toEqual(a.census);
  });

  it('a loaded city continues deterministically', () => {
    const a = buildCity();
    const b = deserializeCity(serializeCity(a));
    for (let i = 0; i < 500; i++) {
      tick(a);
      tick(b);
    }
    expect(b.tiles).toEqual(a.tiles);
    expect(b.stage).toEqual(a.stage);
    expect(b.funds).toBe(a.funds);
    expect(b.rng.state).toBe(a.rng.state);
  });

  it('preserves scenario progress', () => {
    const a = createScenarioCity(SCENARIOS.find((s) => s.id === 'dullsville1900')!);
    for (let i = 0; i < 100; i++) tick(a);
    const b = deserializeCity(serializeCity(a));
    expect(b.scenario).toEqual(a.scenario);
    expect(b.startYear).toBe(1900);
  });

  it('rejects garbage and wrong versions', () => {
    expect(() => deserializeCity('{"version":99}')).toThrow();
    expect(() => deserializeCity('not json')).toThrow();
  });

  it('round-trips disaster state', () => {
    const a = buildCity();
    a.monster = { x: 10, y: 20, ttl: 100, dir: 1.5, targetX: 50, targetY: 60 };
    a.floodTicks = 44;
    a.tiles[500] = Tile.Radioactive;
    const b = deserializeCity(serializeCity(a));
    expect(b.monster).toEqual(a.monster);
    expect(b.floodTicks).toBe(44);
    expect(b.tiles[500]).toBe(Tile.Radioactive);
  });
});
