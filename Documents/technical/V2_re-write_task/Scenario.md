# Scenario 1 - Adding a new claim to an existing graph as a leaf

This is a graph of claims and connectors. This is visually what happens when a change happens. We need to track the action initiated and all the subsequent actions that happen as this change propagates across the graph.

This also has some architectural code statement that may have been implemented differently in th enew code.

- Appear: The claim appears in the proper sort order and grows while the other nodes move out of the way. When do the target points of the existing connectors make room for the new connector? Now or when it grows?
    - Need to calculate where to insert this node.
    - Claim order needs to be part of the data so it can be tracked and adjusted at specific times and may be dependent in part on the order the node was added. Maybe it should be at the top of its team group.
    - The SourceClaimScale needs to be stored on the Score so it can cascade up and down and be available for the scale to default the new claim and connector to so it can be the same size as its siblings even though it might change the final scale of itself and its siblings later.
    - The scale should probably start at 0 and grow to the sourceScale when animated, but we need to send the source scale to ELK to calculate the final position with the final size. I guess we need actions to have their logic inside the reducer (is that the right name) so it calculates the final state of the growth and sends it to ELK, then has an action of 0 scale, then to whatever the sourcesFraction is.
- The connection from the new claim to its target grows out of it to the new target. Is this when the existing connectors make room for the new connector? Now or when it appeared?
    - So do we need data like the width at each end and direction of travel?
- The target claim adjusts its score. (Do the animation go up or down the tree first or at the same time.)
- The connectors attached to the changed score update their width. The animation might migrate across the connection from where the change happened to where it is received. 
    - It needs to be understood as an action so we need to know not just the delta but the direction of the change: target to source or source to target.
- The claim that received the update (target or source) then adjusts its score, then it loops until the propagations have happened.
