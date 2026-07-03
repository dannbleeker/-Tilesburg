import { beforeEach, describe, expect, it } from 'vitest';
import { createCity, idx, type City } from '../src/sim/city';
import { Flag, MAX_STAGE, Tile } from '../src/sim/constants';
import { generateTraffic } from '../src/sim/traffic';
import { applyTool, applyToolLine } from '../src/sim/tools';
import { tick } from '../src/sim/tick';

function flatCity(): City {
  const city = createCity(1, { coast: false, river: false, lakes: 0, forest: 0 });
  city.tiles.fill(Tile.Dirt);
  city.funds = 1_000_000;
  return city;
}

/** Run one full stagger cycle so every slice's anchors attempt a trip. */
function fullTrafficPass(city: City): void {
  for (let s = 0; s < 8; s++) {
    generateTraffic(city);
    city.cityTime++;
  }
}

let city: City;
beforeEach(() => {
  city = flatCity();
});

describe('trip generation', () => {
  it('grants access when a road links R to I within range', () => {
    applyTool(city, 'res', 10, 10); // (9,9)-(11,11)
    applyTool(city, 'ind', 20, 10); // (19,9)-(21,11)
    applyToolLine(city, 'road', 12, 10, 18, 10);
    fullTrafficPass(city);
    expect(city.flags[idx(9, 9)] & Flag.Access).not.toBe(0);
    expect(city.flags[idx(19, 9)] & Flag.Access).not.toBe(0);
  });

  it('deposits traffic on the connecting road', () => {
    applyTool(city, 'res', 10, 10);
    applyTool(city, 'ind', 20, 10);
    applyToolLine(city, 'road', 12, 10, 18, 10);
    fullTrafficPass(city);
    let loaded = 0;
    for (let x = 12; x <= 18; x++) if (city.trafficDensity[idx(x, 10)] > 0) loaded++;
    expect(loaded).toBeGreaterThan(0);
  });

  it('rail carries the trip but keeps its tiles traffic-free', () => {
    applyTool(city, 'res', 10, 10);
    applyTool(city, 'ind', 20, 10);
    applyToolLine(city, 'rail', 12, 10, 18, 10);
    fullTrafficPass(city);
    expect(city.flags[idx(9, 9)] & Flag.Access).not.toBe(0);
    for (let x = 12; x <= 18; x++) expect(city.trafficDensity[idx(x, 10)]).toBe(0);
  });

  it('denies access with no counterpart in range', () => {
    applyTool(city, 'res', 10, 10);
    // Long road to nowhere.
    applyToolLine(city, 'road', 12, 10, 50, 10);
    fullTrafficPass(city);
    expect(city.flags[idx(9, 9)] & Flag.Access).toBe(0);
  });

  it('denies access beyond the trip distance limit', () => {
    applyTool(city, 'res', 10, 10);
    applyTool(city, 'ind', 70, 10); // ~57 road tiles away, over the 40 limit
    applyToolLine(city, 'road', 12, 10, 68, 10);
    fullTrafficPass(city);
    expect(city.flags[idx(9, 9)] & Flag.Access).toBe(0);
  });

  it('commercial seeks residents, not industry', () => {
    applyTool(city, 'com', 10, 10);
    applyTool(city, 'ind', 20, 10);
    applyToolLine(city, 'road', 12, 10, 18, 10);
    fullTrafficPass(city);
    expect(city.flags[idx(9, 9)] & Flag.Access).toBe(0);
  });
});

describe('access gating in growth', () => {
  function poweredPair(link: 'road' | 'none'): { r: number; i: number } {
    applyTool(city, 'coal', 10, 20);
    applyToolLine(city, 'wire', 13, 20, 30, 20);
    applyTool(city, 'res', 16, 16); // adjacent to wire row? no — wire at y=20, zone (15,15)-(17,17)
    applyToolLine(city, 'wire', 16, 18, 16, 19); // stub up to the zone
    applyTool(city, 'ind', 26, 16);
    applyToolLine(city, 'wire', 26, 18, 26, 19);
    if (link === 'road') applyToolLine(city, 'road', 15, 14, 27, 14); // along the zones' north edge
    return { r: idx(15, 15), i: idx(25, 15) };
  }

  it('zones without transport stall at stage 1', () => {
    const { r } = poweredPair('none');
    for (let i = 0; i < 3000; i++) tick(city);
    expect(city.stage[r]).toBeLessThanOrEqual(1);
  });

  it('zones with a road link grow past stage 1', () => {
    const { r } = poweredPair('road');
    for (let i = 0; i < 3000 && city.stage[r] < MAX_STAGE; i++) tick(city);
    expect(city.stage[r]).toBeGreaterThan(1);
  });
});
