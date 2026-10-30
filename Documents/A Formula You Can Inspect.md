# A Formula You Can Inspect

This is the formula behind [How the Score Works](How%20the%20Score%20Works.md), written out so anyone can check it.

It is a simplified form. It assumes every claim can flip, and that no claim ends up supporting itself through a loop of other claims. The full rules handle those cases too, but the idea is the same.

## In plain words

- Every claim starts at a score of 1: full standing, because nothing has knocked it down yet.
- A claim's score is the balance of the reasons pointing at it. Reasons for it pull it up and reasons against it pull it down.
- Each reason counts as much as it stands, times how relevant it is.
- Relevance starts neutral. Reasons that say "this matters" raise it, and reasons that say "this doesn't matter" lower it.

## The formula

A claim's score:

$$\mathrm{score}_n = \frac{\sum_c \mathrm{isPro}_c\, \mathrm{score}_c\, \mathrm{weight}_c}{\sum_c \mathrm{weight}_c}$$

How much one reason counts:

$$\mathrm{weight}_c = \rho_c\, |\mathrm{score}_c|$$

How relevant one reason is:

$$\rho = \frac{\prod_{\mathrm{isPro}_r\, \mathrm{score}_r > 0} (1 + |\mathrm{score}_r|)}{\prod_{\mathrm{isPro}_r\, \mathrm{score}_r < 0} (1 + |\mathrm{score}_r|)}$$

A claim with no reasons under it scores 1.

## What the symbols mean

- $n$: the claim being scored.
- $c$: one of the reasons pointing at it.
- $\mathrm{isPro}_c$: $+1$ if the reason supports the claim, $-1$ if it attacks it.
- $\mathrm{score}$: how well a claim currently stands.
- $\mathrm{weight}_c$: how much reason $c$ counts: its relevance times how well it stands.
- $\rho_c$: how relevant reason $c$ is to the claim.
- $r$: a reason about relevance ("this matters" or "this doesn't matter").
- $\mathrm{isPro}_r$: $+1$ if it says the reason matters more, $-1$ if it says it matters less.
