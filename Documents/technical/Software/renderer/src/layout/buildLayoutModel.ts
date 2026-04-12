import type {
    CalculatedDebate,
    ClaimId,
    Connector,
} from "@reasontracker/contracts";
import { deriveTargetRelation } from "@reasontracker/contracts";
import { sortDraftLayoutModel } from "./ordering.ts";
import type {
    BuildLayoutModelRequest,
    BuildLayoutModelResult,
    DraftLayoutModel,
    CycleMode,
    LayoutDiagnostic,
    ConnectorShape,
    ClaimShape,
    SiblingOrderingMode,
} from "./types.ts";

interface TraversalItem {
    claimShapeId: string;
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
    const siblingOrderingMode: SiblingOrderingMode = request.siblingOrderingMode ?? "auto-reorder";

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
        return buildPreservedLayoutModel(debate, siblingOrderingMode);
    }

    return buildUnrolledDagLayoutModel(
        debate,
        request.dagOptions?.maxInstancesMultiplier ?? 2,
        request.dagOptions?.connectorOrder ?? "id-asc",
        siblingOrderingMode,
    );
}

function buildPreservedLayoutModel(
    debate: CalculatedDebate,
    siblingOrderingMode: SiblingOrderingMode,
): BuildLayoutModelResult {
    const diagnostics: LayoutDiagnostic[] = [];
    const claimShapes: Record<string, ClaimShape> = {};
    const connectorShapes: Record<string, ConnectorShape> = {};

    const indexes = createConnectorIndexes(debate, "id-asc");
    const depths = computeShortestDepthFromSink(debate.mainClaimId, indexes);

    const orderedClaimIds = siblingOrderingMode === "preserve-input"
        ? (Object.keys(debate.claims) as ClaimId[])
        : ([...Object.keys(debate.claims)].sort() as ClaimId[]);

    for (const claimId of orderedClaimIds) {
        const incoming = indexes.byTarget[claimId] ?? [];
        claimShapes[claimId] = {
            id: claimId,
            claimId,
            claim: debate.claims[claimId],
            score: debate.scores[claimId],
            depth: depths.get(claimId) ?? -1,
            isRoot: claimId === debate.mainClaimId,
            isLeaf: incoming.length === 0,
        };
    }

    const sortedConnectors = siblingOrderingMode === "preserve-input"
        ? Object.values(debate.connectors)
        : Object.values(debate.connectors).sort((a, b) =>
            String(a.id).localeCompare(String(b.id)),
        );

    for (const connector of sortedConnectors) {
        const connectorShapeId = String(connector.id);
        const sourceClaim = debate.claims[connector.source as ClaimId];
        const targetClaim = debate.claims[connector.target as ClaimId];
        connectorShapes[connectorShapeId] = {
            id: connectorShapeId,
            targetClaimShapeId: connector.target,
            sourceClaimShapeId: connector.source,
            sourceClaimId: connector.source as ClaimId,
            targetClaimId: connector.target as ClaimId,
            connectorId: connector.id,
            connector,
            affects: connector.affects,
            targetRelation: deriveTargetRelation(
                sourceClaim?.side ?? "proMain",
                targetClaim?.side ?? "proMain",
            ),
        };
    }

    const model: DraftLayoutModel = {
        rootClaimShapeId: debate.mainClaimId,
        claimShapes,
        connectorShapes,
        claimShapeInputOrder: [],
        connectorShapeInputOrder: [],
        cycleMode: "preserve",
        sourceDebateId: debate.id,
    };

    const sorted = sortDraftLayoutModel(model, siblingOrderingMode);
    model.claimShapeInputOrder = sorted.claimShapeIds;
    model.connectorShapeInputOrder = sorted.connectorShapeIds;

    diagnostics.push({
        level: "info",
        code: "PRESERVE_MODE",
        message: "Built layout model without cycle unrolling.",
        data: {
            claimShapeCount: Object.keys(claimShapes).length,
            connectorShapeCount: Object.keys(connectorShapes).length,
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
    siblingOrderingMode: SiblingOrderingMode,
): BuildLayoutModelResult {
    const diagnostics: LayoutDiagnostic[] = [];
    const claimShapes: Record<string, ClaimShape> = {};
    const connectorShapes: Record<string, ConnectorShape> = {};

    const claimCount = Object.keys(debate.claims).length;
    const maxInstances = Math.max(1, Math.floor(claimCount * maxInstancesMultiplier));
    const indexes = createConnectorIndexes(
        debate,
        siblingOrderingMode === "preserve-input" ? "id-asc" : connectorOrder,
    );

    let instanceCounter = 0;
    let connectorShapeCounter = 0;

    const rootClaimShapeId = createInstanceId(debate.mainClaimId, instanceCounter);
    instanceCounter += 1;

    claimShapes[rootClaimShapeId] = {
        id: rootClaimShapeId,
        claimId: debate.mainClaimId,
        claim: debate.claims[debate.mainClaimId],
        score: debate.scores[debate.mainClaimId],
        depth: 0,
        isRoot: true,
        isLeaf: true,
    };

    const stack: TraversalItem[] = [
        {
            claimShapeId: rootClaimShapeId,
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
                    code: "CONNECTOR_SKIPPED_PATH_REPEAT",
                    message: "Skipped connector because claim was already seen in the current branch path.",
                    data: {
                        connectorId: String(connector.id),
                        claimId: childClaimId,
                        fromClaimShapeId: current.claimShapeId,
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

            const childClaimShapeId = createInstanceId(childClaimId, instanceCounter);
            instanceCounter += 1;

            claimShapes[childClaimShapeId] = {
                id: childClaimShapeId,
                claimId: childClaimId,
                claim: debate.claims[childClaimId],
                score: debate.scores[childClaimId],
                depth: current.depth + 1,
                isRoot: false,
                isLeaf: true,
                parentId: current.claimShapeId,
            };

            claimShapes[current.claimShapeId].isLeaf = false;

            const connectorShapeId = `${String(connector.id)}#${connectorShapeCounter}`;
            connectorShapeCounter += 1;
            const sourceClaim = debate.claims[connector.source as ClaimId];
            const targetClaim = debate.claims[connector.target as ClaimId];

            connectorShapes[connectorShapeId] = {
                id: connectorShapeId,
                targetClaimShapeId: current.claimShapeId,
                sourceClaimShapeId: childClaimShapeId,
                sourceClaimId: connector.source as ClaimId,
                targetClaimId: connector.target as ClaimId,
                connectorId: connector.id,
                connector,
                affects: connector.affects,
                targetRelation: deriveTargetRelation(
                    sourceClaim?.side ?? "proMain",
                    targetClaim?.side ?? "proMain",
                ),
            };

            const nextPathSeen = new Set(current.pathSeen);
            nextPathSeen.add(childClaimId);

            stack.push({
                claimShapeId: childClaimShapeId,
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
            claimShapeCount: Object.keys(claimShapes).length,
            connectorShapeCount: Object.keys(connectorShapes).length,
            maxInstances,
            maxInstancesMultiplier,
        },
    });

    const sorted = sortDraftLayoutModel({ claimShapes, connectorShapes }, siblingOrderingMode);

    return {
        ok: true,
        model: {
            rootClaimShapeId,
            claimShapes,
            connectorShapes,
            claimShapeInputOrder: sorted.claimShapeIds,
            connectorShapeInputOrder: sorted.connectorShapeIds,
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
