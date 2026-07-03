import type { City } from './city';
import { Flag, FOOTPRINT, isZone, MAP_SIZE, Tile, type BuildingType } from './constants';
import { approvalBonus } from './ordinances';

/** People per point of zone population (the classic multiplier feel). */
export const POP_MULTIPLIER = 20;

export const CITY_CLASSES: Array<{ min: number; name: string }> = [
  { min: 500_000, name: 'Megalopolis' },
  { min: 100_000, name: 'Metropolis' },
  { min: 50_000, name: 'Capital' },
  { min: 10_000, name: 'City' },
  { min: 2_000, name: 'Town' },
  { min: 0, name: 'Village' },
];

export interface Complaint {
  name: string;
  /** 0..100 severity. */
  score: number;
}

export interface Evaluation {
  population: number;
  netMigration: number;
  assessedValue: number;
  cityClass: string;
  /** Mayor approval, 0..100. */
  approval: number;
  /** Worst problems first, only those above a nuisance threshold. */
  complaints: Complaint[];
}

const BUILDING_VALUE: Partial<Record<number, number>> = {
  [Tile.Police]: 500,
  [Tile.FireStation]: 500,
  [Tile.Coal]: 3000,
  [Tile.Nuclear]: 5000,
  [Tile.Stadium]: 3000,
  [Tile.Seaport]: 5000,
  [Tile.Airport]: 10000,
};

export function cityPopulation(city: City): number {
  const { resPop, comPop, indPop } = city.census;
  return (resPop + comPop + indPop) * POP_MULTIPLIER;
}

/** The evaluation window's numbers, computed on demand from current state. */
export function evaluate(city: City): Evaluation {
  const { tiles, anchor, stage, popDensity, crime, pollution, trafficDensity, flags } = city;

  // Averages over inhabited cells; assessed value over building anchors.
  let cells = 0;
  let crimeSum = 0;
  let pollSum = 0;
  let trafficSum = 0;
  let assessed = 0;
  let zones = 0;
  let unpoweredZones = 0;
  for (let i = 0; i < MAP_SIZE; i++) {
    if (popDensity[i] > 0) {
      cells++;
      crimeSum += crime[i];
      pollSum += pollution[i];
      trafficSum += trafficDensity[i];
    }
    if (anchor[i] === i) {
      const t = tiles[i];
      if (isZone(t)) {
        zones++;
        if ((flags[i] & Flag.Powered) === 0) unpoweredZones++;
        assessed += 100 + stage[i] * 400;
      } else {
        const size = FOOTPRINT[t as BuildingType];
        assessed += BUILDING_VALUE[t] ?? size * 100;
      }
    }
  }
  const crimeAvg = cells ? crimeSum / cells : 0;
  const pollAvg = cells ? pollSum / cells : 0;
  const trafficAvg = cells ? trafficSum / cells : 0;

  const labor = city.census.resPop;
  const jobs = (city.census.comPop + city.census.indPop) * 1.6;
  const unemployment = labor > 0 ? Math.max(0, (labor - jobs) / labor) : 0;
  const powerGap = zones > 0 ? unpoweredZones / zones : 0;

  const complaints: Complaint[] = [
    { name: 'Crime', score: Math.min(100, crimeAvg * 1.2) },
    { name: 'Pollution', score: Math.min(100, pollAvg * 1.2) },
    { name: 'Traffic', score: Math.min(100, trafficAvg * 0.8) },
    { name: 'Taxes', score: Math.min(100, Math.max(0, city.taxRate - 7) * 12) },
    { name: 'Unemployment', score: Math.round(unemployment * 100) },
    { name: 'Blackouts', score: Math.round(powerGap * 100) },
  ]
    .filter((c) => c.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((c) => ({ name: c.name, score: Math.round(c.score) }));

  const population = cityPopulation(city);
  const approval = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        90 +
          approvalBonus(city) -
          crimeAvg * 0.5 -
          pollAvg * 0.4 -
          trafficAvg * 0.2 -
          Math.max(0, city.taxRate - 7) * 4 -
          unemployment * 30 -
          powerGap * 25,
      ),
    ),
  );

  return {
    population,
    netMigration: population - city.lastYearPop,
    assessedValue: assessed,
    cityClass: (CITY_CLASSES.find((c) => population >= c.min) ?? CITY_CLASSES[CITY_CLASSES.length - 1]).name,
    approval,
    complaints,
  };
}
