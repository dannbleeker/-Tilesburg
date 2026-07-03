// The fixed palette from ART_DIRECTION.md. All programmatic art picks from
// these tokens; nothing invents colors ad hoc.
export const PAL = {
  ground: '#c9b581',
  groundShade: '#b9a571',
  water: '#2e6f9e',
  waterHi: '#4a8dbd',
  treeDark: '#3e6b3a',
  treeHi: '#548a4b',
  asphalt: '#4b4f55',
  asphaltHi: '#5d626a',
  laneline: '#d8d3c0',
  rubble: '#8a8377',
  rubbleHi: '#a09a8d',
  wireYellow: '#e3b93d',
  uiBg: '#20242b',
  uiPanel: '#2a2f38',
  uiText: '#e8e6df',
  uiAccent: '#e3b93d',
  // Concrete pad under developed buildings.
  pad: '#9aa0a8',
  padShade: '#8a909a',
  // Zone identity colors (R = green, C = blue, I = ochre) + light tones.
  rZone: '#3f8f4f',
  rZoneHi: '#54a862',
  cZone: '#3f6fb5',
  cZoneHi: '#5c8bc9',
  iZone: '#c2a23c',
  iZoneHi: '#d4b954',
} as const;
