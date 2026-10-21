const GRID_SIZE = 32;
const BOARD_WIDTH = 28;
const BOARD_HEIGHT = 18;

const LAYER_ORDER = ['base', 'decor', 'trigger'];

const OBJECT_TYPES = {
  floor: { label: 'Floor', color: '#7db4ff', solid: true },
  wall: { label: 'Wall', color: '#9aa7ba', solid: true },
  start: { label: 'Start', color: '#48d18d', solid: false },
  finish: { label: 'Finish', color: '#ffd76f', solid: false },
  hazard: { label: 'Hazard', color: '#ff7f7f', solid: false },
  boost: { label: 'Boost', color: '#68d8ff', solid: false },
  checkpoint: { label: 'Checkpoint', color: '#dca6ff', solid: false },
  gem: { label: 'Gem', color: '#ffde59', solid: false },
  teleporter: { label: 'Teleporter', color: '#7ef0d6', solid: false },
  erase: { label: 'Erase', color: '#ff8f8f', solid: false },
};

const state = {
  selectedTool: 'floor',
  selectedLayer: 'base',
  selectedObjectId: null,
  objects: [],
  nextId: 1,
  preview: false,
  previewBall: null,
};

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const toolButtonsEl = document.getElementById('tool-buttons');
const layerButtonsEl = document.getElementById('layer-buttons');
const inspectorEl = document.getElementById('inspector-content');
const levelJsonEl = document.getElementById('level-json');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createObject(type, layer, x, y, w = 1, h = 1, extra = {}) {
  const baseType = OBJECT_TYPES[type] || { color: '#ffffff' };
  return {
    id: state.nextId++,
    type,
    layer,
    x: clamp(x, 0, BOARD_WIDTH),
    y: clamp(y, 0, BOARD_HEIGHT),
    w: Math.max(1, w || 1),
    h: Math.max(1, h || 1),
    rotation: 0,
    solid: Boolean(baseType.solid),
    params: {},
    ...extra,
  };
}

function getDefaultLevelData() {
  state.nextId = 1;

  const start = createObject('start', 'base', 2, 13, 1, 1);
  const finish = createObject('finish', 'base', 22, 3, 1, 1);
  const floorTop = createObject('floor', 'base', 0, 15, 28, 3);
  const floorA = createObject('floor', 'base', 6, 11, 6, 1);
  const floorB = createObject('floor', 'base', 15, 8, 4, 1);
  const wallA = createObject('wall', 'base', 11, 7, 1, 4);
  const boostA = createObject('boost', 'base', 8, 9, 1, 1);
  const hazardA = createObject('hazard', 'base', 18, 13, 3, 1);
  const gemA = createObject('gem', 'decor', 6, 10, 1, 1);
  const gemB = createObject('gem', 'decor', 16, 7, 1, 1);
  const checkpoint = createObject('checkpoint', 'trigger', 13, 6, 1, 1);
  const teleporterA = createObject('teleporter', 'trigger', 10, 13, 1, 1, { targetId: null });
  const teleporterB = createObject('teleporter', 'trigger', 22, 5, 1, 1, { targetId: null, targetName: 'A' });

  teleporterA.params = { targetId: teleporterB.id, targetLabel: 'B' };
  teleporterB.params = { targetId: teleporterA.id, targetLabel: 'A' };

  return [start, finish, floorTop, floorA, floorB, wallA, boostA, hazardA, gemA, gemB, checkpoint, teleporterA, teleporterB];
}

function setSelectedObject(id) {
  state.selectedObjectId = id;
  renderInspector();
}

function getSelectedObject() {
  return state.objects.find((obj) => obj.id === state.selectedObjectId) || null;
}

function renderToolButtons() {
  const tools = ['select', 'erase', 'floor', 'wall', 'start', 'finish', 'hazard', 'boost', 'checkpoint', 'gem', 'teleporter'];
  toolButtonsEl.innerHTML = tools
    .map((tool) => {
      const meta = tool === 'select' ? { label: 'Select', color: '#eaf6ff' } : OBJECT_TYPES[tool] || { label: tool, color: '#ffffff' };
      const active = state.selectedTool === tool ? 'active' : '';
      return `
        <button class="tool-button ${active}" data-tool="${tool}" type="button">
          <span class="swatch" style="background:${meta.color};"></span>
          ${meta.label}
        </button>
      `;
    })
    .join('');

  toolButtonsEl.querySelectorAll('.tool-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedTool = button.dataset.tool;
      if (state.selectedTool === 'select') {
        state.selectedObjectId = null;
      }
      renderToolButtons();
      renderInspector();
      renderCanvas();
    });
  });
}

function renderLayerButtons() {
  layerButtonsEl.innerHTML = LAYER_ORDER.map((layer) => {
    const active = state.selectedLayer === layer ? 'active' : '';
    return `<button class="layer-button ${active}" data-layer="${layer}" type="button">${layer}</button>`;
  }).join('');

  layerButtonsEl.querySelectorAll('.layer-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedLayer = button.dataset.layer;
      renderLayerButtons();
    });
  });
}

function renderInspector() {
  const selected = getSelectedObject();
  if (!selected) {
    inspectorEl.innerHTML = '<p class="empty-state">Select an object to edit it here. Add objects from the palette and choose a layer to build a multi-layer Marble Blast level.</p>';
    return;
  }

  const teleporterOptions = state.objects
    .filter((obj) => obj.type === 'teleporter' && obj.id !== selected.id)
    .map((obj) => `<option value="${obj.id}" ${String(selected.params?.targetId ?? '') === String(obj.id) ? 'selected' : ''}>#${obj.id}</option>`)
    .join('');

  inspectorEl.innerHTML = `
    <div class="property-list">
      <div class="control-group">
        <label>Type</label>
        <input value="${selected.type}" readonly />
      </div>

      <div class="control-group">
        <label>Layer</label>
        <select id="prop-layer">
          ${LAYER_ORDER.map((layer) => `<option value="${layer}" ${selected.layer === layer ? 'selected' : ''}>${layer}</option>`).join('')}
        </select>
      </div>

      <div class="small-row">
        <div class="control-group">
          <label>X</label>
          <input id="prop-x" type="number" min="0" max="${BOARD_WIDTH}" step="1" value="${selected.x}" />
        </div>
        <div class="control-group">
          <label>Y</label>
          <input id="prop-y" type="number" min="0" max="${BOARD_HEIGHT}" step="1" value="${selected.y}" />
        </div>
      </div>

      <div class="small-row">
        <div class="control-group">
          <label>W</label>
          <input id="prop-w" type="number" min="1" max="${BOARD_WIDTH}" step="1" value="${selected.w}" />
        </div>
        <div class="control-group">
          <label>H</label>
          <input id="prop-h" type="number" min="1" max="${BOARD_HEIGHT}" step="1" value="${selected.h}" />
        </div>
      </div>

      <div class="control-group">
        <label>Rotation</label>
        <input id="prop-rotation" type="number" min="0" max="360" step="15" value="${selected.rotation || 0}" />
      </div>

      ${selected.type === 'teleporter' ? `
        <div class="control-group">
          <label>Target teleporter</label>
          <select id="prop-target-id">
            <option value="">None</option>
            ${teleporterOptions}
          </select>
        </div>
      ` : ''}

      ${selected.type === 'gem' ? `
        <div class="control-group">
          <label>Gem value</label>
          <input id="prop-gem-value" type="number" min="1" max="20" step="1" value="${selected.params?.gemValue ?? 1}" />
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('prop-layer')?.addEventListener('change', (event) => {
    const obj = getSelectedObject();
    if (!obj) return;
    obj.layer = event.target.value;
    renderCanvas();
  });

  ['x', 'y', 'w', 'h', 'rotation'].forEach((field) => {
    const input = document.getElementById(`prop-${field}`);
    if (!input) return;
    input.addEventListener('input', (event) => {
      const obj = getSelectedObject();
      if (!obj) return;
      const value = Number(event.target.value);
      if (Number.isNaN(value)) return;

      if (field === 'x') obj.x = clamp(value, 0, BOARD_WIDTH);
      if (field === 'y') obj.y = clamp(value, 0, BOARD_HEIGHT);
      if (field === 'w') obj.w = clamp(value, 1, BOARD_WIDTH);
      if (field === 'h') obj.h = clamp(value, 1, BOARD_HEIGHT);
      if (field === 'rotation') obj.rotation = clamp(value, 0, 360);

      renderCanvas();
    });
  });

  const targetInput = document.getElementById('prop-target-id');
  if (targetInput) {
    targetInput.addEventListener('change', (event) => {
      const obj = getSelectedObject();
      if (!obj) return;
      const raw = event.target.value;
      obj.params = obj.params || {};
      obj.params.targetId = raw ? Number(raw) : null;
      renderCanvas();
    });
  }

  const gemValueInput = document.getElementById('prop-gem-value');
  if (gemValueInput) {
    gemValueInput.addEventListener('input', (event) => {
      const obj = getSelectedObject();
      if (!obj) return;
      const value = Number(event.target.value);
      obj.params = obj.params || {};
      obj.params.gemValue = clamp(value || 1, 1, 20);
      renderCanvas();
    });
  }
}

function findObjectAtCell(cellX, cellY) {
  const candidates = [...state.objects].reverse();
  return candidates.find((obj) => {
    const left = obj.x;
    const top = obj.y;
    const right = obj.x + obj.w;
    const bottom = obj.y + obj.h;
    return cellX >= left && cellX < right && cellY >= top && cellY < bottom;
  }) || null;
}

function placeObjectAtCell(cellX, cellY) {
  const tool = state.selectedTool;
  if (tool === 'select' || tool === 'erase') return;

  const object = createObject(tool, state.selectedLayer, cellX, cellY, 1, 1);

  if (tool === 'gem') {
    object.params.gemValue = 1;
  }

  state.objects.push(object);
  state.selectedObjectId = object.id;
  renderInspector();
  renderCanvas();
}

function deleteSelectedObject() {
  if (!state.selectedObjectId) return;
  state.objects = state.objects.filter((obj) => obj.id !== state.selectedObjectId);
  state.selectedObjectId = null;
  renderInspector();
  renderCanvas();
}

function getCellFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return {
    cellX: Math.floor(x / GRID_SIZE),
    cellY: Math.floor(y / GRID_SIZE),
  };
}

function handleCanvasPointerDown(event) {
  const { cellX, cellY } = getCellFromPointer(event);

  if (state.selectedTool === 'erase') {
    const hit = findObjectAtCell(cellX, cellY);
    if (hit) {
      state.objects = state.objects.filter((obj) => obj.id !== hit.id);
      if (state.selectedObjectId === hit.id) {
        state.selectedObjectId = null;
      }
      renderInspector();
      renderCanvas();
    }
    return;
  }

  if (state.selectedTool === 'select') {
    const hit = findObjectAtCell(cellX, cellY);
    state.selectedObjectId = hit ? hit.id : null;
    renderInspector();
    renderCanvas();
    return;
  }

  const hit = findObjectAtCell(cellX, cellY);
  if (hit) {
    state.selectedObjectId = hit.id;
    renderInspector();
    renderCanvas();
    return;
  }

  placeObjectAtCell(cellX, cellY);
}

function getObjectColor(obj) {
  const meta = OBJECT_TYPES[obj.type] || { color: '#ffffff' };
  return meta.color;
}

function drawObject(obj) {
  const px = obj.x * GRID_SIZE;
  const py = obj.y * GRID_SIZE;
  const pw = obj.w * GRID_SIZE;
  const ph = obj.h * GRID_SIZE;

  ctx.save();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate((obj.rotation * Math.PI) / 180);
  ctx.translate(-(px + pw / 2), -(py + ph / 2));

  const color = getObjectColor(obj);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;

  if (obj.type === 'floor' || obj.type === 'wall') {
    ctx.fillRect(px, py, pw, ph);
  } else if (obj.type === 'start') {
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, Math.min(pw, ph) / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (obj.type === 'finish') {
    ctx.fillRect(px + 4, py + 4, pw - 8, ph - 8);
  } else if (obj.type === 'hazard') {
    ctx.beginPath();
    ctx.moveTo(px, py + ph);
    ctx.lineTo(px + 8, py + 4);
    ctx.lineTo(px + 16, py + ph);
    ctx.lineTo(px + 24, py + 4);
    ctx.lineTo(px + 32, py + ph);
    ctx.closePath();
    ctx.fill();
  } else if (obj.type === 'boost') {
    ctx.beginPath();
    ctx.moveTo(px + 3, py + ph - 3);
    ctx.lineTo(px + pw - 3, py + ph / 2);
    ctx.lineTo(px + 3, py + 3);
    ctx.closePath();
    ctx.fill();
  } else if (obj.type === 'checkpoint') {
    ctx.fillRect(px + 7, py + 2, pw - 14, ph - 4);
    ctx.fillStyle = '#0d141c';
    ctx.fillRect(px + 12, py + 7, pw - 24, ph - 14);
  } else if (obj.type === 'gem') {
    ctx.beginPath();
    ctx.moveTo(px + pw / 2, py);
    ctx.lineTo(px + pw, py + ph / 2);
    ctx.lineTo(px + pw / 2, py + ph);
    ctx.lineTo(px, py + ph / 2);
    ctx.closePath();
    ctx.fill();
  } else if (obj.type === 'teleporter') {
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, Math.min(pw, ph) / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b161d';
    ctx.fillRect(px + 6, py + 10, pw - 12, ph - 20);
  }

  ctx.restore();

  if (obj.type === 'teleporter' && obj.params?.targetId) {
    const target = state.objects.find((item) => item.id === obj.params.targetId);
    if (target) {
      ctx.beginPath();
      ctx.strokeStyle = '#7ef0d6';
      ctx.lineWidth = 2;
      ctx.moveTo((obj.x + obj.w / 2) * GRID_SIZE, (obj.y + obj.h / 2) * GRID_SIZE);
      ctx.lineTo((target.x + target.w / 2) * GRID_SIZE, (target.y + target.h / 2) * GRID_SIZE);
      ctx.stroke();
    }
  }

  if (state.selectedObjectId === obj.id) {
    ctx.strokeStyle = '#fff4a4';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 2, py - 2, pw + 4, ph + 4);
  }
}

function renderGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;

  for (let x = 0; x <= BOARD_WIDTH; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * GRID_SIZE + 0.5, 0);
    ctx.lineTo(x * GRID_SIZE + 0.5, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= BOARD_HEIGHT; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * GRID_SIZE + 0.5);
    ctx.lineTo(canvas.width, y * GRID_SIZE + 0.5);
    ctx.stroke();
  }
}

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b161d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  renderGrid();

  state.objects
    .filter((obj) => obj.layer === state.selectedLayer || obj.layer !== 'trigger')
    .forEach(drawObject);

  if (state.preview && state.previewBall) {
    ctx.fillStyle = '#f5f0d0';
    ctx.beginPath();
    ctx.arc(state.previewBall.x, state.previewBall.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function resetPreview() {
  const start = state.objects.find((obj) => obj.type === 'start');
  state.previewBall = {
    x: (start ? start.x + 0.5 : 2) * GRID_SIZE,
    y: (start ? start.y + 0.5 : 2) * GRID_SIZE,
    vx: 1.4,
    vy: 0,
  };
}

function previewStep() {
  if (!state.preview || !state.previewBall) return;

  const ball = state.previewBall;
  ball.vy += 0.4;
  ball.x += ball.vx;
  ball.y += ball.vy;

  const bounds = {
    left: 0,
    top: 0,
    right: canvas.width,
    bottom: canvas.height,
  };

  if (ball.x < 12 || ball.x > bounds.right - 12) ball.vx *= -0.7;
  if (ball.y < 12) ball.vy *= -0.7;
  if (ball.y > bounds.bottom + 40) resetPreview();

  for (const obj of state.objects) {
    if (obj.type === 'floor' || obj.type === 'wall') {
      const rect = {
        x: obj.x * GRID_SIZE,
        y: obj.y * GRID_SIZE,
        w: obj.w * GRID_SIZE,
        h: obj.h * GRID_SIZE,
      };
      const ballRect = { x: ball.x - 12, y: ball.y - 12, w: 24, h: 24 };
      if (ballRect.x < rect.x + rect.w && ballRect.x + ballRect.w > rect.x && ballRect.y < rect.y + rect.h && ballRect.y + ballRect.h > rect.y) {
        if (ball.y + 12 >= rect.y && ball.y - 12 < rect.y + rect.h) {
          ball.vy *= -0.48;
          ball.y = rect.y - 12;
        }
        if (ball.x + 12 >= rect.x && ball.x - 12 < rect.x + rect.w) {
          ball.vx *= -0.47;
          ball.x = rect.x - 12;
        }
      }
    }
  }

  renderCanvas();
  requestAnimationFrame(previewStep);
}

function togglePreview() {
  state.preview = !state.preview;
  const button = document.getElementById('preview-toggle');
  button.textContent = state.preview ? 'Stop Preview' : 'Preview';
  if (state.preview) {
    resetPreview();
    requestAnimationFrame(previewStep);
  }
}

function exportLevel() {
  const payload = {
    version: 1,
    name: 'Marble Blast Level',
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    theme: 'forest',
    gravity: 1,
    layers: LAYER_ORDER,
    objects: state.objects.map((obj) => ({
      id: obj.id,
      type: obj.type,
      layer: obj.layer,
      x: obj.x,
      y: obj.y,
      w: obj.w,
      h: obj.h,
      rotation: obj.rotation || 0,
      solid: obj.solid,
      params: obj.params || {},
    })),
    start: state.objects.find((obj) => obj.type === 'start') ? {
      x: state.objects.find((obj) => obj.type === 'start').x,
      y: state.objects.find((obj) => obj.type === 'start').y,
    } : null,
    finish: state.objects.find((obj) => obj.type === 'finish') ? {
      x: state.objects.find((obj) => obj.type === 'finish').x,
      y: state.objects.find((obj) => obj.type === 'finish').y,
    } : null,
  };

  const json = JSON.stringify(payload, null, 2);
  levelJsonEl.value = json;

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'marble-blast-level.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importLevel() {
  try {
    const text = levelJsonEl.value.trim();
    if (!text) throw new Error('No JSON supplied.');
    const parsed = JSON.parse(text);
    const rawObjects = Array.isArray(parsed.objects) ? parsed.objects : Array.isArray(parsed) ? parsed : [];

    state.objects = rawObjects.map((obj) => {
      const normalized = createObject(obj.type || 'floor', obj.layer || 'base', obj.x || 0, obj.y || 0, obj.w || 1, obj.h || 1, {
        rotation: obj.rotation || 0,
        params: obj.params || {},
      });
      normalized.solid = Boolean(obj.solid ?? (obj.type === 'floor' || obj.type === 'wall'));
      normalized.params = obj.params || {};
      return normalized;
    });

    state.selectedObjectId = null;
    renderInspector();
    renderCanvas();
  } catch (error) {
    alert(`Failed to import: ${error.message}`);
  }
}

function createNewLevel() {
  state.objects = getDefaultLevelData();
  state.selectedObjectId = null;
  renderInspector();
  renderCanvas();
}

function fitCanvas() {
  renderCanvas();
}

function bindEvents() {
  document.getElementById('new-level').addEventListener('click', createNewLevel);
  document.getElementById('export-json').addEventListener('click', exportLevel);
  document.getElementById('import-json').addEventListener('click', importLevel);
  document.getElementById('preview-toggle').addEventListener('click', togglePreview);
  document.getElementById('delete-selected').addEventListener('click', deleteSelectedObject);
  document.getElementById('fit-canvas').addEventListener('click', fitCanvas);
  canvas.addEventListener('pointerdown', handleCanvasPointerDown);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      deleteSelectedObject();
    }
  });
}

function init() {
  state.objects = getDefaultLevelData();
  renderToolButtons();
  renderLayerButtons();
  renderInspector();
  renderCanvas();
  bindEvents();
}

init();
