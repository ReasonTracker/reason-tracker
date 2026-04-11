# 📌 Contracts

The types used across these Reason Tracker projects.

# Type Philosophy

- Prefer interfaces where possible.
- Types are designed to be extensible, so consumers can add properties.
- We use generic functions to preserve that extensibility.
- This contracts package includes lightweight constructors and default-population helpers for shared contract types.
- Keep contracts compatible with type stripping.

# Type Architecture

There are a few architectural design areas that differ in construction.

## Claim Graphs

A claim graph is a directed graph. It is usually hierarchical but not necessarily acyclic. It has one main claim (a single sink). So a claim might have multiple outgoing edges (connectors).

## Score Graphs

A score graph is a directed acyclic graph (DAG). In the score graph, each score appears only once per claim. After cycles are removed. One claim can map to multiple scores, and each score corresponds to an instance of the claim in distinct position in the graph. To enfore that scores can only have one outgoing edge, scores to not use a connector type and all the data anout the enge is included directly in the score