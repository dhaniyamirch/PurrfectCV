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

/* Milestone UI: top-level menus, collapsible panels, and media-aware video controls. */
function syncRightPanelVisibility() {
  const rightPanel = document.getElementById('rightPanel');
  const inspectorPanel = document.getElementById('inspectorPanel');
  const statsPanel = document.getElementById('statsPanel');
  if (!rightPanel || !inspectorPanel || !statsPanel) return;
  rightPanel.hidden = inspectorPanel.hidden && statsPanel.hidden;
}

function refreshViewMenuLabels() {
  const tools = document.getElementById('toolsPanel');
  const inspector = document.getElementById('inspectorPanel');
  const stats = document.getElementById('statsPanel');
  const stages = document.querySelector('.stage-preview-area');
  const timeline = document.getElementById('timelineArea');
  const setLabel = (id, shown, name) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.textContent = `${shown ? 'Hide' : 'Show'} ${name}`;
    button.setAttribute('aria-pressed', String(shown));
  };
  setLabel('btnToggleToolsPanel', !tools?.hidden, 'Processing Tools');
  setLabel('btnToggleInspectorPanel', !inspector?.hidden, 'Block Inspector');
  setLabel('btnToggleStatsPanel', !stats?.hidden, 'Statistics');
  setLabel('btnToggleStagePreviews', !stages?.hidden, 'Stage Previews');
  const timelineButton = document.getElementById('btnToggleTimeline');
  if (timelineButton) {
    const shown = Boolean(state.mediaType === 'video' && state.mediaReady && !state.timelineCollapsed && timeline && !timeline.hidden);
    timelineButton.textContent = `${shown ? 'Hide' : 'Show'} Video Timeline`;
    timelineButton.setAttribute('aria-pressed', String(shown));
  }
}

function syncMediaDependentUI({ resetTimeline = false } = {}) {
  if (resetTimeline) state.timelineCollapsed = false;
  // Video-only controls remain hidden for images and until frame extraction marks video ready.
  const videoReady = state.mediaType === 'video' && state.mediaReady === true;
  document.querySelectorAll('[data-video-only]').forEach(element => { element.hidden = !videoReady; });
  const timeline = document.getElementById('timelineArea');
  if (timeline) timeline.hidden = !videoReady || state.timelineCollapsed;
  const exportAll = document.getElementById('btnExportAll');
  if (exportAll) exportAll.disabled = !videoReady || !state.frames.length || isExtracting || isExportingFrames;
  refreshViewMenuLabels();
  return videoReady;
}

function togglePanel(element, buttonId, name, { parentPanel = false } = {}) {
  if (!element) return;
  element.hidden = !element.hidden;
  if (parentPanel) syncRightPanelVisibility();
  if (buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.textContent = `${element.hidden ? 'Show' : 'Hide'} ${name}`;
      button.setAttribute('aria-pressed', String(!element.hidden));
    }
  }
  centerCanvasAtCurrentZoom();
}

document.getElementById('btnOpenMediaMenu').addEventListener('click', () => {
  document.getElementById('mediaUpload').click();
});

document.getElementById('btnToggleToolsPanel').addEventListener('click', () => {
  togglePanel(document.getElementById('toolsPanel'), 'btnToggleToolsPanel', 'Processing Tools');
});
document.getElementById('btnToggleInspectorPanel').addEventListener('click', () => {
  const panel = document.getElementById('inspectorPanel');
  panel.hidden = !panel.hidden;
  syncRightPanelVisibility();
  refreshViewMenuLabels();
  centerCanvasAtCurrentZoom();
});
document.getElementById('btnToggleStatsPanel').addEventListener('click', () => {
  const panel = document.getElementById('statsPanel');
  panel.hidden = !panel.hidden;
  syncRightPanelVisibility();
  refreshViewMenuLabels();
  centerCanvasAtCurrentZoom();
});
document.getElementById('btnToggleStagePreviews').addEventListener('click', () => {
  togglePanel(document.querySelector('.stage-preview-area'), 'btnToggleStagePreviews', 'Stage Previews');
});
document.getElementById('btnToggleTimeline').addEventListener('click', () => {
  if (!(state.mediaType === 'video' && state.mediaReady)) return;
  state.timelineCollapsed = !state.timelineCollapsed;
  syncMediaDependentUI();
  centerCanvasAtCurrentZoom();
});

document.getElementById('btnToggleAnnotationPanel').addEventListener('click', () => {
  const panel = document.getElementById('annotationToolbarPanel');
  panel.hidden = !panel.hidden;
  const button = document.getElementById('btnToggleAnnotationPanel');
  button.setAttribute('aria-expanded', String(!panel.hidden));
  button.textContent = panel.hidden ? 'Annotations ▾' : 'Annotations ▴';
  if (panel.hidden && state.annotationMode) {
    state.annotationMode = false;
    state.currentAnnotation = null;
    state.annotationDrag = null;
    updateAnnotationControls();
    renderAnnotationOverlay();
  }
  if (!panel.hidden) document.getElementById('annotationTool').focus({ preventScroll: true });
  centerCanvasAtCurrentZoom();
});

document.getElementById('btnResetPanels').addEventListener('click', () => {
  const tools = document.getElementById('toolsPanel');
  const inspector = document.getElementById('inspectorPanel');
  const stats = document.getElementById('statsPanel');
  const stages = document.querySelector('.stage-preview-area');
  if (tools) tools.hidden = false;
  if (inspector) inspector.hidden = false;
  if (stats) stats.hidden = false;
  if (stages) stages.hidden = false;
  syncRightPanelVisibility();
  state.timelineCollapsed = false;
  syncMediaDependentUI();
  refreshViewMenuLabels();
  centerCanvasAtCurrentZoom();
});

document.getElementById('btnAboutMeow').addEventListener('click', () => {
  const dialog = document.getElementById('helpDialog');
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else dialog.setAttribute('open', '');
});
document.getElementById('btnCloseHelpDialog').addEventListener('click', () => {
  const dialog = document.getElementById('helpDialog');
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
});
document.getElementById('helpDialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) {
    const dialog = event.currentTarget;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }
});

// Keep a single menu open at a time and close menus after outside clicks / Escape.
const topLevelMenus = [...document.querySelectorAll('.menu-dropdown')];
document.addEventListener('click', event => {
  if (!event.target.closest('.menu-dropdown')) topLevelMenus.forEach(menu => { menu.open = false; });
  const menuItem = event.target.closest('button.menu-item, a.menu-link');
  if (menuItem && !menuItem.closest('.branch-menu-panel')) topLevelMenus.forEach(menu => { menu.open = false; });
});
document.addEventListener('toggle', event => {
  if (!(event.target instanceof HTMLDetailsElement) || !event.target.classList.contains('menu-dropdown') || !event.target.open) return;
  topLevelMenus.forEach(menu => { if (menu !== event.target) menu.open = false; });
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') topLevelMenus.forEach(menu => { menu.open = false; });
});

// Establish the empty-media layout on first load.
syncMediaDependentUI({ resetTimeline: true });
refreshViewMenuLabels();

