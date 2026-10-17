/* Meow module: Versioned .meow project manifest, validation, save and open.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
// Complete project format: a ZIP archive with a .meow extension.
// project.json contains versioned metadata and workspace state; media/source.* embeds the original file.
function inferMediaMime(fileName, declaredType = '', kind = '') {
  if (declaredType && ((kind === 'image' && declaredType.startsWith('image/')) || (kind === 'video' && declaredType.startsWith('video/')))) return declaredType;
  const extension = String(fileName || '').toLowerCase().split('.').pop();
  const imageTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif' };
  const videoTypes = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg', mov: 'video/quicktime', mpeg: 'video/mpeg', mpg: 'video/mpeg' };
  return (kind === 'video' ? videoTypes[extension] : imageTypes[extension]) || (kind === 'video' ? 'video/mp4' : 'image/png');
}

function safeMediaFileName(name) {
  const leaf = String(name || 'source-media').split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, '').trim();
  return (leaf || 'source-media').slice(0, 180);
}

function boundedNumber(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function buildMeowManifest() {
  syncActiveBranch();
  const sourceFile = state.sourceMediaFile;
  if (!sourceFile || !state.mediaType) throw new Error('Open an image or video before saving a .meow project.');
  if (sourceFile.size > MAX_MEOW_MEDIA_BYTES) throw new Error('This source file is larger than the 500 MiB project limit. Use a smaller image/video for this browser-based project save.');
  const mediaFileName = safeMediaFileName(state.fileName || sourceFile.name);
  const extension = (mediaFileName.match(/\.[a-z0-9]{1,10}$/i) || [''])[0] || (state.mediaType === 'video' ? '.mp4' : '.png');
  const mediaPath = `media/source${extension.toLowerCase()}`;
  const currentFrame = state.mediaType === 'video' ? state.frames[state.currentFrameIndex] : null;
  const width = state.mediaType === 'image' && state.sourceImage ? state.sourceImage.naturalWidth : (state.videoEl?.videoWidth || 0);
  const height = state.mediaType === 'image' && state.sourceImage ? state.sourceImage.naturalHeight : (state.videoEl?.videoHeight || 0);
  return {
    format: MEOW_PROJECT_FORMAT,
    schemaVersion: MEOW_PROJECT_VERSION,
    app: { name: 'Meow Visual Processing Editor', milestone: 'Issue 8 · Merge, timeline and project round-trip' },
    project: {
      name: safeBaseName(mediaFileName),
      savedAt: new Date().toISOString(),
      thumbnail: 'thumbnail.png'
    },
    media: {
      path: mediaPath,
      fileName: mediaFileName,
      mimeType: inferMediaMime(mediaFileName, sourceFile.type, state.mediaType),
      kind: state.mediaType,
      size: sourceFile.size,
      width,
      height,
      duration: state.mediaType === 'video' && Number.isFinite(state.videoEl?.duration) ? state.videoEl.duration : null
    },
    workspace: {
      pipeline: clonePipeline(state.pipeline),
      selectedBlockId: state.selectedBlockId,
      branches: state.branches.map(branch => ({
        id: branch.id,
        name: branch.name,
        parentId: branch.parentId || null,
        pipeline: clonePipeline(branch.pipeline),
        selectedBlockId: branch.selectedBlockId,
        basePipeline: clonePipeline(branch.basePipeline || []),
        graphLayout: branch.graphLayout && typeof branch.graphLayout === 'object' ? { ...branch.graphLayout } : {}
      })),
      activeBranchId: state.activeBranchId,
      outputBlend: state.outputBlend ? { ...state.outputBlend } : null,
      lastBranchMerge: state.lastBranchMerge ? { ...state.lastBranchMerge } : null,
      mergeGraphPosition: state.mergeGraphPosition ? { ...state.mergeGraphPosition } : null,
      branchGraphVisible: state.branchGraphVisible === true,
      timelineCollapsed: state.timelineCollapsed === true,
      comparisonTargetSlot: boundedNumber(state.comparisonTargetSlot, 0, 3, 0),
      comparisonSlots: state.comparisonSlots.map((slot, index) => slot ? {
        path: `workspace/comparison-slot-${index + 1}.png`, stageKey: String(slot.stageKey || ''),
        label: String(slot.label || `Slot ${index + 1}`).slice(0, 160), width: boundedNumber(slot.width, 1, 100000, 1),
        height: boundedNumber(slot.height, 1, 100000, 1), mediaType: slot.mediaType === 'video' ? 'video' : 'image',
        frameIndex: Math.floor(boundedNumber(slot.frameIndex, 0, 1000000, 0)), branchId: String(slot.branchId || ''),
        branchName: String(slot.branchName || 'Main').slice(0, 60)
      } : null),
      currentFrameIndex: state.currentFrameIndex,
      currentFrameTime: currentFrame && Number.isFinite(currentFrame.time) ? currentFrame.time : 0,
      extractFps: boundedNumber(document.getElementById('fpsExtract').value, 1, 30, 5),
      viewMode: state.viewMode,
      zoomLevel: boundedNumber(state.zoomLevel, 0.05, 8, 1),
      panX: boundedNumber(state.panX, -100000, 100000, 0),
      panY: boundedNumber(state.panY, -100000, 100000, 0),
      splitPosition: boundedNumber(state.splitPosition, 0, 1, 0.5),
      // Annotation geometry is stored in source-image pixel coordinates.
      annotations: validateProjectAnnotations(cloneAnnotations(), { width, height })
    }
  };
}

async function saveMeowProject() {
  if (isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for the current media operation to finish before saving the project.');
  if (!window.JSZip) return showMsg('ZIP support could not load. Check your internet connection and reload the editor.');
  let manifest;
  try { manifest = buildMeowManifest(); }
  catch (error) { showMsg(error.message || 'Could not prepare the project.'); return; }

  const button = document.getElementById('btnSaveProject');
  const originalLabel = button.textContent;
  button.disabled = true;
  document.getElementById('btnLoadProject').disabled = true;
  try {
    setStatus('Packing .meow project…');
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(manifest, null, 2), { compression: 'DEFLATE', compressionOptions: { level: 3 } });
    zip.file(manifest.media.path, state.sourceMediaFile, { binary: true, compression: 'STORE' });
    for (let index = 0; index < state.comparisonSlots.length; index++) {
      const slot = state.comparisonSlots[index];
      if (!slot) continue;
      const response = await fetch(slot.objectUrl);
      if (!response.ok) throw new Error(`Could not read comparison slot ${index + 1} while saving the project.`);
      const imageBlob = await response.blob();
      if (!imageBlob.size || imageBlob.size > MAX_MEOW_MEDIA_BYTES) throw new Error(`Comparison slot ${index + 1} has an invalid or oversized image.`);
      zip.file(`workspace/comparison-slot-${index + 1}.png`, imageBlob, { binary: true, compression: 'STORE' });
    }
    try {
      const thumbResp = await fetch('assets/icons/meow-thumbnail-transparent.png');
      if (thumbResp.ok) {
        const thumbBlob = await thumbResp.blob();
        zip.file('thumbnail.png', thumbBlob, { binary: true });
        zip.file('icon.png', thumbBlob, { binary: true });
      }
    } catch (_) {
      // Safe fallback if assets cannot be fetched in offline or file protocol environments
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } }, metadata => {
      setStatus(`Saving project… ${Math.round(metadata.percent)}%`);
    });
    if (blob.size > MAX_MEOW_ARCHIVE_BYTES) throw new Error('The saved project exceeds the 550 MiB archive limit. Use smaller source media.');
    downloadBlob(blob, `${manifest.project.name || 'meow_project'}.meow`);
    setStatus(`Saved project: ${manifest.project.name}.meow`);
    showMsg(`Complete .meow project saved, including source media, branches, workspace settings, ${manifest.workspace.comparisonSlots.filter(Boolean).length} comparison slot${manifest.workspace.comparisonSlots.filter(Boolean).length === 1 ? '' : 's'}, and ${manifest.workspace.annotations.length} annotation${manifest.workspace.annotations.length === 1 ? '' : 's'}.`);
  } catch (error) {
    console.error('Project save failed:', error);
    showMsg(error.message || 'Could not save the .meow project.');
    setStatus('Project save failed.');
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
    document.getElementById('btnLoadProject').disabled = false;
  }
}

document.getElementById('btnSaveProject').addEventListener('click', saveMeowProject);
document.getElementById('btnLoadProject').addEventListener('click', () => {
  if (isOpeningProject || isExportingFrames || isExtracting) return showMsg('Wait for the current media operation to finish before opening a project.');
  document.getElementById('projectUpload').click();
});

function validateProjectAnnotations(value, media) {
  if (!Array.isArray(value)) throw new Error('The project annotations field must be an array.');
  if (value.length > MAX_PROJECT_ANNOTATIONS) throw new Error(`The project contains too many annotations (maximum ${MAX_PROJECT_ANNOTATIONS}).`);
  const maxX = boundedNumber(media.width, 1, 10000000, 1000000);
  const maxY = boundedNumber(media.height, 1, 10000000, 1000000);
  const ids = new Set();
  let totalPoints = 0;
  const readPoint = (point, label) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`${label} is invalid.`);
    const x = Number(point.x), y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > maxX || y > maxY) throw new Error(`${label} is outside the image bounds or contains invalid coordinates.`);
    return { x, y };
  };
  const readColor = (color, fallback, label) => {
    if (color === undefined || color === null) return fallback;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${label} must be a six-digit hexadecimal colour.`);
    return color;
  };
  return value.map((entry, index) => {
    const label = `Annotation ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label} is invalid.`);
    if (typeof entry.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(entry.id) || ids.has(entry.id)) throw new Error(`${label} has an invalid or duplicate ID.`);
    if (!VALID_ANNOTATION_TYPES.includes(entry.type)) throw new Error(`${label} uses an unsupported annotation type.`);
    ids.add(entry.id);
    const start = readPoint(entry.start, `${label} start point`);
    const end = readPoint(entry.end, `${label} end point`);
    const annotation = {
      id: entry.id,
      type: entry.type,
      color: readColor(entry.color, '#ffcc00', `${label} colour`),
      width: boundedNumber(entry.width, 1, 20, 3),
      start,
      end
    };
    if (entry.type === 'pen') {
      if (!Array.isArray(entry.points) || !entry.points.length || entry.points.length > MAX_ANNOTATION_POINTS_PER_MARK) throw new Error(`${label} has an invalid freehand point list.`);
      totalPoints += entry.points.length;
      if (totalPoints > MAX_TOTAL_ANNOTATION_POINTS) throw new Error(`The project contains too many freehand points (maximum ${MAX_TOTAL_ANNOTATION_POINTS}).`);
      annotation.points = entry.points.map((point, pointIndex) => readPoint(point, `${label} point ${pointIndex + 1}`));
    } else {
      annotation.points = [];
    }
    if (entry.type === 'text') {
      if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 120) throw new Error(`${label} has invalid text. Labels must contain 1–120 characters.`);
      annotation.text = entry.text;
      annotation.textSize = boundedNumber(entry.textSize, 8, 72, 24);
      annotation.textBackground = Boolean(entry.textBackground);
      annotation.backgroundColor = readColor(entry.backgroundColor, '#111827', `${label} background colour`);
    }
    return annotation;
  });
}

function validateMeowManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('The .meow manifest is not a valid object.');
  if (manifest.format !== MEOW_PROJECT_FORMAT) throw new Error('This file is not a Meow project archive.');
  if (![1, 2, 3, MEOW_PROJECT_VERSION].includes(manifest.schemaVersion)) throw new Error(`Unsupported .meow project version: ${String(manifest.schemaVersion)}.`);
  const media = manifest.media;
  if (!media || typeof media !== 'object' || Array.isArray(media)) throw new Error('The project is missing media information.');
  if (!['image', 'video'].includes(media.kind)) throw new Error('The project uses an unsupported media type.');
  if (typeof media.path !== 'string' || !/^media\/source\.[a-z0-9]{1,10}$/i.test(media.path) || media.path.includes('..')) throw new Error('The project media path is invalid.');
  if (typeof media.fileName !== 'string' || !media.fileName.trim()) throw new Error('The project is missing the original media filename.');
  const workspace = manifest.workspace;
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) throw new Error('The project is missing workspace settings.');
  const legacyPipeline = validateImportedPipeline(workspace.pipeline);
  let branches;
  let activeBranchId;
  let outputBlend = null;
  if (manifest.schemaVersion === 1) {
    const id = 'branch-main';
    branches = [{ id, name: 'Main', parentId: null, pipeline: legacyPipeline, selectedBlockId: typeof workspace.selectedBlockId === 'string' && legacyPipeline.some(block => block.id === workspace.selectedBlockId) ? workspace.selectedBlockId : null, basePipeline: [] }];
    activeBranchId = id;
  } else {
    if (!Array.isArray(workspace.branches) || workspace.branches.length < 1 || workspace.branches.length > MAX_BRANCHES) throw new Error(`The project must contain between 1 and ${MAX_BRANCHES} branches.`);
    const ids = new Set();
    const names = new Set();
    branches = workspace.branches.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Branch ${index + 1} is invalid.`);
      if (typeof entry.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(entry.id) || ids.has(entry.id)) throw new Error(`Branch ${index + 1} has an invalid or duplicate ID.`);
      if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.trim().length > MAX_BRANCH_NAME_LENGTH) throw new Error(`Branch ${index + 1} has an invalid name.`);
      const key = entry.name.trim().toLocaleLowerCase();
      if (names.has(key)) throw new Error('Branch names must be unique.');
      ids.add(entry.id); names.add(key);
      const branchPipeline = validateImportedPipeline(entry.pipeline);
      const basePipeline = validateImportedPipeline(Array.isArray(entry.basePipeline) ? entry.basePipeline : []);
      const selectedBlockId = typeof entry.selectedBlockId === 'string' && branchPipeline.some(block => block.id === entry.selectedBlockId) ? entry.selectedBlockId : null;
      return {
        id: entry.id,
        name: entry.name.trim(),
        parentId: typeof entry.parentId === 'string' && entry.parentId ? entry.parentId : null,
        pipeline: branchPipeline,
        selectedBlockId,
        basePipeline,
        graphLayout: entry.graphLayout && typeof entry.graphLayout === 'object' && !Array.isArray(entry.graphLayout) ? Object.fromEntries(Object.entries(entry.graphLayout).filter(([key, value]) => /^[a-zA-Z0-9:_-]{1,120}$/.test(key) && value && Number.isFinite(value.x) && Number.isFinite(value.y)).map(([key, value]) => [key, { x: Math.max(0, Math.min(20000, value.x)), y: Math.max(0, Math.min(20000, value.y)) }]).slice(0, 300)) : {}
      };
    });
    for (const branch of branches) {
      if (branch.parentId && (!ids.has(branch.parentId) || branch.parentId === branch.id)) throw new Error(`Branch “${branch.name}” references an invalid parent branch.`);
      const seenParents = new Set([branch.id]);
      let parentId = branch.parentId;
      while (parentId) {
        if (seenParents.has(parentId)) throw new Error('The project branch ancestry contains a cycle.');
        seenParents.add(parentId);
        parentId = branches.find(candidate => candidate.id === parentId)?.parentId || null;
      }
    }
    activeBranchId = typeof workspace.activeBranchId === 'string' && ids.has(workspace.activeBranchId) ? workspace.activeBranchId : branches[0].id;
    if (workspace.outputBlend !== null && workspace.outputBlend !== undefined) {
      const blend = workspace.outputBlend;
      const operator = VALID_OUTPUT_MERGE_OPERATORS.includes(blend?.operator) ? blend.operator : 'blend';
      if (!blend || typeof blend !== 'object' || Array.isArray(blend) || !ids.has(blend.baseBranchId) || !ids.has(blend.sourceBranchId) || blend.baseBranchId === blend.sourceBranchId || !VALID_BLEND_MODES.includes(blend.mode || 'normal')) {
        throw new Error('The project output-merge settings are invalid.');
      }
      outputBlend = {
        baseBranchId: blend.baseBranchId, sourceBranchId: blend.sourceBranchId, operator,
        mode: VALID_BLEND_MODES.includes(blend.mode) ? blend.mode : 'normal',
        opacity: boundedNumber(blend.opacity, 0, 1, 0.5), threshold: boundedNumber(blend.threshold, 0, 255, 128),
        outputChoice: blend.outputChoice === 'source' ? 'source' : 'target'
      };
    }
  }
  const comparisonTargetSlot = Math.floor(boundedNumber(workspace.comparisonTargetSlot, 0, 3, 0));
  const comparisonSlots = Array.from({ length: 4 }, (_, index) => {
    const entry = Array.isArray(workspace.comparisonSlots) ? workspace.comparisonSlots[index] : null;
    if (entry === null || entry === undefined) return null;
    const expectedPath = `workspace/comparison-slot-${index + 1}.png`;
    if (!entry || typeof entry !== 'object' || entry.path !== expectedPath) throw new Error(`Comparison slot ${index + 1} metadata is invalid.`);
    // Comparison snapshots remain valid even if their original branch was later deleted.
    return {
      path: expectedPath, stageKey: typeof entry.stageKey === 'string' ? entry.stageKey.slice(0, 200) : '',
      label: typeof entry.label === 'string' ? entry.label.slice(0, 160) : `Slot ${index + 1}`,
      width: boundedNumber(entry.width, 1, 100000, 1), height: boundedNumber(entry.height, 1, 100000, 1),
      mediaType: entry.mediaType === 'video' ? 'video' : 'image', frameIndex: Math.floor(boundedNumber(entry.frameIndex, 0, 1000000, 0)),
      branchId: typeof entry.branchId === 'string' ? entry.branchId.slice(0, 100) : '',
      branchName: typeof entry.branchName === 'string' ? entry.branchName.slice(0, 60) : 'Main'
    };
  });
  // Version 3 stores annotations. Versions 1 and 2 remain readable and migrate to no marks.
  const annotations = manifest.schemaVersion >= 3
    ? validateProjectAnnotations(workspace.annotations, media)
    : [];
  const activeBranch = branches.find(branch => branch.id === activeBranchId);
  const pipeline = activeBranch ? activeBranch.pipeline : legacyPipeline;
  const viewMode = ['processed', 'original', 'split'].includes(workspace.viewMode) ? workspace.viewMode : 'processed';
  const frameTime = boundedNumber(workspace.currentFrameTime, 0, 24 * 60 * 60, 0);
  const frameIndex = Math.floor(boundedNumber(workspace.currentFrameIndex, 0, 1000000, 0));
  const selectedBlockId = activeBranch?.selectedBlockId || (typeof workspace.selectedBlockId === 'string' && pipeline.some(block => block.id === workspace.selectedBlockId) ? workspace.selectedBlockId : null);
  return {
    manifest,
    media: {
      path: media.path,
      fileName: safeMediaFileName(media.fileName),
      kind: media.kind,
      mimeType: inferMediaMime(media.fileName, typeof media.mimeType === 'string' ? media.mimeType : '', media.kind),
      declaredSize: boundedNumber(media.size, 0, MAX_MEOW_MEDIA_BYTES, 0)
    },
    workspace: {
      pipeline,
      selectedBlockId,
      branches,
      activeBranchId,
      outputBlend,
      lastBranchMerge: workspace.lastBranchMerge && typeof workspace.lastBranchMerge === 'object' ? {
        sourceBranchId: typeof workspace.lastBranchMerge.sourceBranchId === 'string' ? workspace.lastBranchMerge.sourceBranchId : null,
        targetBranchId: typeof workspace.lastBranchMerge.targetBranchId === 'string' ? workspace.lastBranchMerge.targetBranchId : null,
        strategy: typeof workspace.lastBranchMerge.strategy === 'string' ? workspace.lastBranchMerge.strategy : 'blend',
        mode: typeof workspace.lastBranchMerge.mode === 'string' ? workspace.lastBranchMerge.mode : 'normal',
        opacity: boundedNumber(workspace.lastBranchMerge.opacity, 0, 1, 0.5),
        threshold: boundedNumber(workspace.lastBranchMerge.threshold, 0, 255, 128),
        outputChoice: workspace.lastBranchMerge.outputChoice === 'source' ? 'source' : 'target',
        connections: Array.isArray(workspace.lastBranchMerge.connections) ? [0, 1].map(index => typeof workspace.lastBranchMerge.connections[index] === 'string' ? workspace.lastBranchMerge.connections[index] : null) : [],
        downstreamPipeline: validateImportedPipeline(Array.isArray(workspace.lastBranchMerge.downstreamPipeline) ? workspace.lastBranchMerge.downstreamPipeline : []),
        createdAt: boundedNumber(workspace.lastBranchMerge.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now())
      } : null,
      mergeGraphPosition: workspace.mergeGraphPosition && Number.isFinite(workspace.mergeGraphPosition.x) && Number.isFinite(workspace.mergeGraphPosition.y) ? { x: boundedNumber(workspace.mergeGraphPosition.x, 0, 100000, 0), y: boundedNumber(workspace.mergeGraphPosition.y, 0, 100000, 0) } : null,
      branchGraphVisible: workspace.branchGraphVisible === true,
      timelineCollapsed: workspace.timelineCollapsed === true,
      comparisonTargetSlot,
      comparisonSlots,
      currentFrameIndex: frameIndex,
      currentFrameTime: frameTime,
      extractFps: boundedNumber(workspace.extractFps, 1, 30, 5),
      viewMode,
      zoomLevel: boundedNumber(workspace.zoomLevel, 0.05, 8, 1),
      panX: boundedNumber(workspace.panX, -100000, 100000, 0),
      panY: boundedNumber(workspace.panY, -100000, 100000, 0),
      splitPosition: boundedNumber(workspace.splitPosition, 0, 1, 0.5),
      annotations
    }
  };
}

async function prepareProjectMedia(file, kind) {
  const objectUrl = URL.createObjectURL(file);
  if (kind === 'image') {
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => element.naturalWidth > 0 && element.naturalHeight > 0 ? resolve(element) : reject(new Error('The project image has invalid dimensions.'));
        element.onerror = () => reject(new Error('The embedded image cannot be decoded by this browser.'));
        element.src = objectUrl;
      });
      return { kind, objectUrl, image, video: null };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
  const video = document.createElement('video');
  video.preload = 'auto'; video.muted = true; video.playsInline = true; video.src = objectUrl;
  try {
    await waitForVideoMetadata(video, new AbortController().signal);
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) throw new Error('The embedded video has invalid dimensions or duration.');
    return { kind, objectUrl, image: null, video };
  } catch (error) {
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) { /* best-effort cleanup */ }
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function readMeowArchive(file) {
  if (!window.JSZip) throw new Error('ZIP support could not load. Check your internet connection and reload the editor.');
  if (file.size > MAX_MEOW_ARCHIVE_BYTES) throw new Error('This .meow file exceeds the 550 MiB archive limit for this browser editor.');
  let archive;
  try { archive = await JSZip.loadAsync(file); }
  catch (_) { throw new Error('This file is not a readable .meow archive or it is damaged.'); }
  const manifestEntry = archive.file('project.json');
  if (!manifestEntry || manifestEntry.dir) throw new Error('The project archive does not contain project.json.');
  let manifest;
  try { manifest = JSON.parse(await manifestEntry.async('string')); }
  catch (_) { throw new Error('The .meow project metadata is not valid JSON.'); }
  const validated = validateMeowManifest(manifest);
  const mediaEntry = archive.file(validated.media.path);
  if (!mediaEntry || mediaEntry.dir) throw new Error('The original source media is missing from this project.');
  const mediaBlob = await mediaEntry.async('blob');
  if (!mediaBlob.size || mediaBlob.size > MAX_MEOW_MEDIA_BYTES) throw new Error('The embedded media is empty or exceeds the 500 MiB media limit.');
  if (validated.media.declaredSize && validated.media.declaredSize !== mediaBlob.size) throw new Error('The embedded media size does not match the project metadata. The project may be damaged.');
  if (!(validated.media.kind === 'image' ? validated.media.mimeType.startsWith('image/') : validated.media.mimeType.startsWith('video/'))) throw new Error('The project media MIME type does not match its declared media kind.');
  let mediaFile;
  try {
    mediaFile = new File([mediaBlob], validated.media.fileName, { type: validated.media.mimeType, lastModified: Date.now() });
  } catch (_) {
    throw new Error('This browser cannot recreate the embedded source file. Try a recent version of Chrome, Firefox, or Edge.');
  }
  const restoredObjectUrls = [];
  const slotEntries = validated.workspace.comparisonSlots.map((slot, index) => {
    if (!slot) return null;
    const entry = archive.file(slot.path);
    if (!entry || entry.dir) throw new Error(`The project is missing comparison slot ${index + 1}'s image.`);
    return entry;
  });
  const restoredSlots = validated.workspace.comparisonSlots.map((slot, index) => {
    if (!slot) return Promise.resolve(null);
    const entry = slotEntries[index];
    return entry.async('blob').then(blob => {
      if (!blob.size) throw new Error(`Comparison slot ${index + 1} contains an empty image.`);
      const pngBlob = new Blob([blob], { type: 'image/png' });
      const objectUrl = URL.createObjectURL(pngBlob);
      restoredObjectUrls.push(objectUrl);
      return { ...slot, objectUrl };
    });
  });
  try {
    validated.workspace.comparisonSlots = await Promise.all(restoredSlots);
  } catch (error) {
    restoredObjectUrls.forEach(objectUrl => URL.revokeObjectURL(objectUrl));
    throw error;
  }
  return { ...validated, mediaFile };
}

function applyProjectViewSettings(workspace) {
  state.viewMode = workspace.viewMode;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === state.viewMode));
  state.zoomLevel = workspace.zoomLevel;
  state.panX = workspace.panX;
  state.panY = workspace.panY;
  state.splitPosition = workspace.splitPosition;
  state.fitOnNextRender = false;
  document.getElementById('fpsExtract').value = String(workspace.extractFps);
  applyZoom();
}

async function openMeowProject(file) {
  if (!file) return;
  if (isOpeningProject) return showMsg('A project is already opening.');
  if (isExportingFrames || isExtracting) return showMsg('Wait for frame extraction/export to finish before opening a project.');
  isOpeningProject = true;
  const openButton = document.getElementById('btnLoadProject');
  const saveButton = document.getElementById('btnSaveProject');
  openButton.disabled = true;
  saveButton.disabled = true;
  let prepared = null;
  let project = null;
  let comparisonSlotsAdopted = false;
  try {
    setStatus('Validating .meow project…');
    project = await readMeowArchive(file);
    // Decode the embedded media before replacing the current project, so a damaged or unsupported
    // source file does not discard the workspace that is already open.
    prepared = await prepareProjectMedia(project.mediaFile, project.media.kind);

    extractionAbort.abort();
    extractionAbort = new AbortController();
    const token = ++mediaLoadId;
    disposeCurrentMedia();
    state.mediaType = null;
    state.mediaReady = false;
    state.timelineCollapsed = false;
    syncMediaDependentUI({ resetTimeline: true });
    state.mediaType = project.media.kind;
    resetAnnotations();
    state.annotations = cloneAnnotations(project.workspace.annotations || []);
    state.selectedAnnotationId = null;
    state.currentAnnotation = null;
    state.annotationDrag = null;
    state.annotationUndo = [];
    state.annotationRedo = [];
    state.annotationMode = false;
    state.fileName = project.media.fileName;
    state.sourceMediaFile = project.mediaFile;
    state.branches = project.workspace.branches.map(branch => ({ ...branch, pipeline: clonePipeline(branch.pipeline), basePipeline: clonePipeline(branch.basePipeline || []), graphLayout: branch.graphLayout && typeof branch.graphLayout === 'object' ? { ...branch.graphLayout } : {}, historyPast: [], historyFuture: [] }));
    state.branchStageSnapshots = {};
    state.branchGraphVisible = null;
    state.activeBranchId = project.workspace.activeBranchId;
    state.outputBlend = project.workspace.outputBlend ? { ...project.workspace.outputBlend } : null;
    state.lastBranchMerge = project.workspace.lastBranchMerge ? { ...project.workspace.lastBranchMerge } : null;
    state.mergeGraphPosition = project.workspace.mergeGraphPosition && Number.isFinite(project.workspace.mergeGraphPosition.x) && Number.isFinite(project.workspace.mergeGraphPosition.y) ? { x: project.workspace.mergeGraphPosition.x, y: project.workspace.mergeGraphPosition.y } : null;
    state.comparisonSlots.forEach(slot => { if (slot?.objectUrl) URL.revokeObjectURL(slot.objectUrl); });
    state.comparisonSlots = project.workspace.comparisonSlots.map(slot => slot ? { ...slot } : null);
    comparisonSlotsAdopted = true;
    state.comparisonTargetSlot = project.workspace.comparisonTargetSlot;
    state.branchGraphVisible = project.workspace.branchGraphVisible;
    const activeProjectBranch = state.branches.find(branch => branch.id === state.activeBranchId) || state.branches[0];
    state.activeBranchId = activeProjectBranch.id;
    state.pipeline = clonePipeline(activeProjectBranch.pipeline);
    state.selectedBlockId = activeProjectBranch.selectedBlockId;
    historyPast = activeProjectBranch.historyPast;
    historyFuture = activeProjectBranch.historyFuture;
    state.frames = [];
    state.currentFrameIndex = 0;
    state.lastOrigData = null;
    state.lastProcData = null;
    state.activeStageKey = null; state.activeStageView = null; state.activeStageData = null; updateStageViewControls();
    state.mediaObjectUrl = prepared.objectUrl;
    if (project.media.kind === 'image') {
      state.sourceImage = prepared.image;
      state.videoEl = null;
      state.mediaReady = true;
    } else {
      state.sourceImage = null;
      state.videoEl = prepared.video;
      state.mediaReady = false;
    }
    // The object URL is now owned by state; do not let cleanup below revoke it.
    prepared = null;
    historyPast = [];
    historyFuture = [];
    updateUndoRedoUI();
    applyProjectViewSettings(project.workspace);
    if (state.outputBlend) {
      document.getElementById('mergeStrategySelect').value = state.outputBlend.operator || 'blend';
      document.getElementById('blendModeSelect').value = state.outputBlend.mode || 'normal';
      document.getElementById('blendOpacityInput').value = String(Math.round(state.outputBlend.opacity * 100));
      document.getElementById('maskThresholdInput').value = String(state.outputBlend.threshold ?? 128);
      document.getElementById('chooseOutputSelect').value = state.outputBlend.outputChoice || 'target';
    } else {
      document.getElementById('mergeStrategySelect').value = 'auto';
    }
    state.timelineCollapsed = project.workspace.timelineCollapsed === true;
    renderPipelineUI();

    if (state.mediaType === 'image') {
      document.getElementById('btnExportAll').disabled = true;
      syncMediaDependentUI();
      setStatus(`Project image: ${state.sourceImage.naturalWidth}×${state.sourceImage.naturalHeight}`);
      renderTimeline();
      requestProcess();
    } else {
      document.getElementById('btnExportAll').disabled = true;
      syncMediaDependentUI();
      setStatus(`Project video: ${state.videoEl.videoWidth}×${state.videoEl.videoHeight}, ${state.videoEl.duration.toFixed(2)}s`);
      await extractFrames(extractionAbort.signal, token);
      if (token !== mediaLoadId) return;
      if (state.frames.length) {
        const targetTime = project.workspace.currentFrameTime;
        let bestIndex = Math.min(project.workspace.currentFrameIndex, state.frames.length - 1);
        let bestDistance = Math.abs(state.frames[bestIndex].time - targetTime);
        state.frames.forEach((frame, index) => {
          const distance = Math.abs(frame.time - targetTime);
          if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
        });
        state.currentFrameIndex = bestIndex;
        updateTimelineUI();
      }
      state.fitOnNextRender = false;
      applyZoom();
      await requestProcess();
    }
    renderBranchUI();
    renderComparisonSlots();
    renderStagePreviewPanel();
    renderAnnotationOverlay();
    updateAnnotationControls();
    showMsg(`Opened ${safeBaseName(project.media.fileName)}.meow successfully (${state.branches.length} branch${state.branches.length === 1 ? '' : 'es'}; ${state.annotations.length} annotation${state.annotations.length === 1 ? '' : 's'} restored).`);
  } catch (error) {
    if (project && !comparisonSlotsAdopted) project.workspace.comparisonSlots.forEach(slot => { if (slot?.objectUrl) URL.revokeObjectURL(slot.objectUrl); });
    console.error('Project open failed:', error);
    showMsg(error.message || 'Could not open this .meow project.');
    setStatus('Project could not be opened.');
    if (prepared) {
      if (prepared.video) { try { prepared.video.pause(); prepared.video.removeAttribute('src'); prepared.video.load(); } catch (_) { /* best-effort cleanup */ } }
      URL.revokeObjectURL(prepared.objectUrl);
    }
  } finally {
    isOpeningProject = false;
    openButton.disabled = false;
    saveButton.disabled = false;
    document.getElementById('projectUpload').value = '';
  }
}

document.getElementById('projectUpload').addEventListener('change', event => {
  const file = event.target.files && event.target.files[0];
  if (file) openMeowProject(file);
  else event.target.value = '';
});

// Windows File Icon Installer Dialog Handlers
(function initIconInstallerModal() {
  const dialog = document.getElementById('iconInstallerDialog');
  if (!dialog) return;

  function openDialog() {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  document.getElementById('btnInstallMeowIcon')?.addEventListener('click', openDialog);
  document.getElementById('btnSideInstallIcon')?.addEventListener('click', openDialog);
  document.getElementById('btnCloseIconInstaller')?.addEventListener('click', closeDialog);
  document.getElementById('btnDoneIconInstaller')?.addEventListener('click', closeDialog);

  // Close when clicking dialog backdrop
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      closeDialog();
    }
  });
})();

