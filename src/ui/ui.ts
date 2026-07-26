import { OVERLAYS, type OverlayId } from '../render/overlay';
import { applyBudget, assessBudget, cashFlow, fundedCost, taxIncome } from '../sim/budget';
import {
  triggerEarthquake,
  triggerFire,
  triggerFlood,
  triggerMeltdown,
  triggerMonster,
  triggerPlaneCrash,
  triggerTornado,
} from '../sim/disasters';
import { getDate, type BudgetSummary, type City } from '../sim/city';
import { DEMAND_MAX, SPEEDS, type SpeedId } from '../sim/constants';
import { evaluate } from '../sim/evaluation';
import { ORDINANCES } from '../sim/ordinances';
import type { TileInfo } from '../sim/query';
import { SCENARIOS, type ScenarioDef } from '../sim/scenarios';
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
  stadium:
    '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="currentColor" stroke-width="2.5"/><ellipse cx="12" cy="12" rx="4" ry="2.5"/></svg>',
  seaport:
    '<svg viewBox="0 0 24 24"><path d="M11 3h2v10h6l-7 8-7-8h6z"/><rect x="3" y="19" width="18" height="2"/></svg>',
  airport:
    '<svg viewBox="0 0 24 24"><path d="M22 14l-8-4V4a2 2 0 00-4 0v6l-8 4v2l8-2v4l-3 2v2l5-1 5 1v-2l-3-2v-4l8 2z"/></svg>',
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
  onNewMap: (choice: number | 'random' | { scenarioId: string }) => void;
  onOverlay: (id: OverlayId) => void;
  /** Serialize the current city for saving. */
  serialize: () => string;
  /** Load a serialized city; returns an error message or null on success. */
  onLoadCity: (json: string) => string | null;
  onToggleSfx: () => boolean;
  onToggleMusic: () => boolean;
  /** Current persisted mute state, for painting the buttons at startup. */
  isSfxMuted: () => boolean;
  isMusicMuted: () => boolean;
  /** Sim events worth a sound. */
  onAlarm: () => void;
  onChime: () => void;
}

const SLOT_KEYS = ['tilesburg:autosave', 'tilesburg:slot1', 'tilesburg:slot2', 'tilesburg:slot3'];
const SLOT_NAMES = ['Autosave', 'Slot 1', 'Slot 2', 'Slot 3'];

export const AUTOSAVE_KEY = SLOT_KEYS[0];

interface StoredSave {
  savedAt: string;
  data: string;
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
  private modalEl!: HTMLElement;
  private modalOpen = false;
  private prevModalSpeed: SpeedId = 'normal';
  private city: City | null = null;
  private outcomeShown = false;
  /** Recent letter keys + the tool active before each, for cheat codes. */
  private cheatBuffer: Array<{ key: string; tool: ToolSelection }> = [];
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
    mapPicker.title = 'Starter map or scenario';
    const mapsGroup = document.createElement('optgroup');
    mapsGroup.label = 'Maps';
    for (const [i, m] of STARTER_MAPS.entries()) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = m.name;
      mapsGroup.appendChild(opt);
    }
    const randomOpt = document.createElement('option');
    randomOpt.value = 'random';
    randomOpt.textContent = 'Random map';
    mapsGroup.appendChild(randomOpt);
    mapPicker.appendChild(mapsGroup);
    const scenarioGroup = document.createElement('optgroup');
    scenarioGroup.label = 'Scenarios';
    for (const s of SCENARIOS) {
      const opt = document.createElement('option');
      opt.value = `scenario:${s.id}`;
      opt.textContent = s.name;
      scenarioGroup.appendChild(opt);
    }
    mapPicker.appendChild(scenarioGroup);
    bar.appendChild(mapPicker);

    const newMapBtn = document.createElement('button');
    newMapBtn.textContent = 'New city';
    newMapBtn.addEventListener('click', () => {
      const v = mapPicker.value;
      if (v.startsWith('scenario:')) this.callbacks.onNewMap({ scenarioId: v.slice(9) });
      else this.callbacks.onNewMap(v === 'random' ? 'random' : Number(v));
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

    const budgetBtn = document.createElement('button');
    budgetBtn.textContent = 'Budget';
    budgetBtn.title = 'Budget window (G)';
    budgetBtn.addEventListener('click', () => this.openBudget(false));
    bar.appendChild(budgetBtn);

    const evalBtn = document.createElement('button');
    evalBtn.textContent = 'Stats';
    evalBtn.title = 'City evaluation (E)';
    evalBtn.addEventListener('click', () => this.openEvaluation());
    bar.appendChild(evalBtn);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save/Load';
    saveBtn.addEventListener('click', () => this.openSaveLoad());
    bar.appendChild(saveBtn);

    const ordBtn = document.createElement('button');
    ordBtn.textContent = 'Ordinances';
    ordBtn.addEventListener('click', () => this.openOrdinances());
    bar.appendChild(ordBtn);

    const disasterBtn = document.createElement('button');
    disasterBtn.textContent = 'Disasters';
    disasterBtn.addEventListener('click', () => this.openDisasters());
    bar.appendChild(disasterBtn);

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

    const sfxBtn = document.createElement('button');
    const musicBtn = document.createElement('button');
    sfxBtn.title = 'Toggle sound effects';
    musicBtn.title = 'Toggle music';
    const paint = (btn: HTMLButtonElement, glyph: string, muted: boolean) => {
      btn.textContent = glyph;
      btn.classList.toggle('muted', muted);
    };
    // Seed from the engine's persisted preference, not from an assumption —
    // otherwise a reload shows both as unmuted while the audio stays silent.
    paint(sfxBtn, '🔊', this.callbacks.isSfxMuted());
    paint(musicBtn, '♫', this.callbacks.isMusicMuted());
    sfxBtn.addEventListener('click', () => paint(sfxBtn, '🔊', this.callbacks.onToggleSfx()));
    musicBtn.addEventListener('click', () => paint(musicBtn, '♫', this.callbacks.onToggleMusic()));
    bar.append(sfxBtn, musicBtn);

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

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-backdrop';
    this.modalEl.style.display = 'none';
    root.appendChild(this.modalEl);
  }

  // --- modal windows ------------------------------------------------------

  private openModal(panel: HTMLElement): void {
    this.modalEl.innerHTML = '';
    this.modalEl.appendChild(panel);
    this.modalEl.style.display = 'flex';
    if (!this.modalOpen) {
      this.modalOpen = true;
      // Remember the literal current speed: mapping 'paused' back to the last
      // running speed would resume a game the player had deliberately paused.
      this.prevModalSpeed = this.speed;
      this.selectSpeed('paused');
    }
  }

  private closeModal(): void {
    this.modalEl.style.display = 'none';
    this.modalOpen = false;
    this.selectSpeed(this.prevModalSpeed);
  }

  /**
   * The budget window. `pending` is true for the automatic January opening,
   * where Continue settles the year; opened manually it is a live preview
   * of the current assessment and Continue just closes.
   */
  openBudget(pending: boolean): void {
    const city = this.city;
    if (!city) return;
    const summary: BudgetSummary = pending && city.pendingBudget ? city.pendingBudget : assessBudget(city);
    if (pending) this.callbacks.onChime();

    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = pending ? `Budget — January ${summary.year}` : 'Budget (preview)';
    panel.appendChild(title);

    const flowEl = document.createElement('div');

    const addSlider = (
      label: string,
      value: number,
      max: number,
      format: (v: number) => string,
      onInput: (v: number) => void,
    ) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'modal-row';
      const name = document.createElement('span');
      name.textContent = label;
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(max);
      slider.value = String(value);
      const val = document.createElement('span');
      val.className = 'modal-value';
      val.textContent = format(value);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        onInput(v);
        val.textContent = format(v);
        renderFlow();
      });
      rowEl.append(name, slider, val);
      panel.appendChild(rowEl);
    };

    addSlider('Tax rate', city.taxRate, 20, (v) => `${v}%`, (v) => (city.taxRate = v));
    addSlider(
      `Police (§${Math.round(summary.policeMaint)})`,
      Math.round(city.funding.police * 100),
      100,
      (v) => `§${fundedCost(summary.policeMaint, v / 100)}`,
      (v) => (city.funding.police = v / 100),
    );
    addSlider(
      `Fire (§${Math.round(summary.fireMaint)})`,
      Math.round(city.funding.fire * 100),
      100,
      (v) => `§${fundedCost(summary.fireMaint, v / 100)}`,
      (v) => (city.funding.fire = v / 100),
    );
    addSlider(
      `Transit (§${Math.round(summary.transitMaint)})`,
      Math.round(city.funding.transit * 100),
      100,
      (v) => `§${fundedCost(summary.transitMaint, v / 100)}`,
      (v) => (city.funding.transit = v / 100),
    );

    const renderFlow = () => {
      // Re-price the year at the rate now on the slider: the player is setting
      // the rate this budget collects at, so a stale figure would misreport it.
      summary.taxIncome = taxIncome(city);
      const net = cashFlow(city, summary);
      const sign = net >= 0 ? '+' : '−';
      const ord = summary.ordinanceNet;
      flowEl.innerHTML = [
        row('Tax income', `§${summary.taxIncome.toLocaleString('en-US')}`),
        row('Ordinances', `${ord >= 0 ? '+' : '−'}§${Math.abs(ord).toLocaleString('en-US')}`),
        row('Cash flow', `${sign}§${Math.abs(net).toLocaleString('en-US')}`),
        row('Funds after', `§${(city.funds + (pending ? net : 0)).toLocaleString('en-US')}`),
      ].join('');
    };
    renderFlow();
    panel.appendChild(flowEl);

    const autoRow = document.createElement('label');
    autoRow.className = 'modal-row';
    const auto = document.createElement('input');
    auto.type = 'checkbox';
    auto.checked = city.autoBudget;
    auto.addEventListener('change', () => (city.autoBudget = auto.checked));
    const autoLabel = document.createElement('span');
    autoLabel.textContent = 'Auto-budget (settle each January without asking)';
    autoRow.append(auto, autoLabel);
    panel.appendChild(autoRow);

    const cont = document.createElement('button');
    cont.className = 'modal-continue';
    cont.textContent = pending ? 'Settle budget' : 'Close';
    cont.addEventListener('click', () => {
      if (pending && city.pendingBudget) applyBudget(city, city.pendingBudget);
      this.closeModal();
    });
    panel.appendChild(cont);

    this.openModal(panel);
  }

  /** Save/Load: autosave + 3 manual slots + JSON export/import. */
  openSaveLoad(): void {
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.innerHTML = '<div class="modal-title">Save / Load</div>';

    SLOT_KEYS.forEach((key, i) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'modal-row';
      const name = document.createElement('span');
      let stored: StoredSave | null = null;
      try {
        stored = JSON.parse(localStorage.getItem(key) ?? 'null') as StoredSave | null;
      } catch {
        stored = null;
      }
      name.textContent = `${SLOT_NAMES[i]}${stored ? ` — ${new Date(stored.savedAt).toLocaleString()}` : ' — empty'}`;
      rowEl.appendChild(name);
      if (i > 0) {
        const save = document.createElement('button');
        save.textContent = 'Save';
        save.addEventListener('click', () => {
          const ok = this.writeSlot(key);
          this.closeModal();
          // Only claim success if it actually wrote — otherwise writeSlot's own
          // failure message must stand.
          if (ok) this.setMessage(`Saved to ${SLOT_NAMES[i]}`);
        });
        rowEl.appendChild(save);
      }
      const load = document.createElement('button');
      load.textContent = 'Load';
      load.disabled = !stored;
      load.addEventListener('click', () => {
        if (!stored) return;
        const err = this.callbacks.onLoadCity(stored.data);
        this.closeModal();
        this.setMessage(err ?? `Loaded ${SLOT_NAMES[i]}`);
      });
      rowEl.appendChild(load);
      panel.appendChild(rowEl);
    });

    const fileRow = document.createElement('div');
    fileRow.className = 'modal-row';
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export JSON';
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([this.callbacks.serialize()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tilesburg-city.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.style.display = 'none';
    importInput.addEventListener('change', () => {
      const f = importInput.files?.[0];
      if (!f) return;
      void f.text().then((text) => {
        const err = this.callbacks.onLoadCity(text);
        this.closeModal();
        this.setMessage(err ?? 'City imported');
      });
    });
    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import JSON';
    importBtn.addEventListener('click', () => importInput.click());
    fileRow.append(exportBtn, importBtn, importInput);
    panel.appendChild(fileRow);

    const close = document.createElement('button');
    close.className = 'modal-continue';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.closeModal());
    panel.appendChild(close);
    this.openModal(panel);
  }

  /** Returns false (and reports) if the write failed. */
  private writeSlot(key: string): boolean {
    const stored: StoredSave = { savedAt: new Date().toISOString(), data: this.callbacks.serialize() };
    try {
      localStorage.setItem(key, JSON.stringify(stored));
      return true;
    } catch {
      this.setMessage('Save failed — storage is full');
      return false;
    }
  }

  /** Yearly autosave, called by the game loop. */
  autosave(): void {
    this.writeSlot(AUTOSAVE_KEY);
  }

  /** City ordinances: 10 toggles with their estimated annual § effect. */
  openOrdinances(): void {
    const city = this.city;
    if (!city) return;
    const panel = document.createElement('div');
    panel.className = 'modal-panel modal-wide';
    panel.innerHTML = '<div class="modal-title">City ordinances</div>';

    for (const o of ORDINANCES) {
      const rowEl = document.createElement('label');
      rowEl.className = 'ordinance-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!city.ordinances[o.id];
      box.addEventListener('change', () => (city.ordinances[o.id] = box.checked));
      const name = document.createElement('span');
      name.className = 'ordinance-name';
      name.textContent = o.name;
      const blurb = document.createElement('span');
      blurb.className = 'ordinance-blurb';
      blurb.textContent = o.blurb;
      const net = o.annualNet(city);
      const cost = document.createElement('span');
      cost.className = 'modal-value';
      cost.textContent = net >= 0 ? `+§${net}/yr` : `−§${-net}/yr`;
      rowEl.append(box, name, blurb, cost);
      panel.appendChild(rowEl);
    }

    const close = document.createElement('button');
    close.className = 'modal-continue';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.closeModal());
    panel.appendChild(close);
    this.openModal(panel);
  }

  /** Scenario briefing at start, and the win/lose verdicts. */
  showScenarioIntro(def: ScenarioDef): void {
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.innerHTML = [
      `<div class="modal-title">${def.name}</div>`,
      `<p class="modal-text">${def.description}</p>`,
      `<p class="modal-text"><strong>Goal:</strong> ${def.goal}</p>`,
      `<p class="modal-text"><strong>Time limit:</strong> ${def.timeLimitYears} years · <strong>Funds:</strong> §${def.funds.toLocaleString('en-US')}</p>`,
    ].join('');
    const go = document.createElement('button');
    go.className = 'modal-continue';
    go.textContent = 'Begin';
    go.addEventListener('click', () => this.closeModal());
    panel.appendChild(go);
    this.openModal(panel);
  }

  private showScenarioOutcome(won: boolean, def: ScenarioDef): void {
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.innerHTML = [
      `<div class="modal-title">${won ? 'Scenario won!' : 'Scenario lost'}</div>`,
      `<p class="modal-text">${
        won
          ? `${def.name}: you did it. ${def.goal}`
          : `${def.name}: time ran out. The city plays on in sandbox mode.`
      }</p>`,
    ].join('');
    const ok = document.createElement('button');
    ok.className = 'modal-continue';
    ok.textContent = 'Continue';
    ok.addEventListener('click', () => this.closeModal());
    panel.appendChild(ok);
    this.openModal(panel);
  }

  /** The disasters menu: manual triggers + the random-disasters toggle. */
  openDisasters(): void {
    const city = this.city;
    if (!city) return;
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.innerHTML = '<div class="modal-title">Disasters</div>';

    const entries: Array<[string, (c: City) => void]> = [
      ['Fire', triggerFire],
      ['Flood', triggerFlood],
      ['Tornado', triggerTornado],
      ['Earthquake', triggerEarthquake],
      ['Monster', triggerMonster],
      ['Plane crash', triggerPlaneCrash],
      [
        'Nuclear meltdown',
        (c) => {
          if (!triggerMeltdown(c)) this.setMessage('No nuclear plant to melt down');
        },
      ],
    ];
    const grid = document.createElement('div');
    grid.className = 'disaster-grid';
    for (const [name, fn] of entries) {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.addEventListener('click', () => {
        fn(city);
        this.closeModal();
      });
      grid.appendChild(btn);
    }
    panel.appendChild(grid);

    const randRow = document.createElement('label');
    randRow.className = 'modal-row';
    const rand = document.createElement('input');
    rand.type = 'checkbox';
    rand.checked = city.disastersEnabled;
    rand.addEventListener('change', () => (city.disastersEnabled = rand.checked));
    const randLabel = document.createElement('span');
    randLabel.textContent = 'Random disasters';
    randRow.append(rand, randLabel);
    panel.appendChild(randRow);

    const close = document.createElement('button');
    close.className = 'modal-continue';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.closeModal());
    panel.appendChild(close);
    this.openModal(panel);
  }

  openEvaluation(): void {
    const city = this.city;
    if (!city) return;
    const ev = evaluate(city);
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    const migration = ev.netMigration >= 0 ? `+${ev.netMigration}` : String(ev.netMigration);
    panel.innerHTML = [
      '<div class="modal-title">City evaluation</div>',
      row('Population', ev.population.toLocaleString('en-US')),
      row('City class', ev.cityClass),
      row('Net migration', migration),
      row('Assessed value', `§${ev.assessedValue.toLocaleString('en-US')}`),
      row('Mayor approval', `${ev.approval}%`),
      '<div class="modal-subtitle">Top complaints</div>',
      ev.complaints.length
        ? ev.complaints.map((c) => row(c.name, `${c.score}`)).join('')
        : '<div class="query-row"><span>No significant complaints</span></div>',
    ].join('');
    const close = document.createElement('button');
    close.className = 'modal-continue';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.closeModal());
    panel.appendChild(close);
    this.openModal(panel);
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
      // A modal blocks the world: it pauses the sim and owns the screen, so
      // tools, speed and cheats must not be reachable behind it. Otherwise the
      // clock runs behind a "blocking" window and the speed the player picked
      // is thrown away when the modal closes.
      if (this.modalOpen) return;
      if (this.feedCheat(key)) return;
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
        case 'g':
          if (!this.modalOpen) this.openBudget(false);
          break;
        case 'e':
          if (!this.modalOpen) this.openEvaluation();
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

  /**
   * Cheat codes, entered by simply typing them. `fund` wires §10,000 to the
   * treasury (repeat to taste). Typing walks through tool hotkeys on the way
   * (F, N…), so the tool from before the first cheat letter is restored on a
   * match. Returns true when the key completed a cheat.
   */
  private feedCheat(key: string): boolean {
    const CHEAT = 'fund';
    if (!/^[a-z]$/.test(key)) {
      this.cheatBuffer.length = 0;
      return false;
    }
    this.cheatBuffer.push({ key, tool: this.tool });
    if (this.cheatBuffer.length > CHEAT.length) this.cheatBuffer.shift();
    if (this.cheatBuffer.map((e) => e.key).join('') !== CHEAT) return false;
    const toolBefore = this.cheatBuffer[0].tool;
    this.cheatBuffer.length = 0;
    if (!this.city) return false;
    this.city.funds += 10000;
    this.selectTool(toolBefore);
    this.setMessage('§10,000 in mysterious federal grants has arrived');
    this.callbacks.onChime();
    return true;
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
    if (this.city !== city) this.outcomeShown = false; // new game
    this.city = city;
    this.fundsEl.textContent = `§${city.funds.toLocaleString('en-US')}`;
    const d = getDate(city);
    this.dateEl.textContent = `${MONTHS[d.month]} ${d.year}`;
    this.updateRci(city);
    // Drain sim events into the message ticker; urgent ones sound the alarm.
    while (city.messages.length > 0) {
      const msg = city.messages.shift() as string;
      this.setMessage(msg);
      if (msg.includes('!')) this.callbacks.onAlarm();
    }
    // The sim posted a January budget for review.
    if (city.pendingBudget && !this.modalOpen) this.openBudget(true);
    // Scenario verdicts.
    if (city.scenario && city.scenario.outcome !== 'open' && !this.outcomeShown && !this.modalOpen) {
      const def = SCENARIOS.find((s) => s.id === city.scenario?.id);
      if (def) {
        this.outcomeShown = true;
        this.showScenarioOutcome(city.scenario.outcome === 'won', def);
      }
    }
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
