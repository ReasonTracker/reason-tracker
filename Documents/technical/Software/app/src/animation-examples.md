# Animation Example Descriptions

These examples describe the visual sequence of what happens on screen and intentionally leave out how the DebateCore is updated or how that DebateCore update interacts with the visuals. The planner can still depend on that interaction; this document is only describing the visible sequence.

## Current Implementation Scope

- The first production planner implementation covers add-confidence and add-relevance claim animation.
- The first production planner sequence currently stops after the first `wave` from the command target through its outgoing connectors.
- Subsequent propagation-wave sequencing is future scope.
- The settled display state still needs to support debates that already contain relevance structures elsewhere in the graph.
- The planner input boundary is the pre-command DebateCore state plus the command payload.
- Planner-facing math should stay DebateCore-shaped, so the planner should consume DebateCore-first math entrypoints rather than building a separate scoring adapter layer.

## Scale Rule

- `sourcesScale` is the size factor applied uniformly to every structural element in a local area: claim boxes, confidence connectors, and all layout distances.
- Scale is self-similar — zooming into a scaled-down area produces geometry identical to the same area at full size.
- A claim's score controls fluid fill and contributes to its sibling group's shared base scale. It never makes that claim alone structurally smaller than a sibling.

## Group Scale Rule

**Terms:**

- `relevanceMultiplier`: the combined effect of all relevance connectors on one confidence connection. Equals 1 when no relevance connectors are attached.
- `deliveryScore`: the authoritative contribution weight delivered to the target.

**Rules:**

- All source claims connecting to the same target share one sibling base scale: `targetSourcesScale / max(1, sum(deliveryScores))`.
- Every claim in the group and its confidence connector use this base. Scores indirectly shrink the whole group only when total delivered contribution exceeds capacity.
- Each source's delivery connector scale = `sourcesScale × relevanceMultiplier`, making it wider or narrower than the confidence connector when relevance is not 1.
- Parent fluid share is `deliveryScore / max(1, sum(deliveryScores))`. Zero shares retain their ordered point and visible empty shell.
- Examples without relevance: `100/0/0/0` keeps parent-sized siblings; `100/100/0/0` makes every sibling base `50%`; `20/30` keeps parent-sized siblings and leaves half the target empty; `60/80` gives base `1/1.4`; all-zero groups retain parent-sized empty shells.
- With score `100%`, relevance `2`, and a zero-score sibling at relevance `1`, both sibling bases are `50%`; the first delivery shell becomes parent-sized after relevance and owns the full parent fluid interval.

## Layout Rule

- `claimLaneAxisGap` is the edge-to-edge gap between sibling claim boxes along the lane axis, not a center-to-center distance.
- That gap resolves at the same local `sourcesScale` as the surrounding geometry, so it shrinks and grows with the source-side potential scale.
- In the current orientation, claim boxes are left-justified within the claim-lane band.
- Sibling source claims form local clusters that stay mostly centered on their source claim when surrounding constraints permit it.

## Add Confidence Claim to Existing Debate Example

- **Voila**: The new claim scales in from zero at its staging position, while the surrounding claims and connectors transition together to the command-applied staging layout. Every new claim contributes score zero in that layout, so its connector and any junction use neutral pre-effect geometry. New connector shells remain hidden throughout this phase.
- Adds in the new claim setting the scale to tween from zero to its planned full pipe scale.
- That planned claim scale is the shared child `sourcesScale` solved for that target's sibling group from staging delivery demand. The outgoing delivery side uses that same base scale and then applies the staging relevance multiplier after the junction.
- Add in the connectors, junctions and agregators for the new claim.
  - visible is false for the ones that support that.
  - Delivery Connector scale and score is set to zero
- **Sprout**: The new Delivery Connector traces from the fully grown new claim toward the target claim through the structural layout established during Voila. The whole visible connector remains a complete taper from structural source width to target width throughout its growth, and the completed taper occupies the full route. Its zero-score delivery end remains at the normal stack point on the fluid's anchored side, while existing delivery connectors retain their normal endpoints. The compact claim order uses the same shared ordering rule as the target-side connector stack so the lines do not cross.
- See [Debate Animation Data Model Design](../../design/debate-animation-data-model.md#connector-stacking) for how those target-side attachment positions are determined.
- **First Fill**: The score fluid progressively fills the new pipe while a matching shell transition moves with it. Behind the fluid cap the shell has direct-adjustment structural width; ahead of the cap it retains the original taper. The handoff between those profiles uses the fluid cap's calculated start, end, length, and easing, so the target does not begin opening until the shared transition reaches it and both become flush together. During that contact portion, positions, scales, offsets, junction geometry, and related layout for the direct-adjustment snapshot move while the fill finishes. Parent scores remain frozen.
- **Wave**: Starts only after First Fill is complete. This single animation changes the first affected parent score and all positions, scales, offsets, junctions, and connector geometry implied by that first-parent score snapshot together. Subsequent propagation toward the Main Claim requires later waves and remains future scope.

## Add Relevance Claim To A New Junction

- **Voila**: The new claim scales in from zero to its calculated staging size while the local sibling group, the junction, and its related connectors transition to the command-applied zero-score staging layout. The junction appears with neutral, matching confidence and delivery sides.
- **Sprout**: The pipe wall and pipe interior trace from the new claim to the staging relevance landing area on the junction.
- The Relevance Connector reaches the top side if the relevance claim is above the junction and the bottom side if the relevance claim is below it. It reaches that side with the same slope as that side.
- **First Fill**: Fluid progressively fills the new Relevance Connector. The existing target confidence connection remains in staging geometry until the relevance fluid reaches it; during the final contact interval, the direct connector adjustment takes effect and its claim positions, connector endpoints, widths, stack offsets, junction geometry, and aggregator inputs transition together. The target claim and all ancestor scores remain frozen.
- **Wave**: Begins only after every First Fill track completes. This single animation changes the first affected parent score and all geometry implied by that first-parent score snapshot together. Future propagation waves may continue one parent level at a time.
- The settled state has the following properties:
  - The Relevance Connector uses the top side if the relevance claim is above the junction and the bottom side if the relevance claim is below it. It reaches that side with the same slope as that side.
  - If multiple relevance connectors land on that same relevance-aggregator edge, they restack according to the shared [Debate Animation Data Model Design](../../design/debate-animation-data-model.md#connector-stacking) rules.
  - If there is only one relevance claim, the relevance aggregator may remain hidden or collapsed even though the Relevance Connector is still associated with that relevance aggregator, which can make it look like the connector is landing directly on the junction in this example orientation.
  - The junction's planned size includes how wide the relevance landing area is, how thick the incoming Display Confidence Connector side is, and how thick the outgoing Delivery Connector side is.
  - Relevance can make that outgoing Delivery Connector side either wider or narrower than the incoming Display Confidence Connector side.
  - If the relevance aggregator needs to become visible, it will grow out from the junction edge as a separate item from the junction.
  - The Display Confidence Connector stays attached to the source-facing edge of the junction and the Delivery Connector stays attached to the delivery aggregator on the target claim side. The delivery aggregator remains visible even when it has only one incoming connector.

## Update Wave

The Update Wave is a process that propagates changes through the graph starting when a claim receives an update to its score.

Each Wave is one animation step. The next parent score and all movement implied by that score change animate together. A Wave starts only after the preceding claim or connector adjustment and its overlapping positioning have completely finished. Propagation beyond that parent uses another Wave rather than being folded into the same calculation.

- Start at a claim that finished adjusting.
- If the outgoing connector is a Relevance Connector:
  - **Relevance Connector Adjust**:
    - The Relevance Connector progressively adjusts to the new score.
  - **Relevance Aggregator Adjust**:
    - If visible, the relevance aggregator (progressively?/uniformly?) adjusts to the new score.
- Else if the outgoing connector is a Confidence Connector:
  - **Confidence Connector Adjust**: If visible, the Display Confidence Connector progressively adjusts to the new score.
- **Junction Adjust**: If visible, the junction progressively adjusts to the new score.
- **Delivery Connector Adjust**: The Delivery Connector progressively adjusts to the new score.
- **Delivery Aggregator Adjust**: The delivery aggregator (progressively?/uniformly?) adjusts to the new score.
  - Do we want the scales or orders to happen here instead of at the end?
- **Claim Adjust**: The claim adjusts to its new score.
- If it is the Main Claim, then continue to the next step. If not, then go to the start of this list.
- **Scale**: The whole graph will uniformly adjust scales when the potential pipe-size calculation changes. Current score still only controls the fraction of fluid shown inside those pipe sizes.
- **Order**: The whole graph will uniformly adjust the order of claims and targets to and inside the aggregators based on all the new scores.
  The same shared ordering rule must still be used for both claim order and target-edge connector stack order.
