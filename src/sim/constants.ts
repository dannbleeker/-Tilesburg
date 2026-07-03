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
  // Building types: every cell of a footprint carries the type; the anchor
  // (top-left) cell additionally owns the growth stage.
  ZoneR: 9,
  ZoneC: 10,
  ZoneI: 11,
  Coal: 12,
  Nuclear: 13,
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

export type BuildingType =
  | typeof Tile.ZoneR
  | typeof Tile.ZoneC
  | typeof Tile.ZoneI
  | typeof Tile.Coal
  | typeof Tile.Nuclear;

export function isBuilding(t: number): t is BuildingType {
  return t >= Tile.ZoneR && t <= Tile.Nuclear;
}

export function isZone(t: number): boolean {
  return t === Tile.ZoneR || t === Tile.ZoneC || t === Tile.ZoneI;
}

/** Tiles that carry power: wires, crossings, and every building cell. */
export function isConductor(t: number): boolean {
  return t === Tile.Wire || t === Tile.WireWater || t === Tile.RoadWire || isBuilding(t);
}

/** Footprint edge length per building type. */
export const FOOTPRINT: Record<BuildingType, number> = {
  [Tile.ZoneR]: 3,
  [Tile.ZoneC]: 3,
  [Tile.ZoneI]: 3,
  [Tile.Coal]: 4,
  [Tile.Nuclear]: 4,
};

/** Highest zone growth stage (0 = freshly zoned, empty). */
export const MAX_STAGE = 4;
/** Population contributed per growth stage point. */
export const POP_PER_STAGE = 8;

// RCI demand valves live in [-DEMAND_MAX, DEMAND_MAX].
export const DEMAND_MAX = 1500;

// City.flags bits. Reserved now so the save format doesn't churn later;
// power bits light up in phase 2.
export const Flag = {
  Powered: 1 << 0,
  Conductor: 1 << 1,
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
  zone: 100,
  coal: 3000,
  nuclear: 5000,
} as const;

// Sim ticks per second at each game speed.
export const SPEEDS = {
  paused: 0,
  slow: 1,
  normal: 4,
  fast: 12,
} as const;
export type SpeedId = keyof typeof SPEEDS;
