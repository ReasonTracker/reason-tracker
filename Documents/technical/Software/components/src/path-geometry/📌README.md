# 📌 Path Geometry

This folder owns shared path-geometry contracts and implementation that are intended to be reused across component consumers.

## Owns

- `buildPathGeometry`
- shared type contracts that describe path-geometry inputs and outputs
- future path-geometry-adjacent helpers that stay specific to this rendering slice

## Boundaries

- Keep Remotion runtime hooks out of this folder.
- Keep higher-level component composition out of this folder unless it is specific to path geometry.
- Prefer colocating the core contracts with `buildPathGeometry` until this slice clearly needs more separation.

---

<!-- autonav:start -->
<!-- autonav:end -->