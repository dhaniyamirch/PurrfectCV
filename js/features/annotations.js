/* Meow module: Annotation drawing, selection, editing and annotation history.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
function cloneAnnotations(annotations = state.annotations) {
  return JSON.parse(JSON.stringify(annotations));
}

function saveAnnotationHistory() {
  state.annotationUndo.push(cloneAnnotations());
  if (state.annotationUndo.length > 100) state.annotationUndo.shift();
  state.annotationRedo = [];
  state.annotationStyleHistoryOpen = false;
  updateAnnotationControls();
}

function undoAnnotation() {
  if (!state.annotationUndo.length) return;
  state.annotationRedo.push(cloneAnnotations());
  state.annotations = state.annotationUndo.pop();
  if (!state.annotations.some(item => item.id === state.selectedAnnotationId)) state.selectedAnnotationId = null;
  state.currentAnnotation = null;
  state.annotationDrag = null;
  state.annotationStyleHistoryOpen = false;
  renderAnnotationOverlay();
  syncAnnotationEditorFromSelection();
  updateAnnotationControls();
}

function redoAnnotation() {
  if (!state.annotationRedo.length) return;
  state.annotationUndo.push(cloneAnnotations());
  state.annotations = state.annotationRedo.pop();
  if (!state.annotations.some(item => item.id === state.selectedAnnotationId)) state.selectedAnnotationId = null;
  state.currentAnnotation = null;
  state.annotationDrag = null;
  state.annotationStyleHistoryOpen = false;
  renderAnnotationOverlay();
  syncAnnotationEditorFromSelection();
  updateAnnotationControls();
}

function selectedAnnotation() {
  return state.annotations.find(item => item.id === state.selectedAnnotationId) || null;
}

function annotationPointFromEvent(event, clampToCanvas = false) {
  const rect = els.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height || !els.canvas.width || !els.canvas.height) return null;
  const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  if (outside && !clampToCanvas) return null;
  const x = (event.clientX - rect.left) * (els.canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (els.canvas.height / rect.height);
  return {
    x: Math.max(0, Math.min(els.canvas.width, x)),
    y: Math.max(0, Math.min(els.canvas.height, y))
  };
}

function annotationBounds(annotation) {
  if (!annotation || !annotation.start || !annotation.end) return null;
  let left, top, right, bottom;
  if (annotation.type === 'pen' && Array.isArray(annotation.points) && annotation.points.length) {
    left = Infinity; right = -Infinity; top = Infinity; bottom = -Infinity;
    for (const point of annotation.points) {
      left = Math.min(left, point.x); right = Math.max(right, point.x);
      top = Math.min(top, point.y); bottom = Math.max(bottom, point.y);
    }
    const pad = Math.max(1, Number(annotation.width) || 3) / 2;
    left -= pad; top -= pad; right += pad; bottom += pad;
  } else if (annotation.type === 'marker') {
    const radius = Math.max(5, (Number(annotation.width) || 3) * 2.4) + 4;
    left = annotation.start.x - radius; right = annotation.start.x + radius;
    top = annotation.start.y - radius; bottom = annotation.start.y + radius;
  } else if (annotation.type === 'text') {
    const ctx = els.oCtx;
    const fontSize = Math.max(8, Math.min(72, Number(annotation.textSize) || 24));
    ctx.save();
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const width = ctx.measureText(String(annotation.text || '').slice(0, 120)).width;
    ctx.restore();
    const padX = Math.max(3, fontSize * 0.22), padY = Math.max(2, fontSize * 0.16);
    left = annotation.start.x; top = annotation.start.y;
    right = left + width + padX * 2; bottom = top + fontSize + padY * 2;
  } else {
    left = Math.min(annotation.start.x, annotation.end.x);
    right = Math.max(annotation.start.x, annotation.end.x);
    top = Math.min(annotation.start.y, annotation.end.y);
    bottom = Math.max(annotation.start.y, annotation.end.y);
  }
  return { left, top, right, bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function annotationResizeHandle(annotation) {
  if (!annotation) return null;
  if (['line', 'arrow', 'rectangle', 'ellipse'].includes(annotation.type)) return annotation.end;
  const bounds = annotationBounds(annotation);
  return bounds ? { x: bounds.right, y: bounds.bottom } : null;
}

function hitTestAnnotation(point) {
  const tolerance = Math.max(8, 10 / Math.max(0.05, state.zoomLevel));
  for (let i = state.annotations.length - 1; i >= 0; i--) {
    const annotation = state.annotations[i];
    const bounds = annotationBounds(annotation);
    if (bounds && point.x >= bounds.left - tolerance && point.x <= bounds.right + tolerance && point.y >= bounds.top - tolerance && point.y <= bounds.bottom + tolerance) return annotation;
  }
  return null;
}

function isNearAnnotationHandle(point, annotation) {
  const handle = annotationResizeHandle(annotation);
  if (!handle) return false;
  const tolerance = Math.max(10, 13 / Math.max(0.05, state.zoomLevel));
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance;
}

function translateAnnotation(annotation, dx, dy) {
  const moved = JSON.parse(JSON.stringify(annotation));
  const bounds = annotationBounds(annotation);
  if (bounds) {
    dx = Math.max(-bounds.left, Math.min(els.canvas.width - bounds.right, dx));
    dy = Math.max(-bounds.top, Math.min(els.canvas.height - bounds.bottom, dy));
  }
  if (moved.start) { moved.start.x += dx; moved.start.y += dy; }
  if (moved.end) { moved.end.x += dx; moved.end.y += dy; }
  if (Array.isArray(moved.points)) moved.points = moved.points.map(point => ({ x: point.x + dx, y: point.y + dy }));
  return moved;
}

function resizeAnnotationFromDrag(original, point, drag) {
  const resized = JSON.parse(JSON.stringify(original));
  const clampX = value => Math.max(0, Math.min(els.canvas.width, value));
  const clampY = value => Math.max(0, Math.min(els.canvas.height, value));
  if (['line', 'arrow', 'rectangle', 'ellipse'].includes(original.type)) {
    resized.end = { x: clampX(point.x), y: clampY(point.y) };
    return resized;
  }
  if (original.type === 'marker') {
    const delta = ((point.x - drag.startPoint.x) + (point.y - drag.startPoint.y)) / 6;
    resized.width = Math.max(1, Math.min(20, (Number(original.width) || 3) + delta));
    return resized;
  }
  if (original.type === 'text') {
    const delta = ((point.x - drag.startPoint.x) + (point.y - drag.startPoint.y)) / 2;
    resized.textSize = Math.max(8, Math.min(72, Math.round((Number(original.textSize) || 24) + delta)));
    return resized;
  }
  if (original.type === 'pen') {
    const bounds = annotationBounds(original);
    if (!bounds) return resized;
    const newRight = Math.max(bounds.left + 2, clampX(point.x));
    const newBottom = Math.max(bounds.top + 2, clampY(point.y));
    const scaleX = (newRight - bounds.left) / bounds.width;
    const scaleY = (newBottom - bounds.top) / bounds.height;
    const scalePoint = item => ({ x: clampX(bounds.left + (item.x - bounds.left) * scaleX), y: clampY(bounds.top + (item.y - bounds.top) * scaleY) });
    resized.points = (original.points || []).map(scalePoint);
    resized.start = scalePoint(original.start);
    resized.end = scalePoint(original.end);
  }
  return resized;
}

function beginAnnotationSelection(point) {
  const currentSelected = selectedAnnotation();
  if (currentSelected && isNearAnnotationHandle(point, currentSelected)) {
    state.annotationDrag = {
      id: currentSelected.id, mode: 'resize', startPoint: point,
      original: JSON.parse(JSON.stringify(currentSelected)), historySaved: false, moved: false
    };
    return;
  }
  const hit = hitTestAnnotation(point);
  state.selectedAnnotationId = hit ? hit.id : null;
  state.annotationDrag = hit ? {
    id: hit.id, mode: 'move', startPoint: point,
    original: JSON.parse(JSON.stringify(hit)), historySaved: false, moved: false
  } : null;
  syncAnnotationEditorFromSelection();
  renderAnnotationOverlay();
  updateAnnotationControls();
}

function syncAnnotationEditorFromSelection() {
  const annotation = selectedAnnotation();
  if (!annotation) return;
  const tool = document.getElementById('annotationTool').value;
  if (tool !== 'select') return;
  document.getElementById('annotationColor').value = annotation.color || '#ffcc00';
  document.getElementById('annotationWidth').value = String(Math.max(1, Math.min(20, Number(annotation.width) || 3)));
  document.getElementById('annotationWidthValue').textContent = `${document.getElementById('annotationWidth').value} px`;
  if (annotation.type === 'text') {
    document.getElementById('annotationText').value = annotation.text || '';
    document.getElementById('annotationTextSize').value = String(Math.max(8, Math.min(72, Number(annotation.textSize) || 24)));
    document.getElementById('annotationTextSizeValue').textContent = `${document.getElementById('annotationTextSize').value} px`;
    document.getElementById('annotationTextBackground').checked = Boolean(annotation.textBackground);
    document.getElementById('annotationBackgroundColor').value = annotation.backgroundColor || '#111827';
  }
}

function beginSelectedAnnotationStyleHistory() {
  if (!state.annotationMode || document.getElementById('annotationTool').value !== 'select' || !selectedAnnotation()) return false;
  if (!state.annotationStyleHistoryOpen) {
    saveAnnotationHistory();
    state.annotationStyleHistoryOpen = true;
  }
  return true;
}

function applySelectedAnnotationStyle(changes) {
  if (!beginSelectedAnnotationStyleHistory()) return false;
  Object.assign(selectedAnnotation(), changes);
  renderAnnotationOverlay();
  updateAnnotationControls();
  return true;
}

function beginAnnotationFromEvent(event) {
  if (!state.annotationMode || event.button !== 0 || !state.mediaType) return false;
  // Keep the split-view handle's drag behavior isolated from drawing.
  if (event.target === els.splitHandle) return false;
  const point = annotationPointFromEvent(event, false);
  if (!point) return false;
  const tool = document.getElementById('annotationTool').value;
  if (tool === 'select') {
    beginAnnotationSelection(point);
    event.preventDefault();
    return true;
  }
  state.selectedAnnotationId = null;
  const color = document.getElementById('annotationColor').value || '#ffcc00';
  const annotation = {
    id: generateId(), type: tool,
    color,
    width: Number(document.getElementById('annotationWidth').value) || 3,
    start: point, end: point,
    points: tool === 'pen' ? [point] : []
  };
  state.annotationTool = tool;
  state.annotationColor = color;
  state.annotationWidth = annotation.width;

  // Point markers and labels are placed with a click; shape tools remain drag-based.
  if (tool === 'marker') {
    saveAnnotationHistory();
    state.annotations.push(annotation);
    renderAnnotationOverlay();
    updateAnnotationControls();
    event.preventDefault();
    return true;
  }
  if (tool === 'text') {
    const label = document.getElementById('annotationText').value.trim().slice(0, 120);
    if (!label) {
      showMsg('Enter label text before placing it.');
      document.getElementById('annotationText').focus();
      event.preventDefault();
      return true;
    }
    annotation.text = label;
    annotation.textSize = Math.max(8, Math.min(72, Number(document.getElementById('annotationTextSize').value) || 24));
    annotation.textBackground = document.getElementById('annotationTextBackground').checked;
    annotation.backgroundColor = document.getElementById('annotationBackgroundColor').value || '#111827';
    saveAnnotationHistory();
    state.annotations.push(annotation);
    renderAnnotationOverlay();
    updateAnnotationControls();
    event.preventDefault();
    return true;
  }

  saveAnnotationHistory();
  state.currentAnnotation = annotation;
  renderAnnotationOverlay();
  event.preventDefault();
  return true;
}

function drawOneAnnotation(ctx, annotation, canvasWidth = els.overlayCanvas.width) {
  if (!annotation || !annotation.start || !annotation.end) return;
  const start = annotation.start;
  const end = annotation.end;
  ctx.save();
  ctx.strokeStyle = annotation.color || '#ffcc00';
  ctx.fillStyle = annotation.color || '#ffcc00';
  ctx.lineWidth = Math.max(1, Number(annotation.width) || 3);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (annotation.type === 'marker') {
    const x = start.x, y = start.y;
    const radius = Math.max(5, ctx.lineWidth * 2.4);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = Math.max(2, Number(annotation.width) + 2);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.moveTo(x - radius - 4, y); ctx.lineTo(x + radius + 4, y);
    ctx.moveTo(x, y - radius - 4); ctx.lineTo(x, y + radius + 4);
    ctx.stroke();
    ctx.strokeStyle = annotation.color || '#ffcc00';
    ctx.lineWidth = Math.max(1, Number(annotation.width) || 3);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.moveTo(x - radius - 4, y); ctx.lineTo(x + radius + 4, y);
    ctx.moveTo(x, y - radius - 4); ctx.lineTo(x, y + radius + 4);
    ctx.stroke();
  } else if (annotation.type === 'text') {
    const label = String(annotation.text || '').slice(0, 120);
    const fontSize = Math.max(8, Math.min(72, Number(annotation.textSize) || 24));
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const metrics = ctx.measureText(label);
    const padX = Math.max(3, fontSize * 0.22);
    const padY = Math.max(2, fontSize * 0.16);
    if (annotation.textBackground) {
      ctx.fillStyle = annotation.backgroundColor || '#111827';
      ctx.fillRect(start.x, start.y, metrics.width + padX * 2, fontSize + padY * 2);
    }
    ctx.fillStyle = annotation.color || '#ffcc00';
    ctx.fillText(label, start.x + padX, start.y + padY, Math.max(1, canvasWidth - start.x - padX));
  } else if (annotation.type === 'pen') {
    const points = Array.isArray(annotation.points) ? annotation.points : [];
    if (points.length <= 1) {
      const p = points[0] || start;
      ctx.arc(p.x, p.y, Math.max(0.75, ctx.lineWidth / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }
  } else if (annotation.type === 'line') {
    ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
  } else if (annotation.type === 'arrow') {
    ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headSize = Math.max(8, ctx.lineWidth * 3.2);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headSize * Math.cos(angle - Math.PI / 6), end.y - headSize * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headSize * Math.cos(angle + Math.PI / 6), end.y - headSize * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  } else if (annotation.type === 'rectangle') {
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (annotation.type === 'ellipse') {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const radiusX = Math.max(0.5, Math.abs(end.x - start.x) / 2);
    const radiusY = Math.max(0.5, Math.abs(end.y - start.y) / 2);
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAnnotationSelection(ctx, annotation) {
  const bounds = annotationBounds(annotation);
  const handle = annotationResizeHandle(annotation);
  if (!bounds || !handle) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#54a6ff';
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(bounds.left - 4, bounds.top - 4, bounds.width + 8, bounds.height + 8);
  ctx.setLineDash([]);
  const size = Math.max(6, 8 / Math.max(0.05, state.zoomLevel));
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1f6feb';
  ctx.lineWidth = Math.max(1, 1.5 / Math.max(0.05, state.zoomLevel));
  ctx.fillRect(handle.x - size / 2, handle.y - size / 2, size, size);
  ctx.strokeRect(handle.x - size / 2, handle.y - size / 2, size, size);
  ctx.restore();
}

function renderAnnotationOverlay() {
  if (!els.overlayCanvas || !els.oCtx) return;
  if (els.overlayCanvas.width !== els.canvas.width) els.overlayCanvas.width = els.canvas.width;
  if (els.overlayCanvas.height !== els.canvas.height) els.overlayCanvas.height = els.canvas.height;
  els.oCtx.clearRect(0, 0, els.overlayCanvas.width, els.overlayCanvas.height);
  for (const annotation of state.annotations) drawOneAnnotation(els.oCtx, annotation);
  if (state.currentAnnotation) drawOneAnnotation(els.oCtx, state.currentAnnotation);
  const selected = selectedAnnotation();
  if (state.annotationMode && document.getElementById('annotationTool').value === 'select' && selected) drawAnnotationSelection(els.oCtx, selected);
}

function updateAnnotationControls() {
  const toggle = document.getElementById('btnAnnotationMode');
  const undoButton = document.getElementById('btnUndoAnnotation');
  const redoButton = document.getElementById('btnRedoAnnotation');
  const deleteButton = document.getElementById('btnDeleteAnnotation');
  const clearButton = document.getElementById('btnClearAnnotations');
  const hint = document.getElementById('annotationHint');
  const count = state.annotations.length;
  const tool = document.getElementById('annotationTool').value;
  const selected = selectedAnnotation();
  const editingSelectedText = state.annotationMode && tool === 'select' && selected && selected.type === 'text';
  document.querySelectorAll('.annotation-text-control').forEach(control => { control.hidden = !(tool === 'text' || editingSelectedText); });
  toggle.disabled = !state.mediaType;
  toggle.textContent = state.annotationMode ? 'Annotation mode on' : 'Enable annotations';
  toggle.setAttribute('aria-pressed', String(state.annotationMode));
  toggle.classList.toggle('active', state.annotationMode);
  undoButton.disabled = state.annotationUndo.length === 0;
  redoButton.disabled = state.annotationRedo.length === 0;
  deleteButton.disabled = !(state.annotationMode && tool === 'select' && selected);
  clearButton.disabled = count === 0;
  const placementHint = (tool === 'marker' || tool === 'text') ? 'Click the image to place it.' : 'Drag on the image to draw.';
  hint.textContent = !state.mediaType
    ? 'Load media, then enable annotations.'
    : !state.annotationMode
      ? `${count} mark${count === 1 ? '' : 's'} on this media. Enable annotations to edit.`
      : tool === 'select'
        ? (selected ? `Selected ${selected.type}. Drag to move; drag the handle to resize. Use controls to edit style; Delete removes it.` : 'Click a mark to select it. Drag the selected mark to move or its handle to resize.')
        : `${placementHint} ${count} mark${count === 1 ? '' : 's'} added.`;
  els.viewerContainer.classList.toggle('annotation-active', state.annotationMode);
  els.viewerContainer.classList.toggle('annotation-select-mode', state.annotationMode && tool === 'select');
}

function resetAnnotations() {
  state.annotations = [];
  state.currentAnnotation = null;
  state.selectedAnnotationId = null;
  state.annotationDrag = null;
  state.annotationUndo = [];
  state.annotationRedo = [];
  state.annotationStyleHistoryOpen = false;
  state.annotationMode = false;
  renderAnnotationOverlay();
  updateAnnotationControls();
}

document.getElementById('btnAnnotationMode').addEventListener('click', () => {
  if (!state.mediaType) return;
  state.currentAnnotation = null;
  state.annotationDrag = null;
  state.annotationMode = !state.annotationMode;
  updateAnnotationControls();
  renderAnnotationOverlay();
});
document.getElementById('annotationTool').addEventListener('change', event => {
  state.annotationTool = event.target.value;
  state.annotationStyleHistoryOpen = false;
  syncAnnotationEditorFromSelection();
  updateAnnotationControls();
  renderAnnotationOverlay();
});
document.getElementById('annotationColor').addEventListener('input', event => {
  state.annotationColor = event.target.value;
  applySelectedAnnotationStyle({ color: event.target.value });
});
document.getElementById('annotationWidth').addEventListener('input', event => {
  state.annotationWidth = Number(event.target.value);
  document.getElementById('annotationWidthValue').textContent = `${state.annotationWidth} px`;
  applySelectedAnnotationStyle({ width: state.annotationWidth });
});
document.getElementById('annotationText').addEventListener('input', event => {
  state.annotationText = event.target.value.slice(0, 120);
  applySelectedAnnotationStyle({ text: state.annotationText });
});
document.getElementById('annotationTextSize').addEventListener('input', event => {
  state.annotationTextSize = Number(event.target.value);
  document.getElementById('annotationTextSizeValue').textContent = `${state.annotationTextSize} px`;
  applySelectedAnnotationStyle({ textSize: state.annotationTextSize });
});
document.getElementById('annotationTextBackground').addEventListener('change', event => {
  state.annotationTextBackground = event.target.checked;
  applySelectedAnnotationStyle({ textBackground: state.annotationTextBackground });
  state.annotationStyleHistoryOpen = false;
});
document.getElementById('annotationBackgroundColor').addEventListener('input', event => {
  state.annotationBackgroundColor = event.target.value;
  applySelectedAnnotationStyle({ backgroundColor: state.annotationBackgroundColor });
});
['annotationColor', 'annotationWidth', 'annotationText', 'annotationTextSize', 'annotationBackgroundColor'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => { state.annotationStyleHistoryOpen = false; });
  document.getElementById(id).addEventListener('blur', () => { state.annotationStyleHistoryOpen = false; });
});
document.getElementById('btnUndoAnnotation').addEventListener('click', undoAnnotation);
document.getElementById('btnRedoAnnotation').addEventListener('click', redoAnnotation);
document.getElementById('btnDeleteAnnotation').addEventListener('click', () => {
  if (!selectedAnnotation()) return;
  saveAnnotationHistory();
  state.annotations = state.annotations.filter(item => item.id !== state.selectedAnnotationId);
  state.selectedAnnotationId = null;
  renderAnnotationOverlay();
  syncAnnotationEditorFromSelection();
  updateAnnotationControls();
  showMsg('Selected annotation deleted.');
});
document.getElementById('btnClearAnnotations').addEventListener('click', () => {
  if (!state.annotations.length) return;
  saveAnnotationHistory();
  state.annotations = [];
  state.currentAnnotation = null;
  state.annotationDrag = null;
  state.selectedAnnotationId = null;
  renderAnnotationOverlay();
  updateAnnotationControls();
  showMsg('Annotations cleared.');
});

function drawAnnotationWhileDragging(event) {
  const drag = state.annotationDrag;
  if (!drag) return;
  const point = annotationPointFromEvent(event, true);
  if (!point) return;
  const distance = Math.hypot(point.x - drag.startPoint.x, point.y - drag.startPoint.y);
  if (distance > 1.5 && !drag.historySaved) {
    saveAnnotationHistory();
    drag.historySaved = true;
  }
  if (!drag.historySaved) return;
  const index = state.annotations.findIndex(item => item.id === drag.id);
  if (index < 0) { state.annotationDrag = null; return; }
  state.annotations[index] = drag.mode === 'move'
    ? translateAnnotation(drag.original, point.x - drag.startPoint.x, point.y - drag.startPoint.y)
    : resizeAnnotationFromDrag(drag.original, point, drag);
  drag.moved = true;
  renderAnnotationOverlay();
}

let isPanning = false, isDraggingSplit = false;
let startX, startY, startPanX, startPanY;
els.viewerContainer.addEventListener('contextmenu', e => e.preventDefault());
els.viewerContainer.addEventListener('mousedown', (e) => {
  if (e.button === 0 && beginAnnotationFromEvent(e)) return;
  if (e.button === 2) {
    isPanning = true; startX = e.clientX; startY = e.clientY;
    startPanX = state.panX; startPanY = state.panY;
    els.viewerContainer.style.cursor = 'grabbing';
  }
});
els.splitHandle.addEventListener('mousedown', (e) => {
  if (e.button === 0 && state.viewMode === 'split') {
    isDraggingSplit = true;
    e.preventDefault();
  }
});
window.addEventListener('mousemove', (e) => {
  if (state.annotationDrag) {
    drawAnnotationWhileDragging(e);
  } else if (state.currentAnnotation) {
    const point = annotationPointFromEvent(e, true);
    if (point) {
      const annotation = state.currentAnnotation;
      annotation.end = point;
      if (annotation.type === 'pen') {
        const points = annotation.points;
        const last = points[points.length - 1];
        const distance = last ? Math.hypot(point.x - last.x, point.y - last.y) : Infinity;
        if (distance >= 1.25) points.push(point);
      }
      renderAnnotationOverlay();
    }
  } else if (isPanning) {
    state.panX = startPanX + (e.clientX - startX);
    state.panY = startPanY + (e.clientY - startY);
    applyZoom();
  } else if (isDraggingSplit) {
    const rect = els.canvasWrapper.getBoundingClientRect();
    if (rect.width > 0) state.splitPosition = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    els.splitHandle.style.left = `${state.splitPosition * 100}%`;
    if(state.lastOrigData) drawToViewer(state.lastOrigData, currentDisplayedImageData(), els.canvas.width, els.canvas.height);
  }
});
window.addEventListener('mouseup', (event) => {
  if (state.annotationDrag) {
    const drag = state.annotationDrag;
    state.annotationDrag = null;
    if (drag.moved) {
      renderAnnotationOverlay();
      updateAnnotationControls();
    }
  }
  if (state.currentAnnotation) {
    const point = annotationPointFromEvent(event, true);
    if (point) state.currentAnnotation.end = point;
    state.annotations.push(state.currentAnnotation);
    state.currentAnnotation = null;
    renderAnnotationOverlay();
    updateAnnotationControls();
  }
  isPanning = false;
  isDraggingSplit = false;
  els.viewerContainer.style.cursor = state.annotationMode ? 'crosshair' : '';
});

document.addEventListener('keydown', event => {
  if (!state.annotationMode || document.getElementById('annotationTool').value !== 'select') return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnnotation()) {
    event.preventDefault();
    document.getElementById('btnDeleteAnnotation').click();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoAnnotation(); else undoAnnotation();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redoAnnotation();
  }
});

