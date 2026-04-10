import type {
    CalculatedDebate,
    ClaimId,
    Connector,
} from "@reasontracker/contracts";
import type {
    BuildLayoutModelRequest,
    BuildLayoutModelResult,
    CycleMode,
    LayoutDiagnostic,
    LayoutEdge,
    LayoutModel,
    LayoutNode,
} from "./types.ts";

interface TraversalItem {
    nodeId: string;
    claimId: ClaimId;
    depth: number;
    pathSeen: Set<ClaimId>;
}

interface ConnectorIndexes {
    byTarget: Record<string, Connector[]>;
    bySource: Record<string, Connector[]>;
}

export function buildLayoutModel(request: BuildLayoutModelRequest): BuildLayoutModelResult {
    const debate = request.calculatedDebate;
    const cycleMode: CycleMode = request.cycleMode ?? "preserve";

    if (!(debate.mainClaimId in debate.claims)) {
        return {
            ok: false,
            error: {
                code: "INVALID_MAIN_CLAIM",
                message: "mainClaimId does not exist in claims.",
                details: {
                    mainClaimId: debate.mainClaimId,
                },
            },
            diagnostics: [],
        };
    }

    const connectorValidation = validateConnectorsHaveClaims(debate);
    if (!connectorValidation.ok) {
        return connectorValidation;
    }

    if (cycleMode === "preserve") {
        return buildPreservedLayoutModel(debate);
    }

    return buildUnrolledDagLayoutModel(debate, request.dagOptions?.maxInstancesMultiplier ?? 2, request.dagOptions?.connectorOrder ?? "id-asc");
}

function buildPreservedLayoutModel(debate: CalculatedDebate): BuildLayoutModelResult {
    const diagnostics: LayoutDiagnostic[] = [];
    const nodes: Record<string, LayoutNode> = {};
    const edges: Record<string, LayoutEdge> = {};

    const indexes = createConnectorIndexes(debate, "id-asc");
    const depths = computeShortestDepthFromSink(debate.mainClaimId, indexes);

    for (const claimId of Object.keys(debate.claims).sort() as ClaimId[]) {
        const incoming = indexes.byTarget[claimId] ?? [];
        nodes[claimId] = {
            id: claimId,
            claimId,
            score: debate.scores[claimId],
            depth: depths.get(claimId) ?? -1,
            isRoot: claimId === debate.mainClaimId,
            isLeaf: incoming.length === 0,
        };
    }

    const sortedConnectors = Object.values(debate.connectors).sort((a, b) =>
        String(a.id).localeCompare(String(b.id)),
    );

    for (const connector of sortedConnectors) {
        const edgeId = String(connector.id);
        edges[edgeId] = {
            id: edgeId,
            fromNodeId: connector.target,
            toNodeId: connector.source,
            sourceClaimId: connector.source as ClaimId,
            targetClaimId: connector.target as ClaimId,
            connectorId: edgeId,
            affects: connector.affects,
            proTarget: connector.proTarget,
        };
    }

    const model: LayoutModel = {
        rootNodeId: debate.mainClaimId,
        nodes,
        edges,
        cycleMode: "preserve",
        sourceDebateId: debate.id,
    };

    diagnostics.push({
        level: "info",
        code: "PRESERVE_MODE",
        message: "Built layout model without cycle unrolling.",
        data: {
            nodeCount: Object.keys(nodes).length,
            edgeCount: Object.keys(edges).length,
        },
    });

    return {
        ok: true,
        model,
        diagnostics,
    };
}

function buildUnrolledDagLayoutModel(
    debate: CalculatedDebate,
    maxInstancesMultiplier: number,
    connectorOrder: "id-asc" | "source-asc-then-id",
): BuildLayoutModelResult {
    const diagnostics: LayoutDiagnostic[] = [];
    const nodes: Record<string, LayoutNode> = {};
    const edges: Record<string, LayoutEdge> = {};

    const claimCount = Object.keys(debate.claims).length;
    const maxInstances = Math.max(1, Math.floor(claimCount * maxInstancesMultiplier));
    const indexes = createConnectorIndexes(debate, connectorOrder);

    let instanceCounter = 0;
    let edgeCounter = 0;

    const rootNodeId = createInstanceId(debate.mainClaimId, instanceCounter);
    instanceCounter += 1;

    nodes[rootNodeId] = {
        id: rootNodeId,
        claimId: debate.mainClaimId,
        score: debate.scores[debate.mainClaimId],
        depth: 0,
        isRoot: true,
        isLeaf: true,
    };

    const stack: TraversalItem[] = [
        {
            nodeId: rootNodeId,
            claimId: debate.mainClaimId,
            depth: 0,
            pathSeen: new Set([debate.mainClaimId]),
        },
    ];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const incoming = indexes.byTarget[current.claimId] ?? [];

        if (incoming.length === 0) {
            continue;
        }

        for (let i = incoming.length - 1; i >= 0; i -= 1) {
            const connector = incoming[i];
            const childClaimId = connector.source as ClaimId;

            if (current.pathSeen.has(childClaimId)) {
                diagnostics.push({
                    level: "info",
                    code: "EDGE_SKIPPED_PATH_REPEAT",
                    message: "Skipped edge because claim was already seen in the current branch path.",
                    data: {
                        connectorId: String(connector.id),
                        claimId: childClaimId,
                        fromNodeId: current.nodeId,
                    },
                });
                continue;
            }

            if (instanceCounter >= maxInstances) {
                return {
                    ok: false,
                    error: {
                        code: "DAG_UNROLL_LIMIT_EXCEEDED",
                        message: "DAG unroll exceeded max instance limit.",
                        details: {
                            maxInstances,
                            createdInstances: instanceCounter,
                            maxInstancesMultiplier,
                            lastConnectorId: String(connector.id),
                        },
                    },
                    diagnostics,
                };
            }

            const childNodeId = createInstanceId(childClaimId, instanceCounter);
            instanceCounter += 1;

            nodes[childNodeId] = {
                id: childNodeId,
                claimId: childClaimId,
                score: debate.scores[childClaimId],
                depth: current.depth + 1,
                isRoot: false,
                isLeaf: true,
                parentId: current.nodeId,
            };

            nodes[current.nodeId].isLeaf = false;

            const edgeId = `${String(connector.id)}#${edgeCounter}`;
            edgeCounter += 1;

            edges[edgeId] = {
                id: edgeId,
                fromNodeId: current.nodeId,
                toNodeId: childNodeId,
                sourceClaimId: connector.source as ClaimId,
                targetClaimId: connector.target as ClaimId,
                connectorId: String(connector.id),
                affects: connector.affects,
                proTarget: connector.proTarget,
            };

            const nextPathSeen = new Set(current.pathSeen);
            nextPathSeen.add(childClaimId);

            stack.push({
                nodeId: childNodeId,
                claimId: childClaimId,
                depth: current.depth + 1,
                pathSeen: nextPathSeen,
            });
        }
    }

    diagnostics.push({
        level: "info",
        code: "UNROLL_DAG_MODE",
        message: "Built unrolled DAG layout model.",
        data: {
            nodeCount: Object.keys(nodes).length,
            edgeCount: Object.keys(edges).length,
            maxInstances,
            maxInstancesMultiplier,
        },
    });

    return {
        ok: true,
        model: {
            rootNodeId,
            nodes,
            edges,
            cycleMode: "unroll-dag",
            sourceDebateId: debate.id,
        },
        diagnostics,
    };
}

function validateConnectorsHaveClaims(debate: CalculatedDebate): BuildLayoutModelResult | { ok: true } {
    for (const connector of Object.values(debate.connectors)) {
        if (!(connector.source in debate.claims)) {
            return {
                ok: false,
                error: {
                    code: "MISSING_CLAIM",
                    message: "Connector source claim does not exist in claims.",
                    details: {
                        connectorId: String(connector.id),
                        missingClaimId: connector.source,
                        relation: "source",
                    },
                },
                diagnostics: [],
            };
        }

        if (!(connector.target in debate.claims)) {
            return {
                ok: false,
                error: {
                    code: "MISSING_CLAIM",
                    message: "Connector target claim does not exist in claims.",
                    details: {
                        connectorId: String(connector.id),
                        missingClaimId: connector.target,
                        relation: "target",
                    },
                },
                diagnostics: [],
            };
        }
    }

    return { ok: true };
}

function createConnectorIndexes(
    debate: CalculatedDebate,
    connectorOrder: "id-asc" | "source-asc-then-id",
): ConnectorIndexes {
    const byTarget: Record<string, Connector[]> = {};
    const bySource: Record<string, Connector[]> = {};

    for (const connector of Object.values(debate.connectors)) {
        (byTarget[connector.target] ??= []).push(connector);
        (bySource[connector.source] ??= []).push(connector);
    }

    const comparator =
        connectorOrder === "source-asc-then-id"
            ? (a: Connector, b: Connector) => {
                  const sourceOrder = String(a.source).localeCompare(String(b.source));
                  if (sourceOrder !== 0) return sourceOrder;
                  return String(a.id).localeCompare(String(b.id));
              }
            : (a: Connector, b: Connector) => String(a.id).localeCompare(String(b.id));

    for (const key of Object.keys(byTarget)) {
        byTarget[key].sort(comparator);
    }

    for (const key of Object.keys(bySource)) {
        bySource[key].sort(comparator);
    }

    return {
        byTarget,
        bySource,
    };
}

function createInstanceId(claimId: ClaimId, index: number): string {
    return `${claimId}#${index}`;
}

function computeShortestDepthFromSink(
    sinkClaimId: ClaimId,
    indexes: ConnectorIndexes,
): Map<ClaimId, number> {
    const depths = new Map<ClaimId, number>();
    const queue: ClaimId[] = [sinkClaimId];
    depths.set(sinkClaimId, 0);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDepth = depths.get(current) ?? 0;
        const incoming = indexes.byTarget[current] ?? [];

        for (const connector of incoming) {
            const source = connector.source as ClaimId;
            if (depths.has(source)) continue;
            depths.set(source, currentDepth + 1);
            queue.push(source);
        }
    }

    return depths;
}
