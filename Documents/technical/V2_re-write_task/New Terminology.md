> Read [📌README.md](./%F0%9F%93%8CREADME.md) in this folder for rewrite-task context before editing this document.

# New Terminology

## Engine Output Proposal

```json
{
  "Intents": [{
    "kind": "AddClaim | AddConnection | ChangeClaim | ChangeConnection | MoveClaim | RemoveConnection | RemoveClaim",
    "Changes": [{
      "kind": "ClaimAdded | ClaimRemoved | ClaimContentChanged | ClaimSideChanged | ClaimForceConfidenceChanged | ConnectorAdded | ConnectorRemoved | ConnectorSourceChanged | ConnectorTargetChanged | ConnectorAffectsChanged | ScoreAdded | ScoreRemoved | IncomingSourceInserted | IncomingSourceRemoved | IncomingSourcesResorted | ScoreClaimConfidenceChanged | ScoreReversibleClaimConfidenceChanged | ScoreConnectorConfidenceChanged | ScoreRelevanceChanged | ScoreScaleOfSourcesChanged"
    }]
  }]
}
```

## Score Confidence Clarification

- `claimConfidence` and `connectorConfidence` both live on `Score`.
- They are not stored on `Claim` or `Connector`.
- A propagated engine result may therefore emit both `ScoreClaimConfidenceChanged` and `ScoreConnectorConfidenceChanged` as separate ordered changes.
- The change kind names should stay explicit that these are score-field changes, even when the visible effect later applies to a claim card or a connector stroke.
- `ScoreReversibleClaimConfidenceChanged` should only remain if that field remains on `Score`.
- `ScoreAdded` and `ScoreRemoved` are still provisional and should be kept under review during implementation.

## Rules For Internal Derived Shapes

- The shared semantic model is only `Intents -> ordered Changes`.
- `Step`, `AnimationStep`, and any equivalent semantic container should not exist in the new design.
- Layout and GraphView may create internal derived shapes for their own work.
- Those internal derived shapes are implementation details, not contract data.
- Those internal derived shapes are not emitted as engine output.
- Those internal derived shapes are not persisted as semantic history.
- A renderer may choose `change groups` to run multiple changes at the same time.
- The order of `Changes` emitted by the engine is canonical and must not be reinterpreted or reordered by downstream stages.
- Propagation does not flow through internal derived shapes from one change group into the next change group.
- Each change group must start from the canonical engine-output state plus whatever metadata that stage derives for itself.
- If layout or GraphView need more information, prefer adding metadata to the relevant `Intent` or `Change` rather than adding a new shared container.
- We should only define internal layout or renderer shapes when implementation work makes them necessary.

## Pipeline Augmentation Rule

- Each stage may augment the same `Intent` and `Change` records with derived metadata needed by the next stage.
- That augmentation is allowed to flow forward through the pipeline.
- That augmentation must not introduce a new semantic container layer.
- That augmentation must not replace the canonical meaning of the original `Intent` or `Change`.
- That augmentation must be recomputable from the current canonical state and stage inputs.
- That augmentation should be treated as stage-owned metadata, not semantic history.
- Layout may add geometry and ordering metadata for renderer use.
- GraphView may add grouping, timing, interpolation, and draw-state metadata for its own use.
- If metadata is only useful inside one stage, keep it internal to that stage.
- If metadata is needed by the next stage, attach it to the existing records or to the forward-moving pipeline payload without adding a new semantic container.
- If metadata is coupled to a specific `Change.kind`, prefer explicit kind-specific metadata shapes instead of one broad optional property bag.
- A `Change.kind` should make it obvious which metadata shape is valid for that change.
- GraphView may group changes for presentation timing, but it must preserve engine-emitted change order.

## Proposed Layout Augmentations

```json
{
  "Intents": [{
    "kind": "...",
    "Changes": [{
      "kind": "...",
      "layout": {
        "affectedScoreIds": "ScoreId[]",
        "affectedConnectorIds": "ConnectorId[]",
        "direction": "sourceToTarget | targetToSource",
        "scoreLayouts": "optional",
        "connectorRoutes": "optional",
        "incomingOrder": "optional"
      }
    }]
  }]
}
```

- Minimum intent of this augmentation:
- `affectedScoreIds` and `affectedConnectorIds` tell GraphView what this change can touch.
- `direction` tells GraphView how the visible effect should travel when that matters.
- `scoreLayouts` gives the renderer the resolved claim geometry it needs for position and scale interpolation.
- `connectorRoutes` gives the renderer the resolved connector path and width geometry it needs.
- `incomingOrder` is only needed for changes that affect sibling ordering.
- Anything more detailed than this should be added only when implementation proves it is needed.

## Boundary Conditions

- Engine owns semantic intent and change meaning.
- Layout owns derived geometry, route, and ordering metadata.
- GraphView owns grouping, timing, and interpolation decisions.
- Layout should not invent new semantic change kinds.
- GraphView should not invent new semantic history.
- GraphView may choose which changes to run in the same change group.
- A change group boundary resets to canonical prior state plus approved forward metadata, not previous group's transient render state.
- If a layout augmentation only makes sense for some change kinds, that augmentation should be modeled explicitly for those kinds instead of appearing as optional fields on unrelated kinds.

## Seek And Skip Rule

- The design must support entering playback at any later change group without relying on transient internal state from earlier groups.
- Do not restore per-change `before` layout payloads by default.
- Preferred approach: derive and cache a committed boundary snapshot for each renderer change group during preparation.
- That boundary snapshot is derived data, not semantic history.
- Renderer transitions start from the last committed boundary snapshot and move toward the newly received augmented target state.
- If this proves insufficient during implementation, we can revisit explicit `before` payloads, but they are not the default design.