# Glossary

## Debate Model

- **Claim:** A statement that can be supported or attacked by other claims.
- **DebateCore:** Authoritative debate state containing claims, connectors, and their relationships.
- **Main Claim:** The root claim being supported or attacked.
- **Confidence Connector:** A core relationship from one claim to another claim.
- **Relevance Connector:** A core relationship from a claim to a confidence connector.

## Display

- **Delivery Connector:** The displayed confidence relationship between claims.
- **Display Relevance Connector:** The displayed connection from a relevance claim to the delivery aggregator it affects.
- **Delivery Aggregator:** A trapezoid on a claim's children-facing edge that represents relevance applied to that claim's delivery.
- **Pipe Shell:** Structural connector geometry around the fluid.
- **Fluid:** The filled portion of a connector representing its numeric value.
- **Claim Occurrence:** One claim's appearance along a path in the expanded presentation graph.
- **Debate Frame:** Scalar display state for every visible claim and connector at one point in an animation.

## Scoring and Scale

- **Score:** A claim's standing after entered claims are applied. A score of `1` means unreduced standing, not proof.
- **ScoreNode:** One occurrence of a claim in the acyclic scoring graph; a reusable claim can have multiple score nodes.
- **ScoreGraph:** The nodes and optional parent-to-child index consumed by score calculation.
- **Reversible Claim:** A claim whose signed `directedValue` can be negative while its displayed `value` remains non-negative.
- **Potential Scale:** Structural size at 100% score.
- **sourcesScale:** A claim occurrence's base potential scale and the budget for its children.
- **Sibling Base Scale:** Shared base scale for direct confidence children, computed as `parentCapacity / max(1, totalDeliveryContributionWeight)`.
- **Delivery Contribution Weight:** A child's score value multiplied by its continuous relevance multiplier.
- **Parent Fluid Share:** A child's delivery contribution weight divided by the total, bounded by the parent's capacity.
- **Target Fluid Interval:** An ordered portion of the combined fluid stack on a target edge. A zero-fluid child retains a zero-width cursor interval.

## Layout

- **Lane:** A layout band whose items are arranged along its lane axis.
- **Lane Axis:** The vertical axis used to arrange items inside a lane.
- **Cross-Lane Axis:** The horizontal axis that separates lanes.
- **Claim Lane:** A lane for claim visuals; claim boxes are left-justified within its band.
- **Claim Lane Axis Gap:** Edge-to-edge gap between sibling claim boxes, resolved at local `sourcesScale`.
- **targetSideOffset:** Offset along the resolved target edge used to position a connector's attachment.
- **Shared Ordering:** One deterministic order used by sibling claims and their target-edge connector stacks.

## Animation

- **Planner:** Applies a command to pre-command `DebateCore` state and produces frames and animation tracks.
- **PlannerInput:** Pre-command `DebateCore`, command, and optional origin and planner options.
- **PlannerOptions:** Layout dimensions, claim-lane gap, and connector corridor straight-section share.
- **DebateAnimationPlan:** Opening frame and named animation steps with tracks for scalar display properties.
- **Track:** Numeric property changes associated with an entity across one animation step.
- **Voila:** Transition into command-applied staging geometry.
- **Sprout:** Connector-shell reveal.
- **First Fill:** Connector-fluid reveal and associated contact transition.
- **Wave:** Transition of the first affected parent score and its resulting geometry.
- **Reorient:** Transition to derived-side display geometry.
