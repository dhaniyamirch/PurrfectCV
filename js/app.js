let cvReady = false;

// Global state
let state = {
  mediaType: null, fileName: '', sourceMediaFile: null, sourceImage: null, videoEl: null, mediaObjectUrl: null, frames: [], currentFrameIndex: 0,
  pipeline: [], selectedBlockId: null,
  branches: [], activeBranchId: null, outputBlend: null,
  viewMode: 'processed', zoomLevel: 1.0, panX: 0, panY: 0, splitPosition: 0.5,
  lastOrigData: null, lastProcData: null, fitOnNextRender: false, stagePreviews: [],
  activeStageKey: null, activeStageView: null, activeStageData: null,
  comparisonSlots: [null, null, null, null], comparisonTargetSlot: 0,
  annotationMode: false, annotationTool: 'pen', annotationColor: '#ffcc00', annotationWidth: 3,
  annotationText: 'Label', annotationTextSize: 24, annotationTextBackground: true, annotationBackgroundColor: '#111827',
  annotations: [], currentAnnotation: null, selectedAnnotationId: null, annotationDrag: null,
  annotationUndo: [], annotationRedo: [], annotationStyleHistoryOpen: false
};

let mediaLoadId = 0;
let isExportingFrames = false;
let isOpeningProject = false;
const MEOW_PROJECT_FORMAT = 'meow-project';
const MEOW_PROJECT_VERSION = 3;
const MAX_PROJECT_ANNOTATIONS = 5000;
const MAX_ANNOTATION_POINTS_PER_MARK = 20000;
const MAX_TOTAL_ANNOTATION_POINTS = 150000;
const VALID_ANNOTATION_TYPES = ['pen', 'marker', 'text', 'line', 'arrow', 'rectangle', 'ellipse'];
const MAX_MEOW_MEDIA_BYTES = 500 * 1024 * 1024;
const MAX_MEOW_ARCHIVE_BYTES = 550 * 1024 * 1024;
const MAX_BRANCHES = 50;
const MAX_BRANCH_NAME_LENGTH = 60;
const VALID_BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'difference', 'darken', 'lighten'];

// Architecture: Operation Dictionary utilizing OpenCV.js functions where possible
const OPERATIONS_CONFIG = [
  {
    category: 'BASIC',
    tools: {
      grayscale: { name: 'Grayscale', params: [] },
      invert: { name: 'Invert', params: [] },
      brightContrast: { name: 'Brightness/Contrast', params: [
        { id: 'brightness', label: 'Brightness', type: 'range', min: -100, max: 100, step: 1, default: 0 },
        { id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3, step: 0.05, default: 1 }
      ]},
      gamma: { name: 'Gamma Correction', params: [
        { id: 'gamma', label: 'Gamma', type: 'range', min: 0.1, max: 5.0, step: 0.1, default: 1.0 }
      ]}
    }
  },
  {
    category: 'HISTOGRAM',
    tools: {
      histEq: { name: 'Histogram Eq.', params: [] },
      clahe: { name: 'CLAHE', params: [
        { id: 'clipLimit', label: 'Clip Limit', type: 'range', min: 0.5, max: 10, step: 0.5, default: 2.0 },
        { id: 'tileSize', label: 'Tile Grid Size', type: 'range', min: 2, max: 32, step: 1, default: 8 }
      ]}
    }
  },
  {
    category: 'FILTERS',
    tools: {
      gaussianBlur: { name: 'Gaussian Blur', params: [
        { id: 'kernel', label: 'Kernel Size', type: 'range', min: 3, max: 31, step: 2, default: 5 },
        { id: 'sigma', label: 'Sigma X', type: 'range', min: 0, max: 10, step: 0.1, default: 0 }
      ]},
      medianBlur: { name: 'Median Blur', params: [
        { id: 'kernel', label: 'Kernel Size', type: 'range', min: 3, max: 31, step: 2, default: 5 }
      ]},
      sharpen: { name: 'Sharpen (Laplacian)', params: [
        { id: 'amount', label: 'Amount', type: 'range', min: 0.1, max: 5, step: 0.1, default: 1.0 }
      ]}
    }
  },
  {
    category: 'EDGES',
    tools: {
      sobel: { name: 'Sobel Filter', params: [
        { id: 'dx', label: 'Derivative X', type: 'range', min: 0, max: 2, step: 1, default: 1 },
        { id: 'dy', label: 'Derivative Y', type: 'range', min: 0, max: 2, step: 1, default: 1 },
        { id: 'ksize', label: 'Kernel Size', type: 'range', min: 1, max: 7, step: 2, default: 3 }
      ]},
      canny: { name: 'Canny Edge', params: [
        { id: 't1', label: 'Threshold 1', type: 'range', min: 0, max: 255, step: 1, default: 50 },
        { id: 't2', label: 'Threshold 2', type: 'range', min: 0, max: 255, step: 1, default: 150 }
      ]}
    }
  },
  {
    category: 'MORPHOLOGY',
    tools: {
      morphology: { name: 'Morphology', params: [
        { id: 'op', label: 'Operation', type: 'select', options: ['Erode', 'Dilate', 'Open', 'Close', 'Gradient', 'Top Hat', 'Black Hat'], default: 'Open' },
        { id: 'shape', label: 'Kernel Shape', type: 'select', options: ['Rect', 'Cross', 'Ellipse'], default: 'Rect' },
        { id: 'ksize', label: 'Kernel Size', type: 'range', min: 3, max: 21, step: 2, default: 3 },
        { id: 'iters', label: 'Iterations', type: 'range', min: 1, max: 10, step: 1, default: 1 }
      ]}
    }
  },
  {
    category: 'SEGMENTATION',
    tools: {
      threshold: { name: 'Threshold', params: [
        { id: 'type', label: 'Type', type: 'select', options: ['Binary', 'Binary Inv', 'Trunc', 'ToZero', 'ToZero Inv', 'Otsu'], default: 'Binary' },
        { id: 'level', label: 'Level', type: 'range', min: 0, max: 255, step: 1, default: 128 }
      ]},
      distTransform: { name: 'Distance Transform', params: [] },
      connectedComps: { name: 'Connected Comps', params: [] },
      watershed: { name: 'Watershed', params: [] }
    }
  },
  {
    category: 'CONTOURS',
    tools: {
      findContours: { name: 'Find Contours', params: [
        { id: 'thickness', label: 'Thickness', type: 'range', min: -1, max: 5, step: 1, default: 1 }
      ]}
    }
  },
  {
    category: 'FREQUENCY & WAVELETS',
    tools: {
      fftMag: { name: 'FFT Magnitude', params: [] }
    }
  }
];

const OPERATIONS = {};
OPERATIONS_CONFIG.forEach(cat => Object.assign(OPERATIONS, cat.tools));

let historyPast = [];
let historyFuture = [];
let isExtracting = false;
let extractionAbort = new AbortController();

const els = {
  canvas: document.getElementById('mainCanvas'),
  ctx: document.getElementById('mainCanvas').getContext('2d', { willReadFrequently: true }),
  overlayCanvas: document.getElementById('overlayCanvas'),
  oCtx: document.getElementById('overlayCanvas').getContext('2d'),
  splitHandle: document.getElementById('splitHandle'),
  histCanvas: document.getElementById('histCanvas'),
  hctx: document.getElementById('histCanvas').getContext('2d'),
  pipeArea: document.getElementById('pipelineArea'),
  inspector: document.getElementById('inspectorContent'),
  timeline: document.getElementById('timelineTrack'),
  toolsContainer: document.getElementById('toolsContainer'),
  renderOverlay: document.getElementById('renderOverlay'),
  canvasWrapper: document.getElementById('canvasWrapper'),
  viewerContainer: document.getElementById('viewerContainer')
};

const workCanvas = document.createElement('canvas');
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
const resultCanvas = document.createElement('canvas');
const resultCtx = resultCanvas.getContext('2d', { willReadFrequently: true });
let isProcessing = false, renderRequested = false;

function onOpenCvReady() {
  if (!window.cv) return;
  const markReady = () => {
    if (cvReady) return;
    cvReady = true;
    document.getElementById('cvLoading').style.display = 'none';
    setStatus('OpenCV.js ready');
    showMsg('OpenCV.js Engine Ready');
    requestProcess();
  };

  // The CDN script can load before or after the WebAssembly runtime initializes.
  // A tiny native allocation is a reliable readiness probe when the runtime already ran.
  try {
    if (window.cv.Mat && window.cv.Mat.zeros && window.cv.CV_8UC1 !== undefined) {
      const probe = window.cv.Mat.zeros(1, 1, window.cv.CV_8UC1);
      probe.delete();
      markReady();
      return;
    }
  } catch (_) { /* Runtime has not initialized yet; use its callback. */ }
  window.cv.onRuntimeInitialized = markReady;
}

const showMsg = (msg) => {
  const t = document.getElementById('msgBox');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
};
const setStatus = (msg) => document.getElementById('statusText').textContent = msg;
const generateId = () => Math.random().toString(36).substr(2, 9);
const clonePipeline = (pipe) => JSON.parse(JSON.stringify(pipe));
const clamp = (v) => Math.max(0, Math.min(255, v));
const luma = (r, g, b) => 0.299*r + 0.587*g + 0.114*b;

function initTools() {
  els.toolsContainer.innerHTML = '';
  OPERATIONS_CONFIG.forEach(cat => {
    const head = document.createElement('div');
    head.className = 'category-header';
    head.textContent = cat.category;
    els.toolsContainer.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'tools-grid';

    for (const [type, def] of Object.entries(cat.tools)) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.textContent = def.name;
      btn.onclick = () => addBlock(type);
      grid.appendChild(btn);
    }
    els.toolsContainer.appendChild(grid);
  });
}

function snapshotActiveWorkspaceEdit() {
  return { pipeline: clonePipeline(state.pipeline), outputBlend: state.outputBlend ? { ...state.outputBlend } : null };
}

function applyWorkspaceEditSnapshot(snapshot) {
  // Accept old pipeline-only entries defensively; newer entries also restore branch blending.
  if (Array.isArray(snapshot)) {
    state.pipeline = clonePipeline(snapshot);
  } else {
    state.pipeline = clonePipeline(snapshot?.pipeline || []);
    state.outputBlend = snapshot?.outputBlend ? { ...snapshot.outputBlend } : null;
  }
  state.selectedBlockId = null;
}

function syncHistoryToActiveBranch() {
  const branch = getActiveBranch();
  if (branch) {
    branch.historyPast = historyPast;
    branch.historyFuture = historyFuture;
  }
}

function saveHistory() {
  historyPast.push(snapshotActiveWorkspaceEdit());
  if (historyPast.length > 50) historyPast.shift();
  historyFuture = [];
  syncHistoryToActiveBranch();
  updateUndoRedoUI();
}

function updateUndoRedoUI() {
  document.getElementById('btnUndo').disabled = historyPast.length === 0;
  document.getElementById('btnRedo').disabled = historyFuture.length === 0;
}

function undo() {
  if (historyPast.length === 0) return;
  historyFuture.push(snapshotActiveWorkspaceEdit());
  applyWorkspaceEditSnapshot(historyPast.pop());
  syncHistoryToActiveBranch();
  updateUndoRedoUI(); renderPipelineUI(); requestProcess();
}

function redo() {
  if (historyFuture.length === 0) return;
  historyPast.push(snapshotActiveWorkspaceEdit());
  applyWorkspaceEditSnapshot(historyFuture.pop());
  syncHistoryToActiveBranch();
  updateUndoRedoUI(); renderPipelineUI(); requestProcess();
}

function addBlock(type) {
  const def = OPERATIONS[type];
  if (!def) return showMsg('Unknown processing operation.');
  saveHistory();
  const params = {};
  def.params.forEach(p => params[p.id] = p.default);
  const block = { id: generateId(), type, params };
  state.pipeline.push(block);
  state.selectedBlockId = block.id;
  renderPipelineUI();
  requestProcess();
}

function deleteBlock(id) {
  saveHistory();
  state.pipeline = state.pipeline.filter(b => b.id !== id);
  if (state.selectedBlockId === id) state.selectedBlockId = null;
  renderPipelineUI();
  requestProcess();
}

function renderPipelineUI() {
  syncActiveBranch();
  renderBranchUI();
  els.pipeArea.innerHTML = '';
  if (state.pipeline.length === 0) {
    els.pipeArea.innerHTML = '<div style="color:var(--text-muted);font-size:12px;font-style:italic;">Processing pipeline is empty. Click tools on the left to build.</div>';
    renderInspector();
    return;
  }

  const track = document.createElement('div');
  track.className = 'pipeline-track';

  const orig = document.createElement('div');
  orig.className = 'pipe-block';
  orig.style.background = '#0d1117'; orig.style.cursor = 'default'; orig.style.borderColor = '#21262d';
  orig.innerHTML = `<div class="pipe-block-header">Source</div><div class="pipe-block-desc">Base Image/Frame</div>`;
  track.appendChild(orig);

  let draggedIndex = null;

  state.pipeline.forEach((block, idx) => {
    const arrow = document.createElement('div');
    arrow.className = 'pipe-arrow'; arrow.textContent = '→';
    track.appendChild(arrow);

    const def = OPERATIONS[block.type];
    const el = document.createElement('div');
    el.className = 'pipe-block' + (state.selectedBlockId === block.id ? ' selected' : '');
    el.draggable = true;

    const header = document.createElement('div');
    header.className = 'pipe-block-header';
    header.innerHTML = `<span>${def.name}</span>`;

    const delBtn = document.createElement('button');
    delBtn.className = 'pipe-block-del'; delBtn.innerHTML = '✕'; delBtn.title = 'Delete';
    delBtn.onclick = (e) => { e.stopPropagation(); deleteBlock(block.id); };
    header.appendChild(delBtn);

    const desc = document.createElement('div');
    desc.className = 'pipe-block-desc';
    let paramSummary = def.params.map(p => {
      let val = block.params[p.id];
      if (typeof val === 'number') val = (val % 1 === 0) ? val : val.toFixed(2);
      return `${p.label.split(' ')[0]}: ${val}`;
    }).join(', ');
    desc.textContent = paramSummary || 'Active';

    el.appendChild(header); el.appendChild(desc);

    el.ondragstart = (e) => {
      draggedIndex = idx; e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      setTimeout(() => el.style.opacity = '0.4', 0);
    };
    el.ondragend = () => {
      el.style.opacity = '1';
      document.querySelectorAll('.pipe-block').forEach(b => b.classList.remove('drag-over'));
    };
    el.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); };
    el.ondragleave = () => { el.classList.remove('drag-over'); };
    el.ondrop = (e) => {
      e.preventDefault(); el.classList.remove('drag-over');
      if (draggedIndex === null || draggedIndex === idx) return;
      saveHistory();
      const item = state.pipeline.splice(draggedIndex, 1)[0];
      const insertionIndex = draggedIndex < idx ? idx - 1 : idx;
      state.pipeline.splice(insertionIndex, 0, item);
      draggedIndex = null;
      renderPipelineUI(); requestProcess();
    };
    el.onclick = () => { state.selectedBlockId = block.id; renderPipelineUI(); };
    track.appendChild(el);
  });

  els.pipeArea.appendChild(track);
  setTimeout(() => els.pipeArea.scrollLeft = els.pipeArea.scrollWidth, 10);
  renderInspector();
}

function renderInspector() {
  els.inspector.innerHTML = '';
  if (!state.selectedBlockId) {
    els.inspector.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0;line-height:1.5;">Select a block in the processing pipeline below to edit its parameters.</div>';
    return;
  }
  const block = state.pipeline.find(b => b.id === state.selectedBlockId);
  if (!block) return;
  const def = OPERATIONS[block.type];
  if (!def) { state.selectedBlockId = null; renderPipelineUI(); return; }

  const title = document.createElement('h3');
  title.style.color = '#fff'; title.style.marginBottom = '16px'; title.style.fontSize = '14px';
  title.textContent = def.name;
  els.inspector.appendChild(title);

  if (def.params.length === 0) {
    els.inspector.innerHTML += '<div style="color:var(--text-muted);font-size:12px;">No configurable parameters for this operation.<br><br><i>OpenCV Engine processing mode active.</i></div>';
    return;
  }

  def.params.forEach(p => {
    const group = document.createElement('div');
    group.className = 'control-group';
    const label = document.createElement('label');
    const valSpan = document.createElement('span');
    valSpan.style.color = 'var(--accent)';
    valSpan.style.fontWeight = '600';

    let currentVal = block.params[p.id];
    valSpan.textContent = (typeof currentVal === 'number' && currentVal % 1 !== 0) ? currentVal.toFixed(2) : currentVal;

    label.textContent = p.label;
    label.appendChild(valSpan);
    group.appendChild(label);

    if (p.type === 'range') {
      const input = document.createElement('input');
      input.type = 'range'; input.min = p.min; input.max = p.max; input.step = p.step;
      input.value = block.params[p.id];

      let historySavedForEdit = false;
      input.oninput = (e) => {
        // Save the previous state before mutating the first value in this slider gesture.
        if (!historySavedForEdit) {
          saveHistory();
          historySavedForEdit = true;
        }
        const v = parseFloat(e.target.value);
        block.params[p.id] = v;
        valSpan.textContent = (v % 1 !== 0) ? v.toFixed(2) : v;
        clearTimeout(input.processTimeout);
        input.processTimeout = setTimeout(() => requestProcess(), 100);
      };
      input.onchange = () => {
        historySavedForEdit = false;
        renderPipelineUI();
        requestProcess();
      };
      group.appendChild(input);
    } else if (p.type === 'select') {
      const sel = document.createElement('select');
      p.options.forEach(opt => {
        const o = document.createElement('option'); o.value = opt; o.textContent = opt;
        if (block.params[p.id] === opt) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = (e) => { saveHistory(); block.params[p.id] = e.target.value; renderPipelineUI(); requestProcess(); };
      group.appendChild(sel);
    }
    els.inspector.appendChild(group);
  });
}

// Branch model: each branch owns a pipeline and a fork-point snapshot for 3-way merging.
function getActiveBranch() {
  return state.branches.find(branch => branch.id === state.activeBranchId) || null;
}

function makeBranchRecord({ id, name, pipeline = [], selectedBlockId = null, parentId = null, basePipeline = [] }) {
  const normalizedPipeline = clonePipeline(pipeline);
  return {
    id: id || `branch-${generateId()}`,
    name: String(name || 'Branch').trim().slice(0, MAX_BRANCH_NAME_LENGTH) || 'Branch',
    pipeline: normalizedPipeline,
    selectedBlockId: typeof selectedBlockId === 'string' && normalizedPipeline.some(block => block.id === selectedBlockId) ? selectedBlockId : null,
    parentId: parentId || null,
    basePipeline: clonePipeline(basePipeline),
    historyPast: [],
    historyFuture: []
  };
}

function initializeBranchWorkspace() {
  const main = makeBranchRecord({ id: 'branch-main', name: 'Main', pipeline: state.pipeline });
  state.branches = [main];
  state.activeBranchId = main.id;
  state.pipeline = clonePipeline(main.pipeline);
  state.selectedBlockId = null;
  historyPast = main.historyPast;
  historyFuture = main.historyFuture;
}

function resetBranchesForNewMedia() {
  // A newly imported source retains the active pipeline, but unrelated branch history is cleared.
  const keptPipeline = clonePipeline(state.pipeline);
  const main = makeBranchRecord({ id: 'branch-main', name: 'Main', pipeline: keptPipeline });
  state.branches = [main];
  state.activeBranchId = main.id;
  state.pipeline = clonePipeline(main.pipeline);
  state.selectedBlockId = null;
  state.outputBlend = null;
  historyPast = main.historyPast;
  historyFuture = main.historyFuture;
  document.getElementById('mergeStrategySelect').value = 'auto';
  updateUndoRedoUI();
  renderPipelineUI();
}

function syncActiveBranch() {
  const branch = getActiveBranch();
  if (!branch) return;
    branch.pipeline = clonePipeline(state.pipeline);
    branch.selectedBlockId = typeof state.selectedBlockId === 'string' && state.pipeline.some(block => block.id === state.selectedBlockId) ? state.selectedBlockId : null;
    branch.historyPast = historyPast;
    branch.historyFuture = historyFuture;
}

function uniqueBranchName(preferred) {
  const used = new Set(state.branches.map(branch => branch.name.toLocaleLowerCase()));
  const baseName = String(preferred || 'Branch').trim().slice(0, MAX_BRANCH_NAME_LENGTH) || 'Branch';
  if (!used.has(baseName.toLocaleLowerCase())) return baseName;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${baseName.slice(0, MAX_BRANCH_NAME_LENGTH - String(suffix).length - 1)} ${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `Branch ${Date.now()}`.slice(0, MAX_BRANCH_NAME_LENGTH);
}

function renderBranchUI() {
  const branchSelect = document.getElementById('branchSelect');
  const mergeSourceSelect = document.getElementById('mergeSourceSelect');
  const renameInput = document.getElementById('branchRenameInput');
  if (!branchSelect || !mergeSourceSelect) return;
  const priorSource = mergeSourceSelect.value;
  branchSelect.replaceChildren();
  for (const branch of state.branches) {
    const option = document.createElement('option');
    option.value = branch.id;
    option.textContent = branch.name;
    branchSelect.appendChild(option);
  }
  if (state.branches.some(branch => branch.id === state.activeBranchId)) branchSelect.value = state.activeBranchId;
  mergeSourceSelect.replaceChildren();
  for (const branch of state.branches.filter(item => item.id !== state.activeBranchId)) {
    const option = document.createElement('option');
    option.value = branch.id;
    option.textContent = branch.name;
    mergeSourceSelect.appendChild(option);
  }
  if ([...mergeSourceSelect.options].some(option => option.value === priorSource)) mergeSourceSelect.value = priorSource;
  else if (mergeSourceSelect.options.length) mergeSourceSelect.selectedIndex = 0;
  else mergeSourceSelect.value = '';
  if (renameInput && document.activeElement !== renameInput) renameInput.value = getActiveBranch()?.name || '';
  document.getElementById('btnDeleteBranch').disabled = state.branches.length <= 1;
  document.getElementById('btnMergeBranch').disabled = state.branches.length <= 1 || !mergeSourceSelect.value;
  const strategy = document.getElementById('mergeStrategySelect').value;
  document.getElementById('blendOptions').hidden = strategy !== 'blend';
  const opacity = document.getElementById('blendOpacityInput');
  document.getElementById('blendOpacityValue').textContent = `${opacity.value}%`;
  const message = document.getElementById('branchMessage');
  const active = getActiveBranch();
  if (state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId) {
    const source = state.branches.find(branch => branch.id === state.outputBlend.sourceBranchId);
    message.textContent = source ? `Blending ${source.name} · ${state.outputBlend.mode} · ${Math.round(state.outputBlend.opacity * 100)}%` : '';
    message.title = message.textContent;
  } else if (active) {
    message.textContent = `${active.pipeline.length} step${active.pipeline.length === 1 ? '' : 's'}`;
    message.title = `Active branch: ${active.name}`;
  }
}

function switchBranch(branchId) {
  if (branchId === state.activeBranchId) return;
  if (isOpeningProject || isExportingFrames || isExtracting) {
    showMsg('Wait for the current media operation to finish before switching branches.');
    renderBranchUI();
    return;
  }
  syncActiveBranch();
  syncHistoryToActiveBranch();
  const next = state.branches.find(branch => branch.id === branchId);
  if (!next) return;
  state.activeBranchId = next.id;
  state.pipeline = clonePipeline(next.pipeline);
  state.selectedBlockId = next.selectedBlockId;
  historyPast = next.historyPast || [];
  historyFuture = next.historyFuture || [];
  updateUndoRedoUI();
  renderPipelineUI();
  requestProcess();
  setStatus(`Branch: ${next.name}`);
}

function createBranch() {
  if (isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for the current operation before creating a branch.');
  if (state.branches.length >= MAX_BRANCHES) return showMsg(`A project can contain up to ${MAX_BRANCHES} branches.`);
  syncActiveBranch();
  const parent = getActiveBranch();
  if (!parent) return;
  const branch = makeBranchRecord({
    id: `branch-${generateId()}`,
    name: uniqueBranchName(`Branch ${state.branches.length + 1}`),
    pipeline: state.pipeline,
    selectedBlockId: state.selectedBlockId,
    parentId: parent.id,
    basePipeline: state.pipeline
  });
  state.branches.push(branch);
  switchBranch(branch.id);
  document.getElementById('branchRenameInput').focus();
  document.getElementById('branchRenameInput').select();
  showMsg(`Created ${branch.name} from ${parent.name}.`);
}

function renameActiveBranch() {
  const branch = getActiveBranch();
  const input = document.getElementById('branchRenameInput');
  const value = String(input.value || '').trim();
  if (!branch) return;
  if (!value) return showMsg('Enter a name for this branch.');
  if (value.length > MAX_BRANCH_NAME_LENGTH) return showMsg(`Branch names must be ${MAX_BRANCH_NAME_LENGTH} characters or fewer.`);
  if (state.branches.some(item => item.id !== branch.id && item.name.toLocaleLowerCase() === value.toLocaleLowerCase())) return showMsg('Branch names must be unique.');
  branch.name = value;
  renderBranchUI();
  showMsg(`Renamed branch to ${branch.name}.`);
}

function deleteActiveBranch() {
  syncActiveBranch();
  syncHistoryToActiveBranch();
  if (state.branches.length <= 1) return showMsg('The last branch cannot be deleted.');
  if (isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for the current operation before deleting a branch.');
  const branch = getActiveBranch();
  if (!branch) return;
  if (!window.confirm(`Delete branch “${branch.name}”? This cannot be undone.`)) return;
  const deletingId = branch.id;
  state.branches = state.branches.filter(item => item.id !== deletingId);
  for (const child of state.branches) {
    if (child.parentId === deletingId) {
      child.parentId = null;
      child.basePipeline = [];
    }
  }
  if (state.outputBlend && (state.outputBlend.baseBranchId === deletingId || state.outputBlend.sourceBranchId === deletingId)) state.outputBlend = null;
  const next = state.branches[0];
  state.activeBranchId = next.id;
  state.pipeline = clonePipeline(next.pipeline);
  state.selectedBlockId = next.selectedBlockId;
  historyPast = next.historyPast || [];
  historyFuture = next.historyFuture || [];
  updateUndoRedoUI();
  renderPipelineUI();
  requestProcess();
  showMsg(`Deleted ${branch.name}.`);
}

function pipelineFingerprint(pipeline) {
  return JSON.stringify((pipeline || []).map(block => ({ id: block.id, type: block.type, params: block.params || {} })));
}

function blockContentFingerprint(block) {
  return block ? JSON.stringify({ type: block.type, params: block.params || {} }) : null;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function findThreeWayMergeBase(target, source) {
  if (target.parentId === source.id) return target.basePipeline;
  if (source.parentId === target.id) return source.basePipeline;
  if (target.parentId && target.parentId === source.parentId && pipelineFingerprint(target.basePipeline) === pipelineFingerprint(source.basePipeline)) return target.basePipeline;
  return null;
}

function mergePipelinesThreeWay(basePipeline, targetPipeline, sourcePipeline) {
  const base = new Map(basePipeline.map(block => [block.id, block]));
  const target = new Map(targetPipeline.map(block => [block.id, block]));
  const source = new Map(sourcePipeline.map(block => [block.id, block]));
  const ids = new Set([...base.keys(), ...target.keys(), ...source.keys()]);
  const merged = new Map();
  const conflicts = [];

  for (const id of ids) {
    const baseBlock = base.get(id);
    const targetBlock = target.get(id);
    const sourceBlock = source.get(id);
    if (!baseBlock) {
      if (targetBlock && sourceBlock && blockContentFingerprint(targetBlock) !== blockContentFingerprint(sourceBlock)) {
        conflicts.push(`new step ${targetBlock.type}/${sourceBlock.type}`);
      } else if (targetBlock || sourceBlock) merged.set(id, clonePipeline([targetBlock || sourceBlock])[0]);
      continue;
    }
    if (!targetBlock && !sourceBlock) continue;
    if (!targetBlock) {
      if (blockContentFingerprint(sourceBlock) !== blockContentFingerprint(baseBlock)) conflicts.push(`deleted vs edited ${baseBlock.type}`);
      else continue;
      if (sourceBlock) merged.set(id, clonePipeline([sourceBlock])[0]);
      continue;
    }
    if (!sourceBlock) {
      if (blockContentFingerprint(targetBlock) !== blockContentFingerprint(baseBlock)) conflicts.push(`edited vs deleted ${baseBlock.type}`);
      else continue;
      if (targetBlock) merged.set(id, clonePipeline([targetBlock])[0]);
      continue;
    }
    const targetChanged = blockContentFingerprint(targetBlock) !== blockContentFingerprint(baseBlock);
    const sourceChanged = blockContentFingerprint(sourceBlock) !== blockContentFingerprint(baseBlock);
    if (targetChanged && sourceChanged && blockContentFingerprint(targetBlock) !== blockContentFingerprint(sourceBlock)) {
      conflicts.push(`parameters for ${OPERATIONS[targetBlock.type]?.name || targetBlock.type}`);
      continue;
    }
    merged.set(id, clonePipeline([sourceChanged && !targetChanged ? sourceBlock : targetBlock])[0]);
  }

  if (conflicts.length) return { ok: false, conflicts: [...new Set(conflicts)].slice(0, 5) };

  const baseIds = basePipeline.map(block => block.id);
  const orderFor = (pipeline) => pipeline.filter(block => base.has(block.id)).map(block => block.id);
  const targetOrder = orderFor(targetPipeline);
  const sourceOrder = orderFor(sourcePipeline);
  const targetBaseOrder = baseIds.filter(id => target.has(id));
  const sourceBaseOrder = baseIds.filter(id => source.has(id));
  const targetReordered = !arraysEqual(targetOrder, targetBaseOrder);
  const sourceReordered = !arraysEqual(sourceOrder, sourceBaseOrder);
  if (targetReordered && sourceReordered) {
    const sharedIds = new Set(targetOrder.filter(id => sourceOrder.includes(id)));
    const targetShared = targetOrder.filter(id => sharedIds.has(id));
    const sourceShared = sourceOrder.filter(id => sharedIds.has(id));
    if (!arraysEqual(targetShared, sourceShared)) return { ok: false, conflicts: ['step order changed differently on both branches'] };
  }

  const preferred = targetReordered ? targetPipeline : (sourceReordered ? sourcePipeline : targetPipeline);
  const secondary = preferred === targetPipeline ? sourcePipeline : targetPipeline;
  const orderedIds = [];
  const seen = new Set();
  for (const block of preferred) {
    if (merged.has(block.id) && !seen.has(block.id)) { orderedIds.push(block.id); seen.add(block.id); }
  }
  // Insert contiguous additions from the other branch before their next surviving anchor,
  // rather than blindly placing every source-only step at the very end of the pipeline.
  for (let index = 0; index < secondary.length;) {
    if (seen.has(secondary[index].id) || !merged.has(secondary[index].id)) { index++; continue; }
    const run = [];
    while (index < secondary.length && !seen.has(secondary[index].id) && merged.has(secondary[index].id)) {
      run.push(secondary[index].id);
      index++;
    }
    let nextAnchor = null;
    for (let lookAhead = index; lookAhead < secondary.length; lookAhead++) {
      if (seen.has(secondary[lookAhead].id)) { nextAnchor = secondary[lookAhead].id; break; }
    }
    let insertAt = nextAnchor ? orderedIds.indexOf(nextAnchor) : orderedIds.length;
    if (insertAt < 0) insertAt = orderedIds.length;
    orderedIds.splice(insertAt, 0, ...run);
    for (const id of run) seen.add(id);
  }
  for (const id of merged.keys()) if (!seen.has(id)) orderedIds.push(id);
  return { ok: true, pipeline: orderedIds.map(id => merged.get(id)) };
}

function blendImageData(baseData, sourceData, mode = 'normal', opacity = 0.5) {
  if (!baseData || !sourceData || baseData.width !== sourceData.width || baseData.height !== sourceData.height) {
    throw new Error('The branch outputs have different dimensions and cannot be blended.');
  }
  const output = new ImageData(baseData.width, baseData.height);
  const a = baseData.data, b = sourceData.data, out = output.data;
  const alpha = boundedNumber(opacity, 0, 1, 0.5);
  for (let i = 0; i < a.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const base = a[i + channel], source = b[i + channel];
      let blended = source;
      if (mode === 'multiply') blended = base * source / 255;
      else if (mode === 'screen') blended = 255 - ((255 - base) * (255 - source) / 255);
      else if (mode === 'overlay') blended = base < 128 ? (2 * base * source / 255) : (255 - 2 * (255 - base) * (255 - source) / 255);
      else if (mode === 'difference') blended = Math.abs(base - source);
      else if (mode === 'darken') blended = Math.min(base, source);
      else if (mode === 'lighten') blended = Math.max(base, source);
      out[i + channel] = Math.round(base * (1 - alpha) + blended * alpha);
    }
    out[i + 3] = a[i + 3];
  }
  return output;
}

function applyOutputBlend(baseData, sourceData, outputBlend, canvas) {
  const blended = blendImageData(baseData, sourceData, outputBlend.mode, outputBlend.opacity);
  canvas.width = blended.width;
  canvas.height = blended.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.putImageData(blended, 0, 0);
  return blended;
}

function mergeSelectedBranch() {
  if (isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for the current operation before merging branches.');
  syncActiveBranch();
  const target = getActiveBranch();
  const sourceId = document.getElementById('mergeSourceSelect').value;
  const source = state.branches.find(branch => branch.id === sourceId);
  const strategy = document.getElementById('mergeStrategySelect').value;
  if (!target || !source || source.id === target.id) return showMsg('Choose a different source branch to merge.');

  if (strategy === 'blend') {
    if (!state.mediaType) return showMsg('Open an image or video before blending branch outputs.');
    saveHistory();
    state.outputBlend = {
      baseBranchId: target.id,
      sourceBranchId: source.id,
      mode: VALID_BLEND_MODES.includes(document.getElementById('blendModeSelect').value) ? document.getElementById('blendModeSelect').value : 'normal',
      opacity: Number(document.getElementById('blendOpacityInput').value) / 100
    };
    renderBranchUI();
    requestProcess();
    showMsg(`Blending ${source.name} output into ${target.name}.`);
    return;
  }

  let mergedPipeline;
  if (strategy === 'replace') {
    mergedPipeline = clonePipeline(source.pipeline);
  } else if (strategy === 'append') {
    mergedPipeline = clonePipeline(state.pipeline);
    const appended = clonePipeline(source.pipeline).map(block => ({ ...block, id: `step-${generateId()}` }));
    mergedPipeline.push(...appended);
    if (mergedPipeline.length > 100) return showMsg('This merge would exceed 100 pipeline steps. Remove steps or use another merge strategy.');
  } else {
    const basePipeline = findThreeWayMergeBase(target, source);
    if (!basePipeline) {
      return showMsg('These branches do not have a compatible saved merge base. Use Append or Replace, or create sibling branches from the same base.');
    }
    const result = mergePipelinesThreeWay(basePipeline, state.pipeline, source.pipeline);
    if (!result.ok) return showMsg(`Auto-merge conflict: ${result.conflicts.join('; ')}. Choose Append/Replace or edit one branch first.`);
    mergedPipeline = result.pipeline;
  }
  if (mergedPipeline.length > 100) return showMsg('This merge would exceed 100 pipeline steps. Remove steps or use another merge strategy.');
  saveHistory();
  state.pipeline = clonePipeline(mergedPipeline);
  state.selectedBlockId = null;
  // Pipeline merge is now the new working version; clear a previous visual blend for this target.
  if (state.outputBlend?.baseBranchId === target.id) state.outputBlend = null;
  renderPipelineUI();
  requestProcess();
  showMsg(strategy === 'auto' ? `Merged compatible edits from ${source.name}.` : strategy === 'append' ? `Appended ${source.name}'s pipeline.` : `Replaced the pipeline with ${source.name}.`);
}

// Wire up branch controls only after the corresponding DOM exists.
document.getElementById('branchSelect').addEventListener('change', event => switchBranch(event.target.value));
document.getElementById('btnNewBranch').addEventListener('click', createBranch);
document.getElementById('btnRenameBranch').addEventListener('click', renameActiveBranch);
document.getElementById('btnDeleteBranch').addEventListener('click', deleteActiveBranch);
document.getElementById('btnMergeBranch').addEventListener('click', mergeSelectedBranch);
document.getElementById('mergeStrategySelect').addEventListener('change', renderBranchUI);
document.getElementById('blendModeSelect').addEventListener('change', () => {
  const mode = document.getElementById('blendModeSelect').value;
  if (state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId) {
    saveHistory();
    state.outputBlend.mode = VALID_BLEND_MODES.includes(mode) ? mode : 'normal';
    renderBranchUI(); requestProcess();
  }
});
let blendOpacityHistorySaved = false;
document.getElementById('blendOpacityInput').addEventListener('pointerdown', () => { blendOpacityHistorySaved = false; });
document.getElementById('blendOpacityInput').addEventListener('keydown', () => { blendOpacityHistorySaved = false; });
document.getElementById('blendOpacityInput').addEventListener('change', () => { blendOpacityHistorySaved = false; });
document.getElementById('blendOpacityInput').addEventListener('input', event => {
  document.getElementById('blendOpacityValue').textContent = `${event.target.value}%`;
  if (state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId) {
    if (!blendOpacityHistorySaved) { saveHistory(); blendOpacityHistorySaved = true; }
    state.outputBlend.opacity = Number(event.target.value) / 100;
    requestProcess(); renderBranchUI();
  }
});

document.getElementById('mediaUpload').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (isOpeningProject) { showMsg('Wait until the project finishes opening before changing media.'); e.target.value = ''; return; }

  extractionAbort.abort();
  extractionAbort = new AbortController();
  const token = ++mediaLoadId;
  disposeCurrentMedia();
  state.fileName = file.name;
  state.sourceMediaFile = file;
  state.mediaType = null;
  resetAnnotations();
  state.frames = [];
  state.currentFrameIndex = 0;
  state.lastOrigData = null;
  state.lastProcData = null;
  state.fitOnNextRender = false;
  els.ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  els.timeline.innerHTML = '<div class="timeline-empty-message">Loading media…</div>';
  document.getElementById('btnExportAll').style.display = 'none';
  document.getElementById('btnExportAll').disabled = true;

  try {
    if (file.type.startsWith('video/')) {
      await loadVideo(file, token, extractionAbort.signal);
    } else if (file.type.startsWith('image/')) {
      await loadImage(file, token);
    } else {
      showMsg('Unsupported file format. Choose an image or a browser-supported video.');
      setStatus('Unsupported media format.');
      renderTimeline();
    }
  } catch (error) {
    if (token === mediaLoadId && error.name !== 'AbortError') {
      console.error('Media load failed:', error);
      showMsg(error.message || 'Could not open this media file.');
      setStatus('Media could not be loaded.');
      disposeCurrentMedia();
      state.mediaType = null;
      renderTimeline();
    }
  } finally {
    e.target.value = '';
  }
});

function disposeCurrentMedia() {
  if (state.videoEl) {
    try {
      state.videoEl.pause();
      state.videoEl.removeAttribute('src');
      state.videoEl.load();
    } catch (_) { /* best-effort release */ }
  }
  if (state.mediaObjectUrl) {
    URL.revokeObjectURL(state.mediaObjectUrl);
  }
  state.mediaObjectUrl = null;
  state.videoEl = null;
  state.sourceImage = null;
  state.sourceMediaFile = null;
}

async function loadImage(file, token) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The selected image could not be decoded.'));
      image.src = objectUrl;
    });
    if (token !== mediaLoadId) return;

    state.mediaType = 'image';
    state.activeStageKey = null; state.activeStageView = null; state.activeStageData = null; updateStageViewControls();
    state.stagePreviews = [];
    renderStagePreviewPanel();
    resetBranchesForNewMedia();
    state.sourceImage = img;
    state.frames = [];
    state.currentFrameIndex = 0;
    document.getElementById('btnExportAll').style.display = 'none';
    document.getElementById('btnExportAll').disabled = true;
    setStatus(`Image: ${img.naturalWidth}×${img.naturalHeight}`);
    renderTimeline();
    state.fitOnNextRender = true;
    requestProcess();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function waitForVideoMetadata(video, signal, timeoutMs = 12000) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration)) return;
  await new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onReady = () => {
      if (video.videoWidth > 0 && Number.isFinite(video.duration)) { cleanup(); resolve(); }
      else { cleanup(); reject(new Error('The browser did not return usable video metadata.')); }
    };
    const onError = () => { cleanup(); reject(new Error('The selected video format could not be decoded by this browser.')); };
    const onAbort = () => { cleanup(); reject(new DOMException('Media loading was cancelled.', 'AbortError')); };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error('Timed out while loading video metadata. Try another video format.')); }, timeoutMs);
    if (signal?.aborted) onAbort();
  });
}

async function loadVideo(file, token, signal) {
  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(file);
  state.mediaObjectUrl = objectUrl;
  state.videoEl = video;
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
    setStatus('Loading video metadata…');

  await waitForVideoMetadata(video, signal);
  if (token !== mediaLoadId || signal.aborted) return;
  if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error('This video has invalid dimensions or duration.');
  }

  state.mediaType = 'video';
  state.activeStageKey = null; state.activeStageView = null; state.activeStageData = null; updateStageViewControls();
  state.stagePreviews = [];
  renderStagePreviewPanel();
  resetBranchesForNewMedia();
  document.getElementById('btnExportAll').style.display = 'inline-flex';
  document.getElementById('btnExportAll').disabled = true;
  setStatus(`Video: ${video.videoWidth}×${video.videoHeight}, Duration: ${video.duration.toFixed(2)}s`);
  await extractFrames(signal, token);
}

async function seekVideo(video, time, signal, timeoutMs = 10000) {
  if (!video) throw new Error('No video is loaded.');
  if (signal?.aborted) throw new DOMException('Video operation was cancelled.', 'AbortError');
  const maxTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : Math.max(0, time);
  const target = Math.min(Math.max(0, time), maxTime);
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - target) < 0.001) return;

  await new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onReady = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - target) < 0.05) {
        cleanup(); resolve();
      }
    };
    const onError = () => { cleanup(); reject(new Error('The video failed while seeking to a frame.')); };
    const onAbort = () => { cleanup(); reject(new DOMException('Video operation was cancelled.', 'AbortError')); };
    video.addEventListener('seeked', onReady);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out while seeking to ${target.toFixed(2)} seconds.`)); }, timeoutMs);
    try { video.currentTime = target; }
    catch (error) { cleanup(); reject(error); return; }
    if (signal?.aborted) onAbort();
    else onReady();
  });
}

async function extractFrames(signal, token = mediaLoadId) {
  const video = state.videoEl;
  if (!video) return;
  let fps = Number.parseFloat(document.getElementById('fpsExtract').value) || 5;
  fps = Math.max(1, Math.min(30, fps));
  const totalDuration = video.duration;
  let time = 0;
  state.frames = [];
  state.currentFrameIndex = 0;
  els.timeline.innerHTML = '';

  const thumbW = 140;
  const thumbH = Math.max(1, Math.round(video.videoHeight * (thumbW / video.videoWidth)));
  const canvas = document.createElement('canvas');
  canvas.width = thumbW;
  canvas.height = thumbH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not initialize the video frame canvas.');

  setStatus('Extracting frames…');
  document.getElementById('timelineStatus').textContent = '(Extracting…)';
  const maxFrames = 300;
  let frameIndex = 0;
  isExtracting = true;
  try {
    while (time < totalDuration && frameIndex < maxFrames && !signal.aborted) {
      if (token !== mediaLoadId || video !== state.videoEl) return;
      await seekVideo(video, time, signal);
      ctx.drawImage(video, 0, 0, thumbW, thumbH);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      state.frames.push({ time, url: dataUrl });

      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'frame-thumb' + (frameIndex === 0 ? ' active' : '');
      thumb.setAttribute('aria-label', `Select frame ${frameIndex} at ${time.toFixed(2)} seconds`);
      const image = document.createElement('img');
      image.src = dataUrl;
      image.alt = `Frame ${frameIndex}`;
      const indexLabel = document.createElement('span');
      indexLabel.className = 'frame-idx';
      indexLabel.textContent = `F${frameIndex}`;
      thumb.append(image, indexLabel);
      const selectedIndex = frameIndex;
      thumb.addEventListener('click', () => selectFrame(selectedIndex));
      els.timeline.appendChild(thumb);

      frameIndex += 1;
      time = frameIndex / fps;
      if (frameIndex % 10 === 0) setStatus(`Extracted ${frameIndex} frames…`);
    }
    if (signal.aborted || token !== mediaLoadId) return;
    state.currentFrameIndex = 0;
    updateTimelineUI();
    document.getElementById('btnExportAll').disabled = state.frames.length === 0;
    state.fitOnNextRender = true;
    const capped = time < totalDuration;
    setStatus(`Ready. Extracted ${state.frames.length} frames${capped ? ' (300-frame safety limit reached)' : ''}.`);
    if (capped) showMsg('Frame extraction stopped at 300 frames to limit browser memory use.');
    requestProcess();
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Frame extraction failed:', error);
    els.timeline.innerHTML = '<div class="timeline-empty-message">Frame extraction failed. Try a shorter or browser-compatible video.</div>';
    document.getElementById('timelineStatus').textContent = 'Extraction failed';
    document.getElementById('btnExportAll').disabled = true;
    showMsg(error.message || 'Could not extract video frames.');
    setStatus('Video loaded, but frame extraction failed.');
    state.frames = [];
  } finally {
    isExtracting = false;
  }
}

function renderTimeline() {
  els.timeline.innerHTML = '';
  if (state.mediaType === 'image') {
    els.timeline.innerHTML = '<div class="timeline-empty-message">Static image loaded. Video timeline is disabled.</div>';
    document.getElementById('timelineStatus').textContent = '';
    document.getElementById('frameCounter').textContent = '0 / 0';
  } else if (!state.mediaType) {
    els.timeline.innerHTML = '<div class="timeline-empty-message">No media loaded. Upload an image or video to begin.</div>';
    document.getElementById('timelineStatus').textContent = '';
    document.getElementById('frameCounter').textContent = '0 / 0';
  }
}

function updateTimelineUI() {
  document.getElementById('timelineStatus').textContent = `${state.frames.length} frames`;
  document.getElementById('frameCounter').textContent = `${state.currentFrameIndex} / ${Math.max(0, state.frames.length - 1)}`;
  const thumbs = els.timeline.querySelectorAll('.frame-thumb');
  thumbs.forEach((el, i) => {
    if (i === state.currentFrameIndex) {
      el.classList.add('active'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else el.classList.remove('active');
  });
}

async function selectFrame(idx) {
  if (isExportingFrames || isExtracting || state.mediaType !== 'video' || !state.frames[idx]) return;
  state.currentFrameIndex = Math.max(0, Math.min(state.frames.length - 1, idx));
  updateTimelineUI(); await requestProcess();
}

async function requestProcess() {
  if (!cvReady) return;
  if (isProcessing) { renderRequested = true; return; }
  isProcessing = true;
  els.renderOverlay.style.display = 'flex';
  setTimeout(async () => {
    try {
      await performProcess();
    } catch (error) {
      console.error('Processing failed:', error);
      showMsg(error.message || 'Error during processing.');
    } finally {
      isProcessing = false;
      els.renderOverlay.style.display = 'none';
      if (renderRequested) {
        renderRequested = false;
        requestProcess();
      }
    }
  }, 10);
}

async function getSourceData() {
  if (state.mediaType === 'image' && state.sourceImage) {
    workCanvas.width = state.sourceImage.naturalWidth;
    workCanvas.height = state.sourceImage.naturalHeight;
    workCtx.drawImage(state.sourceImage, 0, 0);
    return workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
  }
  if (state.mediaType === 'video' && state.videoEl && state.frames[state.currentFrameIndex]) {
    await seekVideo(state.videoEl, state.frames[state.currentFrameIndex].time, extractionAbort.signal);
    workCanvas.width = state.videoEl.videoWidth;
    workCanvas.height = state.videoEl.videoHeight;
    workCtx.drawImage(state.videoEl, 0, 0);
    return workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
  }
  return null;
}

async function readVideoFrameData(video, time, signal, canvas) {
  await seekVideo(video, time, signal);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not initialize a canvas to export a video frame.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function matToStageThumbnail(mat) {
  const maxWidth = 172;
  const maxHeight = 76;
  const scale = Math.min(1, maxWidth / mat.cols, maxHeight / mat.rows);
  const width = Math.max(1, Math.round(mat.cols * scale));
  const height = Math.max(1, Math.round(mat.rows * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let previewMat = null;
  let size = null;
  try {
    previewMat = new cv.Mat();
    size = new cv.Size(width, height);
    cv.resize(mat, previewMat, size, 0, 0, cv.INTER_AREA);
    cv.imshow(canvas, previewMat);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    try { previewMat?.delete(); } catch (_) { /* best-effort OpenCV cleanup */ }
    try { size?.delete?.(); } catch (_) { /* best-effort wrapper cleanup */ }
  }
}

function imageDataToStageThumbnail(imageData) {
  const maxWidth = 172;
  const maxHeight = 76;
  const scale = Math.min(1, maxWidth / imageData.width, maxHeight / imageData.height);
  const width = Math.max(1, Math.round(imageData.width * scale));
  const height = Math.max(1, Math.round(imageData.height * scale));
  const thumb = document.createElement('canvas');
  thumb.width = width;
  thumb.height = height;
  const context = thumb.getContext('2d', { willReadFrequently: true });
  const thumbData = context.createImageData(width, height);
  const stride = imageData.width * 4;
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(imageData.height - 1, Math.floor(y * imageData.height / height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(imageData.width - 1, Math.floor(x * imageData.width / width));
      const sourceIndex = sourceY * stride + sourceX * 4;
      const targetIndex = (y * width + x) * 4;
      thumbData.data[targetIndex] = imageData.data[sourceIndex];
      thumbData.data[targetIndex + 1] = imageData.data[sourceIndex + 1];
      thumbData.data[targetIndex + 2] = imageData.data[sourceIndex + 2];
      thumbData.data[targetIndex + 3] = imageData.data[sourceIndex + 3];
    }
  }
  context.putImageData(thumbData, 0, 0);
  return thumb.toDataURL('image/jpeg', 0.78);
}
function runPipelineOnImageData(sourceData, outputCanvas, pipeline = state.pipeline, showOperationErrors = true, onStage = null, branchId = state.activeBranchId) {
  const width = sourceData.width;
  const height = sourceData.height;
  outputCanvas.width = width;
  outputCanvas.height = height;
  let currentMat = cv.matFromImageData(sourceData);
  const emitStage = (kind, stepIndex, label, mat, extra = {}) => {
    if (typeof onStage !== 'function') return;
    try {
      onStage({
        key: kind === 'step' ? `${branchId || 'branch'}:step:${extra.blockId || stepIndex}` : `${branchId || 'branch'}:source`,
        branchId,
        kind,
        stepIndex,
        label,
        thumbnail: matToStageThumbnail(mat),
        ...extra
      });
    } catch (error) {
      // A thumbnail problem must never stop the actual processing pipeline.
      console.warn('Could not render a stage thumbnail:', error);
    }
  };
  try {
    emitStage('source', -1, 'Source', currentMat);
    for (let index = 0; index < pipeline.length; index++) {
      const block = pipeline[index];
      let nextMat;
      try {
        nextMat = processOpenCVBlock(currentMat, block.type, block.params || {});
      } catch (error) {
        console.error(`Processing block ${block.type} failed:`, error);
        if (showOperationErrors) showMsg(`The ${OPERATIONS[block.type]?.name || block.type} operation failed; the previous result was kept.`);
        nextMat = currentMat.clone();
      }
      if (nextMat && nextMat !== currentMat) {
        currentMat.delete();
        currentMat = nextMat;
      }
      emitStage('step', index, `${index + 1}. ${OPERATIONS[block.type]?.name || block.type}`, currentMat, { blockId: block.id, blockType: block.type });
    }
    cv.imshow(outputCanvas, currentMat);
    const context = outputCanvas.getContext('2d', { willReadFrequently: true });
    return context.getImageData(0, 0, width, height);
  } finally {
    if (currentMat) currentMat.delete();
  }
}

function renderStagePreviewPanel() {
  const track = document.getElementById('stagePreviewTrack');
  const count = document.getElementById('stagePreviewCount');
  if (!track || !count) return;
  const stages = Array.isArray(state.stagePreviews) ? state.stagePreviews : [];
  count.textContent = `${stages.length} stage${stages.length === 1 ? '' : 's'}`;
  track.replaceChildren();
  const addEmptyMessage = message => {
    const empty = document.createElement('div');
    empty.className = 'stage-preview-empty';
    empty.textContent = message;
    track.appendChild(empty);
  };
  if (!state.mediaType) {
    addEmptyMessage('Load an image or video to preview the source and each processing stage.');
    return;
  }
  if (!stages.length) {
    addEmptyMessage(cvReady ? 'No stage previews available yet. Add processing steps or wait for processing.' : 'Waiting for the image-processing engine…');
    return;
  }
  stages.forEach(stage => {
    const card = document.createElement('article');
    card.className = 'stage-preview-card' + (state.activeStageKey === stage.key ? ' selected' : '');
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'stage-preview-thumb';
    const image = document.createElement('img');
    image.src = stage.thumbnail;
    image.alt = `${stage.label} preview`;
    image.loading = 'lazy';
    thumbWrap.appendChild(image);
    const label = document.createElement('div');
    label.className = 'stage-preview-label';
    label.title = stage.label;
    label.textContent = stage.label;
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'btn stage-preview-open';
    const isActiveStage = state.activeStageKey === stage.key;
    openButton.textContent = isActiveStage ? 'Viewing in editor' : 'Open in editor';
    openButton.disabled = isActiveStage;
    openButton.setAttribute('aria-pressed', String(isActiveStage));
    openButton.title = isActiveStage ? 'This stage is currently displayed in the main editor' : `Open ${stage.label} in the main editor`;
    openButton.addEventListener('click', () => openStageInMainEditor(stage.key));
    const compareButton = document.createElement('button');
    compareButton.type = 'button';
    compareButton.className = 'btn stage-preview-compare';
    const targetSlot = state.comparisonSlots[state.comparisonTargetSlot];
    compareButton.textContent = targetSlot ? `Replace slot ${state.comparisonTargetSlot + 1}` : `Add to slot ${state.comparisonTargetSlot + 1}`;
    compareButton.dataset.stageKey = stage.key;
    compareButton.title = `${targetSlot ? 'Replace' : 'Add'} the full-resolution ${stage.label} output in comparison slot ${state.comparisonTargetSlot + 1}`;
    compareButton.addEventListener('click', () => addStageToComparison(stage.key));
    card.append(thumbWrap, label, openButton, compareButton);
    track.appendChild(card);
  });
}

function updateStageViewControls() {
  const indicator = document.getElementById('stageViewStatus');
  const returnButton = document.getElementById('btnReturnFinalStage');
  if (!indicator || !returnButton) return;
  const isViewingStage = Boolean(state.activeStageView && state.activeStageData);
  indicator.hidden = !isViewingStage;
  returnButton.hidden = !isViewingStage;
  indicator.textContent = isViewingStage ? `Viewing stage: ${state.activeStageView.label}` : '';
  indicator.title = isViewingStage ? 'The main viewer and Save Frame currently show this intermediate stage.' : '';
}

function openStageInMainEditor(stageKey) {
  const stage = state.stagePreviews.find(item => item.key === stageKey);
  if (!stage) {
    showMsg('That stage preview is no longer available. Wait for processing to finish and try again.');
    return;
  }
  state.activeStageKey = stage.key;
  state.activeStageData = null;
  state.activeStageView = { key: stage.key, branchId: stage.branchId, kind: stage.kind, stepIndex: stage.stepIndex, blockId: stage.blockId || null, sourceBranchId: stage.sourceBranchId || null, label: stage.label };
  renderStagePreviewPanel();
  updateStageViewControls();
  requestProcess();
}

function returnToFinalPipelineOutput() {
  if (!state.activeStageKey) return;
  state.activeStageKey = null;
  state.activeStageView = null;
  state.activeStageData = null;
  renderStagePreviewPanel();
  updateStageViewControls();
  requestProcess();
}

document.getElementById('btnReturnFinalStage').addEventListener('click', returnToFinalPipelineOutput);

function openComparisonWorkspace() {
  const dialog = document.getElementById('comparisonDialog');
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  renderComparisonSlots();
}

function closeComparisonWorkspace() {
  const dialog = document.getElementById('comparisonDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

function comparisonOccupiedCount() {
  return state.comparisonSlots.filter(Boolean).length;
}

function visibleComparisonSlotCount() {
  const highestOccupied = state.comparisonSlots.reduce((last, slot, index) => slot ? index + 1 : last, 0);
  return Math.max(1, highestOccupied, state.comparisonTargetSlot + 1);
}

function clearComparisonSlot(slotIndex = state.comparisonTargetSlot) {
  const index = Number(slotIndex);
  if (!Number.isInteger(index) || index < 0 || index >= 4) return;
  const slot = state.comparisonSlots[index];
  if (slot?.objectUrl) URL.revokeObjectURL(slot.objectUrl);
  state.comparisonSlots[index] = null;
  state.comparisonTargetSlot = index;
  renderComparisonSlots();
  renderStagePreviewPanel();
}

function setComparisonTargetSlot(slotIndex) {
  const index = Number(slotIndex);
  if (!Number.isInteger(index) || index < 0 || index >= 4) return;
  state.comparisonTargetSlot = index;
  renderComparisonSlots();
  renderStagePreviewPanel();
}

function renderComparisonSlots() {
  const grid = document.getElementById('comparisonGrid');
  const status = document.getElementById('comparisonStatus');
  const clearButton = document.getElementById('btnClearComparisonSlot');
  const targetSelect = document.getElementById('comparisonTargetSlot');
  if (!grid || !status || !clearButton || !targetSelect) return;

  const target = state.comparisonSlots[state.comparisonTargetSlot];
  const occupied = comparisonOccupiedCount();
  const visibleCount = visibleComparisonSlotCount();
  grid.replaceChildren();
  grid.dataset.occupied = String(occupied);
  grid.dataset.visible = String(visibleCount);
  targetSelect.value = String(state.comparisonTargetSlot);
  clearButton.disabled = !target;
  clearButton.textContent = `Clear slot ${state.comparisonTargetSlot + 1}`;

  for (let index = 0; index < visibleCount; index++) {
    const slot = state.comparisonSlots[index];
    const article = document.createElement('article');
    article.className = 'comparison-slot' + (index === state.comparisonTargetSlot ? ' comparison-slot-target' : '') + (slot ? ' comparison-slot-filled-card' : ' comparison-slot-empty-card');
    article.setAttribute('aria-label', `Comparison slot ${index + 1}${slot ? `, ${slot.label}` : ', empty'}`);

    const top = document.createElement('div');
    top.className = 'comparison-slot-toolbar';
    const title = document.createElement('strong');
    title.textContent = `Slot ${index + 1}`;
    top.appendChild(title);

    const controls = document.createElement('div');
    controls.className = 'comparison-slot-controls';
    const targetButton = document.createElement('button');
    targetButton.type = 'button';
    targetButton.className = 'btn btn-small comparison-slot-target-button';
    targetButton.textContent = index === state.comparisonTargetSlot ? 'Selected slot' : 'Use this slot';
    targetButton.disabled = index === state.comparisonTargetSlot;
    targetButton.addEventListener('click', () => setComparisonTargetSlot(index));
    controls.appendChild(targetButton);

    if (slot) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-small comparison-slot-remove';
      removeButton.textContent = 'Remove';
      removeButton.title = `Remove image from comparison slot ${index + 1}`;
      removeButton.addEventListener('click', () => clearComparisonSlot(index));
      controls.appendChild(removeButton);
    }
    top.appendChild(controls);
    article.appendChild(top);

    if (!slot) {
      const empty = document.createElement('div');
      empty.className = 'comparison-slot-empty';
      const icon = document.createElement('span');
      icon.className = 'comparison-empty-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '▧';
      const strong = document.createElement('strong');
      strong.textContent = `Slot ${index + 1} is empty`;
      const hint = document.createElement('span');
      hint.textContent = index === state.comparisonTargetSlot
        ? 'Choose Add to slot on any stage preview to place an image here.'
        : 'Select this slot, then add a stage preview to fill it.';
      empty.append(icon, strong, hint);
      article.appendChild(empty);
    } else {
      const imageHeader = document.createElement('div');
      imageHeader.className = 'comparison-image-header';
      const label = document.createElement('strong');
      label.textContent = slot.label;
      const dimensions = document.createElement('span');
      dimensions.className = 'comparison-dimensions';
      dimensions.textContent = `${slot.width.toLocaleString()} × ${slot.height.toLocaleString()}`;
      imageHeader.append(label, dimensions);
      const frame = document.createElement('div');
      frame.className = 'comparison-image-frame';
      const image = document.createElement('img');
      image.src = slot.objectUrl;
      image.alt = `Comparison slot ${index + 1}: ${slot.label}`;
      frame.appendChild(image);
      const footer = document.createElement('div');
      footer.className = 'comparison-image-footer';
      footer.textContent = `${slot.mediaType === 'video' ? `Video frame ${slot.frameIndex}` : 'Image'} · Branch: ${slot.branchName} · Full-resolution snapshot`;
      article.append(imageHeader, frame, footer);
    }
    grid.appendChild(article);
  }

  if (!occupied) {
    status.textContent = `No images yet. Slot ${state.comparisonTargetSlot + 1} is selected.`;
  } else {
    status.textContent = `${occupied} of 4 slots filled · Slot ${state.comparisonTargetSlot + 1} is ${target ? 'selected for replacement' : 'selected for the next image'}.`;
  }
}

function imageDataToPngObjectUrl(imageData) {
  return new Promise((resolve, reject) => {
    const canvas = canvasFromImageData(imageData);
    canvas.toBlob(blob => {
      canvas.width = 1;
      canvas.height = 1;
      if (!blob) {
        reject(new Error('The browser could not create a comparison image.'));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

async function addStageToComparison(stageKey) {
  const stage = state.stagePreviews.find(item => item.key === stageKey);
  if (!stage || !cvReady || !state.mediaType) {
    showMsg('That stage is not ready. Wait for processing to finish and try again.');
    return;
  }
  if (stage.branchId !== state.activeBranchId) {
    showMsg('Switch to the branch that contains this stage before adding it to comparison.');
    return;
  }
  if (isOpeningProject || isExportingFrames || isExtracting || isProcessing) {
    showMsg('Wait for the current media operation to finish before adding a comparison image.');
    return;
  }

  const targetIndex = Number.isInteger(state.comparisonTargetSlot) ? state.comparisonTargetSlot : 0;
  if (targetIndex < 0 || targetIndex >= 4) {
    showMsg('Choose a valid comparison slot.');
    return;
  }
  const branchId = state.activeBranchId;
  const branch = state.branches.find(item => item.id === branchId);
  const branchName = branch?.name || 'Main';
  const frameIndex = state.currentFrameIndex;
  const mediaType = state.mediaType;
  const mediaToken = mediaLoadId;
  const pipelineSnapshot = clonePipeline(state.pipeline);
  const pipelineSignature = JSON.stringify(pipelineSnapshot);
  const outputBlendSignature = JSON.stringify(state.outputBlend);
  const blendSnapshot = state.outputBlend && state.outputBlend.baseBranchId === branchId ? { ...state.outputBlend } : null;
  const blendBranch = blendSnapshot ? state.branches.find(item => item.id === blendSnapshot.sourceBranchId) : null;
  const blendPipeline = blendBranch ? clonePipeline(blendBranch.pipeline) : null;
  const button = [...document.querySelectorAll('.stage-preview-compare')].find(item => item.dataset.stageKey === stageKey);
  if (button) { button.disabled = true; button.textContent = 'Adding…'; }

  try {
    const sourceData = await getSourceData();
    if (!sourceData) throw new Error('No image or selected video frame is available.');
    if (mediaToken !== mediaLoadId || branchId !== state.activeBranchId || frameIndex !== state.currentFrameIndex || mediaType !== state.mediaType) {
      throw new Error('The media or frame changed while preparing the comparison image. Please try again.');
    }
    if (!state.stagePreviews.some(item => item.key === stageKey) || JSON.stringify(state.pipeline) !== pipelineSignature || JSON.stringify(state.outputBlend) !== outputBlendSignature) {
      throw new Error('The selected stage changed while preparing the comparison image. Please try again.');
    }

    let imageData;
    if (stage.kind === 'source') {
      imageData = sourceData;
    } else if (stage.kind === 'step') {
      const stepIndex = pipelineSnapshot.findIndex(block => block.id === stage.blockId);
      if (stepIndex < 0) throw new Error('That processing step is no longer available.');
      const outputCanvas = document.createElement('canvas');
      imageData = runPipelineOnImageData(sourceData, outputCanvas, pipelineSnapshot.slice(0, stepIndex + 1), false, null, branchId);
      outputCanvas.width = 1;
      outputCanvas.height = 1;
    } else if (stage.kind === 'blend') {
      const baseCanvas = document.createElement('canvas');
      const baseData = runPipelineOnImageData(sourceData, baseCanvas, pipelineSnapshot, false, null, branchId);
      baseCanvas.width = 1;
      baseCanvas.height = 1;
      if (blendSnapshot && blendPipeline && blendBranch) {
        const sourceCanvas = document.createElement('canvas');
        const blendData = runPipelineOnImageData(sourceData, sourceCanvas, blendPipeline, false, null, blendBranch.id);
        sourceCanvas.width = 1;
        sourceCanvas.height = 1;
        imageData = blendImageData(baseData, blendData, blendSnapshot.mode, blendSnapshot.opacity);
      } else {
        imageData = baseData;
      }
    } else {
      throw new Error('This stage type cannot be added to comparison yet.');
    }

    const objectUrl = await imageDataToPngObjectUrl(imageData);
    if (mediaToken !== mediaLoadId || branchId !== state.activeBranchId || frameIndex !== state.currentFrameIndex || mediaType !== state.mediaType) {
      URL.revokeObjectURL(objectUrl);
      throw new Error('The workspace changed before the comparison image was ready. Please try again.');
    }
    if (state.comparisonSlots[targetIndex]?.objectUrl) URL.revokeObjectURL(state.comparisonSlots[targetIndex].objectUrl);
    state.comparisonSlots[targetIndex] = {
      objectUrl,
      stageKey: stage.key,
      label: stage.label,
      width: imageData.width,
      height: imageData.height,
      mediaType,
      frameIndex,
      branchId,
      branchName
    };
    // After filling a slot, advance to the next empty one for a quick capture workflow.
    if (state.comparisonTargetSlot === targetIndex) {
      const firstEmpty = state.comparisonSlots.findIndex(item => !item);
      state.comparisonTargetSlot = firstEmpty >= 0 ? firstEmpty : targetIndex;
    }
    renderComparisonSlots();
    renderStagePreviewPanel();
    openComparisonWorkspace();
    showMsg(`Added ${stage.label} to comparison slot ${targetIndex + 1}.`);
  } catch (error) {
    console.error('Could not add stage to comparison:', error);
    showMsg(error.message || 'Could not add this stage to comparison.');
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      const selectedSlot = state.comparisonSlots[state.comparisonTargetSlot];
      button.textContent = selectedSlot ? `Replace slot ${state.comparisonTargetSlot + 1}` : `Add to slot ${state.comparisonTargetSlot + 1}`;
    }
  }
}

document.getElementById('btnOpenComparisonWorkspace').addEventListener('click', openComparisonWorkspace);
document.getElementById('btnCloseComparisonWorkspace').addEventListener('click', closeComparisonWorkspace);
document.getElementById('btnDoneComparisonWorkspace').addEventListener('click', closeComparisonWorkspace);
document.getElementById('btnClearComparisonSlot').addEventListener('click', () => clearComparisonSlot(state.comparisonTargetSlot));
document.getElementById('comparisonTargetSlot').addEventListener('change', event => setComparisonTargetSlot(event.target.value));
document.getElementById('comparisonDialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) closeComparisonWorkspace();
});

function currentDisplayedImageData() {
  return state.activeStageData || state.lastProcData;
}

function safeStageName(label) {
  return String(label || 'stage').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'stage';
}

function selectedStageFileSuffix() {
  if (!state.activeStageView) return state.mediaType === 'video' ? `_frame_${String(state.currentFrameIndex).padStart(4, '0')}` : '_processed';
  return state.mediaType === 'video'
    ? `_frame_${String(state.currentFrameIndex).padStart(4, '0')}_stage_${safeStageName(state.activeStageView.label)}`
    : `_stage_${safeStageName(state.activeStageView.label)}`;
}

function canvasFromImageData(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d', { willReadFrequently: true }).putImageData(imageData, 0, 0);
  return canvas;
}

// Export-only composition: keep processing pixels and the visible overlay independent.
// Draw committed annotations onto a fresh canvas; do not bake selection handles or
// an unfinished pointer preview into the exported image.
function canvasFromImageDataWithAnnotations(imageData, annotations = state.annotations) {
  const canvas = canvasFromImageData(imageData);
  if (!Array.isArray(annotations) || annotations.length === 0) return canvas;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.save();
  for (const annotation of annotations) drawOneAnnotation(context, annotation, canvas.width);
  context.restore();
  return canvas;
}

async function performProcess() {
  const sourceData = await getSourceData();
  if (!sourceData) {
    state.stagePreviews = [];
    state.activeStageKey = null; state.activeStageView = null; state.activeStageData = null;
    renderStagePreviewPanel(); updateStageViewControls();
    els.ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    renderAnnotationOverlay();
    return;
  }

  state.lastOrigData = sourceData;
  const generatedStages = [];
  state.lastProcData = runPipelineOnImageData(sourceData, resultCanvas, state.pipeline, true, stage => generatedStages.push(stage), state.activeBranchId);
  const activeBlend = state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId ? state.outputBlend : null;
  const blendBranch = activeBlend && state.branches.find(branch => branch.id === activeBlend.sourceBranchId);
  if (blendBranch) {
    const blendCanvas = document.createElement('canvas');
    const blendData = runPipelineOnImageData(sourceData, blendCanvas, blendBranch.pipeline, false);
    state.lastProcData = applyOutputBlend(state.lastProcData, blendData, activeBlend, resultCanvas);
    generatedStages.push({
      key: `${state.activeBranchId}:blend:${blendBranch.id}`,
      branchId: state.activeBranchId,
      sourceBranchId: blendBranch.id,
      kind: 'blend',
      stepIndex: state.pipeline.length,
      label: `Blended output · ${blendBranch.name}`,
      thumbnail: imageDataToStageThumbnail(state.lastProcData)
    });
  }
  state.stagePreviews = generatedStages;
  let displayedData = state.lastProcData;
  let selectedStage = state.activeStageKey ? generatedStages.find(stage => stage.key === state.activeStageKey) : null;

  // A stage key includes its branch and (for operation stages) the operation ID.
  // If the user switches branch or deletes the selected operation, return safely to final output.
  if (state.activeStageKey && !selectedStage) {
    state.activeStageKey = null;
    state.activeStageView = null;
    state.activeStageData = null;
    showMsg('The selected stage is no longer available. Showing the final pipeline output.');
  }

  if (selectedStage) {
    state.activeStageView = {
      key: selectedStage.key,
      branchId: selectedStage.branchId,
      kind: selectedStage.kind,
      stepIndex: selectedStage.stepIndex,
      blockId: selectedStage.blockId || null,
      sourceBranchId: selectedStage.sourceBranchId || null,
      label: selectedStage.label
    };
    if (selectedStage.kind === 'source') {
      displayedData = sourceData;
    } else if (selectedStage.kind === 'step') {
      const selectedIndex = state.pipeline.findIndex(block => block.id === selectedStage.blockId);
      if (selectedIndex >= 0) {
        const stageCanvas = document.createElement('canvas');
        displayedData = runPipelineOnImageData(sourceData, stageCanvas, state.pipeline.slice(0, selectedIndex + 1), false, null, state.activeBranchId);
      } else {
        state.activeStageKey = null;
        state.activeStageView = null;
        showMsg('That processing step was removed. Showing the final pipeline output.');
        displayedData = state.lastProcData;
      }
    } else if (selectedStage.kind === 'blend') {
      // lastProcData is already the blended result for this stage.
      displayedData = state.lastProcData;
    }
  } else {
    state.activeStageView = null;
  }
  state.activeStageData = state.activeStageView ? displayedData : null;
  renderStagePreviewPanel();
  updateStageViewControls();

  const width = sourceData.width;
  const height = sourceData.height;
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
    els.overlayCanvas.width = width;
    els.overlayCanvas.height = height;
  }

  drawToViewer(state.lastOrigData, displayedData, width, height);
  calculateStats(displayedData);
  if (state.fitOnNextRender) {
    state.fitOnNextRender = false;
    fitCanvasToViewer();
  }
}

function processOpenCVBlock(src, type, params = {}) {
  // Track all OpenCV-owned wrappers created by this operation. The returned dst is
  // handed to the pipeline; all temporary Mats/vectors/algorithms are released here.
  const allocations = [];
  const own = (resource) => {
    if (resource && typeof resource.delete === 'function') allocations.push(resource);
    return resource;
  };
  const mat = () => own(new cv.Mat());
  const zeros = (rows, cols, typeCode) => own(cv.Mat.zeros(rows, cols, typeCode));
  const ones = (rows, cols, typeCode) => own(cv.Mat.ones(rows, cols, typeCode));
  const vector = () => own(new cv.MatVector());
  const size = (width, height) => own(new cv.Size(width, height));
  const point = (x, y) => own(new cv.Point(x, y));
  const rect = (x, y, width, height) => own(new cv.Rect(x, y, width, height));
  const scalar = (...values) => own(new cv.Scalar(...values));
  let dst = mat();
  let completed = false;

  try {
    if (type === 'grayscale') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'invert') {
      cv.bitwise_not(src, dst);
      // Inverting the alpha channel makes otherwise opaque exports transparent.
      for (let r = 0; r < dst.rows; r++) {
        const sourceRow = src.ucharPtr(r);
        const outputRow = dst.ucharPtr(r);
        for (let c = 0; c < dst.cols; c++) outputRow[c * 4 + 3] = sourceRow[c * 4 + 3];
      }
    } else if (type === 'brightContrast') {
      src.convertTo(dst, -1, Number(params.contrast ?? 1), Number(params.brightness ?? 0));
      for (let r = 0; r < dst.rows; r++) {
        const sourceRow = src.ucharPtr(r);
        const outputRow = dst.ucharPtr(r);
        for (let c = 0; c < dst.cols; c++) outputRow[c * 4 + 3] = sourceRow[c * 4 + 3];
      }
    } else if (type === 'gamma') {
      const gamma = Math.max(0.1, Number(params.gamma) || 1);
      const lut = mat();
      lut.create(1, 256, cv.CV_8UC1);
      for (let i = 0; i < 256; i++) lut.ucharPtr(0)[i] = clamp(Math.round(255 * Math.pow(i / 255, 1 / gamma)));
      // Apply the lookup to RGB only so source alpha is preserved.
      src.copyTo(dst);
      for (let r = 0; r < src.rows; r++) {
        const row = dst.ucharPtr(r);
        for (let c = 0; c < src.cols; c++) {
          for (let ch = 0; ch < 3; ch++) row[c * 4 + ch] = lut.ucharPtr(0)[row[c * 4 + ch]];
        }
      }
    } else if (type === 'histEq') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.equalizeHist(gray, gray);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'clahe') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      const clahe = own(new cv.CLAHE(Number(params.clipLimit) || 2, size(Number(params.tileSize) || 8, Number(params.tileSize) || 8)));
      clahe.apply(gray, gray);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'gaussianBlur') {
      const kernel = Math.max(1, Number(params.kernel) || 5) | 1;
      cv.GaussianBlur(src, dst, size(kernel, kernel), Number(params.sigma) || 0, Number(params.sigma) || 0, cv.BORDER_DEFAULT);
    } else if (type === 'medianBlur') {
      const kernel = Math.max(3, Number(params.kernel) || 3) | 1;
      cv.medianBlur(src, dst, kernel);
    } else if (type === 'sharpen') {
      const blur = mat();
      cv.GaussianBlur(src, blur, size(0, 0), 2);
      const amount = Math.max(0.1, Number(params.amount) || 1);
      cv.addWeighted(src, 1 + amount, blur, -amount, 0, dst);
    } else if (type === 'sobel') {
      const gray = mat();
      const gradient16 = mat();
      const gradient8 = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      const ksize = Number(params.ksize) || 3;
      cv.Sobel(gray, gradient16, cv.CV_16S, Number(params.dx) || 0, Number(params.dy) || 0, ksize, 1, 0, cv.BORDER_DEFAULT);
      cv.convertScaleAbs(gradient16, gradient8);
      cv.cvtColor(gradient8, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'canny') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.Canny(gray, gray, Number(params.t1 ?? 50), Number(params.t2 ?? 150), 3, false);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'morphology') {
      let shape = cv.MORPH_RECT;
      if (params.shape === 'Cross') shape = cv.MORPH_CROSS;
      else if (params.shape === 'Ellipse') shape = cv.MORPH_ELLIPSE;
      const operations = {
        'Erode': cv.MORPH_ERODE, 'Dilate': cv.MORPH_DILATE, 'Open': cv.MORPH_OPEN,
        'Close': cv.MORPH_CLOSE, 'Gradient': cv.MORPH_GRADIENT, 'Top Hat': cv.MORPH_TOPHAT,
        'Black Hat': cv.MORPH_BLACKHAT
      };
      const kernelSize = Math.max(1, Number(params.ksize) || 3) | 1;
      const kernel = own(cv.getStructuringElement(shape, size(kernelSize, kernelSize)));
      cv.morphologyEx(src, dst, operations[params.op] ?? cv.MORPH_OPEN, kernel, point(-1, -1), Math.max(1, Number(params.iters) || 1), cv.BORDER_CONSTANT, own(cv.morphologyDefaultBorderValue()));
    } else if (type === 'threshold') {
      const gray = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      const thresholdTypes = {
        'Binary': cv.THRESH_BINARY, 'Binary Inv': cv.THRESH_BINARY_INV, 'Trunc': cv.THRESH_TRUNC,
        'ToZero': cv.THRESH_TOZERO, 'ToZero Inv': cv.THRESH_TOZERO_INV
      };
      let thresholdType = thresholdTypes[params.type] ?? cv.THRESH_BINARY;
      if (params.type === 'Otsu') thresholdType = cv.THRESH_BINARY | cv.THRESH_OTSU;
      cv.threshold(gray, gray, Number(params.level) || 0, 255, thresholdType);
      cv.cvtColor(gray, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'distTransform') {
      const gray = mat();
      const distance = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      cv.distanceTransform(gray, distance, cv.DIST_L2, 5);
      cv.normalize(distance, distance, 0, 255, cv.NORM_MINMAX, cv.CV_8UC1);
      cv.cvtColor(distance, dst, cv.COLOR_GRAY2RGBA, 0);
    } else if (type === 'connectedComps') {
      const gray = mat();
      const labels = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      const count = cv.connectedComponents(gray, labels, 8, cv.CV_32S);
      dst = zeros(src.rows, src.cols, cv.CV_8UC4);
      const colors = Array.from({ length: count }, (_, index) => index === 0 ? [0, 0, 0, 255] : [Math.random() * 255, Math.random() * 255, Math.random() * 255, 255]);
      for (let r = 0; r < dst.rows; r++) {
        const output = dst.ucharPtr(r);
        for (let c = 0; c < dst.cols; c++) {
          const label = labels.intPtr(r, c)[0];
          const color = colors[label] || [255, 255, 255, 255];
          const offset = c * 4;
          output[offset] = color[0]; output[offset + 1] = color[1]; output[offset + 2] = color[2]; output[offset + 3] = 255;
        }
      }
    } else if (type === 'watershed') {
      const colorImage = mat();
      const gray = mat();
      const threshold = mat();
      const kernel = ones(3, 3, cv.CV_8U);
      const opening = mat();
      const sureBackground = mat();
      const distance = mat();
      const sureForeground = mat();
      const unknown = mat();
      const markers = mat();
      const markerOffset = ones(src.rows, src.cols, cv.CV_32S);
      cv.cvtColor(src, colorImage, cv.COLOR_RGBA2RGB);
      cv.cvtColor(colorImage, gray, cv.COLOR_RGB2GRAY);
      cv.threshold(gray, threshold, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
      cv.morphologyEx(threshold, opening, cv.MORPH_OPEN, kernel, point(-1, -1), 2);
      cv.dilate(opening, sureBackground, kernel, point(-1, -1), 3);
      cv.distanceTransform(opening, distance, cv.DIST_L2, 5);
      const minMax = cv.minMaxLoc(distance);
      cv.threshold(distance, sureForeground, 0.5 * minMax.maxVal, 255, 0);
      sureForeground.convertTo(sureForeground, cv.CV_8U);
      cv.subtract(sureBackground, sureForeground, unknown);
      cv.connectedComponents(sureForeground, markers);
      cv.add(markers, markerOffset, markers);
      for (let r = 0; r < markers.rows; r++) {
        for (let c = 0; c < markers.cols; c++) {
          if (unknown.ucharPtr(r, c)[0] === 255) markers.intPtr(r, c)[0] = 0;
        }
      }
      cv.watershed(colorImage, markers);
      dst = zeros(src.rows, src.cols, cv.CV_8UC4);
      for (let r = 0; r < markers.rows; r++) {
        const output = dst.ucharPtr(r);
        const original = colorImage.ucharPtr(r);
        for (let c = 0; c < markers.cols; c++) {
          const offset = c * 4;
          if (markers.intPtr(r, c)[0] === -1) {
            output[offset] = 255; output[offset + 1] = 255; output[offset + 2] = 255;
          } else {
            output[offset] = original[c * 3]; output[offset + 1] = original[c * 3 + 1]; output[offset + 2] = original[c * 3 + 2];
          }
          output[offset + 3] = 255;
        }
      }
    } else if (type === 'findContours') {
      const gray = mat();
      const contours = vector();
      const hierarchy = mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.Canny(gray, gray, 50, 150, 3, false);
      cv.findContours(gray, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
      src.copyTo(dst);
      const thickness = Number(params.thickness ?? 1);
      const contourColor = scalar(0, 255, 0, 255);
      for (let i = 0; i < contours.size(); i++) {
        cv.drawContours(dst, contours, i, contourColor, thickness, cv.LINE_8, hierarchy, 0);
      }
    } else if (type === 'fftMag') {
      const gray = mat();
      const padded = mat();
      const real = mat();
      const imaginary = zeros(1, 1, cv.CV_32F);
      const inputPlanes = vector();
      const complex = mat();
      const outputPlanes = vector();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      const rows = cv.getOptimalDFTSize(gray.rows);
      const cols = cv.getOptimalDFTSize(gray.cols);
      cv.copyMakeBorder(gray, padded, 0, rows - gray.rows, 0, cols - gray.cols, cv.BORDER_CONSTANT, scalar(0, 0, 0, 0));
      padded.convertTo(real, cv.CV_32F);
      imaginary.create(real.rows, real.cols, cv.CV_32F);
      imaginary.setTo(scalar(0));
      inputPlanes.push_back(real);
      inputPlanes.push_back(imaginary);
      cv.merge(inputPlanes, complex);
      cv.dft(complex, complex);
      cv.split(complex, outputPlanes);
      const realOut = own(outputPlanes.get(0));
      const imagOut = own(outputPlanes.get(1));
      const magnitude = mat();
      cv.magnitude(realOut, imagOut, magnitude);
      const onesMat = ones(magnitude.rows, magnitude.cols, magnitude.type());
      cv.add(magnitude, onesMat, magnitude);
      cv.log(magnitude, magnitude);
      const cropWidth = magnitude.cols & -2;
      const cropHeight = magnitude.rows & -2;
      if (cropWidth < 2 || cropHeight < 2) throw new Error('Image is too small for FFT magnitude.');
      const cropped = own(magnitude.roi(rect(0, 0, cropWidth, cropHeight)));
      const halfWidth = cropped.cols / 2;
      const halfHeight = cropped.rows / 2;
      const q0 = own(cropped.roi(rect(0, 0, halfWidth, halfHeight)));
      const q1 = own(cropped.roi(rect(halfWidth, 0, halfWidth, halfHeight)));
      const q2 = own(cropped.roi(rect(0, halfHeight, halfWidth, halfHeight)));
      const q3 = own(cropped.roi(rect(halfWidth, halfHeight, halfWidth, halfHeight)));
      const temp = mat();
      q0.copyTo(temp); q3.copyTo(q0); temp.copyTo(q3);
      q1.copyTo(temp); q2.copyTo(q1); temp.copyTo(q2);
      cv.normalize(cropped, cropped, 0, 255, cv.NORM_MINMAX);
      const outputGray = mat();
      cropped.convertTo(outputGray, cv.CV_8UC1);
      cv.cvtColor(outputGray, dst, cv.COLOR_GRAY2RGBA);
    } else {
      src.copyTo(dst);
    }

    completed = true;
    return dst;
  } finally {
    // Every temporary resource, including partially-created outputs after exceptions,
    // is released exactly once. Only the final successful output escapes this function.
    const unique = [...new Set(allocations)].reverse();
    for (const resource of unique) {
      if (!completed || resource !== dst) {
        try { resource.delete(); } catch (_) { /* already released by OpenCV */ }
      }
    }
  }
}



function cloneAnnotations(annotations = state.annotations) {
  return JSON.parse(JSON.stringify(annotations));
}

function saveAnnotationHistory() {
  state.annotationUndo.push(cloneAnnotations());
  if (state.annotationUndo.length > 100) state.annotationUndo.shift();
  state.annotationRedo = [];
  state.annotationStyleHistoryOpen = false;
  updateAnnotationControls();
}

function undoAnnotation() {
  if (!state.annotationUndo.length) return;
  state.annotationRedo.push(cloneAnnotations());
  state.annotations = state.annotationUndo.pop();
  if (!state.annotations.some(item => item.id === state.selectedAnnotationId)) state.selectedAnnotationId = null;
  state.currentAnnotation = null;
  state.annotationDrag = null;
  state.annotationStyleHistoryOpen = false;
  renderAnnotationOverlay();
  syncAnnotationEditorFromSelection();
  updateAnnotationControls();
}

function redoAnnotation() {
  if (!state.annotationRedo.length) return;
  state.annotationUndo.push(cloneAnnotations());
  state.annotations = state.annotationRedo.pop();
  if (!state.annotations.some(item => item.id === state.selectedAnnotationId)) state.selectedAnnotationId = null;
  state.currentAnnotation = null;
  state.annotationDrag = null;
  state.annotationStyleHistoryOpen = false;
  renderAnnotationOverlay();
  syncAnnotationEditorFromSelection();
  updateAnnotationControls();
}

function selectedAnnotation() {
  return state.annotations.find(item => item.id === state.selectedAnnotationId) || null;
}

function annotationPointFromEvent(event, clampToCanvas = false) {
  const rect = els.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height || !els.canvas.width || !els.canvas.height) return null;
  const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  if (outside && !clampToCanvas) return null;
  const x = (event.clientX - rect.left) * (els.canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (els.canvas.height / rect.height);
  return {
    x: Math.max(0, Math.min(els.canvas.width, x)),
    y: Math.max(0, Math.min(els.canvas.height, y))
  };
}

function annotationBounds(annotation) {
  if (!annotation || !annotation.start || !annotation.end) return null;
  let left, top, right, bottom;
  if (annotation.type === 'pen' && Array.isArray(annotation.points) && annotation.points.length) {
    left = Infinity; right = -Infinity; top = Infinity; bottom = -Infinity;
    for (const point of annotation.points) {
      left = Math.min(left, point.x); right = Math.max(right, point.x);
      top = Math.min(top, point.y); bottom = Math.max(bottom, point.y);
    }
    const pad = Math.max(1, Number(annotation.width) || 3) / 2;
    left -= pad; top -= pad; right += pad; bottom += pad;
  } else if (annotation.type === 'marker') {
    const radius = Math.max(5, (Number(annotation.width) || 3) * 2.4) + 4;
    left = annotation.start.x - radius; right = annotation.start.x + radius;
    top = annotation.start.y - radius; bottom = annotation.start.y + radius;
  } else if (annotation.type === 'text') {
    const ctx = els.oCtx;
    const fontSize = Math.max(8, Math.min(72, Number(annotation.textSize) || 24));
    ctx.save();
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const width = ctx.measureText(String(annotation.text || '').slice(0, 120)).width;
    ctx.restore();
    const padX = Math.max(3, fontSize * 0.22), padY = Math.max(2, fontSize * 0.16);
    left = annotation.start.x; top = annotation.start.y;
    right = left + width + padX * 2; bottom = top + fontSize + padY * 2;
  } else {
    left = Math.min(annotation.start.x, annotation.end.x);
    right = Math.max(annotation.start.x, annotation.end.x);
    top = Math.min(annotation.start.y, annotation.end.y);
    bottom = Math.max(annotation.start.y, annotation.end.y);
  }
  return { left, top, right, bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function annotationResizeHandle(annotation) {
  if (!annotation) return null;
  if (['line', 'arrow', 'rectangle', 'ellipse'].includes(annotation.type)) return annotation.end;
  const bounds = annotationBounds(annotation);
  return bounds ? { x: bounds.right, y: bounds.bottom } : null;
}

function hitTestAnnotation(point) {
  const tolerance = Math.max(8, 10 / Math.max(0.05, state.zoomLevel));
  for (let i = state.annotations.length - 1; i >= 0; i--) {
    const annotation = state.annotations[i];
    const bounds = annotationBounds(annotation);
    if (bounds && point.x >= bounds.left - tolerance && point.x <= bounds.right + tolerance && point.y >= bounds.top - tolerance && point.y <= bounds.bottom + tolerance) return annotation;
  }
  return null;
}

function isNearAnnotationHandle(point, annotation) {
  const handle = annotationResizeHandle(annotation);
  if (!handle) return false;
  const tolerance = Math.max(10, 13 / Math.max(0.05, state.zoomLevel));
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance;
}

function translateAnnotation(annotation, dx, dy) {
  const moved = JSON.parse(JSON.stringify(annotation));
  const bounds = annotationBounds(annotation);
  if (bounds) {
    dx = Math.max(-bounds.left, Math.min(els.canvas.width - bounds.right, dx));
    dy = Math.max(-bounds.top, Math.min(els.canvas.height - bounds.bottom, dy));
  }
  if (moved.start) { moved.start.x += dx; moved.start.y += dy; }
  if (moved.end) { moved.end.x += dx; moved.end.y += dy; }
  if (Array.isArray(moved.points)) moved.points = moved.points.map(point => ({ x: point.x + dx, y: point.y + dy }));
  return moved;
}

function resizeAnnotationFromDrag(original, point, drag) {
  const resized = JSON.parse(JSON.stringify(original));
  const clampX = value => Math.max(0, Math.min(els.canvas.width, value));
  const clampY = value => Math.max(0, Math.min(els.canvas.height, value));
  if (['line', 'arrow', 'rectangle', 'ellipse'].includes(original.type)) {
    resized.end = { x: clampX(point.x), y: clampY(point.y) };
    return resized;
  }
  if (original.type === 'marker') {
    const delta = ((point.x - drag.startPoint.x) + (point.y - drag.startPoint.y)) / 6;
    resized.width = Math.max(1, Math.min(20, (Number(original.width) || 3) + delta));
    return resized;
  }
  if (original.type === 'text') {
    const delta = ((point.x - drag.startPoint.x) + (point.y - drag.startPoint.y)) / 2;
    resized.textSize = Math.max(8, Math.min(72, Math.round((Number(original.textSize) || 24) + delta)));
    return resized;
  }
  if (original.type === 'pen') {
    const bounds = annotationBounds(original);
    if (!bounds) return resized;
    const newRight = Math.max(bounds.left + 2, clampX(point.x));
    const newBottom = Math.max(bounds.top + 2, clampY(point.y));
    const scaleX = (newRight - bounds.left) / bounds.width;
    const scaleY = (newBottom - bounds.top) / bounds.height;
    const scalePoint = item => ({ x: clampX(bounds.left + (item.x - bounds.left) * scaleX), y: clampY(bounds.top + (item.y - bounds.top) * scaleY) });
    resized.points = (original.points || []).map(scalePoint);
    resized.start = scalePoint(original.start);
    resized.end = scalePoint(original.end);
  }
  return resized;
}

function beginAnnotationSelection(point) {
  const currentSelected = selectedAnnotation();
  if (currentSelected && isNearAnnotationHandle(point, currentSelected)) {
        state.annotationDrag = {
      id: currentSelected.id, mode: 'resize', startPoint: point,
      original: JSON.parse(JSON.stringify(currentSelected)), historySaved: false, moved: false
    };
    return;
  }
  const hit = hitTestAnnotation(point);
  state.selectedAnnotationId = hit ? hit.id : null;
  state.annotationDrag = hit ? {
    id: hit.id, mode: 'move', startPoint: point,
    original: JSON.parse(JSON.stringify(hit)), historySaved: false, moved: false
  } : null;
  syncAnnotationEditorFromSelection();
  renderAnnotationOverlay();
  updateAnnotationControls();
}

function syncAnnotationEditorFromSelection() {
  const annotation = selectedAnnotation();
  if (!annotation) return;
  const tool = document.getElementById('annotationTool').value;
  if (tool !== 'select') return;
  document.getElementById('annotationColor').value = annotation.color || '#ffcc00';
  document.getElementById('annotationWidth').value = String(Math.max(1, Math.min(20, Number(annotation.width) || 3)));
  document.getElementById('annotationWidthValue').textContent = `${document.getElementById('annotationWidth').value} px`;
  if (annotation.type === 'text') {
    document.getElementById('annotationText').value = annotation.text || '';
    document.getElementById('annotationTextSize').value = String(Math.max(8, Math.min(72, Number(annotation.textSize) || 24)));
    document.getElementById('annotationTextSizeValue').textContent = `${document.getElementById('annotationTextSize').value} px`;
    document.getElementById('annotationTextBackground').checked = Boolean(annotation.textBackground);
    document.getElementById('annotationBackgroundColor').value = annotation.backgroundColor || '#111827';
  }
}

function beginSelectedAnnotationStyleHistory() {
  if (!state.annotationMode || document.getElementById('annotationTool').value !== 'select' || !selectedAnnotation()) return false;
  if (!state.annotationStyleHistoryOpen) {
    saveAnnotationHistory();
    state.annotationStyleHistoryOpen = true;
  }
  return true;
}

function applySelectedAnnotationStyle(changes) {
  if (!beginSelectedAnnotationStyleHistory()) return false;
  Object.assign(selectedAnnotation(), changes);
  renderAnnotationOverlay();
  updateAnnotationControls();
  return true;
}

function beginAnnotationFromEvent(event) {
  if (!state.annotationMode || event.button !== 0 || !state.mediaType) return false;
  // Keep the split-view handle's drag behavior isolated from drawing.
  if (event.target === els.splitHandle) return false;
  const point = annotationPointFromEvent(event, false);
  if (!point) return false;
  const tool = document.getElementById('annotationTool').value;
  if (tool === 'select') {
    beginAnnotationSelection(point);
    event.preventDefault();
    return true;
  }
  state.selectedAnnotationId = null;
  const color = document.getElementById('annotationColor').value || '#ffcc00';
  const annotation = {
    id: generateId(), type: tool,
    color,
    width: Number(document.getElementById('annotationWidth').value) || 3,
    start: point, end: point,
    points: tool === 'pen' ? [point] : []
  };
  state.annotationTool = tool;
  state.annotationColor = color;
  state.annotationWidth = annotation.width;

  // Point markers and labels are placed with a click; shape tools remain drag-based.
  if (tool === 'marker') {
    saveAnnotationHistory();
    state.annotations.push(annotation);
    renderAnnotationOverlay();
    updateAnnotationControls();
    event.preventDefault();
    return true;
  }
  if (tool === 'text') {
    const label = document.getElementById('annotationText').value.trim().slice(0, 120);
    if (!label) {
      showMsg('Enter label text before placing it.');
      document.getElementById('annotationText').focus();
      event.preventDefault();
      return true;
    }
    annotation.text = label;
    annotation.textSize = Math.max(8, Math.min(72, Number(document.getElementById('annotationTextSize').value) || 24));
    annotation.textBackground = document.getElementById('annotationTextBackground').checked;
    annotation.backgroundColor = document.getElementById('annotationBackgroundColor').value || '#111827';
    saveAnnotationHistory();
    state.annotations.push(annotation);
    renderAnnotationOverlay();
    updateAnnotationControls();
    event.preventDefault();
    return true;
  }

  saveAnnotationHistory();
  state.currentAnnotation = annotation;
  renderAnnotationOverlay();
  event.preventDefault();
  return true;
}

function drawOneAnnotation(ctx, annotation, canvasWidth = els.overlayCanvas.width) {
  if (!annotation || !annotation.start || !annotation.end) return;
  const start = annotation.start;
  const end = annotation.end;
  ctx.save();
  ctx.strokeStyle = annotation.color || '#ffcc00';
  ctx.fillStyle = annotation.color || '#ffcc00';
  ctx.lineWidth = Math.max(1, Number(annotation.width) || 3);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (annotation.type === 'marker') {
    const x = start.x, y = start.y;
    const radius = Math.max(5, ctx.lineWidth * 2.4);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = Math.max(2, Number(annotation.width) + 2);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.moveTo(x - radius - 4, y); ctx.lineTo(x + radius + 4, y);
    ctx.moveTo(x, y - radius - 4); ctx.lineTo(x, y + radius + 4);
    ctx.stroke();
    ctx.strokeStyle = annotation.color || '#ffcc00';
    ctx.lineWidth = Math.max(1, Number(annotation.width) || 3);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.moveTo(x - radius - 4, y); ctx.lineTo(x + radius + 4, y);
    ctx.moveTo(x, y - radius - 4); ctx.lineTo(x, y + radius + 4);
    ctx.stroke();
  } else if (annotation.type === 'text') {
    const label = String(annotation.text || '').slice(0, 120);
    const fontSize = Math.max(8, Math.min(72, Number(annotation.textSize) || 24));
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const metrics = ctx.measureText(label);
    const padX = Math.max(3, fontSize * 0.22);
    const padY = Math.max(2, fontSize * 0.16);
    if (annotation.textBackground) {
      ctx.fillStyle = annotation.backgroundColor || '#111827';
      ctx.fillRect(start.x, start.y, metrics.width + padX * 2, fontSize + padY * 2);
    }
    ctx.fillStyle = annotation.color || '#ffcc00';
    ctx.fillText(label, start.x + padX, start.y + padY, Math.max(1, canvasWidth - start.x - padX));
  } else if (annotation.type === 'pen') {
    const points = Array.isArray(annotation.points) ? annotation.points : [];
    if (points.length <= 1) {
      const p = points[0] || start;
      ctx.arc(p.x, p.y, Math.max(0.75, ctx.lineWidth / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }
  } else if (annotation.type === 'line') {
    ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
  } else if (annotation.type === 'arrow') {
    ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headSize = Math.max(8, ctx.lineWidth * 3.2);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headSize * Math.cos(angle - Math.PI / 6), end.y - headSize * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headSize * Math.cos(angle + Math.PI / 6), end.y - headSize * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  } else if (annotation.type === 'rectangle') {
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (annotation.type === 'ellipse') {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const radiusX = Math.max(0.5, Math.abs(end.x - start.x) / 2);
    const radiusY = Math.max(0.5, Math.abs(end.y - start.y) / 2);
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAnnotationSelection(ctx, annotation) {
  const bounds = annotationBounds(annotation);
  const handle = annotationResizeHandle(annotation);
  if (!bounds || !handle) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#54a6ff';
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(bounds.left - 4, bounds.top - 4, bounds.width + 8, bounds.height + 8);
  ctx.setLineDash([]);
  const size = Math.max(6, 8 / Math.max(0.05, state.zoomLevel));
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1f6feb';
  ctx.lineWidth = Math.max(1, 1.5 / Math.max(0.05, state.zoomLevel));
  ctx.fillRect(handle.x - size / 2, handle.y - size / 2, size, size);
  ctx.strokeRect(handle.x - size / 2, handle.y - size / 2, size, size);
  ctx.restore();
}

function renderAnnotationOverlay() {
  if (!els.overlayCanvas || !els.oCtx) return;
  if (els.overlayCanvas.width !== els.canvas.width) els.overlayCanvas.width = els.canvas.width;
  if (els.overlayCanvas.height !== els.canvas.height) els.overlayCanvas.height = els.canvas.height;
  els.oCtx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
  for (const annotation of state.annotations) drawOneAnnotation(els.oCtx, annotation);
  if (state.currentAnnotation) drawOneAnnotation(els.oCtx, state.currentAnnotation);
  const selected = selectedAnnotation();
  if (state.annotationMode && document.getElementById('annotationTool').value === 'select' && selected) drawAnnotationSelection(els.oCtx, selected);
}

function updateAnnotationControls() {
  const toggle = document.getElementById('btnAnnotationMode');
  const undoButton = document.getElementById('btnUndoAnnotation');
  const redoButton = document.getElementById('btnRedoAnnotation');
  const deleteButton = document.getElementById('btnDeleteAnnotation');
  const clearButton = document.getElementById('btnClearAnnotations');
  const hint = document.getElementById('annotationHint');
  const count = state.annotations.length;
  const tool = document.getElementById('annotationTool').value;
  const selected = selectedAnnotation();
  const editingSelectedText = state.annotationMode && tool === 'select' && selected && selected.type === 'text';
  document.querySelectorAll('.annotation-text-control').forEach(control => { control.hidden = !(tool === 'text' || editingSelectedText); });
  toggle.disabled = !state.mediaType;
  toggle.textContent = state.annotationMode ? 'Annotation mode on' : 'Enable annotations';
  toggle.setAttribute('aria-pressed', String(state.annotationMode));
  toggle.classList.toggle('active', state.annotationMode);
  undoButton.disabled = state.annotationUndo.length === 0;
  redoButton.disabled = state.annotationRedo.length === 0;
  deleteButton.disabled = !(state.annotationMode && tool === 'select' && selected);
  clearButton.disabled = count === 0;
  const placementHint = (tool === 'marker' || tool === 'text') ? 'Click the image to place it.' : 'Drag on the image to draw.';
  hint.textContent = !state.mediaType
    ? 'Load media, then enable annotations.'
        : !state.annotationMode
      ? `${count} mark${count === 1 ? '' : 's'} on this media. Enable annotations to edit.`
      : tool === 'select'
        ? (selected ? `Selected ${selected.type}. Drag to move; drag the handle to resize. Use controls to edit style; Delete removes it.` : 'Click a mark to select it. Drag the selected mark to move or its handle to resize.')
        : `${placementHint} ${count} mark${count === 1 ? '' : 's'} added.`;
  els.viewerContainer.classList.toggle('annotation-active', state.annotationMode);
  els.viewerContainer.classList.toggle('annotation-select-mode', state.annotationMode && tool === 'select');
}

function resetAnnotations() {
  state.annotations = [];
  state.currentAnnotation = null;
  state.selectedAnnotationId = null;
  state.annotationDrag = null;
  state.annotationUndo = [];
  state.annotationRedo = [];
  state.annotationStyleHistoryOpen = false;
  state.annotationMode = false;
  renderAnnotationOverlay();
  updateAnnotationControls();
}

document.getElementById('btnAnnotationMode').addEventListener('click', () => {
  if (!state.mediaType) return;
  state.currentAnnotation = null;
  state.annotationDrag = null;
  state.annotationMode = !state.annotationMode;
  updateAnnotationControls();
  renderAnnotationOverlay();
});
document.getElementById('annotationTool').addEventListener('change', event => {
  state.annotationTool = event.target.value;
  state.annotationStyleHistoryOpen = false;
  syncAnnotationEditorFromSelection();
  updateAnnotationControls();
  renderAnnotationOverlay();
});
document.getElementById('annotationColor').addEventListener('input', event => {
  state.annotationColor = event.target.value;
  applySelectedAnnotationStyle({ color: event.target.value });
});
document.getElementById('annotationWidth').addEventListener('input', event => {
  state.annotationWidth = Number(event.target.value);
  document.getElementById('annotationWidthValue').textContent = `${state.annotationWidth} px`;
  applySelectedAnnotationStyle({ width: state.annotationWidth });
});
document.getElementById('annotationText').addEventListener('input', event => {
  state.annotationText = event.target.value.slice(0, 120);
  applySelectedAnnotationStyle({ text: state.annotationText });
});
document.getElementById('annotationTextSize').addEventListener('input', event => {
  state.annotationTextSize = Number(event.target.value);
  document.getElementById('annotationTextSizeValue').textContent = `${state.annotationTextSize} px`;
  applySelectedAnnotationStyle({ textSize: state.annotationTextSize });
});
document.getElementById('annotationTextBackground').addEventListener('change', event => {
  state.annotationTextBackground = event.target.checked;
  applySelectedAnnotationStyle({ textBackground: state.annotationTextBackground });
  state.annotationStyleHistoryOpen = false;
});
document.getElementById('annotationBackgroundColor').addEventListener('input', event => {
  state.annotationBackgroundColor = event.target.value;
  applySelectedAnnotationStyle({ backgroundColor: event.target.value });
});
['annotationColor', 'annotationWidth', 'annotationText', 'annotationTextSize', 'annotationBackgroundColor'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => { state.annotationStyleHistoryOpen = false; });
  document.getElementById(id).addEventListener('blur', () => { state.annotationStyleHistoryOpen = false; });
});
document.getElementById('btnUndoAnnotation').addEventListener('click', undoAnnotation);
document.getElementById('btnRedoAnnotation').addEventListener('click', redoAnnotation);
document.getElementById('btnDeleteAnnotation').addEventListener('click', () => {
  if (!selectedAnnotation()) return;
  saveAnnotationHistory();
  state.annotations = state.annotations.filter(item => item.id !== state.selectedAnnotationId);
  state.selectedAnnotationId = null;
  renderAnnotationOverlay();
  syncAnnotationEditorFromSelection();
  updateAnnotationControls();
  showMsg('Selected annotation deleted.');
});
document.getElementById('btnClearAnnotations').addEventListener('click', () => {
  if (!state.annotations.length) return;
  saveAnnotationHistory();
  state.annotations = [];
  state.currentAnnotation = null;
  state.annotationDrag = null;
  state.selectedAnnotationId = null;
  renderAnnotationOverlay();
  updateAnnotationControls();
  showMsg('Annotations cleared.');
});

function drawAnnotationWhileDragging(event) {
  const drag = state.annotationDrag;
  if (!drag) return;
  const point = annotationPointFromEvent(event, true);
  if (!point) return;
  const distance = Math.hypot(point.x - drag.startPoint.x, point.y - drag.startPoint.y);
  if (distance > 1.5 && !drag.historySaved) {
    saveAnnotationHistory();
    drag.historySaved = true;
  }
  if (!drag.historySaved) return;
  const index = state.annotations.findIndex(item => item.id === drag.id);
  if (index < 0) { state.annotationDrag = null; return; }
  state.annotations[index] = drag.mode === 'move'
    ? translateAnnotation(drag.original, point.x - drag.startPoint.x, point.y - drag.startPoint.y)
    : resizeAnnotationFromDrag(drag.original, point, drag);
  drag.moved = true;
  renderAnnotationOverlay();
}

let isPanning = false, isDraggingSplit = false;
let startX, startY, startPanX, startPanY;
els.viewerContainer.addEventListener('contextmenu', e => e.preventDefault());
els.viewerContainer.addEventListener('mousedown', (e) => {
  if (e.button === 0 && beginAnnotationFromEvent(e)) return;
  if (e.button === 2) {
    isPanning = true; startX = e.clientX; startY = e.clientY;
    startPanX = state.panX; startPanY = state.panY;
    els.viewerContainer.style.cursor = 'grabbing';
  }
});
els.splitHandle.addEventListener('mousedown', (e) => {
  if (e.button === 0 && state.viewMode === 'split') {
    isDraggingSplit = true;
    e.preventDefault();
  }
});
window.addEventListener('mousemove', (e) => {
  if (state.annotationDrag) {
    drawAnnotationWhileDragging(e);
  } else if (state.currentAnnotation) {
    const point = annotationPointFromEvent(e, true);
    if (point) {
      const annotation = state.currentAnnotation;
      annotation.end = point;
      if (annotation.type === 'pen') {
        const points = annotation.points;
        const last = points[points.length - 1];
        const distance = last ? Math.hypot(point.x - last.x, point.y - last.y) : Infinity;
        if (distance >= 1.25) points.push(point);
      }
      renderAnnotationOverlay();
    }
  } else if (isPanning) {
    state.panX = startPanX + (e.clientX - startX);
    state.panY = startPanY + (e.clientY - startY);
    applyZoom();
  } else if (isDraggingSplit) {
    const rect = els.canvasWrapper.getBoundingClientRect();
    if (rect.width > 0) state.splitPosition = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    els.splitHandle.style.left = `${state.splitPosition * 100}%`;
    if(state.lastOrigData) drawToViewer(state.lastOrigData, currentDisplayedImageData(), els.canvas.width, els.canvas.height);
  }
});
window.addEventListener('mouseup', (event) => {
  if (state.annotationDrag) {
    const drag = state.annotationDrag;
    state.annotationDrag = null;
    if (drag.moved) {
      renderAnnotationOverlay();
      updateAnnotationControls();
    }
  }
  if (state.currentAnnotation) {
    const point = annotationPointFromEvent(event, true);
    if (point) state.currentAnnotation.end = point;
    state.annotations.push(state.currentAnnotation);
    state.currentAnnotation = null;
    renderAnnotationOverlay();
    updateAnnotationControls();
  }
  isPanning = false;
  isDraggingSplit = false;
  els.viewerContainer.style.cursor = state.annotationMode ? 'crosshair' : '';
});

document.addEventListener('keydown', event => {
  if (!state.annotationMode || document.getElementById('annotationTool').value !== 'select') return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnnotation()) {
    event.preventDefault();
    document.getElementById('btnDeleteAnnotation').click();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoAnnotation(); else undoAnnotation();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redoAnnotation();
  }
});

function drawToViewer(origImgData, procImgData, w, h) {
  if (!origImgData || !procImgData) return;
  els.ctx.clearRect(0,0,w,h);
  els.splitHandle.style.display = 'none';

  if (state.viewMode === 'processed') {
    els.ctx.putImageData(procImgData, 0, 0);
  } else if (state.viewMode === 'original') {
    els.ctx.putImageData(origImgData, 0, 0);
  } else if (state.viewMode === 'split') {
    els.ctx.putImageData(origImgData, 0, 0);
    const splitX = Math.floor(w * state.splitPosition);
    els.ctx.putImageData(procImgData, 0, 0, splitX, 0, w - splitX, h);

    els.splitHandle.style.display = 'block';
    els.splitHandle.style.left = `${state.splitPosition * 100}%`;
  }
  renderAnnotationOverlay();
}

function fitCanvasToViewer() {
  if ((!state.sourceImage && !state.videoEl) || !els.canvas.width || !els.canvas.height) return;
  const cw = Math.max(1, els.viewerContainer.clientWidth - 32);
  const ch = Math.max(1, els.viewerContainer.clientHeight - 32);
  const iw = els.canvas.width;
  const ih = els.canvas.height;
  state.zoomLevel = Math.min(cw / iw, ch / ih, 1.0);
  state.panX = (els.viewerContainer.clientWidth - (iw * state.zoomLevel)) / 2;
  state.panY = (els.viewerContainer.clientHeight - (ih * state.zoomLevel)) / 2;
  applyZoom();
}

document.getElementById('btnFit').addEventListener('click', fitCanvasToViewer);
document.getElementById('btnZoomIn').addEventListener('click', () => { state.zoomLevel = Math.min(8, state.zoomLevel * 1.2); applyZoom(); });
document.getElementById('btnZoomOut').addEventListener('click', () => { state.zoomLevel = Math.max(0.05, state.zoomLevel / 1.2); applyZoom(); });

function applyZoom() {
  const transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoomLevel})`;
  els.canvasWrapper.style.transform = transform;
}

function calculateStats(imgData) {
  const d = imgData.data; let sum = 0, sumSq = 0, min = 255, max = 0;
  const hist = new Uint32Array(256), pixels = d.length / 4;
  for(let i=0; i<d.length; i+=4) { const v = Math.round(luma(d[i],d[i+1],d[i+2])); sum+=v; sumSq+=v*v; if(v<min)min=v; if(v>max)max=v; hist[v]++; }
  const mean = sum/pixels, std = Math.sqrt(Math.max(0, (sumSq/pixels)-(mean*mean)));

  document.getElementById('statMean').textContent = mean.toFixed(1);
  document.getElementById('statStd').textContent = std.toFixed(1);
  document.getElementById('statMin').textContent = min;
  document.getElementById('statMax').textContent = max;
    els.hctx.clearRect(0, 0, els.histCanvas.width, els.histCanvas.height);
  const maxH = Math.max(...hist); if (maxH === 0) return;
  els.hctx.fillStyle = '#2f81f7';
  for(let i=0; i<256; i++) { const h = (hist[i]/maxH)*els.histCanvas.height; els.hctx.fillRect(i*(els.histCanvas.width/256), els.histCanvas.height-h, Math.ceil(els.histCanvas.width/256), h); }
}

document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
    const button = e.currentTarget;
    button.classList.add('active'); state.viewMode = button.dataset.view;
    if (state.lastOrigData) drawToViewer(state.lastOrigData, currentDisplayedImageData(), els.canvas.width, els.canvas.height);
  });
});

document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnClearPipe').addEventListener('click', () => { if (!state.pipeline.length) return; saveHistory(); state.pipeline = []; state.selectedBlockId = null; renderPipelineUI(); requestProcess(); });

document.getElementById('btnPrevFrame').addEventListener('click', () => { if (state.currentFrameIndex > 0) selectFrame(state.currentFrameIndex - 1); });
document.getElementById('btnNextFrame').addEventListener('click', () => { if (state.currentFrameIndex < state.frames.length - 1) selectFrame(state.currentFrameIndex + 1); });

async function findExtremeFrame(isBrightest) {
  if (state.mediaType !== 'video' || state.frames.length === 0 || isExportingFrames || isExtracting) return;
  setStatus(`Finding ${isBrightest ? 'brightest' : 'darkest'} frame…`);
  let extremeValue = isBrightest ? -1 : 256;
  let bestIndex = 0;
  const video = state.videoEl;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  try {
    for (let i = 0; i < state.frames.length; i++) {
      await seekVideo(video, state.frames[i].time, extractionAbort.signal);
      context.drawImage(video, 0, 0, 64, 64);
      const data = context.getImageData(0, 0, 64, 64).data;
      let sum = 0;
      for (let k = 0; k < data.length; k += 4) sum += luma(data[k], data[k + 1], data[k + 2]);
      const mean = sum / (data.length / 4);
      if ((isBrightest && mean > extremeValue) || (!isBrightest && mean < extremeValue)) {
        extremeValue = mean;
        bestIndex = i;
      }
    }
    await selectFrame(bestIndex);
    setStatus(`${isBrightest ? 'Brightest' : 'Darkest'} frame is F${bestIndex}`);
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Extreme frame search failed:', error);
      showMsg(error.message || 'Could not search the sampled frames.');
    }
  }
}

document.getElementById('btnBrightest').addEventListener('click', () => findExtremeFrame(true));
document.getElementById('btnDarkest').addEventListener('click', () => findExtremeFrame(false));

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeBaseName(name) {
  return (name || 'media').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80) || 'media';
}

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') return reject(new Error('This browser does not support canvas image export.'));
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')), type);
  });
}

document.getElementById('btnSaveImg').addEventListener('click', async () => {
  const imageData = currentDisplayedImageData();
  if (!state.mediaType || !imageData) return showMsg('Load an image or video and wait for processing first.');
  try {
    const exportCanvas = canvasFromImageDataWithAnnotations(imageData);
    const blob = await canvasToBlob(exportCanvas, 'image/png');
    downloadBlob(blob, `${safeBaseName(state.fileName)}${selectedStageFileSuffix()}.png`);
    if (state.annotations.length) {
      showMsg(`Saved PNG with ${state.annotations.length} annotation${state.annotations.length === 1 ? '' : 's'}.`);
    } else if (state.activeStageView) {
      showMsg(`Saved selected stage: ${state.activeStageView.label}`);
    }
  } catch (error) {
    showMsg(error.message || 'Could not export this image.');
  }
});

async function exportAllFrames() {
  if (isExportingFrames) return;
  if (state.mediaType !== 'video' || !state.videoEl || !state.frames.length) return showMsg('Load a video and extract frames first.');
  if (!window.JSZip) return showMsg('ZIP support could not load. Check your internet connection and reload the editor.');
  if (!cvReady) return showMsg('The image-processing engine is still loading.');
  const estimatedBytes = state.videoEl.videoWidth * state.videoEl.videoHeight * 4 * state.frames.length;
  const safeExportLimit = 600 * 1024 * 1024;
  if (estimatedBytes > safeExportLimit) {
    const mib = Math.round(estimatedBytes / (1024 * 1024));
    return showMsg(`This export may need about ${mib} MiB of raw frame memory. Lower Extract FPS or use a shorter video before exporting.`);
  }

  const fullPipelineSnapshot = clonePipeline(state.pipeline);
  const stageSnapshot = state.activeStageView ? { ...state.activeStageView } : null;
  let pipelineSnapshot = fullPipelineSnapshot;
  if (stageSnapshot?.kind === 'source') {
    pipelineSnapshot = [];
  } else if (stageSnapshot?.kind === 'step') {
    const selectedIndex = fullPipelineSnapshot.findIndex(block => block.id === stageSnapshot.blockId);
    if (selectedIndex < 0) return showMsg('The selected stage is no longer in the current pipeline. Return to final output and try again.');
    pipelineSnapshot = fullPipelineSnapshot.slice(0, selectedIndex + 1);
  }
  const shouldApplyBlend = !stageSnapshot || stageSnapshot.kind === 'blend';
  const outputBlendSnapshot = shouldApplyBlend && state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId ? { ...state.outputBlend } : null;
  const outputBlendBranch = outputBlendSnapshot ? state.branches.find(branch => branch.id === outputBlendSnapshot.sourceBranchId) : null;
  const blendPipelineSnapshot = outputBlendBranch ? clonePipeline(outputBlendBranch.pipeline) : null;

  isExportingFrames = true;
  const exportButton = document.getElementById('btnExportAll');
  const originalLabel = exportButton.textContent;
  const sourceVideo = state.videoEl;
  const sourceToken = mediaLoadId;
  const signal = extractionAbort.signal;
  const exportVideo = document.createElement('video');
  exportVideo.preload = 'auto';
  exportVideo.muted = true;
  exportVideo.playsInline = true;
  exportVideo.src = state.mediaObjectUrl;
  const zip = new JSZip();
  const frameCanvas = document.createElement('canvas');
  const outputCanvas = document.createElement('canvas');
  const blendBranchCanvas = document.createElement('canvas');
  exportButton.disabled = true;
  document.getElementById('btnSaveImg').disabled = true;
  document.getElementById('btnBrightest').disabled = true;
  document.getElementById('btnDarkest').disabled = true;
  document.getElementById('btnPrevFrame').disabled = true;
  document.getElementById('btnNextFrame').disabled = true;
  try {
    await waitForVideoMetadata(exportVideo, signal);
    for (let i = 0; i < state.frames.length; i++) {
      if (signal.aborted || sourceToken !== mediaLoadId || sourceVideo !== state.videoEl) {
        throw new DOMException('Frame export cancelled because the media changed.', 'AbortError');
      }
      const sourceData = await readVideoFrameData(exportVideo, state.frames[i].time, signal, frameCanvas);
      const processedData = runPipelineOnImageData(sourceData, outputCanvas, pipelineSnapshot, false);
      if (outputBlendSnapshot && blendPipelineSnapshot) {
        const sourceBranchData = runPipelineOnImageData(sourceData, blendBranchCanvas, blendPipelineSnapshot, false);
        const combinedData = blendImageData(processedData, sourceBranchData, outputBlendSnapshot.mode, outputBlendSnapshot.opacity);
        outputCanvas.width = combinedData.width; outputCanvas.height = combinedData.height;
        outputCanvas.getContext('2d', { willReadFrequently: true }).putImageData(combinedData, 0, 0);
      }
      const imageBlob = await canvasToBlob(outputCanvas);
      const innerStagePrefix = stageSnapshot ? `stage_${safeStageName(stageSnapshot.label)}_` : '';
      zip.file(`${innerStagePrefix}frame_${String(i).padStart(4, '0')}_${state.frames[i].time.toFixed(2)}s.png`, imageBlob);
      exportButton.textContent = `Exporting ${i + 1}/${state.frames.length}…`;
      setStatus(`Preparing ${stageSnapshot ? `stage “${stageSnapshot.label}”` : 'processed frame'} ${i + 1} of ${state.frames.length}…`);
    }
    exportButton.textContent = 'Building ZIP…';
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, metadata => {
      setStatus(`Building ZIP… ${Math.round(metadata.percent)}%`);
    });
    const zipSuffix = stageSnapshot ? `_stage_${safeStageName(stageSnapshot.label)}_frames` : '_processed_frames';
    downloadBlob(zipBlob, `${safeBaseName(state.fileName)}${zipSuffix}.zip`);
    const exportDescription = stageSnapshot ? `stage “${stageSnapshot.label}”` : 'processed output';
    showMsg(`Exported ${state.frames.length} frames for ${exportDescription}.`);
    setStatus(`Exported ${state.frames.length} frames for ${exportDescription}.`);
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Export all frames failed:', error);
      showMsg(error.message || 'Could not export all frames. Try fewer sampled frames or a shorter video.');
      setStatus('Frame export failed.');
    } else {
      showMsg('Frame export cancelled because the loaded media changed.');
    }
  } finally {
    try { exportVideo.pause(); exportVideo.removeAttribute('src'); exportVideo.load(); } catch (_) { /* best-effort release */ }
    isExportingFrames = false;
    exportButton.disabled = !(state.mediaType === 'video' && state.frames.length > 0 && !isExtracting);
    exportButton.textContent = originalLabel;
    document.getElementById('btnSaveImg').disabled = false;
    document.getElementById('btnBrightest').disabled = false;
    document.getElementById('btnDarkest').disabled = false;
    document.getElementById('btnPrevFrame').disabled = false;
    document.getElementById('btnNextFrame').disabled = false;
  }
}

document.getElementById('btnExportAll').addEventListener('click', exportAllFrames);

// Complete project format: a ZIP archive with a .meow extension.
// project.json contains versioned metadata and workspace state; media/source.* embeds the original file.
function inferMediaMime(fileName, declaredType = '', kind = '') {
  if (declaredType && ((kind === 'image' && declaredType.startsWith('image/')) || (kind === 'video' && declaredType.startsWith('video/')))) return declaredType;
  const extension = String(fileName || '').toLowerCase().split('.').pop();
  const imageTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif' };
  const videoTypes = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg', mov: 'video/quicktime', mpeg: 'video/mpeg', mpg: 'video/mpeg' };
  return (kind === 'video' ? videoTypes[extension] : imageTypes[extension]) || (kind === 'video' ? 'video/mp4' : 'image/png');
}

function safeMediaFileName(name) {
  const leaf = String(name || 'source-media').split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, '').trim();
  return (leaf || 'source-media').slice(0, 180);
}

function boundedNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function buildMeowManifest() {
  syncActiveBranch();
  const sourceFile = state.sourceMediaFile;
  if (!sourceFile || !state.mediaType) throw new Error('Open an image or video before saving a .meow project.');
  if (sourceFile.size > MAX_MEOW_MEDIA_BYTES) throw new Error('This source file is larger than the 500 MiB project limit. Use a smaller image/video for this browser-based project save.');
  const mediaFileName = safeMediaFileName(state.fileName || sourceFile.name);
  const extension = (mediaFileName.match(/\.[a-z0-9]{1,10}$/i) || [''])[0] || (state.mediaType === 'video' ? '.mp4' : '.png');
  const mediaPath = `media/source${extension.toLowerCase()}`;
  const currentFrame = state.mediaType === 'video' ? state.frames[state.currentFrameIndex] : null;
  const width = state.mediaType === 'image' && state.sourceImage ? state.sourceImage.naturalWidth : (state.videoEl?.videoWidth || 0);
  const height = state.mediaType === 'image' && state.sourceImage ? state.sourceImage.naturalHeight : (state.videoEl?.videoHeight || 0);
  return {
    format: MEOW_PROJECT_FORMAT,
    schemaVersion: MEOW_PROJECT_VERSION,
    app: { name: 'Meow Visual Processing Editor', milestone: '6D-B' },
    project: {
      name: safeBaseName(mediaFileName),
      savedAt: new Date().toISOString()
    },
    media: {
      path: mediaPath,
      fileName: mediaFileName,
      mimeType: inferMediaMime(mediaFileName, sourceFile.type, state.mediaType),
      kind: state.mediaType,
      size: sourceFile.size,
      width,
      height,
            duration: state.mediaType === 'video' && Number.isFinite(state.videoEl?.duration) ? state.videoEl.duration : null
    },
    workspace: {
      pipeline: clonePipeline(state.pipeline),
      selectedBlockId: state.selectedBlockId,
      branches: state.branches.map(branch => ({
        id: branch.id,
        name: branch.name,
        parentId: branch.parentId || null,
        pipeline: clonePipeline(branch.pipeline),
        selectedBlockId: branch.selectedBlockId,
        basePipeline: clonePipeline(branch.basePipeline || [])
      })),
      activeBranchId: state.activeBranchId,
      outputBlend: state.outputBlend ? { ...state.outputBlend } : null,
      currentFrameIndex: state.currentFrameIndex,
      currentFrameTime: currentFrame && Number.isFinite(currentFrame.time) ? currentFrame.time : 0,
      extractFps: boundedNumber(document.getElementById('fpsExtract').value, 1, 30, 5),
      viewMode: state.viewMode,
      zoomLevel: boundedNumber(state.zoomLevel, 0.05, 8, 1),
      panX: boundedNumber(state.panX, -100000, 100000, 0),
      panY: boundedNumber(state.panY, -100000, 100000, 0),
      splitPosition: boundedNumber(state.splitPosition, 0, 1, 0.5),
      // Annotation geometry is stored in source-image pixel coordinates.
      annotations: validateProjectAnnotations(cloneAnnotations(), { width, height })
    }
  };
}

async function saveMeowProject() {
  if (isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for the current media operation to finish before saving the project.');
  if (!window.JSZip) return showMsg('ZIP support could not load. Check your internet connection and reload the editor.');
  let manifest;
  try { manifest = buildMeowManifest(); }
  catch (error) { showMsg(error.message || 'Could not prepare the project.'); return; }

  const button = document.getElementById('btnSaveProject');
  const originalLabel = button.textContent;
  button.disabled = true;
  document.getElementById('btnLoadProject').disabled = true;
  try {
    setStatus('Packing .meow project…');
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(manifest, null, 2), { compression: 'DEFLATE', compressionOptions: { level: 3 } });
    zip.file(manifest.media.path, state.sourceMediaFile, { binary: true, compression: 'STORE' });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } }, metadata => {
      setStatus(`Saving project… ${Math.round(metadata.percent)}%`);
    });
    if (blob.size > MAX_MEOW_ARCHIVE_BYTES) throw new Error('The saved project exceeds the 550 MiB archive limit. Use smaller source media.');
    downloadBlob(blob, `${manifest.project.name || 'meow_project'}.meow`);
    setStatus(`Saved project: ${manifest.project.name}.meow`);
    showMsg(`Complete .meow project saved, including source media, branches, workspace settings, and ${manifest.workspace.annotations.length} annotation${manifest.workspace.annotations.length === 1 ? '' : 's'}.`);
  } catch (error) {
    console.error('Project save failed:', error);
    showMsg(error.message || 'Could not save the .meow project.');
    setStatus('Project save failed.');
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
    document.getElementById('btnLoadProject').disabled = false;
  }
}

document.getElementById('btnSaveProject').addEventListener('click', saveMeowProject);
document.getElementById('btnLoadProject').addEventListener('click', () => {
  if (isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for the current media operation to finish before opening a project.');
  document.getElementById('projectUpload').click();
});

function validateProjectAnnotations(value, media) {
  if (!Array.isArray(value)) throw new Error('The project annotations field must be an array.');
  if (value.length > MAX_PROJECT_ANNOTATIONS) throw new Error(`The project contains too many annotations (maximum ${MAX_PROJECT_ANNOTATIONS}).`);
  const maxX = boundedNumber(media.width, 1, 10000000, 1000000);
  const maxY = boundedNumber(media.height, 1, 10000000, 1000000);
  const ids = new Set();
  let totalPoints = 0;
  const readPoint = (point, label) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`${label} is invalid.`);
    const x = Number(point.x), y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > maxX || y > maxY) throw new Error(`${label} is outside the image bounds or contains invalid coordinates.`);
    return { x, y };
  };
  const readColor = (color, fallback, label) => {
    if (color === undefined || color === null) return fallback;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${label} must be a six-digit hexadecimal colour.`);
    return color;
  };
  return value.map((entry, index) => {
    const label = `Annotation ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label} is invalid.`);
    if (typeof entry.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(entry.id) || ids.has(entry.id)) throw new Error(`${label} has an invalid or duplicate ID.`);
    if (!VALID_ANNOTATION_TYPES.includes(entry.type)) throw new Error(`${label} uses an unsupported annotation type.`);
    ids.add(entry.id);
    const start = readPoint(entry.start, `${label} start point`);
    const end = readPoint(entry.end, `${label} end point`);
    const annotation = {
      id: entry.id,
      type: entry.type,
      color: readColor(entry.color, '#ffcc00', `${label} colour`),
      width: boundedNumber(entry.width, 1, 20, 3),
      start,
      end
    };
    if (entry.type === 'pen') {
      if (!Array.isArray(entry.points) || !entry.points.length || entry.points.length > MAX_ANNOTATION_POINTS_PER_MARK) throw new Error(`${label} has an invalid freehand point list.`);
      totalPoints += entry.points.length;
      if (totalPoints > MAX_TOTAL_ANNOTATION_POINTS) throw new Error(`The project contains too many freehand points (maximum ${MAX_TOTAL_ANNOTATION_POINTS}).`);
      annotation.points = entry.points.map((point, pointIndex) => readPoint(point, `${label} point ${pointIndex + 1}`));
    } else {
      annotation.points = [];
    }
    if (entry.type === 'text') {
      if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 120) throw new Error(`${label} has invalid text. Labels must contain 1–120 characters.`);
      annotation.text = entry.text;
      annotation.textSize = boundedNumber(entry.textSize, 8, 72, 24);
      annotation.textBackground = Boolean(entry.textBackground);
      annotation.backgroundColor = readColor(entry.backgroundColor, '#111827', `${label} background colour`);
    }
    return annotation;
  });
}

function validateMeowManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('The .meow manifest is not a valid object.');
  if (manifest.format !== MEOW_PROJECT_FORMAT) throw new Error('This file is not a Meow project archive.');
  if (![1, 2, MEOW_PROJECT_VERSION].includes(manifest.schemaVersion)) throw new Error(`Unsupported .meow project version: ${String(manifest.schemaVersion)}.`);
  const media = manifest.media;
  if (!media || typeof media !== 'object' || Array.isArray(media)) throw new Error('The project is missing media information.');
  if (!['image', 'video'].includes(media.kind)) throw new Error('The project uses an unsupported media type.');
  if (typeof media.path !== 'string' || !/^media\/source\.[a-z0-9]{1,10}$/i.test(media.path) || media.path.includes('..')) throw new Error('The project media path is invalid.');
  if (typeof media.fileName !== 'string' || !media.fileName.trim()) throw new Error('The project is missing the original media filename.');
  const workspace = manifest.workspace;
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) throw new Error('The project is missing workspace settings.');
  const legacyPipeline = validateImportedPipeline(workspace.pipeline);
  let branches;
  let activeBranchId;
  let outputBlend = null;
  if (manifest.schemaVersion === 1) {
    const id = 'branch-main';
    branches = [{ id, name: 'Main', parentId: null, pipeline: legacyPipeline, selectedBlockId: typeof workspace.selectedBlockId === 'string' && legacyPipeline.some(block => block.id === workspace.selectedBlockId) ? workspace.selectedBlockId : null, basePipeline: [] }];
    activeBranchId = id;
  } else {
    if (!Array.isArray(workspace.branches) || workspace.branches.length < 1 || workspace.branches.length > MAX_BRANCHES) throw new Error(`The project must contain between 1 and ${MAX_BRANCHES} branches.`);
    const ids = new Set();
    const names = new Set();
    branches = workspace.branches.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Branch ${index + 1} is invalid.`);
      if (typeof entry.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(entry.id) || ids.has(entry.id)) throw new Error(`Branch ${index + 1} has an invalid or duplicate ID.`);
      if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.trim().length > MAX_BRANCH_NAME_LENGTH) throw new Error(`Branch ${index + 1} has an invalid name.`);
      const key = entry.name.trim().toLocaleLowerCase();
      if (names.has(key)) throw new Error('Branch names must be unique.');
      ids.add(entry.id); names.add(key);
      const branchPipeline = validateImportedPipeline(entry.pipeline);
      const basePipeline = validateImportedPipeline(Array.isArray(entry.basePipeline) ? entry.basePipeline : []);
      const selectedBlockId = typeof entry.selectedBlockId === 'string' && branchPipeline.some(block => block.id === entry.selectedBlockId) ? entry.selectedBlockId : null;
      return {
        id: entry.id,
        name: entry.name.trim(),
        parentId: typeof entry.parentId === 'string' && entry.parentId ? entry.parentId : null,
        pipeline: branchPipeline,
        selectedBlockId,
        basePipeline
      };
    });
    for (const branch of branches) {
      if (branch.parentId && (!ids.has(branch.parentId) || branch.parentId === branch.id)) throw new Error(`Branch “${branch.name}” references an invalid parent branch.`);
      const seenParents = new Set([branch.id]);
      let parentId = branch.parentId;
      while (parentId) {
        if (seenParents.has(parentId)) throw new Error('The project branch ancestry contains a cycle.');
        seenParents.add(parentId);
        parentId = branches.find(candidate => candidate.id === parentId)?.parentId || null;
      }
    }
    activeBranchId = typeof workspace.activeBranchId === 'string' && ids.has(workspace.activeBranchId) ? workspace.activeBranchId : branches[0].id;
    if (workspace.outputBlend !== null && workspace.outputBlend !== undefined) {
      const blend = workspace.outputBlend;
      if (!blend || typeof blend !== 'object' || Array.isArray(blend) || !ids.has(blend.baseBranchId) || !ids.has(blend.sourceBranchId) || blend.baseBranchId === blend.sourceBranchId || !VALID_BLEND_MODES.includes(blend.mode)) {
        throw new Error('The project output-blend settings are invalid.');
      }
      outputBlend = { baseBranchId: blend.baseBranchId, sourceBranchId: blend.sourceBranchId, mode: blend.mode, opacity: boundedNumber(blend.opacity, 0, 1, 0.5) };
    }
  }
  // Version 3 stores annotations. Versions 1 and 2 remain readable and migrate to no marks.
  const annotations = manifest.schemaVersion >= 3
    ? validateProjectAnnotations(workspace.annotations, media)
    : [];
  const activeBranch = branches.find(branch => branch.id === activeBranchId);
  const pipeline = activeBranch ? activeBranch.pipeline : legacyPipeline;
  const viewMode = ['processed', 'original', 'split'].includes(workspace.viewMode) ? workspace.viewMode : 'processed';
  const frameTime = boundedNumber(workspace.currentFrameTime, 0, 24 * 60 * 60, 0);
  const frameIndex = Math.floor(boundedNumber(workspace.currentFrameIndex, 0, 1000000, 0));
  const selectedBlockId = activeBranch?.selectedBlockId || (typeof workspace.selectedBlockId === 'string' && pipeline.some(block => block.id === workspace.selectedBlockId) ? workspace.selectedBlockId : null);
  return {
    manifest,
    media: {
      path: media.path,
      fileName: safeMediaFileName(media.fileName),
      kind: media.kind,
      mimeType: inferMediaMime(media.fileName, typeof media.mimeType === 'string' ? media.mimeType : '', media.kind),
      declaredSize: boundedNumber(media.size, 0, MAX_MEOW_MEDIA_BYTES, 0)
    },
    workspace: {
      pipeline,
      selectedBlockId,
      branches,
      activeBranchId,
      outputBlend,
      currentFrameIndex: frameIndex,
      currentFrameTime: frameTime,
      extractFps: boundedNumber(workspace.extractFps, 1, 30, 5),
      viewMode,
      zoomLevel: boundedNumber(workspace.zoomLevel, 0.05, 8, 1),
      panX: boundedNumber(workspace.panX, -100000, 100000, 0),
      panY: boundedNumber(workspace.panY, -100000, 100000, 0),
      splitPosition: boundedNumber(workspace.splitPosition, 0, 1, 0.5),
      annotations
    }
  };
}

async function prepareProjectMedia(file, kind) {
  const objectUrl = URL.createObjectURL(file);
  if (kind === 'image') {
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => element.naturalWidth > 0 && element.naturalHeight > 0 ? resolve(element) : reject(new Error('The project image has invalid dimensions.'));
        element.onerror = () => reject(new Error('The embedded image cannot be decoded by this browser.'));
        element.src = objectUrl;
      });
      return { kind, objectUrl, image, video: null };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
  const video = document.createElement('video');
  video.preload = 'auto'; video.muted = true; video.playsInline = true; video.src = objectUrl;
  try {
    await waitForVideoMetadata(video, new AbortController().signal);
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) throw new Error('The embedded video has invalid dimensions or duration.');
    return { kind, objectUrl, image: null, video };
  } catch (error) {
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) { /* best-effort cleanup */ }
        URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function readMeowArchive(file) {
  if (!window.JSZip) throw new Error('ZIP support could not load. Check your internet connection and reload the editor.');
  if (file.size > MAX_MEOW_ARCHIVE_BYTES) throw new Error('This .meow file exceeds the 550 MiB archive limit for this browser editor.');
  let archive;
  try { archive = await JSZip.loadAsync(file); }
  catch (_) { throw new Error('This file is not a readable .meow archive or it is damaged.'); }
  const manifestEntry = archive.file('project.json');
  if (!manifestEntry || manifestEntry.dir) throw new Error('The project archive does not contain project.json.');
  let manifest;
  try { manifest = JSON.parse(await manifestEntry.async('string')); }
  catch (_) { throw new Error('The .meow project metadata is not valid JSON.'); }
  const validated = validateMeowManifest(manifest);
  const mediaEntry = archive.file(validated.media.path);
  if (!mediaEntry || mediaEntry.dir) throw new Error('The original source media is missing from this project.');
  const mediaBlob = await mediaEntry.async('blob');
  if (!mediaBlob.size || mediaBlob.size > MAX_MEOW_MEDIA_BYTES) throw new Error('The embedded media is empty or exceeds the 500 MiB media limit.');
  if (validated.media.declaredSize && validated.media.declaredSize !== mediaBlob.size) throw new Error('The embedded media size does not match the project metadata. The project may be damaged.');
  if (!(validated.media.kind === 'image' ? validated.media.mimeType.startsWith('image/') : validated.media.mimeType.startsWith('video/'))) throw new Error('The project media MIME type does not match its declared media kind.');
  let mediaFile;
  try {
    mediaFile = new File([mediaBlob], validated.media.fileName, { type: validated.media.mimeType, lastModified: Date.now() });
  } catch (_) {
    throw new Error('This browser cannot recreate the embedded source file. Try a recent version of Chrome, Firefox, or Edge.');
  }
  return { ...validated, mediaFile };
}

function applyProjectViewSettings(workspace) {
  state.viewMode = workspace.viewMode;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === state.viewMode));
  state.zoomLevel = workspace.zoomLevel;
  state.panX = workspace.panX;
  state.panY = workspace.panY;
  state.splitPosition = workspace.splitPosition;
  state.fitOnNextRender = false;
  document.getElementById('fpsExtract').value = String(workspace.extractFps);
  applyZoom();
}

async function openMeowProject(file) {
  if (!file) return;
  if (isOpeningProject) return showMsg('A project is already opening.');
  if (isExportingFrames || isExtracting) return showMsg('Wait for frame extraction/export to finish before opening a project.');
  isOpeningProject = true;
  const openButton = document.getElementById('btnLoadProject');
  const saveButton = document.getElementById('btnSaveProject');
  openButton.disabled = true;
  saveButton.disabled = true;
  let prepared = null;
  try {
    setStatus('Validating .meow project…');
    const project = await readMeowArchive(file);
    // Decode the embedded media before replacing the current project, so a damaged or unsupported
    // source file does not discard the workspace that is already open.
    prepared = await prepareProjectMedia(project.mediaFile, project.media.kind);

    extractionAbort.abort();
    extractionAbort = new AbortController();
    const token = ++mediaLoadId;
    disposeCurrentMedia();
    state.mediaType = project.media.kind;
    resetAnnotations();
    state.annotations = cloneAnnotations(project.workspace.annotations || []);
    state.selectedAnnotationId = null;
    state.currentAnnotation = null;
    state.annotationDrag = null;
    state.annotationUndo = [];
    state.annotationRedo = [];
    state.annotationMode = false;
    state.fileName = project.media.fileName;
    state.sourceMediaFile = project.mediaFile;
    state.branches = project.workspace.branches.map(branch => ({ ...branch, pipeline: clonePipeline(branch.pipeline), basePipeline: clonePipeline(branch.basePipeline || []), historyPast: [], historyFuture: [] }));
    state.activeBranchId = project.workspace.activeBranchId;
    state.outputBlend = project.workspace.outputBlend ? { ...project.workspace.outputBlend } : null;
    const activeProjectBranch = state.branches.find(branch => branch.id === state.activeBranchId) || state.branches[0];
    state.activeBranchId = activeProjectBranch.id;
    state.pipeline = clonePipeline(activeProjectBranch.pipeline);
    state.selectedBlockId = activeProjectBranch.selectedBlockId;
    historyPast = activeProjectBranch.historyPast;
    historyFuture = activeProjectBranch.historyFuture;
    state.frames = [];
    state.currentFrameIndex = 0;
    state.lastOrigData = null;
    state.lastProcData = null;
    state.activeStageKey = null; state.activeStageView = null; state.activeStageData = null; updateStageViewControls();
    state.mediaObjectUrl = prepared.objectUrl;
    if (project.media.kind === 'image') {
      state.sourceImage = prepared.image;
      state.videoEl = null;
    } else {
      state.sourceImage = null;
      state.videoEl = prepared.video;
    }
    // The object URL is now owned by state; do not let cleanup below revoke it.
    prepared = null;
    historyPast = [];
    historyFuture = [];
    updateUndoRedoUI();
    applyProjectViewSettings(project.workspace);
    if (state.outputBlend) {
      document.getElementById('mergeStrategySelect').value = 'blend';
      document.getElementById('blendModeSelect').value = state.outputBlend.mode;
      document.getElementById('blendOpacityInput').value = String(Math.round(state.outputBlend.opacity * 100));
    } else {
      document.getElementById('mergeStrategySelect').value = 'auto';
    }
    renderPipelineUI();

    if (state.mediaType === 'image') {
      document.getElementById('btnExportAll').style.display = 'none';
      document.getElementById('btnExportAll').disabled = true;
      setStatus(`Project image: ${state.sourceImage.naturalWidth}×${state.sourceImage.naturalHeight}`);
      renderTimeline();
      requestProcess();
    } else {
      document.getElementById('btnExportAll').style.display = 'inline-flex';
      document.getElementById('btnExportAll').disabled = true;
      setStatus(`Project video: ${state.videoEl.videoWidth}×${state.videoEl.videoHeight}, ${state.videoEl.duration.toFixed(2)}s`);
      await extractFrames(extractionAbort.signal, token);
      if (token !== mediaLoadId) return;
      if (state.frames.length) {
        const targetTime = project.workspace.currentFrameTime;
        let bestIndex = Math.min(project.workspace.currentFrameIndex, state.frames.length - 1);
        let bestDistance = Math.abs(state.frames[bestIndex].time - targetTime);
        state.frames.forEach((frame, index) => {
          const distance = Math.abs(frame.time - targetTime);
          if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
        });
        state.currentFrameIndex = bestIndex;
        updateTimelineUI();
      }
      state.fitOnNextRender = false;
      applyZoom();
      await requestProcess();
    }
    renderBranchUI();
    renderAnnotationOverlay();
    updateAnnotationControls();
    showMsg(`Opened ${safeBaseName(project.media.fileName)}.meow successfully (${state.branches.length} branch${state.branches.length === 1 ? '' : 'es'}; ${state.annotations.length} annotation${state.annotations.length === 1 ? '' : 's'} restored).`);
  } catch (error) {
    console.error('Project open failed:', error);
    showMsg(error.message || 'Could not open this .meow project.');
    setStatus('Project could not be opened.');
    if (prepared) {
      if (prepared.video) { try { prepared.video.pause(); prepared.video.removeAttribute('src'); prepared.video.load(); } catch (_) { /* best-effort cleanup */ } }
      URL.revokeObjectURL(prepared.objectUrl);
    }
  } finally {
    isOpeningProject = false;
    openButton.disabled = false;
    saveButton.disabled = false;
    document.getElementById('projectUpload').value = '';
  }
}

document.getElementById('projectUpload').addEventListener('change', event => {
  const file = event.target.files && event.target.files[0];
  if (file) openMeowProject(file);
  else event.target.value = '';
});

document.getElementById('btnSavePipe').addEventListener('click', () => {
  const data = JSON.stringify({ version: 1, pipeline: state.pipeline }, null, 2);
  downloadBlob(new Blob([data], { type: 'application/json' }), 'meow_pipeline.json');
});

document.getElementById('btnLoadPipe').addEventListener('click', () => document.getElementById('pipeUpload').click());

function validateImportedPipeline(pipeline) {
  if (!Array.isArray(pipeline)) throw new Error('The file must contain a pipeline array.');
  if (pipeline.length > 100) throw new Error('This pipeline has more than 100 steps; refusing to load it.');
  const usedIds = new Set();
  return pipeline.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Pipeline step ${index + 1} is not an object.`);
    if (typeof entry.type !== 'string' || !OPERATIONS[entry.type]) throw new Error(`Pipeline step ${index + 1} uses an unknown operation.`);
    const definition = OPERATIONS[entry.type];
    const incoming = entry.params && typeof entry.params === 'object' && !Array.isArray(entry.params) ? entry.params : {};
    const params = {};
    for (const parameter of definition.params) {
      const value = incoming[parameter.id];
      if (parameter.type === 'range') {
        const numericValue = Number(value);
        const raw = value !== undefined && value !== null && value !== '' && Number.isFinite(numericValue) ? numericValue : parameter.default;
        const bounded = Math.min(parameter.max, Math.max(parameter.min, raw));
        const steps = Math.round((bounded - parameter.min) / parameter.step);
        params[parameter.id] = Math.min(parameter.max, Math.max(parameter.min, parameter.min + steps * parameter.step));
      } else if (parameter.type === 'select') {
        params[parameter.id] = parameter.options.includes(value) ? value : parameter.default;
      } else {
        params[parameter.id] = parameter.default;
      }
    }
    let id = typeof entry.id === 'string' && entry.id.trim() ? entry.id : generateId();
    if (usedIds.has(id)) id = generateId();
    usedIds.add(id);
    return { id, type: entry.type, params };
  });
}

document.getElementById('pipeUpload').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => { showMsg('Could not read the pipeline file.'); e.target.value = ''; };
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      const importedPipeline = validateImportedPipeline(parsed?.pipeline);
      saveHistory();
      state.pipeline = importedPipeline;
      state.selectedBlockId = null;
      renderPipelineUI();
      requestProcess();
      showMsg('Pipeline loaded successfully.');
    } catch (error) {
      console.error('Pipeline import rejected:', error);
      showMsg(error.message || 'Invalid pipeline JSON format.');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
});

// Init
initializeBranchWorkspace();
initTools();
updateAnnotationControls();
renderStagePreviewPanel();
renderPipelineUI();

// Handle either OpenCV.js load order: its async script may finish before or after this file.
window.onOpenCvReady = onOpenCvReady;
window.onOpenCvScriptFailed = function () {
  const overlay = document.getElementById('cvLoading');
  if (!overlay) return;
  overlay.innerHTML = '<div class="cv-load-error-title">OpenCV.js could not load</div><div class="cv-load-error-subtitle">Check your internet connection and reload this page. The processing engine is loaded from the OpenCV.js CDN.</div>';
};
if (window.__cvScriptFailed) window.onOpenCvScriptFailed();
else if (window.__cvScriptLoaded) window.onOpenCvReady();