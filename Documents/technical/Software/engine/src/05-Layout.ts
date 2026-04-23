import type { ClaimId } from "./00-entities/Claim.ts";
import type { ConnectorId } from "./00-entities/Connector.ts";
import type { Debate } from "./00-entities/Debate.ts";
import type { Score, ScoreId } from "./00-entities/Score.ts";

// AGENT NOTE: Keep layout sizing and spacing tunables grouped here so future tuning stays in one place.
/** Full-size claim box width before score scaling is applied. */
const BASE_NODE_WIDTH_PX = 360;
/** Full-size claim box height before score scaling is applied. */
const BASE_NODE_HEIGHT_PX = 176;
/** Smallest visible scale used for preview boxes so zero-scale scores still render inspectable geometry. */
const MIN_VISIBLE_LAYOUT_SCALE = 0.4;
/** Full-size horizontal distance between one depth column and the next. */
const BASE_HORIZONTAL_GAP_PX = 528;
/** Minimum horizontal distance retained when source scores shrink heavily. */
const MIN_HORIZONTAL_GAP_PX = 264;
/** Full-size vertical distance between sibling subtree blocks. */
const BASE_VERTICAL_GAP_PX = 72;
/** Minimum vertical distance retained for dense groups of small source scores. */
const MIN_VERTICAL_GAP_PX = 28;
/** Default left offset for exported layout coordinates. */
const DEFAULT_ORIGIN_X_PX = 96;
/** Default top offset for exported layout coordinates. */
const DEFAULT_ORIGIN_Y_PX = 96;

export interface DebateLayoutOptions {
    originX?: number
    originY?: number
}

export interface LayoutBounds {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
}

export interface DebateLayoutNode {
    scoreId: ScoreId
    claimId: ClaimId
    claimContent: string
    structuralParentScoreId: ScoreId | null
    layoutParentScoreId: ScoreId | null
    connectorId?: ConnectorId
    connectorType: "root" | "confidence" | "relevance"
    depth: number
    x: number
    y: number
    width: number
    height: number
    scaleOfSources: number
    layoutScale: number
}

export interface DebateLayout {
    rootScoreId: ScoreId
    nodesInOrder: DebateLayoutNode[]
    bounds: LayoutBounds
}

type LayoutParentScoreId = ScoreId | null;

interface LayoutRecord {
    scoreId: ScoreId
    structuralParentScoreId: ScoreId | null
    layoutParentScoreId: LayoutParentScoreId
    connectorId?: ConnectorId
    connectorType: DebateLayoutNode["connectorType"]
    depth: number
}

interface DerivedLayoutTree {
    recordByScoreId: ReadonlyMap<ScoreId, LayoutRecord>
    childScoreIdsByLayoutParentScoreId: ReadonlyMap<LayoutParentScoreId, readonly ScoreId[]>
}

type DraftLayoutNode = Omit<DebateLayoutNode, "x" | "y"> & {
    children: DraftLayoutNode[]
    childrenBlockHeight: number
    subtreeHeight: number
};

export function layoutDebate(debate: Debate, options: DebateLayoutOptions = {}): DebateLayout {
    const originX = options.originX ?? DEFAULT_ORIGIN_X_PX;
    const originY = options.originY ?? DEFAULT_ORIGIN_Y_PX;
    const rootScore = getRequiredMainClaimRootScore(debate);
    const derivedLayoutTree = deriveLayoutTree(debate, rootScore.id);
    const nodesByDepth = new Map<number, DraftLayoutNode[]>();
    const rootNode = buildDraftLayoutNode({
        debate,
        scoreId: rootScore.id,
        derivedLayoutTree,
        nodesByDepth,
    });
    const columnLeftByDepth = buildColumnLeftByDepth(nodesByDepth, originX);
    const nodesInOrder: DebateLayoutNode[] = [];

    positionDraftLayoutNode(rootNode, originY);

    return {
        rootScoreId: rootScore.id,
        nodesInOrder,
        bounds: buildLayoutBounds(nodesInOrder),
    };

    function positionDraftLayoutNode(node: DraftLayoutNode, top: number): void {
        nodesInOrder.push({
            ...node,
            x: columnLeftByDepth[node.depth] ?? originX,
            y: Math.round(top + ((node.subtreeHeight - node.height) / 2)),
        });

        if (node.children.length < 1) {
            return;
        }

        const childGap = getVerticalGap(node.layoutScale);
        let childTop = top + ((node.subtreeHeight - node.childrenBlockHeight) / 2);
        for (const child of node.children) {
            positionDraftLayoutNode(child, childTop);
            childTop += child.subtreeHeight + childGap;
        }
    }
}

function buildDraftLayoutNode(args: {
    debate: Debate
    scoreId: ScoreId
    derivedLayoutTree: DerivedLayoutTree
    nodesByDepth: Map<number, DraftLayoutNode[]>
}): DraftLayoutNode {
    const layoutRecord = args.derivedLayoutTree.recordByScoreId.get(args.scoreId);
    if (!layoutRecord) {
        throw new Error(`Layout record for score ${args.scoreId} was not found.`);
    }

    const score = getRequiredScore(args.debate, args.scoreId);
    const claim = args.debate.claims[score.claimId];
    if (!claim) {
        throw new Error(`Claim ${score.claimId} was not found for score ${score.id}.`);
    }

    const layoutScale = toVisibleLayoutScale(score.scaleOfSources);
    const children = (args.derivedLayoutTree.childScoreIdsByLayoutParentScoreId.get(score.id) ?? []).map((childScoreId) => buildDraftLayoutNode({
        debate: args.debate,
        scoreId: childScoreId,
        derivedLayoutTree: args.derivedLayoutTree,
        nodesByDepth: args.nodesByDepth,
    }));
    const childGap = getVerticalGap(layoutScale);
    const childrenBlockHeight = children.reduce(
        (totalHeight, child, childIndex) => totalHeight + child.subtreeHeight + (childIndex > 0 ? childGap : 0),
        0,
    );
    const node: DraftLayoutNode = {
        scoreId: score.id,
        claimId: score.claimId,
        claimContent: claim.content,
        structuralParentScoreId: layoutRecord.structuralParentScoreId,
        layoutParentScoreId: layoutRecord.layoutParentScoreId,
        connectorId: layoutRecord.connectorId,
        connectorType: layoutRecord.connectorType,
        depth: layoutRecord.depth,
        width: Math.round(BASE_NODE_WIDTH_PX * layoutScale),
        height: Math.round(BASE_NODE_HEIGHT_PX * layoutScale),
        scaleOfSources: score.scaleOfSources,
        layoutScale,
        children,
        childrenBlockHeight,
        subtreeHeight: Math.max(Math.round(BASE_NODE_HEIGHT_PX * layoutScale), childrenBlockHeight),
    };
    const depthNodes = args.nodesByDepth.get(layoutRecord.depth);
    if (depthNodes) {
        depthNodes.push(node);
    } else {
        args.nodesByDepth.set(layoutRecord.depth, [node]);
    }

    return node;
}

function deriveLayoutTree(debate: Debate, rootScoreId: ScoreId): DerivedLayoutTree {
    const recordByScoreId = new Map<ScoreId, LayoutRecord>();
    const childScoreIdsByLayoutParentScoreId = new Map<LayoutParentScoreId, ScoreId[]>();

    visitScore({
        scoreId: rootScoreId,
        structuralParentScoreId: null,
        layoutParentScoreId: null,
        depth: 0,
        pathScoreIds: new Set<ScoreId>(),
    });

    return {
        recordByScoreId,
        childScoreIdsByLayoutParentScoreId,
    };

    function visitScore(args: {
        scoreId: ScoreId
        structuralParentScoreId: ScoreId | null
        layoutParentScoreId: LayoutParentScoreId
        depth: number
        pathScoreIds: Set<ScoreId>
    }): void {
        if (args.pathScoreIds.has(args.scoreId)) {
            throw new Error(`Cycle detected while laying out score ${args.scoreId}.`);
        }

        if (recordByScoreId.has(args.scoreId)) {
            throw new Error(`Score ${args.scoreId} was encountered more than once while deriving layout parents.`);
        }

        const score = getRequiredScore(debate, args.scoreId);
        const connectorDescriptor = describeConnector(debate, score);
        recordByScoreId.set(args.scoreId, {
            scoreId: args.scoreId,
            structuralParentScoreId: args.structuralParentScoreId,
            layoutParentScoreId: args.layoutParentScoreId,
            connectorId: connectorDescriptor.connectorId,
            connectorType: connectorDescriptor.connectorType,
            depth: args.depth,
        });

        if (args.layoutParentScoreId !== null) {
            const existingChildScoreIds = childScoreIdsByLayoutParentScoreId.get(args.layoutParentScoreId);
            if (existingChildScoreIds) {
                existingChildScoreIds.push(args.scoreId);
            } else {
                childScoreIdsByLayoutParentScoreId.set(args.layoutParentScoreId, [args.scoreId]);
            }
        }

        const nextPathScoreIds = new Set(args.pathScoreIds);
        nextPathScoreIds.add(args.scoreId);

        for (const incomingScoreId of score.incomingScoreIds) {
            const incomingScore = getRequiredScore(debate, incomingScoreId);
            const incomingConnectorDescriptor = describeConnector(debate, incomingScore);
            const nextDepth = incomingConnectorDescriptor.connectorType === "relevance"
                ? args.depth
                : args.depth + 1;
            const nextLayoutParentScoreId = incomingConnectorDescriptor.connectorType === "relevance"
                ? args.layoutParentScoreId
                : score.id;

            visitScore({
                scoreId: incomingScoreId,
                structuralParentScoreId: score.id,
                layoutParentScoreId: nextLayoutParentScoreId,
                depth: nextDepth,
                pathScoreIds: nextPathScoreIds,
            });
        }
    }
}

function buildColumnLeftByDepth(nodesByDepth: ReadonlyMap<number, readonly DraftLayoutNode[]>, originX: number): number[] {
    const depths = [...nodesByDepth.keys()];
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
    const columnLeftByDepth: number[] = [originX];

    for (let depth = 1; depth <= maxDepth; depth += 1) {
        const previousColumnLeft = columnLeftByDepth[depth - 1] ?? originX;
        let nextColumnLeft = previousColumnLeft;

        for (const node of nodesByDepth.get(depth - 1) ?? []) {
            nextColumnLeft = Math.max(
                nextColumnLeft,
                previousColumnLeft + node.width + getHorizontalGap(node.layoutScale),
            );
        }

        columnLeftByDepth[depth] = nextColumnLeft;
    }

    return columnLeftByDepth;
}

function buildLayoutBounds(nodes: readonly DebateLayoutNode[]): LayoutBounds {
    if (nodes.length < 1) {
        return {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
        };
    }

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
        left = Math.min(left, node.x);
        top = Math.min(top, node.y);
        right = Math.max(right, node.x + node.width);
        bottom = Math.max(bottom, node.y + node.height);
    }

    return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
    };
}

function describeConnector(debate: Debate, score: Score): {
    connectorId?: ConnectorId
    connectorType: DebateLayoutNode["connectorType"]
} {
    if (!score.connectorId) {
        return {
            connectorType: "root",
        };
    }

    const connector = debate.connectors[score.connectorId];
    if (!connector) {
        throw new Error(`Connector ${score.connectorId} was not found for score ${score.id}.`);
    }

    return {
        connectorId: connector.id,
        connectorType: connector.type,
    };
}

function getRequiredMainClaimRootScore(debate: Debate): Score {
    const parentedScoreIds = new Set<ScoreId>();
    for (const score of Object.values(debate.scores)) {
        for (const incomingScoreId of score.incomingScoreIds) {
            parentedScoreIds.add(incomingScoreId);
        }
    }

    const rootCandidates = Object.values(debate.scores).filter(
        (score) => score.claimId === debate.mainClaimId && !parentedScoreIds.has(score.id),
    );
    if (rootCandidates.length !== 1) {
        throw new Error(
            `Expected exactly one unparented root score for main claim ${debate.mainClaimId}, found ${rootCandidates.length}.`,
        );
    }

    return rootCandidates[0];
}

function getRequiredScore(debate: Debate, scoreId: ScoreId): Score {
    const score = debate.scores[scoreId];
    if (!score) {
        throw new Error(`Score ${scoreId} was not found in the debate.`);
    }

    return score;
}

function toVisibleLayoutScale(scaleOfSources: number): number {
    const normalizedScale = clamp(Number.isFinite(scaleOfSources) ? scaleOfSources : 1, 0, 1);
    return MIN_VISIBLE_LAYOUT_SCALE + ((1 - MIN_VISIBLE_LAYOUT_SCALE) * normalizedScale);
}

function getHorizontalGap(layoutScale: number): number {
    return Math.round(interpolate(layoutScale, MIN_HORIZONTAL_GAP_PX, BASE_HORIZONTAL_GAP_PX));
}

function getVerticalGap(layoutScale: number): number {
    return Math.round(interpolate(layoutScale, MIN_VERTICAL_GAP_PX, BASE_VERTICAL_GAP_PX));
}

function interpolate(multiplier: number, minimum: number, maximum: number): number {
    return minimum + ((maximum - minimum) * clamp(multiplier, 0, 1));
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}