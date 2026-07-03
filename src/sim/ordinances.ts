import type { City } from './city';
import { MAP_SIZE } from './constants';

export type OrdinanceId =
  | 'parkingFines'
  | 'gambling'
  | 'pollutionControls'
  | 'antiDrug'
  | 'neighborhoodWatch'
  | 'smokingBan'
  | 'freeClinics'
  | 'proReading'
  | 'tourismAds'
  | 'energyConservation';

export interface OrdinanceDef {
  id: OrdinanceId;
  name: string;
  blurb: string;
  /** Annual § effect: positive = income, negative = cost. */
  annualNet: (city: City) => number;
}

function pop(city: City): number {
  const { resPop, comPop, indPop } = city.census;
  return resPop + comPop + indPop;
}

function totalTraffic(city: City): number {
  let t = 0;
  for (let i = 0; i < MAP_SIZE; i++) t += city.trafficDensity[i];
  return t;
}

// Effects are deliberately mild — they shade the core RCI loop, never
// dominate it. The sim hooks live in demand.ts (demand deltas), maps.ts
// (crime & pollution factors), evaluation.ts (approval), and budget.ts
// (annual § via annualNet).
export const ORDINANCES: OrdinanceDef[] = [
  {
    id: 'parkingFines',
    name: 'Parking fines',
    blurb: 'Income scales with traffic; shoppers grumble (C demand −)',
    annualNet: (c) => Math.round(totalTraffic(c) * 0.02),
  },
  {
    id: 'gambling',
    name: 'Legalized gambling',
    blurb: 'Steady income; crime +10%',
    annualNet: (c) => 100 + Math.round(pop(c) * 0.1),
  },
  {
    id: 'pollutionControls',
    name: 'Pollution controls',
    blurb: 'Industrial pollution −20%; industry resents it (I demand −)',
    annualNet: (c) => -(50 + Math.round(c.census.indPop * 0.2)),
  },
  {
    id: 'antiDrug',
    name: 'Anti-drug campaign',
    blurb: 'Crime −10%',
    annualNet: (c) => -(30 + Math.round(pop(c) * 0.05)),
  },
  {
    id: 'neighborhoodWatch',
    name: 'Neighborhood watch',
    blurb: 'Crime −5%; approval +',
    annualNet: (c) => -(20 + Math.round(pop(c) * 0.03)),
  },
  {
    id: 'smokingBan',
    name: 'Public smoking ban',
    blurb: 'Approval +; healthier residents (R demand +)',
    annualNet: () => -20,
  },
  {
    id: 'freeClinics',
    name: 'Free clinics',
    blurb: 'R demand +; approval +',
    annualNet: (c) => -(40 + Math.round(pop(c) * 0.08)),
  },
  {
    id: 'proReading',
    name: 'Pro-reading campaign',
    blurb: 'Long-term R and C demand +',
    annualNet: () => -30,
  },
  {
    id: 'tourismAds',
    name: 'Tourism advertising',
    blurb: 'Commercial demand +',
    annualNet: () => -40,
  },
  {
    id: 'energyConservation',
    name: 'Energy conservation',
    blurb: 'Power plants run cleaner (coal pollution −10%)',
    annualNet: () => -60,
  },
];

export function ordinanceNet(city: City): number {
  let net = 0;
  for (const o of ORDINANCES) {
    if (city.ordinances[o.id]) net += o.annualNet(city);
  }
  return net;
}

// --- effect factor helpers (read by the sim systems) -----------------------

export function crimeFactor(city: City): number {
  let f = 1;
  if (city.ordinances.gambling) f *= 1.1;
  if (city.ordinances.antiDrug) f *= 0.9;
  if (city.ordinances.neighborhoodWatch) f *= 0.95;
  return f;
}

export function industrialPollutionFactor(city: City): number {
  return city.ordinances.pollutionControls ? 0.8 : 1;
}

export function coalPollutionFactor(city: City): number {
  return city.ordinances.energyConservation ? 0.9 : 1;
}

/** Additive demand deltas per valve. */
export function demandDeltas(city: City): { r: number; c: number; i: number } {
  const o = city.ordinances;
  return {
    r: (o.smokingBan ? 40 : 0) + (o.freeClinics ? 60 : 0) + (o.proReading ? 30 : 0),
    c: (o.tourismAds ? 80 : 0) + (o.proReading ? 30 : 0) + (o.parkingFines ? -50 : 0),
    i: o.pollutionControls ? -60 : 0,
  };
}

export function approvalBonus(city: City): number {
  const o = city.ordinances;
  return (o.neighborhoodWatch ? 3 : 0) + (o.smokingBan ? 2 : 0) + (o.freeClinics ? 3 : 0);
}
