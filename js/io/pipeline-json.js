/* Meow module: Pipeline-only JSON import/export.
 * Loaded as a classic script in the order listed in index.html.
 * Shared globals are preserved during this behavior-preserving extraction.
 */
document.getElementById('btnSavePipe').addEventListener('click', () => {
  const data = JSON.stringify({ version: 1, pipeline: state.pipeline }, null, 2);
  downloadBlob(new Blob([data], { type: 'application/json' }), 'meow_pipeline.json');
});

document.getElementById('btnLoadPipe').addEventListener('click', () => document.getElementById('pipeUpload').click());

function validateImportedPipeline(pipeline) {
  if (!Array.isArray(pipeline)) throw new Error('The file must contain a pipeline array.');
  if (pipeline.length > 100) throw new Error('This pipeline has more than 100 steps; refusing to load it.');
  const usedIds = new Set();
  return pipeline.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Pipeline step ${index + 1} is not an object.`);
    if (typeof entry.type !== 'string' || !OPERATIONS[entry.type]) throw new Error(`Pipeline step ${index + 1} uses an unknown operation.`);
    const definition = OPERATIONS[entry.type];
    const incoming = entry.params && typeof entry.params === 'object' && !Array.isArray(entry.params) ? entry.params : {};
    const params = {};
    for (const parameter of definition.params) {
      const value = incoming[parameter.id];
      if (parameter.type === 'range') {
        const numericValue = Number(value);
        const raw = value !== undefined && value !== null && value !== '' && Number.isFinite(numericValue) ? numericValue : parameter.default;
        const bounded = Math.min(parameter.max, Math.max(parameter.min, raw));
        const steps = Math.round((bounded - parameter.min) / parameter.step);
        params[parameter.id] = Math.min(parameter.max, Math.max(parameter.min, parameter.min + steps * parameter.step));
      } else if (parameter.type === 'select') {
        params[parameter.id] = parameter.options.includes(value) ? value : parameter.default;
      } else {
        params[parameter.id] = parameter.default;
      }
    }
    let id = typeof entry.id === 'string' && entry.id.trim() ? entry.id : generateId();
    if (usedIds.has(id)) id = generateId();
    usedIds.add(id);
    return { id, type: entry.type, params };
  });
}

document.getElementById('pipeUpload').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => { showMsg('Could not read the pipeline file.'); e.target.value = ''; };
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      const importedPipeline = validateImportedPipeline(parsed?.pipeline);
      saveHistory();
      state.pipeline = importedPipeline;
      state.selectedBlockId = null;
      renderPipelineUI();
      requestProcess();
      showMsg('Pipeline loaded successfully.');
    } catch (error) {
      console.error('Pipeline import rejected:', error);
      showMsg(error.message || 'Invalid pipeline JSON format.');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
});

