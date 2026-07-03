import { idx, inBounds, type City } from './city';
import { Flag, isBuilding, Tile } from './constants';

const TILE_NAMES: Record<number, string> = {
  [Tile.Dirt]: 'Clear land',
  [Tile.Water]: 'Water',
  [Tile.Tree]: 'Trees',
  [Tile.Rubble]: 'Rubble',
  [Tile.Road]: 'Road',
  [Tile.Bridge]: 'Bridge',
  [Tile.Wire]: 'Power line',
  [Tile.WireWater]: 'Underwater cable',
  [Tile.RoadWire]: 'Road / power crossing',
  [Tile.Rail]: 'Rail',
  [Tile.RailWater]: 'Rail bridge',
  [Tile.RoadRail]: 'Level crossing',
  [Tile.ZoneR]: 'Residential zone',
  [Tile.ZoneC]: 'Commercial zone',
  [Tile.ZoneI]: 'Industrial zone',
  [Tile.Coal]: 'Coal power plant',
  [Tile.Nuclear]: 'Nuclear power plant',
  [Tile.Police]: 'Police station',
  [Tile.FireStation]: 'Fire station',
};

const STAGE_NAMES = ['Undeveloped', 'Low density', 'Medium density', 'High density', 'Top density'];

export interface TileInfo {
  name: string;
  /** Present for building cells. */
  building?: {
    stage?: string;
    powered: boolean;
    access?: boolean;
  };
  landValue: number;
  pollution: number;
  crime: number;
  traffic: number;
  popDensity: number;
}

/** Everything the query tool shows about a tile. */
export function queryTile(city: City, x: number, y: number): TileInfo | null {
  if (!inBounds(x, y)) return null;
  const i = idx(x, y);
  const t = city.tiles[i];

  const info: TileInfo = {
    name: TILE_NAMES[t] ?? 'Unknown',
    landValue: city.landValue[i],
    pollution: city.pollution[i],
    crime: city.crime[i],
    traffic: city.trafficDensity[i],
    popDensity: city.popDensity[i],
  };

  if (isBuilding(t)) {
    const a = city.anchor[i];
    const powered = (city.flags[a] & Flag.Powered) !== 0;
    const isRci = t === Tile.ZoneR || t === Tile.ZoneC || t === Tile.ZoneI;
    info.building = isRci
      ? {
          stage: STAGE_NAMES[city.stage[a]],
          powered,
          access: (city.flags[a] & Flag.Access) !== 0,
        }
      : { powered };
  }
  return info;
}
