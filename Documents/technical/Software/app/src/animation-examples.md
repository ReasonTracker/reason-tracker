# Animation Example Descriptions

These examples describe the visual sequence of what happens on screen and intentionally leave out how the DebateCore is updated or how that DebateCore update interacts with the visuals. The planner can still depend on that interaction; this document is only describing the visible sequence.

## Current Implementation Scope

- The first production planner implementation currently covers add-confidence claim animation only.
- The first production planner sequence currently stops at `firstFill`.
- Add-relevance animation and propagation-wave sequencing are future scope.
- The settled display state still needs to support debates that already contain relevance structures elsewhere in the graph.
- The planner input boundary is the pre-command DebateCore state plus the command payload.
- Planner-facing math should stay DebateCore-shaped, so the planner should consume DebateCore-first math entrypoints rather than building a separate scoring adapter layer.

## Scale Rule

- `sourcesScale` is the size factor applied uniformly to every structural element in a local area: claim boxes, confidence connectors, and all layout distances.
- Scale is self-similar — zooming into a scaled-down area produces geometry identical to the same area at full size.
- A claim's own score never affects `sourcesScale`. Score only controls fluid fill inside a structurally fixed pipe.

## Group Scale Rule

**Terms:**

- `relevanceMultiplier`: the combined effect of all relevance connectors on one confidence connection. Equals 1 when no relevance connectors are attached.
- `deliveryScore`: what a source claim delivers to its target = `relevanceMultiplier × sourceScore`. Controls fluid fill, not structural size.

**Rules:**

- All source claims connecting to the same target share one `sourcesScale` = `targetSourcesScale / sum(relevanceMultipliers)`, clamped to not exceed `targetSourcesScale`.
- When all `relevanceMultipliers` are zero the budget is split equally among children.
- Every claim in the group and its confidence connector use this same `sourcesScale`. Adding any new source claim shrinks all siblings uniformly, regardless of what score it has or what it does to any claim's score.
- Each source's delivery connector scale = `sourcesScale × relevanceMultiplier`, making it wider or narrower than the confidence connector when relevance is not 1.
- Fluid fill inside each delivery connector = `deliveryScore` as a fraction of the delivery connector's full pipe diameter.

## Layout Rule

- `claimLaneAxisGap` is the edge-to-edge gap between sibling claim boxes along the lane axis, not a center-to-center distance.
- That gap resolves at the same local `sourcesScale` as the surrounding geometry, so it shrinks and grows with the source-side potential scale.
- In the current orientation, claim boxes are left-justified within the claim-lane band.
- Sibling source claims form local clusters that stay mostly centered on their source claim when surrounding constraints permit it.

## Add Confidence Claim to Existing Debate Example

- **Voila**: The new claim scales in from zero to its calculated size in its calculated position while the existing claims move out of the way.
  - Adds in the new claim setting the scale to tween from zero to its planned full pipe scale.
  - That planned claim scale is the shared child `sourcesScale` solved for that target's sibling group from current scored delivery demand. The outgoing delivery side uses that same base scale and then applies the child's continuous relevance multiplier after the junction.
  - Add in the connectors, junctions and agregators for the new claim.
    - visible is false for the ones that support that.
    - Delivery Connector scale and score is set to zero
- **Sprout**: These stages happen in order across the sprout step.
  - `0% - 50%`: The new Delivery Connector's pipe wall and pipe interior trace out from the new claim toward the target claim in the `sourceToTarget` direction. During this interval, the new connector grows from zero to its planned post-sprout scale and is already attached to its planned stacked target-side attachment position.
  - `50% - 70%`: The existing sibling Delivery Connectors make room at the target. Their target-side attachments slide toward their planned stacked target-side attachment positions while their widths shrink toward their planned post-sprout scales, and that width change sweeps in the `targetToSource` direction.
  - `70% - 100%`: The existing sibling claims move into their planned compact positions while scaling toward their planned post-sprout sizes so their claim edges stay aligned with the narrower layout. That compact claim order uses the same shared ordering rule as the target-side connector stack so the lines do not cross.
  - No sibling source-side connector, junction, or delivery aggregator animation happens during Episode0001's sprout step.
  - See [Debate Animation Data Model Design](../../design/debate-animation-data-model.md#connector-stacking) for how those target-side attachment positions are determined.
- **First Fill**: The score fluid progressively fills the new pipe.
- **Wave**: Start the progression wave at the target Delivery Aggregator Adjust step.

## Add Relevance Claim To A New Junction

- **Voila**: The new claim scales in from zero to its calculated size in its calculated claim-lane position while the existing claims in that source claim cluster move out of the way.
- **Sprout**: These all happen at the same time.
  - The pipe wall and pipe interior progressively trace out the path of the Relevance Connector from the new claim to the top or bottom side of the relevance aggregator attached to the affected junction on the affected confidence connection.
  - The affected confidence connection shows a visible junction and a visible Display Confidence Connector leading into that junction.
  - The Relevance Connector uses the top side if the relevance claim is above the junction and the bottom side if the relevance claim is below it. It reaches that side with the same slope as that side.
  - If multiple relevance connectors land on that same relevance-aggregator edge, they restack according to the shared [Debate Animation Data Model Design](../../design/debate-animation-data-model.md#connector-stacking) rules.
  - If there is only one relevance claim, the relevance aggregator may remain hidden or collapsed even though the Relevance Connector is still associated with that relevance aggregator, which can make it look like the connector is landing directly on the junction in this example orientation.
  - The junction will grow from zero to its planned size on the affected confidence connection. That planned size includes how wide the relevance landing area is, how thick the incoming Display Confidence Connector side is, and how thick the outgoing Delivery Connector side is.
  - Relevance can make that outgoing Delivery Connector side either wider or narrower than the incoming Display Confidence Connector side.
  - If the relevance aggregator needs to become visible, it will grow out from the junction edge as a separate item from the junction.
  - The Display Confidence Connector stays attached to the source-facing edge of the junction and the Delivery Connector stays attached to the delivery aggregator on the target claim side, which can look like it is connecting to the claim when there is only one incoming connector because the delivery aggregator is not visible.
- **First Fill**: The score fluid progressively fills the new pipe.
- **Wave**: Start the update wave at the target Relevance Aggregator Adjust step.

## Update Wave

The Update Wave is a process that propagates changes through the graph starting when a claim receives an update to its score.

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
