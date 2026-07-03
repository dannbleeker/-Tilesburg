import { beforeEach, describe, expect, it } from 'vitest';
import { createCity, idx, type City } from '../src/sim/city';
import { Tile } from '../src/sim/constants';
import { isPowered, scanPower } from '../src/sim/power';
import { applyTool, applyToolLine } from '../src/sim/tools';

function flatCity(): City {
  const city = createCity(1, { coast: false, river: false, lakes: 0, forest: 0 });
  city.tiles.fill(Tile.Dirt);
  return city;
}

let city: City;
beforeEach(() => {
  city = flatCity();
});

describe('power grid', () => {
  it('powers a zone connected to a plant by wire', () => {
    // Coal plant centered at (10,10) → footprint (9,9)-(12,12).
    expect(applyTool(city, 'coal', 10, 10).ok).toBe(true);
    // Wire east from the plant edge to a zone.
    applyToolLine(city, 'wire', 13, 10, 18, 10);
    expect(applyTool(city, 'res', 20, 10).ok).toBe(true);
    scanPower(city);
    expect(isPowered(city, idx(19, 9))).toBe(true); // zone anchor
  });

  it('does not power an isolated zone', () => {
    applyTool(city, 'coal', 10, 10);
    applyTool(city, 'res', 40, 40);
    scanPower(city);
    expect(isPowered(city, idx(39, 39))).toBe(false);
  });

  it('cutting the wire de-powers downstream', () => {
    applyTool(city, 'coal', 10, 10);
    applyToolLine(city, 'wire', 13, 10, 18, 10);
    applyTool(city, 'res', 20, 10);
    scanPower(city);
    expect(isPowered(city, idx(19, 9))).toBe(true);
    applyTool(city, 'bulldozer', 15, 10);
    scanPower(city);
    expect(isPowered(city, idx(19, 9))).toBe(false);
  });

  it('conducts through underwater cable and road crossings, not roads', () => {
    applyTool(city, 'coal', 10, 10);
    // Water gap at x=14..15.
    city.tiles[idx(14, 10)] = Tile.Water;
    city.tiles[idx(15, 10)] = Tile.Water;
    applyToolLine(city, 'wire', 13, 10, 16, 10);
    expect(city.tiles[idx(14, 10)]).toBe(Tile.WireWater);
    // Road crossing at x=17.
    applyTool(city, 'road', 17, 10);
    applyTool(city, 'wire', 17, 10);
    expect(city.tiles[idx(17, 10)]).toBe(Tile.RoadWire);
    applyTool(city, 'wire', 18, 10);
    applyTool(city, 'res', 20, 10);
    scanPower(city);
    expect(isPowered(city, idx(19, 9))).toBe(true);

    // A plain road carries no power.
    applyTool(city, 'road', 30, 30);
    applyTool(city, 'road', 31, 30);
    scanPower(city);
    expect(isPowered(city, idx(30, 30))).toBe(false);
  });

  it('power passes between adjacent buildings', () => {
    applyTool(city, 'coal', 10, 10);
    // Zone sharing an edge with the plant footprint: plant covers (9,9)-(12,12),
    // zone anchored at (13,9) covers (13,9)-(15,11).
    expect(applyTool(city, 'res', 14, 10).ok).toBe(true);
    scanPower(city);
    expect(isPowered(city, idx(13, 9))).toBe(true);
  });
});
