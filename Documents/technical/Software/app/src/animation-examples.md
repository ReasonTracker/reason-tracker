# Animation Example Descriptions

These examples describe the visual sequence of what happens on screen and intentionally leave out how the DebateCore is updated or how that DebateCore update interacts with the visuals. The planner can still depend on that interaction; this document is only describing the visible sequence.

## Add Confidence Claim to Existing Debate Example

- **Voila**: The new claim scales in from zero to its calculated size in its calculated position while the existing claims move out of the way.
  - Adds in the new claim setting the scale to tween from zero to the scourcesScale of it's target claim.
  - Add in the connectors, junctions and agregators for the new claim.
    - visible is false for the ones that support that.
    - Delivery Connector scale and score is set to zero
- **Sprout**: The pipe wall and pipe interior progressively trace out the path of the new Delivery Connector from the new claim to the target aggregator while the existing sibling structure at that target makes room. The sibling claims, their source-side connectors, their junctions, and their delivery connectors stay connected while their scales update smaller and ripple outward through those sibling branches. At the target side, the existing connectors stay attached, their target-end widths shrink from target to source, and their target-side anchor slots spread apart so the new connector can land between them.
- **First Fill**: The score fluid progressively fills the new pipe.
- **Wave**: Start the progression wave at the target Claim Aggregator Adjust step.

## Add Relevance Claim to a New Junction

- **Voila**: The new claim scales in from zero to its calculated size on the connector lane of the confidence connection it affects while the existing claims move out of the way.
- **Sprout**: These all happen at the same time.
  - The pipe wall and pipe interior progressively trace out the path of the Relevance Connector from the new claim to the top or bottom edge of the junction on the affected confidence connection.
  - The affected confidence connection shows a visible junction and a visible Display Confidence Connector leading into that junction.
  - The Relevance Connector uses the top edge if the relevance claim is above the junction and the bottom edge if the relevance claim is below it. It reaches that edge with the same slope as that edge.
  - If there is only one relevance claim, the junction aggregator may remain hidden even though the Relevance Connector is still associated with that junction aggregator.
  - The junction will grow from zero to its planned size on the affected confidence connection. That planned size includes how wide the relevance landing area is, how thick the incoming confidence side is, and how thick the outgoing delivery side is.
  - If the junction aggregator needs to become visible, it will grow into position as a separate item from the junction.
  - The Display Confidence Connector stays attached to the source-facing edge of the junction and the Delivery Connector stays attached to the target-facing edge of the junction.
- **First Fill**: The score fluid progressively fills the new pipe.
- **Wave**: Start the update wave at the target Junction Aggregator Adjust step.

## Update Wave

The Update Wave is a process that propagates changes through the graph starting when a claim receives an update to its score.

- Start at a claim that finished adjusting.
- If the outgoing connector is a Relevance Connector:
  - **Relevance Connector Adjust**:
    - The Relevance Connector progressively adjusts to the new score.
  - **Junction Aggregator Adjust**:
    - If visible, the relevance aggregator (progressively?/uniformly?) adjusts to the new score.
- Else if the outgoing connector is a Confidence Connector:
  - **Confidence Connector Adjust**: If visible, the Display Confidence Connector progressively adjusts to the new score.
- **Junction Adjust**: If visible, the junction progressively adjusts to the new score.
- **Delivery Connector Adjust**: The Delivery Connector progressively adjusts to the new score.
- **Claim Aggregator Adjust**: The claim aggregator (progressively?/uniformly?) adjusts to the new score.
  - Do we want the scales or orders to happen here instead of at the end?
- **Claim Adjust**: The claim adjusts to its new score.
- If it is the Main Claim, then continue to the next step. If not, then go to the start of this list.
- **Scale**: The whole graph will uniformly adjust scales based on the new scores.
- **Order**: The whole graph will uniformly adjust the order of claims and targets to and inside the aggregators based on all the new scores.
