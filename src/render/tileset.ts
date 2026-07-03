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

export function createTileset(): Tileset {
  return {
    dirt: [0, 1, 2, 3].map((v) => makeTile((c) => drawDirtBase(c, v))),
    water: [0, 1].map((f) => makeTile((c) => drawWater(c, f))),
    tree: [0, 1, 2, 3].map((v) => makeTile((c) => drawTree(c, v))),
    rubble: [0, 1].map((v) => makeTile((c) => drawRubble(c, v))),
    road: Array.from({ length: 16 }, (_, mask) => makeTile((c) => drawRoad(c, mask))),
    bridgeH: makeTile((c) => drawBridge(c, true)),
    bridgeV: makeTile((c) => drawBridge(c, false)),
  };
}
