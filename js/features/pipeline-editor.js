/* Meow module: Pipeline controls, inspector, history and step editing.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
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
      btn.dataset.operation = type;
      btn.draggable = true;
      btn.title = `${def.name} — click to add, or drag into the node workspace`;
      btn.addEventListener('dragstart', event => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-purrfectcv-operation', type);
        event.dataTransfer.setData('text/plain', type);
        btn.classList.add('tool-dragging');
      });
      btn.addEventListener('dragend', () => btn.classList.remove('tool-dragging'));
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
    els.inspector.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0;line-height:1.5;">Select a processing node in the Node workspace to edit its parameters.</div>';
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
