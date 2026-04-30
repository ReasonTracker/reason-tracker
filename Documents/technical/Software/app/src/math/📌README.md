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
- Missing information has no hidden score effect.

## Suggested Reading path

1. `scoringAxioms.ts`
2. `calculateScoreRun.ts` - cycle-aware scoring entrypoint with audit and limits
3. `calculateScores.ts` - acyclic scoring kernel
4. `calculateChildImpact.ts` - one child claim's effect on its parent
5. `calculateClaimScore.ts` - one parent score from child impacts
6. `calculateScoreValue.ts` - weighted value kernel
7. `calculateRelevance.ts` - relevance multiplier
8. `claimChildrenIdsByParentId.ts` - parent-to-children lookup
9. `sortClaimsLeavesToRoot.ts` - evaluation order
