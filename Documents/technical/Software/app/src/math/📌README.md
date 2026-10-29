# Scoring Math

## Simplified formula

For understanding, not the full contract. This form assumes every claim is reversible, and the map has no cycles.

Parent score:

$$\mathrm{score}_n = \frac{\sum_c \mathrm{isPro}_c\, \mathrm{score}_c\, \mathrm{weight}_c}{\sum_c \mathrm{weight}_c}$$

Weight of one claim:

$$\mathrm{weight}_c = \rho_c\, |\mathrm{score}_c|$$

Relevance of one edge:

$$\rho = \frac{\prod_{\mathrm{isPro}_r\, \mathrm{score}_r > 0} (1 + |\mathrm{score}_r|)}{\prod_{\mathrm{isPro}_r\, \mathrm{score}_r < 0} (1 + |\mathrm{score}_r|)}$$

Base case: a claim with no child claims scores 1.

Definitions:

- $n$: the parent claim.
- $c$: a claim.
- $\mathrm{isPro}_c$: $+1$ if $c$ is pro $n$, $-1$ if $c$ is con.
- $\mathrm{score}$: score of a claim (subscript says which claim).
- $\mathrm{weight}_c$: weight of claim $c$ (relevance × how much it stands).
- $\rho_c$: relevance multiplier of claim $c$'s edge ($\rho$ in the relevance formula is this, for one edge).
- $r$: a relevance claim on an edge.
- $\mathrm{isPro}_r$: $+1$ if $r$ is pro importance, $-1$ if $r$ is con.

LaTeX source: [formula-simpler.tex](./formula-simpler.tex)

## Introduction

This file is the entry point for reading the scoring code.

A `score` is the claim's current standing after the entered claims are applied.

A score of `1` means the claim has not been reduced. It does not mean the claim is proven. The system does not subtract points for information that has not been entered.

A claim with an authored starting value (`defaultConfidence` / `defaultRelevance`) and no children scores that value instead of `1`.

New information changes the score only when it is added as a claim and connected into the graph.

## Core rules

- Claims start fully standing, unless an authored starting value (`defaultConfidence` / `defaultRelevance`) is set, in which case a claim with no children scores that value.
- Reversibility is a per-claim flag: a non-reversible claim clamps negative standing at 0, while a reversible claim keeps the magnitude and exposes direction through `directedValue` (and a `reversed` flag).
- Attacks reduce standing when they survive their own challenges.
- Defenses matter by weakening attacks.
- Relevance changes how much one claim affects another.
- `ScoreNodeId` means one claim occurrence in the acyclic scoring graph, not the reusable claim identity itself.
- `calculateScoresFromDebateCore` resolves cyclic DebateCore input before invoking the acyclic scoring kernel.
- Cycle resolution enumerates every inclusion-minimal connector break set that makes the main-claim dependency closure acyclic.
- Every variant removes its cut connectors and runs only the claims that can reach a cycle through the same acyclic scorer; claims that cannot reach a cycle are scored once and shared by every variant.
- Connector contributions are read from the scorer run rooted at the connector's target claim, never recalculated. Claim fields are averaged across the full variant count. A cut connector does not exist in its variant, so connector contributions are averaged only across the variants that keep that connector.
- Resolution fails with a typed complexity error rather than sampling or truncating variants.
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

## Suggested Reading path

1. `scoringAxioms.ts`
2. `scoreTypes.ts` - claim occurrences, scores, and impacts
3. `calculateScoresFromDebateCore.ts` - DebateCore-first scoring entrypoint
4. `resolveCyclesFromDebateCore.ts` - exact variant enumeration, audit data, and aggregate values
5. `buildScoreGraphFromDebateCore.ts` - path-safe acyclic occurrence graph construction
6. `calculateScores.ts` - strict acyclic scoring pass
7. `calculateSides.ts` - main-claim side derivation (`proMain` / `conMain`) per occurrence
8. `calculateChildImpact.ts` - one child claim's effect on its parent
9. `calculateClaimScore.ts` - one parent score from child impacts
10. `calculateScoreValue.ts` - weighted value kernel
11. `calculateRelevance.ts` - relevance multiplier
12. `calculateSourcesScales.ts` - acyclic source-side scale kernel
13. `claimChildrenIdsByParentId.ts` - parent-to-children lookup
14. `sortClaimsLeavesToRoot.ts` - acyclic evaluation order
