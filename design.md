# Aura-Vision interface system

Hallmark v2.0.0, app scope. Baseline 940ebbce2633a88322eec789ddb2c9943511caa5.

## Intent

The camera and its recognition transcript are the product. Preserve the existing recognition modes, quota and activation flow. Replace ornamental scanning, glass and cyan-purple gradients with a solid charcoal instrument and one restrained cyan accent.

## System

- Semantic colors and fonts are declared once in `src/index.css` at `:root`.
- Content is capped at 1280px. Desktop pairs the real viewfinder with the transcript; below 900px they stack in reading order.
- The viewfinder owns its camera permission failure. A failed camera does not visually hide the whole application.
- Product title, mode controls, result name and transcript have distinct weights. Cyan identifies primary actions and the viewfinder boundary; long results use plain high-contrast text.
- Real visitor counts and the author contact remain in a quiet footer. No new metrics or testimonials.
- Secondary actions, input states and activation dialogs use the same solid surfaces. Focus is immediate, touch controls are at least 44px tall; the compact switch has a 44px transparent hit area.
- The hidden processing canvas is decorative for accessibility. The live video intentionally has no poster: prerecorded imagery would misrepresent the device stream.
- Reduced-motion stops all animation and transitions. Streaming content remains visible by default.

## Preservation and verification

Keep all existing refs, props, handlers, forms, model request/stream parsing hooks, quota keys and activation service calls. No storage or backend migration. Verify camera-ready and denied states, automatic/manual mode, pending and streamed results, rejected activation and successful activation. Use synthetic camera streams and local request fixtures for browser checks; only real-device testing establishes actual camera behavior.
