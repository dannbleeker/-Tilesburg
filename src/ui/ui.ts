import { getDate, type City } from '../sim/city';
import { SPEEDS, type SpeedId } from '../sim/constants';
import { STARTER_MAPS } from '../sim/terrain';
import { TOOL_INFO, type ToolId } from '../sim/tools';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TOOL_ICONS: Record<ToolId | 'pan', string> = {
  pan: '<svg viewBox="0 0 24 24"><path d="M12 2l3 4h-2v5h5V9l4 3-4 3v-2h-5v5h2l-3 4-3-4h2v-5H6v2l-4-3 4-3v2h5V6H9z"/></svg>',
  bulldozer:
    '<svg viewBox="0 0 24 24"><path d="M3 15h10v-3l3 1v4h2a2 2 0 012 2v1H3v-2a3 3 0 010-3zm2-7h6l2 5H5z"/><rect x="19" y="8" width="2" height="8"/></svg>',
  road: '<svg viewBox="0 0 24 24"><path d="M7 3h10v18H7z"/><rect x="11" y="5" width="2" height="3" fill="#20242b"/><rect x="11" y="11" width="2" height="3" fill="#20242b"/><rect x="11" y="17" width="2" height="3" fill="#20242b"/></svg>',
};

export type ToolSelection = ToolId | null; // null = pan

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

    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    bar.appendChild(spacer);

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
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key.toLowerCase()) {
        case 'b':
          this.selectTool('bulldozer');
          break;
        case 'r':
          this.selectTool('road');
          break;
        case 'escape':
          this.selectTool(null);
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
  }
}
