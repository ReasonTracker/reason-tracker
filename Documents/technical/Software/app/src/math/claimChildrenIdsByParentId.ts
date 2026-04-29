import type { ScoreGraph, ScoreNodeId } from "./scoreTypes.js";

/**
 * Builds the parent-to-children lookup used by the scoring pass.
 */
export function claimChildrenIdsByParentId(
  graph: ScoreGraph,
): Partial<Record<ScoreNodeId, ScoreNodeId[]>> {
  const childrenByParentId: Partial<Record<ScoreNodeId, ScoreNodeId[]>> = {};

  for (const node of Object.values(graph.nodes)) {
    if (!node.parentId) {
      continue;
    }

    childrenByParentId[node.parentId] ??= [];
    childrenByParentId[node.parentId]?.push(node.id);
  }

  return childrenByParentId;
}
