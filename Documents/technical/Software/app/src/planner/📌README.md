# 📌 Planner

## Current Boundary

- The planner currently works from the pre-command `DebateCore` state plus the command payload.
- For the current first-scope `claim/add` confidence flow, the planner is expected to apply the command before building the settled post-command display state.

## Command Contract Status

- The current debate-core command payloads are behind the current planner and connector architecture.
- Further planner implementation should start from a reviewed command-contract proposal instead of stretching the old payload shapes.
- A likely long-term direction is to replace the overloaded add-claim flow with distinct command contracts for confidence-attached claim creation and relevance-attached claim creation, but that shape is not approved yet.
- Because debate-core owns exported command contracts, make a concrete proposal and get approval before changing those payloads.
- Favor the best long-term architectural boundary here, not the smallest patch that gets one planner case moving.

## Current Scope

- first implementation target: `claim/add` with a confidence connection
- current animation cutoff: `firstFill`

<!-- autonav:start -->
<!-- autonav:end -->
