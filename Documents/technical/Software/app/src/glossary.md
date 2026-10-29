# Glossary

## Display

### Components

- Claim - a statement that can be supported or attacked by other claims.
- Delivery Aggregator - a trapezoid display shape attached flush to a claim's children-facing side. It represents the summed relevance effect on that claim's delivery. Its claim-side edge matches the claim box height, its children-side edge is `claimHeight * sourcesScale`, and its top and bottom sides slant equally. Each slanted side is as long as the sum of the widths of the incoming Relevance Connectors, unless that would make it steeper than 45°; then it lengthens to run at 45°. Positive net relevance flares it toward the claim and negative net relevance flares it toward the children; zero net relevance makes it a rectangle. Incoming Delivery Connectors continue through it to the claim, scaled by the ratio of its claim-side edge to its children-side edge. It is shown only when relevance is attached to the claim's outgoing confidence connection.
- Display Relevance Connector - a line connecting a relevance claim to the bottom edge of the delivery aggregator of the claim whose delivery it affects. It meets that edge perpendicular to the edge. Its width is the relevance claim's box height. A claim that affects relevance is positioned through the normal claim-lane model. `targetSideOffset` places the landing point along the bottom edge; multiple relevance connectors are centered side by side along that edge, with the nearest relevance claim landing farthest from the claim.
- Delivery Connector - the visible confidence relationship, carrying confidence from the source claim to the target claim. It starts at the source claim and ends on the target claim's delivery aggregator when one is shown, otherwise on the target claim itself. Its width is the source claim's box height. Connector endpoints are derived from shared typed attachment ports on the connected claims and aggregators. `targetSideOffset` side-anchors the full delivery shell around its parent-fluid interval. A newly added confidence connection retains that stack cursor and fluid-side anchor while its staging and Sprout wall tapers toward its current delivered fluid width. During Sprout, the delivery reveals an already-authored full-route taper, so previously revealed wall geometry retains its width. During First Fill, settled shell width replaces that taper behind a moving handoff that has the same calculated span as the fluid cap; the original taper remains ahead until the handoff reaches it. Existing delivery connections are not given this temporary taper. If multiple delivery connectors land on the same delivery-aggregator edge, they follow the shared [Debate Animation Data Model Design](../../design/debate-animation-data-model.md#connector-stacking) rules. If `targetSideOffset` is omitted, it is treated as zero.

#### Connector Parts

- Source Stub
- Target Stub
- Curve

### Lanes

- Lane - a layout band. In the current orientation, a lane is a vertical band. A lane has a position and width on the cross-lane axis, and items inside it are arranged along the lane axis.
- Lane Axis - the axis that runs along a lane. In the current orientation, this maps to `y`.
- Cross-Lane Axis - the axis that separates lanes from each other. In the current orientation, this maps to `x`.
- Claim Lane - the lane used for claim visuals. Claims in a claim lane are ordered along the lane axis. In the current orientation, claim boxes are left-justified within the claim-lane band rather than centered across that band.
- Connector Curve Lane - the lane reserved for one curved connector segment.
- Connector Diagonal Lane - the lane reserved for one diagonal connector segment.

Relevance claims sit in the column to the right of the claim whose delivery they affect, stacked below that claim's confidence children.

### Shared Ordering

- Shared Ordering - the single ordering rule used both for sibling claim order and for target-edge connector stack order.
  Group siblings first by target relationship with `proTarget` items before `conTarget` items. Within each group, use the same deterministic source-position-driven order with a stable tie-breaker. The claim order and connector stack order must match so lines do not cross.

### Layout Spacing

- Claim Lane Axis Gap - the edge-to-edge gap between sibling claim boxes along a claim lane. It is resolved at the same local `sourcesScale` as the surrounding geometry, so the same local shape stays proportional when zoomed and shrinks or grows with the source-side potential scale.
- Delivery Connector Corridor - the cross-lane corridor reserved for a delivery connector. Its width is `(connectorCurveLaneWidth + connectorDiagonalLaneWidth + connectorCurveLaneWidth) * largest rendered scale among the target claim's confidence children and relevance claims in that column * CONNECTOR_COLUMN_WIDTH_MULTIPLIER (1.5)`, plus the target claim's delivery-aggregator width. `connectorCurveLaneWidth` also caps the straight run at each connector end; `connectorDiagonalLaneWidth` reserves width for the slanted middle. A claim without attached relevance has zero aggregator width.
- Claim Column - the confidence children of one claim followed by the relevance claims that affect that claim's delivery. Confidence children prefer the center of their matching delivery-stack port; the first relevance claim prefers to sit just below the delivery aggregator. Entries retain that order, then use constrained packing against horizontal contours of their rendered subtrees, including claims, aggregators, and routed connectors.

### Concepts

- Main Claim - the claim that is the root (sink) of the graph and is the primary claim being supported or attacked.
- Potential Scale - the full visual size of a claim or connector if it were showing `100%` score. `sourcesScale` is a claim's base potential scale and `scale` is its box potential scale after relevance.
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
- sourcesScale - the base potential scale of a claim occurrence. For the direct confidence children of the same target, math solves one shared base scale from the target-owned budget and the direct confidence children's current scored delivery demand. Each direct confidence child's current scored delivery demand is that child's continuous relevance multiplier multiplied by that child's current score value. Each direct confidence child and each relevance claim affecting the target's delivery uses that same shared base scale, so siblings stay equal while the whole group grows or shrinks together. A claim's box `scale`, its outgoing Delivery Connector, and the claim-side edge of its delivery aggregator use its base scale multiplied by its continuous relevance multiplier. A claim's own `sourcesScale` is also the budget for its children and the children-side edge of its delivery aggregator. Current score still controls the fluid fraction inside each authored pipe, and it also participates in solving the sibling group's shared base scale.

## Steps

- Voila
- Sprout
- First Fill
- Wave
- Relevance Connector Adjust
- Confidence Connector Adjust
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

The debate core state is the underlying data structure representing the claims and their relationships. It is the authoritative current state. It is separate from the display and may have fewer structures. That separation means the DebateCore does not depend on display-only structures. The display and planner may still depend on the DebateCore to derive visual state. In the core, connectors directly connect to other connectors or claims without the extra display structures like delivery aggregators or delivery connectors.

- Claim
- Core Confidence Connector - a connector from one claim directly to another claim.
- Core Relevance Connector - a connector from a claim to a Core Confidence Connector.
