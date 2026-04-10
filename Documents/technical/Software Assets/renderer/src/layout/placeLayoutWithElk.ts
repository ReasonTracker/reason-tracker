import ELK from "elkjs/lib/elk.bundled.js";
import type {
    ClaimShapeSize,
    ClaimShape,
    DraftLayoutModel,
    LayoutOptions,
    LayoutDiagnostic,
    LayoutModel,
    PlaceLayoutWithElkResult,
    PlacedClaimShape,
} from "./types.ts";
import { compareConnectorPreference, orderClaimShapeIdsForElk } from "./ordering.ts";
import { withConnectorGeometry } from "./computeConnectorGeometry.ts";
import { orderConnectorShapeIdsForTarget } from "./orderConnectorShapesForTarget.ts";

type ElkClaimShapeLayout = {
    id: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
    layoutOptions?: Record<string, string>;
};

type ElkConnectorLayout = {
    id: string;
    sources: string[];
    targets: string[];
    sections?: ElkConnectorSectionLayout[];
    layoutOptions?: Record<string, string>;
    properties?: Record<string, unknown>;
};

type ElkPointLayout = {
    x?: number;
    y?: number;
};

type ElkConnectorSectionLayout = {
    startPoint?: ElkPointLayout;
    endPoint?: ElkPointLayout;
    bendPoints?: ElkPointLayout[];
};

type OrderedConnectorsByTarget = {
    byTarget: Record<string, string[]>;
    targetOrder: string[];
};

type ElkGraph = {
    id: string;
    children?: ElkClaimShapeLayout[];
    edges?: ElkConnectorLayout[];
    width?: number;
    height?: number;
    layoutOptions?: Record<string, string>;
};

type ElkLayoutApi = {
    layout: (graph: unknown) => Promise<unknown>;
};

const DEFAULT_CLAIM_SHAPE_SIZE: ClaimShapeSize = {
    width: 320,
    height: 180,
};

export async function placeLayoutWithElk(
    model: DraftLayoutModel,
    options: LayoutOptions = {},
): Promise<PlaceLayoutWithElkResult> {
    // Separation of duties: this function owns placed geometry for both nodes and connectors.
    // Render adapters should not recompute connector routing.
    const diagnostics: LayoutDiagnostic[] = [];

    const defaultClaimShapeSize = options.defaultClaimShapeSize ?? DEFAULT_CLAIM_SHAPE_SIZE;
    const claimShapeSizeByClaimShapeId = options.claimShapeSizeByClaimShapeId ?? {};
    const preserveInputOrder = options.preserveInputOrder ?? true;

    const orderedClaimShapeIds = orderClaimShapeIdsForElk(model);

    const children: ElkClaimShapeLayout[] = orderedClaimShapeIds.map((claimShapeId) => {
        const size = claimShapeSizeByClaimShapeId[claimShapeId] ?? defaultClaimShapeSize;
        const isRoot = claimShapeId === model.rootClaimShapeId;

        return {
            id: claimShapeId,
            width: size.width,
            height: size.height,
            layoutOptions: isRoot
                ? {
                      "elk.layered.layering.layerConstraint": "FIRST",
                  }
                : undefined,
        };
    });

    const connectorShapes: ElkConnectorLayout[] = Object.values(model.connectorShapes)
        .sort((a, b) => compareConnectorPreference(model, a.id, b.id))
        .map((connectorShape) => {
            const sourceClaimShape = model.claimShapes[connectorShape.sourceClaimShapeId];
            const sourceClaimShapeSize = claimShapeSizeByClaimShapeId[connectorShape.sourceClaimShapeId] ?? defaultClaimShapeSize;
            const sourceConfidence = sourceClaimShape?.score?.confidence ?? 1;
            const connectorThickness = Math.max(0, sourceClaimShapeSize.height * sourceConfidence * 10);

            return {
                id: connectorShape.id,
                sources: [connectorShape.targetClaimShapeId],
                targets: [connectorShape.sourceClaimShapeId],
                layoutOptions: {
                    "elk.edge.thickness": String(connectorThickness),
                },
            };
        });

    const graph: ElkGraph = {
        id: "reason-tracker-layout",
        children,
        edges: connectorShapes,
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.spacing.nodeNode": String(options.peerGap),
            "elk.layered.spacing.nodeNodeBetweenLayers": String(options.layerGap),
            "elk.spacing.edgeNode": String(options.connectorClaimShapeGap),
            "elk.layered.cycleBreaking.strategy": "GREEDY",
            "elk.layered.nodePlacement.strategy": "LINEAR_SEGMENTS",
            "elk.layered.nodePlacement.favorStraightEdges": options.favorStraightEdges ? "true" : "false",
            "elk.layered.nodePlacement.bk.fixedAlignment": options.bkFixedAlignment,
            "elk.layered.compaction.connectedComponents": "false",
            ...(preserveInputOrder
                ? {
                      "elk.layered.considerModelOrder": "NODES_AND_EDGES",
                      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
                  }
                : {}),
        },
    };

    const ElkClass = ELK as unknown as { new (): ElkLayoutApi };
    const elk = new ElkClass();

    let laidOutGraph: ElkGraph;
    try {
        laidOutGraph = await elk.layout(graph as never) as ElkGraph;
    } catch (error) {
        return {
            ok: false,
            error: {
                code: "ELK_LAYOUT_FAILED",
                message: "ELK failed to compute layout.",
                details: {
                    reason: error instanceof Error ? error.message : String(error),
                },
            },
            diagnostics,
        };
    }

    if (options.debugConnectorOrder) {
        logElkThicknessRoundTrip(connectorShapes, laidOutGraph.edges ?? []);
    }

    const placedChildren = new Map<string, ElkClaimShapeLayout>();
    for (const child of laidOutGraph.children ?? []) {
        placedChildren.set(child.id, child);
    }

    const placedClaimShapes: Record<string, PlacedClaimShape> = {};
    let maxX = 0;
    let maxY = 0;

    for (const [claimShapeId, claimShape] of Object.entries(model.claimShapes)) {
        const laidOutNode = placedChildren.get(claimShapeId);
        if (!laidOutNode || laidOutNode.x == null || laidOutNode.y == null) {
            return {
                ok: false,
                error: {
                    code: "ELK_CLAIM_SHAPE_NOT_PLACED",
                    message: "ELK did not return a position for every claim shape.",
                    details: {
                        claimShapeId,
                    },
                },
                diagnostics,
            };
        }

        const placedClaimShape = toPlacedClaimShape(claimShape, laidOutNode);
        placedClaimShapes[claimShapeId] = placedClaimShape;
    }

    for (const placedClaimShape of Object.values(placedClaimShapes)) {
        maxX = Math.max(maxX, placedClaimShape.x + placedClaimShape.width);
        maxY = Math.max(maxY, placedClaimShape.y + placedClaimShape.height);
    }

    const {
        targetAnchorYByConnectorShapeId,
        sourceAnchorYByConnectorShapeId,
        pathDByConnectorShapeId,
    } = extractElkConnectorGeometryByConnectorShapeId(laidOutGraph);

    const orderedConnectorsByTarget = buildOrderedConnectorShapeIdsByTargetClaimShapeId(
        model,
        placedClaimShapes,
        targetAnchorYByConnectorShapeId,
        sourceAnchorYByConnectorShapeId,
    );

    const connectorShapeRenderOrder = orderedConnectorsByTarget.targetOrder
        .flatMap((targetClaimShapeId) => orderedConnectorsByTarget.byTarget[targetClaimShapeId]);

    const placedConnectorShapes = withConnectorGeometry(
        placedClaimShapes,
        model.connectorShapes,
        options,
        {
            targetAnchorYByConnectorShapeId,
            sourceAnchorYByConnectorShapeId,
            orderedConnectorShapeIdsByTargetClaimShapeId: orderedConnectorsByTarget.byTarget,
            connectorShapeProcessingOrder: connectorShapeRenderOrder,
            elkPathDByConnectorShapeId: pathDByConnectorShapeId,
        },
    );

    const claimShapeRenderOrder = Object.keys(placedClaimShapes)
        .sort((a, b) => {
            const xOrder = placedClaimShapes[a].x - placedClaimShapes[b].x;
            if (xOrder !== 0) return xOrder;
            const yOrder = placedClaimShapes[a].y - placedClaimShapes[b].y;
            if (yOrder !== 0) return yOrder;
            return a.localeCompare(b);
        });

    const placedModel: LayoutModel = {
        rootClaimShapeId: model.rootClaimShapeId,
        claimShapes: placedClaimShapes,
        connectorShapes: placedConnectorShapes,
        connectorShapeRenderOrder,
        claimShapeRenderOrder,
        cycleMode: model.cycleMode,
        sourceDebateId: model.sourceDebateId,
        layoutEngine: "elkjs",
        layoutBounds: {
            width: laidOutGraph.width ?? maxX,
            height: laidOutGraph.height ?? maxY,
        },
    };

    diagnostics.push({
        level: "info",
        code: "ELK_LAYOUT_COMPLETED",
        message: "Placed claim shapes with ELK layered algorithm.",
        data: {
            claimShapeCount: Object.keys(model.claimShapes).length,
            connectorShapeCount: Object.keys(model.connectorShapes).length,
            rootClaimShapeId: model.rootClaimShapeId,
            boundsWidth: placedModel.layoutBounds.width,
            boundsHeight: placedModel.layoutBounds.height,
        },
    });

    return {
        ok: true,
        model: placedModel,
        diagnostics,
    };
}

function toPlacedClaimShape(claimShape: ClaimShape, placedClaimShapeLayout: ElkClaimShapeLayout): PlacedClaimShape {
    return {
        ...claimShape,
        x: placedClaimShapeLayout.x ?? 0,
        y: placedClaimShapeLayout.y ?? 0,
        width: placedClaimShapeLayout.width,
        height: placedClaimShapeLayout.height,
    };
}

function extractElkConnectorGeometryByConnectorShapeId(laidOutGraph: ElkGraph): {
    targetAnchorYByConnectorShapeId: Record<string, number>;
    sourceAnchorYByConnectorShapeId: Record<string, number>;
    pathDByConnectorShapeId: Record<string, string>;
} {
    const targetAnchorYByConnectorShapeId: Record<string, number> = {};
    const sourceAnchorYByConnectorShapeId: Record<string, number> = {};
    const pathDByConnectorShapeId: Record<string, string> = {};

    for (const edge of laidOutGraph.edges ?? []) {
        const sections = edge.sections ?? [];
        const primarySection = sections[0];
        const targetAnchorY = primarySection?.startPoint?.y;
        const sourceAnchorY = primarySection?.endPoint?.y;
        if (targetAnchorY != null) {
            targetAnchorYByConnectorShapeId[edge.id] = targetAnchorY;
        }
        if (sourceAnchorY != null) {
            sourceAnchorYByConnectorShapeId[edge.id] = sourceAnchorY;
        }

        const pathD = buildPathDFromElkSections(sections);
        if (pathD) {
            pathDByConnectorShapeId[edge.id] = pathD;
        }
    }

    return {
        targetAnchorYByConnectorShapeId,
        sourceAnchorYByConnectorShapeId,
        pathDByConnectorShapeId,
    };
}

function buildPathDFromElkSections(sections: ElkConnectorSectionLayout[]): string | undefined {
    const commands: string[] = [];

    for (const section of sections) {
        const start = section.startPoint;
        const end = section.endPoint;
        if (start?.x == null || start?.y == null || end?.x == null || end?.y == null) {
            continue;
        }

        if (commands.length === 0) {
            commands.push(`M ${start.x} ${start.y}`);
        }

        for (const bendPoint of section.bendPoints ?? []) {
            if (bendPoint.x == null || bendPoint.y == null) continue;
            commands.push(`L ${bendPoint.x} ${bendPoint.y}`);
        }

        commands.push(`L ${end.x} ${end.y}`);
    }

    if (commands.length === 0) return undefined;
    return commands.join(" ");
}

function readElkEdgeThicknessFromLayoutOptions(layoutOptions: Record<string, string> | undefined): string | undefined {
    if (!layoutOptions) return undefined;
    const shortKey = layoutOptions["elk.edge.thickness"];
    if (shortKey != null) return String(shortKey);
    const fullKey = layoutOptions["org.eclipse.elk.edge.thickness"];
    if (fullKey != null) return String(fullKey);
    return undefined;
}

function readElkEdgeThicknessFromProperties(properties: Record<string, unknown> | undefined): string | undefined {
    if (!properties) return undefined;
    const shortKey = properties["elk.edge.thickness"];
    if (shortKey != null) return String(shortKey);
    const fullKey = properties["org.eclipse.elk.edge.thickness"];
    if (fullKey != null) return String(fullKey);
    return undefined;
}

function readElkEdgeThickness(edge: ElkConnectorLayout): string | undefined {
    return readElkEdgeThicknessFromLayoutOptions(edge.layoutOptions)
        ?? readElkEdgeThicknessFromProperties(edge.properties);
}

function logElkThicknessRoundTrip(inputEdges: ElkConnectorLayout[], outputEdges: ElkConnectorLayout[]): void {
    const outputById = new Map<string, ElkConnectorLayout>();
    for (const outputEdge of outputEdges) {
        outputById.set(outputEdge.id, outputEdge);
    }

    const sampleOutputEdge = outputEdges[0];
    const sampleLayoutOptionKeys = sampleOutputEdge?.layoutOptions
        ? Object.keys(sampleOutputEdge.layoutOptions).join(",")
        : "";
    const samplePropertyKeys = sampleOutputEdge?.properties
        ? Object.keys(sampleOutputEdge.properties).join(",")
        : "";
    process.stdout.write(
        `[elk-thickness-keys] layoutOptions=${sampleLayoutOptionKeys || "(none)"} properties=${samplePropertyKeys || "(none)"}\n`,
    );

    for (const inputEdge of inputEdges) {
        const outputEdge = outputById.get(inputEdge.id);
        const thicknessIn = readElkEdgeThickness(inputEdge) ?? "(none)";
        const thicknessOut = outputEdge ? (readElkEdgeThickness(outputEdge) ?? "(none)") : "(edge-missing)";
        process.stdout.write(`[elk-thickness] connector=${inputEdge.id} in=${thicknessIn} out=${thicknessOut}\n`);
    }
}

function buildOrderedConnectorShapeIdsByTargetClaimShapeId(
    model: DraftLayoutModel,
    placedClaimShapes: Record<string, PlacedClaimShape>,
    targetAnchorYByConnectorShapeId: Record<string, number>,
    sourceAnchorYByConnectorShapeId: Record<string, number>,
): OrderedConnectorsByTarget {
    const connectorShapeIdsByTargetClaimShapeId: Record<string, string[]> = {};

    for (const connectorShape of Object.values(model.connectorShapes)) {
        (connectorShapeIdsByTargetClaimShapeId[connectorShape.targetClaimShapeId] ??= []).push(connectorShape.id);
    }

    const orderedConnectorShapeIdsByTargetClaimShapeId: Record<string, string[]> = {};
    for (const [targetClaimShapeId, connectorShapeIds] of Object.entries(connectorShapeIdsByTargetClaimShapeId)) {
        orderedConnectorShapeIdsByTargetClaimShapeId[targetClaimShapeId] = orderConnectorShapeIdsForTarget(
            {
                claimShapes: placedClaimShapes,
                connectorShapes: model.connectorShapes,
                targetAnchorYByConnectorShapeId,
                sourceAnchorYByConnectorShapeId,
            },
            connectorShapeIds,
        );
    }

    const targetOrder = Object.keys(orderedConnectorShapeIdsByTargetClaimShapeId)
        .sort((a, b) => {
            const targetA = placedClaimShapes[a];
            const targetB = placedClaimShapes[b];
            if (!targetA || !targetB) return a.localeCompare(b);
            const xOrder = targetA.x - targetB.x;
            if (xOrder !== 0) return xOrder;
            const yOrder = targetA.y - targetB.y;
            if (yOrder !== 0) return yOrder;
            return a.localeCompare(b);
        });

    return {
        byTarget: orderedConnectorShapeIdsByTargetClaimShapeId,
        targetOrder,
    };
}
