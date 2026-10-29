# Animation Examples

These sequences show how the planner presents confidence- and relevance-claim additions. The [Debate Animation Data Model](../../design/debate-animation-data-model.md) defines frame, scale, layout, and connector contracts.

## Add a Confidence Claim

1. **Voila:** The new claim grows into the neutral staging layout. Its connectors remain hidden while surrounding geometry reaches the same layout.
2. **Sprout:** The new delivery connector shell reveals along its route.
3. **First Fill:** Fluid advances through the connector. The connector shell transitions from its staging profile to its settled profile.
4. **Wave:** The affected parent score and resulting layout transition together.
5. **Reorient:** Derived side and content determine claim placement and connector geometry.

## Add a Relevance Claim

1. **Voila:** The relevance claim grows into the affected claim's child column. The delivery aggregator and surrounding layout reach neutral staging geometry.
2. **Sprout:** The relevance connector shell reveals to the aggregator.
3. **First Fill:** Relevance fluid advances. The affected claim, aggregator, connector endpoints, and offsets transition into the direct-adjustment layout.
4. **Wave:** The affected parent score and resulting layout transition together.
5. **Reorient:** Derived side and content determine claim placement and connector geometry.
