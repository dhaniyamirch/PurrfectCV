# PurrfectCV

A browser-based computer vision studio for image &amp; video processing, visual pipelines, segmentation, morphology, FFT, wavelets, analysis, and lightweight ML.


## Navigation and layout cleanup

The current UI groups secondary actions into File, Edit, View, Branches, Settings, and Help menus. The top-level menu and layout visibility rules live in `css/menus.css`; the existing CSS filenames and load order were retained, with that file appended last. The most-used view-mode controls remain directly above the viewer. Annotation controls are collapsed until opened. Tools, inspector, statistics, stage previews, and (when a video is loaded) the video timeline can be hidden through the View menu. Video-only timeline and frame-export controls are shown only after video frame extraction completes.


## Zoom controls and image centring update

Zoom In, Zoom Out, and Fit now live inside the editor's viewer toolbar rather than the global View menu. The toolbar displays the current zoom percentage. The viewer positioning code compensates for the canvas wrapper's flex centring so the fit position is applied once, and zoom in/out use the viewer centre as their anchor. The image is re-centred at the current zoom when workspace panels are toggled.
