// Map dimensions match the 1989 classic.
export const MAP_W = 120;
export const MAP_H = 100;
export const MAP_SIZE = MAP_W * MAP_H;

// Semantic tile types stored in City.tiles. Visual variants are derived at
// render time from the neighborhood; the sim never deals in art.
export const Tile = {
  Dirt: 0,
  Water: 1,
  Tree: 2,
  Rubble: 3,
  Road: 4,
  Bridge: 5,
  Wire: 6,
  /** Underwater power cable. */
  WireWater: 7,
  /** Road + power line crossing. Conducts and carries traffic. */
  RoadWire: 8,
  Rail: 9,
  /** Rail crossing open water. */
  RailWater: 10,
  /** Road + rail level crossing. */
  RoadRail: 11,
  // Building types: every cell of a footprint carries the type; the anchor
  // (top-left) cell additionally owns the growth stage.
  ZoneR: 12,
  ZoneC: 13,
  ZoneI: 14,
  Coal: 15,
  Nuclear: 16,
  Police: 17,
  FireStation: 18,
  // Disaster tiles (not buildable, not building cells).
  Fire: 19,
  Flood: 20,
  Radioactive: 21,
  // Cap-lifter buildings.
  Stadium: 22,
  Seaport: 23,
  Airport: 24,
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

export type BuildingType =
  | typeof Tile.ZoneR
  | typeof Tile.ZoneC
  | typeof Tile.ZoneI
  | typeof Tile.Coal
  | typeof Tile.Nuclear
  | typeof Tile.Police
  | typeof Tile.FireStation
  | typeof Tile.Stadium
  | typeof Tile.Seaport
  | typeof Tile.Airport;

export function isBuilding(t: number): t is BuildingType {
  return (t >= Tile.ZoneR && t <= Tile.FireStation) || (t >= Tile.Stadium && t <= Tile.Airport);
}

export function isZone(t: number): boolean {
  return t === Tile.ZoneR || t === Tile.ZoneC || t === Tile.ZoneI;
}

/** Tiles that carry power: wires, crossings, and every building cell. */
export function isConductor(t: number): boolean {
  return t === Tile.Wire || t === Tile.WireWater || t === Tile.RoadWire || isBuilding(t);
}

/** Tiles trips can travel on. Traffic density only accumulates on roads. */
export function isTransport(t: number): boolean {
  return (
    t === Tile.Road ||
    t === Tile.Bridge ||
    t === Tile.RoadWire ||
    t === Tile.Rail ||
    t === Tile.RailWater ||
    t === Tile.RoadRail
  );
}

/** Footprint edge length per building type. */
export const FOOTPRINT: Record<BuildingType, number> = {
  [Tile.ZoneR]: 3,
  [Tile.ZoneC]: 3,
  [Tile.ZoneI]: 3,
  [Tile.Coal]: 4,
  [Tile.Nuclear]: 4,
  [Tile.Police]: 3,
  [Tile.FireStation]: 3,
  [Tile.Stadium]: 4,
  [Tile.Seaport]: 4,
  [Tile.Airport]: 6,
};

/** Highest zone growth stage (0 = freshly zoned, empty). */
export const MAX_STAGE = 4;
/** Population contributed per growth stage point. */
export const POP_PER_STAGE = 8;

// RCI demand valves live in [-DEMAND_MAX, DEMAND_MAX].
export const DEMAND_MAX = 1500;

// City.flags bits.
export const Flag = {
  Powered: 1 << 0,
  /** Zone anchor found a transport route to a counterpart zone recently. */
  Access: 1 << 1,
  Burnable: 1 << 2,
} as const;

// Sim clock: 16 ticks to a month, starting January 1900.
export const TICKS_PER_MONTH = 16;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * 12;
export const START_YEAR = 1900;

export const START_FUNDS = 20000;

// Tool costs in §, per the original.
export const COST = {
  bulldozer: 1,
  road: 10,
  bridge: 50,
  wire: 5,
  wireWater: 25,
  rail: 20,
  railWater: 100,
  zone: 100,
  police: 500,
  fire: 500,
  coal: 3000,
  nuclear: 5000,
  stadium: 3000,
  seaport: 5000,
  airport: 10000,
} as const;

/** Max trip length (in transport tiles) for a zone to find a counterpart. */
export const MAX_TRIP_DIST = 40;

// Sim ticks per second at each game speed.
export const SPEEDS = {
  paused: 0,
  slow: 1,
  normal: 4,
  fast: 12,
} as const;
export type SpeedId = keyof typeof SPEEDS;
