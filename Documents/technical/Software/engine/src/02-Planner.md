# 📌 Planner

## Purpose

This folder holds the planner boundary for the engine.

Use this folder for planner contracts and nearby planner implementation.
Keep reducer behavior elsewhere.

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

- reducer behavior
- state mutation rules
- timeline storage

## Current Scope

Current implemented scope:

- `debate/create`
- `debate/update`
- `claim/add`
- `claim/update`
- `claim/delete`
- `connector/create`
- `connector/delete`
- score-targeted translation via `targetScoreId` so non-root claims may have multiple projected score occurrences
- connector meaning derived from connector type:
  - `claim-to-claim` contributes confidence
  - `claim-to-connector` contributes relevance
- one root score is still expected for `mainClaimId`

## Example Process

An EngineCommand batch is sent to the Planner, for example `AddClaimCommand` with an existing Debate state. The command targets a specific projected score occurrence using `targetScoreId`.

- For `claim-to-claim`, the planner derives the canonical `targetClaimId` from that target score.
- For `claim-to-connector`, the planner derives the canonical `targetConnectorId` from the target score's `connectorId`.

The planner emits grouped structural operations rather than animation-specific instructions. Those structural operations can later drive reducers, animation planners, or other downstream systems.

1. Include the normalized EngineCommand so later systems can reference the resolved ids and authored intent.
2. Emit structural add, update, or delete operations for claims, connectors, and scores.
3. Recalculate the affected projected score occurrences upward through the projected graph.
4. Emit `ScoreUpdated` patches for any surviving score whose structure or calculated values changed, including `incomingScoreIds`, confidence values, relevance, and `scaleOfSources`.

## Related Docs

- [Src](../📌README.md)
- [Engine](../../📌README.md)

<!-- autonav:start -->
<!-- autonav:end -->
