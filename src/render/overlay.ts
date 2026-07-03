import { Sprite, Texture } from 'pixi.js';
import type { City } from '../sim/city';
import { Flag, isConductor, MAP_H, MAP_SIZE, MAP_W, Tile } from '../sim/constants';
import { isRailLike, isRoadLike } from '../sim/tools';
import { TILE_PX } from './tileset';

export const OVERLAYS = [
  { id: 'none', name: 'No overlay' },
  { id: 'pop', name: 'Population' },
  { id: 'landvalue', name: 'Land value' },
  { id: 'pollution', name: 'Pollution' },
  { id: 'crime', name: 'Crime' },
  { id: 'traffic', name: 'Traffic' },
  { id: 'police', name: 'Police coverage' },
  { id: 'fire', name: 'Fire coverage' },
  { id: 'power', name: 'Power grid' },
  { id: 'transport', name: 'Transportation' },
] as const;
export type OverlayId = (typeof OVERLAYS)[number]['id'];

const REFRESH_MS = 300;

/**
 * The city-maps view: a 1-pixel-per-tile canvas stretched over the map with
 * nearest scaling, redrawn from the sim's overlay arrays while active.
 * Scalar maps use a green→yellow→red heat ramp (transparent when negligible);
 * power shows powered/unpowered conductors; transport shows the network.
 */
export class OverlayView {
  readonly sprite: Sprite;
  current: OverlayId = 'none';

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: Texture;
  private lastDraw = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = MAP_W;
    this.canvas.height = MAP_H;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.texture);
    this.sprite.scale.set(TILE_PX);
    this.sprite.visible = false;
  }

  set(id: OverlayId): void {
    this.current = id;
    this.sprite.visible = id !== 'none';
    this.lastDraw = 0; // force redraw
  }

  update(city: City, nowMs: number): void {
    if (this.current === 'none') return;
    if (nowMs - this.lastDraw < REFRESH_MS) return;
    this.lastDraw = nowMs;

    const img = this.ctx.createImageData(MAP_W, MAP_H);
    const data = img.data;
    switch (this.current) {
      case 'power':
        this.drawPower(city, data);
        break;
      case 'transport':
        this.drawTransport(city, data);
        break;
      default:
        this.drawHeat(this.scalarFor(city), data);
    }
    this.ctx.putImageData(img, 0, 0);
    this.texture.source.update();
  }

  private scalarFor(city: City): Uint8Array {
    switch (this.current) {
      case 'pop':
        return city.popDensity;
      case 'landvalue':
        return city.landValue;
      case 'pollution':
        return city.pollution;
      case 'crime':
        return city.crime;
      case 'traffic':
        return city.trafficDensity;
      case 'police':
        return city.policeCov;
      default:
        return city.fireCov;
    }
  }

  // Heat ramp: 0 transparent → green → yellow → red.
  private drawHeat(map: Uint8Array, data: Uint8ClampedArray): void {
    for (let i = 0; i < MAP_SIZE; i++) {
      const v = map[i];
      const o = i * 4;
      if (v < 4) continue; // stays transparent
      const t = Math.min(1, v / 160);
      // green (0) → yellow (0.5) → red (1)
      data[o] = t < 0.5 ? Math.round(510 * t) : 255;
      data[o + 1] = t < 0.5 ? 200 : Math.round(200 * (1 - (t - 0.5) * 2));
      data[o + 2] = 40;
      data[o + 3] = 90 + Math.round(t * 120);
    }
  }

  private drawPower(city: City, data: Uint8ClampedArray): void {
    for (let i = 0; i < MAP_SIZE; i++) {
      if (!isConductor(city.tiles[i])) continue;
      const o = i * 4;
      const powered = (city.flags[i] & Flag.Powered) !== 0;
      data[o] = powered ? 80 : 220;
      data[o + 1] = powered ? 220 : 60;
      data[o + 2] = 60;
      data[o + 3] = 200;
    }
  }

  private drawTransport(city: City, data: Uint8ClampedArray): void {
    for (let i = 0; i < MAP_SIZE; i++) {
      const t = city.tiles[i];
      const o = i * 4;
      if (isRoadLike(t)) {
        data[o] = data[o + 1] = data[o + 2] = 235;
        data[o + 3] = 220;
      }
      if (isRailLike(t)) {
        data[o] = 140;
        data[o + 1] = 170;
        data[o + 2] = 220;
        data[o + 3] = 220;
      }
      if (t === Tile.RoadRail) {
        // Crossing: keep the rail tint on top of the road white.
        data[o] = 190;
        data[o + 1] = 205;
        data[o + 2] = 230;
      }
    }
  }
}
