import type { City } from './city';
import { Flag, FOOTPRINT, isTransport, MAP_H, MAP_SIZE, MAP_W, MAX_TRIP_DIST, Tile, type BuildingType } from './constants';

// Staggered like the zone scan: each zone anchor attempts a trip every
// SLICES ticks.
const SLICES = 8;
const SLICE_SIZE = Math.ceil(MAP_SIZE / SLICES);

/**
 * Traffic added along a successful route's road tiles. Sized against the
 * decay rate so a lightly-used road settles in the low tens and only genuinely
 * shared arterials approach the 255 ceiling — at higher loads every routed
 * tile pinned at 255 and the density map carried no information.
 */
const TRIP_LOAD = 8;

// Scratch for BFS (single-threaded sim).
const visited = new Int32Array(MAP_SIZE); // stores generation stamp
const parent = new Int32Array(MAP_SIZE);
const queue = new Int32Array(MAP_SIZE);
let stamp = 0;

/**
 * Trip generation: every zone periodically tries to reach a counterpart zone
 * type (R ↔ jobs at C/I; C and I ↔ customers/workers at R) through the
 * road/rail network within MAX_TRIP_DIST steps. Success sets the anchor's
 * ACCESS flag (a growth requirement above the first stage) and deposits
 * traffic along the route's road tiles — rail carries trips without traffic
 * or pollution. Failure clears the flag, which stalls the zone.
 */
export function generateTraffic(city: City): void {
  const slice = city.cityTime % SLICES;
  const start = slice * SLICE_SIZE;
  const end = Math.min(start + SLICE_SIZE, MAP_SIZE);
  const { tiles, anchor } = city;

  for (let i = start; i < end; i++) {
    if (anchor[i] !== i) continue;
    const t = tiles[i];
    if (t !== Tile.ZoneR && t !== Tile.ZoneC && t !== Tile.ZoneI) continue;
    if (attemptTrip(city, i, t)) {
      city.flags[i] |= Flag.Access;
    } else {
      city.flags[i] &= ~Flag.Access;
    }
  }
}

function isCounterpart(t: number, origin: number): boolean {
  if (origin === Tile.ZoneR) return t === Tile.ZoneC || t === Tile.ZoneI;
  return t === Tile.ZoneR;
}

/** BFS over transport tiles from the zone's perimeter; deposits traffic on success. */
function attemptTrip(city: City, anchorIdx: number, zoneType: number): boolean {
  const { tiles, trafficDensity } = city;
  const size = FOOTPRINT[zoneType as BuildingType];
  const ax = anchorIdx % MAP_W;
  const ay = Math.floor(anchorIdx / MAP_W);

  stamp++;
  let head = 0;
  let tail = 0;

  // Seed: transport tiles touching the footprint perimeter.
  for (let dy = -1; dy <= size; dy++) {
    for (let dx = -1; dx <= size; dx++) {
      const edge = dy === -1 || dy === size || dx === -1 || dx === size;
      if (!edge) continue;
      const x = ax + dx;
      const y = ay + dy;
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      const j = y * MAP_W + x;
      if (isTransport(tiles[j]) && visited[j] !== stamp) {
        visited[j] = stamp;
        parent[j] = -1;
        queue[tail++] = j;
      }
    }
  }

  const limit = MAX_TRIP_DIST;
  let depthEnd = tail; // index where the current BFS depth ends
  let depth = 0;

  // depth 0 is the ring of transport tiles touching the zone, so processing
  // depth d means d+1 tiles travelled: stop *before* limit to keep the real
  // reach at MAX_TRIP_DIST tiles.
  while (head < tail && depth < limit) {
    const j = queue[head++];

    // Arrived? A counterpart zone cell adjacent to this transport tile.
    const jx = j % MAP_W;
    const jy = Math.floor(j / MAP_W);
    if (
      (jy > 0 && isCounterpart(tiles[j - MAP_W], zoneType)) ||
      (jy < MAP_H - 1 && isCounterpart(tiles[j + MAP_W], zoneType)) ||
      (jx > 0 && isCounterpart(tiles[j - 1], zoneType)) ||
      (jx < MAP_W - 1 && isCounterpart(tiles[j + 1], zoneType))
    ) {
      depositTraffic(tiles, trafficDensity, j);
      return true;
    }

    if (jy > 0) enqueue(tiles, j - MAP_W, j, tail) && tail++;
    if (jy < MAP_H - 1) enqueue(tiles, j + MAP_W, j, tail) && tail++;
    if (jx > 0) enqueue(tiles, j - 1, j, tail) && tail++;
    if (jx < MAP_W - 1) enqueue(tiles, j + 1, j, tail) && tail++;

    if (head === depthEnd) {
      // Crossing into the next depth ring.
      depth++;
      depthEnd = tail;
    }
  }
  return false;
}

function enqueue(tiles: Uint16Array, j: number, from: number, tail: number): boolean {
  if (visited[j] === stamp || !isTransport(tiles[j])) return false;
  visited[j] = stamp;
  parent[j] = from;
  queue[tail] = j;
  return true;
}

/** Walk the BFS parents back to the origin, loading road tiles only. */
function depositTraffic(tiles: Uint16Array, td: Uint8Array, endIdx: number): void {
  let j = endIdx;
  while (j >= 0) {
    const t = tiles[j];
    if (t === Tile.Road || t === Tile.Bridge || t === Tile.RoadWire || t === Tile.RoadRail) {
      td[j] = Math.min(255, td[j] + TRIP_LOAD);
    }
    j = parent[j];
  }
}
