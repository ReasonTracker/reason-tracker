# 📌 Command Translator

## Purpose

This folder holds the command-to-operation translation boundary for the engine.

Use this folder for translator contracts and nearby translator implementation once that work starts.
Keep reducer behavior elsewhere.

The translator boundary is stateless.
It should receive existing engine state explicitly rather than storing mutable translation state internally.

## Owns

- the `CommandTranslator` contract
- engine operation contracts emitted from commands
- nearby translator-specific files that stay focused on command batches and emitted operation groups

## Stateless Rule

`CommandTranslator` should take the existing `Debate` state as input.
Do not design translator instances around retained per-debate or per-run state.

It should return grouped translation results that pair the original one-or-more commands with the corresponding emitted operations.

## Does Not Own

- reducer behavior
- state mutation rules
- timeline storage

## Current Scope

## Example Process

An EngineCommand batch is sent to the Planner, for example `AddClaimCommand` with an existing Debate state. These are the effects we expect to see in the UI and how they align with the operations emitted from the Planner:

1. Include the original EngineCommand so later systems can reference it for intent.
2. The UI will display the new claim in its final location but at 0 scale. As it grows to its target scale, the UI will animate the other claims moving out of the way. (see AddClaimOp in 03-Operations.ts)
3. The new connector line will grow from the new claim to its target claim. (see ConnectClaimAnimationOp in 03-Operations.ts)
4. The target claim's confidence will adjust in value and animate to the new confidence level. (see ClaimScoreAnimationOp in 03-Operations.ts)
5. The connector between that claim and its target will animate to the new thickness level. (see ConnectorScoreAnimationOp in 03-Operations.ts)
6. The Planner will traverse the graph upward, emitting a ConnectorScoreAnimationOp and ClaimScoreAnimationOp for each connector and claim it passes through, until the main claim is reached.
7. The scaling might have changed, so do a final pass to ensure all claims are at the correct scale and position. (see ScaleUpdateOp in 03-Operations.ts)

## Related Docs

- [Src](../📌README.md)
- [Engine](../../📌README.md)

<!-- autonav:start -->
<!-- autonav:end -->
