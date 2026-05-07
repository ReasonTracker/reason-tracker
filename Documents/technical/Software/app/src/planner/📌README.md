# 📌 Planner

## Current Boundary

- The planner currently works from the pre-command `DebateCore` state plus the command payload.
- The planner owns settled snapshot generation from `DebateCore`; callers do not pass a snapshot into the planner.
- For the current first-scope `claim/add` confidence flow, the planner is expected to apply the command before building the settled post-command display state.
- Planner-facing math should stay DebateCore-shaped. The planner should consume DebateCore-first math entrypoints for score, side, and source-scale derivation rather than constructing a separate scoring adapter layer.

## Command Contract Status

- The current debate-core command payloads are behind the current planner and connector architecture.
- Further planner implementation should start from a reviewed command-contract proposal instead of stretching the old payload shapes.
- A likely long-term direction is to replace the overloaded add-claim flow with distinct command contracts for confidence-attached claim creation and relevance-attached claim creation, but that shape is not approved yet.
- Because debate-core owns exported command contracts, make a concrete proposal and get approval before changing those payloads.
- Favor the best long-term architectural boundary here, not the smallest patch that gets one planner case moving.

## Current Scope

- first implementation target: `confidence/claim/add`
- current animation cutoff: `firstFill`
- The current settled snapshot builder still assumes one visible occurrence per reusable claim id. Multi-occurrence display support needs a separate snapshot and renderer contract update.

## Current Layout Decisions

- `ClaimViz.scale` is the propagated full-pipe render scale for that claim occurrence at `100%` score.
- `ClaimViz.sourcesScale` is the owned source-side potential scale for that claim occurrence and is the master size value for settled layout sizing. `scale` may animate separately from it.
- Current `score` changes fluid fill inside that authored scale. Current `score` does not directly shrink the pipe or claim diameter.
- `claimLaneAxisGap` is an edge-to-edge gap, not a center-to-center distance.
- That gap resolves at the same local `sourcesScale` as the surrounding geometry.
- In the current orientation, claim boxes are left-justified within the claim-lane band.
- Sibling source claims form local clusters that stay mostly centered on their source claim when surrounding constraints permit it.

<!-- autonav:start -->
<!-- autonav:end -->
