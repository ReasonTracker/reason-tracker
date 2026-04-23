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
8. Derive node width, node height, and spacing from `score.scaleOfSources`.
9. Clamp preview geometry to a small visible minimum so zero-scale scores still produce inspectable boxes.
10. Pack vertically with a bottom-up subtree-height pass.
11. Center each parent inside its subtree block.
12. Recompute exported bounds from the final positioned rectangles.

## Relevance Handling

- Relevance connectors target the middle of a confidence connector, not the claim box.
- That means the relevance claim shares the same visual layer as the confidence claim whose connector is being targeted.
- The first implementation still does not emit virtual relevance anchor nodes.
- The first Episode 1 preview renders claim boxes only.
- Connector lines and relevance routing stay out of scope for this pass.
- Future routing work can attach connector geometry to the same node frames without replacing the packing pass.

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
- connector line geometry
- virtual relevance-node rendering
- crossing-minimization heuristics
- multi-parent join support
