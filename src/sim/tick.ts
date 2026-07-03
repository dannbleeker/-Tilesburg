import type { City } from './city';
import { TICKS_PER_MONTH } from './constants';
import { evaluateDemand, takeCensus } from './demand';
import {
  computeCrime,
  computeFireCoverage,
  computeLandValue,
  computePoliceCoverage,
  computePollution,
  computePopDensity,
  decayTraffic,
} from './maps';
import { scanPower } from './power';
import { generateTraffic } from './traffic';
import { scanZones } from './zones';

// The full tick pipeline, in the order stages will always run (DESIGN.md
// "Tick pipeline"). Later phases replace the remaining stubs in place so the
// ordering never churns.
export function tick(city: City): void {
  advanceClock(city);
  scanPower(city);
  scanZones(city);
  generateTraffic(city);
  diffuseMaps(city);
  advanceDisasters(city); // [phase 5]
  if (city.cityTime % TICKS_PER_MONTH === 0) {
    takeCensus(city);
    evaluateDemand(city);
  }
  collectBudget(city); // [phase 4] January tax/funding cycle
}

function advanceClock(city: City): void {
  city.cityTime++;
}

// The overlay maps refresh on a staggered schedule (full passes are cheap
// but there's no need to run them every tick), ordered so downstream maps
// read fresh upstream data: population → pollution → coverage → land value
// → crime.
function diffuseMaps(city: City): void {
  const phase = city.cityTime % TICKS_PER_MONTH;
  switch (phase) {
    case 2:
      computePopDensity(city);
      break;
    case 5:
      decayTraffic(city);
      computePollution(city);
      break;
    case 8:
      computePoliceCoverage(city);
      computeFireCoverage(city);
      break;
    case 11:
      computeLandValue(city);
      break;
    case 14:
      computeCrime(city);
      break;
  }
}

function advanceDisasters(_city: City): void {}
function collectBudget(_city: City): void {}

/**
 * Prime a fresh city's demand valves and overlay maps so the UI is
 * meaningful before the first monthly evaluation.
 */
export function primeDemand(city: City): void {
  takeCensus(city);
  evaluateDemand(city);
  computePopDensity(city);
  computePollution(city);
  computePoliceCoverage(city);
  computeFireCoverage(city);
  computeLandValue(city);
  computeCrime(city);
}
