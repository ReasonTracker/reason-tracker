# Scoring

This folder owns debate scoring, claim-side derivation, and cycle resolution.

## Core Rules

- A claim with no children scores `1`, unless it has an authored `defaultConfidence` or `defaultRelevance`.
- A score of `1` means unreduced standing, not proof.
- Attacks reduce standing when they survive their own challenges. Defenses weaken attacks. Relevance changes the delivered effect of a claim.
- Non-reversible claims clamp negative standing at zero. Reversible claims retain signed `directedValue` and expose a non-negative display `value`.
- `ScoreNodeId` identifies one claim occurrence in the acyclic scoring graph, not the reusable claim identity.
- Cycle resolution enumerates inclusion-minimal connector break sets and evaluates each with the strict acyclic scorer. It raises a typed complexity error rather than sampling or truncating variants.
- Claims that cannot reach a cycle are scored once and shared across variants. Claim values are averaged across the full variant count; a connector's contribution is averaged only across variants that retain it.
- Cycle components and variants are audit data, separate from ordinary display state.

## Main Entrypoints

1. `scoringAxioms.ts`
2. `scoreTypes.ts`
3. `calculateScoresFromDebateCore.ts`
4. `resolveCyclesFromDebateCore.ts`
5. `buildScoreGraphFromDebateCore.ts`
6. `calculateScores.ts`
7. `calculateSides.ts`
8. `calculateChildImpact.ts`
9. `calculateClaimScore.ts`
10. `calculateScoreValue.ts`
11. `calculateRelevance.ts`
12. `calculateSourcesScales.ts`
13. `claimChildrenIdsByParentId.ts`
14. `sortClaimsLeavesToRoot.ts`

Frame placement belongs to [Layout](../layout/📌README.md). Animation frame contracts are defined in the [Debate Animation Data Model](../../../design/debate-animation-data-model.md).

<!-- autonav:start -->
<!-- autonav:end -->
