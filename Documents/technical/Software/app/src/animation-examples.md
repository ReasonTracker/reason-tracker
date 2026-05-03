# Animation Example Descriptions

These examples describe the visual sequence of what happens on screen and intentionally leave out how the debate core is updated or how it affects the visuals.

## Add Confidence Claim to Existing Debate Example

- **Voila**: The new claim scales in from zero to its calculated size in its calculated position while the existing claims move out of the way.
  - Planner:
    - Adds in the new claim setting the scale to tween from zero to the scourcesScale of it's target claim.
    - Add in the connectors, junctions and agregators for the new claim.
      - visible is false
      - scale is set to to the scourcesScale of it's target claim
  - Claculate the end state with
- **Sprout**: The pipe wall and pipe interior progressively trace out the path of the Delivery Connector from the new claim to the target aggregator while the other connectors to that target make room.
  - A new claim will not have a junction and will not have a visible Display Confidence Connector.
- **First Fill**: The score fluid progressively fills the new pipe.
- **Wave**: Start the progression wave at the target Claim Aggregator Adjust step.

## Add Relevance Claim to a New Junction

- **Voila**: The new claim scales in from zero to its calculated size in its calculated position while the existing claims move out of the way.
- **Sprout**: These all happen at the same time.
  - The pipe wall and pipe interior progressively trace out the path of the Relevance Connector from the new claim to the junction aggregator.
  - The junction will grow in width from zero to the width necessary to fit the new claim's pipe width and move into position from zero distance in front of the claim at the Claim Lane.
  - The aggregator will also grow into position.
  - The delivery and confidence connectors will stay connected to the junction.
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
