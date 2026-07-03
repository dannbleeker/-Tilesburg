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
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

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
} as const;

// Sim ticks per second at each game speed.
export const SPEEDS = {
  paused: 0,
  slow: 1,
  normal: 4,
  fast: 12,
} as const;
export type SpeedId = keyof typeof SPEEDS;
