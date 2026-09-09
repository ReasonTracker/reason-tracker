# Glossary

## Display

### Components

- Claim - a statement that can be supported or attacked by other claims.
- Aggregator - a display shape representing where source confidences or relevances combine to produce the score of the target claim. It attaches flush to a side of its target, matches the length of that target side, and extends outward from that side by its current depth. A delivery aggregator attaches to the relevant side of a claim and is visible whenever the claim has at least one incoming confidence connector. A relevance aggregator attaches to the relevant side of a junction and is the target shape for incoming relevance connectors. Relevance aggregators with zero or one incoming connectors can remain collapsed to zero depth.
- Display Relevance Connector - a line connecting a relevance claim to the relevance aggregator of the confidence connection it affects. Visually it lands on the edge of that relevance aggregator that faces the relevance claim, and it meets that edge with the same slope as that edge. A claim that affects relevance is still positioned through the normal claim-lane model rather than through a separate connector-lane claim path. Optional `targetSideOffset` can shift that target attachment along the chosen edge. If multiple relevance connectors land on the same relevance-aggregator edge, they follow the shared [Debate Animation Data Model Design](../../design/debate-animation-data-model.md#connector-stacking) rules. If there is only one relevance claim, the relevance aggregator may remain hidden or collapsed, which can make the connector look like it is landing directly on the junction in the current example orientation.
- Display Confidence Connector - the visible part of a confidence relationship before the junction. It runs from the confidence source claim to the source-facing edge of the junction and appears when a junction is shown.
- Junction - the visible structure on a confidence connection between the Display Confidence Connector and the Delivery Connector. The junction is a different display item from the relevance aggregator. The junction is visible whenever at least one relevance claim affects that confidence connection, even if the relevance aggregator remains hidden because there is only one incoming relevance item. The planner authors the junction size directly: how wide the relevance landing span is, how thick the incoming Display Confidence Connector side is, and how thick the outgoing Delivery Connector side is. Relevance can make that outgoing Delivery Connector side wider or narrower than the incoming Display Confidence Connector side.
- Delivery Connector - a line carrying the confidence from the source side toward the target claim. When a junction is shown, it starts at the target-facing edge of that junction. At the target side, it ends on the delivery aggregator attached to the claim. Connector endpoints are derived from shared typed attachment ports on the connected claims, junctions, and aggregators. Optional `targetSideOffset` shifts the delivery connector's target attachment along the resolved target edge. If multiple delivery connectors land on the same delivery-aggregator edge, they follow the shared [Debate Animation Data Model Design](../../design/debate-animation-data-model.md#connector-stacking) rules. If `targetSideOffset` is omitted, it is treated as zero.

#### Connector Parts

- Source Stub
- Target Stub
- Curve

### Lanes

- Lane - a layout band. In the current orientation, a lane is a vertical band. A lane has a position and width on the cross-lane axis, and items inside it are arranged along the lane axis.
- Lane Axis - the axis that runs along a lane. In the current orientation, this maps to `y`.
- Cross-Lane Axis - the axis that separates lanes from each other. In the current orientation, this maps to `x`.
- Claim Lane - the lane used for claim visuals. Claims in a claim lane are ordered along the lane axis. In the current orientation, claim boxes are left-justified within the claim-lane band rather than centered across that band.
- Junction Lane - the lane reserved for the junction and the confidence connector before the junction. Relevance connectors land in this lane, and the relevance aggregator is positioned in this lane. This lane may not be present if nothing is using it.
- Connector Curve Lane - the lane reserved for one curved connector segment.
- Connector Diagonal Lane - the lane reserved for one diagonal connector segment.

Relevance claims use the same claim-lane positioning model as the other claim visuals in the source claim cluster they belong with.

### Shared Ordering

- Shared Ordering - the single ordering rule used both for sibling claim order and for target-edge connector stack order.
  Group siblings first by target relationship with `proTarget` items before `conTarget` items. Within each group, use the same deterministic source-position-driven order with a stable tie-breaker. The claim order and connector stack order must match so lines do not cross.

### Layout Spacing

- Claim Lane Axis Gap - the edge-to-edge gap between sibling claim boxes along a claim lane. It is resolved at the same local `sourcesScale` as the surrounding geometry, so the same local shape stays proportional when zoomed and shrinks or grows with the source-side potential scale.
- Delivery Connector Corridor - the cross-lane corridor reserved for a delivery connector. It is expressed as `connectorCurveLaneWidth + connectorDiagonalLaneWidth + connectorCurveLaneWidth`, and adds `junctionLaneWidth` when the junction lane is occupied. The whole corridor resolves at local `sourcesScale`.
- Source Claim Cluster - the local group of sibling source claims attached to one target. The cluster follows the shared ordering rule and stays mostly centered on the source claim it belongs with when surrounding constraints permit it.

### Concepts

- Main Claim - the claim that is the root (sink) of the graph and is the primary claim being supported or attacked.
- Potential Scale - the full visual size of a claim or connector if it were showing `100%` score. This is what `scale` and `sourcesScale` represent.
- Actual Score - the current standing value. It controls fluid fill and contributes to the shared sibling-base calculation, but does not independently resize one sibling.
- Sibling Base Scale - the common pre-relevance scale for direct confidence children: `parentCapacity / max(1, totalDeliveryContributionWeight)`.
- Delivery Contribution Weight - one child's authoritative delivered amount, normally `childScore × relevanceMultiplier`.
- Parent Fluid Share - `deliveryContributionWeight / max(1, totalDeliveryContributionWeight)`, used as the child's target-edge fluid interval width relative to parent capacity.
- Target Fluid Interval - one ordered child's positive-width interval or zero-width point in the centered delivery-fluid stack.
- Natural Zero Position - the ordered cursor point retained by a zero-fluid child; its shell is positioned with the same continuous formula used for a positive interval.
- Pro Main - purple color indicating this claim/connector eventually would support the main claim.
- Con Main - orange color indicating this claim/connector eventually would attack the main claim.

## Data Processing

- Command
- Operation
- Step
- Planner - the component that takes the pre-command DebateCore state and a command, builds the settled display state implied by applying that command, and authors scalar frames and animation tracks used to animate toward that state.
  For the current implementation boundary, the DebateCore input is the pre-command state. The planner applies the command before building the settled display state it animates toward.
  Planner-facing math should stay DebateCore-shaped, so the planner should consume DebateCore-first math entrypoints rather than building a separate scoring adapter layer.
  - Planner Config
- Debate Frame - the fully resolved scalar state of every visible claim and connector at one point in an animation. A frame contains no host-specific timing or tween values.
- sourcesScale - the owned potential scale budget for a claim's own source side. For the direct confidence children of the same target, math solves one shared child `sourcesScale` from the target-owned budget and the direct confidence children's current scored delivery demand. Each direct confidence child's current scored delivery demand is that child's continuous relevance multiplier multiplied by that child's current score value. Each direct confidence child claim uses that same shared child `sourcesScale`, so the sibling claims stay equal while the whole sibling group grows or shrinks together. Direct relevance children inherit the affected confidence connection's shared child `sourcesScale` unchanged. Each direct confidence child's outgoing Delivery Connector scale and junction outgoing side use that same shared child `sourcesScale` multiplied by that child's continuous relevance multiplier. Current score still controls the fluid fraction inside each authored pipe, and it also participates in solving the sibling group's shared base scale.

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

The same shared ordering rule applies to compact sibling-claim positions and to target-edge connector stack positions.

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
