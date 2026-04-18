# 📌 Path Geometry

This folder owns shared path-geometry contracts and implementation that are intended to be reused across component consumers.

## Core Idea

- Input: a routed centerline path defined by ordered points.
- Output: renderer-agnostic path geometry commands for a drawable band shape around that path.
- Shapes are constructed as bands between two offsets from the centerline.
- Geometry is open at the start and end of the path.

## Owns

- `buildPathGeometry`
- shared type contracts that describe path-geometry inputs and outputs
- future path-geometry-adjacent helpers that stay specific to this rendering slice

## Human Review Status

- API types in this area have been reviewed by a human.
- The current implementation code in this area has not yet been reviewed by a human.

## Responsibilities

- create drawable band geometry in relation to a routed reference path
- support a distinct width change at a specific point along the path (with a short transition)
- support asymmetric bands that are not centered on the path
- output renderer-agnostic path commands that a consumer can map to SVG or another renderer

## Out Of Scope

- layout or routing
- collision avoidance
- multi-line coordination
- rendering concerns such as SVG, canvas, or host-specific drawing APIs

## Boundaries

- Keep Remotion runtime hooks out of this folder.
- Keep higher-level component composition out of this folder unless it is specific to path geometry.
- Prefer colocating the core contracts with `buildPathGeometry` until this slice clearly needs more separation.

---

<!-- autonav:start -->
<!-- autonav:end -->