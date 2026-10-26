/*
 * Meow shared configuration and processing-operation definitions.
 * Loaded as a classic deferred script before app.js during this incremental refactor.
 * Keep this file data-only: no DOM initialization or event handlers here.
 */
(function attachMeowConfig(window) {
  'use strict';

  const MEOW_PROJECT_FORMAT = 'meow-project';
  const MEOW_PROJECT_VERSION = 4;
  const MAX_PROJECT_ANNOTATIONS = 5000;
  const MAX_ANNOTATION_POINTS_PER_MARK = 20000;
  const MAX_TOTAL_ANNOTATION_POINTS = 150000;
  const VALID_ANNOTATION_TYPES = ['pen', 'marker', 'text', 'line', 'arrow', 'rectangle', 'ellipse'];
  const MAX_MEOW_MEDIA_BYTES = 500 * 1024 * 1024;
  const MAX_MEOW_ARCHIVE_BYTES = 550 * 1024 * 1024;
  const MAX_BRANCHES = 50;
  const MAX_BRANCH_NAME_LENGTH = 60;
  const VALID_BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'difference', 'darken', 'lighten'];
  const VALID_OUTPUT_MERGE_OPERATORS = ['blend', 'add', 'bitwise-or', 'bitwise-and', 'bitwise-xor', 'masked-composite', 'choose-output'];

  // Architecture: Operation Dictionary utilizing OpenCV.js functions where possible
  const OPERATIONS_CONFIG = [
    {
      category: 'BASIC',
      tools: {
        grayscale: { name: 'Grayscale', params: [] },
        invert: { name: 'Invert', params: [] },
        brightContrast: { name: 'Brightness/Contrast', params: [
          { id: 'brightness', label: 'Brightness', type: 'range', min: -100, max: 100, step: 1, default: 0 },
          { id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3, step: 0.05, default: 1 }
        ]},
        gamma: { name: 'Gamma Correction', params: [
          { id: 'gamma', label: 'Gamma', type: 'range', min: 0.1, max: 5.0, step: 0.1, default: 1.0 }
        ]}
      }
    },
    {
      category: 'HISTOGRAM',
      tools: {
        histEq: { name: 'Histogram Eq.', params: [] },
        clahe: { name: 'CLAHE', params: [
          { id: 'clipLimit', label: 'Clip Limit', type: 'range', min: 0.5, max: 10, step: 0.5, default: 2.0 },
          { id: 'tileSize', label: 'Tile Grid Size', type: 'range', min: 2, max: 32, step: 1, default: 8 }
        ]}
      }
    },
    {
      category: 'FILTERS',
      tools: {
        gaussianBlur: { name: 'Gaussian Blur', params: [
          { id: 'kernel', label: 'Kernel Size', type: 'range', min: 3, max: 31, step: 2, default: 5 },
          { id: 'sigma', label: 'Sigma X', type: 'range', min: 0, max: 10, step: 0.1, default: 0 }
        ]},
        medianBlur: { name: 'Median Blur', params: [
          { id: 'kernel', label: 'Kernel Size', type: 'range', min: 3, max: 31, step: 2, default: 5 }
        ]},
        sharpen: { name: 'Sharpen (Laplacian)', params: [
          { id: 'amount', label: 'Amount', type: 'range', min: 0.1, max: 5, step: 0.1, default: 1.0 }
        ]},
        bilateralFilter: { name: 'Bilateral Filter', params: [
          { id: 'diameter', label: 'Neighborhood Diameter', type: 'range', min: 3, max: 15, step: 2, default: 9 },
          { id: 'sigmaColor', label: 'Color Sigma', type: 'range', min: 10, max: 150, step: 5, default: 75 },
          { id: 'sigmaSpace', label: 'Space Sigma', type: 'range', min: 10, max: 150, step: 5, default: 75 }
        ]},
        boxBlur: { name: 'Box Blur', params: [
          { id: 'kernel', label: 'Kernel Size', type: 'range', min: 1, max: 31, step: 2, default: 5 }
        ]},
        nonLocalMeans: { name: 'Non-Local Means Denoising', params: [
          { id: 'h', label: 'Luma Strength', type: 'range', min: 1, max: 30, step: 1, default: 10 },
          { id: 'hColor', label: 'Color Strength', type: 'range', min: 1, max: 30, step: 1, default: 10 },
          { id: 'templateWindowSize', label: 'Template Window', type: 'range', min: 3, max: 7, step: 2, default: 7 },
          { id: 'searchWindowSize', label: 'Search Window', type: 'range', min: 7, max: 21, step: 2, default: 21 }
        ]},
        unsharpMask: { name: 'Unsharp Mask', params: [
          { id: 'radius', label: 'Blur Radius', type: 'range', min: 1, max: 10, step: 0.5, default: 2 },
          { id: 'amount', label: 'Amount', type: 'range', min: 0.1, max: 3, step: 0.1, default: 1.0 }
        ]},
        emboss: { name: 'Emboss', params: [
          { id: 'strength', label: 'Strength', type: 'range', min: 0.5, max: 3, step: 0.1, default: 1 }
        ]},
        sepia: { name: 'Sepia', params: [
          { id: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 100, step: 5, default: 100 }
        ]}
      }
    },
    {
      category: 'EDGES',
      tools: {
        sobel: { name: 'Sobel Filter', params: [
          { id: 'dx', label: 'Derivative X', type: 'range', min: 0, max: 2, step: 1, default: 1 },
          { id: 'dy', label: 'Derivative Y', type: 'range', min: 0, max: 2, step: 1, default: 1 },
          { id: 'ksize', label: 'Kernel Size', type: 'range', min: 1, max: 7, step: 2, default: 3 }
        ]},
        canny: { name: 'Canny Edge', params: [
          { id: 't1', label: 'Threshold 1', type: 'range', min: 0, max: 255, step: 1, default: 50 },
          { id: 't2', label: 'Threshold 2', type: 'range', min: 0, max: 255, step: 1, default: 150 }
        ]}
      }
    },
    {
      category: 'MORPHOLOGY',
      tools: {
        morphology: { name: 'Morphology', params: [
          { id: 'op', label: 'Operation', type: 'select', options: ['Erode', 'Dilate', 'Open', 'Close', 'Gradient', 'Top Hat', 'Black Hat'], default: 'Open' },
          { id: 'shape', label: 'Kernel Shape', type: 'select', options: ['Rect', 'Cross', 'Ellipse'], default: 'Rect' },
          { id: 'ksize', label: 'Kernel Size', type: 'range', min: 3, max: 21, step: 2, default: 3 },
          { id: 'iters', label: 'Iterations', type: 'range', min: 1, max: 10, step: 1, default: 1 }
        ]}
      }
    },
    {
      category: 'SEGMENTATION',
      tools: {
        threshold: { name: 'Threshold', params: [
          { id: 'type', label: 'Type', type: 'select', options: ['Binary', 'Binary Inv', 'Trunc', 'ToZero', 'ToZero Inv', 'Otsu'], default: 'Binary' },
          { id: 'level', label: 'Level', type: 'range', min: 0, max: 255, step: 1, default: 128 }
        ]},
        distTransform: { name: 'Distance Transform', params: [] },
        connectedComps: { name: 'Connected Comps', params: [] },
        watershed: { name: 'Watershed', params: [] }
      }
    },
    {
      category: 'CONTOURS',
      tools: {
        findContours: { name: 'Find Contours', params: [
          { id: 'thickness', label: 'Thickness', type: 'range', min: -1, max: 5, step: 1, default: 1 }
        ]}
      }
    },
    {
      category: 'FREQUENCY & WAVELETS',
      tools: {
        fftMag: { name: 'FFT Magnitude', params: [] }
      }
    }
  ];

  const OPERATIONS = {};
  OPERATIONS_CONFIG.forEach(cat => Object.assign(OPERATIONS, cat.tools));

  window.MeowConfig = Object.freeze({
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
  });
})(window);
