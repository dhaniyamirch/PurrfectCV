/* Meow module: General editor controls, undo/redo, frame navigation and frame search.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
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

