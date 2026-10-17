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
