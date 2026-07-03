import { describe, expect, it } from 'vitest';
import { MAP_SIZE, Tile } from '../src/sim/constants';
import { Rng } from '../src/sim/rng';
import { generateTerrain, STARTER_MAPS } from '../src/sim/terrain';

function counts(tiles: Uint16Array): Map<number, number> {
  const m = new Map<number, number>();
  for (const t of tiles) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

describe('generateTerrain', () => {
  it('is deterministic for the same seed and params', () => {
    const params = { coast: true, river: true, lakes: 2, forest: 0.5 };
    const a = generateTerrain(new Rng(42), params);
    const b = generateTerrain(new Rng(42), params);
    expect(a).toEqual(b);
  });

  it('differs across seeds', () => {
    const params = { coast: false, river: true, lakes: 1, forest: 0.5 };
    const a = generateTerrain(new Rng(1), params);
    const b = generateTerrain(new Rng(2), params);
    expect(a).not.toEqual(b);
  });

  it('only produces terrain tile types', () => {
    const tiles = generateTerrain(new Rng(7), { coast: true, river: true, lakes: 3, forest: 0.9 });
    const allowed = new Set<number>([Tile.Dirt, Tile.Water, Tile.Tree]);
    for (const t of tiles) expect(allowed.has(t)).toBe(true);
  });

  it('a river map has water spanning west to east', () => {
    const tiles = generateTerrain(new Rng(1907), { coast: false, river: true, lakes: 0, forest: 0 });
    const c = counts(tiles);
    expect(c.get(Tile.Water) ?? 0).toBeGreaterThan(100);
  });

  describe.each(STARTER_MAPS)('starter map $name', (m) => {
    const tiles = generateTerrain(new Rng(m.seed), m.params);
    const c = counts(tiles);
    const land = (c.get(Tile.Dirt) ?? 0) + (c.get(Tile.Tree) ?? 0);

    it('leaves enough buildable land', () => {
      expect(land / MAP_SIZE).toBeGreaterThan(0.55);
    });

    it('has water and trees', () => {
      expect(c.get(Tile.Water) ?? 0).toBeGreaterThan(50);
      expect(c.get(Tile.Tree) ?? 0).toBeGreaterThan(100);
    });
  });
});
