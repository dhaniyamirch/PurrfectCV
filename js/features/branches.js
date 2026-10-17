/* Meow module: Branch lifecycle, merge strategies and blending controls.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
function getActiveBranch() {
  return state.branches.find(branch => branch.id === state.activeBranchId) || null;
}

function makeBranchRecord({ id, name, pipeline = [], selectedBlockId = null, parentId = null, basePipeline = [], graphLayout = {} }) {
  const normalizedPipeline = clonePipeline(pipeline);
  return {
    id: id || `branch-${generateId()}`,
    name: String(name || 'Branch').trim().slice(0, MAX_BRANCH_NAME_LENGTH) || 'Branch',
    pipeline: normalizedPipeline,
    selectedBlockId: typeof selectedBlockId === 'string' && normalizedPipeline.some(block => block.id === selectedBlockId) ? selectedBlockId : null,
    parentId: parentId || null,
    basePipeline: clonePipeline(basePipeline),
    graphLayout: graphLayout && typeof graphLayout === 'object' ? { ...graphLayout } : {},
    historyPast: [],
    historyFuture: []
  };
}

function initializeBranchWorkspace() {
  const main = makeBranchRecord({ id: 'branch-main', name: 'Main', pipeline: state.pipeline });
  state.branches = [main];
  state.branchStageSnapshots = {};
  state.lastBranchMerge = null;
  state.mergeGraphPosition = null;
  state.selectedGraphNodeId = null;
  state.branchGraphVisible = true;
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
  state.branchStageSnapshots = {};
  state.lastBranchMerge = null;
  state.mergeGraphPosition = null;
  state.selectedGraphNodeId = null;
  state.branchGraphVisible = true;
  state.activeBranchId = main.id;
  state.pipeline = clonePipeline(main.pipeline);
  state.selectedBlockId = null;
  state.outputBlend = null;
  state.lastBranchMerge = null;
  state.mergeGraphPosition = null;
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
  const addMergeNodeButton = document.getElementById('btnAddMergeNode');
  if (addMergeNodeButton) {
    addMergeNodeButton.disabled = state.branches.length < 2 || !!state.lastBranchMerge;
    addMergeNodeButton.title = state.branches.length < 2 ? 'Create a second branch before adding a merge node' : state.lastBranchMerge ? 'A merge node already exists; select it to edit or delete it' : 'Add a merge node to the canvas';
  }
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
  const active = getActiveBranch();
  document.getElementById('btnDeleteBranch').disabled = state.branches.length <= 1;
  document.getElementById('btnMergeBranch').disabled = state.branches.length <= 1 || !mergeSourceSelect.value || isProcessing || isOpeningProject || isExportingFrames || isExtracting;
  const direction = document.getElementById('mergeDirectionStatus');
  if (direction) {
    const sourceBranch = state.branches.find(branch => branch.id === mergeSourceSelect.value);
    direction.textContent = sourceBranch && active
      ? `Merge source: ${sourceBranch.name}  →  target: ${active.name}`
      : 'Choose a source branch to merge into the active branch.';
    direction.title = direction.textContent;
    document.getElementById('btnMergeBranch').title = sourceBranch && active
      ? `Merge ${sourceBranch.name} into ${active.name} using the selected strategy`
      : 'Choose a source branch to merge into the active branch';
  }
  const strategy = document.getElementById('mergeStrategySelect').value;
  const outputMerge = VALID_OUTPUT_MERGE_OPERATORS.includes(strategy);
  document.getElementById('blendOptions').hidden = !outputMerge;
  document.getElementById('blendModeGroup').hidden = strategy !== 'blend';
  document.getElementById('blendOpacityGroup').hidden = strategy !== 'blend';
  document.getElementById('maskThresholdGroup').hidden = strategy !== 'masked-composite';
  document.getElementById('chooseOutputGroup').hidden = strategy !== 'choose-output';
  const opacity = document.getElementById('blendOpacityInput');
  document.getElementById('blendOpacityValue').textContent = `${opacity.value}%`;
  document.getElementById('maskThresholdValue').textContent = document.getElementById('maskThresholdInput').value;
  const sourceOutput = state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId ? state.outputBlend : null;
  if (sourceOutput && outputMerge) {
    if (sourceOutput.operator && sourceOutput.operator !== strategy) {
      // The UI selection is authoritative only after Merge is pressed; retain current preview until then.
    }
    document.getElementById('chooseOutputSelect').value = sourceOutput.outputChoice || 'target';
    document.getElementById('maskThresholdInput').value = String(sourceOutput.threshold ?? 128);
  }
  const message = document.getElementById('branchMessage');
  if (state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId) {
    const source = state.branches.find(branch => branch.id === state.outputBlend.sourceBranchId);
    const operatorLabel = ({ blend: 'Blend', add: 'Add', 'bitwise-or': 'Bitwise OR', 'bitwise-and': 'Bitwise AND', 'bitwise-xor': 'Bitwise XOR', 'masked-composite': 'Masked composite', 'choose-output': 'Choose output' })[state.outputBlend.operator || 'blend'] || 'Merge';
    message.textContent = source ? `${operatorLabel}: ${source.name} → ${active.name}` : '';
    message.title = message.textContent;
  } else if (active) {
    message.textContent = `${active.pipeline.length} step${active.pipeline.length === 1 ? '' : 's'}`;
    message.title = `Active branch: ${active.name}`;
  }
  if (state.branchGraphVisible === null) state.branchGraphVisible = true;
  renderBranchGraph();
  updateCompareSelectedNodeButton();
}

function updateCompareSelectedNodeButton() {
  const compareSelected = document.getElementById('btnCompareSelectedNodeOutput');
  if (!compareSelected) return;
  const selectedStage = (state.stagePreviews || []).find(stage => stage.key === state.activeStageKey && stage.branchId === state.activeBranchId);
  compareSelected.disabled = !selectedStage || isProcessing || isOpeningProject || isExportingFrames || isExtracting;
  const targetSlot = state.comparisonSlots?.[state.comparisonTargetSlot];
  compareSelected.textContent = `${targetSlot ? 'Replace' : 'Add'} selected output · slot ${state.comparisonTargetSlot + 1}`;
}

function switchBranch(branchId) {
  if (branchId === state.activeBranchId) return;
  if (isOpeningProject || isExportingFrames || isExtracting || isProcessing) {
    showMsg('Wait for the current operation to finish before switching branches.');
    renderBranchUI();
    return;
  }
  syncActiveBranch();
  syncHistoryToActiveBranch();
  const next = state.branches.find(branch => branch.id === branchId);
  if (!next) return;
  state.activeBranchId = next.id;
  const mergeSelect = document.getElementById('mergeStrategySelect');
  if (state.outputBlend && state.outputBlend.baseBranchId === next.id) mergeSelect.value = state.outputBlend.operator || 'blend';
  else if (VALID_OUTPUT_MERGE_OPERATORS.includes(mergeSelect.value)) mergeSelect.value = 'auto';
  state.pipeline = clonePipeline(next.pipeline);
  state.selectedBlockId = next.selectedBlockId;
  historyPast = next.historyPast || [];
  historyFuture = next.historyFuture || [];
  updateUndoRedoUI();
  renderPipelineUI();
  renderBranchUI();
  requestProcess();
  setStatus(`Branch: ${next.name}`);
}

function createBranch() {
  if (isOpeningProject || isExportingFrames || isExtracting || isProcessing) return showMsg('Wait for the current operation to finish before creating a branch.');
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
  state.branchGraphVisible = true;
  switchBranch(branch.id);
  renderBranchUI();
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
  if (isOpeningProject || isExportingFrames || isExtracting || isProcessing) return showMsg('Wait for the current operation to finish before deleting a branch.');
  const branch = getActiveBranch();
  if (!branch) return;
  if (!window.confirm(`Delete branch “${branch.name}”? This cannot be undone.`)) return;
  const deletingId = branch.id;
  state.branches = state.branches.filter(item => item.id !== deletingId);
  if (state.branchStageSnapshots) delete state.branchStageSnapshots[deletingId];
  for (const child of state.branches) {
    if (child.parentId === deletingId) {
      child.parentId = null;
      child.basePipeline = [];
    }
  }
  if (state.outputBlend && (state.outputBlend.baseBranchId === deletingId || state.outputBlend.sourceBranchId === deletingId)) state.outputBlend = null;
  if (state.lastBranchMerge && (state.lastBranchMerge.sourceBranchId === deletingId || state.lastBranchMerge.targetBranchId === deletingId)) { state.lastBranchMerge = null; state.selectedGraphNodeId = null; }
  else if (state.lastBranchMerge?.connections) state.lastBranchMerge.connections = state.lastBranchMerge.connections.map(id => id && id.startsWith(`${deletingId}:`) ? null : id);
  else if (state.lastBranchMerge?.connections) state.lastBranchMerge.connections = state.lastBranchMerge.connections.map(id => id && id.startsWith(`${deletingId}:`) ? null : id);
  const next = state.branches[0];
  state.activeBranchId = next.id;
  state.pipeline = clonePipeline(next.pipeline);
  state.selectedBlockId = next.selectedBlockId;
  historyPast = next.historyPast || [];
  historyFuture = next.historyFuture || [];
  updateUndoRedoUI();
  renderPipelineUI();
  renderBranchUI();
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

function branchPathToRoot(branch) {
  const path = [];
  const visited = new Set();
  let current = branch;
  while (current && !visited.has(current.id)) {
    path.push(current);
    visited.add(current.id);
    current = current.parentId ? state.branches.find(item => item.id === current.parentId) || null : null;
  }
  return path;
}

function findThreeWayMergeBase(target, source) {
  if (!target || !source || target.id === source.id) return null;
  const targetPath = branchPathToRoot(target); // selected branch first, then ancestors
  const sourcePath = branchPathToRoot(source);
  const targetIndexes = new Map(targetPath.map((branch, index) => [branch.id, index]));
  const sourceCommonIndex = sourcePath.findIndex(branch => targetIndexes.has(branch.id));
  if (sourceCommonIndex < 0) return null;

  const common = sourcePath[sourceCommonIndex];
  const targetCommonIndex = targetIndexes.get(common.id);
  // If one selected branch is the common ancestor, the first descendant on the
  // other branch's path carries the exact pipeline snapshot captured at the fork.
  if (targetCommonIndex === 0 && sourceCommonIndex > 0) {
    return sourcePath[sourceCommonIndex - 1].basePipeline;
  }
  if (sourceCommonIndex === 0 && targetCommonIndex > 0) {
    return targetPath[targetCommonIndex - 1].basePipeline;
  }

  // For sibling/cousin branches, only auto-merge when both paths agree on the
  // exact saved fork snapshot. Otherwise we cannot safely infer a shared base.
  if (targetCommonIndex > 0 && sourceCommonIndex > 0) {
    const targetFork = targetPath[targetCommonIndex - 1];
    const sourceFork = sourcePath[sourceCommonIndex - 1];
    if (pipelineFingerprint(targetFork.basePipeline) === pipelineFingerprint(sourceFork.basePipeline)) {
      return targetFork.basePipeline;
    }
  }
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

function mergeImageOutputs(baseData, sourceData, settings = {}) {
  if (!baseData || !sourceData || baseData.width !== sourceData.width || baseData.height !== sourceData.height) {
    throw new Error('The branch outputs have different dimensions. Make both branches produce the same image size before merging outputs.');
  }
  const operator = VALID_OUTPUT_MERGE_OPERATORS.includes(settings.operator) ? settings.operator : 'blend';
  if (operator === 'blend') return blendImageData(baseData, sourceData, settings.mode || 'normal', settings.opacity ?? 0.5);
  if (operator === 'choose-output') {
    const chosen = settings.outputChoice === 'source' ? sourceData : baseData;
    const copy = new ImageData(chosen.width, chosen.height);
    copy.data.set(chosen.data);
    return copy;
  }
  const output = new ImageData(baseData.width, baseData.height);
  const a = baseData.data, b = sourceData.data, out = output.data;
  const threshold = boundedNumber(settings.threshold, 0, 255, 128);
  for (let i = 0; i < a.length; i += 4) {
    if (operator === 'masked-composite') {
      // The source branch acts as a luminance mask: bright mask pixels select the target branch;
      // dark mask pixels retain the source branch, producing a deterministic two-image composite.
      const luminance = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
      const useTarget = luminance >= threshold;
      for (let c = 0; c < 3; c++) out[i + c] = useTarget ? a[i + c] : b[i + c];
      out[i + 3] = useTarget ? a[i + 3] : b[i + 3];
      continue;
    }
    for (let c = 0; c < 3; c++) {
      if (operator === 'add') out[i + c] = Math.min(255, a[i + c] + b[i + c]);
      else if (operator === 'bitwise-or') out[i + c] = a[i + c] | b[i + c];
      else if (operator === 'bitwise-and') out[i + c] = a[i + c] & b[i + c];
      else if (operator === 'bitwise-xor') out[i + c] = a[i + c] ^ b[i + c];
      else out[i + c] = a[i + c];
    }
    out[i + 3] = Math.max(a[i + 3], b[i + 3]);
  }
  return output;
}

function applyOutputBlend(baseData, sourceData, outputBlend, canvas) {
  const merged = mergeImageOutputs(baseData, sourceData, outputBlend);
  canvas.width = merged.width;
  canvas.height = merged.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.putImageData(merged, 0, 0);
  return merged;
}

function mergeSelectedBranch() {
  if (isOpeningProject || isExportingFrames || isExtracting || isProcessing) return showMsg('Wait for the current operation to finish before merging branches.');
  syncActiveBranch();
  const target = getActiveBranch();
  const sourceId = document.getElementById('mergeSourceSelect').value;
  const source = state.branches.find(branch => branch.id === sourceId);
  const strategy = document.getElementById('mergeStrategySelect').value;
  if (!target || !source || source.id === target.id) return showMsg('Choose a different source branch to merge.');

  if (VALID_OUTPUT_MERGE_OPERATORS.includes(strategy)) {
    if (!state.mediaType || !state.mediaReady) return showMsg('Open an image or wait for video frame extraction to finish before merging branch outputs.');
    saveHistory();
    state.outputBlend = {
      baseBranchId: target.id,
      sourceBranchId: source.id,
      operator: strategy,
      mode: VALID_BLEND_MODES.includes(document.getElementById('blendModeSelect').value) ? document.getElementById('blendModeSelect').value : 'normal',
      opacity: Number(document.getElementById('blendOpacityInput').value) / 100,
      threshold: Number(document.getElementById('maskThresholdInput').value),
      outputChoice: document.getElementById('chooseOutputSelect').value === 'source' ? 'source' : 'target'
    };
    state.lastBranchMerge = { ...(state.lastBranchMerge || {}), sourceBranchId: source.id, targetBranchId: target.id, strategy, createdAt: Date.now() };
    renderBranchUI();
    requestProcess();
    const operatorNames = { blend: 'Blended', add: 'Added', 'bitwise-or': 'Bitwise OR combined', 'bitwise-and': 'Bitwise AND combined', 'bitwise-xor': 'Bitwise XOR combined', 'masked-composite': 'Created a masked composite from', 'choose-output': 'Selected an output from' };
    showMsg(`${operatorNames[strategy] || 'Merged'} ${source.name} with ${target.name}.`);
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
  state.lastBranchMerge = { ...(state.lastBranchMerge || {}), sourceBranchId: source.id, targetBranchId: target.id, strategy, createdAt: Date.now() };
  state.selectedBlockId = null;
  // Pipeline merge is now the new working version; clear a previous visual blend for this target.
  if (state.outputBlend?.baseBranchId === target.id) state.outputBlend = null;
  renderPipelineUI();
  requestProcess();
  showMsg(strategy === 'auto' ? `Merged compatible edits from ${source.name}.` : strategy === 'append' ? `Appended ${source.name}'s pipeline.` : `Replaced the pipeline with ${source.name}.`);
}

/* Issue 9 — interactive node workspace inspired by node-based image tools.
 * The existing pipeline remains the execution source of truth; node positions are freely movable.
 * Operation nodes follow pipeline order and branch edges show branch ancestry. */
function getGraphLayout(branch) {
  if (!branch.graphLayout || typeof branch.graphLayout !== 'object') branch.graphLayout = {};
  return branch.graphLayout;
}

function findVisibleGraphStep(branch, blockId) {
  if (!branch || !blockId) return null;
  const inheritedCount = branch.parentId ? Math.min((branch.basePipeline || []).length, (branch.pipeline || []).length) : 0;
  const index = (branch.pipeline || []).findIndex(block => block.id === blockId);
  if (index >= inheritedCount && index >= 0) return { branch, index };
  const parent = branch.parentId ? state.branches.find(item => item.id === branch.parentId) : null;
  return parent ? findVisibleGraphStep(parent, blockId) : null;
}

function defaultGraphPosition(branch, nodeKey, index, branchIndex) {
  const layout = getGraphLayout(branch);
  if (layout[nodeKey] && Number.isFinite(layout[nodeKey].x) && Number.isFinite(layout[nodeKey].y)) return layout[nodeKey];
  const laneY = 58 + branchIndex * 260;
  if (nodeKey === 'source') return { x: 230, y: laneY };
  if (nodeKey === 'branch' && !branch.parentId) return { x: 36, y: laneY };
  if (nodeKey === 'branch' && branch.parentId) {
    const parent = state.branches.find(item => item.id === branch.parentId);
    const parentIndex = Math.max(0, state.branches.findIndex(item => item.id === parent?.id));
    const forkCount = Math.min((branch.basePipeline || []).length, (parent?.pipeline || []).length);
    let forkPos;
    if (forkCount > 0 && parent) {
      const forkBlock = parent.pipeline[forkCount - 1];
      const owner = findVisibleGraphStep(parent, forkBlock?.id);
      if (owner) {
        const ownerInherited = owner.branch.parentId ? Math.min((owner.branch.basePipeline || []).length, (owner.branch.pipeline || []).length) : 0;
        const ownerIndex = Math.max(0, owner.index - ownerInherited);
        const ownerLane = Math.max(0, state.branches.findIndex(item => item.id === owner.branch.id));
        forkPos = defaultGraphPosition(owner.branch, `step:${forkBlock.id}`, ownerIndex, ownerLane);
      }
    } else if (parent && !parent.parentId) {
      forkPos = defaultGraphPosition(parent, 'source', -1, parentIndex);
    } else if (parent) {
      forkPos = defaultGraphPosition(parent, 'branch', -1, parentIndex);
    }
    return { x: (forkPos?.x || 230) + 220 + 70, y: laneY };
  }
  if (nodeKey.startsWith('step:')) {
    const stepX = branch.parentId
      ? defaultGraphPosition(branch, 'branch', -1, branchIndex).x + 300 + Math.max(0, index) * 320
      : 540 + Math.max(0, index) * 320;
    return { x: stepX, y: laneY };
  }
  return { x: 36, y: laneY };
}

function setupWorkspaceMouseControls() {
  const scroll = document.getElementById('branchGraphScroll');
  if (!scroll || scroll.dataset.mouseControlsReady === 'true') return;
  scroll.dataset.mouseControlsReady = 'true';
  scroll.addEventListener('pointerdown', event => {
    if (event.button !== 2 && event.button !== 1) return;
    if (event.target.closest('.node-workspace-node, .node-workspace-port, .node-context-menu')) return;
    event.preventDefault();
    const startX = event.clientX, startY = event.clientY;
    const startLeft = scroll.scrollLeft, startTop = scroll.scrollTop;
    scroll.classList.add('workspace-panning');
    const move = moveEvent => {
      scroll.scrollLeft = startLeft - (moveEvent.clientX - startX);
      scroll.scrollTop = startTop - (moveEvent.clientY - startY);
    };
    const up = () => {
      scroll.classList.remove('workspace-panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  scroll.addEventListener('contextmenu', event => {
    if (!event.target.closest('.node-workspace-node, .node-workspace-wire, .node-workspace-port')) event.preventDefault();
  });
}

function createBranchFromGraphNode(nodeData) {
  if (isOpeningProject || isExportingFrames || isExtracting || isProcessing) return showMsg('Wait for processing to finish before creating a branch.');
  if (state.branches.length >= MAX_BRANCHES) return showMsg(`A project can contain up to ${MAX_BRANCHES} branches.`);
  const parent = state.branches.find(branch => branch.id === nodeData?.branch?.id) || getActiveBranch();
  if (!parent) return;
  if (state.activeBranchId !== parent.id) switchBranch(parent.id);
  syncActiveBranch();
  let forkPipeline = clonePipeline(parent.pipeline || []);
  if (nodeData.kind === 'source') forkPipeline = [];
  else if (nodeData.kind === 'step') {
    const index = forkPipeline.findIndex(block => block.id === nodeData.block?.id);
    if (index >= 0) forkPipeline = forkPipeline.slice(0, index + 1);
  }
  const branch = makeBranchRecord({
    id: `branch-${generateId()}`,
    name: uniqueBranchName(`Branch ${state.branches.length + 1}`),
    pipeline: forkPipeline,
    selectedBlockId: null,
    parentId: parent.id,
    basePipeline: forkPipeline
  });
  branch.graphLayout.branch = { x: Math.max(24, nodeData.x + nodeData.w + 70), y: Math.max(24, nodeData.y + 115) };
  state.branches.push(branch);
  state.branchGraphVisible = true;
  switchBranch(branch.id);
  state.selectedGraphNodeId = `${branch.id}:branch`;
  renderBranchUI();
  showMsg(`Created ${branch.name} from ${parent.name} at ${nodeData.label}.`);
}

function addGraphOperation(nodeData, type, beforeNode = null) {
  if (!OPERATIONS[type]) return;
  if (isProcessing || isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for processing to finish before adding a block.');
  const branch = state.branches.find(item => item.id === nodeData?.branch?.id) || getActiveBranch();
  if (!branch) return;
  if (state.activeBranchId !== branch.id) switchBranch(branch.id);
  const active = getActiveBranch();
  if (!active) return;
  let index;
  if (beforeNode?.kind === 'step' && beforeNode.branch?.id === active.id) index = beforeNode.index;
  else if (nodeData.kind === 'step') index = state.pipeline.findIndex(block => block.id === nodeData.block?.id) + 1;
  else if (nodeData.kind === 'source') index = 0;
  else if (nodeData.kind === 'branch') index = active.parentId ? Math.min((active.basePipeline || []).length, state.pipeline.length) : state.pipeline.length;
  else index = state.pipeline.length;
  index = Math.max(0, Math.min(state.pipeline.length, index));
  const def = OPERATIONS[type];
  const params = {}; (def.params || []).forEach(parameter => params[parameter.id] = parameter.default);
  const block = { id: generateId(), type, params };
  saveHistory();
  state.pipeline.splice(index, 0, block);
  state.selectedBlockId = block.id;
  const nodeWidth = 220;
  let x = nodeData.x + nodeData.w + 70, y = nodeData.y + 10;
  if (beforeNode && beforeNode.kind === 'step') {
    x = Math.max(12, beforeNode.x - nodeWidth - 44);
    y = beforeNode.y;
  }
  getGraphLayout(active)[`step:${block.id}`] = { x, y };
  renderPipelineUI(); requestProcess();
  showMsg(`Added ${def.name} to ${active.name}.`);
}

function openNodeActionMenu(canvas, clientX, clientY, nodeData, wireInfo = null) {
  canvas.querySelector('.node-context-menu')?.remove();
  const rect = canvas.getBoundingClientRect();
  const menu = document.createElement('div'); menu.className = 'node-context-menu'; menu.setAttribute('role', 'menu');
  const localX = clientX - rect.left, localY = clientY - rect.top;
  menu.style.left = `${Math.max(8, Math.min(localX, Math.max(8, canvas.clientWidth - 270)))}px`;
  menu.style.top = `${Math.max(8, Math.min(localY, Math.max(8, canvas.clientHeight - 260)))}px`;
  const heading = document.createElement('div'); heading.className = 'node-context-menu-title';
  heading.textContent = wireInfo?.wire ? 'Extend connection' : `Extend ${nodeData?.label || 'node'}`;
  menu.appendChild(heading);
  const addAction = (label, action, className = '') => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `node-context-menu-item ${className}`; button.textContent = label;
    button.addEventListener('click', event => { event.stopPropagation(); action(); }); menu.appendChild(button); return button;
  };
  const clearMenuBody = () => [...menu.children].slice(1).forEach(child => child.remove());
  const showMainOptions = () => {
    clearMenuBody();
    addAction('⑂  Create branch here', () => { menu.remove(); createBranchFromGraphNode(nodeData); }, 'primary');
    addAction('Σ  Add merge here', () => { menu.remove(); addMergeNodeToWorkspace(nodeData); });
    addAction('＋  Add filter…', () => showFilterPicker());
    if (wireInfo?.wire && wireInfo.beforeNode?.kind === 'step' && nodeData?.branch?.id === wireInfo.beforeNode.branch?.id) {
      addAction('Delete destination filter', () => { menu.remove(); if (wireInfo.beforeNode.branch.id !== state.activeBranchId) switchBranch(wireInfo.beforeNode.branch.id); deleteBlock(wireInfo.beforeNode.block.id); }, 'danger');
    }
    if (nodeData?.kind === 'step' || nodeData?.kind === 'postMergeStep') addAction('Delete this filter', () => {
      menu.remove();
      if (nodeData.kind === 'postMergeStep') deletePostMergeOperation(nodeData.block.id);
      else { if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id); deleteBlock(nodeData.block.id); }
    }, 'danger');
    if (nodeData?.kind === 'merge') addAction('Delete merge node', () => { menu.remove(); deleteMergeNode(); }, 'danger');
    if (nodeData?.kind === 'branch' && state.branches.length > 1) addAction('Delete this branch…', () => { menu.remove(); if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id); deleteActiveBranch(); }, 'danger');
    addAction('Cancel', () => menu.remove(), 'muted');
  };
  const showFilterPicker = () => {
    clearMenuBody();
    const back = document.createElement('button'); back.type = 'button'; back.className = 'node-context-menu-item muted'; back.textContent = '← Back'; back.addEventListener('click', showMainOptions); menu.appendChild(back);
    const search = document.createElement('input'); search.type = 'search'; search.className = 'node-filter-search'; search.placeholder = 'Search filters…'; search.setAttribute('aria-label', 'Search filters'); menu.appendChild(search);
    const list = document.createElement('div'); list.className = 'node-context-operation-list'; menu.appendChild(list);
    const operations = Object.entries(OPERATIONS).map(([type, def]) => ({ type, name: def.name || type })).sort((a,b) => a.name.localeCompare(b.name));
    const renderOptions = () => {
      list.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase();
      const matches = operations.filter(item => item.name.toLocaleLowerCase().includes(query) || item.type.toLocaleLowerCase().includes(query));
      if (!matches.length) { const empty = document.createElement('div'); empty.className = 'node-context-menu-empty'; empty.textContent = 'No matching filters'; list.appendChild(empty); return; }
      for (const operation of matches) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'node-context-menu-item'; button.textContent = operation.name;
        button.addEventListener('click', event => {
          event.stopPropagation(); menu.remove();
          if (nodeData.kind === 'merge' || nodeData.kind === 'postMergeStep') addPostMergeOperation(nodeData, operation.type, wireInfo?.beforeNode || null);
          else addGraphOperation(nodeData, operation.type, wireInfo?.beforeNode || null);
        });
        list.appendChild(button);
      }
    };
    search.addEventListener('input', renderOptions); renderOptions(); search.focus();
  };
  if (wireInfo?.mergeInput !== null && wireInfo?.mergeInput !== undefined) {
    addAction('Disconnect this merge input', () => {
      menu.remove(); if (!state.lastBranchMerge) return;
      state.lastBranchMerge.connections = Array.isArray(state.lastBranchMerge.connections) ? state.lastBranchMerge.connections : [];
      state.lastBranchMerge.connections[wireInfo.mergeInput] = null; renderBranchUI(); showMsg('Merge input disconnected.');
    });
    addAction('Cancel', () => menu.remove(), 'muted');
  } else showMainOptions();
  canvas.appendChild(menu);
  // Menus are transient: tapping/clicking anywhere outside dismisses them.
  const dismissOnOutsidePointer = event => {
    if (!menu.isConnected) {
      document.removeEventListener('pointerdown', dismissOnOutsidePointer, true);
      return;
    }
    if (menu.contains(event.target)) return;
    menu.remove();
    document.removeEventListener('pointerdown', dismissOnOutsidePointer, true);
  };
  document.addEventListener('pointerdown', dismissOnOutsidePointer, true);
}

function renderNodeWorkspaceWires(canvas, nodes, branches) {
  const pad = 56;
  const maxX = Math.max(1050, ...nodes.map(n => n.x + n.w + pad));
  const maxY = Math.max(360, ...nodes.map(n => n.y + n.h + pad));
  canvas.style.width = `${maxX}px`;
  canvas.style.height = `${maxY}px`;
  canvas.querySelector('.node-workspace-wires')?.remove();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'node-workspace-wires');
  svg.setAttribute('width', String(maxX));
  svg.setAttribute('height', String(maxY));
  svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  svg.setAttribute('aria-hidden', 'true');
  const map = new Map(nodes.map(n => [n.id, n]));
  const isPortNode = n => n && (n.kind === 'source' || n.kind === 'step' || n.kind === 'postMergeStep' || n.kind === 'merge');
  const wire = (from, to, cls = '', inputIndex = null) => {
    if (!from || !to) return;
    // End at the centres of the real input/output ports; branch and merge blocks
    // have edge anchors instead of interactive ports.
    const sx = from.x + from.w + (isPortNode(from) ? 1 : 0); // centre of output port
    const sy = from.y + from.h / 2;
    const ex = to.x - (isPortNode(to) ? 1 : 0); // centre of input port
    const ey = to.kind === 'merge' && inputIndex !== null
      ? to.y + to.h * (inputIndex === 0 ? 0.34 : 0.68)
      : to.y + to.h / 2;
    const deltaX = ex - sx;
    const direction = deltaX >= 0 ? 1 : -1;
    // Keep curves readable even when users place nodes close together or reverse their order.
    const bend = Math.max(28, Math.min(120, Math.abs(deltaX) * 0.42));
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${sx} ${sy} C ${sx + direction * bend} ${sy}, ${ex - direction * bend} ${ey}, ${ex} ${ey}`);
    path.setAttribute('class', `node-workspace-wire ${cls}`);
    path.dataset.fromNodeId = from.id; path.dataset.toNodeId = to.id;
    path.addEventListener('contextmenu', event => {
      event.preventDefault(); event.stopPropagation();
      const mergeInput = to.kind === 'merge' ? Number(inputIndex ?? 0) : null;
      openNodeActionMenu(canvas, event.clientX, event.clientY, from, { beforeNode: to, mergeInput, wire: true });
    });
    svg.appendChild(path);
  };

  for (const branch of branches) {
    const branchNode = map.get(`${branch.id}:branch`);
    const baseCount = branch.parentId ? Math.min((branch.basePipeline || []).length, (branch.pipeline || []).length) : 0;
    const ownSteps = (branch.pipeline || []).slice(baseCount)
      .map(block => map.get(`${branch.id}:step:${block.id}`)).filter(Boolean);
    const source = map.get(`${branch.id}:source`);
    if (!branch.parentId) {
      // Keep the Main label physically connected to its source block.
      wire(branchNode, source, branch.id === state.activeBranchId ? 'active' : '');
      if (source && ownSteps.length) wire(source, ownSteps[0], branch.id === state.activeBranchId ? 'active' : '');
    } else {
      const parent = branches.find(b => b.id === branch.parentId);
      const parentPipeline = parent?.pipeline || [];
      const forkCount = Math.min((branch.basePipeline || []).length, parentPipeline.length);
      const forkBlock = forkCount ? parentPipeline[forkCount - 1] : null;
      const owner = forkBlock ? findVisibleGraphStep(parent, forkBlock.id) : null;
      const forkNode = owner
        ? map.get(`${owner.branch.id}:step:${forkBlock.id}`)
        : map.get(`${parent?.id}:source`) || map.get(`${parent?.id}:branch`);
      wire(forkNode, branchNode, branch.id === state.activeBranchId ? 'branch-fork active' : 'branch-fork');
      if (ownSteps.length) wire(branchNode, ownSteps[0], branch.id === state.activeBranchId ? 'active' : '');
    }
    for (let i = 0; i < ownSteps.length - 1; i++) {
      wire(ownSteps[i], ownSteps[i + 1], branch.id === state.activeBranchId ? 'active' : '');
    }
  }

  const merge = state.lastBranchMerge;
  const mergeNode = map.get('merge-output-node');
  if (merge && mergeNode) {
    const lastVisibleNode = branch => {
      if (!branch) return null;
      const baseCount = branch.parentId ? Math.min((branch.basePipeline || []).length, (branch.pipeline || []).length) : 0;
      const own = (branch.pipeline || []).slice(baseCount);
      if (own.length) return map.get(`${branch.id}:step:${own[own.length - 1].id}`);
      if (branch.parentId) return map.get(`${branch.id}:branch`);
      const rootPipeline = branch.pipeline || [];
      return rootPipeline.length ? map.get(`${branch.id}:step:${rootPipeline[rootPipeline.length - 1].id}`) : map.get(`${branch.id}:source`);
    };
    const connections = Array.isArray(merge.connections) ? merge.connections : [];
    const connectedTarget = connections[0] ? map.get(connections[0]) : null;
    const connectedSource = connections[1] ? map.get(connections[1]) : null;
    if (connectedTarget) wire(connectedTarget, mergeNode, 'merge-wire merge-input-target', 0);
    if (connectedSource) wire(connectedSource, mergeNode, 'merge-wire merge-input-source', 1);
    const downstream = (merge.downstreamPipeline || []).map(block => map.get(`postmerge:${block.id}`)).filter(Boolean);
    if (downstream.length) wire(mergeNode, downstream[0], 'merge-wire merge-output-wire');
    for (let i = 0; i < downstream.length - 1; i++) wire(downstream[i], downstream[i + 1], 'active');
  }
  canvas.insertBefore(svg, canvas.firstChild);
}

function buildInlineMergeEditor(body, detail, nodeData, canvas, nodes, branches) {
  body.classList.add('merge-node-editor');
  const preview = document.createElement('div'); preview.className = 'merge-node-preview';
  if (nodeData.stage?.thumbnail) {
    const image = document.createElement('img'); image.src = nodeData.stage.thumbnail; image.alt = 'Current merge output preview'; image.loading = 'lazy'; preview.appendChild(image);
  } else {
    const placeholder = document.createElement('span'); placeholder.textContent = 'Merge result preview appears after both inputs are connected and applied'; preview.appendChild(placeholder);
  }
  const settings = document.createElement('div'); settings.className = 'merge-node-settings';
  const config = state.lastBranchMerge || {};
  const makeSelect = (labelText, id, options, value) => {
    const label = document.createElement('label'); label.className = 'merge-node-control'; label.textContent = labelText;
    const select = document.createElement('select'); select.id = id;
    options.forEach(item => { const option = document.createElement('option'); option.value = item.value; option.textContent = item.label; select.appendChild(option); });
    select.value = value || ''; select.addEventListener('pointerdown', event => event.stopPropagation());
    label.appendChild(select); return { label, select };
  };
  const branchOptions = branches.map(branch => ({ value: branch.id, label: branch.name }));
  const target = makeSelect('Target branch', 'mergeNodeTarget', branchOptions, config.targetBranchId || state.activeBranchId);
  const sourceOptionsFor = targetId => branchOptions.filter(option => option.value !== targetId);
  const source = makeSelect('Source branch', 'mergeNodeSource', sourceOptionsFor(target.select.value), config.sourceBranchId || sourceOptionsFor(target.select.value)[0]?.value);
  const operators = [
    { value:'blend', label:'Blend' }, { value:'add', label:'Add' }, { value:'bitwise-or', label:'Bitwise OR' },
    { value:'bitwise-and', label:'Bitwise AND' }, { value:'bitwise-xor', label:'Bitwise XOR' },
    { value:'masked-composite', label:'Masked Composite' }, { value:'choose-output', label:'Choose Output' },
    { value:'auto', label:'Auto-merge pipeline edits' }, { value:'append', label:'Append source pipeline' }, { value:'replace', label:'Replace target pipeline' }
  ];
  const operator = makeSelect('Operation', 'mergeNodeOperator', operators, config.strategy || 'blend');
  const mode = makeSelect('Blend mode', 'mergeNodeBlendMode', ['normal','multiply','screen','overlay','difference','darken','lighten'].map(value => ({value,label:value[0].toUpperCase()+value.slice(1)})), config.mode || 'normal');
  const choice = makeSelect('Output', 'mergeNodeChoice', [{value:'target',label:'Target output'},{value:'source',label:'Source output'}], config.outputChoice || 'target');
  const opacityLabel = document.createElement('label'); opacityLabel.className = 'merge-node-control'; opacityLabel.textContent = 'Opacity';
  const opacity = document.createElement('input'); opacity.type='range'; opacity.min='0'; opacity.max='100'; opacity.value=String(Math.round(Number(config.opacity ?? .5)*100));
  const opacityValue = document.createElement('span'); opacityValue.textContent=`${opacity.value}%`; opacityLabel.append(opacity,opacityValue);
  const thresholdLabel = document.createElement('label'); thresholdLabel.className='merge-node-control'; thresholdLabel.textContent='Mask threshold';
  const threshold = document.createElement('input'); threshold.type='range'; threshold.min='0'; threshold.max='255'; threshold.value=String(config.threshold ?? 128);
  const thresholdValue = document.createElement('span'); thresholdValue.textContent=threshold.value; thresholdLabel.append(threshold,thresholdValue);
  const options = document.createElement('div'); options.className='merge-node-option-fields';
  const update = () => {
    const current = state.lastBranchMerge || {};
    current.targetBranchId=target.select.value; current.sourceBranchId=source.select.value; current.strategy=operator.select.value;
    current.mode=mode.select.value; current.opacity=Number(opacity.value)/100; current.threshold=Number(threshold.value); current.outputChoice=choice.select.value;
    state.lastBranchMerge=current;
    document.getElementById('mergeSourceSelect').value=current.sourceBranchId;
    document.getElementById('mergeStrategySelect').value=current.strategy;
    document.getElementById('blendModeSelect').value=current.mode;
    document.getElementById('blendOpacityInput').value=opacity.value;
    document.getElementById('maskThresholdInput').value=threshold.value;
    document.getElementById('chooseOutputSelect').value=current.outputChoice;
    detail.textContent=`${branches.find(b=>b.id===current.sourceBranchId)?.name || 'Source'} → ${branches.find(b=>b.id===current.targetBranchId)?.name || 'Target'} · ${operator.select.options[operator.select.selectedIndex]?.text || current.strategy}`;
    opacityValue.textContent=`${opacity.value}%`; thresholdValue.textContent=threshold.value;
    mode.label.hidden=operator.select.value!=='blend'; opacityLabel.hidden=operator.select.value!=='blend';
    thresholdLabel.hidden=operator.select.value!=='masked-composite'; choice.label.hidden=operator.select.value!=='choose-output';
  };
  target.select.addEventListener('change', () => {
    const prior=source.select.value, filtered=sourceOptionsFor(target.select.value);
    if (state.lastBranchMerge) { state.lastBranchMerge.connections = Array.isArray(state.lastBranchMerge.connections) ? state.lastBranchMerge.connections : []; state.lastBranchMerge.connections[0] = null; }
    source.select.replaceChildren(...filtered.map(item=>{const o=document.createElement('option');o.value=item.value;o.textContent=item.label;return o;}));
    source.select.value=filtered.some(item=>item.value===prior)?prior:(filtered[0]?.value||''); update(); renderNodeWorkspaceWires(canvas, nodes, branches);
  });
  source.select.addEventListener('change', () => { if (state.lastBranchMerge) { state.lastBranchMerge.connections = Array.isArray(state.lastBranchMerge.connections) ? state.lastBranchMerge.connections : []; state.lastBranchMerge.connections[1] = null; } update(); renderNodeWorkspaceWires(canvas, nodes, branches); });
  [operator.select,mode.select,choice.select].forEach(select=>select.addEventListener('change',update));
  opacity.addEventListener('input',update); threshold.addEventListener('input',update);
  options.append(mode.label,opacityLabel,thresholdLabel,choice.label);
  const apply=document.createElement('button'); apply.type='button'; apply.className='btn btn-small primary merge-node-apply'; apply.textContent='Apply merge';
  apply.addEventListener('pointerdown',event=>event.stopPropagation());
  apply.addEventListener('click',event=>{
    event.stopPropagation(); update();
    if(!target.select.value || !source.select.value || target.select.value===source.select.value) return showMsg('Choose different source and target branches.');
    const connections = state.lastBranchMerge?.connections || [];
    if (!connections[0] || !connections[1]) return showMsg('Connect both merge input ports with wires before applying the merge.');
    if(state.activeBranchId!==target.select.value) switchBranch(target.select.value);
    document.getElementById('mergeSourceSelect').value=source.select.value;
    document.getElementById('mergeStrategySelect').value=operator.select.value;
    document.getElementById('blendModeSelect').value=mode.select.value;
    document.getElementById('blendOpacityInput').value=opacity.value;
    document.getElementById('maskThresholdInput').value=threshold.value;
    document.getElementById('chooseOutputSelect').value=choice.select.value;
    mergeSelectedBranch();
  });
  settings.append(target.label,source.label,operator.label,options,apply);
  body.append(preview, settings);
  update();
}

function renderBranchGraph() {
  const area = document.getElementById('branchGraphArea');
  const canvas = document.getElementById('branchGraphCanvas');
  const summary = document.getElementById('branchGraphSummary');
  if (!area || !canvas) return;
  const branches = Array.isArray(state.branches) ? state.branches : [];
  // The node workspace is the primary editor surface and stays visible.
  const visible = true;
  state.branchGraphVisible = true;
  area.hidden = false;
  document.body.classList.toggle('node-workspace-open', true);
  setupWorkspaceMouseControls();
  if (summary) summary.textContent = `${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${branches.reduce((n, b) => n + (b.pipeline || []).length, 0)} operation blocks`;
  updateCompareSelectedNodeButton();
  canvas.replaceChildren();
  if (!visible) return;
  if (!branches.length) {
    const empty = document.createElement('div'); empty.className = 'branch-graph-empty';
    empty.textContent = 'Load media and add operations, or create a branch to build a node workflow.';
    canvas.appendChild(empty); return;
  }

  const nodeW = 260, nodeH = 188, pad = 48, laneGap = 310;
  const positions = new Map();
  const nodes = [];
  branches.forEach((branch, branchIndex) => {
    const laneY = 58 + branchIndex * laneGap;
    const branchNodeKey = 'branch';
    const branchPos = defaultGraphPosition(branch, branchNodeKey, -1, branchIndex);
    const branchSelected = state.selectedGraphNodeId === `${branch.id}:branch`;
    nodes.push({ id: `${branch.id}:branch`, branch, key: branchNodeKey, kind: 'branch', selected: branchSelected, x: branchPos.x, y: branchPos.y, w: branchSelected ? 224 : 154, h: branchSelected ? 160 : 58, label: branch.name, detail: branch.parentId ? `Child of ${branches.find(b => b.id === branch.parentId)?.name || 'branch'}` : 'Main pipeline' });
    const snapshots = state.branchStageSnapshots?.[branch.id] || [];
    const sourceKey = 'source';
    if (!branch.parentId) {
      const pos = defaultGraphPosition(branch, sourceKey, -1, branchIndex);
      nodes.push({ id: `${branch.id}:source`, branch, key: sourceKey, kind: 'source', x: pos.x, y: pos.y, w: nodeW, h: nodeH, label: 'Source Image', detail: 'Original image/frame', stage: snapshots.find(s => s.kind === 'source') });
    }
    const inheritedCount = branch.parentId ? Math.min((branch.basePipeline || []).length, (branch.pipeline || []).length) : 0;
    (branch.pipeline || []).forEach((block, index) => {
      if (index < inheritedCount) return; // Inherited operations are shown on the parent lane; show only this branch's own nodes.
      const key = `step:${block.id}`;
      const pos = defaultGraphPosition(branch, key, index - inheritedCount, branchIndex);
      const operationName = OPERATIONS[block.type]?.name || block.type || `Step ${index + 1}`;
      nodes.push({ id: `${branch.id}:${key}`, branch, key, kind: 'step', block, index, x: pos.x, y: pos.y, w: nodeW, h: nodeH, label: operationName, detail: `Block ${index + 1} · ${branch.name}`, stage: snapshots.find(s => s.kind === 'step' && s.blockId === block.id) });
    });
  });

  // Downstream blocks extend the merged result and execute after the merge.
  if (state.lastBranchMerge) {
    const targetBranch = branches.find(b => b.id === state.lastBranchMerge.targetBranchId) || getActiveBranch();
    const downstream = Array.isArray(state.lastBranchMerge.downstreamPipeline) ? state.lastBranchMerge.downstreamPipeline : [];
    const snapshots = state.branchStageSnapshots?.[targetBranch?.id] || [];
    downstream.forEach((block, index) => {
      const key = `postmerge:${block.id}`;
      const pos = getGraphLayout(targetBranch || { graphLayout: {} })[key] || { x: (state.mergeGraphPosition?.x || 600) + 300 + index * 210, y: (state.mergeGraphPosition?.y || 40) + 8 };
      nodes.push({ id: `postmerge:${block.id}`, branch: targetBranch || null, key, kind: 'postMergeStep', block, index, x: pos.x, y: pos.y, w: nodeW, h: nodeH, label: OPERATIONS[block.type]?.name || block.type, detail: `After merge · ${index + 1}`, stage: snapshots.find(stage => stage.kind === 'post-merge-step' && stage.blockId === block.id) });
    });
  }

  // Add the merge node to the same graph before drawing connections, so its wires
  // and bounds are calculated alongside every other node.
  if (state.lastBranchMerge) {
    const mergePos = state.mergeGraphPosition || { x: Math.max(520, ...nodes.map(n => n.x + n.w + 70)), y: 40 };
    const sourceBranch = branches.find(b => b.id === state.lastBranchMerge.sourceBranchId);
    const targetBranch = branches.find(b => b.id === state.lastBranchMerge.targetBranchId);
    const selected = state.selectedGraphNodeId === 'merge-output-node';
    nodes.push({
      id: 'merge-output-node', kind: 'merge', x: mergePos.x, y: mergePos.y,
      w: selected ? 292 : 260, h: selected ? 278 : 194, selected,
      label: 'Merge Output', detail: `${sourceBranch?.name || 'Source'} → ${targetBranch?.name || 'Target'}`,
      branch: targetBranch || null,
      stage: (state.branchStageSnapshots?.[targetBranch?.id] || []).find(stage => stage.kind === 'blend')
        || (targetBranch?.pipeline?.length ? (state.branchStageSnapshots?.[targetBranch.id] || []).find(stage => stage.blockId === targetBranch.pipeline[targetBranch.pipeline.length - 1].id) : null)
        || (state.branchStageSnapshots?.[sourceBranch?.id] || []).slice(-1)[0] || null
    });
  }

  // Draw wires from node-port anchors and keep the canvas large enough for moved nodes.
  renderNodeWorkspaceWires(canvas, nodes, branches);

  for (const nodeData of nodes) {
    const node = document.createElement('div');
    node.className = `node-workspace-node ${nodeData.kind}-node${nodeData.branch?.id === state.activeBranchId ? ' active' : ''}${(nodeData.kind === 'step' && nodeData.branch?.selectedBlockId === nodeData.block?.id) || nodeData.selected ? ' selected' : ''}`;
    node.dataset.nodeId = nodeData.id;
    node.addEventListener('contextmenu', event => {
      event.preventDefault(); event.stopPropagation();
      openNodeActionMenu(canvas, event.clientX, event.clientY, nodeData);
    });
    node.style.left = `${nodeData.x}px`; node.style.top = `${nodeData.y}px`; node.style.width = `${nodeData.w}px`; node.style.height = `${nodeData.h}px`;
    const head = document.createElement('div'); head.className = 'node-workspace-node-head';
    const glyph = document.createElement('span'); glyph.className = 'node-workspace-glyph'; glyph.textContent = nodeData.kind === 'source' ? 'IN' : nodeData.kind === 'merge' ? 'Σ' : nodeData.kind === 'branch' ? '⑂' : 'CV';
    const title = document.createElement('span'); title.className = 'node-workspace-node-title'; title.textContent = nodeData.label;
    head.append(glyph, title);
    const body = document.createElement('div'); body.className = 'node-workspace-node-body';
    const detail = document.createElement('div'); detail.className = 'node-workspace-node-detail'; detail.textContent = nodeData.detail || '';
    if (nodeData.kind === 'merge' && nodeData.selected) {
      buildInlineMergeEditor(body, detail, nodeData, canvas, nodes, branches);
    } else if (nodeData.stage?.thumbnail) {
      const img = document.createElement('img'); img.src = nodeData.stage.thumbnail; img.alt = `${nodeData.label} preview`; img.loading = 'lazy'; body.appendChild(img);
    } else if (!(nodeData.kind === 'branch' && nodeData.selected)) {
      const placeholder = document.createElement('span'); placeholder.className = 'node-workspace-placeholder';
      placeholder.textContent = nodeData.kind === 'step' || nodeData.kind === 'postMergeStep' ? 'Output preview appears after processing' : nodeData.kind === 'merge' ? 'Select to configure merge' : nodeData.kind === 'branch' ? nodeData.detail : 'Original image/frame'; body.appendChild(placeholder);
    }
    if (nodeData.kind === 'branch' && nodeData.selected) {
      body.classList.add('branch-node-editor');
      const create = document.createElement('button'); create.type = 'button'; create.className = 'btn btn-small primary'; create.textContent = '+ Child branch';
      create.addEventListener('click', event => { event.stopPropagation(); createBranchFromGraphNode(nodeData); });
      const renameInput = document.createElement('input');
      renameInput.type = 'text'; renameInput.maxLength = MAX_BRANCH_NAME_LENGTH; renameInput.value = nodeData.branch.name;
      renameInput.className = 'branch-inline-name-input'; renameInput.placeholder = 'Branch name';
      renameInput.setAttribute('aria-label', 'Branch name (changes apply automatically)');
      renameInput.title = 'Edit this name; changes are applied automatically';
      renameInput.addEventListener('pointerdown', event => event.stopPropagation());
      renameInput.addEventListener('click', event => event.stopPropagation());
      renameInput.addEventListener('input', () => {
        const value = renameInput.value.trim();
        const duplicate = state.branches.some(item => item.id !== nodeData.branch.id && item.name.toLocaleLowerCase() === value.toLocaleLowerCase());
        if (!value || duplicate) { renameInput.setCustomValidity(!value ? 'Branch name cannot be empty.' : 'Branch names must be unique.'); return; }
        renameInput.setCustomValidity('');
        nodeData.branch.name = value;
        title.textContent = value;
        detail.textContent = nodeData.branch.parentId ? `Child of ${state.branches.find(item => item.id === nodeData.branch.parentId)?.name || 'branch'}` : 'Main pipeline';
        const hiddenInput = document.getElementById('branchRenameInput'); if (hiddenInput) hiddenInput.value = value;
        const option = document.querySelector(`#branchSelect option[value="${CSS.escape(nodeData.branch.id)}"]`); if (option) option.textContent = value;
        for (const select of [document.getElementById('mergeSourceSelect')]) {
          const item = select && [...select.options].find(option => option.value === nodeData.branch.id);
          if (item) item.textContent = value;
        }
        const summary = document.getElementById('branchGraphSummary');
        if (summary) summary.textContent = `${state.branches.length} branch${state.branches.length === 1 ? '' : 'es'} · ${state.branches.reduce((n, b) => n + (b.pipeline || []).length, 0)} operation blocks`;
      });
      const commitName = () => {
        if (!renameInput.value.trim() || renameInput.validationMessage) renameInput.value = nodeData.branch.name;
        renderBranchUI();
      };
      renameInput.addEventListener('blur', commitName);
      renameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); renameInput.blur(); } });
      const removeBranch = document.createElement('button'); removeBranch.type = 'button'; removeBranch.className = 'btn btn-small danger-outline'; removeBranch.textContent = 'Delete branch'; removeBranch.disabled = state.branches.length <= 1;
      removeBranch.addEventListener('click', event => { event.stopPropagation(); if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id); deleteActiveBranch(); });
      body.append(create, renameInput, removeBranch);
    }
    node.append(head, body, detail);
    if (['source', 'step', 'branch', 'merge', 'postMergeStep'].includes(nodeData.kind)) {
      const actions = document.createElement('div'); actions.className = 'node-workspace-node-actions';
      const compare = document.createElement('button'); compare.type = 'button'; compare.className = 'btn btn-small node-output-compare'; compare.textContent = 'Compare'; compare.title = 'Capture this node output and open comparison';
      compare.addEventListener('pointerdown', event => event.stopPropagation());
      compare.addEventListener('click', async event => { event.stopPropagation(); try { await addGraphNodeToComparison(nodeData, true); } catch (error) { console.error(error); showMsg(error.message || 'Could not compare this output.'); } });
      const addSlot = document.createElement('button'); addSlot.type = 'button'; addSlot.className = 'btn btn-small node-output-add-slot';
      const nextEmpty = state.comparisonSlots.findIndex(slot => !slot);
      const targetSlot = !state.comparisonSlots[state.comparisonTargetSlot] ? state.comparisonTargetSlot : (nextEmpty >= 0 ? nextEmpty : state.comparisonTargetSlot);
      addSlot.textContent = `+ Slot ${targetSlot + 1}`; addSlot.title = `Add this node output to comparison slot ${targetSlot + 1}`;
      addSlot.addEventListener('pointerdown', event => event.stopPropagation());
      addSlot.addEventListener('click', async event => { event.stopPropagation(); state.comparisonTargetSlot = targetSlot; try { await addGraphNodeToComparison(nodeData, false); } catch (error) { console.error(error); showMsg(error.message || 'Could not add this output to comparison.'); } });
      actions.append(compare, addSlot); node.appendChild(actions);
    }
    if (nodeData.kind === 'source' || nodeData.kind === 'step' || nodeData.kind === 'postMergeStep' || nodeData.kind === 'branch') {
      const inputPort = nodeData.kind === 'branch' ? null : document.createElement('button');
      if (inputPort) {
        inputPort.type = 'button'; inputPort.className = 'node-workspace-port input-port';
        inputPort.dataset.nodeId = nodeData.id; inputPort.title = 'Input port — drop a connection here'; inputPort.setAttribute('aria-label', `Input port for ${nodeData.label}`);
      }
      const outputPort = document.createElement('button');
      outputPort.type = 'button'; outputPort.className = 'node-workspace-port output-port';
      outputPort.dataset.nodeId = nodeData.id; outputPort.title = 'Drag from here to connect to another block'; outputPort.setAttribute('aria-label', `Output port for ${nodeData.label}`);
      inputPort?.addEventListener('pointerdown', event => event.stopPropagation());
      outputPort.title = nodeData.kind === 'branch' ? 'Drag from here to add a filter, create a child branch, or add a merge' : 'Drag from here to connect to another block';
      outputPort.setAttribute('aria-label', `Output port for ${nodeData.label}`);
      outputPort.addEventListener('pointerdown', event => {
        event.preventDefault(); event.stopPropagation();
        // Inactive branch outputs may be wired into a merge node.
        if (isProcessing || isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for processing to finish before connecting blocks.');
        const svgLayer = canvas.querySelector('.node-workspace-wires');
        if (!svgLayer) return;
        const wirePreview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        wirePreview.setAttribute('class', 'node-workspace-wire wire-preview'); svgLayer.appendChild(wirePreview);
        const sourceX = nodeData.x + nodeData.w + 1, sourceY = nodeData.y + nodeData.h / 2;
        let finished = false;
        const moveWire = moveEvent => {
          const rect = canvas.getBoundingClientRect(); const x = moveEvent.clientX - rect.left, y = moveEvent.clientY - rect.top;
          const bend = Math.max(36, Math.abs(x - sourceX) * .45);
          wirePreview.setAttribute('d', `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${x - bend} ${y}, ${x} ${y}`);
        };
        const finishWire = upEvent => {
          if (finished) return; finished = true;
          window.removeEventListener('pointermove', moveWire); window.removeEventListener('pointerup', finishWire); window.removeEventListener('pointercancel', cancelWire);
          wirePreview.remove();
          const dropTarget = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          const targetPort = dropTarget?.closest('.node-workspace-port.input-port');
          if (!targetPort) {
            if (dropTarget?.closest('#branchGraphCanvas') === canvas) openNodeActionMenu(canvas, upEvent.clientX, upEvent.clientY, nodeData);
            return;
          }
          const target = nodes.find(item => item.id === targetPort.dataset.nodeId);
          if (!target || target.id === nodeData.id) return;
          if (target.kind === 'merge') {
            if (nodeData.kind === 'merge' || nodeData.kind === 'postMergeStep') return showMsg('Connect branch outputs to merge inputs; extend the merge output with a filter instead.');
            const inputIndex = Number(targetPort.dataset.inputIndex || 0);
            if (!nodeData.branch?.id) return showMsg('Connect a branch output to the merge input.');
            const config = state.lastBranchMerge || {};
            let nextTargetId = inputIndex === 0 ? nodeData.branch.id : (config.targetBranchId || state.activeBranchId);
            let nextSourceId = inputIndex === 1 ? nodeData.branch.id : (config.sourceBranchId || state.branches.find(branch => branch.id !== nextTargetId)?.id);
            if (nextTargetId === nextSourceId) {
              if (inputIndex === 0) nextSourceId = config.targetBranchId && config.targetBranchId !== nextTargetId ? config.targetBranchId : state.branches.find(branch => branch.id !== nextTargetId)?.id;
              else nextTargetId = config.sourceBranchId && config.sourceBranchId !== nextSourceId ? config.sourceBranchId : state.branches.find(branch => branch.id !== nextSourceId)?.id;
            }
            if (!nextTargetId || !nextSourceId || nextTargetId === nextSourceId) return showMsg('A merge needs outputs from two different branches.');
            config.connections = Array.isArray(config.connections) ? config.connections : [];
            config.connections[inputIndex] = nodeData.id;
            config.targetBranchId = nextTargetId; config.sourceBranchId = nextSourceId;
            state.lastBranchMerge = config; state.selectedGraphNodeId = 'merge-output-node';
            renderBranchUI();
            showMsg(`Connected ${nodeData.label} to merge ${inputIndex === 0 ? 'target' : 'source'} input.`);
            return;
          }
          if (target.kind === 'postMergeStep') {
            if (nodeData.kind === 'merge' || nodeData.kind === 'postMergeStep') {
              const downstream = state.lastBranchMerge?.downstreamPipeline || [];
              const movingId = nodeData.kind === 'postMergeStep' ? nodeData.block?.id : null;
              if (movingId) { const movingIndex = downstream.findIndex(block => block.id === movingId); const targetIndex = downstream.findIndex(block => block.id === target.block?.id); if (movingIndex >= 0 && targetIndex >= 0 && movingIndex !== targetIndex) { const [moving] = downstream.splice(movingIndex, 1); downstream.splice(targetIndex, 0, moving); state.lastBranchMerge.downstreamPipeline = downstream; renderBranchUI(); requestProcess(); } }
              return;
            }
            return showMsg('Connect the merge output to a post-merge filter.');
          }
          if (nodeData.kind === 'merge' || nodeData.kind === 'postMergeStep') return showMsg('Extend a merge with post-merge filters; regular branch filters stay on their branch.');
          if (target.kind === 'branch' || target.branch?.id !== nodeData.branch?.id || target.kind === 'source') return showMsg('Connect processing blocks within the same branch, or connect to a merge input.');
          if (nodeData.branch?.id !== state.activeBranchId) return showMsg('Switch to this branch before rewiring its processing blocks.');
          if (nodeData.kind === 'step' && target.kind === 'step') {
            if (nodeData.index + 1 === target.index) return;
            saveHistory();
            const moving = state.pipeline.findIndex(block => block.id === nodeData.block.id);
            if (moving < 0) return;
            const block = state.pipeline.splice(moving, 1)[0];
            const targetIndex = state.pipeline.findIndex(item => item.id === target.block.id);
            if (targetIndex < 0) { state.pipeline.splice(moving, 0, block); return; }
            state.pipeline.splice(targetIndex, 0, block);
          } else if (nodeData.kind === 'source' && target.kind === 'step') {
            const targetIndex = state.pipeline.findIndex(item => item.id === target.block.id);
            if (targetIndex <= 0) return;
            saveHistory(); const [block] = state.pipeline.splice(targetIndex, 1); state.pipeline.unshift(block);
          } else return;
          state.selectedBlockId = nodeData.kind === 'step' ? nodeData.block.id : target.block.id;
          renderPipelineUI(); requestProcess(); showMsg(`Connected ${nodeData.label} → ${target.label}; pipeline order updated.`);
        };
        const cancelWire = () => { if (finished) return; finished = true; window.removeEventListener('pointermove', moveWire); window.removeEventListener('pointerup', finishWire); wirePreview.remove(); };
        window.addEventListener('pointermove', moveWire); window.addEventListener('pointerup', finishWire); window.addEventListener('pointercancel', cancelWire);
      });
      if (inputPort) node.appendChild(inputPort);
      node.appendChild(outputPort);
    }
    if (nodeData.kind === 'merge') {
      for (let inputIndex = 0; inputIndex < 2; inputIndex++) {
        const inputPort = document.createElement('button');
        inputPort.type = 'button'; inputPort.className = `node-workspace-port input-port merge-input-port merge-input-${inputIndex}`;
        inputPort.dataset.nodeId = nodeData.id; inputPort.dataset.inputIndex = String(inputIndex);
        inputPort.title = inputIndex === 0 ? 'Connect target/base branch output here' : 'Connect source branch output here';
        inputPort.setAttribute('aria-label', inputPort.title);
        inputPort.addEventListener('pointerdown', event => event.stopPropagation());
        node.appendChild(inputPort);
      }
      const outputPort = document.createElement('button'); outputPort.type = 'button'; outputPort.className = 'node-workspace-port output-port merge-output-port'; outputPort.dataset.nodeId = nodeData.id; outputPort.title = 'Drag from here to extend the merged output'; outputPort.setAttribute('aria-label', 'Merge output port');
      outputPort.addEventListener('click', event => { event.stopPropagation(); openNodeActionMenu(canvas, event.clientX, event.clientY, nodeData); });
      node.appendChild(outputPort);
    }
    if (nodeData.kind === 'step') {
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'node-workspace-delete'; remove.textContent = '×'; remove.title = 'Delete operation';
      remove.addEventListener('click', event => { event.stopPropagation(); if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id); deleteBlock(nodeData.block.id); });
      head.appendChild(remove);
    }
    if (nodeData.kind === 'merge' && nodeData.selected) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'node-workspace-delete'; remove.textContent = '×'; remove.title = 'Delete merge node';
      remove.addEventListener('click', event => { event.stopPropagation(); deleteMergeNode(); });
      head.appendChild(remove);
    }
    if (nodeData.kind === 'branch') {
      node.title = `Click to switch to ${nodeData.branch.name}; drag the header to move it`;
      node.addEventListener('click', event => { if (event.target.closest('button, input')) return; if (node.dataset.dragMoved === 'true') { node.dataset.dragMoved = 'false'; return; } if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id); state.selectedGraphNodeId = `${nodeData.branch.id}:branch`; renderBranchGraph(); });
    }
    if (nodeData.kind === 'postMergeStep') {
      node.title = 'Post-merge filter. It runs after the merge output.';
      node.addEventListener('click', event => {
        if (event.target.closest('button, input, select, label') || node.dataset.dragMoved === 'true') { node.dataset.dragMoved = 'false'; return; }
        state.selectedGraphNodeId = nodeData.id; state.activeStageKey = `${nodeData.branch?.id}:postmerge:${nodeData.block.id}`; renderBranchGraph(); requestProcess();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'node-workspace-delete'; remove.textContent = '×'; remove.title = 'Delete post-merge filter';
      remove.addEventListener('click', event => { event.stopPropagation(); deletePostMergeOperation(nodeData.block.id); }); head.appendChild(remove);
    }
    if (nodeData.kind === 'step') {
      node.title = 'Click to select this stage output and edit its parameters. Drag the header to move this node.';
      node.addEventListener('click', event => {
        if (event.target.closest('button') || node.dataset.dragMoved === 'true') { node.dataset.dragMoved = 'false'; return; }
        if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id);
        state.selectedBlockId = nodeData.block.id;
        state.activeStageKey = `${nodeData.branch.id}:step:${nodeData.block.id}`;
        renderPipelineUI();
        requestProcess();
        renderBranchUI();
      });
    }
    if (nodeData.kind === 'source') {
      node.title = 'Select the original image output';
      node.addEventListener('click', event => {
        if (event.target.closest('button') || node.dataset.dragMoved === 'true') { node.dataset.dragMoved = 'false'; return; }
        if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id);
        state.activeStageKey = `${nodeData.branch.id}:source`;
        requestProcess();
        renderBranchUI();
      });
    }
    if (nodeData.kind === 'merge') {
      node.title = 'Select this merge node to edit its inputs, operator, and settings directly on the canvas.';
      node.addEventListener('click', event => {
        if (event.target.closest('button, select, input, label') || node.dataset.dragMoved === 'true') { node.dataset.dragMoved = 'false'; return; }
        state.selectedGraphNodeId = 'merge-output-node';
        renderBranchGraph();
      });
    }
    // Pointer-based drag lets the canvas work with mouse, pen and touch without dragging images.
    head.classList.add('node-workspace-drag-handle');
    head.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button, select, input, label')) return;
      event.preventDefault();
      const startX = event.clientX, startY = event.clientY, originX = nodeData.x, originY = nodeData.y;
      head.setPointerCapture?.(event.pointerId);
      const move = moveEvent => {
        const dx = moveEvent.clientX - startX, dy = moveEvent.clientY - startY;
        node.style.left = `${Math.max(8, originX + dx)}px`; node.style.top = `${Math.max(8, originY + dy)}px`;
        // Update wire geometry live while the node is being moved.
        const newX = Math.max(8, originX + dx), newY = Math.max(8, originY + dy);
        const oldX = nodeData.x, oldY = nodeData.y; nodeData.x = newX; nodeData.y = newY;
        const branch = nodeData.branch; if (branch) getGraphLayout(branch)[nodeData.key] = { x: newX, y: newY };
        renderNodeWorkspaceWires(canvas, nodes, branches);
      };
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (nodeData.branch) { const layout = getGraphLayout(nodeData.branch); layout[nodeData.key] = { x: nodeData.x, y: nodeData.y }; }
        if (nodeData.kind === 'merge') state.mergeGraphPosition = { x: nodeData.x, y: nodeData.y };
        if (Math.abs(nodeData.x-originX)+Math.abs(nodeData.y-originY)>2) { node.dataset.dragMoved = 'true'; showMsg('Node position updated. Save the project to keep this layout.'); }
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
    canvas.appendChild(node);
  }

  // Accept operation drops from the left-hand processing palette.
  canvas.ondragover = event => {
    const types = event.dataTransfer?.types;
    if (types?.includes('application/x-purrfectcv-operation') || types?.includes('application/x-purrfectcv-merge')) {
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; canvas.classList.add('node-workspace-drop-target');
    }
  };
  canvas.ondragleave = event => { if (!canvas.contains(event.relatedTarget)) canvas.classList.remove('node-workspace-drop-target'); };
  canvas.ondrop = event => {
    const mergeType = event.dataTransfer?.getData('application/x-purrfectcv-merge') || '';
    const type = event.dataTransfer?.getData('application/x-purrfectcv-operation') || '';
    if (mergeType === 'merge') {
      event.preventDefault(); canvas.classList.remove('node-workspace-drop-target');
      if (isProcessing || isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for processing to finish before adding a merge node.');
      if (state.branches.length < 2) return showMsg('Create a second branch before adding a merge node.');
      if (state.lastBranchMerge) return showMsg('Only one merge node is supported in this milestone. Select the existing node to edit it.');
      addMergeNodeToWorkspace();
      const rect = canvas.getBoundingClientRect();
      state.mergeGraphPosition = { x: Math.max(8, event.clientX - rect.left + canvas.scrollLeft - 155), y: Math.max(8, event.clientY - rect.top + canvas.scrollTop - 40) };
      renderBranchGraph();
      return;
    }
    if (!OPERATIONS[type]) return;
    event.preventDefault(); canvas.classList.remove('node-workspace-drop-target');
    if (isProcessing || isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for processing to finish before adding a block.');
    const rect = canvas.getBoundingClientRect(); const x = Math.max(8, event.clientX - rect.left + canvas.scrollLeft - nodeW/2); const y = Math.max(8, event.clientY - rect.top + canvas.scrollTop - nodeH/2);
    const def = OPERATIONS[type]; const params = {}; def.params.forEach(p => params[p.id] = p.default);
    saveHistory(); const block = { id: generateId(), type, params }; state.pipeline.push(block); state.selectedBlockId = block.id;
    const active = getActiveBranch(); if (active) getGraphLayout(active)[`step:${block.id}`] = { x, y };
    renderPipelineUI(); requestProcess(); showMsg(`${def.name} block added to ${active?.name || 'pipeline'}.`);
  };
}

function makeBranchGraphNode() { /* Kept as a no-op compatibility shim for older callers. */ }

function addPostMergeOperation(nodeData, type, beforeNode = null) {
  if (!OPERATIONS[type] || !state.lastBranchMerge) return showMsg('Add a merge node before adding a filter after its output.');
  if (isProcessing || isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for processing to finish before adding a block.');
  const downstream = Array.isArray(state.lastBranchMerge.downstreamPipeline) ? state.lastBranchMerge.downstreamPipeline : [];
  if (downstream.length >= 100) return showMsg('A merge can have up to 100 downstream filters.');
  const def = OPERATIONS[type], params = {}; (def.params || []).forEach(parameter => params[parameter.id] = parameter.default);
  const block = { id: generateId(), type, params };
  const insertAt = beforeNode?.kind === 'postMergeStep' ? downstream.findIndex(item => item.id === beforeNode.block?.id) : -1;
  if (insertAt >= 0) downstream.splice(insertAt, 0, block); else downstream.push(block);
  state.lastBranchMerge.downstreamPipeline = downstream;
  const target = state.branches.find(branch => branch.id === state.lastBranchMerge.targetBranchId) || getActiveBranch();
  if (target) getGraphLayout(target)[`postmerge:${block.id}`] = { x: (state.mergeGraphPosition?.x || nodeData.x || 500) + 300 + (Math.max(0, downstream.findIndex(item => item.id === block.id)) * 210), y: (state.mergeGraphPosition?.y || nodeData.y || 40) + 8 };
  state.selectedGraphNodeId = `postmerge:${block.id}`;
  renderBranchUI(); requestProcess(); showMsg(`Added ${def.name} after the merge output.`);
}

function deletePostMergeOperation(blockId) {
  if (!state.lastBranchMerge) return;
  state.lastBranchMerge.downstreamPipeline = (state.lastBranchMerge.downstreamPipeline || []).filter(block => block.id !== blockId);
  const target = state.branches.find(branch => branch.id === state.lastBranchMerge.targetBranchId);
  if (target?.graphLayout) delete target.graphLayout[`postmerge:${blockId}`];
  if (state.activeStageKey?.includes(`postmerge:${blockId}`)) state.activeStageKey = null;
  state.selectedGraphNodeId = null; renderBranchUI(); requestProcess(); showMsg('Post-merge filter deleted.');
}

function addMergeNodeToWorkspace(nodeData = null) {
  if (state.branches.length < 2) return showMsg('Create a second branch before adding a merge node.');
  if (state.lastBranchMerge) { state.selectedGraphNodeId = 'merge-output-node'; renderBranchGraph(); return showMsg('A merge node already exists. Extend its output with a filter or edit the existing node.'); }
  const target = getActiveBranch();
  const source = state.branches.find(branch => branch.id !== target?.id);
  if (!target || !source) return showMsg('Create two branches before adding a merge node.');
  state.lastBranchMerge = { sourceBranchId: source.id, targetBranchId: target.id, strategy: 'blend', mode: 'normal', opacity: 0.5, threshold: 128, outputChoice: 'target', connections: [], downstreamPipeline: [], createdAt: Date.now() };
  state.mergeGraphPosition = nodeData ? { x: nodeData.x + nodeData.w + 70, y: nodeData.y } : { x: Math.max(520, ...state.branches.map(branch => Object.values(getGraphLayout(branch)).reduce((max, pos) => Math.max(max, Number(pos?.x || 0) + 220), 520))), y: 42 };
  if (nodeData?.branch?.id) {
    const index = nodeData.branch.id === target.id ? 0 : nodeData.branch.id === source.id ? 1 : 0;
    state.lastBranchMerge.connections[index] = nodeData.id;
  }
  state.selectedGraphNodeId = 'merge-output-node';
  document.getElementById('mergeSourceSelect').value = source.id;
  document.getElementById('mergeStrategySelect').value = 'blend';
  renderBranchUI();
  showMsg('Merge node added. Connect both input ports, choose an operator, then Apply merge.');
}

function deleteMergeNode() {
  if (!state.lastBranchMerge) return;
  state.outputBlend = null;
  state.lastBranchMerge = null; state.mergeGraphPosition = null; state.selectedGraphNodeId = null;
  requestProcess(); renderBranchUI();
  showMsg('Merge node deleted. The source branches remain unchanged.');
}

function resetBranchGraphLayout() {
  for (const branch of state.branches) branch.graphLayout = {};
  state.mergeGraphPosition = null;
  renderBranchGraph();
  showMsg('Node positions reset.');
}

// Compare the currently selected node's full-resolution output without a separate stage strip.
document.getElementById('btnCompareSelectedNodeOutput')?.addEventListener('click', () => {
  const stage = (state.stagePreviews || []).find(item => item.key === state.activeStageKey && item.branchId === state.activeBranchId);
  if (!stage) return showMsg('Select a processed node first. Wait for its output preview, then try again.');
  addStageToComparison(stage.key);
});

// Wire up branch controls only after the corresponding DOM exists.
document.getElementById('branchSelect').addEventListener('change', event => switchBranch(event.target.value));
document.getElementById('btnResetGraphLayout').addEventListener('click', resetBranchGraphLayout);
document.getElementById('btnAddMergeNode')?.addEventListener('click', addMergeNodeToWorkspace);
document.getElementById('btnAddMergeNode')?.addEventListener('dragstart', event => {
  if (state.branches.length < 2 || state.lastBranchMerge) { event.preventDefault(); return; }
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-purrfectcv-merge', 'merge');
  event.dataTransfer.setData('text/plain', 'merge');
});
document.getElementById('btnNewBranch').addEventListener('click', createBranch);
document.getElementById('btnRenameBranch').addEventListener('click', renameActiveBranch);
document.getElementById('btnDeleteBranch').addEventListener('click', deleteActiveBranch);
document.getElementById('btnMergeBranch').addEventListener('click', mergeSelectedBranch);
document.getElementById('mergeStrategySelect').addEventListener('change', renderBranchUI);
document.getElementById('mergeSourceSelect').addEventListener('change', renderBranchUI);
document.getElementById('blendModeSelect').addEventListener('change', () => {
  const mode = document.getElementById('blendModeSelect').value;
  if (state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId && state.outputBlend.operator === 'blend') {
    saveHistory();
    state.outputBlend.mode = VALID_BLEND_MODES.includes(mode) ? mode : 'normal';
    renderBranchUI(); requestProcess();
  }
});

document.getElementById('chooseOutputSelect').addEventListener('change', event => {
  if (state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId && state.outputBlend.operator === 'choose-output') {
    saveHistory(); state.outputBlend.outputChoice = event.target.value === 'source' ? 'source' : 'target'; requestProcess(); renderBranchUI();
  }
});
let maskThresholdHistorySaved = false;
document.getElementById('maskThresholdInput').addEventListener('pointerdown', () => { maskThresholdHistorySaved = false; });
document.getElementById('maskThresholdInput').addEventListener('keydown', () => { maskThresholdHistorySaved = false; });
document.getElementById('maskThresholdInput').addEventListener('input', event => {
  document.getElementById('maskThresholdValue').textContent = event.target.value;
  if (state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId && state.outputBlend.operator === 'masked-composite') {
    if (!maskThresholdHistorySaved) { saveHistory(); maskThresholdHistorySaved = true; }
    state.outputBlend.threshold = Number(event.target.value); requestProcess(); renderBranchUI();
  }
});
let blendOpacityHistorySaved = false;
document.getElementById('blendOpacityInput').addEventListener('pointerdown', () => { blendOpacityHistorySaved = false; });
document.getElementById('blendOpacityInput').addEventListener('keydown', () => { blendOpacityHistorySaved = false; });
document.getElementById('blendOpacityInput').addEventListener('change', () => { blendOpacityHistorySaved = false; });
document.getElementById('blendOpacityInput').addEventListener('input', event => {
  document.getElementById('blendOpacityValue').textContent = `${event.target.value}%`;
  if (state.outputBlend && state.outputBlend.baseBranchId === state.activeBranchId && (state.outputBlend.operator || 'blend') === 'blend') {
    if (!blendOpacityHistorySaved) { saveHistory(); blendOpacityHistorySaved = true; }
    state.outputBlend.opacity = Number(event.target.value) / 100;
    requestProcess(); renderBranchUI();
  }
});

