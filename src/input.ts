import type { Camera } from './render/camera';
import type { City } from './sim/city';
import { applyTool, applyToolLine, TOOL_INFO, type ToolId } from './sim/tools';

export interface InputOptions {
  canvas: HTMLCanvasElement;
  camera: Camera;
  getCity: () => City;
  getTool: () => ToolId | null;
  /** Called with the running drag cost (null when the drag ends). */
  onDragCost: (cost: number | null, sx: number, sy: number) => void;
  /** Called when a tool application fails with a reason. */
  onToolError: (reason: string) => void;
  /** Query-tool click on a tile (screen coords are page-relative). */
  onQuery: (x: number, y: number, pageX: number, pageY: number) => void;
  /** Any other interaction — dismisses a query popup. */
  onDismiss: () => void;
}

/**
 * Pointer + wheel input on the map canvas.
 * - Left drag with a tool: paint tiles along the pointer path (Bresenham
 *   between successive cells so fast moves leave no gaps), immediate
 *   placement like the original, with a running cost readout.
 * - Left drag in pan mode, or middle/right drag any time: pan the camera.
 * - Wheel: zoom anchored at the cursor. Arrow keys: pan.
 */
export function setupInput(opts: InputOptions): void {
  const { canvas, camera } = opts;

  let toolDrag = false;
  let panDrag = false;
  let dragCost = 0;
  let lastCell: { x: number; y: number } | null = null;
  let lastPointer = { x: 0, y: 0 };

  const cellAt = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return camera.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
  };

  const localPos = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    lastPointer = { x: e.clientX, y: e.clientY };
    const tool = opts.getTool();
    if (e.button === 0 && tool === 'query') {
      const cell = cellAt(e);
      opts.onQuery(cell.x, cell.y, e.clientX, e.clientY);
      return;
    }
    opts.onDismiss();
    if (e.button === 0 && tool !== null) {
      // Building tools place once per click; drag tools paint along the path.
      toolDrag = TOOL_INFO[tool].drag;
      dragCost = 0;
      const cell = cellAt(e);
      lastCell = cell;
      const r = applyTool(opts.getCity(), tool, cell.x, cell.y);
      if (r.ok) dragCost += r.cost;
      else if (r.reason) opts.onToolError(r.reason);
      const p = localPos(e);
      opts.onDragCost(dragCost, p.x, p.y);
    } else if (e.button === 0 || e.button === 1 || e.button === 2) {
      panDrag = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    lastPointer = { x: e.clientX, y: e.clientY };

    if (panDrag) {
      camera.pan(dx, dy);
      return;
    }
    if (!toolDrag) return;
    const tool = opts.getTool();
    if (tool === null || lastCell === null) return;
    const cell = cellAt(e);
    if (cell.x === lastCell.x && cell.y === lastCell.y) return;
    const r = applyToolLine(opts.getCity(), tool, lastCell.x, lastCell.y, cell.x, cell.y);
    dragCost += r.cost;
    if (r.reason) opts.onToolError(r.reason);
    lastCell = cell;
    const p = localPos(e);
    opts.onDragCost(dragCost, p.x, p.y);
  });

  const endDrag = () => {
    toolDrag = false;
    panDrag = false;
    lastCell = null;
    opts.onDragCost(null, 0, 0);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    },
    { passive: false },
  );

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const PAN_STEP = 48;
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    switch (e.key) {
      case 'ArrowUp':
        camera.pan(0, PAN_STEP);
        break;
      case 'ArrowDown':
        camera.pan(0, -PAN_STEP);
        break;
      case 'ArrowLeft':
        camera.pan(PAN_STEP, 0);
        break;
      case 'ArrowRight':
        camera.pan(-PAN_STEP, 0);
        break;
      case '+':
      case '=':
        camera.zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.15);
        break;
      case '-':
        camera.zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / 1.15);
        break;
    }
  });
}
