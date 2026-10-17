/* Meow module: Four-slot comparison workspace and shared image/canvas helpers.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
function openComparisonWorkspace() {
  const view = document.getElementById('comparisonWorkspaceView');
  const viewer = document.getElementById('viewerContainer');
  const toggle = document.getElementById('btnToggleComparisonView');
  if (!view || !viewer) return;
  view.hidden = false;
  viewer.hidden = true;
  view.classList.add('comparison-workspace-active');
  if (toggle) { toggle.classList.add('active'); toggle.setAttribute('aria-pressed', 'true'); }
  renderComparisonSlots();
}

function closeComparisonWorkspace() {
  const view = document.getElementById('comparisonWorkspaceView');
  const viewer = document.getElementById('viewerContainer');
  const toggle = document.getElementById('btnToggleComparisonView');
  if (view) { view.hidden = true; view.classList.remove('comparison-workspace-active'); }
  if (viewer) viewer.hidden = false;
  if (toggle) { toggle.classList.remove('active'); toggle.setAttribute('aria-pressed', 'false'); }
  if (typeof centerCanvasAtCurrentZoom === 'function') centerCanvasAtCurrentZoom();
}

function comparisonOccupiedCount() {
  return state.comparisonSlots.filter(Boolean).length;
}

function visibleComparisonSlotCount() {
  // Keep all four slots visible in the main editor so users can discover the workspace.
  return 4;
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
        imageData = mergeImageOutputs(baseData, blendData, blendSnapshot);
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
      button.title = `${selectedSlot ? 'Replace' : 'Add'} this stage output in comparison slot ${state.comparisonTargetSlot + 1}. Choose another destination in the Comparison Workspace.`;
    }
  }
}

document.getElementById('btnOpenComparisonWorkspace').addEventListener('click', openComparisonWorkspace);
document.getElementById('btnOpenComparisonFromMenu').addEventListener('click', () => {
  openComparisonWorkspace();
  document.getElementById('viewMenu')?.removeAttribute('open');
});
document.getElementById('btnToggleComparisonView').addEventListener('click', () => {
  const view = document.getElementById('comparisonWorkspaceView');
  if (view && !view.hidden) closeComparisonWorkspace();
  else openComparisonWorkspace();
});
document.getElementById('btnCloseComparisonWorkspace').addEventListener('click', closeComparisonWorkspace);
document.getElementById('btnDoneComparisonWorkspace').addEventListener('click', closeComparisonWorkspace);
document.getElementById('btnClearComparisonSlot').addEventListener('click', () => clearComparisonSlot(state.comparisonTargetSlot));
document.getElementById('comparisonTargetSlot').addEventListener('change', event => setComparisonTargetSlot(event.target.value));

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

