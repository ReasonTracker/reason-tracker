import ELK from "elkjs/lib/elk.bundled.js";
import type {
    LayoutDiagnostic,
    LayoutModel,
    LayoutNode,
    NodeSize,
    PlaceLayoutWithElkOptions,
    PlaceLayoutWithElkResult,
    PositionedLayoutModel,
    PositionedLayoutNode,
} from "./types.ts";
import { compareConnectorPreference, orderClaimShapeIdsForElk } from "./ordering.ts";

interface ElkChildNode {
    id: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
    layoutOptions?: Record<string, string>;
}

interface ElkEdge {
    id: string;
    sources: string[];
    targets: string[];
}

interface ElkGraph {
    id: string;
    children?: ElkChildNode[];
    edges?: ElkEdge[];
    width?: number;
    height?: number;
    layoutOptions?: Record<string, string>;
}

interface ElkLayoutApi {
    layout: (graph: unknown) => Promise<unknown>;
}

const DEFAULT_NODE_SIZE: NodeSize = {
    width: 320,
    height: 180,
};

export async function placeLayoutWithElk(
    model: LayoutModel,
    options: PlaceLayoutWithElkOptions = {},
): Promise<PlaceLayoutWithElkResult> {
    const diagnostics: LayoutDiagnostic[] = [];

    const defaultClaimShapeSize = options.defaultClaimShapeSize ?? DEFAULT_NODE_SIZE;
    const claimShapeSizeByClaimShapeId = options.claimShapeSizeByClaimShapeId ?? {};
    const claimShapeSpacing = options.claimShapeSpacing ?? 40;
    const layerSpacing = options.layerSpacing ?? 96;
    const connectorClaimShapeSpacing = options.connectorClaimShapeSpacing ?? 32;
    const preserveInputOrder = options.preserveInputOrder ?? true;
    const favorStraightEdges = options.favorStraightEdges ?? false;
    const bkFixedAlignment = options.bkFixedAlignment ?? "BALANCED";

    const orderedClaimShapeIds = orderClaimShapeIdsForElk(model);

    const children: ElkChildNode[] = orderedClaimShapeIds.map((claimShapeId) => {
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

    const connectorShapes: ElkEdge[] = Object.values(model.connectorShapes)
        .sort((a, b) => compareConnectorPreference(model, a.id, b.id))
        .map((connectorShape) => ({
            id: connectorShape.id,
            sources: [connectorShape.targetClaimShapeId],
            targets: [connectorShape.sourceClaimShapeId],
        }));

    const graph: ElkGraph = {
        id: "reason-tracker-layout",
        children,
        edges: connectorShapes,
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.spacing.nodeNode": String(claimShapeSpacing),
            "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
            "elk.spacing.edgeNode": String(connectorClaimShapeSpacing),
            "elk.layered.cycleBreaking.strategy": "GREEDY",
            "elk.layered.nodePlacement.favorStraightEdges": favorStraightEdges ? "true" : "false",
            "elk.layered.nodePlacement.bk.fixedAlignment": bkFixedAlignment,
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

    const positionedChildren = new Map<string, ElkChildNode>();
    for (const child of laidOutGraph.children ?? []) {
        positionedChildren.set(child.id, child);
    }

    const positionedClaimShapes: Record<string, PositionedLayoutNode> = {};
    let maxX = 0;
    let maxY = 0;

    for (const [claimShapeId, claimShape] of Object.entries(model.claimShapes)) {
        const laidOutNode = positionedChildren.get(claimShapeId);
        if (!laidOutNode || laidOutNode.x == null || laidOutNode.y == null) {
            return {
                ok: false,
                error: {
                    code: "ELK_NODE_NOT_POSITIONED",
                    message: "ELK did not return a position for every node.",
                    details: {
                        claimShapeId,
                    },
                },
                diagnostics,
            };
        }

        const positionedNode = toPositionedNode(claimShape, laidOutNode);
        positionedClaimShapes[claimShapeId] = positionedNode;
    }

    for (const positionedNode of Object.values(positionedClaimShapes)) {
        maxX = Math.max(maxX, positionedNode.x + positionedNode.width);
        maxY = Math.max(maxY, positionedNode.y + positionedNode.height);
    }

    const placedModel: PositionedLayoutModel = {
        rootClaimShapeId: model.rootClaimShapeId,
        claimShapes: positionedClaimShapes,
        connectorShapes: model.connectorShapes,
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
        message: "Placed layout nodes with ELK layered algorithm.",
        data: {
            nodeCount: Object.keys(model.claimShapes).length,
            edgeCount: Object.keys(model.connectorShapes).length,
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

function toPositionedNode(node: LayoutNode, laidOutNode: ElkChildNode): PositionedLayoutNode {
    return {
        ...node,
        x: laidOutNode.x ?? 0,
        y: laidOutNode.y ?? 0,
        width: laidOutNode.width,
        height: laidOutNode.height,
    };
}
