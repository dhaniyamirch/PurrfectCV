/* Meow module: Branch lifecycle, merge strategies and blending controls.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
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
      else continue; // target deletion wins when source left the step untouched
      if (sourceBlock) merged.set(id, clonePipeline([sourceBlock])[0]);
      continue;
    }
    if (!sourceBlock) {
      if (blockContentFingerprint(targetBlock) !== blockContentFingerprint(baseBlock)) conflicts.push(`edited vs deleted ${baseBlock.type}`);
      else continue; // source deletion wins when target left the step untouched
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

