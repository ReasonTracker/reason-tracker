import type { ScoreGraph, ScoreNodeId } from "./scoreTypes.js";
import { claimChildrenIdsByParentId } from "./claimChildrenIdsByParentId.js";

/**
 * Returns ScoreNodeIds in the order needed for scoring.
 *
 * Children are returned before parents so every child score exists before
 * the parent score is calculated.
 */
export function sortClaimsLeavesToRoot(graph: ScoreGraph): ScoreNodeId[] {
  const childrenByParentId = graph.childrenByParentId ?? claimChildrenIdsByParentId(graph);
  const ordered: ScoreNodeId[] = [];
  const visiting = new Set<ScoreNodeId>();
  const visited = new Set<ScoreNodeId>();

  function visit(id: ScoreNodeId): void {
    if (visited.has(id)) {
      return;
    }

    if (visiting.has(id)) {
      throw new Error(`Cycle found while sorting score nodes: ${id}`);
    }

    visiting.add(id);

    for (const childId of childrenByParentId[id] ?? []) {
      visit(childId);
    }

    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  }

  for (const id of Object.keys(graph.nodes) as ScoreNodeId[]) {
    visit(id);
  }

  return ordered;
}
