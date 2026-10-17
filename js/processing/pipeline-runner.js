/* Meow module: Applies a pipeline and emits per-stage thumbnails.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
function runPipelineOnImageData(sourceData, outputCanvas, pipeline = state.pipeline, showOperationErrors = true, onStage = null, branchId = state.activeBranchId) {
  const width = sourceData.width;
  const height = sourceData.height;
  outputCanvas.width = width;
  outputCanvas.height = height;
  let currentMat = cv.matFromImageData(sourceData);
  const emitStage = (kind, stepIndex, label, mat, extra = {}) => {
    if (typeof onStage !== 'function') return;
    try {
      onStage({
        key: kind === 'step' ? `${branchId || 'branch'}:step:${extra.blockId || stepIndex}` : `${branchId || 'branch'}:source`,
        branchId,
        kind,
        stepIndex,
        label,
        thumbnail: matToStageThumbnail(mat),
        ...extra
      });
    } catch (error) {
      // A thumbnail problem must never stop the actual processing pipeline.
      console.warn('Could not render a stage thumbnail:', error);
    }
  };
  try {
    emitStage('source', -1, 'Source', currentMat);
    for (let index = 0; index < pipeline.length; index++) {
      const block = pipeline[index];
      let nextMat;
      try {
        nextMat = processOpenCVBlock(currentMat, block.type, block.params || {});
      } catch (error) {
        console.error(`Processing block ${block.type} failed:`, error);
        if (showOperationErrors) showMsg(`The ${OPERATIONS[block.type]?.name || block.type} operation failed; the previous result was kept.`);
        nextMat = currentMat.clone();
      }
      if (nextMat && nextMat !== currentMat) {
        currentMat.delete();
        currentMat = nextMat;
      }
      emitStage('step', index, `${index + 1}. ${OPERATIONS[block.type]?.name || block.type}`, currentMat, { blockId: block.id, blockType: block.type });
    }
    cv.imshow(outputCanvas, currentMat);
    const context = outputCanvas.getContext('2d', { willReadFrequently: true });
    return context.getImageData(0, 0, width, height);
  } finally {
    if (currentMat) currentMat.delete();
  }
}

