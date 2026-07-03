import type { Container } from 'pixi.js';
import { MAP_H, MAP_W } from '../sim/constants';
import { TILE_PX } from './tileset';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

/** Pan/zoom for the world container, with screen↔tile mapping. */
export class Camera {
  scale = 1;

  constructor(
    private world: Container,
    private viewW: number,
    private viewH: number,
  ) {}

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  centerOnMap(): void {
    this.world.x = (this.viewW - MAP_W * TILE_PX * this.scale) / 2;
    this.world.y = (this.viewH - MAP_H * TILE_PX * this.scale) / 2;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.world.x += dx;
    this.world.y += dy;
    this.clamp();
  }

  /** Zoom by factor keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
    const ratio = next / this.scale;
    this.world.x = sx - (sx - this.world.x) * ratio;
    this.world.y = sy - (sy - this.world.y) * ratio;
    this.scale = next;
    this.world.scale.set(next);
    this.clamp();
  }

  /** Screen pixel → tile coordinate (may be out of map bounds). */
  screenToTile(sx: number, sy: number): { x: number; y: number } {
    return {
      x: Math.floor((sx - this.world.x) / (TILE_PX * this.scale)),
      y: Math.floor((sy - this.world.y) / (TILE_PX * this.scale)),
    };
  }

  // Keep the map on screen: center it on axes where it's smaller than the
  // viewport, otherwise don't let its edge pull past the viewport edge.
  private clamp(): void {
    const mapW = MAP_W * TILE_PX * this.scale;
    const mapH = MAP_H * TILE_PX * this.scale;
    if (mapW <= this.viewW) {
      this.world.x = (this.viewW - mapW) / 2;
    } else {
      this.world.x = Math.min(0, Math.max(this.viewW - mapW, this.world.x));
    }
    if (mapH <= this.viewH) {
      this.world.y = (this.viewH - mapH) / 2;
    } else {
      this.world.y = Math.min(0, Math.max(this.viewH - mapH, this.world.y));
    }
  }
}
