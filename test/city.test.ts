import { describe, expect, it } from 'vitest';
import { createCity, getDate, getTile, idx, inBounds, setTile, spend } from '../src/sim/city';
import { MAP_H, MAP_SIZE, MAP_W, START_FUNDS, TICKS_PER_MONTH, TICKS_PER_YEAR, Tile } from '../src/sim/constants';
import { STARTER_MAPS } from '../src/sim/terrain';
import { tick } from '../src/sim/tick';

const starter = STARTER_MAPS[0];

describe('City', () => {
  it('creates a 120x100 map with starting funds', () => {
    const city = createCity(starter.seed, starter.params);
    expect(city.width).toBe(120);
    expect(city.height).toBe(100);
    expect(city.tiles.length).toBe(MAP_SIZE);
    expect(city.funds).toBe(START_FUNDS);
    expect(city.cityTime).toBe(0);
  });

  it('indexes row-major', () => {
    expect(idx(0, 0)).toBe(0);
    expect(idx(1, 0)).toBe(1);
    expect(idx(0, 1)).toBe(MAP_W);
    expect(idx(MAP_W - 1, MAP_H - 1)).toBe(MAP_SIZE - 1);
  });

  it('bounds-checks correctly', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(MAP_W - 1, MAP_H - 1)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(MAP_W, 0)).toBe(false);
    expect(inBounds(0, MAP_H)).toBe(false);
  });

  it('get/setTile round-trips and ignores out-of-bounds writes', () => {
    const city = createCity(starter.seed, starter.params);
    setTile(city, 5, 5, Tile.Road);
    expect(getTile(city, 5, 5)).toBe(Tile.Road);
    setTile(city, -1, 5, Tile.Road); // must not wrap or throw
    expect(getTile(city, MAP_W - 1, 4)).not.toBe(Tile.Road);
  });

  it('spend charges only when affordable', () => {
    const city = createCity(starter.seed, starter.params);
    city.funds = 10;
    expect(spend(city, 8)).toBe(true);
    expect(city.funds).toBe(2);
    expect(spend(city, 5)).toBe(false);
    expect(city.funds).toBe(2);
  });

  it('advances the calendar from Jan 1900', () => {
    const city = createCity(starter.seed, starter.params);
    expect(getDate(city)).toEqual({ year: 1900, month: 0 });
    for (let i = 0; i < TICKS_PER_MONTH; i++) tick(city);
    expect(getDate(city)).toEqual({ year: 1900, month: 1 });
    while (city.cityTime < TICKS_PER_YEAR) tick(city);
    expect(getDate(city)).toEqual({ year: 1901, month: 0 });
  });
});
