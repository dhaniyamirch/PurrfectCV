/* Meow module: Runs the active pipeline and refreshes the viewer output.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
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
    const blendData = runPipelineOnImageData(sourceData, blendCanvas, blendBranch.pipeline, false, null, blendBranch.id);
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
  // Keep lightweight thumbnails per branch so the visual graph can show the last
  // processed output for every branch without re-running inactive pipelines.
  if (!state.branchStageSnapshots || typeof state.branchStageSnapshots !== 'object') state.branchStageSnapshots = {};
  if (state.activeBranchId) state.branchStageSnapshots[state.activeBranchId] = generatedStages.map(stage => ({ ...stage }));
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
  renderBranchGraph();
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

