import { getTile, idx, inBounds, setTile, spend, type City } from './city';
import { COST, FOOTPRINT, isBuilding, Tile, type BuildingType, type TileType } from './constants';

export type ToolId =
  | 'bulldozer'
  | 'road'
  | 'wire'
  | 'res'
  | 'com'
  | 'ind'
  | 'coal'
  | 'nuclear';

export interface ToolInfo {
  name: string;
  /** Nominal cost shown in the toolbar. */
  cost: number;
  hotkey: string;
  /** Drag tools paint along the pointer path; others place once per click. */
  drag: boolean;
}

export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  bulldozer: { name: 'Bulldozer', cost: COST.bulldozer, hotkey: 'B', drag: true },
  road: { name: 'Road', cost: COST.road, hotkey: 'R', drag: true },
  wire: { name: 'Power line', cost: COST.wire, hotkey: 'W', drag: true },
  res: { name: 'Residential', cost: COST.zone, hotkey: 'Z', drag: false },
  com: { name: 'Commercial', cost: COST.zone, hotkey: 'X', drag: false },
  ind: { name: 'Industrial', cost: COST.zone, hotkey: 'C', drag: false },
  coal: { name: 'Coal plant', cost: COST.coal, hotkey: 'P', drag: false },
  nuclear: { name: 'Nuclear plant', cost: COST.nuclear, hotkey: 'N', drag: false },
};

const BUILDING_TOOL: Partial<Record<ToolId, { type: BuildingType; cost: number }>> = {
  res: { type: Tile.ZoneR, cost: COST.zone },
  com: { type: Tile.ZoneC, cost: COST.zone },
  ind: { type: Tile.ZoneI, cost: COST.zone },
  coal: { type: Tile.Coal, cost: COST.coal },
  nuclear: { type: Tile.Nuclear, cost: COST.nuclear },
};

export interface ToolResult {
  ok: boolean;
  /** § actually charged. */
  cost: number;
  reason?: string;
}

const NO_FUNDS: ToolResult = { ok: false, cost: 0, reason: 'Not enough funds' };

/**
 * Apply a tool at a tile (for buildings, the cursor tile is the footprint
 * center). Validates terrain + funds, mutates the grid, charges the city.
 * All grid mutation goes through here; the renderer never writes tiles.
 */
export function applyTool(city: City, tool: ToolId, x: number, y: number): ToolResult {
  if (!inBounds(x, y)) return { ok: false, cost: 0, reason: 'Out of bounds' };
  switch (tool) {
    case 'bulldozer':
      return bulldoze(city, x, y);
    case 'road':
      return placeRoad(city, x, y);
    case 'wire':
      return placeWire(city, x, y);
    default: {
      const b = BUILDING_TOOL[tool];
      if (!b) return { ok: false, cost: 0, reason: 'Unknown tool' };
      return placeBuilding(city, b.type, b.cost, x, y);
    }
  }
}

function bulldoze(city: City, x: number, y: number): ToolResult {
  const t = getTile(city, x, y);
  if (isBuilding(t)) return demolishBuilding(city, x, y);
  if (t === Tile.Water) return { ok: false, cost: 0, reason: "Can't bulldoze water" };
  if (t === Tile.Dirt) return { ok: false, cost: 0, reason: 'Nothing to clear' };
  if (!spend(city, COST.bulldozer)) return NO_FUNDS;
  // Clearing a bridge or underwater cable returns the tile to open water.
  setTile(city, x, y, t === Tile.Bridge || t === Tile.WireWater ? Tile.Water : Tile.Dirt);
  return { ok: true, cost: COST.bulldozer };
}

// Bulldozing any cell of a building levels the whole footprint to rubble,
// like the original's one-click zone demolition.
function demolishBuilding(city: City, x: number, y: number): ToolResult {
  if (!spend(city, COST.bulldozer)) return NO_FUNDS;
  const anchorIdx = city.anchor[idx(x, y)];
  const size = FOOTPRINT[city.tiles[anchorIdx] as BuildingType];
  const ax = anchorIdx % city.width;
  const ay = Math.floor(anchorIdx / city.width);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = idx(ax + dx, ay + dy);
      city.tiles[i] = Tile.Rubble;
      city.anchor[i] = -1;
    }
  }
  city.stage[anchorIdx] = 0;
  return { ok: true, cost: COST.bulldozer };
}

function placeRoad(city: City, x: number, y: number): ToolResult {
  const t = getTile(city, x, y);
  switch (t) {
    case Tile.Road:
    case Tile.Bridge:
    case Tile.RoadWire:
      // Dragging across existing road is a free no-op, like the original.
      return { ok: true, cost: 0 };
    case Tile.Wire: {
      // Road under a power line forms a crossing.
      if (!spend(city, COST.road)) return NO_FUNDS;
      setTile(city, x, y, Tile.RoadWire);
      return { ok: true, cost: COST.road };
    }
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
    default:
      return { ok: false, cost: 0, reason: "Can't build a road there" };
  }
}

function placeWire(city: City, x: number, y: number): ToolResult {
  const t = getTile(city, x, y);
  switch (t) {
    case Tile.Wire:
    case Tile.WireWater:
    case Tile.RoadWire:
      return { ok: true, cost: 0 };
    case Tile.Road: {
      // Power line over a road forms a crossing.
      if (!spend(city, COST.wire)) return NO_FUNDS;
      setTile(city, x, y, Tile.RoadWire);
      return { ok: true, cost: COST.wire };
    }
    case Tile.Water: {
      if (!spend(city, COST.wireWater)) return NO_FUNDS;
      setTile(city, x, y, Tile.WireWater);
      return { ok: true, cost: COST.wireWater };
    }
    case Tile.Tree: {
      const cost = COST.wire + COST.bulldozer;
      if (!spend(city, cost)) return NO_FUNDS;
      setTile(city, x, y, Tile.Wire);
      return { ok: true, cost };
    }
    case Tile.Dirt: {
      if (!spend(city, COST.wire)) return NO_FUNDS;
      setTile(city, x, y, Tile.Wire);
      return { ok: true, cost: COST.wire };
    }
    default:
      return { ok: false, cost: 0, reason: "Can't run a power line there" };
  }
}

/**
 * Place a footprint centered on the cursor (anchor = top-left). Every cell
 * must be clear land; trees are auto-bulldozed at +§1 each.
 */
function placeBuilding(city: City, type: BuildingType, baseCost: number, cx: number, cy: number): ToolResult {
  const size = FOOTPRINT[type];
  const ax = cx - 1;
  const ay = cy - 1;

  let treeCount = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = ax + dx;
      const y = ay + dy;
      if (!inBounds(x, y)) return { ok: false, cost: 0, reason: 'Out of bounds' };
      const t = getTile(city, x, y);
      if (t === Tile.Tree) treeCount++;
      else if (t !== Tile.Dirt) return { ok: false, cost: 0, reason: 'Land must be clear' };
    }
  }

  const cost = baseCost + treeCount * COST.bulldozer;
  if (!spend(city, cost)) return NO_FUNDS;

  const anchorIdx = idx(ax, ay);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = idx(ax + dx, ay + dy);
      city.tiles[i] = type;
      city.anchor[i] = anchorIdx;
    }
  }
  city.stage[anchorIdx] = 0;
  return { ok: true, cost };
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
 * Apply a drag tool along a Bresenham line from (x0,y0) to (x1,y1) inclusive,
 * so fast pointer moves leave no gaps.
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

/** Tile types a given tile reads as for connection-mask purposes. */
export function isRoadLike(t: TileType | number): boolean {
  return t === Tile.Road || t === Tile.Bridge || t === Tile.RoadWire;
}

export function isWireLike(t: TileType | number): boolean {
  return t === Tile.Wire || t === Tile.WireWater || t === Tile.RoadWire || isBuilding(t);
}
