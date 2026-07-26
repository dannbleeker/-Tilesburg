import { beforeEach, describe, expect, it } from 'vitest';
import { assessBudget, cashFlow } from '../src/sim/budget';
import { createCity, idx, type City } from '../src/sim/city';
import { MAP_SIZE, MAP_W, TICKS_PER_YEAR, Tile } from '../src/sim/constants';
import { triggerFlood, triggerMeltdown, triggerMonster } from '../src/sim/disasters';
import { cityPopulation } from '../src/sim/evaluation';
import { recomputeDerivedMaps } from '../src/sim/maps';
import { deserializeCity, SAVE_VERSION, serializeCity } from '../src/sim/save';
import { createScenarioCity, SCENARIOS } from '../src/sim/scenarios';
import { tick } from '../src/sim/tick';
import { applyTool, applyToolLine } from '../src/sim/tools';

// Regression suite: every case here reproduces a defect found in the bug hunt
// and would fail against the code as it stood before the fix.

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

describe('save: an unsettled January budget survives the round trip', () => {
  it('persists pendingBudget so the yearly autosave cannot swallow a year', () => {
    city.autoBudget = false;
    // Real infrastructure, so the year actually costs something — the monthly
    // census recomputes population from the grid, so a hand-set census would
    // be wiped before January.
    applyTool(city, 'police', 20, 20);
    applyToolLine(city, 'road', 0, 30, 40, 30);
    for (let i = 0; i < TICKS_PER_YEAR; i++) tick(city);
    expect(city.pendingBudget).not.toBeNull();
    const owed = cashFlow(city, city.pendingBudget!);
    expect(owed).not.toBe(0);

    const back = deserializeCity(serializeCity(city));
    expect(back.pendingBudget).toEqual(city.pendingBudget);
    expect(cashFlow(back, back.pendingBudget!)).toBe(owed);
  });

  it('still loads a v1 save, which had no pendingBudget field', () => {
    const raw = JSON.parse(serializeCity(city)) as Record<string, unknown>;
    delete raw.pendingBudget;
    raw.version = 1;
    const back = deserializeCity(JSON.stringify(raw));
    expect(back.pendingBudget).toBeNull();
    expect(back.cityTime).toBe(city.cityTime);
  });

  it('rejects a future version and any short grid payload', () => {
    const raw = JSON.parse(serializeCity(city)) as Record<string, unknown>;
    expect(() => deserializeCity(JSON.stringify({ ...raw, version: SAVE_VERSION + 1 }))).toThrow();
    // Every grid is length-checked, not just tiles and anchor: a short one
    // would read undefined past the end and poison the census with NaN.
    for (const field of ['tiles', 'flags', 'anchor', 'stage', 'trafficDensity']) {
      const short = { ...raw, [field]: btoa('too short') };
      expect(() => deserializeCity(JSON.stringify(short)), field).toThrow();
    }
  });
});

describe('load: derived maps are rebuilt at the city\'s real funding', () => {
  it('reproduces the saved coverage instead of full-funding coverage', () => {
    applyTool(city, 'fire', 40, 40);
    applyTool(city, 'police', 60, 40);
    city.funding.fire = 0.1;
    city.funding.police = 0.2;
    // Run past the monthly coverage phase so the live maps reflect funding.
    for (let i = 0; i < 2 * 16; i++) tick(city);
    const liveFire = city.fireCov[idx(40, 40)];
    const livePolice = city.policeCov[idx(60, 40)];
    expect(liveFire).toBeGreaterThan(0);

    const back = deserializeCity(serializeCity(city));
    recomputeDerivedMaps(back);
    expect(back.fireCov[idx(40, 40)]).toBe(liveFire);
    expect(back.policeCov[idx(60, 40)]).toBe(livePolice);
  });

  it('resumes tick-for-tick after a load, with funding cut and a fire burning', () => {
    applyTool(city, 'fire', 40, 40);
    city.funding.fire = 0.1;
    for (let y = 36; y < 46; y++) for (let x = 36; x < 46; x++) {
      if (city.tiles[idx(x, y)] === Tile.Dirt) city.tiles[idx(x, y)] = Tile.Tree;
    }
    for (let i = 0; i < 32; i++) tick(city);
    city.tiles[idx(44, 41)] = Tile.Fire;

    const back = deserializeCity(serializeCity(city));
    recomputeDerivedMaps(back);
    for (let i = 0; i < 40; i++) {
      tick(city);
      tick(back);
    }
    expect(back.tiles).toEqual(city.tiles);
    expect(back.rng.state).toBe(city.rng.state);
  });

  it('a load does not re-run the census, so restored demand survives', () => {
    city.census = { ...city.census, resPop: 1234, comPop: 56, indPop: 78 };
    city.demand = { r: 111, c: 222, i: 333 };
    const back = deserializeCity(serializeCity(city));
    recomputeDerivedMaps(back);
    expect(back.census.resPop).toBe(1234);
    expect(back.demand).toEqual({ r: 111, c: 222, i: 333 });
    expect(back.messages).toEqual([]); // no re-fired cap-lifter nag
  });
});

describe('traffic density keeps its dynamic range', () => {
  it('a busy city spans the density tiers instead of pinning at 255', () => {
    // A full stamped town, which is where saturation actually showed: with the
    // old load/decay balance every routed tile sat at 255 and the map's only
    // observed values were {0, 223, 255}.
    const b = createScenarioCity(SCENARIOS.find((s) => s.id === 'bern1965')!);
    b.disastersEnabled = false;
    for (let i = 0; i < TICKS_PER_YEAR + 64; i++) tick(b);

    let saturated = 0;
    let mid = 0;
    let loaded = 0;
    for (let i = 0; i < MAP_SIZE; i++) {
      const t = b.tiles[i];
      if (t !== Tile.Road && t !== Tile.Bridge && t !== Tile.RoadWire && t !== Tile.RoadRail) continue;
      const td = b.trafficDensity[i];
      if (td > 0) loaded++;
      if (td === 255) saturated++;
      // The renderer's "busy" art tier, which was unreachable when the map
      // saturated.
      if (td > 30 && td <= 100) mid++;
    }
    expect(loaded).toBeGreaterThan(0);
    expect(saturated).toBe(0);
    expect(mid).toBeGreaterThan(0);
  });
});

describe('floods respect water and fallout', () => {
  // A wet cell is one the coastline is made of: open water, or something built
  // over water. Flooding may destroy the structure, but the map must never end
  // up with *less* water than it started with.
  function wetCells(c: City): number {
    let n = 0;
    for (let i = 0; i < MAP_SIZE; i++) {
      const t = c.tiles[i];
      if (t === Tile.Water || t === Tile.Bridge || t === Tile.WireWater || t === Tile.RailWater) n++;
    }
    return n;
  }

  it('never converts a water tile into dry land via a drowned bridge', () => {
    // A one-tile channel with land on both banks, so the flood — which seeds on
    // land next to water — can actually spread onto the bridge deck.
    for (let y = 30; y < 70; y++) city.tiles[idx(42, y)] = Tile.Water;
    for (let y = 40; y < 50; y++) city.tiles[idx(42, y)] = Tile.Bridge;
    const before = wetCells(city);

    triggerFlood(city);
    for (let i = 0; i < 400 && city.floodTicks > 0; i++) tick(city);

    expect(wetCells(city)).toBeGreaterThanOrEqual(before);
    // And specifically: no cell of the channel became walkable ground.
    for (let y = 30; y < 70; y++) {
      const t = city.tiles[idx(42, y)];
      expect(t === Tile.Dirt || t === Tile.Rubble, `channel at y=${y}`).toBe(false);
    }
  });

  it('leaves radioactive fallout in place', () => {
    applyTool(city, 'nuclear', 50, 50);
    expect(triggerMeltdown(city)).toBe(true);
    // Carve the channel first: counting fallout before this would include
    // tiles the test itself overwrites with water.
    for (let y = 30; y < 70; y++) city.tiles[idx(42, y)] = Tile.Water;
    const radBefore = city.tiles.reduce((n, t) => n + (t === Tile.Radioactive ? 1 : 0), 0);
    expect(radBefore).toBeGreaterThan(0);

    triggerFlood(city);
    for (let i = 0; i < 400 && city.floodTicks > 0; i++) tick(city);

    const radAfter = city.tiles.reduce((n, t) => n + (t === Tile.Radioactive ? 1 : 0), 0);
    expect(radAfter).toBe(radBefore);
  });
});

describe('monster targeting', () => {
  it('heads for the middle of the map when nothing is polluted', () => {
    city.pollution.fill(0);
    triggerMonster(city);
    // The old fallback used MAP_SIZE >> 1, which is the west *edge* of the
    // middle row, not the centre.
    expect(city.monster?.targetX).toBe(MAP_W >> 1);
    expect(city.monster?.targetX).not.toBe(0);
  });
});

describe('scenarios', () => {
  it('every scenario starts with its derived maps already built', () => {
    for (const def of SCENARIOS) {
      const c = createScenarioCity(def);
      let pop = 0;
      for (let i = 0; i < MAP_SIZE; i++) pop += c.popDensity[i];
      expect(pop, def.id).toBeGreaterThan(0);
    }
  });

  it('Bern 1965 is not won by doing nothing', () => {
    const b = createScenarioCity(SCENARIOS.find((s) => s.id === 'bern1965')!);
    b.disastersEnabled = false;
    for (let i = 0; i < 3 * TICKS_PER_YEAR; i++) tick(b);
    expect(b.scenario?.outcome).toBe('open');
  });

  it('Bern 1965 is won by moving the streets onto rail', () => {
    const b = createScenarioCity(SCENARIOS.find((s) => s.id === 'bern1965')!);
    b.disastersEnabled = false;
    b.funds = 1_000_000;
    for (let i = 0; i < TICKS_PER_YEAR + 64; i++) tick(b);
    expect(b.scenario?.outcome).toBe('open');
    // Replace the north-south streets with rail: rail carries the trips
    // without depositing traffic.
    for (let bx = 0; bx <= 10; bx++) {
      const x = 28 + bx * 4;
      applyToolLine(b, 'bulldozer', x, 30, x, 62);
      applyToolLine(b, 'rail', x, 30, x, 62);
    }
    for (let i = 0; i < 3 * TICKS_PER_YEAR && b.scenario?.outcome === 'open'; i++) tick(b);
    expect(b.scenario?.outcome).toBe('won');
    expect(cityPopulation(b)).toBeGreaterThan(0);
  });

  it('a win needs a sustained streak, not one lucky sample', () => {
    const def = SCENARIOS.find((s) => s.id === 'bern1965')!;
    expect(def.sustainedChecks).toBeGreaterThan(1);
    const b = createScenarioCity(def);
    b.scenario!.streak = 0;
    // One passing check must not be enough to end the scenario.
    b.cityTime = TICKS_PER_YEAR + 8;
    b.trafficDensity.fill(0);
    tick(b);
    expect(b.scenario?.outcome).toBe('open');
  });
});

describe('budget window arithmetic', () => {
  it('re-prices the year when the tax rate changes', () => {
    city.census = { ...city.census, resPop: 1000, comPop: 0, indPop: 0 };
    city.taxRate = 7;
    const atDefault = assessBudget(city).taxIncome;
    city.taxRate = 14;
    expect(assessBudget(city).taxIncome).toBe(atDefault * 2);
  });
});
