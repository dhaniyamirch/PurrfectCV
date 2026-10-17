# Meow Visual Processing Editor — Work Plan

The goal is to improve the existing editor in small, testable steps. Keep the current working features intact while adding one group of capabilities at a time. Do not combine every feature into one large rewrite.

## Milestone 1 — Split the existing app into files (implementation complete)

- [x] Move the editor markup into `index.html`.
- [x] Move CSS out of the HTML file and into `styles.css`.
- [x] Move the existing JavaScript into `js/app.js`.
- [x] Preserve the existing image/video import, processing pipeline, viewer, video sampling timeline, statistics, and pipeline JSON actions.
- [x] Fix the race where asynchronous OpenCV.js could finish loading before `onOpenCvReady` had been defined.
- [x] Show an understandable loading error if the OpenCV.js CDN script fails.
- [ ] Finish full browser-based regression testing after the refactor.

## Milestone 2 — Repair existing bugs before adding large features (implementation pass complete; real-browser QA pending)

- [x] Implement **Export All Frames** as a ZIP download containing processed PNGs for the sampled frames.
- [x] Track and release temporary OpenCV.js resources per operation, including the error path.
- [x] Add timeout, cancellation, and error handling to video metadata loading, seeks, and frame extraction.
- [x] Fix pipeline reordering insertion indices and record slider history before the first value mutation in a gesture.
- [x] Fix split-position clamping, delayed fit-to-view after media load, zoom bounds, failed media cleanup, and malformed pipeline import handling.
- [x] Add an export memory guard and use a separate video element during bulk export so background seeking does not disturb the editor's frame.
- [ ] Run end-to-end tests against the real OpenCV.js runtime, including output correctness for each operation and ZIP contents.
- [ ] Run tests with small and large images, multiple browser-supported video formats, switching between media types, and malformed pipeline JSON.
- [ ] Verify split dragging, zoom/pan, slider undo/redo, and drag/reorder manually in Chrome, Firefox, and Edge where available.

**Testing note:** static JavaScript syntax and HTML parsing have been checked. Real-browser OpenCV processing and downloaded ZIP contents are not yet verified, so the manual QA boxes above remain open.

## Milestone 3 — Complete project save/open with `.meow` (implementation pass complete; browser round-trip QA pending)

- [x] Specify a versioned `.meow` project format (`schemaVersion: 1`, ZIP archive with `project.json` and embedded `media/source.*`).
- [x] Save project name, embedded original source media, media type/metadata, processing pipeline and parameters, selected video frame/time, extraction FPS, and view settings.
- [x] Open a `.meow` project and restore the media, processing pipeline, view mode/zoom/pan/split position, and nearest sampled video frame.
- [x] Validate format/version, required fields, media path, pipeline operations/parameters, media type/size, and browser decoding before replacing the current workspace.
- [x] Add separate **Save Project / Open Project** actions while preserving pipeline JSON import/export.
- [ ] Test image and video save → download → open round-trips in a real browser and confirm the processed output matches the saved project.
- [ ] Test damaged ZIPs, unsupported schema versions, missing media, large files, and video frame/time restoration in Chrome, Firefox, and Edge where available.

**Format note:** `.meow` is a project-file extension, not an operating-system/browser extension package. It is ZIP-compatible and embeds the original media, so project files can become large. The current implementation caps source media at 500 MiB and the archive at 550 MiB to limit browser memory use.

## Milestone 4 — Multiple branches and merging (implementation pass complete; browser QA pending)

- [x] Add multiple named processing branches, each with its own pipeline and selection state.
- [x] Add create, rename, delete, and switch branch actions. The last branch cannot be deleted; branch names must be unique.
- [x] Keep undo/redo history independent per branch, including pipeline edits and blend-setting changes.
- [x] Implement conflict-aware three-way pipeline merges for branches with a compatible shared fork point.
- [x] Report auto-merge conflicts for divergent parameter edits, delete-vs-edit changes, and incompatible reorder operations rather than silently guessing.
- [x] Add explicit **Append source pipeline** and **Replace active pipeline** fallback strategies for branches without a compatible common base or with conflicts.
- [x] Add non-destructive output blending with Normal, Multiply, Screen, Overlay, Difference, Darken, and Lighten modes plus opacity control.
- [x] Make the blended output visible in the main editor and respect it when exporting the active frame or all sampled video frames.
- [x] Save branch names, lineage/fork-base snapshots, branch pipelines, active branch, and output-blend settings in `.meow` schema version 2; schema version 3 extends this format with annotation persistence.
- [x] Keep the reader compatible with existing schema version 1 `.meow` projects by migrating them to a single **Main** branch.
- [x] Run a headless Chromium UI/logic smoke test for branch creation/switching, pipeline isolation, compatible auto-merge, blend pixel arithmetic, schema v1 migration, and rejection of invalid parent references.
- [ ] Complete media-backed browser testing for branch creation/switching, undo/redo isolation, merge conflicts, blend output, and frame exports.
- [ ] Test `.meow` version 1 migration and version 2 multi-branch save/open round-trips with real images and videos.

**Merge behavior:** three-way auto-merge combines non-conflicting edits by processing-step ID and uses the common fork-point snapshot as its base. It refuses to guess when both branches changed the same step incompatibly or reordered shared steps differently. Append and Replace are explicit alternatives. **Blend branch outputs** does not rewrite either branch's pipeline; it combines their processed pixels for the current active branch's view and exports.

## Milestone 5A — Stage preview thumbnails (implementation pass complete; media-backed QA pending)

- [x] Generate a compact thumbnail for the source and each intermediate processing stage.
- [x] Refresh thumbnails after processing changes, branch switches, media changes, and video-frame selection.
- [x] Show the blended final output as an additional thumbnail when branch-output blending is enabled.
- [x] Keep thumbnails derived and out of the `.meow` file, so saved projects do not grow from duplicate preview images.
- [x] Keep this slice read-only: it does not add editor tabs or comparison actions yet.
- [ ] Verify stage thumbnail pixels using the real OpenCV.js runtime with multiple image sizes, operation chains, blends, and sampled video frames.

## Milestone 5B — Open a stage in the main editor (implementation complete; media-backed QA pending)

- [x] Add an **Open in editor** action to each stage preview.
- [x] Display the selected intermediate result in the main viewer without discarding or rewriting the full pipeline.
- [x] Add a persistent on-screen **Viewing stage** indicator and a **Final output** return action.
- [x] Keep the stage view tied to the active branch and operation ID; safely return to the final result if the selected stage disappears after a branch switch or pipeline edit.
- [x] Make **Save Frame** export the selected stage and include the stage name in its filename.
- [x] Make **Export All Frames** apply the selected source/operation stage to each sampled video frame; preserve blend behavior when the selected stage is the blended output.
- [x] Use on-demand full-resolution recomputation for an opened stage rather than retaining full-resolution buffers for every pipeline stage.
- [x] Run a headless Chromium UI/data-contract smoke test with a deterministic mock pipeline: stage selection, final-result preservation, viewer-mode interaction, stage filename, and return to final output.
- [ ] Test switching branches and sampled video frames while viewing an intermediate stage using the real OpenCV.js runtime.
- [ ] Verify real OpenCV pixel output and the contents/names of saved PNG and frame ZIP downloads.

**Current limitation:** the selected-stage viewing mode is temporary editor state and is not persisted inside `.meow` projects. The project still saves the complete underlying branch pipelines and media.

## Milestone 5C — Single-slot comparison workspace (implementation pass complete; media-backed QA pending)

- [x] Add a separate comparison workspace that opens with exactly one empty image slot.
- [x] Let users put the source or any processing-stage preview into the slot using **Add to comparison**.
- [x] Recompute the selected source/operation output at full resolution when adding it; do not use the tiny stage thumbnail as the comparison image.
- [x] For video, capture the currently selected sampled frame as a comparison snapshot.
- [x] Allow replacing or clearing the slot and keep the selected snapshot unchanged when the active editor frame changes.
- [x] Keep comparison separate from stage viewing and the existing original/processed split view.
- [x] Document that comparison selections are temporary and are not persisted in `.meow` projects yet.
- [x] Run JavaScript syntax, HTML element-reference/duplicate-ID, and CSS parser checks.
- [ ] Test adding, replacing, and clearing slot 1 with actual images and videos using the real OpenCV.js runtime.
- [ ] Verify that blend-stage snapshots match the blended output at the selected frame.

**Current limitation:** this slice has one slot only. It is a snapshot workspace, not yet a side-by-side comparison; selected outputs are temporary and are not saved with `.meow` projects.

## Milestone 5D — Four-slot comparison workspace (implementation pass complete; media-backed QA pending)

- [x] Expand the comparison model to four independent snapshot slots with a hard maximum of four.
- [x] Let users target any slot, add a snapshot, replace a populated slot, and remove individual images.
- [x] Advance to the next empty slot after a successful capture for quicker multi-stage comparison, unless the user changed the target during capture.
- [x] Keep one-image mode compact and use a responsive two-column grid for two to four occupied slots; show the next empty target slot for quick capture.
- [x] Keep source/stage label, dimensions, frame/branch provenance, and per-slot removal controls visible.
- [x] Keep comparison snapshots temporary and outside the `.meow` project format for this increment.
- [x] Run a headless Chromium UI/data-contract smoke test with mock snapshots for initialization, four-slot limit, target switching, individual removal, and reusing an empty slot.
- [ ] Test adding, replacing, removing, and reusing all four slots with real images and sampled video frames using OpenCV.js.
- [ ] Verify memory/URL cleanup and responsive layout in Chrome, Firefox, and Edge where available.

## Milestone 6A — Basic annotation drawing (implementation complete; interactive media QA pending)

- [x] Add a dedicated annotation toolbar and an explicit enable/disable drawing mode.
- [x] Support freehand, line, arrow, rectangle and ellipse marks on the viewer overlay.
- [x] Add colour and stroke-width controls.
- [x] Add undo-last-mark and clear-all-marks controls.
- [x] Keep annotations separate from the image-processing pipeline and redraw them over the viewer after processing/view-mode updates.
- [x] Map pointer input to image pixels so marks follow the viewer through CSS zoom and pan.
- [x] Clear temporary annotations when new media is loaded or a `.meow` project replaces the current media.
- [x] Run JavaScript syntax, HTML/ID-reference, and CSS parsing checks.
- [ ] Verify freehand and all shape types using real image/video media with OpenCV.js in Chromium.
- [ ] Manually verify drawing in processed/original/split modes at multiple zoom levels and panning offsets.

**Current limitation:** marks are temporary overlays. They are not saved in `.meow` projects and are not composited into PNG or sampled-video-frame exports in this increment.

## Milestone 6B — Point markers and text labels (implementation pass complete; media-backed QA pending)

- [x] Add click-placed point/crosshair marker annotations.
- [x] Add click-placed text labels with a configurable label string.
- [x] Add text size control (8–72 image pixels) and an optional label background with a separate background-colour control.
- [x] Capture text, text size, text colour, background toggle, and background colour in each label so future changes to the controls do not change previous labels.
- [x] Show label-only controls when the Text label tool is selected and reject empty labels.
- [x] Preserve the Milestone 6A freehand, line, arrow, rectangle, ellipse, colour, stroke width, undo and clear controls.
- [x] Keep annotations on the overlay canvas and clear them when media/project changes; do not alter pipeline pixels or claim annotation export/project persistence.
- [x] Run static syntax, HTML/ID-reference, and CSS parsing checks.
- [x] Run a headless Chromium interaction smoke test using a mock canvas for point placement, label styling, text background toggling, undo/clear, empty-label rejection, and page errors.
- [ ] Verify markers and labels on real image/video media with OpenCV.js, including zoom, pan, original/processed/split modes.

**Current limitation:** annotation text can be configured before placement, but existing marks cannot yet be selected or edited after placement. Annotations remain temporary and are not included in exports or `.meow` files.

## Milestone 6C — Select and edit annotations (implementation pass complete; real-media QA pending)

- [x] Add **Select / edit** mode and click-to-select existing marks, with a visible selection outline and resize handle.
- [x] Move selected annotations by dragging their body; keep moved marks within the canvas bounds.
- [x] Resize line, arrow, rectangle, ellipse and freehand geometry; adjust marker size and text size with the resize handle.
- [x] Recolour and adjust stroke width for selected marks; edit selected text content, text size, label background toggle and background colour.
- [x] Delete the selected mark from a toolbar button or Delete/Backspace key.
- [x] Add annotation-specific undo/redo for creating marks, moving/resizing, style changes, deletion, and clear-all. Add Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y shortcuts while using Select / edit.
- [x] Keep pointer interaction mapped to image pixels and preserve annotation separation from the processing pipeline.
- [x] Run JavaScript syntax, HTML/ID-reference, duplicate-ID, CSS parsing and ZIP integrity checks.
- [x] Run a headless Chromium interaction smoke test using a mock canvas for rectangle drawing, selection, move, resize, recolour, delete, undo/redo, keyboard redo, and page errors.
- [ ] Test editing marks on real image/video media with OpenCV.js, including zoom, pan, original/processed/split modes and narrow/tall images.

**Current limitation:** annotations remain temporary overlay state and are not persisted into `.meow` projects or composited into PNG/video-frame exports. Full media-backed interaction QA remains pending.

## Milestone 6D-A — Save annotations in `.meow` projects (implementation pass complete; browser round-trip QA pending)

- [x] Bump `.meow` schema version to 3 and store annotation marks in `workspace.annotations`.
- [x] Persist type, source-image pixel geometry, freehand points, colour, stroke width, and text-specific settings.
- [x] Validate annotation count, IDs, supported types, coordinates, colours, label text, and freehand-point limits before a project can replace the active workspace.
- [x] Keep schema version 1 and 2 projects readable; migrate them to an empty annotation list without losing their media, branches, or pipeline settings.
- [x] Restore annotations on project open, with annotation mode off and selection/history reset to avoid accidental edits immediately after loading.
- [x] Update README and roadmap to distinguish persisted annotations from annotation export compositing.
- [x] Run JavaScript syntax, HTML element-reference/duplicate-ID, CSS parsing, and ZIP integrity checks.
- [x] Run headless Chromium checks for schema-v3 serialization/validation, v1/v2 compatibility, invalid annotation rejection, and the project restoration path using mocked media.
- [ ] Run a real-browser `.meow` save → download → open round-trip with actual media and verify every annotation type, freehand points, text styles, and edited geometry are restored.
- [ ] Test malformed annotation data and legacy v1/v2 projects using real project archives in Chrome, Firefox, and Edge where available.

**Current limitation at the end of 6D-A:** annotations persist in `.meow` projects but were not yet drawn into exported PNGs or sampled video-frame ZIPs. Annotation geometry is stored in source-image pixel coordinates; annotations are not frame-specific on video in this increment.

## Milestone 6D-B — Include annotations in PNG exports (implementation pass complete; browser/media QA pending)

- [x] Composite committed annotation marks over the currently displayed source/selected-stage/final image when **Save Frame** is used.
- [x] Keep the main processing canvas and pipeline pixels unchanged; export composition happens on a separate offscreen canvas.
- [x] Draw marks in source-image pixel coordinates and use the export canvas dimensions for text-label clipping.
- [x] Exclude selection outlines/resize handles and unfinished in-progress strokes from the saved PNG.
- [x] Keep empty-annotation exports pixel-identical to the underlying image, and show a confirmation message when marks are included.
- [x] Run JavaScript syntax, HTML reference/duplicate-ID, CSS parse, and ZIP integrity checks; run a focused logic check for overlay compositing and unchanged source pixels.
- [ ] Verify downloaded PNG pixels and filenames in a regular browser with real images and each annotation type, including labels near image edges and selected-stage export.
- [ ] Manually test processed/final and stage-view PNG export with actual OpenCV.js media.

**Current limitation:** this milestone only adds annotation composition to **Save Frame** PNGs. Sampled video-frame ZIP exports are unchanged and do not yet include annotation marks. The headless Chromium download test did not complete reliably in the build environment, so end-to-end export is not marked as browser-tested.

## Milestone 6D-C — Include annotations in sampled-video-frame ZIP exports

- [ ] Composite the saved annotation geometry into each exported sampled frame using its frame dimensions.
- [ ] Keep the export operation from changing the visible frame, annotation history, or branch pipeline.
- [ ] Test ZIP contents and output PNGs with real videos, multiple sampled frame rates, and large source dimensions.

## Milestone 7 — Video stacking and time controls

- [ ] Improve video transport controls, time display, scrubbing, and frame selection.
- [ ] Let users select multiple sampled frames and stack/combine them; start with average stacking.
- [ ] Add controls to manage stack membership and display the result in the main editor.
- [ ] Store selected frames and stack settings in `.meow` files.
- [ ] Export processed frames as images. Consider full processed video encoding separately because static GitHub Pages does not provide a server-side encoder.

## Milestone 8 — More processing tools and release testing

- [ ] Review the current operation list and fix any operations whose output is incorrect or whose OpenCV.js API use is unsupported.
- [ ] Add additional processing operations in small groups after their outputs and memory cost are tested.
- [ ] Improve tool search/categories and explain operation parameters in the UI.
- [ ] Test recent Chrome, Firefox, and Edge versions where available.
- [ ] Verify GitHub Pages works when hosted at a repository subpath.
- [ ] Update documentation only after each feature is implemented and tested.

## Decisions to make later

- Whether Meow should also be packaged as a true browser extension. `.meow` is currently intended as the file extension for a saved project, not as an extension package.
- Whether to add local autosave, and how to explain its storage/permission behavior.
- Whether full MP4/WebM export is worth the added encoder size and browser memory use.


## Modularization update — Stage 3

- [x] Split the existing JavaScript into focused files under `js/core`, `js/processing`, `js/media`, `js/features`, and `js/io` while preserving source execution order.
- [x] Keep `js/app.js` as the final initialization script.
- [ ] Browser-regression-test every existing feature with real media and OpenCV runtime.
- [ ] After regression testing, decide whether to migrate the classic-script modules to explicit ES modules.
