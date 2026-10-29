# Debate Animation Data Model

## Ownership

The engine turns a `DebateCore` and a command into scalar debate frames and an animation plan. The component package renders frames and engine-provided geometry.

- Debate entities and commands are defined in [Debate Core](../engine/src/debate-core/📌README.md).
- Scoring, cycle resolution, and source-side scale allocation are defined in [Scoring](../engine/src/scoring/📌README.md).
- Presentation graph and frame layout are defined in [Layout](../engine/src/layout/📌README.md).
- Scene and path geometry are defined in [Geometry](../engine/src/geometry/📌README.md).
- Animation planning is defined in [Animation](../engine/src/animation/📌README.md).
- React and SVG rendering are defined in [Debate Graph](../components/src/debate-graph/📌README.md).

## Planner Contract

`PlannerInput` contains the pre-command `DebateCore`, a debate command, and optional origin and layout options. The planner applies the command, resolves opening and settled occurrence graphs, computes scoring and layout snapshots, and returns a `DebateAnimationPlan`.

The plan contains an occurrence-keyed opening `DebateFrame` and named `voila`, `sprout`, `firstFill`, `wave`, and `reorient` steps. Tracks describe position, structural scale, target-stack offset, shell reveal, and fluid reveal. `resolveAnimationFrame` resolves a step and progress value into a scalar frame; frames contain no host-specific tween values or cycle-variant state.

## Animation Sequence

- **Voila:** New claims grow into command-applied staging geometry. Surrounding positions, connector endpoints, offsets, and delivery aggregators move to the staging layout. New connector shells remain hidden.
- **Sprout:** Newly added connector shells reveal along the staging geometry. Scores and positions remain fixed.
- **First Fill:** Connector fluid advances from source to target. A matching shell-profile transition uses the same spatial interval. Contact layout may transition while the fluid completes; parent scores remain fixed.
- **Wave:** The first affected parent score and the layout derived from that score change together.
- **Reorient:** Display side and content switch at the first frame; claim packing, offsets, and connector geometry interpolate to the derived-side layout. Score values remain fixed.

## Scoring and Presentation

- Scoring accepts `DebateCore` and resolves cycles as exact, bounded acyclic variants. Inclusion-minimal connector break sets are evaluated with the acyclic scorer. Claims that cannot reach a cycle are scored once; claim fields are averaged across all variants, while each connector contribution is averaged only across variants that retain that connector.
- Cycle audit data is separate from display state.
- Presentation expands the debate by path and terminates an occurrence when its claim already appears on that path.
- Reversible claims retain signed `originalValue` and `directedValue`, plus non-negative display `value`. Connector relationships use `directedValue`.
- Each occurrence resolves `originalSide`, `derivedSide`, and `displaySide`. Optional reversed text resolves to `derivedContent` and `displayContent`; rendering consumes display fields.
- Cycle aggregation averages completed score fields per variant. Reversal follows the sign of the averaged `directedValue`.

## Scale and Delivery

- Authored scale is the full structural size at 100% score. Renderers apply it uniformly to claims, connectors, delivery aggregators, attachment geometry, and local layout distances.
- `sourcesScale` is a claim occurrence's base potential scale and the budget for its children. The claim box `scale` is `sourcesScale` multiplied by its continuous relevance multiplier.
- Direct confidence children of one target share `parentCapacity / max(1, sum(deliveryContributionWeight))` as their base scale. A child's delivery contribution weight is its score value multiplied by its continuous relevance multiplier.
- Each parent-fluid share is `deliveryContributionWeight / max(1, sum(deliveryContributionWeight))`. Zero-fluid children retain an ordered point; shares do not exceed parent capacity.
- Direct confidence children and relevance claims affecting the target's delivery use the shared child `sourcesScale`. A child's box and outgoing delivery scales apply its relevance multiplier after the sibling-base allocation.
- Score controls fluid fill and contributes to sibling-group base-scale allocation. It does not independently resize one sibling.

## Layout

- `claimLaneAxisGap` is the edge-to-edge gap between sibling claim boxes along a lane axis. It resolves at local `sourcesScale`.
- The delivery-connector corridor width is `(2 * widestRenderedConnectorWidth) / (1 - connectorStraightShare) + deliveryAggregatorWidth`. `connectorStraightShare` reserves that fraction for the central straight section; the remaining width is divided equally between the two endpoint bends. Each bend run equals the widest rendered connector width, keeping both sides of the pipe rounded through the widest supported 90-degree turn.
- Claim boxes are left-justified in their claim-lane band. A child column contains direct confidence children followed by relevance claims affecting that claim's delivery.
- Confidence children prefer their matching delivery-stack port. The first relevance claim prefers the position below the delivery aggregator. Constrained packing uses ordered entries and horizontal contours of claims, aggregators, and routed connectors.
- A delivery aggregator appears when relevance affects a claim's outgoing confidence connection. Its claim-side edge matches the claim height; its children-side edge is `claimHeight * sourcesScale`. Its top and bottom sides slant equally and reserve the combined width of incoming relevance connectors, lengthening as needed to remain at or below 45 degrees. Incoming delivery connectors pass through it, scaled by the ratio of the two edge lengths.

## Connector Transitions and Ordering

- Fill transitions specify initial and final numeric values. Geometry derives the moving frontier from track timing.
- Fill travels from source to target. Increasing fill remains behind the frontier; decreasing fill retains the initial width ahead and the final width behind it.
- Delivery fluid fills a delivery aggregator in the step after it fills the connector: First Fill connectors fill their aggregators during Wave, and Wave connectors fill theirs during Reorient. The aggregator front keeps the connector front's pace, and the aggregator scales each incoming stream toward the claim-side edge. Relevance connectors end at its bottom edge.
- Sibling claims and target-edge connector stacks use one deterministic order: group `proTarget` before `conTarget`, then order by source position with a stable tie-breaker. Direct confidence children use this order; relevance claims follow in their own ordered list.
- `targetSideOffset` is measured along the resolved target edge. Delivery connectors land on the target aggregator when present, otherwise on the target claim. Relevance connectors land perpendicular to the bottom edge of their aggregator; the nearest relevance claim lands farthest from the claim.
- Delivery connectors share one centered parent-fluid stack. Every child participates, including zero-fluid children, whose `[cursor, cursor]` interval does not advance the cursor. Shells do not add spacing and may overlap.
- For a fluid interval `[start, end]`, the normal shell center is `start + shellWidth / 2` for `conMain` and `end - shellWidth / 2` for `proMain`.
- Newly added confidence connections retain the normal stack cursor and fluid-side anchor during staging and First Fill. Their shell narrows from structural source width toward delivered fluid width at the target. Relevance connectors retain structural-shell stacking.
- Reveal changes visible path length, not settled attachment position.

## Rendering Layers

The renderer paints all connector and aggregator shells, then all fluids, then aggregator borders, then claims. This ordering keeps overlapping shells behind fluid.

## Planner Options

`PlannerOptions` defines claim width and height, the lane-axis gap, and the curved and diagonal connector corridor widths. Defaults are declared in `engine/src/animation/contracts.ts`.
