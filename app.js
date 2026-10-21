const GRID_SIZE = 32;
const BOARD_WIDTH = 28;
const BOARD_HEIGHT = 18;
const LAYER_ORDER = ['base', 'decor', 'trigger'];

const TOOL_DEFS = {
  select: { label: 'Select', color: '#eaf6ff' },
  erase: { label: 'Erase', color: '#ff8f8f' },
  floor: { label: 'Floor', color: '#7db4ff', torqueType: 'StaticShape', dataBlock: 'MBP_Floor' },
  wall: { label: 'Wall', color: '#9aa7ba', torqueType: 'StaticShape', dataBlock: 'MBP_Wall' },
  start: { label: 'Start', color: '#48d18d', torqueType: 'Item', dataBlock: 'MBPStartPad' },
  finish: { label: 'Finish', color: '#ffd76f', torqueType: 'Item', dataBlock: 'MBPFinishPad' },
  hazard: { label: 'Hazard', color: '#ff7f7f', torqueType: 'Trigger', dataBlock: 'MBPHazardTrigger' },
  boost: { label: 'Boost', color: '#68d8ff', torqueType: 'Item', dataBlock: 'MBPBoostPad' },
  checkpoint: { label: 'Checkpoint', color: '#dca6ff', torqueType: 'Trigger', dataBlock: 'MBPCheckpointTrigger' },
  gem: { label: 'Gem', color: '#ffde59', torqueType: 'Item', dataBlock: 'MBPGem' },
  teleporter: { label: 'Teleporter', color: '#7ef0d6', torqueType: 'Teleporter', dataBlock: 'MBPTeleporter' },
  trigger: { label: 'Trigger', color: '#d5a5ff', torqueType: 'Trigger', dataBlock: 'MBPTrigger' },
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
  const def = TOOL_DEFS[type] || { color: '#ffffff' };
  const name = `${type[0].toUpperCase()}${type.slice(1)}_${state.nextId}`;
  return {
    id: state.nextId++,
    name,
    type,
    layer,
    x: clamp(x, 0, BOARD_WIDTH),
    y: clamp(y, 0, BOARD_HEIGHT),
    w: Math.max(1, w || 1),
    h: Math.max(1, h || 1),
    rotation: 0,
    params: {},
    torqueType: def.torqueType || 'StaticShape',
    dataBlock: def.dataBlock || 'MBP_Object',
    ...extra,
  };
}

function getDefaultLevel() {
  state.nextId = 1;
  const start = createObject('start', 'base', 2, 13, 1, 1);
  const finish = createObject('finish', 'base', 22, 3, 1, 1);
  const floorTop = createObject('floor', 'base', 0, 15, 28, 3);
  const floorA = createObject('floor', 'base', 6, 11, 6, 1);
  const floorB = createObject('floor', 'base', 15, 8, 4, 1);
  const wallA = createObject('wall', 'base', 11, 7, 1, 4);
  const boostA = createObject('boost', 'base', 8, 9, 1, 1);
  const hazardA = createObject('hazard', 'base', 18, 13, 3, 1);
  const gemA = createObject('gem', 'decor', 6, 10, 1, 1, { params: { value: 10 } });
  const gemB = createObject('gem', 'decor', 16, 7, 1, 1, { params: { value: 10 } });
  const checkpoint = createObject('checkpoint', 'trigger', 13, 6, 1, 1);
  const teleporterA = createObject('teleporter', 'trigger', 10, 13, 1, 1, { params: { targetId: null } });
  const teleporterB = createObject('teleporter', 'trigger', 22, 5, 1, 1, { params: { targetId: null } });

  teleporterA.params.targetId = teleporterB.id;
  teleporterB.params.targetId = teleporterA.id;

  return [start, finish, floorTop, floorA, floorB, wallA, boostA, hazardA, gemA, gemB, checkpoint, teleporterA, teleporterB];
}

function getSelectedObject() {
  return state.objects.find((obj) => obj.id === state.selectedObjectId) || null;
}

function setSelectedObject(id) {
  state.selectedObjectId = id;
  renderInspector();
}

function renderToolButtons() {
  const tools = ['select', 'erase', 'floor', 'wall', 'start', 'finish', 'hazard', 'boost', 'checkpoint', 'gem', 'teleporter', 'trigger'];
  toolButtonsEl.innerHTML = tools.map((tool) => {
    const meta = TOOL_DEFS[tool];
    const active = state.selectedTool === tool ? 'active' : '';
    return `
      <button class="tool-button ${active}" data-tool="${tool}" type="button">
        <span class="swatch" style="background:${meta.color};"></span>
        ${meta.label}
      </button>
    `;
  }).join('');

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
    inspectorEl.innerHTML = '<p class="empty-state">Select an object to edit its properties. Use the palette and layer buttons to build a level in TorqueScript format.</p>';
    return;
  }

  const teleporterOptions = state.objects
    .filter((obj) => obj.type === 'teleporter' && obj.id !== selected.id)
    .map((obj) => `<option value="${obj.id}" ${String(selected.params.targetId ?? '') === String(obj.id) ? 'selected' : ''}>${obj.name}</option>`)
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

      ${selected.type === 'gem' || selected.type === 'boost' ? `
        <div class="control-group">
          <label>Value</label>
          <input id="prop-value" type="number" min="1" max="100" step="1" value="${selected.params.value ?? 10}" />
        </div>
      ` : ''}
    </div>
  `;

  const layerInput = document.getElementById('prop-layer');
  if (layerInput) {
    layerInput.addEventListener('change', (event) => {
      const obj = getSelectedObject();
      if (!obj) return;
      obj.layer = event.target.value;
      renderCanvas();
    });
  }

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
      obj.params = obj.params || {};
      obj.params.targetId = event.target.value ? Number(event.target.value) : null;
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
  return {
    cellX: Math.floor(x / GRID_SIZE),
    cellY: Math.floor(y / GRID_SIZE),
  };
}

function findObjectAtCell(cellX, cellY) {
  return [...state.objects].reverse().find((obj) => {
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

function getObjectColor(obj) {
  return (TOOL_DEFS[obj.type] || { color: '#ffffff' }).color;
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
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
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
    ctx.fillRect(px + 8, py + 2, pw - 16, ph - 4);
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
  } else if (obj.type === 'trigger') {
    ctx.fillRect(px + 3, py + 3, pw - 6, ph - 6);
  }

  ctx.restore();

  if (obj.type === 'teleporter' && obj.params?.targetId != null) {
    const target = state.objects.find((item) => item.id === Number(obj.params.targetId));
    if (target) {
      const sourceX = (obj.x + obj.w / 2) * GRID_SIZE;
      const sourceY = (obj.y + obj.h / 2) * GRID_SIZE;
      const targetX = (target.x + target.w / 2) * GRID_SIZE;
      const targetY = (target.y + target.h / 2) * GRID_SIZE;
      ctx.beginPath();
      ctx.strokeStyle = '#7ef0d6';
      ctx.lineWidth = 2;
      ctx.moveTo(sourceX, sourceY);
      ctx.lineTo(targetX, targetY);
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
    x: ((start ? start.x + 0.5 : 2) * GRID_SIZE),
    y: ((start ? start.y + 0.5 : 2) * GRID_SIZE),
    vx: 1.6,
    vy: 0,
  };
}

function previewStep() {
  if (!state.preview || !state.previewBall) return;
  const ball = state.previewBall;
  ball.vy += 0.38;
  ball.x += ball.vx;
  ball.y += ball.vy;

  const bounds = { left: 0, top: 0, right: canvas.width, bottom: canvas.height };
  if (ball.x < 12 || ball.x > bounds.right - 12) ball.vx *= -0.7;
  if (ball.y < 12) ball.vy *= -0.7;
  if (ball.y > bounds.bottom + 40) resetPreview();

  for (const obj of state.objects) {
    if (obj.type === 'floor' || obj.type === 'wall') {
      const rect = { x: obj.x * GRID_SIZE, y: obj.y * GRID_SIZE, w: obj.w * GRID_SIZE, h: obj.h * GRID_SIZE };
      const ballRect = { x: ball.x - 12, y: ball.y - 12, w: 24, h: 24 };
      const intersects = ballRect.x < rect.x + rect.w && ballRect.x + ballRect.w > rect.x && ballRect.y < rect.y + rect.h && ballRect.y + ballRect.h > rect.y;
      if (intersects) {
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

function getLevelName() {
  return 'Level_01';
}

function buildTorqueObject(obj) {
  const lines = [];
  const pos = `${(obj.x + obj.w / 2).toFixed(2)} ${(obj.y + obj.h / 2).toFixed(2)} 1`;
  const size = `${obj.w.toFixed(2)} ${obj.h.toFixed(2)} 1`;
  const objectName = obj.name || `${obj.type}_${obj.id}`;

  if (obj.type === 'teleporter') {
    const target = state.objects.find((item) => item.id === Number(obj.params?.targetId));
    lines.push(`new Teleporter(${objectName})`);
    lines.push('{');
    lines.push(`   dataBlock = "${obj.dataBlock}";`);
    lines.push(`   position = "${pos}";`);
    lines.push(`   target = "${target ? target.name : 'None'}";`);
    lines.push(`   layer = "${obj.layer}";`);
    lines.push('};');
    return lines.join('\n');
  }

  if (obj.type === 'gem' || obj.type === 'boost' || obj.type === 'start' || obj.type === 'finish') {
    lines.push(`new Item(${objectName})`);
    lines.push('{');
    lines.push(`   dataBlock = "${obj.dataBlock}";`);
    lines.push(`   position = "${pos}";`);
    if (obj.params?.value != null) lines.push(`   value = ${obj.params.value};`);
    lines.push(`   layer = "${obj.layer}";`);
    lines.push('};');
    return lines.join('\n');
  }

  if (obj.type === 'checkpoint' || obj.type === 'hazard' || obj.type === 'trigger') {
    lines.push(`new Trigger(${objectName})`);
    lines.push('{');
    lines.push(`   dataBlock = "${obj.dataBlock}";`);
    lines.push(`   position = "${pos}";`);
    lines.push(`   triggerArea = "${size}";`);
    lines.push(`   layer = "${obj.layer}";`);
    lines.push('};');
    return lines.join('\n');
  }

  lines.push(`new StaticShape(${objectName})`);
  lines.push('{');
  lines.push(`   dataBlock = "${obj.dataBlock}";`);
  lines.push(`   position = "${pos}";`);
  lines.push(`   size = "${size}";`);
  lines.push(`   rotation = "1 0 0 0";`);
  lines.push(`   layer = "${obj.layer}";`);
  lines.push('};');
  return lines.join('\n');
}

function exportTorqueScript() {
  const levelName = getLevelName();
  const lines = [];
  lines.push('% Auto-generated by Marble Blast Editor');
  lines.push('');
  lines.push(`singleton LevelInfo(${levelName})`);
  lines.push('{');
  lines.push(`   levelName = "${levelName}";`);
  lines.push('   description = "Generated by Marble Blast Editor";');
  lines.push(`   width = ${BOARD_WIDTH};`);
  lines.push(`   height = ${BOARD_HEIGHT};`);
  lines.push('   theme = "forest";');
  lines.push('   gravity = 20;');
  const start = state.objects.find((obj) => obj.type === 'start');
  const finish = state.objects.find((obj) => obj.type === 'finish');
  if (start) lines.push(`   startPosition = "${(start.x + 0.5).toFixed(2)} ${(start.y + 0.5).toFixed(2)} 1";`);
  if (finish) lines.push(`   finishPosition = "${(finish.x + 0.5).toFixed(2)} ${(finish.y + 0.5).toFixed(2)} 1";`);
  lines.push(`   gemCount = ${state.objects.filter((obj) => obj.type === 'gem').length};`);
  lines.push('};');
  lines.push('');
  lines.push(`new SimGroup(${levelName}Group)`);
  lines.push('{');
  state.objects.forEach((obj) => {
    lines.push('   ' + buildTorqueObject(obj).replace(/\n/g, '\n   '));
    lines.push('');
  });
  lines.push('};');

  const torqueText = lines.join('\n');
  levelTextEl.value = torqueText;

  const blob = new Blob([torqueText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${levelName}.cs`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseTorqueStringValue(value) {
  const cleaned = (value || '').replace(/['"]/g, '').trim();
  if (!cleaned) return '';
  return cleaned;
}

function importTorqueScript() {
  try {
    const text = levelTextEl.value.trim();
    if (!text) throw new Error('No TorqueScript level supplied.');

    const objectMatches = [...text.matchAll(/new\s+(\w+)\s*\(\s*([A-Za-z0-9_]+)\s*\)\s*\{([\s\S]*?)\};/g)];

    const imported = [];
    objectMatches.forEach((match) => {
      const [, torqueType, rawName, block] = match;
      const fields = {};
      let fieldMatch;
      const fieldRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|([^;]+));/g;
      while ((fieldMatch = fieldRegex.exec(block))) {
        const [, key, quoted, unquoted] = fieldMatch;
        fields[key] = quoted !== undefined ? quoted : unquoted?.trim();
      }

      const positionValue = fields.position || '0 0 1';
      const sizeValue = fields.size || '1 1 1';
      const [posX, posY] = positionValue.split(/\s+/).map(Number);
      const [sizeW, sizeH] = sizeValue.split(/\s+/).map(Number);
      const layer = (fields.layer || 'base').trim();

      let type = 'floor';
      const dataBlock = String(fields.dataBlock || '').trim();
      if (dataBlock.includes('Finish') || torqueType === 'Item' && /Finish/.test(dataBlock)) type = 'finish';
      else if (dataBlock.includes('Start') || torqueType === 'Item' && /Start/.test(dataBlock)) type = 'start';
      else if (dataBlock.includes('Gem')) type = 'gem';
      else if (dataBlock.includes('Teleporter')) type = 'teleporter';
      else if (dataBlock.includes('Checkpoint') || dataBlock.includes('Trigger')) type = 'checkpoint';
      else if (dataBlock.includes('Hazard')) type = 'hazard';
      else if (dataBlock.includes('Boost')) type = 'boost';
      else if (dataBlock.includes('Wall')) type = 'wall';
      else if (dataBlock.includes('Floor')) type = 'floor';

      const obj = createObject(type, layer, Math.floor(posX), Math.floor(posY), Math.max(1, Math.ceil(sizeW || 1)), Math.max(1, Math.ceil(sizeH || 1)), {
        name: rawName,
        torqueType,
        dataBlock,
        params: {},
      });

      obj.params = obj.params || {};
      if (fields.target) obj.params.targetId = null;
      if (fields.value) obj.params.value = Number(fields.value);
      if (fields.layer) obj.layer = fields.layer;
      if (rawName) obj.name = rawName;
      imported.push(obj);
    });

    if (!imported.length) throw new Error('No valid objects were found in the TorqueScript content.');

    state.objects = imported;
    state.selectedObjectId = null;
    renderInspector();
    renderCanvas();
  } catch (error) {
    alert(`Failed to import TorqueScript: ${error.message}`);
  }
}

function createNewLevel() {
  state.objects = getDefaultLevel();
  state.selectedObjectId = null;
  renderInspector();
  renderCanvas();
}

function bindEvents() {
  document.getElementById('new-level').addEventListener('click', createNewLevel);
  document.getElementById('export-torque').addEventListener('click', exportTorqueScript);
  document.getElementById('import-torque').addEventListener('click', importTorqueScript);
  document.getElementById('preview-toggle').addEventListener('click', togglePreview);
  document.getElementById('delete-selected').addEventListener('click', deleteSelectedObject);
  document.getElementById('fit-canvas').addEventListener('click', renderCanvas);
  canvas.addEventListener('pointerdown', handleCanvasPointerDown);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') deleteSelectedObject();
  });
}

function init() {
  state.objects = getDefaultLevel();
  renderToolButtons();
  renderLayerButtons();
  renderInspector();
  renderCanvas();
  bindEvents();
}

init();
