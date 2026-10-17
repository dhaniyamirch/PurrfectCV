# Meow Application & .meow File Extension Icons

This folder contains the application identity and `.meow` file extension icon assets:

- `meow-thumbnail.png`: The original uploaded thumbnail art.
- `meow-thumbnail-transparent.png`: Transparent cutout optimized for dark/light editor themes.
- `meow-file-icon.png`: 256x256 square padded icon used for OS and PWA file extension handlers (`.meow`).
- `icon-512.png`: 512x512 high-resolution app icon.
- `icon-192.png`: 192x192 mobile/PWA home screen icon.
- `favicon-32x32.png`: 32x32 browser tab icon.
- `favicon-16x16.png`: 16x16 classic bookmark / address bar icon.
- `../favicon.ico`: Multi-resolution ICO for browsers.

## .meow File Association
1. **Web / PWA**: Configured in `assets/manifest/manifest.webmanifest` under `file_handlers` for `.meow` files (`application/x-meow-project`).
2. **Project Archives**: Every `.meow` file saved by the editor automatically embeds `thumbnail.png` inside the root of the ZIP archive for file managers and preview extractors.

