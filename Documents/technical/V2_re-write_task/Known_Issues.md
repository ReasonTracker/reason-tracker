> Read [📌README.md](./%F0%9F%93%8CREADME.md) in this folder for rewrite-task context before editing this document.

# V2 Known Issues And Unrequested Additions

## Purpose

This file tracks known bugs, regressions, partial parity gaps, and added complications that were not explicitly requested.

## Current Known Issues

## Animation

- Connector growth is currently wired for add-flow staging, but shrink and update phases are not yet fully translated into distinct Remotion behavior.
- Per-change propagation timing is not yet fully separated for every `Change` record; some connector width/path changes still resolve together rather than as individually staged updates.
- Latest staged add behavior has compile validation but still needs manual Studio verification after each major animation change.

| Phase | Change category | Should cause layout shift? | Does current code cause layout shift? | Where it should happen / notes |
| --- | --- | --- | --- | --- |
| New claim grown from zero size while the other nodes/lines move out of the way | Positional update + insert visual | Yes | Yes | This is the right place for the initial positional/layout shift. The new claim can grow here while nearby claims and connector targets make room. |
| New line grows over to B | Connector visual update | No | Usually no claim shift, but connector target geometry can already reflect the shifted layout from the prior step | This should stay a connector-only growth step after the initial insert/layout move has already established the new slot. |
| B's confidence value rises | Confidence score update | No | Yes | This should be display-only. Do not automatically call `set scale based on confidence` here. Update the shown confidence value only. |
| B's line to Main grows in width | Scale update + connector width update | No positional claim shift | Yes | This is where an explicit `set scale based on confidence` / scale recalculation should run for the affected score path, followed by connector width change. Keep claim position frozen here. |
| Main claim confidence rises | Confidence score update | No | Yes | This should also be display-only. The confidence text/value can change here without triggering scale or layout. |

- Working split for later implementation: treat confidence score updates, positional/layout updates, and scale updates as separate categories.
- Current problem: `GraphView` base interpolation starts moving claims as soon as the next snapshot exists, so confidence-display steps are currently dragging layout and scale changes with them.
- Recommended sequencing for this scenario:
	1. Insert visual plus positional/layout shift for the new claim entering the stack.
	2. Connector growth from the new claim to B.
	3. For each reached node in the propagation wave: apply the confidence score update first as its own visible change.
	4. Immediately after that same node's confidence change, run the explicit scale update and any required layout update for that node before moving on to the next reached node.
	5. The change set should therefore loop confidence -> scale and/or layout -> next confidence, so size and position propagate through the graph intentionally instead of being lumped into one generic update.

## Graph Parity

- Exact v1 parity for connector geometry may still be limited by the current abstract layout output. If richer source/target anchor metadata is needed, layout may need to emit more geometry.
- Relevance-line growth currently shares the same generic growth mechanism as other lines, but exact parity with the old dashed-line behavior may still need refinement.

## Process / Tooling

- The `contracts` package does not currently expose a standalone `tsconfig.json`, so contract changes are validated transitively through dependent packages instead of by a package-local typecheck.

## Unrequested Or Risky Additions To Watch

- Avoid moving medium-specific timing heuristics back into `renderHtml` or episode scripts.
- Avoid adding parallel grouped handoff types when the forward-extending pipeline payload can be extended instead.
- Avoid decorative visual additions that were not present in the v1 reference unless they are explicitly requested.