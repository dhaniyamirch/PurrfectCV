/* Meow module: Image/video loading, frame extraction, timeline state and source pixels.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
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

