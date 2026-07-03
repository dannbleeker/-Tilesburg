import { getTile, inBounds, setTile, spend, type City } from './city';
import { COST, Tile } from './constants';

export type ToolId = 'bulldozer' | 'road';

export interface ToolInfo {
  name: string;
  /** Nominal cost shown in the toolbar. */
  cost: number;
  hotkey: string;
}

export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  bulldozer: { name: 'Bulldozer', cost: COST.bulldozer, hotkey: 'B' },
  road: { name: 'Road', cost: COST.road, hotkey: 'R' },
};

export interface ToolResult {
  ok: boolean;
  /** § actually charged. */
  cost: number;
  reason?: string;
}

const NO_FUNDS: ToolResult = { ok: false, cost: 0, reason: 'Not enough funds' };

/**
 * Apply a tool to one tile. Validates terrain + funds, mutates the grid, and
 * charges the city. All grid mutation goes through here (or bulk helpers that
 * call here); the renderer never writes tiles.
 */
export function applyTool(city: City, tool: ToolId, x: number, y: number): ToolResult {
  if (!inBounds(x, y)) return { ok: false, cost: 0, reason: 'Out of bounds' };
  switch (tool) {
    case 'bulldozer':
      return bulldoze(city, x, y);
    case 'road':
      return placeRoad(city, x, y);
  }
}

function bulldoze(city: City, x: number, y: number): ToolResult {
  const t = getTile(city, x, y);
  if (t === Tile.Water) return { ok: false, cost: 0, reason: "Can't bulldoze water" };
  if (t === Tile.Dirt) return { ok: false, cost: 0, reason: 'Nothing to clear' };
  if (!spend(city, COST.bulldozer)) return NO_FUNDS;
  // Clearing a bridge returns the tile to open water.
  setTile(city, x, y, t === Tile.Bridge ? Tile.Water : Tile.Dirt);
  return { ok: true, cost: COST.bulldozer };
}

function placeRoad(city: City, x: number, y: number): ToolResult {
  const t = getTile(city, x, y);
  switch (t) {
    case Tile.Road:
    case Tile.Bridge:
      // Dragging across existing road is a free no-op, like the original.
      return { ok: true, cost: 0 };
    case Tile.Rubble:
      return { ok: false, cost: 0, reason: 'Must bulldoze rubble first' };
    case Tile.Water: {
      if (!spend(city, COST.bridge)) return NO_FUNDS;
      setTile(city, x, y, Tile.Bridge);
      return { ok: true, cost: COST.bridge };
    }
    case Tile.Tree: {
      // Building over trees auto-bulldozes them first.
      const cost = COST.road + COST.bulldozer;
      if (!spend(city, cost)) return NO_FUNDS;
      setTile(city, x, y, Tile.Road);
      return { ok: true, cost };
    }
    case Tile.Dirt: {
      if (!spend(city, COST.road)) return NO_FUNDS;
      setTile(city, x, y, Tile.Road);
      return { ok: true, cost: COST.road };
    }
  }
}

export interface LineResult {
  /** Total § charged across the line. */
  cost: number;
  /** Tiles actually changed. */
  placed: number;
  /** Last failure reason, if any tile failed. */
  reason?: string;
}

/**
 * Apply a tool along a Bresenham line from (x0,y0) to (x1,y1) inclusive.
 * Used by drag placement so fast pointer moves leave no gaps.
 */
export function applyToolLine(
  city: City,
  tool: ToolId,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): LineResult {
  const result: LineResult = { cost: 0, placed: 0 };
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;

  for (;;) {
    const r = applyTool(city, tool, x, y);
    if (r.ok) {
      result.cost += r.cost;
      if (r.cost > 0) result.placed++;
    } else if (r.reason !== undefined) {
      result.reason = r.reason;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return result;
}
