import { Container, Sprite, type Texture } from 'pixi.js';
import type { City } from '../sim/city';
import { Flag, isZone, MAP_H, MAP_SIZE, MAP_W, Tile } from '../sim/constants';
import { isRoadLike, isWireLike } from '../sim/tools';
import { TILE_PX, type Tileset } from './tileset';

const WATER_FRAME_MS = 500;

/**
 * Draws the city in four layers: ground tiles (one sprite per cell),
 * buildings (one sprite per footprint anchor), wire overlays (road/wire
 * crossings), and blinking unpowered bolts on zone anchors.
 *
 * Each frame it diffs the city's tiles/stage/power state against shadow
 * copies and re-textures only cells that changed (plus their 4 neighbors, so
 * connection-aware road/wire art updates). Rendering is a pure function of
 * sim state — this class never writes to the city.
 */
export class MapRenderer {
  readonly container = new Container();
  private groundLayer = new Container();
  private buildingLayer = new Container();
  private overlayLayer = new Container();
  private boltLayer = new Container();

  private sprites: Sprite[] = [];
  private buildings = new Map<number, Sprite>();
  private overlays = new Map<number, Sprite>();
  private bolts = new Map<number, Sprite>();

  private shadowTiles = new Uint16Array(MAP_SIZE);
  private shadowStage = new Uint8Array(MAP_SIZE);
  private shadowPower = new Uint8Array(MAP_SIZE);
  private dirty = new Uint8Array(MAP_SIZE);
  private waterFrame = 0;
  private lastWaterFlip = 0;
  private city: City;

  constructor(city: City, private tileset: Tileset) {
    this.city = city;
    this.container.addChild(this.groundLayer, this.buildingLayer, this.overlayLayer, this.boltLayer);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const s = new Sprite(this.tileset.dirt[0]);
        s.x = x * TILE_PX;
        s.y = y * TILE_PX;
        this.sprites.push(s);
        this.groundLayer.addChild(s);
      }
    }
    this.forceFullRefresh();
  }

  /** Swap in a new city (new map). Forces a full re-texture. */
  setCity(city: City): void {
    this.city = city;
    this.forceFullRefresh();
  }

  private forceFullRefresh(): void {
    this.shadowTiles.fill(0xffff);
    this.shadowStage.fill(0xff);
    this.shadowPower.fill(0xff);
    this.update(this.lastWaterFlip);
  }

  update(nowMs: number): void {
    const { tiles, stage, flags } = this.city;
    const dirty = this.dirty;

    const flipWater = nowMs - this.lastWaterFlip >= WATER_FRAME_MS;
    if (flipWater) {
      this.lastWaterFlip = nowMs;
      this.waterFrame = 1 - this.waterFrame;
    }
    // Unpowered bolts blink on the same cadence as the water shimmer.
    this.boltLayer.visible = this.waterFrame === 0;

    for (let i = 0; i < MAP_SIZE; i++) {
      const powered = flags[i] & Flag.Powered;
      if (tiles[i] !== this.shadowTiles[i]) {
        this.shadowTiles[i] = tiles[i];
        this.shadowStage[i] = stage[i];
        this.shadowPower[i] = powered;
        dirty[i] = 1;
        // Neighbors too: their connection masks may have changed.
        if (i >= MAP_W) dirty[i - MAP_W] = 1;
        if (i < MAP_SIZE - MAP_W) dirty[i + MAP_W] = 1;
        if (i % MAP_W !== 0) dirty[i - 1] = 1;
        if (i % MAP_W !== MAP_W - 1) dirty[i + 1] = 1;
      } else if (stage[i] !== this.shadowStage[i] || powered !== this.shadowPower[i]) {
        this.shadowStage[i] = stage[i];
        this.shadowPower[i] = powered;
        dirty[i] = 1;
      } else if (flipWater && (tiles[i] === Tile.Water || tiles[i] === Tile.Bridge)) {
        dirty[i] = 1;
      }
    }

    for (let i = 0; i < MAP_SIZE; i++) {
      if (!dirty[i]) continue;
      dirty[i] = 0;
      const x = i % MAP_W;
      const y = Math.floor(i / MAP_W);
      this.sprites[i].texture = this.groundTextureFor(x, y);
      this.syncBuilding(i, x, y);
      this.syncOverlay(i, x, y);
      this.syncBolt(i, x, y);
    }
  }

  // --- building / overlay / bolt sprite upkeep ---------------------------

  private syncBuilding(i: number, x: number, y: number): void {
    const { tiles, anchor, stage } = this.city;
    const existing = this.buildings.get(i);
    if (anchor[i] === i) {
      const tex = this.buildingTexture(tiles[i], stage[i]);
      if (existing) {
        existing.texture = tex;
      } else {
        const s = new Sprite(tex);
        s.x = x * TILE_PX;
        s.y = y * TILE_PX;
        this.buildings.set(i, s);
        this.buildingLayer.addChild(s);
      }
    } else if (existing) {
      existing.destroy();
      this.buildings.delete(i);
    }
  }

  private syncOverlay(i: number, x: number, y: number): void {
    const existing = this.overlays.get(i);
    if (this.city.tiles[i] === Tile.RoadWire) {
      const tex = this.tileset.wireOverlay[this.wireMask(x, y)];
      if (existing) {
        existing.texture = tex;
      } else {
        const s = new Sprite(tex);
        s.x = x * TILE_PX;
        s.y = y * TILE_PX;
        this.overlays.set(i, s);
        this.overlayLayer.addChild(s);
      }
    } else if (existing) {
      existing.destroy();
      this.overlays.delete(i);
    }
  }

  private syncBolt(i: number, x: number, y: number): void {
    const { tiles, anchor, flags } = this.city;
    const needsBolt = anchor[i] === i && isZone(tiles[i]) && (flags[i] & Flag.Powered) === 0;
    const existing = this.bolts.get(i);
    if (needsBolt) {
      if (!existing) {
        const s = new Sprite(this.tileset.bolt);
        // Bolt sits on the zone's center tile, like the original.
        s.x = (x + 1) * TILE_PX;
        s.y = (y + 1) * TILE_PX;
        this.bolts.set(i, s);
        this.boltLayer.addChild(s);
      }
    } else if (existing) {
      existing.destroy();
      this.bolts.delete(i);
    }
  }

  private buildingTexture(t: number, stage: number): Texture {
    const ts = this.tileset;
    switch (t) {
      case Tile.ZoneR:
        return ts.zoneR[stage];
      case Tile.ZoneC:
        return ts.zoneC[stage];
      case Tile.ZoneI:
        return ts.zoneI[stage];
      case Tile.Coal:
        return ts.coal;
      default:
        return ts.nuclear;
    }
  }

  // --- ground textures ----------------------------------------------------

  private tileAt(x: number, y: number): number {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return Tile.Water;
    return this.city.tiles[y * MAP_W + x];
  }

  /** 4-neighbor connection mask: 1=N, 2=E, 4=S, 8=W. */
  private mask(x: number, y: number, like: (t: number) => boolean): number {
    return (
      (like(this.tileAt(x, y - 1)) ? 1 : 0) |
      (like(this.tileAt(x + 1, y)) ? 2 : 0) |
      (like(this.tileAt(x, y + 1)) ? 4 : 0) |
      (like(this.tileAt(x - 1, y)) ? 8 : 0)
    );
  }

  private wireMask(x: number, y: number): number {
    return this.mask(x, y, isWireLike);
  }

  private groundTextureFor(x: number, y: number): Texture {
    const ts = this.tileset;
    // Deterministic per-position variant so the map doesn't shimmer on redraw.
    const variant = (x * 7 + y * 13) & 0xffff;
    const t = this.tileAt(x, y);
    switch (t) {
      case Tile.Water:
        return ts.water[this.waterFrame];
      case Tile.Tree:
        return ts.tree[variant % ts.tree.length];
      case Tile.Rubble:
        return ts.rubble[variant % ts.rubble.length];
      case Tile.Road:
      case Tile.RoadWire:
        return ts.road[this.mask(x, y, isRoadLike)];
      case Tile.Wire:
        return ts.wire[this.wireMask(x, y)];
      case Tile.WireWater: {
        const m = this.wireMask(x, y);
        return m & (2 | 8) ? ts.wireWaterH : ts.wireWaterV;
      }
      case Tile.Bridge: {
        const mask = this.mask(x, y, isRoadLike);
        // Orient along the road connections; fall back to spanning the water.
        if (mask & (2 | 8)) return ts.bridgeH;
        if (mask & (1 | 4)) return ts.bridgeV;
        return this.tileAt(x, y - 1) === Tile.Water && this.tileAt(x, y + 1) === Tile.Water
          ? ts.bridgeH
          : ts.bridgeV;
      }
      default:
        // Building cells: concrete pad under the building sprite.
        if (this.city.anchor[y * MAP_W + x] >= 0) return ts.pad;
        return ts.dirt[variant % ts.dirt.length];
    }
  }
}
