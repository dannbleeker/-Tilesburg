import type { City } from '../sim/city';
import { isBuilding, MAP_H, MAP_SIZE, MAP_W, Tile } from '../sim/constants';

const REDRAW_MS = 400;

// Minimap tile colors: a simplified read of the palette, one pixel per tile.
const COLORS: Record<number, string> = {
  [Tile.Dirt]: '#c9b581',
  [Tile.Water]: '#2e6f9e',
  [Tile.Tree]: '#3e6b3a',
  [Tile.Rubble]: '#8a8377',
  [Tile.Road]: '#4b4f55',
  [Tile.Bridge]: '#4b4f55',
  [Tile.RoadWire]: '#4b4f55',
  [Tile.RoadRail]: '#4b4f55',
  [Tile.Rail]: '#7b8087',
  [Tile.RailWater]: '#7b8087',
  [Tile.Wire]: '#a08a3d',
  [Tile.WireWater]: '#a08a3d',
  [Tile.ZoneR]: '#3f8f4f',
  [Tile.ZoneC]: '#3f6fb5',
  [Tile.ZoneI]: '#c2a23c',
  [Tile.Fire]: '#c0483e',
  [Tile.Flood]: '#4a8dbd',
  [Tile.Radioactive]: '#e3b93d',
};

export interface MinimapHooks {
  getViewRect: () => { x: number; y: number; w: number; h: number };
  onJump: (tx: number, ty: number) => void;
}

/** Always-visible minimap with the viewport box and click/drag-to-jump. */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastDraw = 0;

  constructor(root: HTMLElement, private hooks: MinimapHooks) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = MAP_W;
    this.canvas.height = MAP_H;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    root.appendChild(this.canvas);

    const jump = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const tx = ((e.clientX - r.left) / r.width) * MAP_W;
      const ty = ((e.clientY - r.top) / r.height) * MAP_H;
      this.hooks.onJump(tx, ty);
      this.lastDraw = 0;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      jump(e);
      const move = (ev: PointerEvent) => jump(ev);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  update(city: City, nowMs: number): void {
    if (nowMs - this.lastDraw < REDRAW_MS) return;
    this.lastDraw = nowMs;
    const { tiles, anchor } = city;
    const ctx = this.ctx;
    for (let i = 0; i < MAP_SIZE; i++) {
      const t = tiles[i];
      let color = COLORS[t];
      if (color === undefined) {
        // Remaining building types: gray civic blocks.
        color = isBuilding(t) && anchor[i] >= 0 ? '#9aa0a8' : '#c9b581';
      }
      ctx.fillStyle = color;
      ctx.fillRect(i % MAP_W, Math.floor(i / MAP_W), 1, 1);
    }
    // Viewport box.
    const v = this.hooks.getViewRect();
    ctx.strokeStyle = '#e8e6df';
    ctx.lineWidth = 1;
    ctx.strokeRect(v.x + 0.5, v.y + 0.5, v.w - 1, v.h - 1);
  }
}
