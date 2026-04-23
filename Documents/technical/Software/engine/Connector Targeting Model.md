# Connector Targeting Model

## Purpose

This note captures the connector-targeting rule that future engine, UI, persistence, and rendering changes should all preserve.

## Naming

The connector families are named for their semantic effect:

- `ConfidenceConnector` carries confidence toward a target claim
- `RelevanceConnector` carries relevance toward a target confidence connector

## Model

A claim may connect to:

- another claim through a `ConfidenceConnector`
- an existing `ConfidenceConnector` through a `RelevanceConnector`

A `RelevanceConnector` may not target another `RelevanceConnector`.
Secondary relevance chains are invalid authored state.

## Decisions

1. Keep one exported `Connector` union, but make `ConfidenceConnector` and `RelevanceConnector` first-class contracts.
2. Use semantic connector discriminants:
   - `confidence`
   - `relevance`
3. Add subtype-specific connector ids:
   - `ConfidenceConnectorId`
   - `RelevanceConnectorId`
4. Narrow `RelevanceConnector.targetConfidenceConnectorId` to `ConfidenceConnectorId`.
5. Split command connection inputs the same way so caller-supplied ids stay aligned with the connector variant being created.
6. Keep runtime storage flat in this pass:
   - `Debate.connectors` stays `Record<ConnectorId, Connector>`
   - `Score.connectorId` stays `ConnectorId | undefined`
7. Enforce the invariant at runtime whenever a target connector is resolved from existing state, because `Score.connectorId` alone does not carry the subtype.

## Mental Model

- `ConfidenceConnector` is the primary structural connector. It contributes confidence and may be targeted.
- `RelevanceConnector` is a secondary connector attached to a `ConfidenceConnector`. It contributes relevance and may not be targeted.
- Valid authored connector nesting depth is one secondary relevance level.

## Engine Contract Impact

- `src/00-entities/Connector.ts`
  - define semantic connector contracts
  - add subtype-branded connector ids
  - narrow the relevance target field to `targetConfidenceConnectorId`
- `src/01-Commands.ts`
  - export separate confidence and relevance connection input variants
  - align each variant with the correct connector id type
- `src/02-Planner.ts`
  - reject relevance creation when the targeted score has no connector
  - reject relevance creation when the targeted score resolves to a `RelevanceConnector`
- `src/04-Reducer.ts`
  - reject adding a `RelevanceConnector` unless its target exists and is `confidence`
- `src/00-entities/Score.ts`
  - no shape change in this pass

## Downstream Guidance

- Command authoring and UI
  - only offer relevance-targeted actions for scores that came from `ConfidenceConnector`
  - treat relevance creation as attaching to an existing confidence edge, not as a general connector pick
- Persistence and import/export
  - keep the flat connector collection for now
  - validate that every serialized `RelevanceConnector.targetConfidenceConnectorId` points to a serialized `ConfidenceConnector`
- Rendering and graph views
  - treat `ConfidenceConnector` values as targetable primary edges
  - treat `RelevanceConnector` values as secondary attachments to those edges
  - never render or author a `RelevanceConnector` as a legal target for another `RelevanceConnector`
- Traversal and query helpers
  - do not assume every `ConnectorId` is a legal relevance target
  - narrow to `ConfidenceConnector` before following a relevance-targeted relationship

## Non-Goals For This Pass

- splitting `Debate.connectors` into separate collections
- renaming `source` to `sourceClaimId`
- changing `Score` projection fields
- allowing connector-to-connector chains longer than one relevance level
