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

### Claim aggregation
- A target claim may receive multiple incoming claims.
- Incoming claims are grouped into two stacks:
  - **Pro stack above**
  - **Con stack below**
- Within each stack, flows are packed with no gaps so they merge into a continuous stream.
- When flows merge, their **actual confidences sum exactly**.

### Target claims
- A target claim is rendered as a **text box with a score**.
- An output pipe exits the target on the right:
  - Carries the claim’s resulting confidence
  - Assigned a side (pro/con)
  - Can feed into downstream claims

### Stacking and overlap
- Stacking is based only on **actual confidence**.
- No space is reserved for unused potential.
- Pipes and unused capacity may overlap visually.

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