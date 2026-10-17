# JavaScript structure — Stage 3

All files are classic browser scripts, not ES modules yet. Their execution order is explicitly listed in `index.html`. This is intentional: it preserves existing shared-state/function resolution while making code easier to locate. Do not reorder the `<script defer>` tags until dependencies are made explicit.

| File | Responsibility |
|---|---|
| `core/config.js` | Shared operation definitions and limits. |
| `core/state.js` | Shared mutable state, DOM references, helper functions and OpenCV readiness. |
| `features/pipeline-editor.js` | Pipeline blocks, inspector and edit history. |
| `features/branches.js` | Branch state and merge/blend controls. |
| `media/media-loader.js` | Media and timeline/frame operations. |
| `processing/pipeline-runner.js` | Execute an operation sequence and emit stage previews. |
| `features/stage-previews.js` | Render/open stage preview UI. |
| `features/comparison.js` | Comparison workspace and shared image/canvas helpers. |
| `processing/process-controller.js` | Connect source data, pipeline and final output. |
| `processing/opencv-operations.js` | OpenCV operation implementations. |
| `features/annotations.js` | Draw, select, resize, recolor and delete annotations. |
| `features/viewer.js` | Viewer canvas, zoom/pan and statistics. |
| `features/editor-controls.js` | General control bindings and frame search. |
| `io/exports.js` | PNG and video-frame ZIP exports. |
| `io/meow-project.js` | `.meow` archive creation, schema validation and loading. |
| `io/pipeline-json.js` | Pipeline JSON import/export. |
| `app.js` | Initialization; must run last. |

All boundaries in this stage are extracted from the validated Stage 2 source and keep source execution order. Files share the page's global lexical environment. The next improvement, after regression testing, can be converting these shared globals into explicit ES module exports/imports.
