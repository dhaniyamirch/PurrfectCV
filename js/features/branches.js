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
  if (state.lastBranchMerge && (state.lastBranchMerge.sourceBranchId === deletingId || state.lastBranchMerge.targetBranchId === deletingId)) state.lastBranchMerge = null;
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
    state.lastBranchMerge = { sourceBranchId: source.id, targetBranchId: target.id, strategy, createdAt: Date.now() };
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
  state.lastBranchMerge = { sourceBranchId: source.id, targetBranchId: target.id, strategy, createdAt: Date.now() };
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

function defaultGraphPosition(branch, nodeKey, index, branchIndex) {
  const layout = getGraphLayout(branch);
  if (layout[nodeKey] && Number.isFinite(layout[nodeKey].x) && Number.isFinite(layout[nodeKey].y)) return layout[nodeKey];
  const isSource = nodeKey === 'source';
  return { x: nodeKey === 'branch' ? 36 : isSource ? 230 : 450 + Math.max(0, index) * 210, y: 58 + branchIndex * 230 };
}

function renderBranchGraph() {
  const area = document.getElementById('branchGraphArea');
  const canvas = document.getElementById('branchGraphCanvas');
  const summary = document.getElementById('branchGraphSummary');
  const toggle = document.getElementById('btnToggleBranchGraph');
  if (!area || !canvas) return;
  const branches = Array.isArray(state.branches) ? state.branches : [];
  const visible = state.branchGraphVisible === true;
  area.hidden = !visible;
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.textContent = visible ? 'Hide node workspace' : 'Node workspace';
  }
  if (summary) summary.textContent = `${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${branches.reduce((n, b) => n + (b.pipeline || []).length, 0)} operation blocks`;
  canvas.replaceChildren();
  if (!visible) return;
  if (!branches.length) {
    const empty = document.createElement('div'); empty.className = 'branch-graph-empty';
    empty.textContent = 'Load media and add operations, or create a branch to build a node workflow.';
    canvas.appendChild(empty); return;
  }

  const nodeW = 174, nodeH = 92, pad = 36, laneGap = 230;
  const positions = new Map();
  const nodes = [];
  branches.forEach((branch, branchIndex) => {
    const laneY = 58 + branchIndex * laneGap;
    const branchNodeKey = 'branch';
    const branchPos = defaultGraphPosition(branch, branchNodeKey, -1, branchIndex);
    nodes.push({ id: `${branch.id}:branch`, branch, key: branchNodeKey, kind: 'branch', x: branchPos.x, y: branchPos.y, w: 154, h: 58, label: branch.name, detail: branch.parentId ? `Child of ${branches.find(b => b.id === branch.parentId)?.name || 'branch'}` : 'Main pipeline' });
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

  // Give the canvas enough room for freely moved nodes and preserve pan/scroll by using a stable origin.
  const defaultMergeX = Math.max(520, ...nodes.map(n => n.x + n.w + 70));
  const mergeXForBounds = state.lastBranchMerge ? (state.mergeGraphPosition?.x ?? defaultMergeX) + 190 + pad : 0;
  const mergeYForBounds = state.lastBranchMerge ? (state.mergeGraphPosition?.y ?? 40) + 86 + pad : 0;
  const maxX = Math.max(1050, mergeXForBounds, ...nodes.map(n => n.x + n.w + pad));
  const maxY = Math.max(360, mergeYForBounds, ...nodes.map(n => n.y + n.h + pad));
  canvas.style.width = `${maxX}px`; canvas.style.height = `${maxY}px`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'node-workspace-wires'); svg.setAttribute('width', String(maxX)); svg.setAttribute('height', String(maxY));
  svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`); svg.setAttribute('aria-hidden', 'true');
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  function wire(from, to, className = '') {
    if (!from || !to) return;
    const sx = from.x + from.w, sy = from.y + from.h / 2;
    const ex = to.x, ey = to.y + to.h / 2;
    const bend = Math.max(36, Math.abs(ex - sx) * .45);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${sx} ${sy} C ${sx + bend} ${sy}, ${ex - bend} ${ey}, ${ex} ${ey}`);
    path.setAttribute('class', `node-workspace-wire ${className}`); svg.appendChild(path);
    const start = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    start.setAttribute('cx', String(sx)); start.setAttribute('cy', String(sy)); start.setAttribute('r', '4'); start.setAttribute('class', 'node-wire-port'); svg.appendChild(start);
    const finish = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    finish.setAttribute('cx', String(ex)); finish.setAttribute('cy', String(ey)); finish.setAttribute('r', '4'); finish.setAttribute('class', 'node-wire-port'); svg.appendChild(finish);
  }
  for (const branch of branches) {
    const branchNode = nodeMap.get(`${branch.id}:branch`);
    const baseCount = branch.parentId ? Math.min((branch.basePipeline || []).length, (branch.pipeline || []).length) : 0;
    const branchSteps = (branch.pipeline || []).slice(baseCount).map(block => nodeMap.get(`${branch.id}:step:${block.id}`)).filter(Boolean);
    const source = nodeMap.get(`${branch.id}:source`);
    if (source && branchSteps.length) wire(source, branchSteps[0], branch.id === state.activeBranchId ? 'active' : '');
    for (let i = 0; i < branchSteps.length - 1; i++) wire(branchSteps[i], branchSteps[i + 1], branch.id === state.activeBranchId ? 'active' : '');
    if (branch.parentId) {
      const parent = branches.find(b => b.id === branch.parentId);
      const parentPipeline = parent?.pipeline || [];
      const forkCount = Math.min((branch.basePipeline || []).length, parentPipeline.length);
      const forkNode = forkCount ? nodeMap.get(`${parent.id}:step:${parentPipeline[forkCount - 1]?.id}`) : nodeMap.get(`${parent.id}:source`) || nodeMap.get(`${parent.id}:branch`);
      wire(forkNode, branchSteps[0] || branchNode, branch.id === state.activeBranchId ? 'branch-fork active' : 'branch-fork');
    }
  }
  const merge = state.lastBranchMerge;
  if (merge) {
    const sourceBranch = branches.find(b => b.id === merge.sourceBranchId);
    const targetBranch = branches.find(b => b.id === merge.targetBranchId);
    const lastGraphNode = branch => {
      if (!branch) return null;
      const baseCount = branch.parentId ? Math.min((branch.basePipeline || []).length, (branch.pipeline || []).length) : 0;
      const own = (branch.pipeline || []).slice(baseCount);
      return own.length ? nodeMap.get(`${branch.id}:step:${own[own.length - 1].id}`) : nodeMap.get(`${branch.id}:source`) || nodeMap.get(`${branch.id}:branch`);
    };
    const sourceLast = lastGraphNode(sourceBranch);
    const targetLast = lastGraphNode(targetBranch);
    const mergePos = state.mergeGraphPosition || { x: Math.max(520, ...nodes.map(n => n.x + n.w + 70)), y: 40 };
    const mergeNode = { id: 'merge-output-node', kind: 'merge', x: mergePos.x, y: mergePos.y, w: 190, h: 86, label: 'Merge Output', detail: `${sourceBranch?.name || 'Source'} → ${targetBranch?.name || 'Target'}` };
    wire(sourceLast, mergeNode, 'merge-wire'); wire(targetLast, mergeNode, 'merge-wire');
    nodes.push(mergeNode);
  }
  canvas.appendChild(svg);

  for (const nodeData of nodes) {
    const node = document.createElement('div');
    node.className = `node-workspace-node ${nodeData.kind}-node${nodeData.branch?.id === state.activeBranchId ? ' active' : ''}${nodeData.kind === 'step' && nodeData.branch?.selectedBlockId === nodeData.block?.id ? ' selected' : ''}`;
    node.dataset.nodeId = nodeData.id;
    node.style.left = `${nodeData.x}px`; node.style.top = `${nodeData.y}px`; node.style.width = `${nodeData.w}px`; node.style.height = `${nodeData.h}px`;
    const head = document.createElement('div'); head.className = 'node-workspace-node-head';
    const glyph = document.createElement('span'); glyph.className = 'node-workspace-glyph'; glyph.textContent = nodeData.kind === 'source' ? 'IN' : nodeData.kind === 'merge' ? 'Σ' : nodeData.kind === 'branch' ? '⑂' : 'CV';
    const title = document.createElement('span'); title.className = 'node-workspace-node-title'; title.textContent = nodeData.label;
    head.append(glyph, title);
    const body = document.createElement('div'); body.className = 'node-workspace-node-body';
    if (nodeData.stage?.thumbnail) {
      const img = document.createElement('img'); img.src = nodeData.stage.thumbnail; img.alt = `${nodeData.label} preview`; img.loading = 'lazy'; body.appendChild(img);
    } else {
      const placeholder = document.createElement('span'); placeholder.className = 'node-workspace-placeholder';
      placeholder.textContent = nodeData.kind === 'step' ? 'Output preview appears after processing' : nodeData.kind === 'merge' ? 'Configured merge result' : nodeData.kind === 'branch' ? nodeData.detail : 'Original image/frame'; body.appendChild(placeholder);
    }
    const detail = document.createElement('div'); detail.className = 'node-workspace-node-detail'; detail.textContent = nodeData.detail || '';
    node.append(head, body, detail);
    if (nodeData.kind === 'source' || nodeData.kind === 'step') {
      const inputPort = document.createElement('button');
      inputPort.type = 'button'; inputPort.className = 'node-workspace-port input-port';
      inputPort.dataset.nodeId = nodeData.id; inputPort.title = 'Input port — drop a connection here'; inputPort.setAttribute('aria-label', `Input port for ${nodeData.label}`);
      const outputPort = document.createElement('button');
      outputPort.type = 'button'; outputPort.className = 'node-workspace-port output-port';
      outputPort.dataset.nodeId = nodeData.id; outputPort.title = 'Drag from here to connect to another block'; outputPort.setAttribute('aria-label', `Output port for ${nodeData.label}`);
      inputPort.addEventListener('pointerdown', event => event.stopPropagation());
      outputPort.addEventListener('pointerdown', event => {
        event.preventDefault(); event.stopPropagation();
        if (nodeData.branch?.id !== state.activeBranchId) {
          showMsg('Switch to this branch before rewiring its processing blocks.'); return;
        }
        if (isProcessing || isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for processing to finish before connecting blocks.');
        const svgLayer = canvas.querySelector('.node-workspace-wires');
        if (!svgLayer) return;
        const wirePreview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        wirePreview.setAttribute('class', 'node-workspace-wire wire-preview'); svgLayer.appendChild(wirePreview);
        const sourceX = nodeData.x + nodeData.w, sourceY = nodeData.y + nodeData.h / 2;
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
          const targetPort = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest('.node-workspace-port.input-port');
          if (!targetPort) return;
          const target = nodes.find(item => item.id === targetPort.dataset.nodeId);
          if (!target || target.id === nodeData.id || target.kind === 'merge' || target.kind === 'branch' || target.branch?.id !== nodeData.branch?.id || target.kind === 'source') return showMsg('Connect blocks within the same branch. Branch merging uses the Merge Branches controls.');
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
      node.append(inputPort, outputPort);
    }
    if (nodeData.kind === 'step') {
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'node-workspace-delete'; remove.textContent = '×'; remove.title = 'Delete operation';
      remove.addEventListener('click', event => { event.stopPropagation(); if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id); deleteBlock(nodeData.block.id); });
      head.appendChild(remove);
    }
    if (nodeData.kind === 'branch') {
      node.title = `Click to switch to ${nodeData.branch.name}; drag the header to move it`;
      node.addEventListener('click', () => { if (node.dataset.dragMoved === 'true') { node.dataset.dragMoved = 'false'; return; } if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id); });
    }
    if (nodeData.kind === 'step') {
      node.title = 'Click to edit parameters. Drag the header to move this node.';
      node.addEventListener('click', event => {
        if (event.target.closest('button')) return;
        if (nodeData.branch.id !== state.activeBranchId) switchBranch(nodeData.branch.id);
        state.selectedBlockId = nodeData.block.id; renderPipelineUI();
      });
    }
    if (nodeData.kind === 'merge') {
      node.title = 'Click to open merge controls';
      node.addEventListener('dblclick', () => { document.getElementById('mergeStrategySelect')?.focus(); document.getElementById('btnMergeBranch')?.scrollIntoView({ block: 'nearest' }); });
    }
    // Pointer-based drag lets the canvas work with mouse, pen and touch without dragging images.
    head.classList.add('node-workspace-drag-handle');
    head.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
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
        const updated = svg.cloneNode(false);
        // Re-render connector paths from the current model; the pointer move is lightweight for this graph size.
        const oldSvg = canvas.querySelector('.node-workspace-wires');
        if (oldSvg) oldSvg.remove();
        const graphBranches = branches;
        const nextSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        nextSvg.setAttribute('class', 'node-workspace-wires'); nextSvg.setAttribute('width', String(maxX)); nextSvg.setAttribute('height', String(maxY)); nextSvg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
        const currentMap = new Map(nodes.map(n => [n.id, n]));
        const draw = (from, to, cls='') => { if(!from||!to)return; const sx=from.x+from.w, sy=from.y+from.h/2, ex=to.x, ey=to.y+to.h/2, bend=Math.max(36,Math.abs(ex-sx)*.45); const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',`M ${sx} ${sy} C ${sx+bend} ${sy}, ${ex-bend} ${ey}, ${ex} ${ey}`); path.setAttribute('class',`node-workspace-wire ${cls}`); nextSvg.appendChild(path); };
        for (const b of graphBranches) { const count=b.parentId?Math.min((b.basePipeline||[]).length,(b.pipeline||[]).length):0; const steps=(b.pipeline||[]).slice(count).map(bl=>currentMap.get(`${b.id}:step:${bl.id}`)).filter(Boolean); const source=currentMap.get(`${b.id}:source`); const branchN=currentMap.get(`${b.id}:branch`); if(source&&steps.length)draw(source,steps[0],b.id===state.activeBranchId?'active':''); for(let i=0;i<steps.length-1;i++)draw(steps[i],steps[i+1],b.id===state.activeBranchId?'active':''); if(b.parentId){const par=graphBranches.find(x=>x.id===b.parentId);const n=Math.min((b.basePipeline||[]).length,(par?.pipeline||[]).length);const fork=n?currentMap.get(`${par.id}:step:${par.pipeline[n-1]?.id}`):currentMap.get(`${par?.id}:source`)||currentMap.get(`${par?.id}:branch`);draw(fork,steps[0]||branchN,'branch-fork');} }
        const mergeNode=currentMap.get('merge-output-node'); if(mergeNode){const m=state.lastBranchMerge; const sb=graphBranches.find(b=>b.id===m?.sourceBranchId),tb=graphBranches.find(b=>b.id===m?.targetBranchId); const last=b=>{if(!b)return null;const n=b.parentId?Math.min((b.basePipeline||[]).length,(b.pipeline||[]).length):0;const own=(b.pipeline||[]).slice(n);return own.length?currentMap.get(`${b.id}:step:${own[own.length-1].id}`):currentMap.get(`${b.id}:source`)||currentMap.get(`${b.id}:branch`)};draw(last(sb),mergeNode,'merge-wire');draw(last(tb),mergeNode,'merge-wire');}
        canvas.insertBefore(nextSvg, canvas.firstChild);
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
  canvas.ondragover = event => { if (event.dataTransfer?.types?.includes('application/x-purrfectcv-operation')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; canvas.classList.add('node-workspace-drop-target'); } };
  canvas.ondragleave = event => { if (!canvas.contains(event.relatedTarget)) canvas.classList.remove('node-workspace-drop-target'); };
  canvas.ondrop = event => {
    const type = event.dataTransfer?.getData('application/x-purrfectcv-operation') || '';
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

function addMergeNodeFromControls() {
  if (state.branches.length < 2) return showMsg('Create a second branch before merging.');
  mergeSelectedBranch();
  state.branchGraphVisible = true;
  renderBranchUI();
}

function resetBranchGraphLayout() {
  for (const branch of state.branches) branch.graphLayout = {};
  state.mergeGraphPosition = null;
  renderBranchGraph();
  showMsg('Node positions reset.');
}

// Wire up branch controls only after the corresponding DOM exists.
document.getElementById('branchSelect').addEventListener('change', event => switchBranch(event.target.value));
document.getElementById('btnToggleBranchGraph').addEventListener('click', () => { state.branchGraphVisible = !state.branchGraphVisible; renderBranchGraph(); });
document.getElementById('btnAddMergeNode').addEventListener('click', addMergeNodeFromControls);
document.getElementById('btnResetGraphLayout').addEventListener('click', resetBranchGraphLayout);
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

