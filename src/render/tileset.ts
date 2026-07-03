import { Texture } from 'pixi.js';
import { Rng } from '../sim/rng';
import { PAL } from './palette';

// Every texture is generated on a canvas at boot per ART_DIRECTION.md
// ("Crisp Flat Geometric"): 24px tiles, 2px sub-grid, two tones per material,
// light from the north-west, no outlines. No binary assets in the repo.
export const TILE_PX = 24;

export interface Tileset {
  dirt: Texture[]; // 4 variants
  water: Texture[]; // 2 animation frames
  tree: Texture[]; // 4 variants
  rubble: Texture[]; // 2 variants
  /** Indexed by 4-neighbor connection mask: 1=N, 2=E, 4=S, 8=W. */
  road: Texture[];
  bridgeH: Texture;
  bridgeV: Texture;
  /** Power line on land, by connection mask. */
  wire: Texture[];
  /** Just the wire strokes on transparency, drawn over road crossings. */
  wireOverlay: Texture[];
  wireWaterH: Texture;
  wireWaterV: Texture;
  /** Rail on land, by connection mask. */
  rail: Texture[];
  /** Just the track on transparency, drawn over level crossings. */
  railOverlay: Texture[];
  railWaterH: Texture;
  railWaterV: Texture;
  /** Concrete pad drawn under building footprints. */
  pad: Texture;
  /** Zone art by growth stage 0..MAX_STAGE, 3x3 tiles. */
  zoneR: Texture[];
  zoneC: Texture[];
  zoneI: Texture[];
  coal: Texture;
  nuclear: Texture;
  police: Texture;
  fireStation: Texture;
  stadium: Texture;
  seaport: Texture;
  airport: Texture;
  /** Blinking unpowered indicator. */
  bolt: Texture;
  /** Disaster tiles; fire animates on the global 500ms cadence. */
  fire: Texture[];
  flood: Texture[];
  radioactive: Texture;
  /** Roaming disaster actors (rendered at 2x tile size). */
  tornado: Texture;
  monster: Texture;
}

type Ctx = CanvasRenderingContext2D;

function makeTile(draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  draw(ctx);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

// Snap helper: everything lands on the 2px sub-grid.
function px2(n: number): number {
  return Math.round(n / 2) * 2;
}

function drawDirtBase(ctx: Ctx, variant: number): void {
  ctx.fillStyle = PAL.ground;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  // Sparse deterministic flecks.
  const rng = new Rng(0xd117 + variant * 101);
  ctx.fillStyle = PAL.groundShade;
  const flecks = 3 + rng.int(3);
  for (let i = 0; i < flecks; i++) {
    ctx.fillRect(px2(rng.range(2, 20)), px2(rng.range(2, 18)), 2, 2);
  }
  // Implied grid: 1px darker edge on south + east only.
  ctx.fillRect(0, TILE_PX - 1, TILE_PX, 1);
  ctx.fillRect(TILE_PX - 1, 0, 1, TILE_PX);
}

function drawWater(ctx: Ctx, frame: number): void {
  ctx.fillStyle = PAL.water;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = PAL.waterHi;
  // Wave dashes alternate position between the two frames.
  const dashes: Array<[number, number]> = frame === 0
    ? [[4, 6], [14, 12], [6, 18]]
    : [[8, 8], [10, 16], [16, 4]];
  for (const [x, y] of dashes) ctx.fillRect(x, y, 6, 2);
}

function drawTree(ctx: Ctx, variant: number): void {
  drawDirtBase(ctx, variant);
  const rng = new Rng(0x7ee5 + variant * 7);
  const canopies = 2 + rng.int(2);
  for (let i = 0; i < canopies; i++) {
    const cx = px2(rng.range(6, 18));
    const cy = px2(rng.range(6, 18));
    const r = rng.range(4, 6);
    // Light circle offset NW under the dark canopy = light crescent on the
    // north-west arc (light comes from the NW).
    ctx.fillStyle = PAL.treeHi;
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.treeDark;
    ctx.beginPath();
    ctx.arc(cx + 1, cy + 1, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRubble(ctx: Ctx, variant: number): void {
  drawDirtBase(ctx, variant);
  const rng = new Rng(0x8b1e + variant * 31);
  const chips = 4 + rng.int(2);
  for (let i = 0; i < chips; i++) {
    ctx.fillStyle = i % 2 === 0 ? PAL.rubble : PAL.rubbleHi;
    ctx.fillRect(px2(rng.range(2, 18)), px2(rng.range(2, 18)), px2(rng.range(3, 5)), px2(rng.range(2, 4)));
  }
}

const N = 1;
const E = 2;
const S = 4;
const W = 8;

function drawLaneDashesV(ctx: Ctx): void {
  ctx.fillStyle = PAL.laneline;
  for (let y = 2; y < TILE_PX; y += 8) ctx.fillRect(11, y, 2, 4);
}

function drawLaneDashesH(ctx: Ctx): void {
  ctx.fillStyle = PAL.laneline;
  for (let x = 2; x < TILE_PX; x += 8) ctx.fillRect(x, 11, 4, 2);
}

function drawRoad(ctx: Ctx, mask: number): void {
  ctx.fillStyle = PAL.asphalt;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  // Edge wear on unconnected sides.
  ctx.fillStyle = PAL.asphaltHi;
  if (!(mask & N)) ctx.fillRect(0, 0, TILE_PX, 1);
  if (!(mask & S)) ctx.fillRect(0, TILE_PX - 1, TILE_PX, 1);
  if (!(mask & W)) ctx.fillRect(0, 0, 1, TILE_PX);
  if (!(mask & E)) ctx.fillRect(TILE_PX - 1, 0, 1, TILE_PX);
  // Lane markings run along the axis of travel; intersections and corners
  // get the plain asphalt plate.
  const vertical = mask === (N | S) || mask === N || mask === S || mask === 0;
  const horizontal = mask === (E | W) || mask === E || mask === W;
  if (vertical) drawLaneDashesV(ctx);
  else if (horizontal) drawLaneDashesH(ctx);
}

function drawBridge(ctx: Ctx, horizontal: boolean): void {
  drawWater(ctx, 0);
  ctx.fillStyle = PAL.asphalt;
  if (horizontal) {
    ctx.fillRect(0, 5, TILE_PX, 14);
    ctx.fillStyle = PAL.asphaltHi;
    ctx.fillRect(0, 4, TILE_PX, 1); // guard rails
    ctx.fillRect(0, 19, TILE_PX, 1);
    drawLaneDashesH(ctx);
  } else {
    ctx.fillRect(5, 0, 14, TILE_PX);
    ctx.fillStyle = PAL.asphaltHi;
    ctx.fillRect(4, 0, 1, TILE_PX);
    ctx.fillRect(19, 0, 1, TILE_PX);
    drawLaneDashesV(ctx);
  }
}

// --- Power lines ---------------------------------------------------------

function drawWireStrokes(ctx: Ctx, mask: number): void {
  ctx.fillStyle = PAL.wireYellow;
  const c = 11; // stroke band start (2px wide, centered on the sub-grid)
  if (mask === 0) {
    ctx.fillRect(c, 8, 2, 8);
  } else {
    if (mask & N) ctx.fillRect(c, 0, 2, 13);
    if (mask & S) ctx.fillRect(c, 11, 2, 13);
    if (mask & W) ctx.fillRect(0, c, 13, 2);
    if (mask & E) ctx.fillRect(11, c, 13, 2);
  }
  // Pole where lines meet.
  ctx.fillStyle = PAL.asphalt;
  ctx.fillRect(10, 10, 4, 4);
}

function drawWire(ctx: Ctx, mask: number): void {
  drawDirtBase(ctx, 0);
  drawWireStrokes(ctx, mask);
}

function drawWireWater(ctx: Ctx, horizontal: boolean): void {
  drawWater(ctx, 0);
  // Submerged cable: dashed yellow run.
  ctx.fillStyle = PAL.wireYellow;
  for (let p = 2; p < TILE_PX; p += 6) {
    if (horizontal) ctx.fillRect(p, 11, 4, 2);
    else ctx.fillRect(11, p, 2, 4);
  }
}

// --- Rail ----------------------------------------------------------------

/**
 * Track strokes only (transparent background): two steel rails along each
 * connected direction with ties every 6px.
 */
function drawRailStrokes(ctx: Ctx, mask: number): void {
  const vertical = mask === 0 || (mask & (N | S)) !== 0;
  const horizontal = (mask & (E | W)) !== 0;
  const drawRun = (horiz: boolean, from: number, to: number) => {
    ctx.fillStyle = PAL.asphalt; // ties
    for (let p = from + 1; p < to; p += 6) {
      if (horiz) ctx.fillRect(p, 8, 2, 8);
      else ctx.fillRect(8, p, 8, 2);
    }
    ctx.fillStyle = PAL.steelHi; // rails
    if (horiz) {
      ctx.fillRect(from, 9, to - from, 2);
      ctx.fillRect(from, 13, to - from, 2);
    } else {
      ctx.fillRect(9, from, 2, to - from);
      ctx.fillRect(13, from, 2, to - from);
    }
  };
  if (vertical) {
    const from = mask & N || mask === 0 ? 0 : 9;
    const to = mask & S || mask === 0 ? TILE_PX : 15;
    drawRun(false, from, to);
  }
  if (horizontal) {
    const from = mask & W ? 0 : 9;
    const to = mask & E ? TILE_PX : 15;
    drawRun(true, from, to);
  }
}

function drawRail(ctx: Ctx, mask: number): void {
  drawDirtBase(ctx, 0);
  drawRailStrokes(ctx, mask);
}

function drawRailWater(ctx: Ctx, horizontal: boolean): void {
  drawWater(ctx, 0);
  // Trestle deck under the track.
  ctx.fillStyle = PAL.steel;
  if (horizontal) ctx.fillRect(0, 6, TILE_PX, 12);
  else ctx.fillRect(6, 0, 12, TILE_PX);
  drawRailStrokes(ctx, horizontal ? E | W : N | S);
}

// --- Buildings -----------------------------------------------------------

function makeBig(sizeTiles: number, draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = sizeTiles * TILE_PX;
  canvas.height = sizeTiles * TILE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  draw(ctx);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

function drawPadBase(ctx: Ctx, px: number): void {
  ctx.fillStyle = PAL.pad;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = PAL.padShade;
  ctx.fillRect(0, px - 2, px, 2);
  ctx.fillRect(px - 2, 0, 2, px);
}

/** A flat block with NW light: 2px lighter top + left edges. */
function drawBlock(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, hi: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = hi;
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y, 2, h);
}

function drawWindows(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = PAL.laneline;
  for (let wy = y + 6; wy < y + h - 4; wy += 6) {
    for (let wx = x + 4; wx < x + w - 4; wx += 6) {
      ctx.fillRect(wx, wy, 2, 2);
    }
  }
}

interface ZoneStyle {
  base: string;
  hi: string;
  glyph: string;
}

/** Empty zone: land plate with an identity-color border + letter glyph. */
function drawZonePlate(ctx: Ctx, px: number, style: ZoneStyle): void {
  ctx.fillStyle = PAL.ground;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = PAL.groundShade;
  ctx.fillRect(0, px - 1, px, 1);
  ctx.fillRect(px - 1, 0, 1, px);
  ctx.fillStyle = style.base;
  ctx.fillRect(2, 2, px - 4, 2);
  ctx.fillRect(2, px - 4, px - 4, 2);
  ctx.fillRect(2, 2, 2, px - 4);
  ctx.fillRect(px - 4, 2, 2, px - 4);
  ctx.font = 'bold 20px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.glyph, px / 2, px / 2);
}

/** Developed zone: pad + deterministic block cluster scaling with stage. */
function drawZoneStage(ctx: Ctx, px: number, style: ZoneStyle, stage: number): void {
  drawPadBase(ctx, px);
  const rng = new Rng(0x20e5 + style.glyph.charCodeAt(0) * 131 + stage * 17);
  if (stage >= 4) {
    // Top density: one large structure.
    drawBlock(ctx, 6, 6, px - 12, px - 12, style.base, style.hi);
    drawWindows(ctx, 6, 6, px - 12, px - 12);
    return;
  }
  const blocks = 2 + stage;
  const size = 14 + stage * 6;
  for (let b = 0; b < blocks; b++) {
    const w = px2(size + rng.range(-4, 4));
    const h = px2(size + rng.range(-4, 4));
    const x = px2(rng.range(2, px - w - 3));
    const y = px2(rng.range(2, px - h - 3));
    drawBlock(ctx, x, y, w, h, style.base, style.hi);
    if (stage >= 2) drawWindows(ctx, x, y, w, h);
  }
}

function zoneTextures(style: ZoneStyle): Texture[] {
  const px = 3 * TILE_PX;
  return [0, 1, 2, 3, 4].map((stage) =>
    makeBig(3, (ctx) => (stage === 0 ? drawZonePlate(ctx, px, style) : drawZoneStage(ctx, px, style, stage))),
  );
}

function drawBoltShape(ctx: Ctx, x: number, y: number, s: number): void {
  // Lightning glyph in a 24x24 design box, scaled by s and offset to (x, y).
  ctx.fillStyle = PAL.wireYellow;
  ctx.beginPath();
  ctx.moveTo(x + 14 * s, y + 2 * s);
  ctx.lineTo(x + 6 * s, y + 13 * s);
  ctx.lineTo(x + 11 * s, y + 13 * s);
  ctx.lineTo(x + 9 * s, y + 22 * s);
  ctx.lineTo(x + 18 * s, y + 10 * s);
  ctx.lineTo(x + 13 * s, y + 10 * s);
  ctx.lineTo(x + 16 * s, y + 2 * s);
  ctx.closePath();
  ctx.fill();
}

function drawCoal(ctx: Ctx): void {
  const px = 4 * TILE_PX;
  drawPadBase(ctx, px);
  // Plant halls.
  drawBlock(ctx, 6, 34, 50, 54, PAL.asphalt, PAL.asphaltHi);
  drawBlock(ctx, 42, 50, 46, 38, PAL.asphalt, PAL.asphaltHi);
  drawWindows(ctx, 6, 34, 50, 54);
  // Smokestacks (animated puffs arrive with the polish phase).
  for (const sx of [22, 40]) {
    ctx.fillStyle = PAL.rubbleHi;
    ctx.beginPath();
    ctx.arc(sx, 22, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.asphalt;
    ctx.beginPath();
    ctx.arc(sx, 22, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  drawBoltShape(ctx, 66, 8, 1);
}

function drawNuclear(ctx: Ctx): void {
  const px = 4 * TILE_PX;
  drawPadBase(ctx, px);
  drawBlock(ctx, 8, 54, 44, 34, PAL.asphalt, PAL.asphaltHi);
  // Containment dome, lit from the NW.
  ctx.fillStyle = PAL.rubble;
  ctx.beginPath();
  ctx.arc(58, 38, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.uiText;
  ctx.beginPath();
  ctx.arc(55, 35, 22, 0, Math.PI * 2);
  ctx.fill();
  // Trefoil badge.
  ctx.fillStyle = PAL.wireYellow;
  ctx.fillRect(10, 10, 20, 20);
  ctx.fillStyle = PAL.asphalt;
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.arc(20, 20, 8, a - 0.5, a + 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

// --- Disasters -------------------------------------------------------------

function drawFire(ctx: Ctx, frame: number): void {
  ctx.fillStyle = PAL.alertRed;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  // Flame tongues alternate position per frame.
  ctx.fillStyle = PAL.wireYellow;
  const tongues: Array<[number, number]> = frame === 0
    ? [[4, 10], [12, 4], [16, 14]]
    : [[8, 6], [14, 12], [4, 16]];
  for (const [x, y] of tongues) {
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x + 3, y);
    ctx.lineTo(x + 6, y + 8);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFlood(ctx: Ctx, frame: number): void {
  drawWater(ctx, frame);
  // Churned surface: pale streaks over the water.
  ctx.fillStyle = PAL.uiText;
  const streaks: Array<[number, number]> = frame === 0 ? [[2, 4], [12, 16]] : [[8, 10], [16, 2]];
  for (const [x, y] of streaks) ctx.fillRect(x, y, 6, 2);
}

function drawRadioactive(ctx: Ctx): void {
  drawDirtBase(ctx, 1);
  ctx.fillStyle = PAL.wireYellow;
  ctx.beginPath();
  ctx.arc(12, 12, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.asphalt;
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    ctx.beginPath();
    ctx.moveTo(12, 12);
    ctx.arc(12, 12, 6, a - 0.5, a + 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTornado(ctx: Ctx): void {
  // Stacked funnel discs, light side NW.
  const discs: Array<[number, number, number]> = [
    [12, 4, 9],
    [11, 9, 7],
    [12, 14, 5],
    [11, 18, 3],
    [12, 21, 2],
  ];
  for (const [cx, cy, r] of discs) {
    ctx.fillStyle = PAL.rubble;
    ctx.beginPath();
    ctx.arc(cx + 1, cy + 1, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.rubbleHi;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMonster(ctx: Ctx): void {
  // A boxy kaiju in the flat style: body, NW light, eyes, spines.
  ctx.fillStyle = PAL.treeDark;
  ctx.fillRect(4, 6, 16, 16);
  ctx.fillStyle = PAL.treeHi;
  ctx.fillRect(4, 6, 16, 2);
  ctx.fillRect(4, 6, 2, 16);
  ctx.fillStyle = PAL.wireYellow;
  ctx.fillRect(8, 12, 3, 3);
  ctx.fillRect(14, 12, 3, 3);
  ctx.fillStyle = PAL.treeDark;
  for (const [x, y] of [[6, 2], [11, 0], [16, 2]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x + 2, y);
    ctx.lineTo(x + 4, y + 6);
    ctx.closePath();
    ctx.fill();
  }
}

function drawStadium(ctx: Ctx): void {
  const px = 4 * TILE_PX;
  drawPadBase(ctx, px);
  // Stands ring around a green field with a center line.
  ctx.fillStyle = PAL.rubbleHi;
  ctx.beginPath();
  ctx.ellipse(px / 2, px / 2, 42, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.rubble;
  ctx.beginPath();
  ctx.ellipse(px / 2, px / 2, 34, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.rZone;
  ctx.beginPath();
  ctx.ellipse(px / 2, px / 2, 26, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAL.laneline;
  ctx.fillRect(px / 2 - 1, px / 2 - 18, 2, 36);
}

function drawSeaport(ctx: Ctx): void {
  const px = 4 * TILE_PX;
  drawPadBase(ctx, px);
  // Water berth along the south, piers reaching into it.
  ctx.fillStyle = PAL.water;
  ctx.fillRect(0, px - 30, px, 30);
  ctx.fillStyle = PAL.asphalt;
  for (const x of [10, 40, 70]) ctx.fillRect(x, px - 34, 12, 30);
  // Container stacks + a crane.
  drawBlock(ctx, 8, 10, 28, 18, PAL.iZone, PAL.iZoneHi);
  drawBlock(ctx, 44, 12, 24, 14, PAL.cZone, PAL.cZoneHi);
  ctx.fillStyle = PAL.wireYellow;
  ctx.fillRect(76, 8, 4, 40);
  ctx.fillRect(64, 8, 28, 4);
}

function drawAirport(ctx: Ctx): void {
  const px = 6 * TILE_PX;
  drawPadBase(ctx, px);
  // Main runway with centerline dashes, a taxiway, terminal + tower.
  ctx.fillStyle = PAL.asphalt;
  ctx.fillRect(8, 96, 128, 28);
  ctx.fillStyle = PAL.laneline;
  for (let x = 14; x < 130; x += 14) ctx.fillRect(x, 109, 8, 2);
  ctx.fillStyle = PAL.asphalt;
  ctx.fillRect(100, 24, 24, 80);
  drawBlock(ctx, 12, 24, 64, 32, PAL.pad, PAL.uiText);
  drawWindows(ctx, 12, 24, 64, 32);
  drawBlock(ctx, 82, 12, 12, 24, PAL.cZone, PAL.cZoneHi);
  ctx.fillStyle = PAL.wireYellow;
  ctx.fillRect(84, 8, 8, 4);
}

/** Civic station: pad + one identity-colored hall with a big letter glyph. */
function drawStation(ctx: Ctx, base: string, hi: string, glyph: string): void {
  const px = 3 * TILE_PX;
  drawPadBase(ctx, px);
  drawBlock(ctx, 8, 8, px - 16, px - 16, base, hi);
  drawWindows(ctx, 8, 8, px - 16, px - 16);
  ctx.fillStyle = PAL.uiText;
  ctx.font = 'bold 24px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, px / 2, px / 2 + 1);
}

export function createTileset(): Tileset {
  return {
    dirt: [0, 1, 2, 3].map((v) => makeTile((c) => drawDirtBase(c, v))),
    water: [0, 1].map((f) => makeTile((c) => drawWater(c, f))),
    tree: [0, 1, 2, 3].map((v) => makeTile((c) => drawTree(c, v))),
    rubble: [0, 1].map((v) => makeTile((c) => drawRubble(c, v))),
    road: Array.from({ length: 16 }, (_, mask) => makeTile((c) => drawRoad(c, mask))),
    bridgeH: makeTile((c) => drawBridge(c, true)),
    bridgeV: makeTile((c) => drawBridge(c, false)),
    wire: Array.from({ length: 16 }, (_, mask) => makeTile((c) => drawWire(c, mask))),
    wireOverlay: Array.from({ length: 16 }, (_, mask) => makeTile((c) => drawWireStrokes(c, mask))),
    wireWaterH: makeTile((c) => drawWireWater(c, true)),
    wireWaterV: makeTile((c) => drawWireWater(c, false)),
    rail: Array.from({ length: 16 }, (_, mask) => makeTile((c) => drawRail(c, mask))),
    railOverlay: Array.from({ length: 16 }, (_, mask) => makeTile((c) => drawRailStrokes(c, mask))),
    railWaterH: makeTile((c) => drawRailWater(c, true)),
    railWaterV: makeTile((c) => drawRailWater(c, false)),
    pad: makeTile((c) => drawPadBase(c, TILE_PX)),
    zoneR: zoneTextures({ base: PAL.rZone, hi: PAL.rZoneHi, glyph: 'R' }),
    zoneC: zoneTextures({ base: PAL.cZone, hi: PAL.cZoneHi, glyph: 'C' }),
    zoneI: zoneTextures({ base: PAL.iZone, hi: PAL.iZoneHi, glyph: 'I' }),
    coal: makeBig(4, drawCoal),
    nuclear: makeBig(4, drawNuclear),
    police: makeBig(3, (c) => drawStation(c, PAL.cZone, PAL.cZoneHi, 'P')),
    fireStation: makeBig(3, (c) => drawStation(c, PAL.alertRed, PAL.alertRedHi, 'F')),
    stadium: makeBig(4, drawStadium),
    seaport: makeBig(4, drawSeaport),
    airport: makeBig(6, drawAirport),
    bolt: makeTile((c) => drawBoltShape(c, 0, 0, 1)),
    fire: [0, 1].map((f) => makeTile((c) => drawFire(c, f))),
    flood: [0, 1].map((f) => makeTile((c) => drawFlood(c, f))),
    radioactive: makeTile(drawRadioactive),
    tornado: makeTile(drawTornado),
    monster: makeTile(drawMonster),
  };
}
