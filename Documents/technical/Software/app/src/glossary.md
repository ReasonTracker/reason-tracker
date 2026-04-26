# Glossary

## Display

### Components

- Claim - a statement that can be supported or attacked by other claims.
- Aggregator - a display of how the source confidences (and relevances) combine to produce the confidence of the target claim. It might be called a junction aggregator when just before a junction or a claim aggregator when just before a claim, but it is the same structure.
- Display Relevance Connector - a line connecting a claim to a junction aggregator to show how the relevance source claim affects the relevance of the source confidence claim on the target claim. If there is only one relevance claim, the junction aggregator may not be visible.
- Display Confidence Connector - the visible part of a confidence relationship before the junction. It shows how the confidence source claim affects the confidence of the target claim. Will not be visible if there is no junction.
- Junction - a visible structure between the Display Confidence Connector and Delivery Connector where relevance connectors are aggregated through the junction aggregator to show their effect on the confidence being delivered by the Display Confidence Connector. Will not be visible if there are no relevance claims.
- Delivery Connector - a line carrying the confidence from the source side toward the target claim. When visible, it starts at the junction if there is one; otherwise it appears to start directly from the source claim.

#### Connector Parts

- Source Stub
- Target Stub
- Curve

### Lanes

Vertical spaces on the graph for different types of components.

- Claim Lane
- Junction Lane
- Connector Lane
  - Source Stub
  - Curve Lane
  - Target Stub

### Concepts

- Main Claim - the claim that is the root (sink) of the graph and is the primary claim being supported or attacked.
- Pro Main - purple color indicating this claim/connector eventually would support the main claim.
- Con Main - orange color indicating this claim/connector eventually would attack the main claim.

## Data Processing

- Command
- Operation
- Step
- Planner
  - Planner Config
- Snapshot

## Steps

- Voila
- Sprout
- First Fill
- Wave
- Relevance Connector Adjust
- Junction Aggregator Adjust
- Confidence Connector Adjust
- Junction Adjust
- Delivery Connector Adjust
- Claim Aggregator Adjust
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

The debate core state is the underlying data structure representing the claims and their relationships. It is separate from the display and may have fewer structures. In the core, connectors directly connect to other connectors or claims without the extra display structures like junctions, aggregators, or delivery connectors.

- Claim
- Core Confidence Connector - a connector from one claim directly to another claim.
- Core Relevance Connector - a connector from a claim to a Core Confidence Connector.
