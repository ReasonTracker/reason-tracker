This folder contains the side-by-side V2 video translation layer.

## Boundary

- Keep this folder isolated from the legacy GraphView implementation.
- Consume only the V2 engine and V2 contract surfaces for graph semantics.
- Reuse generic presentation helpers only when they are not step-model specific.
