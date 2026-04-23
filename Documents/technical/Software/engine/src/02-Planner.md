# 📌 Planner

## Purpose

This folder holds the planner boundary for the engine.

Use this folder for planner contracts and nearby planner implementation.
Keep reducer behavior in [`04-Reducer.ts`](./04-Reducer.ts).

The planner boundary is stateless.
It should receive existing engine state explicitly rather than storing mutable planner state internally.

## Owns

- the `Planner` contract
- engine operation contracts emitted from commands
- nearby planner-specific files that stay focused on command batches and emitted operation groups

## Stateless Rule

`Planner` should take the existing `Debate` state as input.
Do not design translator instances around retained per-debate or per-run state.

It should return grouped translation results that pair the original one-or-more commands with the corresponding emitted operations.

## Does Not Own

- reducer behavior in [`04-Reducer.ts`](./04-Reducer.ts)
- state mutation rules
- timeline storage

## Current Scope

Current implemented scope:

- `debate/create`
- `debate/update`
- `claim/add`
- `claim/update`
- `claim/delete`
- `confidence/connect`
- `relevance/connect`
- `confidence/disconnect`
- `relevance/disconnect`
- score-targeted translation via `targetScoreId` so non-root claims may have multiple projected score occurrences
- connector meaning derived from connector type:
  - `confidence` contributes confidence
  - `relevance` contributes relevance
- `relevance` targets are limited to existing `confidence` connectors
- disconnect commands remove the targeted projected occurrence together with dependent projected descendants and attached `relevance` occurrences when applicable
- `claim/delete` removes the claim plus all projected occurrences rooted at that claim
- one root score is still expected for `mainClaimId`

## Example Process

An EngineCommand batch is sent to the Planner, for example `AddClaimCommand` with an existing Debate state. The command targets a specific projected score occurrence using `targetScoreId`.

- For `confidence`, the planner derives the canonical `targetClaimId` from that target score.
- For `relevance`, the planner derives the canonical `targetConfidenceConnectorId` from the target score's `connectorId`, and that connector must be `confidence`.

The planner emits structural operations rather than animation-specific instructions. Those structural operations can later drive the engine reducer in [`04-Reducer.ts`](./04-Reducer.ts), animation planners, or other downstream systems.

Traversal terminology:

- A `wave` is the full traversal of one command's effect through the projected score graph.
- A `step` is one frontier advance within that wave.
- A step is not a single node or a single edge.
- One step may update multiple score occurrences when parallel branches advance together.

1. Include the normalized EngineCommand so later systems can reference the resolved ids and authored intent.
2. Emit structural add, update, or delete operations for individual claims, connectors, and score occurrences.
3. Emit at most one `incomingScoresChanged` operation after the structural changes, carrying every `ScoreIncomingPatch` whose `incomingScoreIds` membership changed because a source score was added or removed.
4. Traverse the projected score graph from the affected score occurrences rather than calculating all changes first and ordering them later.
5. Emit one `ScoreUpdated` operation for each upward confidence or relevance step.
6. `ScoreUpdated` carries `ScorePatch[]`, and those patches do not include `incomingScoreIds` or `scaleOfSources`.
7. After the upward steps finish for the current command, recompute canonical incoming score ordering from the settled impacts.
8. Emit at most one `incomingScoresSorted` operation for that reordering, carrying every changed `ScoreIncomingPatch`.
9. Canonical incoming score order is `proTarget` before `conTarget`, then descending `abs(connectorConfidence) * relevance`, with ties keeping the current order.
10. After sorting finishes for the current command, recompute `scaleOfSources` for the whole projected score graph.
11. Emit at most one `scaleOfSources` operation for that recomputation, containing every changed `ScoreScalePatch` in the graph.
12. `scaleOfSources` carries `ScoreScalePatch[]`, which only update `scaleOfSources`.
13. `incomingScoresChanged`, `ScoreUpdated`, and `incomingScoresSorted` remain ordered as separate animation phases within the wave, while `scaleOfSources` is a whole-graph recomputation step rather than one operation per downward step.

## Related Docs

- [Reducer](./04-Reducer.ts)
- [Src](../📌README.md)
- [Engine](../../📌README.md)

<!-- autonav:start -->
<!-- autonav:end -->
