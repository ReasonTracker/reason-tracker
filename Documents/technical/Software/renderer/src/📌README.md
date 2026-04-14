# 📌 Src

This package owns HTML-renderer data shapes and HTML-facing output adapters.

## Boundaries

- The engine owns graph calculation and layout geometry.
- This package maps domain data plus layout geometry into an internal HtmlRenderer scene.
- HTML output adapters should consume the scene model rather than recalculate graph geometry.
- Do not move canonical graph order or layout source-of-truth fields into renderer contracts.

## Near-Term Plan

- Keep the first public API small.
- Prefer one public HTML render entrypoint.
- Keep the HtmlRenderer scene builder internal unless another package truly needs it.