import type { ClaimId, Connector, Debate } from "@reasontracker/contracts";

export type SortResult =
    | {
          ok: true;
          ids: ClaimId[];
      }
    | {
          ok: false;
          cycleClaimIds: ClaimId[];
      };

/**
 * Returns claim ids in deterministic source-first topological order.
 * If a cycle exists, returns the ids that still have inbound edges.
 */
export function sortSourceIdsFirst(debate: Debate): SortResult {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const claimId of Object.keys(debate.claims)) {
        inDegree.set(claimId, 0);
        adjacency.set(claimId, []);
    }

    for (const connector of Object.values(debate.connectors)) {
        registerNode(connector.source, inDegree, adjacency);
        registerNode(connector.target, inDegree, adjacency);

        adjacency.get(connector.source)!.push(connector.target);
        inDegree.set(connector.target, (inDegree.get(connector.target) ?? 0) + 1);
    }

    const queue = Array.from(inDegree.entries())
        .filter(([, degree]) => degree === 0)
        .map(([id]) => id)
        .sort();

    const ordered: string[] = [];
    while (queue.length > 0) {
        const current = queue.shift()!;
        ordered.push(current);

        const outgoing = adjacency.get(current) ?? [];
        for (const next of outgoing) {
            const nextDegree = (inDegree.get(next) ?? 0) - 1;
            inDegree.set(next, nextDegree);
            if (nextDegree === 0) {
                insertSorted(queue, next);
            }
        }
    }

    if (ordered.length !== inDegree.size) {
        const cycleClaimIds = Array.from(inDegree.entries())
            .filter(([, degree]) => degree > 0)
            .map(([id]) => id)
            .sort() as ClaimId[];

        return {
            ok: false,
            cycleClaimIds,
        };
    }

    const claimOnly = ordered.filter((id) => id in debate.claims) as ClaimId[];
    return {
        ok: true,
        ids: claimOnly,
    };
}

function registerNode(
    id: string,
    inDegree: Map<string, number>,
    adjacency: Map<string, string[]>,
): void {
    if (!inDegree.has(id)) {
        inDegree.set(id, 0);
    }
    if (!adjacency.has(id)) {
        adjacency.set(id, []);
    }
}

function insertSorted(queue: string[], id: string): void {
    let i = 0;
    while (i < queue.length && queue[i] < id) i += 1;
    queue.splice(i, 0, id);
}
