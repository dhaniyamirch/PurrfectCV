Meow Visual Processing Editor — Development Tasklist
Purpose: Track the planned improvements to Meow in small, testable milestones.
Working rule: Complete one milestone at a time. Before each milestone, inspect the current implementation, make a backup, change only the required files, test the result, and update this tasklist. Do not start the next milestone until the current one passes its acceptance checks.
Current status: started implementing .

Project goals

- [ ] distribute the js code.
- [ ] Reduce UI clutter and give the image viewer more space.
- [ ] Move secondary actions into clear top-level menus: File, Edit, View, Branches, Settings, and Help.
- [ ] Hide video-specific controls and the Video Timeline when they are not relevant.
- [ ] Make branching a connected visual graph, similar to the GitHub Actions workflow example.
- [ ] Ensure each branch forks from the selected branch and can be edited independently.
- [ ] Make source-to-target merges understandable and safe.
- [ ] Improve stage previews and the four-slot comparison workspace.
- [ ] Give Meow a consistent logo, favicon, and application identity.
- [ ] Verify .meow project persistence, annotation handling, export, and performance.
  Milestone 0 — Backup and baseline verification
  Status: [ ] Not started
  Tasks
- [ ] Back up the current working project before edits.
- [ ] Record the current Git commit or create a backup branch, if Git is available.
- [ ] Confirm the current HTML, CSS, and JavaScript entry points.
- [ ] Open the editor and check the browser console for existing errors.
- [ ] Smoke-test loading an image and a video.
- [ ] Smoke-test one processing operation, undo/redo, pipeline save/load, and .meow save/open.
- [ ] Record existing bugs so they are not mistaken for regressions introduced later.
  Acceptance checks
- [ ] A known-good backup exists.
- [ ] The baseline behavior and known errors are recorded.
  Milestone 1 — Navigation and toolbar cleanup
  Status: [ ] Not started
  Proposed top navigation
  File | Edit | View | Branches | Settings | Help
  File menu
- [ ] Open Media (image/video).
- [ ] Open Project (.meow).
- [ ] Save Project / Save Project As.
- [ ] Import Pipeline / Export Pipeline.
- [ ] Save Current Frame as PNG.
- [ ] Export All Frames as ZIP when a video is loaded and frames are ready.
- [ ] Close Media / New Workspace, if this can be added without losing unsaved work.
- [ ] Add an unsaved-changes warning where appropriate before replacing or closing a project.
  Edit menu
- [ ] Undo and Redo.
- [ ] Delete selected pipeline step.
- [ ] Clear pipeline, with confirmation if appropriate.
- [ ] Annotation undo/redo.
- [ ] Delete selected annotation.
- [ ] Clear annotations, with confirmation if appropriate.
- [ ] Keep relevant keyboard shortcuts, including Ctrl/Cmd+Z and Ctrl/Cmd+Y.
- [ ] Disable commands when they cannot currently be used.
  View menu
- [ ] Processed / Original / Side-by-side view.
- [ ] Zoom in / Zoom out / Fit to View / reset zoom.
- [ ] Show/hide Tools panel.
- [ ] Show/hide Inspector and Statistics panels.
- [ ] Show/hide Stage Previews.
- [ ] Show/hide Video Timeline.
- [ ] Open Comparison Workspace.
- [ ] Switch between Image Editor and Branch Workspace.
- [ ] Decide which panel visibility settings are session-only and which should be saved.
  Branches menu
- [ ] Open Branch Workspace.
- [ ] Create branch from currently selected branch.
- [ ] Rename and delete branch.
- [ ] Open merge controls with clearly identified source and target.
- [ ] Show merge-conflict status and guidance.
  Settings and Help
- [ ] Put default extraction FPS and other infrequently changed preferences in Settings.
- [ ] Add a keyboard-shortcuts/help panel.
- [ ] Add an About Meow panel.
  Acceptance checks
- [ ] Top toolbar has fewer permanent buttons and less visual clutter.
- [ ] Every moved command is still discoverable and works.
- [ ] Essential frequent actions remain quick to access.
- [ ] Menu state, focus, keyboard usage, and disabled states behave correctly.
  Milestone 2 — Hide the Video Timeline when it is not needed
  Status: [ ] Not started
  Tasks
- [ ] Hide the entire Video Timeline section on initial load.
- [ ] Keep it hidden when a static image is loaded.
- [ ] Reveal it for video only after video metadata/frame extraction is ready.
- [ ] Add a collapse/expand control for the video timeline.
- [ ] Move or conditionally expose video-specific controls such as frame navigation, FPS, Find Brightest/Darkest, and Export All Frames.
- [ ] Ensure timeline visibility does not break canvas dimensions, scrolling, or viewer layout.
- [ ] Decide whether the chosen expanded/collapsed state should persist during the session.
  Acceptance checks
- [ ] Initial editor view does not reserve space for the timeline.
- [ ] Loading an image keeps the timeline hidden.
- [ ] Loading a video reveals the timeline when ready.
- [ ] The user can collapse and reopen the timeline.
- [ ] Video controls remain available when relevant and do not appear as broken/active controls for a static image.
  Milestone 3 — Main editor layout and responsive UI
  Status: [ ] Not started
  Tasks
- [ ] Prioritize the central image canvas and reduce wasted space.
- [ ] Make the Tools panel collapsible and improve category spacing.
- [ ] Add search/filter for processing operations, if scope allows.
- [ ] Make the Inspector panel easier to scan and edit.
- [ ] Improve layout and readability of pipeline blocks and parameter summaries.
- [ ] Reduce unnecessary vertical scrolling.
- [ ] Make Stage Previews collapsible.
- [ ] Improve button sizing, spacing, labels, empty states, focus indicators, and contrast.
- [ ] Make side panels adapt to narrower windows.
- [ ] Check scrolling in the viewer, side panels, pipeline, stage previews, and dialog independently.
  Acceptance checks
- [ ] Canvas has more usable room at typical desktop sizes.
- [ ] No essential controls are lost when panels collapse.
- [ ] Layout works at narrower desktop/tablet window sizes.
- [ ] No overlapping controls or inaccessible scroll regions remain in tested layouts.
  Milestone 4 — Correct the branch model and merge behavior
  Status: [ ] Not started
  Complete and test the underlying branch behavior before building the visual graph.

Branch creation and independence

- [ ] New branches fork from the currently selected branch, not always from Main.
- [ ] Record the parent branch and the fork-point pipeline snapshot correctly.
- [ ] Keep each branch's pipeline, selected step, and undo/redo history independent.
- [ ] Support sibling branches and child branches.
- [ ] Ensure edits in one branch do not silently modify another branch.
- [ ] Ensure deleting a branch handles child references and blend references safely.
- [ ] Keep branch IDs stable; avoid deriving branch identity from its display name.
  Merge behavior
- [ ] Make source branch and target branch explicit.
- [ ] Confirm target means the branch receiving changes and source means the branch being merged in.
- [ ] Preserve append, replace, and compatible auto-merge strategies where supported.
- [ ] Detect incompatible edits and step-order conflicts.
- [ ] Explain conflicts and offer a safe alternative; do not silently discard work.
- [ ] Define how merge results and ancestry are represented in branch metadata.
- [ ] Test blend mode separately from pipeline merge behavior.
  Acceptance checks
- [ ] Create Test A and Test B from Main; both start from the same Main snapshot.
- [ ] Create Test C from Test A; Test C identifies Test A as its parent.
- [ ] Change each pipeline independently and switch among them without loss.
- [ ] Merge a chosen source into a chosen target and verify all unrelated branches remain unchanged.
- [ ] Confirm conflict handling is understandable and non-destructive.
  Milestone 5 — GitHub Actions-style visual Branch Workspace
  Status: [ ] Not started
  Graph presentation
- [ ] Build a dedicated Branch Workspace rather than squeezing the graph into the existing bottom toolbar.
- [ ] Render branches as readable rectangular nodes.
- [ ] Draw connected lines/curves that show each branch's actual parent/fork point.
- [ ] Lay out siblings next to one another and nested branches along their ancestry.
- [ ] Visually distinguish the selected branch.
- [ ] Add clear states for normal, changed, selected, and conflicted branches where meaningful.
- [ ] Show branch name and concise pipeline summary on each node.
- [ ] Keep the graph navigable when there are many branches.
  Graph interactions
- [ ] Click a node to select that branch for editing.
- [ ] Create a child branch from the currently selected node.
- [ ] Rename and delete branches from the graph or its contextual controls.
- [ ] Add zoom, pan, and Fit to View.
- [ ] Prevent graph dragging from accidentally selecting or editing the wrong branch.
- [ ] Keep graph state synchronized with branch model state.
- [ ] Provide an accessible list or keyboard navigation alternative where practical.
  Merge visualization
- [ ] Make source and target clear before running a merge.
- [ ] Show merge relationship/result in the graph where appropriate.
- [ ] Distinguish ancestry/fork connectors from merge relationship connectors.
- [ ] Show a useful conflict indicator and details when a merge fails.
  Acceptance checks
- [ ] Graph accurately reflects branch parent/child relationships.
- [ ] Clicking any branch loads its correct pipeline.
- [ ] Newly created branches connect to the selected parent.
- [ ] The graph remains usable with nested branches and multiple siblings.
- [ ] Merges do not misrepresent source/target direction.
  Milestone 6 — Stage previews and comparison workspace
  Status: [ ] Not started
  Stage previews
- [ ] Make the Stage Previews section collapsible.
- [ ] Improve thumbnail sizing and labels.
- [ ] Make the currently displayed stage easy to identify.
- [ ] Keep Open in Editor behavior consistent.
- [ ] Clarify which stage is being added to comparison.
  Comparison workspace
- [ ] Improve occupied/empty slot visuals and selected-target state.
- [ ] Make Add vs Replace behavior unambiguous.
- [ ] Support up to four comparison slots.
- [ ] Keep full-resolution stage outputs in comparison snapshots.
- [ ] Make remove/clear actions easy to understand.
- [ ] Ensure comparison selection does not unexpectedly modify a branch pipeline.
- [ ] Confirm the correct source frame, branch, stage, and dimensions are displayed.
  Acceptance checks
- [ ] Add four different stage results and identify each one correctly.
- [ ] Replace and clear individual slots without affecting other slots.
- [ ] Confirm comparison results correspond to the selected stage and branch.
  Milestone 7 — Meow identity, favicon, and project-file icon strategy
  Status: [x] Completed
  Branding
- [x] Choose a consistent Meow logo/icon direction.
- [x] Create a browser favicon and suitable icon sizes for the page/mobile shortcuts.
- [x] Update the page title and metadata.
- [x] Add the logo to the application header without taking too much space.
- [x] Check that icons remain clear at small sizes and against the current theme.
  .meow file icon
- [x] Establish Meow PWA manifest with file_handlers association for .meow files and 256px file icon.
- [x] Embed thumbnail.png directly into saved .meow project ZIP archives for OS/viewer thumbnail extraction.
- [x] Document that a favicon does not by itself set the .meow icon in Windows Explorer without an OS registry handler.
- [x] Provide downloadable Windows .meow file icon installer package (.zip & standalone .bat) and website modal for one-click setup on user machines.
- [x] Keep .meow as a portable project archive regardless of the optional file-association approach.
  Acceptance checks
- [x] Page icon and header branding display correctly.
- [x] Branding assets are stored and referenced consistently.
- [x] File-icon expectations match the chosen deployment approach; no unsupported promise is made.
  Milestone 8 — .meow projects, annotations, and export reliability
  Status: [ ] Not started
  Project round-trip checks
- [ ] Save a project with a static image and reopen it.
- [ ] Save a project with a video and reopen it.
- [ ] Confirm source media is preserved.
- [ ] Confirm pipelines and branch ancestry are preserved.
- [ ] Confirm the active branch, selected operation, and relevant workspace settings are restored.
- [ ] Confirm annotations are preserved and remain positioned correctly.
- [ ] Test older supported schema versions and migration behavior.
- [ ] Test damaged archives, missing embedded media, invalid metadata, and unsupported media.
- [ ] Ensure errors leave the current workspace intact where practical.
  Annotation and image export
- [ ] Test pen, line, arrow, rectangle, ellipse, marker, and text labels.
- [ ] Test selection, moving, resizing, recoloring, deletion, undo, and redo.
- [ ] Confirm PNG export includes committed annotations.
- [ ] Confirm temporary selection handles and unfinished drawing previews are not exported.
- [ ] Test text labels and background colors at multiple image sizes.
  Acceptance checks
- [ ] Save/open round trip preserves expected state.
- [ ] Exported PNG matches the displayed processed/stage result and intended annotations.
- [ ] Invalid projects are rejected with useful messages instead of corrupting the open workspace.
  Milestone 9 — Performance, accessibility, regression testing, and documentation
  Status: [ ] Not started
  Performance and compatibility
- [ ] Test large images and videos within reasonable browser memory limits.
- [ ] Check frame extraction and ZIP export cancellation/recovery.
- [ ] Check cleanup/release of media object URLs and temporary OpenCV resources.
- [ ] Check the browser console for runtime errors and warnings caused by the implementation.
- [ ] Test current supported browsers, at minimum the project's primary target browser and one alternative.
- [ ] Check that UI updates do not make the canvas or branch graph sluggish.
  Accessibility and usability
- [ ] Verify keyboard focus and visible focus indicators for menus/dialogs.
- [ ] Give icon-only controls accessible labels/tooltips.
- [ ] Keep text contrast and control sizes readable.
- [ ] Verify menus/dialogs can be closed and navigated predictably.
  Documentation and release readiness
- [ ] Update README with current features and workflows.
- [ ] Document .meow save/open behavior and known size/browser limitations.
- [ ] Document branch creation and merge semantics.
- [ ] Document keyboard shortcuts.
- [ ] Update this tasklist as tasks are completed or newly discovered.
- [ ] Verify static hosting/build deployment succeeds.
  Acceptance checks
- [ ] No blocking console errors remain in the core workflow.
- [ ] Core image, video, pipeline, branch, annotation, comparison, save, and reopen workflows pass a manual regression pass.
- [ ] README and tasklist reflect the shipped state.
  Suggested working order

1. Implementation notes / discovered issues
   Use this section during implementation to record concrete files, bugs, test outcomes, and decisions.

- No implementation notes recorded yet.
  Change log
- Planning version 1: Created milestone-based roadmap and acceptance checklists. No source code changed.
