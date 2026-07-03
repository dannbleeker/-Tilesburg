import { Container, Sprite, type Texture } from 'pixi.js';
import type { City } from '../sim/city';
import { MAP_H, MAP_SIZE, MAP_W, Tile } from '../sim/constants';
import { TILE_PX, type Tileset } from './tileset';

const WATER_FRAME_MS = 500;

/**
 * Draws the tile grid as one sprite per cell. Each frame it diffs the city's
 * tile array against a shadow copy and re-textures only the cells that
 * changed (plus their 4 neighbors, so connection-aware road art updates).
 * Rendering is a pure function of sim state — this class never writes tiles.
 */
export class MapRenderer {
  readonly container = new Container();
  private sprites: Sprite[] = [];
  private shadow = new Uint16Array(MAP_SIZE);
  private dirty = new Uint8Array(MAP_SIZE);
  private waterFrame = 0;
  private lastWaterFlip = 0;
  private city: City;

  constructor(city: City, private tileset: Tileset) {
    this.city = city;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const s = new Sprite(this.textureFor(x, y));
        s.x = x * TILE_PX;
        s.y = y * TILE_PX;
        this.sprites.push(s);
        this.container.addChild(s);
      }
    }
    this.shadow.set(city.tiles);
  }

  /** Swap in a new city (new map). Forces a full re-texture. */
  setCity(city: City): void {
    this.city = city;
    this.shadow.fill(0xffff);
  }

  update(nowMs: number): void {
    const tiles = this.city.tiles;
    const dirty = this.dirty;

    const flipWater = nowMs - this.lastWaterFlip >= WATER_FRAME_MS;
    if (flipWater) {
      this.lastWaterFlip = nowMs;
      this.waterFrame = 1 - this.waterFrame;
    }

    for (let i = 0; i < MAP_SIZE; i++) {
      if (tiles[i] !== this.shadow[i]) {
        this.shadow[i] = tiles[i];
        dirty[i] = 1;
        // Neighbors too: their connection masks may have changed.
        if (i >= MAP_W) dirty[i - MAP_W] = 1;
        if (i < MAP_SIZE - MAP_W) dirty[i + MAP_W] = 1;
        if (i % MAP_W !== 0) dirty[i - 1] = 1;
        if (i % MAP_W !== MAP_W - 1) dirty[i + 1] = 1;
      } else if (flipWater && tiles[i] === Tile.Water) {
        dirty[i] = 1;
      }
    }

    for (let i = 0; i < MAP_SIZE; i++) {
      if (dirty[i]) {
        dirty[i] = 0;
        this.sprites[i].texture = this.textureFor(i % MAP_W, Math.floor(i / MAP_W));
      }
    }
  }

  private tileAt(x: number, y: number): number {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return Tile.Water;
    return this.city.tiles[y * MAP_W + x];
  }

  private isRoadLike(x: number, y: number): boolean {
    const t = this.tileAt(x, y);
    return t === Tile.Road || t === Tile.Bridge;
  }

  /** 4-neighbor road connection mask: 1=N, 2=E, 4=S, 8=W. */
  private roadMask(x: number, y: number): number {
    return (
      (this.isRoadLike(x, y - 1) ? 1 : 0) |
      (this.isRoadLike(x + 1, y) ? 2 : 0) |
      (this.isRoadLike(x, y + 1) ? 4 : 0) |
      (this.isRoadLike(x - 1, y) ? 8 : 0)
    );
  }

  private textureFor(x: number, y: number): Texture {
    const ts = this.tileset;
    // Deterministic per-position variant so the map doesn't shimmer on redraw.
    const variant = (x * 7 + y * 13) & 0xffff;
    switch (this.tileAt(x, y)) {
      case Tile.Water:
        return ts.water[this.waterFrame];
      case Tile.Tree:
        return ts.tree[variant % ts.tree.length];
      case Tile.Rubble:
        return ts.rubble[variant % ts.rubble.length];
      case Tile.Road:
        return ts.road[this.roadMask(x, y)];
      case Tile.Bridge: {
        const mask = this.roadMask(x, y);
        // Orient along the road connections; fall back to spanning the water.
        if (mask & (2 | 8)) return ts.bridgeH;
        if (mask & (1 | 4)) return ts.bridgeV;
        return this.tileAt(x, y - 1) === Tile.Water && this.tileAt(x, y + 1) === Tile.Water
          ? ts.bridgeH
          : ts.bridgeV;
      }
      default:
        return ts.dirt[variant % ts.dirt.length];
    }
  }
}
