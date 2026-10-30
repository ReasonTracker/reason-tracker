# Scoring

## Simplified formula

For understanding, not the full contract. This form assumes every claim is reversible, and the map has no cycles.

Parent score:

$$\mathrm{score}_n = \frac{\sum_c \mathrm{isPro}_c \cdot \mathrm{score}_c \cdot \mathrm{weight}_c}{\sum_c \mathrm{weight}_c}$$

Weight of one claim:

$$\mathrm{weight}_c = \rho_c \cdot |\mathrm{score}_c|$$

Relevance of one edge:

$$\rho = \frac{\prod_{\mathrm{isPro}_r \cdot \mathrm{score}_r > 0} (1 + |\mathrm{score}_r|)}{\prod_{\mathrm{isPro}_r \cdot \mathrm{score}_r < 0} (1 + |\mathrm{score}_r|)}$$

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

## Cross-Folder Seams

- `resolveCyclesFromDebateCore.ts` resolves cycles and returns aggregate scores for layout.
- `calculateSourcesScales.ts` allocates child scales for layout.
- `scoreTypes.ts` defines score graph and result contracts used by layout.

Frame placement belongs to [Layout](../layout/📌README.md). Animation frame contracts are defined in the [Debate Animation Data Model](../../../design/debate-animation-data-model.md).

<!-- autonav:start -->
<!-- autonav:end -->
