import { OVERLAYS, type OverlayId } from '../render/overlay';
import { getDate, type City } from '../sim/city';
import { DEMAND_MAX, SPEEDS, type SpeedId } from '../sim/constants';
import type { TileInfo } from '../sim/query';
import { STARTER_MAPS } from '../sim/terrain';
import { TOOL_INFO, type ToolId } from '../sim/tools';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TOOL_ICONS: Record<ToolId | 'pan', string> = {
  pan: '<svg viewBox="0 0 24 24"><path d="M12 2l3 4h-2v5h5V9l4 3-4 3v-2h-5v5h2l-3 4-3-4h2v-5H6v2l-4-3 4-3v2h5V6H9z"/></svg>',
  bulldozer:
    '<svg viewBox="0 0 24 24"><path d="M3 15h10v-3l3 1v4h2a2 2 0 012 2v1H3v-2a3 3 0 010-3zm2-7h6l2 5H5z"/><rect x="19" y="8" width="2" height="8"/></svg>',
  road: '<svg viewBox="0 0 24 24"><path d="M7 3h10v18H7z"/><rect x="11" y="5" width="2" height="3" fill="#20242b"/><rect x="11" y="11" width="2" height="3" fill="#20242b"/><rect x="11" y="17" width="2" height="3" fill="#20242b"/></svg>',
  rail: '<svg viewBox="0 0 24 24"><rect x="8" y="2" width="2" height="20"/><rect x="14" y="2" width="2" height="20"/><rect x="5" y="5" width="14" height="2"/><rect x="5" y="11" width="14" height="2"/><rect x="5" y="17" width="14" height="2"/></svg>',
  wire: '<svg viewBox="0 0 24 24"><path d="M11 2h2v20h-2z"/><path d="M4 7h16v2H4zM6 12h12v2H6z"/></svg>',
  res: '<svg viewBox="0 0 24 24"><path d="M12 3l9 8h-3v10h-5v-6h-2v6H6V11H3z"/></svg>',
  com: '<svg viewBox="0 0 24 24"><path d="M5 21V5h6v4h8v12zm3-12H6.5v2H8zm0 4H6.5v2H8zm0 4H6.5v2H8zm9-4h-1.5v2H17zm0 4h-1.5v2H17zm-4-8h-1.5v2H13zm0 4h-1.5v2H13zm0 4h-1.5v2H13z"/></svg>',
  ind: '<svg viewBox="0 0 24 24"><path d="M3 21V10l6 4v-4l6 4V8h2V4h3v17z"/></svg>',
  police:
    '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9.4-8 11-4.5-1.6-8-6-8-11V5z"/><path d="M12 6l1.4 2.9 3.2.4-2.3 2.2.6 3.1-2.9-1.5-2.9 1.5.6-3.1-2.3-2.2 3.2-.4z" fill="#20242b"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-2-1-3-1-5 3 2 5 5 5 8a7 7 0 01-14 0c0-5 5-7 7-12z"/></svg>',
  coal: '<svg viewBox="0 0 24 24"><path d="M4 21v-8h16v8zM6 4h3v7H6zm9 0h3v7h-3z"/><path d="M13 14l-2 3h2l-2 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  nuclear:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.5"/><path d="M12 4a8 8 0 014.6 1.5l-3.2 5A2.5 2.5 0 0012 10zM19.6 16a8 8 0 01-4.4 4.7l-1.9-5.6a2.5 2.5 0 001.4-2.1zM4.4 16l5-1a2.5 2.5 0 001.4 2.1L8.9 20.7A8 8 0 014.4 16z" opacity=".9"/></svg>',
  query:
    '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="14.5" y="13" width="8" height="3" transform="rotate(45 14.5 13)"/></svg>',
};

export type ToolSelection = ToolId | null; // null = pan

function row(label: string, value: string): string {
  return `<div class="query-row"><span>${label}</span><span>${value}</span></div>`;
}

interface SpeedButton {
  id: SpeedId;
  label: string;
  key: string;
}

const SPEED_BUTTONS: SpeedButton[] = [
  { id: 'paused', label: '⏸', key: '0' },
  { id: 'slow', label: '▶', key: '1' },
  { id: 'normal', label: '▶▶', key: '2' },
  { id: 'fast', label: '▶▶▶', key: '3' },
];

export interface UICallbacks {
  onNewMap: (starterIndex: number | 'random') => void;
  onOverlay: (id: OverlayId) => void;
}

/**
 * All game chrome is plain DOM (fast to build, accessible, easy to restyle);
 * only the map itself lives on the PixiJS canvas.
 */
export class UI {
  tool: ToolSelection = 'road';
  speed: SpeedId = 'normal';
  private prevSpeed: SpeedId = 'normal';

  private fundsEl!: HTMLElement;
  private dateEl!: HTMLElement;
  private messageEl!: HTMLElement;
  private dragCostEl!: HTMLElement;
  private rciEl!: HTMLElement;
  private rciFills: Record<'r' | 'c' | 'i', HTMLElement> = {} as Record<'r' | 'c' | 'i', HTMLElement>;
  private overlayPicker!: HTMLSelectElement;
  private queryEl!: HTMLElement;
  private toolButtons = new Map<ToolSelection, HTMLButtonElement>();
  private speedButtons = new Map<SpeedId, HTMLButtonElement>();
  private messageTimer = 0;

  constructor(root: HTMLElement, private callbacks: UICallbacks) {
    this.buildTopBar(root);
    this.buildToolbar(root);
    this.buildFloaters(root);
    this.bindKeys();
    this.selectTool(this.tool);
    this.selectSpeed(this.speed);
  }

  private buildTopBar(root: HTMLElement): void {
    const bar = document.createElement('div');
    bar.className = 'topbar';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = 'Tilesburg';
    bar.appendChild(title);

    const mapPicker = document.createElement('select');
    mapPicker.className = 'map-picker';
    mapPicker.title = 'Starter map';
    for (const [i, m] of STARTER_MAPS.entries()) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = m.name;
      mapPicker.appendChild(opt);
    }
    const randomOpt = document.createElement('option');
    randomOpt.value = 'random';
    randomOpt.textContent = 'Random map';
    mapPicker.appendChild(randomOpt);
    bar.appendChild(mapPicker);

    const newMapBtn = document.createElement('button');
    newMapBtn.textContent = 'New city';
    newMapBtn.addEventListener('click', () => {
      const v = mapPicker.value;
      this.callbacks.onNewMap(v === 'random' ? 'random' : Number(v));
    });
    bar.appendChild(newMapBtn);

    const overlayPicker = document.createElement('select');
    overlayPicker.className = 'overlay-picker';
    overlayPicker.title = 'City maps overlay (M to cycle)';
    for (const o of OVERLAYS) {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      overlayPicker.appendChild(opt);
    }
    overlayPicker.addEventListener('change', () => this.callbacks.onOverlay(overlayPicker.value as OverlayId));
    this.overlayPicker = overlayPicker;
    bar.appendChild(overlayPicker);

    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    bar.appendChild(spacer);

    this.rciEl = document.createElement('span');
    this.rciEl.className = 'rci';
    this.rciEl.title = 'RCI demand';
    for (const k of ['r', 'c', 'i'] as const) {
      const col = document.createElement('span');
      col.className = 'rci-col';
      const track = document.createElement('span');
      track.className = 'rci-track';
      const fill = document.createElement('span');
      fill.className = `rci-fill rci-${k}`;
      track.appendChild(fill);
      const label = document.createElement('span');
      label.className = 'rci-label';
      label.textContent = k.toUpperCase();
      col.append(track, label);
      this.rciEl.appendChild(col);
      this.rciFills[k] = fill;
    }
    bar.appendChild(this.rciEl);

    this.fundsEl = document.createElement('span');
    this.fundsEl.className = 'funds';
    bar.appendChild(this.fundsEl);

    this.dateEl = document.createElement('span');
    this.dateEl.className = 'date';
    bar.appendChild(this.dateEl);

    const speeds = document.createElement('span');
    speeds.className = 'speeds';
    for (const sb of SPEED_BUTTONS) {
      const btn = document.createElement('button');
      btn.textContent = sb.label;
      btn.title = `${sb.id} (${sb.key})`;
      btn.addEventListener('click', () => this.selectSpeed(sb.id));
      this.speedButtons.set(sb.id, btn);
      speeds.appendChild(btn);
    }
    bar.appendChild(speeds);

    root.appendChild(bar);
  }

  private buildToolbar(root: HTMLElement): void {
    const bar = document.createElement('div');
    bar.className = 'toolbar';

    const addTool = (sel: ToolSelection, name: string, iconKey: ToolId | 'pan', costLabel: string, hotkey: string) => {
      const btn = document.createElement('button');
      btn.className = 'tool';
      btn.title = `${name} (${hotkey})`;
      btn.innerHTML = `${TOOL_ICONS[iconKey]}<span class="tool-name">${name}</span><span class="tool-cost">${costLabel}</span>`;
      btn.addEventListener('click', () => this.selectTool(sel));
      this.toolButtons.set(sel, btn);
      bar.appendChild(btn);
    };

    addTool(null, 'Pan', 'pan', '', 'Esc');
    for (const id of Object.keys(TOOL_INFO) as ToolId[]) {
      const info = TOOL_INFO[id];
      addTool(id, info.name, id, `§${info.cost}`, info.hotkey);
    }

    root.appendChild(bar);
  }

  private buildFloaters(root: HTMLElement): void {
    this.messageEl = document.createElement('div');
    this.messageEl.className = 'message';
    root.appendChild(this.messageEl);

    this.dragCostEl = document.createElement('div');
    this.dragCostEl.className = 'drag-cost';
    this.dragCostEl.style.display = 'none';
    root.appendChild(this.dragCostEl);

    this.queryEl = document.createElement('div');
    this.queryEl.className = 'query-popup';
    this.queryEl.style.display = 'none';
    root.appendChild(this.queryEl);
  }

  /** Query tool result popup, anchored near the clicked tile. */
  showQuery(info: TileInfo, sx: number, sy: number): void {
    const rows: string[] = [`<div class="query-title">${info.name}</div>`];
    if (info.building) {
      if (info.building.stage) rows.push(row('Density', info.building.stage));
      rows.push(row('Power', info.building.powered ? 'Powered' : 'No power'));
      if (info.building.access !== undefined) {
        rows.push(row('Transport', info.building.access ? 'Connected' : 'No route'));
      }
    }
    rows.push(row('Land value', String(info.landValue)));
    rows.push(row('Pollution', String(info.pollution)));
    rows.push(row('Crime', String(info.crime)));
    rows.push(row('Traffic', String(info.traffic)));
    rows.push(row('Population', String(info.popDensity)));
    this.queryEl.innerHTML = rows.join('');
    this.queryEl.style.display = 'block';
    // Anchor near the cursor; flip when it would leave the viewport.
    const w = 190;
    const h = 170;
    const x = Math.min(sx + 16, window.innerWidth - w);
    const y = Math.min(sy + 8, window.innerHeight - h);
    this.queryEl.style.left = `${x}px`;
    this.queryEl.style.top = `${y}px`;
  }

  hideQuery(): void {
    this.queryEl.style.display = 'none';
  }

  /** Cycle the overlay picker (M key). */
  cycleOverlay(): void {
    const next = (this.overlayPicker.selectedIndex + 1) % this.overlayPicker.length;
    this.overlayPicker.selectedIndex = next;
    this.callbacks.onOverlay(this.overlayPicker.value as OverlayId);
    this.setMessage(OVERLAYS[next].name);
  }

  private bindKeys(): void {
    const byHotkey = new Map<string, ToolId>();
    for (const id of Object.keys(TOOL_INFO) as ToolId[]) {
      byHotkey.set(TOOL_INFO[id].hotkey.toLowerCase(), id);
    }
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const tool = byHotkey.get(key);
      if (tool) {
        this.selectTool(tool);
        return;
      }
      switch (key) {
        case 'escape':
          this.selectTool(null);
          this.hideQuery();
          break;
        case 'm':
          this.cycleOverlay();
          break;
        case ' ':
          e.preventDefault();
          this.togglePause();
          break;
        case '0':
          this.selectSpeed('paused');
          break;
        case '1':
          this.selectSpeed('slow');
          break;
        case '2':
          this.selectSpeed('normal');
          break;
        case '3':
          this.selectSpeed('fast');
          break;
      }
    });
  }

  selectTool(tool: ToolSelection): void {
    this.tool = tool;
    if (tool !== 'query') this.hideQuery();
    for (const [id, btn] of this.toolButtons) btn.classList.toggle('active', id === tool);
  }

  selectSpeed(speed: SpeedId): void {
    if (speed !== 'paused') this.prevSpeed = speed;
    this.speed = speed;
    for (const [id, btn] of this.speedButtons) btn.classList.toggle('active', id === speed);
  }

  togglePause(): void {
    this.selectSpeed(this.speed === 'paused' ? this.prevSpeed : 'paused');
  }

  get ticksPerSecond(): number {
    return SPEEDS[this.speed];
  }

  /** Transient status line (tool errors, hints). */
  setMessage(msg: string): void {
    this.messageEl.textContent = msg;
    this.messageEl.classList.add('visible');
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => this.messageEl.classList.remove('visible'), 2500);
  }

  /** Running §-cost readout that follows the cursor during a drag. */
  showDragCost(cost: number | null, sx: number, sy: number): void {
    if (cost === null || cost === 0) {
      this.dragCostEl.style.display = 'none';
      return;
    }
    this.dragCostEl.style.display = 'block';
    this.dragCostEl.textContent = `−§${cost}`;
    this.dragCostEl.style.left = `${sx + 14}px`;
    this.dragCostEl.style.top = `${sy - 10}px`;
  }

  update(city: City): void {
    this.fundsEl.textContent = `§${city.funds.toLocaleString('en-US')}`;
    const d = getDate(city);
    this.dateEl.textContent = `${MONTHS[d.month]} ${d.year}`;
    this.updateRci(city);
  }

  // Each bar fills up or down from the track's midline with the sign of the
  // demand valve.
  private updateRci(city: City): void {
    const HALF = 14; // px, half the track height
    for (const k of ['r', 'c', 'i'] as const) {
      const v = city.demand[k] / DEMAND_MAX; // -1..1
      const px = Math.round(Math.min(1, Math.abs(v)) * HALF);
      const fill = this.rciFills[k];
      fill.style.height = `${px}px`;
      if (v >= 0) {
        fill.style.top = `${HALF - px}px`;
      } else {
        fill.style.top = `${HALF}px`;
      }
    }
  }
}
