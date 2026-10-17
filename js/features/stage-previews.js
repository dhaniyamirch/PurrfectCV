/* Meow module: Stage preview rendering and opening intermediate stages.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
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

