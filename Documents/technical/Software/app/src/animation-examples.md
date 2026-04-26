# Animation Example Descriptions

## Add Confidence Claim to Existing Debate Example

- **Voila**: The new claim scales in from zero to its calculated size in its calculated position while the existing claims move out of the way
  - Need to run the layout calculations including the eventual size of the new claim so we will need a way for the state to have an item take up space but not be visible and/or be a different scale that it is or have a Placeholder
- **Sprout**: The pipe wall and pipe interior progressively trace out the path of the Delivery Connector from the new claim to the target aggregator while the other connectors to that target make room.
  - A new claim will not have a Junction and will not have a visible Display Confidence Connector
- **First Fill**: The confidence fluid progressively fills the new pipe
- **Wave**: Start the progression wave at the target Claim Aggregator Adjust step.

## Add Relevance Claim to a New Junction

- **Voila**: The new claim scales in from zero to its calculated size in its calculated position while the existing claims move out of the way
- **Sprout**: These all happen at the same time.
  - The pipe wall and pipe interior progressively trace out the path of the Relevance Connector from the new claim to the junction aggregator.
  - The Junction will grow in width from zero to the width necessary to fit the new claim's pipe width and move into position from zero distance in fromt of the claim at the claim lane.
  - The aggregator will also grow into position.
  - The Delivery and Confidence connectors will stay connected to the Junction.
- **First Fill**: The confidence fluid progressively fills the new pipe
- **Wave**: Start the update wave at the target Junction Aggregator Adjust step.

## Update Wave

The Update Wave is process that propagates changes through the graph starting when a claim receives an update to its confidence.

- Starting at a claim that finished adjusting
- If the outgoing connector is a Relevance Connector:
  - **Relevance Connector Adjust**:
    - The Relevance Connector progressively adjusts to the new confidence score
  - **Junction Aggregator Adjust**:
    - If visible The relevance aggregator (p/u?) adjusts to the new confidence score
- Else if the outgoing connector is a Confidence Connector:
  - **Confidence Connector Adjust**: If visible, the Display Confidence Connector progressively adjusts to the new confidence score
- **Junction Adjust**: If visible, The Junction progressively adjusts to the new confidence score
- **Delivery Connector Adjust**: The Delivery Connector progressively adjusts to the new confidence score
- **Claim Aggregator Adjust**: The claim aggregator (p/u?) adjusts to the new confidence score
  - Do we want the scales or orders to happen here instead of at the end?
- **Claim Adjust**: The Claim adjusts to its new confidence score
- If it is the Main claim then continue to the next step. If not, then go to the start of this list.
- **Scale**: The whole graph will uniformly adjust scales based on the new scores.
- **Order**: The whole graph will uniformly adjust the order of claims and targets to and inside the aggregators based on all the new scores.
