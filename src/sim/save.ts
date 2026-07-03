import { createCity, type City } from './city';
import { MAP_SIZE } from './constants';
import { Rng } from './rng';

// Pure city <-> JSON codec (no DOM): localStorage autosave, manual slots,
// and file export/import all share it. Derived overlay maps are recomputed
// after load, so only authored state is stored. The RNG state rides along,
// making a loaded city continue deterministically.

export const SAVE_VERSION = 1;

interface SaveData {
  version: number;
  seed: number;
  rngState: number;
  cityTime: number;
  funds: number;
  startYear: number;
  taxRate: number;
  funding: City['funding'];
  autoBudget: boolean;
  disastersEnabled: boolean;
  ordinances: Record<string, boolean>;
  scenario: City['scenario'];
  demand: City['demand'];
  census: City['census'];
  lastYearPop: number;
  floodTicks: number;
  monster: City['monster'];
  tornado: City['tornado'];
  tiles: string;
  flags: string;
  anchor: string;
  stage: string;
  trafficDensity: string;
}

function encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function serializeCity(city: City): string {
  const data: SaveData = {
    version: SAVE_VERSION,
    seed: city.seed,
    rngState: city.rng.state,
    cityTime: city.cityTime,
    funds: city.funds,
    startYear: city.startYear,
    taxRate: city.taxRate,
    funding: city.funding,
    autoBudget: city.autoBudget,
    disastersEnabled: city.disastersEnabled,
    ordinances: city.ordinances,
    scenario: city.scenario,
    demand: city.demand,
    census: city.census,
    lastYearPop: city.lastYearPop,
    floodTicks: city.floodTicks,
    monster: city.monster,
    tornado: city.tornado,
    tiles: encode(city.tiles.buffer as ArrayBuffer),
    flags: encode(city.flags.buffer as ArrayBuffer),
    anchor: encode(city.anchor.buffer as ArrayBuffer),
    stage: encode(city.stage.buffer as ArrayBuffer),
    trafficDensity: encode(city.trafficDensity.buffer as ArrayBuffer),
  };
  return JSON.stringify(data);
}

export function deserializeCity(json: string): City {
  const data = JSON.parse(json) as SaveData;
  if (data.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${data.version}`);

  // Build a shell city (terrain is immediately overwritten by the payload).
  const city = createCity(data.seed, { coast: false, river: false, lakes: 0, forest: 0 });

  city.tiles = new Uint16Array(decode(data.tiles).buffer);
  city.flags = decode(data.flags);
  city.anchor = new Int32Array(decode(data.anchor).buffer);
  city.stage = decode(data.stage);
  city.trafficDensity = decode(data.trafficDensity);
  if (city.tiles.length !== MAP_SIZE || city.anchor.length !== MAP_SIZE) {
    throw new Error('Corrupt save payload');
  }

  city.rng = new Rng(0);
  city.rng.state = data.rngState >>> 0;
  city.seed = data.seed;
  city.cityTime = data.cityTime;
  city.funds = data.funds;
  city.startYear = data.startYear;
  city.taxRate = data.taxRate;
  city.funding = data.funding;
  city.autoBudget = data.autoBudget;
  city.disastersEnabled = data.disastersEnabled;
  city.ordinances = data.ordinances;
  city.scenario = data.scenario;
  city.demand = data.demand;
  city.census = data.census;
  city.lastYearPop = data.lastYearPop;
  city.floodTicks = data.floodTicks;
  city.monster = data.monster;
  city.tornado = data.tornado;
  return city;
}
