import { Application } from 'pixi.js';
import { AudioEngine } from './audio/audio';
import { setupInput } from './input';
import { Camera } from './render/camera';
import { PAL } from './render/palette';
import { MapRenderer } from './render/renderer';
import { createTileset } from './render/tileset';
import { createCity, type City } from './sim/city';
import { TICKS_PER_YEAR } from './sim/constants';
import { queryTile } from './sim/query';
import { Rng } from './sim/rng';
import { deserializeCity, serializeCity } from './sim/save';
import { createScenarioCity, SCENARIOS } from './sim/scenarios';
import { randomTerrainParams, STARTER_MAPS } from './sim/terrain';
import { primeDemand, tick } from './sim/tick';
import { Minimap } from './ui/minimap';
import { UI } from './ui/ui';

async function boot(): Promise<void> {
  const uiRoot = document.getElementById('ui-root');
  const gameRoot = document.getElementById('game');
  if (!uiRoot || !gameRoot) throw new Error('missing mount points');

  const app = new Application();
  await app.init({
    resizeTo: gameRoot,
    background: PAL.uiBg,
    antialias: false,
    // WebGL over WebGPU: rock-solid for a 2D tile grid everywhere, and
    // software-WebGPU environments show compositing artifacts under
    // overlapping fixed DOM (observed in headless Chromium).
    preference: 'webgl',
  });
  gameRoot.appendChild(app.canvas);

  const first = STARTER_MAPS[0];
  let city: City = createCity(first.seed, first.params);
  primeDemand(city);

  const tileset = createTileset();
  const renderer = new MapRenderer(city, tileset);
  app.stage.addChild(renderer.container);

  const camera = new Camera(renderer.container, app.screen.width, app.screen.height);
  camera.centerOnMap();
  app.renderer.on('resize', (w: number, h: number) => camera.setViewport(w, h));

  const audio = new AudioEngine();
  // Browsers allow audio only after a user gesture.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  const swapCity = (next: City) => {
    city = next;
    renderer.setCity(city);
    camera.centerOnMap();
  };

  const ui = new UI(uiRoot, {
    onOverlay: (id) => renderer.setOverlay(id),
    serialize: () => serializeCity(city),
    onLoadCity: (json) => {
      try {
        const loaded = deserializeCity(json);
        primeDemand(loaded);
        swapCity(loaded);
        return null;
      } catch {
        return 'Could not load that save';
      }
    },
    onToggleSfx: () => audio.toggleSfx(),
    onToggleMusic: () => audio.toggleMusic(),
    onAlarm: () => audio.play('alarm'),
    onChime: () => audio.play('chime'),
    onNewMap: (starter) => {
      if (typeof starter === 'object') {
        const def = SCENARIOS.find((s) => s.id === starter.scenarioId);
        if (!def) return;
        swapCity(createScenarioCity(def));
        ui.showScenarioIntro(def);
        return;
      }
      if (starter === 'random') {
        // Seed the new map from wall clock — the only non-sim randomness in
        // the game. The seed is stored on the city, so the map itself stays
        // reproducible.
        const seed = Date.now() >>> 0;
        const next = createCity(seed, randomTerrainParams(new Rng(seed ^ 0x9e3779b9)));
        primeDemand(next);
        swapCity(next);
        ui.setMessage(`New random city (seed ${seed})`);
      } else {
        const m = STARTER_MAPS[starter];
        const next = createCity(m.seed, m.params);
        primeDemand(next);
        swapCity(next);
        ui.setMessage(`Welcome to ${m.name}`);
      }
    },
  });

  const minimap = new Minimap(uiRoot, {
    getViewRect: () => camera.viewTileRect(),
    onJump: (tx, ty) => camera.centerOnTile(tx, ty),
  });

  setupInput({
    canvas: app.canvas,
    camera,
    getCity: () => city,
    getTool: () => ui.tool,
    onDragCost: (cost, sx, sy) => ui.showDragCost(cost, sx, sy),
    onToolError: (reason) => {
      ui.setMessage(reason);
      audio.play('error');
    },
    onPlaced: (tool) => audio.play(tool === 'bulldozer' ? 'bulldoze' : 'place'),
    onQuery: (x, y, pageX, pageY) => {
      const info = queryTile(city, x, y);
      if (info) ui.showQuery(info, pageX, pageY);
    },
    onDismiss: () => ui.hideQuery(),
  });

  // Fixed-timestep sim, free-running render: the accumulator converts wall
  // time into whole ticks at the current speed.
  let acc = 0;
  app.ticker.add((t) => {
    acc += (t.deltaMS / 1000) * ui.ticksPerSecond;
    // Cap the burst so a background tab doesn't fast-forward on return.
    let burst = 8;
    let autosaveDue = false;
    while (acc >= 1 && burst-- > 0) {
      tick(city);
      if (city.cityTime % TICKS_PER_YEAR === 0) autosaveDue = true;
      acc -= 1;
    }
    acc = Math.min(acc, 1);
    if (autosaveDue) ui.autosave();
    const now = performance.now();
    renderer.update(now);
    renderer.updateOverlay(now);
    minimap.update(city, now);
    audio.updateAmbience(city);
    ui.update(city);
  });
}

void boot();
