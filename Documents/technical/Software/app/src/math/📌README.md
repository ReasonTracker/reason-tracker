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
- `calculateScoresFromDebateCore` resolves cyclic DebateCore input before invoking the acyclic scoring kernel.
- Cycle resolution enumerates every inclusion-minimal connector break set that makes the main-claim dependency closure acyclic.
- Every variant uses the same acyclic scorer. Claim fields and connector contributions are averaged across the full variant count.
- A connector cut in one variant contributes zero in that variant. Resolution fails with a typed complexity error rather than sampling or truncating variants.
- Cycle components and variants are retained for audit consumers but are not normal graph-display state.
- Eventual `proMain` or `conMain` side derivation lives in math.
- Source-side potential-scale derivation lives in math.
- `sourcesScale` represents a claim's owned source-side potential-scale budget at `100%` score, not current fluid fill.
- Current score changes fluid fill inside an authored pipe. Current score also participates in solving the shared base scale for a direct confidence-child sibling group.
- A target claim owns the fixed `sourcesScale` budget for its source side.
- Direct confidence children of the same target share one solved child `sourcesScale` derived from that target-owned budget and the direct confidence children's current scored delivery demand.
- Each direct confidence child's current scored delivery demand is that child's continuous relevance multiplier multiplied by that child's current score value.
- Direct relevance children inherit the affected confidence connection's solved child `sourcesScale` unchanged.
- Each direct confidence child's outgoing Delivery Connector scale is that solved child `sourcesScale` multiplied by that child's continuous relevance multiplier.
- `calculateSourcesScales.ts` owns the canonical sibling allocation: base scale is `parentCapacity / max(1, totalDeliveryContributionWeight)`, and parent fluid shares use the same denominator.
- Cycle-resolved presentation allocation consumes authoritative averaged `deliveryScore`; it does not multiply separately averaged score and relevance values.
- Missing information has no hidden score effect.

## Deferred math issue

- Reversible score and relevance behavior is intentionally out of scope for the current contract pass. Reintroduce it only after the debate-core contract and the exact math semantics are approved.

## Suggested Reading path

1. `scoringAxioms.ts`
2. `calculateScoresFromDebateCore.ts` - DebateCore-first scoring entrypoint
3. `resolveCyclesFromDebateCore.ts` - exact variant enumeration, audit data, and aggregate values
4. `buildScoreGraphFromDebateCore.ts` - path-safe acyclic occurrence graph construction
5. `calculateScores.ts` - strict acyclic scoring pass
6. `calculateChildImpact.ts` - one child claim's effect on its parent
7. `calculateClaimScore.ts` - one parent score from child impacts
8. `calculateScoreValue.ts` - weighted value kernel
9. `calculateRelevance.ts` - relevance multiplier
10. `calculateSourcesScales.ts` - acyclic source-side scale kernel
11. `claimChildrenIdsByParentId.ts` - parent-to-children lookup
12. `sortClaimsLeavesToRoot.ts` - acyclic evaluation order
