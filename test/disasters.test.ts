import { beforeEach, describe, expect, it } from 'vitest';
import { createCity, idx, type City } from '../src/sim/city';
import { MAP_SIZE, Tile } from '../src/sim/constants';
import {
  advanceDisasters,
  triggerEarthquake,
  triggerFire,
  triggerFlood,
  triggerMeltdown,
  triggerMonster,
  triggerPlaneCrash,
  triggerTornado,
} from '../src/sim/disasters';
import { applyTool } from '../src/sim/tools';
import { tick } from '../src/sim/tick';

function flatCity(): City {
  const city = createCity(1, { coast: false, river: false, lakes: 0, forest: 0 });
  city.tiles.fill(Tile.Dirt);
  city.funds = 1_000_000;
  city.disastersEnabled = false; // keep tests deterministic about causes
  return city;
}

function count(city: City, t: number): number {
  let n = 0;
  for (let i = 0; i < MAP_SIZE; i++) if (city.tiles[i] === t) n++;
  return n;
}

let city: City;
beforeEach(() => {
  city = flatCity();
});

describe('fire', () => {
  it('ignites something burnable and spreads through a forest', () => {
    for (let y = 40; y < 50; y++) for (let x = 40; x < 50; x++) city.tiles[idx(x, y)] = Tile.Tree;
    triggerFire(city);
    expect(count(city, Tile.Fire)).toBeGreaterThan(0);
    const startTrees = count(city, Tile.Tree);
    for (let i = 0; i < 100; i++) tick(city);
    expect(count(city, Tile.Tree)).toBeLessThan(startTrees);
  });

  it('burns out into rubble eventually', () => {
    for (let y = 40; y < 44; y++) for (let x = 40; x < 44; x++) city.tiles[idx(x, y)] = Tile.Tree;
    triggerFire(city);
    for (let i = 0; i < 2000 && count(city, Tile.Fire) > 0; i++) tick(city);
    expect(count(city, Tile.Fire)).toBe(0);
    expect(count(city, Tile.Rubble)).toBeGreaterThan(0);
  });

  it('fire coverage slows the burn', () => {
    const run = (covered: boolean) => {
      const c = flatCity();
      for (let y = 30; y < 46; y++) for (let x = 30; x < 46; x++) c.tiles[idx(x, y)] = Tile.Tree;
      if (covered) c.fireCov.fill(220);
      c.tiles[idx(38, 38)] = Tile.Fire;
      for (let i = 0; i < 60; i++) tick(c);
      return count(c, Tile.Tree);
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('burns buildings down to rubble footprints', () => {
    applyTool(city, 'res', 40, 40); // footprint (39,39)-(41,41)
    // Ring the zone with fire so the (deterministic, seeded) run reliably
    // catches the building.
    for (let x = 38; x <= 42; x++) {
      city.tiles[idx(x, 38)] = Tile.Fire;
      city.tiles[idx(x, 42)] = Tile.Fire;
    }
    for (let y = 39; y <= 41; y++) {
      city.tiles[idx(38, y)] = Tile.Fire;
      city.tiles[idx(42, y)] = Tile.Fire;
    }
    for (let i = 0; i < 1000 && city.anchor[idx(39, 39)] === idx(39, 39); i++) tick(city);
    // The zone should eventually be gone (leveled by spreading fire).
    expect(city.anchor[idx(39, 39)]).toBe(-1);
  });
});

describe('flood', () => {
  it('rises from the shoreline, spreads, then recedes', () => {
    for (let y = 40; y < 60; y++) for (let x = 40; x < 44; x++) city.tiles[idx(x, y)] = Tile.Water;
    triggerFlood(city);
    const initial = count(city, Tile.Flood);
    expect(initial).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) tick(city);
    expect(count(city, Tile.Flood)).toBeGreaterThan(initial);
    for (let i = 0; i < 200 && city.floodTicks > 0; i++) tick(city);
    expect(count(city, Tile.Flood)).toBe(0);
  });

  it('does nothing on a bone-dry map', () => {
    triggerFlood(city);
    expect(count(city, Tile.Flood)).toBe(0);
    expect(city.floodTicks).toBe(0);
  });
});

describe('tornado and monster', () => {
  it('tornado wanders, destroys, and dissipates', () => {
    for (let x = 0; x < 120; x++) city.tiles[idx(x, 30)] = Tile.Road;
    triggerTornado(city);
    expect(city.tornado).not.toBeNull();
    for (let i = 0; i < 500 && city.tornado; i++) tick(city);
    expect(city.tornado).toBeNull();
    expect(count(city, Tile.Rubble)).toBeGreaterThan(0);
  });

  it('monster heads for the pollution and leaves a trail', () => {
    city.pollution[idx(60, 50)] = 255;
    triggerMonster(city);
    expect(city.monster).not.toBeNull();
    expect(city.monster?.targetX).toBe(60);
    expect(city.monster?.targetY).toBe(50);
    const startX = city.monster!.x;
    for (let i = 0; i < 200; i++) tick(city);
    if (city.monster) {
      expect(Math.abs(city.monster.x - 60)).toBeLessThan(Math.abs(startX - 60));
    }
  });
});

describe('earthquake and plane crash', () => {
  it('earthquake wrecks infrastructure across the map', () => {
    for (let x = 0; x < 120; x++) {
      city.tiles[idx(x, 30)] = Tile.Road;
      city.tiles[idx(x, 60)] = Tile.Rail;
    }
    triggerEarthquake(city);
    expect(count(city, Tile.Rubble)).toBeGreaterThan(0);
  });

  it('plane crash levels a 3x3 and starts fires', () => {
    triggerPlaneCrash(city);
    expect(count(city, Tile.Fire)).toBeGreaterThan(0);
  });
});

describe('meltdown', () => {
  it('requires a nuclear plant', () => {
    expect(triggerMeltdown(city)).toBe(false);
    applyTool(city, 'coal', 20, 20);
    expect(triggerMeltdown(city)).toBe(false);
    applyTool(city, 'nuclear', 40, 40);
    expect(triggerMeltdown(city)).toBe(true);
    expect(count(city, Tile.Fire)).toBe(16); // the 4x4 plant burns
    expect(count(city, Tile.Radioactive)).toBeGreaterThan(0);
  });

  it('radioactive land cannot be bulldozed', () => {
    applyTool(city, 'nuclear', 40, 40);
    triggerMeltdown(city);
    let radIdx = -1;
    for (let i = 0; i < MAP_SIZE; i++) if (city.tiles[i] === Tile.Radioactive) { radIdx = i; break; }
    const r = applyTool(city, 'bulldozer', radIdx % 120, Math.floor(radIdx / 120));
    expect(r.ok).toBe(false);
  });
});

describe('random disasters', () => {
  it('never fire when disabled', () => {
    city.disastersEnabled = false;
    for (let i = 0; i < 2000; i++) tick(city);
    expect(count(city, Tile.Fire)).toBe(0);
    expect(city.tornado).toBeNull();
    expect(city.monster).toBeNull();
  });
});
