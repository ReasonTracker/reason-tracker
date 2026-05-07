# Debate Core Command Contract Proposal

## Status

Pending approval. This file is a design proposal for the next debate-core command-contract pass, not the current implemented contract.

## Problem

The current command contracts lag behind the current connector entity model.

- connector entities already carry explicit target fields
- `claim/add` cannot identify what the new claim attaches to
- `confidence/connect` and `relevance/connect` still hide the target fields even though the connector entities already own them
- the planner boundary is pre-command `DebateCore` plus command payload, so command application needs enough information to construct the resulting entities directly

The architectural problem is not just a missing field. The commands currently duplicate connector semantics in a thinner parallel shape, so the command layer drifts out of sync with the owned connector contracts.

## Recommendation

Replace the current overloaded add-claim flow with connector-specific add-claim commands, and align connect commands with the owned connector create contracts.

### Proposed command direction

```ts
import type { ConfidenceConnectorCreate, RelevanceConnectorCreate } from "./Connector.ts";
import type { ClaimCreate } from "./Claim.ts";

export interface AddConfidenceAttachedClaimCommand {
  type: "confidence/claim/add";
  claim: ClaimCreate;
  connector: Omit<ConfidenceConnectorCreate, "source">;
}

export interface AddRelevanceAttachedClaimCommand {
  type: "relevance/claim/add";
  claim: ClaimCreate;
  connector: Omit<RelevanceConnectorCreate, "source">;
}

export interface ConnectConfidenceCommand {
  type: "confidence/connect";
  connector: ConfidenceConnectorCreate;
}

export interface ConnectRelevanceCommand {
  type: "relevance/connect";
  connector: RelevanceConnectorCreate;
}
```

## Why this shape

- It restores the real invariant: connector target semantics are owned by connector contracts, not by a parallel command-only surrogate.
- It removes the missing-target blocker for planner command application.
- It makes the confidence and relevance add-claim flows explicit instead of overloading one command that hides materially different target types.
- It keeps add-claim commands from redundantly carrying `source`, because the source is always the claim being created.
- It lets connect commands describe the actual connector being created, which is the real mutation.
- It preserves optional connector ids and optional claim ids without inventing a second id policy.

## Execution semantics

- For `confidence/claim/add`, create the claim first, resolve its id, then create a confidence connector whose `source` is that claim id.
- For `relevance/claim/add`, create the claim first, resolve its id, then create a relevance connector whose `source` is that claim id.
- For `confidence/connect`, create the confidence connector exactly from the command payload.
- For `relevance/connect`, create the relevance connector exactly from the command payload.

## Naming note

This proposal intentionally uses `connector` instead of `connection` in the command payload so the command contract directly references the owned entity shape.

## Recommended cleanup in the same pass

- remove `ClaimConnectionInput`
- remove `ConfidenceConnectionInput`
- remove `RelevanceConnectionInput`
- remove `ConnectClaimCommandBase`
- replace `AddClaimCommand` with connector-specific add-claim commands
- rename the connect command interfaces to match the connector-specific structure above

## Approval needed

Before implementation, approve or revise:

- the split into `confidence/claim/add` and `relevance/claim/add`
- the use of `connector` payloads derived from connector create contracts
- the removal of the older parallel connection-input types
