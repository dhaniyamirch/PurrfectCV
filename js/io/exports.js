/* Meow module: PNG export, processed video-frame ZIP export and download helpers.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
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
        const sourceBranchData = runPipelineOnImageData(sourceData, blendBranchCanvas, blendPipelineSnapshot, false, null, outputBlendBranch.id);
        const combinedData = mergeImageOutputs(processedData, sourceBranchData, outputBlendSnapshot);
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

