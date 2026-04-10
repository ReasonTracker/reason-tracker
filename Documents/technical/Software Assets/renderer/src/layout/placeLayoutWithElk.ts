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

    const defaultNodeSize = options.defaultNodeSize ?? DEFAULT_NODE_SIZE;
    const nodeSizeByNodeId = options.nodeSizeByNodeId ?? {};
    const nodeSpacing = options.nodeSpacing ?? 40;
    const layerSpacing = options.layerSpacing ?? 96;
    const edgeNodeSpacing = options.edgeNodeSpacing ?? 32;
    const preserveInputOrder = options.preserveInputOrder ?? true;
    const favorStraightEdges = options.favorStraightEdges ?? false;
    const bkFixedAlignment = options.bkFixedAlignment ?? "BALANCED";

    const orderedNodeIds = Object.keys(model.nodes).sort((a, b) => {
        const depthOrder = model.nodes[a].depth - model.nodes[b].depth;
        if (depthOrder !== 0) return depthOrder;
        return a.localeCompare(b);
    });

    const children: ElkChildNode[] = orderedNodeIds.map((nodeId) => {
        const size = nodeSizeByNodeId[nodeId] ?? defaultNodeSize;
        const isRoot = nodeId === model.rootNodeId;

        return {
            id: nodeId,
            width: size.width,
            height: size.height,
            layoutOptions: isRoot
                ? {
                      "elk.layered.layering.layerConstraint": "FIRST",
                  }
                : undefined,
        };
    });

    const edges: ElkEdge[] = Object.values(model.edges)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((edge) => ({
            id: edge.id,
            sources: [edge.fromNodeId],
            targets: [edge.toNodeId],
        }));

    const graph: ElkGraph = {
        id: "reason-tracker-layout",
        children,
        edges,
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.spacing.nodeNode": String(nodeSpacing),
            "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
            "elk.spacing.edgeNode": String(edgeNodeSpacing),
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

    const positionedNodes: Record<string, PositionedLayoutNode> = {};
    let maxX = 0;
    let maxY = 0;

    for (const [nodeId, node] of Object.entries(model.nodes)) {
        const laidOutNode = positionedChildren.get(nodeId);
        if (!laidOutNode || laidOutNode.x == null || laidOutNode.y == null) {
            return {
                ok: false,
                error: {
                    code: "ELK_NODE_NOT_POSITIONED",
                    message: "ELK did not return a position for every node.",
                    details: {
                        nodeId,
                    },
                },
                diagnostics,
            };
        }

        const positionedNode = toPositionedNode(node, laidOutNode);
        positionedNodes[nodeId] = positionedNode;
    }

    for (const positionedNode of Object.values(positionedNodes)) {
        maxX = Math.max(maxX, positionedNode.x + positionedNode.width);
        maxY = Math.max(maxY, positionedNode.y + positionedNode.height);
    }

    const placedModel: PositionedLayoutModel = {
        rootNodeId: model.rootNodeId,
        nodes: positionedNodes,
        edges: model.edges,
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
            nodeCount: Object.keys(model.nodes).length,
            edgeCount: Object.keys(model.edges).length,
            rootNodeId: model.rootNodeId,
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
