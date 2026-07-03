import { applyBudget, assessBudget, decayInfrastructure } from './budget';
import type { City } from './city';
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from './constants';
import { evaluateDemand, takeCensus } from './demand';
import { advanceDisasters } from './disasters';
import { cityPopulation } from './evaluation';
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
  advanceDisasters(city);
  if (city.cityTime % TICKS_PER_MONTH === 0) {
    takeCensus(city);
    evaluateDemand(city);
  }
  collectBudget(city);
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
      computePoliceCoverage(city, city.funding.police);
      computeFireCoverage(city, city.funding.fire);
      break;
    case 11:
      computeLandValue(city);
      break;
    case 14:
      computeCrime(city);
      break;
  }
}

/**
 * The January cycle: infrastructure decays by the transit funding gap, the
 * year's books are assessed, and either settled silently (auto-budget) or
 * handed to the UI as a pending budget to review. Also snapshots population
 * for the evaluation window's net-migration figure.
 */
function collectBudget(city: City): void {
  if (city.cityTime === 0 || city.cityTime % TICKS_PER_YEAR !== 0) return;
  decayInfrastructure(city);
  const summary = assessBudget(city);
  if (city.autoBudget) {
    applyBudget(city, summary);
  } else {
    city.pendingBudget = summary;
  }
  city.lastYearPop = cityPopulation(city);
}

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
