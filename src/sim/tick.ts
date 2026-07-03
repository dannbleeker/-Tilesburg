import type { City } from './city';

// The full tick pipeline, in the order stages will always run (DESIGN.md
// "Tick pipeline"). Phase 1 implements only the clock; later phases replace
// the stubs in place so the ordering never churns.
export function tick(city: City): void {
  advanceClock(city);
  scanPower(city); //     [phase 2] flood-fill from plants through conductors
  scanZones(city); //     [phase 2/3] staggered zone growth/decay
  generateTraffic(city); // [phase 3]
  diffuseMaps(city); //   [phase 3] pollution / land value / crime passes
  advanceDisasters(city); // [phase 5]
  evaluateDemand(city); // [phase 2] RCI demand from census + external market
  collectBudget(city); // [phase 4] January tax/funding cycle
  takeCensus(city); //    [phase 4]
}

function advanceClock(city: City): void {
  city.cityTime++;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
function scanPower(_city: City): void {}
function scanZones(_city: City): void {}
function generateTraffic(_city: City): void {}
function diffuseMaps(_city: City): void {}
function advanceDisasters(_city: City): void {}
function evaluateDemand(_city: City): void {}
function collectBudget(_city: City): void {}
function takeCensus(_city: City): void {}
