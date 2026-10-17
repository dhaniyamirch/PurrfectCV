# PurrfectCV

A browser-based computer vision studio for image &amp; video processing, visual pipelines, segmentation, morphology, FFT, wavelets, analysis, and lightweight ML.


## Navigation and layout cleanup

The current UI groups secondary actions into File, Edit, View, Branches, Settings, and Help menus. The top-level menu and layout visibility rules live in `css/menus.css`; the existing CSS filenames and load order were retained, with that file appended last. The most-used view-mode controls remain directly above the viewer. Annotation controls are collapsed until opened. Tools, inspector, statistics, stage previews, and (when a video is loaded) the video timeline can be hidden through the View menu. Video-only timeline and frame-export controls are shown only after video frame extraction completes.


## Zoom controls and image centring update

Zoom In, Zoom Out, and Fit now live inside the editor's viewer toolbar rather than the global View menu. The toolbar displays the current zoom percentage. The viewer positioning code compensates for the canvas wrapper's flex centring so the fit position is applied once, and zoom in/out use the viewer centre as their anchor. The image is re-centred at the current zoom when workspace panels are toggled.


## Stage output preview update

Stage preview cards now use larger thumbnails, identify source/processing/merge output stages, and show the active branch name. Each card keeps explicit Open and Compare actions; Compare targets the currently selected comparison slot and indicates whether that slot will be added or replaced. The comparison workspace itself is the next separate milestone.

## Recent milestone update — branch correctness and comparison controls

- Stage preview cards now keep their `Add to slot N` / `Replace slot N` actions visible on short viewports.
- Comparison actions name the destination slot, and the selected slot can be changed in the Comparison Workspace before adding a stage.
- Branch controls display the merge source and active target explicitly.
- Branch switching, creation, deletion, and merging are blocked while a processing operation is running.
- Three-way merge-base lookup now supports nested ancestor/descendant branches when a valid saved fork snapshot exists, while refusing to guess when sibling snapshots disagree.

Browser interaction testing is still required, especially for filling all four comparison slots with different stage outputs.


## Visual branch timeline (Issue 5)

A connected Branch timeline can be opened from the Stage previews heading. It draws parent/fork connectors from the saved branch ancestry and aligns pipeline steps across branch rows. Selecting a branch label switches the active pipeline; selecting a stage node opens that stage in the main editor. The graph uses cached thumbnails for branches that have already been processed during the current session; an unvisited branch shows a preview placeholder until it is selected and processed. These preview caches are temporary and are not saved in `.meow` projects. Advanced graph-native create/rename/delete, merge connectors, and zoom/pan controls remain future work.


## Branch output merging

Branch merging offers two distinct kinds of action:

- **Pipeline merge:** Auto-merge compatible edits, Append source pipeline, or Replace active pipeline. These change the active target pipeline.
- **Image output merge:** Blend, Add, Bitwise OR/AND/XOR, Masked Composite, or Choose Output. These compare the processed output from the active target branch with the selected source branch and display a non-destructive merged result; the original branch pipelines remain available. Both branch outputs must have matching dimensions.

For Masked Composite, the source branch output acts as a luminance mask: bright pixels select the active target output, and dark pixels retain the source output. Choose Output displays either the active target output or the source branch output.

## Video timeline

Video-only timeline and frame controls stay hidden for images and appear after a video is loaded and frame extraction completes. Use **View → Hide/Show Video Timeline** to reclaim workspace space.

## Complete `.meow` projects

Version 4 project archives include original media, pipelines and branch ancestry, active branch, output-merge settings, annotations, viewer settings, timeline/graph visibility, and occupied comparison-slot snapshots. Versions 1–3 remain supported for opening older projects. Browser-based project archives have a 500 MiB source-media limit and a 550 MiB total archive limit.


## Interactive node workspace
The node workspace provides freely movable source, operation, branch, and merge nodes. Drag an operation from the left tool palette into the workspace to add it at that location. Drag a node by its header to rearrange the diagram. Drag a node output port to another block input port to reorder the active branch pipeline. Node positions are included in `.meow` project saves. Pipeline execution still follows each branch's ordered operation list; arbitrary user-wired multi-input graph execution is a future architecture step.
