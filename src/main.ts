import { Application } from 'pixi.js';
import { setupInput } from './input';
import { Camera } from './render/camera';
import { PAL } from './render/palette';
import { MapRenderer } from './render/renderer';
import { createTileset } from './render/tileset';
import { createCity, type City } from './sim/city';
import { randomTerrainParams, STARTER_MAPS } from './sim/terrain';
import { tick } from './sim/tick';
import { Rng } from './sim/rng';
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
  });
  gameRoot.appendChild(app.canvas);

  const first = STARTER_MAPS[0];
  let city: City = createCity(first.seed, first.params);

  const tileset = createTileset();
  const renderer = new MapRenderer(city, tileset);
  app.stage.addChild(renderer.container);

  const camera = new Camera(renderer.container, app.screen.width, app.screen.height);
  camera.centerOnMap();
  app.renderer.on('resize', (w: number, h: number) => camera.setViewport(w, h));

  const ui = new UI(uiRoot, {
    onNewMap: (starter) => {
      if (starter === 'random') {
        // Seed the new map from wall clock — the only non-sim randomness in
        // the game. The seed is stored on the city, so the map itself stays
        // reproducible.
        const seed = Date.now() >>> 0;
        city = createCity(seed, randomTerrainParams(new Rng(seed ^ 0x9e3779b9)));
        ui.setMessage(`New random city (seed ${seed})`);
      } else {
        const m = STARTER_MAPS[starter];
        city = createCity(m.seed, m.params);
        ui.setMessage(`Welcome to ${m.name}`);
      }
      renderer.setCity(city);
      camera.centerOnMap();
    },
  });

  setupInput({
    canvas: app.canvas,
    camera,
    getCity: () => city,
    getTool: () => ui.tool,
    onDragCost: (cost, sx, sy) => ui.showDragCost(cost, sx, sy),
    onToolError: (reason) => ui.setMessage(reason),
  });

  // Fixed-timestep sim, free-running render: the accumulator converts wall
  // time into whole ticks at the current speed.
  let acc = 0;
  app.ticker.add((t) => {
    acc += (t.deltaMS / 1000) * ui.ticksPerSecond;
    // Cap the burst so a background tab doesn't fast-forward on return.
    let burst = 8;
    while (acc >= 1 && burst-- > 0) {
      tick(city);
      acc -= 1;
    }
    acc = Math.min(acc, 1);
    renderer.update(performance.now());
    ui.update(city);
  });
}

void boot();
