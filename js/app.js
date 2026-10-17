/* Meow module: Application initialization and OpenCV load/error callbacks.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
// Init
initializeBranchWorkspace();
initTools();
updateAnnotationControls();
renderStagePreviewPanel();
renderPipelineUI();

// Handle either OpenCV.js load order: its async script may finish before or after this file.
window.onOpenCvReady = onOpenCvReady;
window.onOpenCvScriptFailed = function () {
  const overlay = document.getElementById('cvLoading');
  if (!overlay) return;
  overlay.innerHTML = '<div class="cv-load-error-title">OpenCV.js could not load</div><div class="cv-load-error-subtitle">Check your internet connection and reload this page. The processing engine is loaded from the OpenCV.js CDN.</div>';
};
if (window.__cvScriptFailed) window.onOpenCvScriptFailed();
else if (window.__cvScriptLoaded) window.onOpenCvReady();


// Issue 18: resizable editor/workspace split.
(function setupWorkspaceSplitHandle() {
  const handle = document.getElementById('workspaceSplitHandle');
  const main = document.querySelector('.main-area');
  const bottom = document.querySelector('.bottom-area');
  const layout = document.querySelector('.app-layout');
  if (!handle || !main || !bottom || !layout || handle.dataset.ready === 'true') return;
  handle.dataset.ready = 'true';
  const setFromClientY = clientY => {
    const rect = layout.getBoundingClientRect();
    const topBarHeight = document.querySelector('.top-bar')?.offsetHeight || 0;
    const usable = Math.max(1, rect.height - topBarHeight - handle.offsetHeight);
    const top = Math.max(0, clientY - rect.top - topBarHeight);
    const pct = Math.max(24, Math.min(76, top / usable * 100));
    main.style.flex = `0 0 ${Math.round(usable * pct / 100)}px`;
    bottom.style.flex = '1 1 0';
    main.style.minHeight = '150px'; bottom.style.minHeight = '170px';
  };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add('workspace-resizing');
    const move = e => setFromClientY(e.clientY);
    const up = () => { document.body.classList.remove('workspace-resizing'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
  handle.addEventListener('keydown', event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const rect = layout.getBoundingClientRect();
    if (event.key === 'Home') setFromClientY(rect.top + 90);
    else if (event.key === 'End') setFromClientY(rect.bottom - 170);
    else setFromClientY((main.getBoundingClientRect().bottom || rect.top) + (event.key === 'ArrowUp' ? -24 : 24));
  });
  handle.addEventListener('dblclick', () => { main.style.flex = ''; bottom.style.flex = ''; main.style.minHeight = ''; bottom.style.minHeight = ''; });
})();
