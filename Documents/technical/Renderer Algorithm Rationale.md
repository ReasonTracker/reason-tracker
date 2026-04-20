# Renderer Algorithm Rationale

This document explains why the renderer layout algorithm was designed the way it is.
It focuses on business and product reasoning, not low-level implementation details.

## Problem Being Solved

Reason Tracker debates are directed claim graphs with one main sink claim.
Those graphs may contain cycles.

For rendering and human review, cycles create UX problems:

- back-propagating lines are hard to read
- crossings make causal interpretation ambiguous
- repeated mental context switching reduces trust in what the user is seeing

The renderer must provide an optional way to present the same debate in an easier-to-follow acyclic form without rewriting the source debate.

## Product Requirements Behind The Design

1. Preserve original model as source of truth.
- Rendering must not mutate the debate data.

2. Support two user intents.
- Some users want fidelity to the original cyclic structure.
- Some users want a cleaner DAG-style reading path.

3. Keep one package boundary for output.
- Layout preparation and web output belong to one renderer package.
- Internal separation still matters, but users consume one feature package.

4. Keep concept count low.
- Naming and structures should stay close to claim/connector/debate language.
- Avoid introducing unnecessary abstractions when contracts already provide the domain vocabulary.

## Why `cycleMode` Exists

`cycleMode` is an explicit product control, not just a technical switch.

- `preserve`: show structure as modeled (maximum fidelity)
- `unroll-dag`: prioritize readability by producing an acyclic layout view

This keeps behavior intentional and visible at call sites.

## Why Sink-First Unrolling

The chosen mental model is to traverse from the main claim (sink) toward supporting/attacking leaves.

Business reasons:

- aligns with how users read arguments: start from the main claim, then inspect support/attack chains
- gives a stable visual anchor for all render modes
- improves explainability in reviews because each branch is interpreted as "why this main claim has this score"

## Why Duplicate Appearances Are Allowed

When unrolling, the same claim may appear more than once in different branches.

Reason:

- this preserves context-specific contribution paths
- it avoids deleting information just to force acyclicity
- it prevents misleading "single position" assumptions for claims that participate in multiple causal routes

In short: duplicates in view are preferred over information loss in source semantics.

## Why No Repeat Inside A Branch

A claim is not repeated within the same root-to-leaf branch during unroll.

Reason:

- guarantees branch-local acyclicity by construction
- avoids infinite expansion in self-referential loops
- keeps each branch interpretable as a finite argument chain

## Why Deterministic Ordering Matters

Deterministic traversal and ordering are required for:

- stable screenshots and docs
- reproducible tests
- reliable diffs in code review
- user trust when the same input is rendered repeatedly

Non-deterministic layouts make quality and correctness harder to validate.

## Why Scores Are Referenced, Not Recomputed

Unrolled appearances reuse the score of the underlying claim.

Reason:

- renderer is a presentation layer, not a scoring engine
- recomputation in renderer would create divergence risk with engine semantics
- keeps accountability clear: engine computes, renderer presents

## Why Layout Logic And Web Output Are Separated Internally

Even within one renderer package, layout and web emission remain separate concerns.

Reason:

- layout decisions should be reusable by any output technology
- web output should translate decisions, not redefine them
- this lowers future migration cost (other render targets) without splitting package ownership

## Why This Is Not In `AGENTS.md`

`AGENTS.md` is agent-steering policy.
This rationale is shared technical design documentation and belongs in docs.

A pointer from `AGENTS.md` to coding/design docs is appropriate; duplicating design rationale there is not.

## Decision Summary

- Keep source debate unchanged.
- Expose explicit cycle behavior via `cycleMode`.
- Use sink-first unroll for DAG view.
- Allow cross-branch duplicates to preserve context.
- Block within-branch repeats.
- Fail-fast beyond 2x appearance growth.
- Keep deterministic output.
- Keep renderer package single, with internal separation of layout and web output.
