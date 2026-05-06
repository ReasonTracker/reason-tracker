# Animation Example Descriptions

These examples describe the visual sequence of what happens on screen and intentionally leave out how the DebateCore is updated or how that DebateCore update interacts with the visuals. The planner can still depend on that interaction; this document is only describing the visible sequence.

## Add Confidence Claim to Existing Debate Example

- **Voila**: The new claim scales in from zero to its calculated size in its calculated position while the existing claims move out of the way.
  - Adds in the new claim setting the scale to tween from zero to the scourcesScale of it's target claim.
  - Add in the connectors, junctions and agregators for the new claim.
    - visible is false for the ones that support that.
    - Delivery Connector scale and score is set to zero
- **Sprout**: These stages happen in order across the sprout step.
  - `0% - 50%`: The new Delivery Connector's pipe wall and pipe interior trace out from the new claim toward the target claim in the `sourceToTarget` direction. During this interval, the new connector grows from zero to its planned post-sprout scale and is already attached to its planned target-side landing slot.
  - `50% - 70%`: The existing sibling Delivery Connectors make room at the target. Their target-side attachments slide toward their planned landing slots while their widths shrink toward their planned post-sprout scales, and that width change sweeps in the `targetToSource` direction.
  - `70% - 100%`: The existing sibling claims move into their planned compact positions while scaling toward their planned post-sprout sizes so their claim edges stay aligned with the narrower layout.
  - No sibling source-side connector, junction, or delivery aggregator animation happens during Episode0001's sprout step.
- **First Fill**: The score fluid progressively fills the new pipe.
- **Wave**: Start the progression wave at the target Delivery Aggregator Adjust step.

## Add Relevance Claim to a New Junction

- **Voila**: The new claim scales in from zero to its calculated size on the connector lane of the confidence connection it affects while the existing claims move out of the way.
- **Sprout**: These all happen at the same time.
  - The pipe wall and pipe interior progressively trace out the path of the Relevance Connector from the new claim to the top or bottom side of the relevance aggregator attached to the affected junction on the affected confidence connection.
  - The affected confidence connection shows a visible junction and a visible Display Confidence Connector leading into that junction.
  - The Relevance Connector uses the top side if the relevance claim is above the junction and the bottom side if the relevance claim is below it. It reaches that side with the same slope as that side.
  - If there is only one relevance claim, the relevance aggregator may remain hidden or collapsed even though the Relevance Connector is still associated with that relevance aggregator, which can make it look like the connector is landing directly on the junction in this example orientation.
  - The junction will grow from zero to its planned size on the affected confidence connection. That planned size includes how wide the relevance landing area is, how thick the incoming confidence side is, and how thick the outgoing delivery side is.
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
- **Scale**: The whole graph will uniformly adjust scales based on the new scores.
- **Order**: The whole graph will uniformly adjust the order of claims and targets to and inside the aggregators based on all the new scores.
