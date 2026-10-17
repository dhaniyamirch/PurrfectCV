/* Meow module: Shared state, DOM handles, OpenCV readiness and common helpers.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
let cvReady = false;

// Global state
let state = {
  mediaType: null, mediaReady: false, timelineCollapsed: false, fileName: '', sourceMediaFile: null, sourceImage: null, videoEl: null, mediaObjectUrl: null, frames: [], currentFrameIndex: 0,
  pipeline: [], selectedBlockId: null,
  branches: [], activeBranchId: null, outputBlend: null, lastBranchMerge: null, mergeGraphPosition: null, branchStageSnapshots: {}, branchGraphVisible: null,
  viewMode: 'processed', zoomLevel: 1.0, panX: 0, panY: 0, splitPosition: 0.5,
  lastOrigData: null, lastProcData: null, fitOnNextRender: false, stagePreviews: [],
  activeStageKey: null, activeStageView: null, activeStageData: null,
  comparisonSlots: [null, null, null, null], comparisonTargetSlot: 0,
  annotationMode: false, annotationTool: 'pen', annotationColor: '#ffcc00', annotationWidth: 3,
  annotationText: 'Label', annotationTextSize: 24, annotationTextBackground: true, annotationBackgroundColor: '#111827',
  annotations: [], currentAnnotation: null, selectedAnnotationId: null, annotationDrag: null,
  annotationUndo: [], annotationRedo: [], annotationStyleHistoryOpen: false
};

let mediaLoadId = 0;
let isExportingFrames = false;
let isOpeningProject = false;
// Shared constants and operation metadata are separated into js/core/config.js.
// Keep this script deferred after config.js in index.html.
const {
  MEOW_PROJECT_FORMAT,
  MEOW_PROJECT_VERSION,
  MAX_PROJECT_ANNOTATIONS,
  MAX_ANNOTATION_POINTS_PER_MARK,
  MAX_TOTAL_ANNOTATION_POINTS,
  VALID_ANNOTATION_TYPES,
  MAX_MEOW_MEDIA_BYTES,
  MAX_MEOW_ARCHIVE_BYTES,
  MAX_BRANCHES,
  MAX_BRANCH_NAME_LENGTH,
  VALID_BLEND_MODES,
  VALID_OUTPUT_MERGE_OPERATORS,
  OPERATIONS_CONFIG,
  OPERATIONS
} = window.MeowConfig;

let historyPast = [];
let historyFuture = [];
let isExtracting = false;
let extractionAbort = new AbortController();

const els = {
  canvas: document.getElementById('mainCanvas'),
  ctx: document.getElementById('mainCanvas').getContext('2d', { willReadFrequently: true }),
  overlayCanvas: document.getElementById('overlayCanvas'),
  oCtx: document.getElementById('overlayCanvas').getContext('2d'),
  splitHandle: document.getElementById('splitHandle'),
  histCanvas: document.getElementById('histCanvas'),
  hctx: document.getElementById('histCanvas').getContext('2d'),
  pipeArea: document.getElementById('pipelineArea'),
  inspector: document.getElementById('inspectorContent'),
  timeline: document.getElementById('timelineTrack'),
  toolsContainer: document.getElementById('toolsContainer'),
  renderOverlay: document.getElementById('renderOverlay'),
  canvasWrapper: document.getElementById('canvasWrapper'),
  viewerContainer: document.getElementById('viewerContainer')
};

const workCanvas = document.createElement('canvas');
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
const resultCanvas = document.createElement('canvas');
const resultCtx = resultCanvas.getContext('2d', { willReadFrequently: true });
let isProcessing = false, renderRequested = false;

function onOpenCvReady() {
  if (!window.cv) return;
  const markReady = () => {
    if (cvReady) return;
    cvReady = true;
    document.getElementById('cvLoading').style.display = 'none';
    setStatus('OpenCV.js ready');
    showMsg('OpenCV.js Engine Ready');
    requestProcess();
  };

  // The CDN script can load before or after the WebAssembly runtime initializes.
  // A tiny native allocation is a reliable readiness probe when the runtime already ran.
  try {
    if (window.cv.Mat && window.cv.Mat.zeros && window.cv.CV_8UC1 !== undefined) {
      const probe = window.cv.Mat.zeros(1, 1, window.cv.CV_8UC1);
      probe.delete();
      markReady();
      return;
    }
  } catch (_) { /* Runtime has not initialized yet; use its callback. */ }
  window.cv.onRuntimeInitialized = markReady;
}

const showMsg = (msg) => {
  const t = document.getElementById('msgBox');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
};
const setStatus = (msg) => document.getElementById('statusText').textContent = msg;
const generateId = () => Math.random().toString(36).substr(2, 9);
const clonePipeline = (pipe) => JSON.parse(JSON.stringify(pipe));
const clamp = (v) => Math.max(0, Math.min(255, v));
const luma = (r, g, b) => 0.299*r + 0.587*g + 0.114*b;

