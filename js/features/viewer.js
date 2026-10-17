/* Meow module: Canvas display modes, zoom, pan and image statistics.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
function drawToViewer(origImgData, procImgData, w, h) {
  if (!origImgData || !procImgData) return;
  els.ctx.clearRect(0,0,w,h);
  els.splitHandle.style.display = 'none';
  
  if (state.viewMode === 'processed') {
    els.ctx.putImageData(procImgData, 0, 0);
  } else if (state.viewMode === 'original') {
    els.ctx.putImageData(origImgData, 0, 0);
  } else if (state.viewMode === 'split') {
    els.ctx.putImageData(origImgData, 0, 0);
    const splitX = Math.floor(w * state.splitPosition);
    els.ctx.putImageData(procImgData, 0, 0, splitX, 0, w - splitX, h);
    
    els.splitHandle.style.display = 'block';
    els.splitHandle.style.left = `${state.splitPosition * 100}%`;
  }
  renderAnnotationOverlay();
}

function fitCanvasToViewer() {
  if ((!state.sourceImage && !state.videoEl) || !els.canvas.width || !els.canvas.height) return;
  const cw = Math.max(1, els.viewerContainer.clientWidth - 32);
  const ch = Math.max(1, els.viewerContainer.clientHeight - 32);
  const iw = els.canvas.width;
  const ih = els.canvas.height;
  state.zoomLevel = Math.min(cw / iw, ch / ih, 1.0);
  state.panX = (els.viewerContainer.clientWidth - (iw * state.zoomLevel)) / 2;
  state.panY = (els.viewerContainer.clientHeight - (ih * state.zoomLevel)) / 2;
  applyZoom();
}

document.getElementById('btnFit').addEventListener('click', fitCanvasToViewer);
document.getElementById('btnZoomIn').addEventListener('click', () => { state.zoomLevel = Math.min(8, state.zoomLevel * 1.2); applyZoom(); });
document.getElementById('btnZoomOut').addEventListener('click', () => { state.zoomLevel = Math.max(0.05, state.zoomLevel / 1.2); applyZoom(); });

function applyZoom() {
  const transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoomLevel})`;
  els.canvasWrapper.style.transform = transform;
}

function calculateStats(imgData) {
  const d = imgData.data; let sum = 0, sumSq = 0, min = 255, max = 0;
  const hist = new Uint32Array(256), pixels = d.length / 4;
  for(let i=0; i<d.length; i+=4) { const v = Math.round(luma(d[i],d[i+1],d[i+2])); sum+=v; sumSq+=v*v; if(v<min)min=v; if(v>max)max=v; hist[v]++; }
  const mean = sum/pixels, std = Math.sqrt(Math.max(0, (sumSq/pixels)-(mean*mean)));
  
  document.getElementById('statMean').textContent = mean.toFixed(1);
  document.getElementById('statStd').textContent = std.toFixed(1);
  document.getElementById('statMin').textContent = min;
  document.getElementById('statMax').textContent = max;
  
  els.hctx.clearRect(0, 0, els.histCanvas.width, els.histCanvas.height);
  const maxH = Math.max(...hist); if (maxH === 0) return;
  els.hctx.fillStyle = '#2f81f7';
  for(let i=0; i<256; i++) { const h = (hist[i]/maxH)*els.histCanvas.height; els.hctx.fillRect(i*(els.histCanvas.width/256), els.histCanvas.height-h, Math.ceil(els.histCanvas.width/256), h); }
}

