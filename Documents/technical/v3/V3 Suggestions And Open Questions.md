# V3 Suggestions And Open Questions

## Purpose

This document persists working suggestions, follow-up ideas, and open questions discovered while processing the V3 proposal.

Use this page to carry context across sessions without turning the proposal itself into a running log.
When an item is settled and moved into durable docs or implementation, remove it from this page.

## Open Questions

- What reference frame should a claim connection use at authoring time: relative to the target claim, relative to the main claim, or both?
- If claim-target and connector-target connections stay as separate command paths, should moving across those target types remain delete-and-recreate, or later become a first-class move operation?
- What is the minimal operation model needed after the command boundary: translator plus operations plus reducer, or a simpler execution path first?

## Claim Move Decision Matrix

This matrix is a working scaffold for the question: when an existing claim is moved to a new target, what should the default result be?

The shorthand below intentionally follows the current discussion, even though the terminology is not settled yet.
Connector-state semantics are still unresolved, so this matrix is only for claim-state reasoning at the moment.

Rows are the source claim's current state before the move.
Columns are the new target claim's state after the move.
Each cell should eventually capture the default move behavior without prompting the user on every move.

| Source \ New target | `main/pro` | `main/con` | `target/pro` | `target/con` |
| --- | --- | --- | --- | --- |
| `main/pro` | `TBD` | `TBD` | `TBD` | `TBD` |
| `main/con` | `TBD` | `TBD` | `TBD` | `TBD` |
| `target/pro` | `TBD` | `TBD` | `TBD` | `TBD` |
| `target/con` | `TBD` | `TBD` | `TBD` | `TBD` |

Questions this matrix is meant to force:

- Which authored claim states are actually valid and stable enough to persist?
- When a move happens, what should stay authored, what should be recomputed, and what should remain system-determined without an extra user prompt?

## Next Good Candidates

- Turn the claim move decision matrix into real default behaviors once the valid authored state set is clearer.
- Define the smallest useful post-command execution model without overcommitting to names too early.