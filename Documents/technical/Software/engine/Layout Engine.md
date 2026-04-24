# Layout Engine

## Purpose

The layout engine converts one reduced `Debate` state into deterministic box geometry for score occurrences.
It outputs sizes and `x`/`y` coordinates only.
Visual design, animation timing, connector drawing, and line routing stay downstream.

## Layout Unit

- The layout unit is a score occurrence, not a unique claim id.
- Each rendered box corresponds to one `Score` and uses that score's claim content.
- The root is the main-claim score occurrence with no parent occurrence.

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
9. Use the same exported base node height and layout scale for claim height and connector potential width.
10. Scale horizontal depth spacing directly by the previous layer's `score.scaleOfSources`; do not apply a spacing floor, interpolation, or visible-preview adjustment to horizontal column gaps.
11. If a target depth contains one or more relevance-connected score occurrences, double the horizontal spacing into that depth so connector junctions have room to route.
12. Pack vertically with a bottom-up subtree-height pass.
13. Center each parent inside its subtree block.
14. Recompute exported bounds from the final positioned rectangles.

## Relevance Handling

- Relevance connectors target a connector junction on a confidence connector, not the claim box.
- The relevance claim shares the same visual layer as the confidence claim whose connector is being targeted.
- Connector widths are renderer-owned world-unit measurements; rendered layout node dimensions do not feed connector width or confidence width calculations.
- Claim height and connector potential width share `BASE_NODE_HEIGHT_PX` and `toLayoutScale(score.scaleOfSources)`.
- The connector junction is drawn as a framed box around the routing join.
- The connector junction's height is the confidence connector's rendered potential pipe width.
- The connector junction's width is the relevance connector's rendered potential pipe width.
- The connector junction sits in front of the confidence source claim, about one-quarter of the connector path from that source claim toward the target claim.
- A relevance connector enters the connector junction from the top when its source is above the connector junction and from the bottom when its source is below the connector junction.
- The confidence connector is rendered as two connector segments: source claim to connector junction, then connector junction to target claim.
- Other confidence connectors into the same target use the connector-junction confidence connector's second segment as their turn guide: they start bending when that segment starts bending and return to the target when that segment returns.
- The connector junction is a routing construct and does not replace the score occurrence as the layout unit.
- At 100% connector confidence, the rendered actual confidence width matches the rendered potential pipe width because both are calculated from the same connector world unit and connector scale.

## Output Contract

The first implementation should expose:

- one positioned node per score occurrence
- the score id and claim id for each node
- claim content for preview rendering
- structural parent id and layout parent id for each node
- depth, width, height, `x`, and `y`
- final layout bounds recomputed from the positioned nodes

## Non-Goals

- animation interpolation
- connector line geometry ownership
- connector junctions as score/layout units
- crossing-minimization heuristics
- multi-parent join support
