import type { City, DisasterActor } from './city';
import { isBuilding, MAP_H, MAP_SIZE, MAP_W, TICKS_PER_MONTH, Tile } from './constants';
import { levelFootprint } from './tools';

// --- shared destruction --------------------------------------------------

/** Smash one cell: buildings level to rubble, infrastructure crumbles. */
function wreckCell(city: City, x: number, y: number): void {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return;
  const i = y * MAP_W + x;
  const t = city.tiles[i];
  if (isBuilding(t)) {
    levelFootprint(city, city.anchor[i]);
    return;
  }
  switch (t) {
    case Tile.Tree:
      city.tiles[i] = Tile.Dirt;
      break;
    case Tile.Road:
    case Tile.Rail:
    case Tile.Wire:
    case Tile.RoadWire:
    case Tile.RoadRail:
      city.tiles[i] = Tile.Rubble;
      break;
    case Tile.Bridge:
    case Tile.RailWater:
    case Tile.WireWater:
      city.tiles[i] = Tile.Water;
      break;
  }
}

/** True if fire can take this cell. */
function burnable(t: number): boolean {
  return t === Tile.Tree || t === Tile.Rubble || isBuilding(t);
}

function ignite(city: City, x: number, y: number): void {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return;
  const i = y * MAP_W + x;
  const t = city.tiles[i];
  if (isBuilding(t)) levelFootprint(city, city.anchor[i]);
  else if (!burnable(t) && t !== Tile.Dirt) return;
  city.tiles[i] = Tile.Fire;
}

// --- manual triggers ------------------------------------------------------

/** Set something flammable alight, picked uniformly from all burnable cells. */
export function triggerFire(city: City): void {
  const { rng, tiles } = city;
  const candidates: number[] = [];
  for (let i = 0; i < MAP_SIZE; i++) {
    if (burnable(tiles[i])) candidates.push(i);
  }
  if (candidates.length === 0) return;
  const i = candidates[rng.int(candidates.length)];
  ignite(city, i % MAP_W, Math.floor(i / MAP_W));
  city.messages.push('Fire reported!');
}

/** Flood water rises from the shoreline. */
export function triggerFlood(city: City): void {
  const { rng, tiles } = city;
  let seeded = 0;
  for (let attempt = 0; attempt < 2000 && seeded < 12; attempt++) {
    const i = rng.int(MAP_SIZE);
    if (tiles[i] !== Tile.Water) continue;
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
      const nt = tiles[ny * MAP_W + nx];
      if (nt === Tile.Dirt || nt === Tile.Tree) {
        tiles[ny * MAP_W + nx] = Tile.Flood;
        seeded++;
        break;
      }
    }
  }
  if (seeded > 0) {
    city.floodTicks = 120;
    city.messages.push('Flooding reported!');
  }
}

export function triggerTornado(city: City): void {
  const { rng } = city;
  city.tornado = {
    x: rng.range(5, MAP_W - 6),
    y: 0,
    ttl: 220,
    dir: Math.PI / 2, // heading south
    targetX: 0,
    targetY: 0,
  };
  city.messages.push('Tornado sighted!');
}

/** Instant shockwave: scattered destruction plus a few fires. */
export function triggerEarthquake(city: City): void {
  const { rng } = city;
  const shocks = rng.range(80, 160);
  for (let s = 0; s < shocks; s++) {
    wreckCell(city, rng.int(MAP_W), rng.int(MAP_H));
  }
  for (let f = 0; f < 5; f++) {
    const i = rng.int(MAP_SIZE);
    if (burnable(city.tiles[i])) ignite(city, i % MAP_W, Math.floor(i / MAP_W));
  }
  city.messages.push('Major earthquake!');
}

/** The monster comes ashore and heads for the smog. */
export function triggerMonster(city: City): void {
  const { rng, pollution } = city;
  // Densest pollution is the destination.
  let best = 0;
  let target = MAP_SIZE >> 1;
  for (let i = 0; i < MAP_SIZE; i++) {
    if (pollution[i] > best) {
      best = pollution[i];
      target = i;
    }
  }
  city.monster = {
    x: rng.chance(0.5) ? 0 : MAP_W - 1,
    y: rng.range(10, MAP_H - 11),
    ttl: 500,
    dir: 0,
    targetX: target % MAP_W,
    targetY: Math.floor(target / MAP_W),
  };
  city.messages.push('A monster has been sighted!');
}

export function triggerPlaneCrash(city: City): void {
  const { rng } = city;
  const cx = rng.range(4, MAP_W - 5);
  const cy = rng.range(4, MAP_H - 5);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      wreckCell(city, cx + dx, cy + dy);
    }
  }
  ignite(city, cx, cy);
  ignite(city, cx + 1, cy);
  ignite(city, cx, cy + 1);
  city.messages.push('Plane crash!');
}

/** Only possible with a nuclear plant. Leaves radioactive land. */
export function triggerMeltdown(city: City): boolean {
  const { tiles, anchor, rng } = city;
  let plant = -1;
  for (let i = 0; i < MAP_SIZE; i++) {
    if (tiles[i] === Tile.Nuclear && anchor[i] === i) {
      plant = i;
      break;
    }
  }
  if (plant < 0) return false;
  const px = plant % MAP_W;
  const py = Math.floor(plant / MAP_W);
  levelFootprint(city, plant);
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      city.tiles[(py + dy) * MAP_W + px + dx] = Tile.Fire;
    }
  }
  // Fallout scatter.
  for (let f = 0; f < 40; f++) {
    const x = px + rng.range(-8, 11);
    const y = py + rng.range(-8, 11);
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
    const t = tiles[y * MAP_W + x];
    if (t === Tile.Dirt || t === Tile.Tree || t === Tile.Rubble) {
      tiles[y * MAP_W + x] = Tile.Radioactive;
    }
  }
  city.messages.push('NUCLEAR MELTDOWN!');
  return true;
}

// --- per-tick progression -------------------------------------------------

export function advanceDisasters(city: City): void {
  advanceFire(city);
  advanceFlood(city);
  advanceActor(city, 'tornado');
  advanceActor(city, 'monster');
  rollRandomDisaster(city);
}

// Fire spreads every other tick; coverage both damps ignition of neighbors
// and speeds extinguishing.
function advanceFire(city: City): void {
  if (city.cityTime % 2 !== 0) return;
  const { tiles, rng, fireCov } = city;
  // Snapshot: newly-ignited cells shouldn't spread in the same pass.
  const burning: number[] = [];
  for (let i = 0; i < MAP_SIZE; i++) {
    if (tiles[i] === Tile.Fire) burning.push(i);
  }
  for (const i of burning) {
    const damp = fireCov[i] / 255; // 0..1
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
      const nt = tiles[ny * MAP_W + nx];
      const p = isBuilding(nt) ? 0.1 : nt === Tile.Tree ? 0.2 : 0;
      if (p > 0 && rng.chance(p * (1 - damp * 0.8))) ignite(city, nx, ny);
    }
    if (rng.chance(0.08 + damp * 0.35)) tiles[i] = Tile.Rubble;
  }
}

function advanceFlood(city: City): void {
  if (city.floodTicks <= 0) return;
  city.floodTicks--;
  const { tiles, rng } = city;
  const receding = city.floodTicks === 0;
  const flooded: number[] = [];
  for (let i = 0; i < MAP_SIZE; i++) {
    if (tiles[i] === Tile.Flood) flooded.push(i);
  }
  if (receding) {
    for (const i of flooded) {
      tiles[i] = rng.chance(0.3) ? Tile.Rubble : Tile.Dirt;
    }
    city.messages.push('Flood waters have receded.');
    return;
  }
  if (city.cityTime % 2 !== 0) return;
  for (const i of flooded) {
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
      const j = ny * MAP_W + nx;
      const nt = tiles[j];
      if (nt === Tile.Water || nt === Tile.Flood) continue;
      if (rng.chance(0.06)) {
        if (isBuilding(nt)) levelFootprint(city, city.anchor[j]);
        tiles[j] = Tile.Flood;
      }
    }
  }
}

// Tornado wanders; monster steers toward its pollution target. Both smash
// whatever they cross; the monster also starts fires.
function advanceActor(city: City, kind: 'tornado' | 'monster'): void {
  const actor: DisasterActor | null = city[kind];
  if (!actor) return;
  const { rng } = city;
  actor.ttl--;
  if (actor.ttl <= 0) {
    city[kind] = null;
    city.messages.push(kind === 'tornado' ? 'The tornado has dissipated.' : 'The monster has left.');
    return;
  }

  const speedGate = kind === 'tornado' ? 1 : 3; // monster is slower
  if (city.cityTime % speedGate !== 0) return;

  if (kind === 'tornado') {
    actor.dir += (rng.next() - 0.5) * 1.2;
  } else {
    const want = Math.atan2(actor.targetY - actor.y, actor.targetX - actor.x);
    actor.dir = want + (rng.next() - 0.5) * 0.8;
    // Arrived: rampage in place a bit, then pick a random walk-off heading.
    if (Math.abs(actor.targetX - actor.x) < 2 && Math.abs(actor.targetY - actor.y) < 2) {
      actor.targetX = rng.int(MAP_W);
      actor.targetY = rng.int(MAP_H);
    }
  }
  actor.x += Math.cos(actor.dir);
  actor.y += Math.sin(actor.dir);
  actor.x = Math.max(0, Math.min(MAP_W - 1, actor.x));
  actor.y = Math.max(0, Math.min(MAP_H - 1, actor.y));

  const cx = Math.round(actor.x);
  const cy = Math.round(actor.y);
  wreckCell(city, cx, cy);
  if (kind === 'monster') {
    wreckCell(city, cx + 1, cy);
    wreckCell(city, cx, cy + 1);
    if (rng.chance(0.1)) ignite(city, cx + rng.range(-1, 1), cy + rng.range(-1, 1));
  }
}

// A quiet random-disaster clock: one roll a month, weighted toward fire.
function rollRandomDisaster(city: City): void {
  if (!city.disastersEnabled) return;
  if (city.cityTime % TICKS_PER_MONTH !== 7) return;
  const { rng } = city;
  if (!rng.chance(0.02)) return;
  const roll = rng.next();
  if (roll < 0.35) triggerFire(city);
  else if (roll < 0.5) triggerFlood(city);
  else if (roll < 0.65) triggerTornado(city);
  else if (roll < 0.75) triggerEarthquake(city);
  else if (roll < 0.85) triggerPlaneCrash(city);
  else if (roll < 0.95) triggerMonster(city);
  else if (!triggerMeltdown(city)) triggerFire(city);
}
