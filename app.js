const GRID_SIZE = 32;
const BOARD_WIDTH = 28;
const BOARD_HEIGHT = 18;
const LAYER_ORDER = ['base', 'decor', 'trigger'];

const OBJECT_TYPES = {
  floor: { label: 'Floor', color: '#7db4ff', solid: true, height: 10 },
  wall: { label: 'Wall', color: '#9aa7ba', solid: true, height: 18 },
  start: { label: 'Start', color: '#48d18d', solid: false, height: 12 },
  finish: { label: 'Finish', color: '#ffd76f', solid: false, height: 12 },
  hazard: { label: 'Hazard', color: '#ff7f7f', solid: false, height: 12 },
  boost: { label: 'Boost', color: '#68d8ff', solid: false, height: 12 },
  checkpoint: { label: 'Checkpoint', color: '#dca6ff', solid: false, height: 12 },
  gem: { label: 'Gem', color: '#ffde59', solid: false, height: 12 },
  teleporter: { label: 'Teleporter', color: '#7ef0d6', solid: false, height: 12 },
  erase: { label: 'Erase', color: '#ff8f8f', solid: false, height: 12 },
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
const levelTextEl = document.getElementById('level-text');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createObject(type, layer, x, y, w = 1, h = 1, extra = {}) {
  const baseType = OBJECT_TYPES[type] || { color: '#ffffff', height: 12 };
  return {
    id: state.nextId++,
    name: `${type}_${state.nextId}`,
    type,
    layer,
    x: clamp(x, 0, BOARD_WIDTH),
    y: clamp(y, 0, BOARD_HEIGHT),
    w: Math.max(1, w || 1),
    h: Math.max(1, h || 1),
    rotation: 0,
    solid: Boolean(baseType.solid),
    params: {},
    height: baseType.height || 12,
    ...extra,
  };
}

function getDefaultLevelData() {
  state.nextId = 1;

  const start = createObject('start', 'base', 2, 13, 1, 1, { name: 'StartPoint' });
  const finish = createObject('finish', 'base', 22, 3, 1, 1, { name: 'FinishPad' });
  const floorTop = createObject('floor', 'base', 0, 15, 28, 3, { name: 'Floor_1' });
  const floorA = createObject('floor', 'base', 6, 11, 6, 1, { name: 'Floor_2' });
  const floorB = createObject('floor', 'base', 15, 8, 4, 1, { name: 'Floor_3' });
  const wallA = createObject('wall', 'base', 11, 7, 1, 4, { name: 'Wall_1' });
  const boostA = createObject('boost', 'base', 8, 9, 1, 1, { name: 'Boost_1', params: { value: 10 } });
  const hazardA = createObject('hazard', 'base', 18, 13, 3, 1, { name: 'Hazard_1' });
  const gemA = createObject('gem', 'decor', 6, 10, 1, 1, { name: 'Gem_1', params: { value: 10 } });
  const gemB = createObject('gem', 'decor', 16, 7, 1, 1, { name: 'Gem_2', params: { value: 10 } });
  const checkpoint = createObject('checkpoint', 'trigger', 13, 6, 1, 1, { name: 'Checkpoint_1' });

  const teleporterA = createObject('teleporter', 'trigger', 10, 13, 1, 1, {
    name: 'Teleport_01',
    params: { targetId: null, targetName: 'Teleport_02' },
  });
  const teleporterB = createObject('teleporter', 'trigger', 22, 5, 1, 1, {
    name: 'Teleport_02',
    params: { targetId: null, targetName: 'Teleport_01' },
  });

  teleporterA.params.targetId = teleporterB.id;
  teleporterB.params.targetId = teleporterA.id;

  return [start, finish, floorTop, floorA, floorB, wallA, boostA, hazardA, gemA, gemB, checkpoint, teleporterA, teleporterB];
}

function setSelectedObject(id) {
  state.selectedObjectId = id;
  renderInspector();
}

function getSelectedObject() {
  return state.objects.find((obj) => obj.id === state.selectedObjectId) || null;
}

function projectWorld(x, z, y = 0) {
  const scaleX = 28;
  const scaleY = 16;
  const originX = canvas.width * 0.56;
  const originY = canvas.height * 0.72;

  return {
    x: (x - z) * scaleX + originX,
    y: (x + z) * scaleY - y * 18 + originY,
  };
}

function worldToBoardCell(x, y) {
  const scaleX = 28;
  const scaleY = 16;
  const originX = canvas.width * 0.56;
  const originY = canvas.height * 0.72;
  const u = (x - originX) / scaleX;
  const v = (y - originY) / scaleY;
  const cellX = Math.round((u + v) / 2);
  const cellY = Math.round((v - u) / 2);
  return {
    cellX: clamp(cellX, 0, BOARD_WIDTH),
    cellY: clamp(cellY, 0, BOARD_HEIGHT),
  };
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
      renderCanvas();
    });
  });
}

function renderInspector() {
  const selected = getSelectedObject();
  if (!selected) {
    inspectorEl.innerHTML = '<p class="empty-state">Select an object to edit it here. Add objects from the palette and choose a layer to build a Marble Blast mission.</p>';
    return;
  }

  const teleporterOptions = state.objects
    .filter((obj) => obj.type === 'teleporter' && obj.id !== selected.id)
    .map((obj) => `<option value="${obj.id}" ${String(selected.params?.targetId ?? '') === String(obj.id) ? 'selected' : ''}>${obj.name}</option>`)
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

      ${(selected.type === 'gem' || selected.type === 'boost') ? `
        <div class="control-group">
          <label>Value</label>
          <input id="prop-value" type="number" min="1" max="100" step="1" value="${selected.params?.value ?? 10}" />
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

  const valueInput = document.getElementById('prop-value');
  if (valueInput) {
    valueInput.addEventListener('input', (event) => {
      const obj = getSelectedObject();
      if (!obj) return;
      const value = Number(event.target.value);
      obj.params = obj.params || {};
      obj.params.value = clamp(value || 1, 1, 100);
      renderCanvas();
    });
  }
}

function getCellFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const board = worldToBoardCell(x, y);
  return {
    cellX: board.cellX,
    cellY: board.cellY,
  };
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

  const object = createObject(tool, state.selectedLayer, cellX, cellY, 1, 1, {
    name: `${tool}_${state.nextId}`,
  });

  if (tool === 'gem' || tool === 'boost') {
    object.params.value = 10;
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

function handleCanvasPointerDown(event) {
  const { cellX, cellY } = getCellFromPointer(event);

  if (state.selectedTool === 'erase') {
    const hit = findObjectAtCell(cellX, cellY);
    if (hit) {
      state.objects = state.objects.filter((obj) => obj.id !== hit.id);
      if (state.selectedObjectId === hit.id) state.selectedObjectId = null;
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

function drawBox(x, z, w, d, h, fill, stroke = 'rgba(0,0,0,0.35)') {
  const p00 = projectWorld(x, z, 0);
  const p10 = projectWorld(x + w, z, 0);
  const p01 = projectWorld(x, z + d, 0);
  const p11 = projectWorld(x + w, z + d, 0);

  const t00 = projectWorld(x, z, h);
  const t10 = projectWorld(x + w, z, h);
  const t01 = projectWorld(x, z + d, h);
  const t11 = projectWorld(x + w, z + d, h);

  ctx.beginPath();
  ctx.moveTo(t00.x, t00.y);
  ctx.lineTo(t10.x, t10.y);
  ctx.lineTo(t11.x, t11.y);
  ctx.lineTo(t01.x, t01.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(p00.x, p00.y);
  ctx.lineTo(p10.x, p10.y);
  ctx.lineTo(t10.x, t10.y);
  ctx.lineTo(t00.x, t00.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(p00.x, p00.y);
  ctx.lineTo(p01.x, p01.y);
  ctx.lineTo(t01.x, t01.y);
  ctx.lineTo(t00.x, t00.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawDiamond(x, z, w, d, h, fill) {
  const center = projectWorld(x + w / 2, z + d / 2, h);
  const top = projectWorld(x + w / 2, z + d / 2, h + 18);
  const left = projectWorld(x + w / 2 - 0.5, z + d / 2, h);
  const right = projectWorld(x + w / 2 + 0.5, z + d / 2, h);
  const front = projectWorld(x + w / 2, z + d / 2 + 0.8, h);
  const back = projectWorld(x + w / 2, z + d / 2 - 0.8, h);

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(center.x, center.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(front.x, front.y);
  ctx.lineTo(center.x, center.y);
  ctx.lineTo(back.x, back.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawMarker(x, z, r, color) {
  const p = projectWorld(x + 0.5, z + 0.5, 0);
  ctx.beginPath();
  ctx.arc(p.x, p.y - 8, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function getObjectColor(obj) {
  return (OBJECT_TYPES[obj.type] || { color: '#ffffff' }).color;
}

function getObjectHeight(obj) {
  const meta = OBJECT_TYPES[obj.type] || { height: 12 };
  return meta.height || 12;
}

function drawObject(obj) {
  const x = obj.x;
  const z = obj.y;
  const w = obj.w;
  const d = obj.h;
  const color = getObjectColor(obj);
  const height = getObjectHeight(obj);

  if (obj.type === 'floor' || obj.type === 'wall') {
    drawBox(x, z, w, d, height, color);
  } else if (obj.type === 'start') {
    drawBox(x, z, w, d, 10, color);
    drawMarker(x, z, 10, '#c5ffd6');
  } else if (obj.type === 'finish') {
    drawBox(x, z, w, d, 12, color);
    drawMarker(x, z, 9, '#fff2b4');
  } else if (obj.type === 'hazard') {
    drawBox(x, z, w, d, 8, color);
    drawMarker(x, z, 8, '#ffd0d0');
  } else if (obj.type === 'boost') {
    drawBox(x, z, w, d, 10, color);
    drawMarker(x, z, 8, '#d8f6ff');
  } else if (obj.type === 'checkpoint') {
    drawBox(x, z, w, d, 10, color);
  } else if (obj.type === 'gem') {
    drawDiamond(x, z, w, d, 0, color);
  } else if (obj.type === 'teleporter') {
    drawBox(x, z, w, d, 10, color);
    const p = projectWorld(x + w / 2, z + d / 2, 14);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#0b161d';
    ctx.fill();
  }

  if (obj.type === 'teleporter' && obj.params?.targetId != null) {
    const target = state.objects.find((item) => item.id === Number(obj.params.targetId));
    if (target) {
      const a = projectWorld(obj.x + obj.w / 2, obj.y + obj.h / 2, 12);
      const b = projectWorld(target.x + target.w / 2, target.y + target.h / 2, 12);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#7ef0d6';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  if (state.selectedObjectId === obj.id) {
    const top = projectWorld(obj.x, obj.y, getObjectHeight(obj) + 2);
    const topR = projectWorld(obj.x + obj.w, obj.y, getObjectHeight(obj) + 2);
    const topB = projectWorld(obj.x + obj.w, obj.y + obj.h, getObjectHeight(obj) + 2);
    const topL = projectWorld(obj.x, obj.y + obj.h, getObjectHeight(obj) + 2);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(topR.x, topR.y);
    ctx.lineTo(topB.x, topB.y);
    ctx.lineTo(topL.x, topL.y);
    ctx.closePath();
    ctx.strokeStyle = '#fff4a4';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function renderGrid3D() {
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;

  for (let x = 0; x <= BOARD_WIDTH; x += 1) {
    const a = projectWorld(x, 0, 0);
    const b = projectWorld(x, BOARD_HEIGHT, 0);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let z = 0; z <= BOARD_HEIGHT; z += 1) {
    const a = projectWorld(0, z, 0);
    const b = projectWorld(BOARD_WIDTH, z, 0);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const baseA = projectWorld(0, 0, 0);
  const baseB = projectWorld(BOARD_WIDTH, 0, 0);
  const baseC = projectWorld(0, BOARD_HEIGHT, 0);
  const baseD = projectWorld(BOARD_WIDTH, BOARD_HEIGHT, 0);
  ctx.beginPath();
  ctx.moveTo(baseA.x, baseA.y);
  ctx.lineTo(baseB.x, baseB.y);
  ctx.lineTo(baseD.x, baseD.y);
  ctx.lineTo(baseC.x, baseC.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.stroke();
}

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b161d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  renderGrid3D();

  const visible = state.objects
    .filter((obj) => obj.layer === state.selectedLayer || obj.layer !== 'trigger')
    .sort((a, b) => (a.y + a.h) - (b.y + b.h));

  visible.forEach(drawObject);

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

  const bounds = { left: 0, top: 0, right: canvas.width, bottom: canvas.height };
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

function serializeMissionObject(obj) {
  const position = `${(obj.x + obj.w / 2).toFixed(2)} ${(obj.y + obj.h / 2).toFixed(2)} 0.00`;
  const scale = `${obj.w.toFixed(2)} ${obj.h.toFixed(2)} 1.00`;
  const name = obj.name || `${obj.type}_${obj.id}`;

  if (obj.type === 'teleporter') {
    const targetName = obj.params?.targetName || `Teleport_${obj.id}`;
    return [
      `   new Trigger(${name}) {`,
      `      position = "${position}";`,
      `      rotation = "1 0 0 0";`,
      `      scale = "5 5 5";`,
      `      dataBlock = "TeleportTrigger";`,
      `      polyhedron = "0.0000000 0.0000000 0.0000000 1.0000000 0.0000000 0.0000000 0.0000000 -1.0000000 0.0000000 0.0000000 0.0000000 1.0000000";`,
      `      destination = "${targetName}";`,
      `   };`,
      ``,
      `   new Trigger(${obj.params?.targetName || `${name}_Dest`}) {`,
      `      position = "${(obj.x + obj.w / 2).toFixed(2)} ${(obj.y + obj.h / 2).toFixed(2)} 0.00";`,
      `      rotation = "1 0 0 0";`,
      `      scale = "5 5 5";`,
      `      dataBlock = "DestinationTrigger";`,
      `      polyhedron = "0.0000000 0.0000000 0.0000000 1.0000000 0.0000000 0.0000000 0.0000000 -1.0000000 0.0000000 0.0000000 0.0000000 1.0000000";`,
      `   };`,
    ].join('\n');
  }

  if (obj.type === 'start') {
    return [
      `   new StaticShape(${name}) {`,
      `      position = "${position}";`,
      `      rotation = "1 0 0 0";`,
      `      scale = "1 1 1";`,
      `      dataBlock = "StartPad";`,
      `   };`,
    ].join('\n');
  }

  if (obj.type === 'finish') {
    return [
      `   new StaticShape(${name}) {`,
      `      position = "${position}";`,
      `      rotation = "1 0 0 0";`,
      `      scale = "1 1 1";`,
      `      dataBlock = "FinishPad";`,
      `   };`,
    ].join('\n');
  }

  if (obj.type === 'gem') {
    return [
      `   new Item() {`,
      `      position = "${position}";`,
      `      rotation = "1 0 0 0";`,
      `      scale = "1 1 1";`,
      `      dataBlock = "GemItem";`,
      `      collideable = "0";`,
      `      static = "1";`,
      `      rotate = "1";`,
      `      pickUpCheckpoint = "0";`,
      `   };`,
    ].join('\n');
  }

  if (obj.type === 'checkpoint') {
    return [
      `   new StaticShape(${name}) {`,
      `      position = "${position}";`,
      `      rotation = "1 0 0 0";`,
      `      scale = "1 1 1";`,
      `      dataBlock = "checkPoint";`,
      `   };`,
    ].join('\n');
  }

  if (obj.type === 'hazard') {
    return [
      `   new Trigger(${name}) {`,
      `      position = "${position}";`,
      `      rotation = "1 0 0 0";`,
      `      scale = "${Math.max(3, obj.w)} ${Math.max(3, obj.h)} 3";`,
      `      dataBlock = "HazardTrigger";`,
      `      polyhedron = "0.0000000 0.0000000 0.0000000 1.0000000 0.0000000 0.0000000 0.0000000 -1.0000000 0.0000000 0.0000000 0.0000000 1.0000000";`,
      `   };`,
    ].join('\n');
  }

  if (obj.type === 'boost') {
    return [
      `   new Item() {`,
      `      position = "${position}";`,
      `      rotation = "1 0 0 0";`,
      `      scale = "1 1 1";`,
      `      dataBlock = "SuperJumpItem";`,
      `      collideable = "0";`,
      `      static = "1";`,
      `      rotate = "1";`,
      `   };`,
    ].join('\n');
  }

  return [
    `   new StaticShape(${name}) {`,
    `      position = "${position}";`,
    `      rotation = "1 0 0 0";`,
    `      scale = "${scale}";`,
    `      dataBlock = "${obj.type === 'floor' ? 'MBP_Floor' : obj.type === 'wall' ? 'MBP_Wall' : 'StaticShape'}";`,
    `   };`,
  ].join('\n');
}

function exportMission() {
  const start = state.objects.find((obj) => obj.type === 'start');
  const finish = state.objects.find((obj) => obj.type === 'finish');
  const missionName = 'MarbleBlastLevel';

  const lines = [];
  lines.push('//--- OBJECT WRITE BEGIN ---');
  lines.push('new SimGroup(MissionGroup) {');
  lines.push('');
  lines.push('   new ScriptObject(MissionInfo) {');
  lines.push(`      name = "${missionName}";`);
  lines.push(`      level = "1";`);
  lines.push(`      type = "Custom";`);
  lines.push(`      artist = "Marble Blast Editor";`);
  lines.push(`      desc = "Generated by Marble Blast Editor";`);
  lines.push(`      startHelpText = "Welcome!";`);
  lines.push('   };');
  lines.push('');
  lines.push('   new MissionArea(MissionArea) {');
  lines.push('      area = "-360 -648 720 1296";');
  lines.push('      flightCeiling = "300";');
  lines.push('      flightCeilingRange = "20";');
  lines.push('      locked = "true";');
  lines.push('   };');
  lines.push('');
  lines.push('   new Sky(Sky) {');
  lines.push('      position = "336 136 0";');
  lines.push('      rotation = "1 0 0 0";');
  lines.push('      scale = "1 1 1";');
  lines.push('      materialList = "~/data/skies/sky_day.dml";');
  lines.push('      visibleDistance = "500";');
  lines.push('      useSkyTextures = "1";');
  lines.push('      renderBottomTexture = "1";');
  lines.push('      SkySolidColor = "0.600000 0.600000 0.600000 1.000000";');
  lines.push('      fogDistance = "300";');
  lines.push('      fogColor = "0.600000 0.600000 0.600000 1.000000";');
  lines.push('   };');
  lines.push('');
  lines.push('   new Sun() {');
  lines.push('      direction = "0.514393 0.603723 -0.609031";');
  lines.push('      color = "1.400000 1.200000 0.400000 1.000000";');
  lines.push('      ambient = "0.300000 0.300000 0.400000 1.000000";');
  lines.push('   };');

  if (start) {
    lines.push('');
    lines.push(`   new StaticShape(StartPoint) {`);
    lines.push(`      position = "${(start.x + 0.5).toFixed(2)} ${(start.y + 0.5).toFixed(2)} 0.00";`);
    lines.push('      rotation = "1 0 0 0";');
    lines.push('      scale = "1 1 1";');
    lines.push('      dataBlock = "StartPad";');
    lines.push('   };');
  }

  if (finish) {
    lines.push('');
    lines.push(`   new StaticShape(FinishPad) {`);
    lines.push(`      position = "${(finish.x + 0.5).toFixed(2)} ${(finish.y + 0.5).toFixed(2)} 0.00";`);
    lines.push('      rotation = "1 0 0 0";');
    lines.push('      scale = "1 1 1";');
    lines.push('      dataBlock = "FinishPad";');
    lines.push('   };');
  }

  state.objects.forEach((obj) => {
    if (obj.type === 'start' || obj.type === 'finish') return;
    lines.push('');
    lines.push(serializeMissionObject(obj));
  });

  lines.push('};');
  const text = lines.join('\n');
  levelTextEl.value = text;

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${missionName}.mis`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseMissionValue(raw) {
  if (raw == null) return '';
  return String(raw).replace(/^"|"$/g, '').trim();
}

function importMission() {
  try {
    const text = levelTextEl.value.trim();
    if (!text) throw new Error('No mission data supplied.');

    const objectMatches = [...text.matchAll(/new\s+(\w+)\s*(?:\(([^)]*)\))?\s*\{([\s\S]*?)\};/g)];

    const imported = [];
    objectMatches.forEach((match) => {
      const [, className, instanceNameRaw, block] = match;
      const instanceName = (instanceNameRaw || '').trim();
      const fields = {};
      const fieldRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|([^;]+));/g;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(block))) {
        const [, key, quoted, unquoted] = fieldMatch;
        fields[key] = quoted !== undefined ? quoted : unquoted?.trim();
      }

      const dataBlock = parseMissionValue(fields.dataBlock || '');
      const position = parseMissionValue(fields.position || '0 0 0');
      const scale = parseMissionValue(fields.scale || '1 1 1');
      const [xRaw, yRaw] = position.split(/\s+/).map(Number);
      const [sxRaw, syRaw] = scale.split(/\s+/).map(Number);
      const x = Number.isFinite(xRaw) ? xRaw : 0;
      const y = Number.isFinite(yRaw) ? yRaw : 0;
      const w = Number.isFinite(sxRaw) ? Math.max(1, Math.round(sxRaw)) : 1;
      const h = Number.isFinite(syRaw) ? Math.max(1, Math.round(syRaw)) : 1;

      let type = 'floor';
      if (/StartPad/.test(dataBlock)) type = 'start';
      else if (/FinishPad/.test(dataBlock)) type = 'finish';
      else if (/Gem/.test(dataBlock)) type = 'gem';
      else if (/Teleport/.test(dataBlock)) type = 'teleporter';
      else if (/checkPoint|Checkpoint/.test(dataBlock)) type = 'checkpoint';
      else if (/Hazard/.test(dataBlock)) type = 'hazard';
      else if (/SuperJumpItem/.test(dataBlock)) type = 'boost';
      else if (/Wall/.test(dataBlock)) type = 'wall';
      else if (/Floor/.test(dataBlock)) type = 'floor';
      else if (/Trigger/.test(className)) type = 'checkpoint';

      const obj = createObject(type, 'base', Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), Math.max(1, w), Math.max(1, h), {
        name: instanceName || `${type}_${imported.length + 1}`,
        params: {},
      });

      if (fields.destination) {
        obj.params.targetName = fields.destination;
        obj.params.targetId = null;
      }
      if (fields.value) obj.params.value = Number(fields.value);
      if (obj.type === 'teleporter') obj.layer = 'trigger';
      if (obj.type === 'checkpoint' || obj.type === 'hazard') obj.layer = 'trigger';
      if (obj.type === 'gem' || obj.type === 'boost') obj.layer = 'decor';

      imported.push(obj);
    });

    if (!imported.length) throw new Error('No valid mission objects were found.');

    state.objects = imported;
    state.selectedObjectId = null;
    renderInspector();
    renderCanvas();
  } catch (error) {
    alert(`Failed to import mission: ${error.message}`);
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
  document.getElementById('export-mis').addEventListener('click', exportMission);
  document.getElementById('import-mis').addEventListener('click', importMission);
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
