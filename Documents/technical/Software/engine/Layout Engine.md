# Layout Engine

## Purpose

The layout engine converts one reduced `Debate` state into deterministic box geometry for score occurrences.
It outputs claim box geometry, connector route geometry, connector junction geometry, and final graph bounds.
Visual styling, animation timing, and SVG band drawing stay downstream.

## Layout Unit

- The layout unit is a score occurrence, not a unique claim id.
- Each rendered box corresponds to one `Score` and uses that score's claim content.
- The root is the main-claim score occurrence with no parent occurrence.
- Connector routes and connector junctions are layout-owned geometry, not score occurrences.

## Input Assumptions

- The reducer or planner has already settled canonical sibling order.
- The score graph is treated as a tree for layout.
- The main claim is the single visual anchor.
- The same input must always produce the same output.

## First-Pass Rules

1. Preserve the provided `incomingScoreIds` ordering.
2. Do not reorder siblings for crossing reduction.
3. Place source claims to the right of their targets.
4. Confidence-connected claims advance one visual layer to the right.
5. Relevance-connected claims stay in the same visual layer as the confidence claim whose connector they target.
6. A relevance-connected claim is a visual sibling of that targeted confidence claim, even if it remains a structural child in the reduced score tree.
7. Left-justify each depth to one shared column start.
8. Derive node width and node height from the shared layout scale of `score.scaleOfSources`.
9. Use the same exported base node height and layout scale for claim height and the confidence source span's potential width.
10. Scale horizontal depth spacing directly by the previous layer's `score.scaleOfSources`; do not apply a spacing floor, interpolation, or visible-preview adjustment to horizontal column gaps.
11. If a target depth contains one or more relevance-connected score occurrences, double the horizontal spacing into that depth so connector junctions have room to route.
12. Pack vertically with a bottom-up subtree-height pass.
13. Center each parent inside its subtree block.
14. Compute confidence stack centers from actual confidence widths after node positions are known.
15. Compute connector routes and connector junctions after stack centers are known.
16. Recompute exported bounds from the final positioned boxes, connector routes, and connector junctions.

## Connector Span Terms

- A confidence connector has a **source span** from the source claim to the connector junction.
- A confidence connector has a **delivery span** from the connector junction to the target claim.
- A confidence connector with no attached relevance connector is represented as one delivery span from source claim to target claim.
- The source span uses the source score's `scaleOfSources` and is not multiplied by that score's relevance.
- The delivery span uses the source score's `deliveryScaleOfSources`.
- `deliveryScaleOfSources` is `scaleOfSources * relevance` for the score carried by the confidence connector.
- A full pro relevance produces a relevance multiplier of `2`.
- A full con relevance produces a relevance multiplier of `0.5`.
- Claim boxes use the source span scale, so relevance changes resize the delivery span without resizing the source claim or source span.
- Actual confidence width is the span's potential width multiplied by connector confidence.
- Potential width is not an input to actual-confidence stack height or stack centering.
- Actual-confidence stack height is the sum of actual confidence widths.
- The total actual-confidence stack is centered on the target occurrence's layout center.

## Relevance Handling

- Relevance connectors target a connector junction on a confidence connector, not the claim box.
- The relevance claim shares the same visual layer as the confidence claim whose connector is being targeted.
- Connector widths are layout-owned world-unit measurements.
- Claim height and the confidence source span's potential width share `BASE_NODE_HEIGHT_PX` and `toLayoutScale(score.scaleOfSources)`.
- The connector junction is drawn as a tapered four-sided frame around the routing join.
- The connector junction's left side height matches the confidence delivery span potential width.
- The connector junction's right side height matches the confidence source span potential width.
- The connector junction's width is the relevance connector's rendered potential pipe width.
- The connector junction sits in front of the confidence source claim, about one-quarter of the connector path from that source claim toward the target claim.
- A relevance connector enters the connector junction along the tapered top edge when its source is above the connector junction and along the tapered bottom edge when its source is below the connector junction.
- The confidence connector is rendered as two connector spans: source span, then delivery span.
- Other confidence connectors into the same target use the connector-junction confidence connector's delivery span as their turn guide: they start bending when that span starts bending and return to the target when that span returns.
- The connector junction is a routing construct and does not replace the score occurrence as the layout unit.
- At 100% connector confidence, a span's actual confidence width matches that span's potential pipe width because both are calculated from the same base node height and span scale.

## Output Contract

The first implementation should expose:

- one positioned node per score occurrence
- zero or more routed connector spans
- zero or more connector junctions
- the score id and claim id for each node
- claim content for preview rendering
- structural parent id and layout parent id for each node
- depth, width, height, `x`, and `y`
- final layout bounds recomputed from positioned nodes, routed connector spans, and connector junctions

## Non-Goals

- animation interpolation
- connector junctions as score/layout units
- crossing-minimization heuristics
- multi-parent join support
