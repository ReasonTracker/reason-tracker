# 📌 Path Geometry

This folder owns shared path-geometry contracts and implementation that are intended to be reused across component consumers.

## Core Idea

- Input: a routed centerline path defined by ordered points.
- Input also includes an ordered instruction list that describes section states, transition spans, and edge extremities.
- Output: renderer-agnostic path geometry commands for a drawable shape around that path.
- Geometry is constructed from stable offsets states, transition spans, and edge extremities over a routed reference path.
- The builder returns renderer-agnostic commands for the two geometry boundaries plus diagnostic issues.

## Owns

- `buildPathGeometry`
- shared type contracts that describe path-geometry inputs and outputs
- future path-geometry-adjacent helpers that stay specific to this rendering slice

## Human Review Status

- API types in this area have been reviewed by a human.
- The implementation code in this area has not yet been reviewed by a human.

## Responsibilities

- create drawable band geometry in relation to a routed reference path
- support stable offsets states between edge extremities
- support asymmetric sections that are not centered on the path
- support explicit transition ranges between offsets states
- support explicit extremity ranges that begin or end geometry at chosen positions along the path
- measure transition positions as path-relative percentages and transition or extremity spans in pixels along the routed path
- output renderer-agnostic path commands that a consumer can map to SVG or another renderer

## Input Model

- The path is defined by ordered waypoints.
- Geometry along that path is described by an ordered instruction list.
- The instruction sequence starts with an `extremity` instruction and ends with an `extremity` instruction.
- Between the two edge extremities, stable section states are expressed by `offsets` instructions.
- A `transition` instruction sits between two `offsets` instructions and describes how the active section morphs from the earlier offsets state into the later one.
- An `extremity` instruction belongs to the start or the end of the instruction sequence.
- A leading `extremity` controls how visible geometry begins along the path, and a trailing `extremity` controls how visible geometry ends along the path.

## Instruction Semantics

- An `offsets` instruction carries `offsetA` and `offsetB`.
- `offsetA` and `offsetB` are intentionally agnostic names.
- Both offsets are signed distances from the reference path and may lie on opposite sides or the same side.
- An `offsets` instruction defines a stable section state between transitions and extremities.
- A `transition` instruction uses `startPositionPercent` and `lengthPx` because it occupies a path range that begins at a path-relative position and extends for a pixel length.
- A `transition` instruction should declare a transition kind such as `linear`.
- An `extremity` instruction uses `startPositionPercent` to declare where its visible edge behavior begins or ends along the path.
- An `extremity` instruction should declare an extremity kind such as `open` or `linear`.
- A `linear` extremity uses `collapseOffset` to expand from or collapse toward a chosen target offset.
- A leading `linear` extremity expands from `collapseOffset` across its `lengthPx` span beginning at `startPositionPercent`.
- A trailing `linear` extremity collapses toward `collapseOffset` across its `lengthPx` span beginning at `startPositionPercent`.
- A leading `open` begins visible geometry at `startPositionPercent` with no `lengthPx` span or collapse behavior.
- A trailing `open` ends visible geometry at `startPositionPercent` with no `lengthPx` span or collapse behavior.
- `startPositionPercent` is measured as a percentage of total path length, and `lengthPx` is measured in pixels along the routed centerline.
- A linear extremity uses `collapseOffset` to define the edge shape across its span.

## Validation Rules

- Instructions should be ordered as a valid path sequence from the start edge to the end edge.
- Extremity instructions are valid only at the start and end of the sequence.
- The first drawable state after a leading extremity should be established by an `offsets` instruction.
- A `transition` instruction requires active offsets before it and a following offsets instruction after it.
- A leading `extremity` instruction requires a following offsets instruction.
- A trailing `extremity` instruction requires active offsets before it.
- A leading `extremity` may begin after 0% and may consume a `lengthPx` span after its `startPositionPercent` before the first stable offsets state becomes fully active.
- A trailing `extremity` may begin before 100% and defines where visible geometry ends.
- `open` does not have a `lengthPx` because it cannot have a span.
- Out-of-range `startPositionPercent` values and negative or oversized `lengthPx` values are clamped into the routed path length and reported as warnings.
- Terminal behavior should be expressed through an `extremity` instruction.

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