# Glossary

## Display

### Components

- Claim - a statement that can be supported or attacked by other claims.
- Aggregator - a display shape representing where source confidences or relevances combine to produce the score of the target claim. An aggregator can still exist in the snapshot even when the display does not need to show it. It attaches flush to a side of its target, matches the length of that target side, and extends outward from that side by its current depth. A delivery aggregator attaches to the relevant side of a claim. A relevance aggregator attaches to the relevant side of a junction and is the target shape for incoming relevance connectors. Aggregators with zero or one incoming connectors can remain collapsed to zero depth, which can make them appear absent even though connectors still target that side.
- Display Relevance Connector - a line connecting a relevance claim to the relevance aggregator of the confidence connection it affects. Visually it lands on the edge of that relevance aggregator that faces the relevance claim, and it meets that edge with the same slope as that edge. A claim that affects relevance sits on the connector lane of the confidence connection it affects. Optional `targetSideOffset` can shift that target attachment along the chosen edge. If multiple relevance connectors land on the same relevance-aggregator edge, they follow the shared [Connector Stacking](../../design/debate-animation-data-model.md#connector-stacking) rules. If there is only one relevance claim, the relevance aggregator may remain hidden or collapsed, which can make the connector look like it is landing directly on the junction in the current example orientation.
- Display Confidence Connector - the visible part of a confidence relationship before the junction. It runs from the confidence source claim to the source-facing edge of the junction and appears when a junction is shown.
- Junction - the visible structure on a confidence connection between the Display Confidence Connector and the Delivery Connector. The junction is a different display item from the relevance aggregator. The junction is visible whenever at least one relevance claim affects that confidence connection, even if the relevance aggregator remains hidden because there is only one incoming relevance item. The planner authors the junction size directly: how wide the relevance landing span is, how thick the incoming confidence side is, and how thick the outgoing delivery side is.
- Delivery Connector - a line carrying the confidence from the source side toward the target claim. When a junction is shown, it starts at the target-facing edge of that junction. At the target side, it ends on the delivery aggregator attached to the claim. In the snapshot, connector end positions are derived from the connected claims, junctions, delivery aggregators, and relevance aggregators. Optional `targetSideOffset` shifts the delivery connector's target attachment along the resolved target edge. If multiple delivery connectors land on the same delivery-aggregator edge, they follow the shared [Connector Stacking](../../design/debate-animation-data-model.md#connector-stacking) rules. If `targetSideOffset` is omitted, it is treated as zero. When the delivery aggregator is collapsed to zero depth, the connector can look like it is landing directly on the claim.

#### Connector Parts

- Source Stub
- Target Stub
- Curve

### Lanes

Vertical spaces on the graph for different types of components.

- Claim Lane - the space claims occupy. Claims are ordered vertically within this lane.
- Junction Lane - the space set aside for the junction and the confidence connector before the junction. Relevance connectors land in this lane, and the relevance aggregator is positioned in this lane. This lane space may not be present if nothing is using it.
- Connector Curve Lane - the space set aside for the curved portions of connectors.
- Connector Diagonal Lane - the space set aside for the diagonal portions of connectors.

Relevance claims are positioned in the connector lane of the confidence connection they affect.

### Concepts

- Main Claim - the claim that is the root (sink) of the graph and is the primary claim being supported or attacked.
- Pro Main - purple color indicating this claim/connector eventually would support the main claim.
- Con Main - orange color indicating this claim/connector eventually would attack the main claim.

## Data Processing

- Command
- Operation
- Step
- Planner - the component that takes the current DebateCore state the current Snapshot, and a command and produces a series of snapshots representing the steps to animate from the current snapshot to the display state implied by applying the command to the DebateCore state.
  - Planner Config
- Snapshot - a data structure representing the state of the display graph between two unknown points in time. most values well be Tweenable.

## Steps

- Voila
- Sprout
- First Fill
- Wave
- Relevance Connector Adjust
- Relevance Aggregator Adjust
- Confidence Connector Adjust
- Junction Adjust
- Delivery Connector Adjust
- Delivery Aggregator Adjust
- Claim Adjust
- Scale
- Order

## Connector Visualization Layers

- Pipe Wall Layer
- Pipe Interior Layer
- Fluid Layer - visual fill representing the connector's current numerical confidence value

## Describing Traversing a Graph / Tree

- Wave
- Step

## Animation Transition Types

- Progressive
- Uniform Path
- Instant

## Debate Core State

The debate core state is the underlying data structure representing the claims and their relationships. It is the authoritative current state. It is separate from the display and may have fewer structures. That separation means the DebateCore does not depend on display-only structures. The display and planner may still depend on the DebateCore to derive visual state. In the core, connectors directly connect to other connectors or claims without the extra display structures like junctions, aggregators, or delivery connectors.

- Claim
- Core Confidence Connector - a connector from one claim directly to another claim.
- Core Relevance Connector - a connector from a claim to a Core Confidence Connector.
