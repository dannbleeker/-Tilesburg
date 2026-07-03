import { beforeEach, describe, expect, it } from 'vitest';
import { createCity, getTile, setTile, type City } from '../src/sim/city';
import { COST, Tile } from '../src/sim/constants';
import { applyTool, applyToolLine } from '../src/sim/tools';

// A flat all-dirt city so tests control the terrain exactly.
function flatCity(): City {
  const city = createCity(1, { coast: false, river: false, lakes: 0, forest: 0 });
  city.tiles.fill(Tile.Dirt);
  return city;
}

let city: City;
beforeEach(() => {
  city = flatCity();
});

describe('road tool', () => {
  it('places a road on dirt for §10', () => {
    const funds = city.funds;
    const r = applyTool(city, 'road', 10, 10);
    expect(r).toEqual({ ok: true, cost: COST.road });
    expect(getTile(city, 10, 10)).toBe(Tile.Road);
    expect(city.funds).toBe(funds - COST.road);
  });

  it('auto-bulldozes trees for §11 total', () => {
    setTile(city, 4, 4, Tile.Tree);
    const funds = city.funds;
    const r = applyTool(city, 'road', 4, 4);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(COST.road + COST.bulldozer);
    expect(getTile(city, 4, 4)).toBe(Tile.Road);
    expect(city.funds).toBe(funds - COST.road - COST.bulldozer);
  });

  it('builds a bridge over water for §50', () => {
    setTile(city, 6, 6, Tile.Water);
    const r = applyTool(city, 'road', 6, 6);
    expect(r).toEqual({ ok: true, cost: COST.bridge });
    expect(getTile(city, 6, 6)).toBe(Tile.Bridge);
  });

  it('is a free no-op on existing road', () => {
    applyTool(city, 'road', 3, 3);
    const funds = city.funds;
    const r = applyTool(city, 'road', 3, 3);
    expect(r).toEqual({ ok: true, cost: 0 });
    expect(city.funds).toBe(funds);
  });

  it('refuses rubble', () => {
    setTile(city, 2, 2, Tile.Rubble);
    const r = applyTool(city, 'road', 2, 2);
    expect(r.ok).toBe(false);
    expect(getTile(city, 2, 2)).toBe(Tile.Rubble);
  });

  it('fails without charging when funds are short', () => {
    city.funds = 5;
    const r = applyTool(city, 'road', 1, 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Not enough funds');
    expect(city.funds).toBe(5);
    expect(getTile(city, 1, 1)).toBe(Tile.Dirt);
  });

  it('rejects out-of-bounds placement', () => {
    expect(applyTool(city, 'road', -1, 0).ok).toBe(false);
    expect(applyTool(city, 'road', 0, 1000).ok).toBe(false);
  });
});

describe('bulldozer', () => {
  it('clears trees, rubble, and roads to dirt for §1', () => {
    for (const t of [Tile.Tree, Tile.Rubble, Tile.Road] as const) {
      setTile(city, 8, 8, t);
      const funds = city.funds;
      const r = applyTool(city, 'bulldozer', 8, 8);
      expect(r).toEqual({ ok: true, cost: COST.bulldozer });
      expect(getTile(city, 8, 8)).toBe(Tile.Dirt);
      expect(city.funds).toBe(funds - COST.bulldozer);
    }
  });

  it('returns bridges to open water', () => {
    setTile(city, 9, 9, Tile.Bridge);
    const r = applyTool(city, 'bulldozer', 9, 9);
    expect(r.ok).toBe(true);
    expect(getTile(city, 9, 9)).toBe(Tile.Water);
  });

  it('refuses water and empty dirt without charging', () => {
    const funds = city.funds;
    setTile(city, 7, 7, Tile.Water);
    expect(applyTool(city, 'bulldozer', 7, 7).ok).toBe(false);
    expect(applyTool(city, 'bulldozer', 0, 0).ok).toBe(false);
    expect(city.funds).toBe(funds);
  });
});

describe('applyToolLine (drag placement)', () => {
  it('lays a contiguous horizontal road and charges per tile', () => {
    const funds = city.funds;
    const r = applyToolLine(city, 'road', 10, 20, 19, 20);
    expect(r.placed).toBe(10);
    expect(r.cost).toBe(10 * COST.road);
    for (let x = 10; x <= 19; x++) expect(getTile(city, x, 20)).toBe(Tile.Road);
    expect(city.funds).toBe(funds - r.cost);
  });

  it('rasterizes diagonals with no gaps (8-connected path)', () => {
    const r = applyToolLine(city, 'road', 0, 0, 9, 5);
    expect(r.placed).toBeGreaterThanOrEqual(10);
    // Endpoints placed.
    expect(getTile(city, 0, 0)).toBe(Tile.Road);
    expect(getTile(city, 9, 5)).toBe(Tile.Road);
  });

  it('skips existing road without charging twice', () => {
    applyToolLine(city, 'road', 0, 30, 9, 30);
    const funds = city.funds;
    const r = applyToolLine(city, 'road', 0, 30, 9, 30);
    expect(r.cost).toBe(0);
    expect(r.placed).toBe(0);
    expect(city.funds).toBe(funds);
  });

  it('stops charging when funds run out mid-line', () => {
    city.funds = 35; // enough for 3 road tiles
    const r = applyToolLine(city, 'road', 0, 40, 9, 40);
    expect(r.placed).toBe(3);
    expect(r.cost).toBe(30);
    expect(r.reason).toBe('Not enough funds');
    expect(city.funds).toBe(5);
  });

  it('handles single-cell lines', () => {
    const r = applyToolLine(city, 'road', 5, 5, 5, 5);
    expect(r.placed).toBe(1);
    expect(r.cost).toBe(COST.road);
  });
});
