# Scoring Math

This file is the entry point for reading the scoring code.

A `score` is the claim's current standing after the entered claims are applied.

A score of `1` means the claim has not been reduced. It does not mean the claim is proven. The system does not subtract points for information that has not been entered.

New information changes the score only when it is added as a claim and connected into the graph.

## Core rules

- Claims start fully standing.
- Attacks reduce standing when they survive their own challenges.
- Defenses matter by weakening attacks.
- Relevance changes how much one claim affects another.
- `ScoreNodeId` means one claim occurrence in the acyclic scoring graph, not the reusable claim identity itself.
- Planner-facing math entrypoints stay DebateCore-shaped.
- The planner should not construct a separate scoring adapter layer.
- If internal path-occurrence handling is needed for a later scope, keep it inside math unless an exported boundary genuinely needs a separate contract.
- Eventual `proMain` or `conMain` side derivation lives in math.
- Source-side potential-scale derivation lives in math.
- `sourcesScale` represents a claim's owned source-side potential-scale budget at `100%` score, not current fluid fill.
- Current score changes fluid fill, not pipe diameter.
- A target claim owns the fixed `sourcesScale` budget for its source side.
- Before relevance modifiers are applied, direct confidence children of the same target use equal inherited source-side scales derived from that fixed target-owned potential scale.
- Direct relevance children inherit the affected confidence connection's source-side scale unchanged.
- Relevance can increase or decrease the affected confidence child's outgoing Delivery Connector scale after the junction.
- Missing information has no hidden score effect.

## Deferred math issue

- Reversible score and relevance behavior is intentionally out of scope for the current contract pass. Reintroduce it only after the debate-core contract and the exact math semantics are approved.

## Suggested Reading path

1. `scoringAxioms.ts`
2. `calculateScoresFromDebateCore.ts` - DebateCore-first scoring entrypoint
3. `calculateSourcesScalesFromDebateCore.ts` - DebateCore-first source-scale entrypoint
4. `calculateSidesFromDebateCore.ts` - DebateCore-first side derivation entrypoint
5. `calculateScores.ts` - current full scoring pass
6. `calculateChildImpact.ts` - one child claim's effect on its parent
7. `calculateClaimScore.ts` - one parent score from child impacts
8. `calculateScoreValue.ts` - weighted value kernel
9. `calculateRelevance.ts` - relevance multiplier
10. `calculateSourcesScales.ts` - recursive source-side scale allocation
11. `claimChildrenIdsByParentId.ts` - parent-to-children lookup
12. `sortClaimsLeavesToRoot.ts` - evaluation order
