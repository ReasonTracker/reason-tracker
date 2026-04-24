## Debate Flow Diagram Spec

- The diagram is rendered as SVG on a web page.
- Flow direction is **left (sources) → right (targets)**.
- Each claim is represented as a pipe carrying colored fluid.
- Pipe width represents **potential confidence**.
- Fluid volume represents **actual confidence**.
- **Pro = purple**, **Con = orange**.

### Pipe behavior
- Pipe width may vary along its length.
- Changes in confidence propagate as **animated ripples** through the pipe.
- Pipe routes must use curved bends instead of hard corners.
- Bend math must preserve a minimum inner bend radius as a fraction of the rendered pipe width so thick pipes do not overlap, loop back, or collapse into a corner at a 90-degree turn.

### Claim aggregation
- A target claim may receive multiple incoming claims.
- Incoming claims are arranged in one total stack per target claim.
- Pro and con sides keep their color and semantic side, but do not reserve separate top or bottom half-stacks.
- The total incoming stack is centered on the target claim.
- Within the total stack, flows are packed with no gaps so they merge into a continuous stream.
- When flows merge, their **actual confidences sum exactly**.

### Target claims
- A target claim is rendered as a **text box with a score**.
- An output pipe exits the target on the right:
  - Carries the claim’s resulting confidence
  - Assigned a side (pro/con)
  - Can feed into downstream claims

### Stacking and overlap
- Stacking is based only on **actual confidence**.
- Actual confidence widths are connector world-unit measurements computed from each source score's connector scale and connector confidence.
- Potential pipe widths are connector world-unit measurements computed from each source score's connector scale.
- Claim height and connector potential width use the same base height and the same connector scale.
- Claim box size is not an input to connector width, actual confidence width, or stack height.
- The total actual-confidence stack is centered on the target occurrence's layout center after stack height is calculated.
- Potential pipe width is not an input to stack height or centering.
- No space is reserved for unused potential.
- Pipes and unused capacity may overlap visually.

### Relevance attachment
- A relevance connector targets a connector junction on the confidence connector it modifies.
- The connector junction is drawn as a framed box around the routing join.
- The connector junction's height matches the confidence connector's potential pipe width.
- The connector junction's width matches the relevance connector's potential pipe width.
- A connector junction sits in front of the confidence source claim, about one-quarter of the connector path from that source claim toward the target claim.
- A relevance connector enters the connector junction from the top when its source claim is above the junction and from the bottom when its source claim is below the junction.
- The targeted confidence connector is rendered as two pipe segments: one into the connector junction and one from the connector junction to the target claim.
- Other confidence connectors into the same target use the connector-junction confidence connector's second segment as their turn guide: they start bending when that segment starts bending and return to the target when that segment returns.
- The connector junction is routing geometry, not a claim or score occurrence.
- At 100% connector confidence, the rendered actual confidence width matches the rendered potential pipe width because both are calculated from the same connector world unit and connector scale.

### Zero confidence
- Represented as an **empty pipe** (no fluid).
- May visually collapse behind overlapping pipes.
- Its path remains implied so viewers understand it contributes nothing.

### SVG layer order (back → front)
1. Pipe walls / stroke  
2. Pipe interior  
3. Actual confidence fluid  

### Visual rules
- Pipe walls must disappear beneath overlapping pipe interiors.
- Pipe interiors must remain beneath fluid.
- Fluid must never be obscured.
