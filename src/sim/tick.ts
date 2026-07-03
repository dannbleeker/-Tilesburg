import type { City } from './city';
import { TICKS_PER_MONTH } from './constants';
import { evaluateDemand, takeCensus } from './demand';
import { scanPower } from './power';
import { scanZones } from './zones';

// The full tick pipeline, in the order stages will always run (DESIGN.md
// "Tick pipeline"). Later phases replace the remaining stubs in place so the
// ordering never churns.
export function tick(city: City): void {
  advanceClock(city);
  scanPower(city);
  scanZones(city);
  generateTraffic(city); // [phase 3]
  diffuseMaps(city); //   [phase 3] pollution / land value / crime passes
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

function generateTraffic(_city: City): void {}
function diffuseMaps(_city: City): void {}
function advanceDisasters(_city: City): void {}
function collectBudget(_city: City): void {}

/**
 * Prime a fresh city's demand valves so the RCI indicator is meaningful
 * before the first monthly evaluation.
 */
export function primeDemand(city: City): void {
  takeCensus(city);
  evaluateDemand(city);
}
