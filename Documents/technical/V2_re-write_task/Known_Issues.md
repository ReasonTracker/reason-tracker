> Read [📌README.md](./%F0%9F%93%8CREADME.md) in this folder for rewrite-task context before editing this document.

# V2 Known Issues And Unrequested Additions

## Purpose

This file tracks known bugs, regressions, partial parity gaps, and added complications that were not explicitly requested.

## Current Known Issues

## Animation

- Connector growth is currently wired for add-flow staging, but shrink and update phases are not yet fully translated into distinct Remotion behavior.
- Per-change propagation timing is not yet fully separated for every `Change` record; some connector width/path changes still resolve together rather than as individually staged updates.
- Latest staged add behavior has compile validation but still needs manual Studio verification after each major animation change.

## Graph Parity

- Exact v1 parity for connector geometry may still be limited by the current abstract layout output. If richer source/target anchor metadata is needed, layout may need to emit more geometry.
- Relevance-line growth currently shares the same generic growth mechanism as other lines, but exact parity with the old dashed-line behavior may still need refinement.

## Process / Tooling

- The `contracts` package does not currently expose a standalone `tsconfig.json`, so contract changes are validated transitively through dependent packages instead of by a package-local typecheck.

## Unrequested Or Risky Additions To Watch

- Avoid moving medium-specific timing heuristics back into `renderHtml` or episode scripts.
- Avoid adding parallel grouped handoff types when the forward-extending pipeline payload can be extended instead.
- Avoid decorative visual additions that were not present in the v1 reference unless they are explicitly requested.