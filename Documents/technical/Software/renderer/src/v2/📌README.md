This folder contains the side-by-side V2 renderer path.

## Boundary

- Keep this folder isolated from the legacy step-based renderer files.
- Consume V2 engine layout output and V2 intent/change records directly.
- Preserve the renderer's role as a projection layer; do not move canonical graph or layout ownership here.
