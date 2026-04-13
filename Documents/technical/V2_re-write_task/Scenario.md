# Scenario 1 - Adding a new claim to an existing graph as a leaf

## Step And Wave Terms

- Step: one scenario event. A step may update one data object or many data objects.
- Wave: a step whose changes propagate over time through multiple parts of the graph in ordered action records.
- A non-wave step is atomic even if it updates many objects.
- In this model, only waves create many ordered action records.
- The visible appearance of the new claim or connector is renderer behavior for the add step, not a separate stored wave.
- Layout changes may be downstream effects of domain changes without being steps in this domain model.

## Steps

- Received add leaf claim: the initiating action is recorded as `Add leaf claim`.
    - This record is important, but by itself it does not update the Debate data.
    - Intent type: `ReceivedAddLeafClaimIntent`.
    - Stored data: the new `claim` and `connector`.
- Applied add leaf claim: the Debate data is updated to add the new claim, connector, and score.
    - This step also places the new source into the target score's incoming source order without re-ordering the existing sources.
    - Step count: one atomic step.
    - Step type: `AppliedAddLeafClaimStep`.
    - Stored data: the new `claim`, `connector`, and `score`, plus the canonical `incomingConnectorIds` order for the affected target score.
    - Downstream in the system, the layout function moves the positions of claims and connector end points to adjust for the new object.
    The UI recognizes this step as the time to visually grow the new claim (or fade in etc...) and draw the line for the new connector.
- Recalculation wave: score and connector-width changes propagate through the graph from the changed node according to the scoring algorithm.
    - This is one step, not many separate steps.
    - Step count: one wave step containing many ordered mutation records.
    - Step type: `RecalculationWaveStep`.
    - For each reached score, the score updates first.
        - Mutation type: `ScoreValuesChangedMutation`.
        - Stored data: `scoreId`, `before`, `after`, and `direction`.
        - The `after` values include changes to `confidence`, `reversibleConfidence`, and `relevance`.
    - If the source-scale contribution changes, that is recorded separately.
        - Mutation type: `ScaleOfSourcesChangedMutation`.
        - Stored data: `scoreId`, `before`, `after`, and `direction` for `scaleOfSources`.
    - The receiving claim reached through those connectors then updates its own score.
        - This is another `ScoreValuesChangedMutation` for the next reached score.
    - Connector width, layout, and node-position changes are downstream effects of changed score values such as `scaleOfSources`, not separate stored mutation records in this domain model.
    - The same ordered sequence repeats for the next reached part of the graph until no more scores need to be changed.
- Re-sort sources: an optional full sort may run later only if a rule requires re-ordering existing sources, not just inserting a new one.
    - Step count: one atomic step.
    - Step type: `ResortSourcesStep`.
    - Stored data: `scoreId` and the fully re-ordered `incomingConnectorIds`.

## Ordering Terms

- Insertion placement: choose the slot for a newly inserted source without re-ordering existing items, except shifting them to make room.
- Sort: re-run the ordering rule across the full set, which may move existing items relative to each other.

Do not use `sort` to describe insertion placement.

## Score Source Order

Ordering rule:
- Hard group supports before opposes
- Then descending by impact: `confidence * relevance`
- No tie breaker

Stability rule:
- On a true sort, keep the current order for ties
- On insertion placement, insert just before the first existing item that would sort with or after the new item
- This makes the newest tied item appear on top without re-ordering the existing tied items

## Canonical Order And Minimal History

The sorted order stored in the array is canonical. We should not require a complete operation history on the data object just to support insertion behavior.

If a backup ordering field is needed, it should be a timestamp or sequence value for when an item was added to the group, not when the entity itself was originally created.

For this scenario, the initiating action can still include both the new claim and the new connector, but the long-term data model should rely on canonical stored order rather than replaying a full edit history.


## Scenario Description (may be outdated)
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
