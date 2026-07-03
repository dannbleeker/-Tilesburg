import type { City } from './city';
import { MAP_H, MAP_SIZE, MAP_W, Tile } from './constants';

// Shared scratch buffers for the diffusion passes (sim is single-threaded).
const scratchA = new Float32Array(MAP_SIZE);
const scratchB = new Float32Array(MAP_SIZE);

/** One 3x3 box-blur pass from src into dst (edge cells renormalize). */
function blurPass(src: Float32Array, dst: Float32Array): void {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= MAP_H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= MAP_W) continue;
          sum += src[yy * MAP_W + xx];
          n++;
        }
      }
      dst[y * MAP_W + x] = sum / n;
    }
  }
}

function diffuseInto(out: Uint8Array, passes: number): void {
  let src = scratchA;
  let dst = scratchB;
  for (let p = 0; p < passes; p++) {
    blurPass(src, dst);
    const t = src;
    src = dst;
    dst = t;
  }
  for (let i = 0; i < MAP_SIZE; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(src[i])));
  }
}

/**
 * Population density: zone footprint cells seed stage-scaled values, then one
 * smoothing pass so density bleeds into surrounding blocks.
 */
export function computePopDensity(city: City): void {
  const { tiles, anchor, stage } = city;
  scratchA.fill(0);
  for (let i = 0; i < MAP_SIZE; i++) {
    const a = anchor[i];
    if (a < 0) continue;
    const t = tiles[i];
    if (t === Tile.ZoneR || t === Tile.ZoneC || t === Tile.ZoneI) {
      scratchA[i] = stage[a] * 40;
    }
  }
  diffuseInto(city.popDensity, 1);
}

/**
 * Pollution: industry (stage-scaled), coal plants, and road traffic seed the
 * map; two blur passes spread it to neighbors, matching the original's
 * smoothed feel. Rail deliberately contributes nothing.
 */
export function computePollution(city: City): void {
  const { tiles, anchor, stage, trafficDensity } = city;
  scratchA.fill(0);
  for (let i = 0; i < MAP_SIZE; i++) {
    const t = tiles[i];
    let v = 0;
    if (t === Tile.ZoneI) {
      const a = anchor[i];
      v = 40 + (a >= 0 ? stage[a] * 15 : 0);
    } else if (t === Tile.Coal) {
      v = 90;
    } else if (t === Tile.Fire) {
      v = 70;
    } else if (t === Tile.Radioactive) {
      v = 60;
    } else if (t === Tile.Road || t === Tile.Bridge || t === Tile.RoadWire || t === Tile.RoadRail) {
      v = trafficDensity[i] * 0.5;
    }
    scratchA[i] = v;
  }
  diffuseInto(city.pollution, 2);
}

/**
 * Land value: proximity to water and trees raises it, closeness to the
 * city's population centroid raises it, pollution and crime drag it down.
 */
export function computeLandValue(city: City): void {
  const { tiles, pollution, crime, popDensity } = city;

  // Population centroid (map center for an empty city).
  let cx = 0;
  let cy = 0;
  let total = 0;
  for (let i = 0; i < MAP_SIZE; i++) {
    const p = popDensity[i];
    if (p > 0) {
      cx += (i % MAP_W) * p;
      cy += Math.floor(i / MAP_W) * p;
      total += p;
    }
  }
  if (total > 0) {
    cx /= total;
    cy /= total;
  } else {
    cx = MAP_W / 2;
    cy = MAP_H / 2;
  }

  // Amenity seed: water/trees radiate a small bonus.
  scratchA.fill(0);
  for (let i = 0; i < MAP_SIZE; i++) {
    const t = tiles[i];
    if (t === Tile.Water) scratchA[i] = 40;
    else if (t === Tile.Tree) scratchA[i] = 25;
  }
  blurPass(scratchA, scratchB);
  blurPass(scratchB, scratchA);

  const { landValue } = city;
  for (let i = 0; i < MAP_SIZE; i++) {
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    const centrality = Math.max(0, 60 * (1 - dist / 70));
    const v = 30 + scratchA[i] + centrality - pollution[i] * 0.35 - crime[i] * 0.25;
    landValue[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
}

/**
 * Crime: populated cells generate crime pressure inversely proportional to
 * land value, suppressed by police coverage; one pass smooths it into
 * neighborhoods.
 */
export function computeCrime(city: City): void {
  const { popDensity, landValue, policeCov } = city;
  scratchA.fill(0);
  for (let i = 0; i < MAP_SIZE; i++) {
    const pop = popDensity[i];
    if (pop === 0) continue;
    const raw = pop * 1.1 + Math.max(0, 70 - landValue[i]) - policeCov[i] * 1.4;
    scratchA[i] = Math.max(0, raw);
  }
  diffuseInto(city.crime, 1);
}

/**
 * Station coverage: stations seed a strong value at their footprint, spread
 * wide by repeated blurring. `funding` (0..1) scales reach; budget sliders
 * plug in here in phase 4.
 */
function computeCoverage(city: City, out: Uint8Array, stationType: number, funding: number): void {
  const { tiles } = city;
  scratchA.fill(0);
  for (let i = 0; i < MAP_SIZE; i++) {
    if (tiles[i] === stationType) scratchA[i] = 800 * funding;
  }
  diffuseInto(out, 6);
}

export function computePoliceCoverage(city: City, funding = 1): void {
  computeCoverage(city, city.policeCov, Tile.Police, funding);
}

export function computeFireCoverage(city: City, funding = 1): void {
  computeCoverage(city, city.fireCov, Tile.FireStation, funding);
}

/** Traffic decays between generation passes so stale routes fade out. */
export function decayTraffic(city: City): void {
  const td = city.trafficDensity;
  for (let i = 0; i < MAP_SIZE; i++) {
    td[i] = (td[i] * 7) >> 3; // *= 0.875
  }
}
