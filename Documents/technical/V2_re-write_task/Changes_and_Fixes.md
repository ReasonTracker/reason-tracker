> Read [📌README.md](./%F0%9F%93%8CREADME.md) in this folder for rewrite-task context before editing this document.

# V2 Intentional Changes And Fixes

## Purpose

This file tracks intentional v1 to v2 changes or fixes that should not be accidentally reverted during parity work.

## Architecture

- The pipeline is moving toward one grouped payload that is passed forward and extended by each stage instead of duplicating overlapping grouped request/result objects.
- The abstract side owns semantic steps, changes, layout data, and renderer-agnostic animation-step metadata.
- `renderHtml` is intentionally HTML-specific and should not become the owner of Remotion timing or video staging logic.
- `GraphView` is intentionally the Remotion translation layer that consumes abstract pipeline facts and produces medium-specific timing.

## Graph Rendering

- Remotion timeline markers use `layout="none"` so non-visual `Sequence` records do not create full-screen inspection blockers.
- Graph wrapper clipping was removed so the centered/scaled graph is not incorrectly cut off by a viewport wrapper that did not exist in the old behavior.
- Claim rendering was moved closer to the old shell -> scaled shape -> body structure.
- Target-side connector placement was updated to use ordered stacked anchors instead of collapsing multiple connectors onto one target point.
- Connector rendering now uses separate reference and actual strokes to better match the old visual model.

## Animation Model

- The abstract side now has an `AnimationStep` surface for renderer-agnostic presentation substeps that are smaller than a `Change`.
- Add-flow animation is being split into `score enter` followed by `connector grow` rather than treating the whole add as one undifferentiated visual event.
- Graph animation moved away from a single generic interpolation pass toward staged claims-versus-connectors handling, closer to the old behavior.

## Data Ownership

- `Score.incomingScoreIds` remains the canonical owner of displayed incoming order.
- Incoming insertion and later sorting should preserve the canonical order model rather than introducing duplicate ordering sources.