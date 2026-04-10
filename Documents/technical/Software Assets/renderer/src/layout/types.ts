import type {
    Affects,
    CalculatedDebate,
    ClaimId,
    DebateId,
    Score,
} from "@reasontracker/contracts";

export type CycleMode = "preserve" | "unroll-dag";

export interface DagOptions {
    maxInstancesMultiplier?: number;
    connectorOrder?: "id-asc" | "source-asc-then-id";
}

export interface BuildLayoutModelRequest {
    calculatedDebate: CalculatedDebate;
    cycleMode?: CycleMode;
    dagOptions?: DagOptions;
}

export interface LayoutClaimShape {
    id: string;
    claimId: ClaimId;
    score: Score | undefined;
    depth: number;
    isRoot: boolean;
    isLeaf: boolean;
    parentId?: string;
}

export type LayoutNode = LayoutClaimShape;

export interface ClaimShapeSize {
    width: number;
    height: number;
}

export type NodeSize = ClaimShapeSize;

export interface LayoutConnectorShape {
    id: string;
    targetClaimShapeId: string;
    sourceClaimShapeId: string;
    sourceClaimId: ClaimId;
    targetClaimId: ClaimId;
    connectorId: string;
    affects: Affects;
    proTarget: boolean;
    skippedInCycleMode?: boolean;
}

export type LayoutEdge = LayoutConnectorShape;

export interface LayoutModel {
    rootClaimShapeId: string;
    claimShapes: Record<string, LayoutNode>;
    connectorShapes: Record<string, LayoutEdge>;
    cycleMode: CycleMode;
    sourceDebateId: DebateId;
}

export interface PositionedLayoutClaimShape extends LayoutNode, NodeSize {
    x: number;
    y: number;
}

export type PositionedLayoutNode = PositionedLayoutClaimShape;

export interface PositionedLayoutModel {
    rootClaimShapeId: string;
    claimShapes: Record<string, PositionedLayoutClaimShape>;
    connectorShapes: Record<string, LayoutEdge>;
    cycleMode: CycleMode;
    sourceDebateId: DebateId;
    layoutEngine: "elkjs";
    layoutBounds: {
        width: number;
        height: number;
    };
}

export interface PlaceLayoutWithElkOptions {
    defaultClaimShapeSize?: ClaimShapeSize;
    claimShapeSizeByClaimShapeId?: Record<string, ClaimShapeSize>;
    claimShapeSpacing?: number;
    layerSpacing?: number;
    connectorClaimShapeSpacing?: number;
    preserveInputOrder?: boolean;
    favorStraightEdges?: boolean;
    bkFixedAlignment?: "NONE" | "BALANCED" | "LEFTUP" | "RIGHTUP" | "LEFTDOWN" | "RIGHTDOWN";
}

export interface ContributorNodeSizingOptions {
    applyConfidenceScale?: boolean;
    applyRelevanceScale?: boolean;
    defaultClaimShapeSize?: ClaimShapeSize;
}

export interface ContributorNodeSizingResult {
    claimShapeSizeByClaimShapeId: Record<string, ClaimShapeSize>;
    claimShapeScaleByClaimShapeId: Record<string, number>;
}

export interface LayoutDiagnostic {
    level: "info" | "warn" | "error";
    code: string;
    message: string;
    data?: Record<string, unknown>;
}

export interface BuildLayoutModelFailure {
    ok: false;
    error: {
        code: "DAG_UNROLL_LIMIT_EXCEEDED" | "INVALID_MAIN_CLAIM" | "MISSING_CLAIM";
        message: string;
        details?: Record<string, unknown>;
    };
    diagnostics: LayoutDiagnostic[];
}

export interface BuildLayoutModelSuccess {
    ok: true;
    model: LayoutModel;
    diagnostics: LayoutDiagnostic[];
}

export type BuildLayoutModelResult = BuildLayoutModelSuccess | BuildLayoutModelFailure;

export interface PlaceLayoutWithElkFailure {
    ok: false;
    error: {
        code: "ELK_LAYOUT_FAILED" | "ELK_NODE_NOT_POSITIONED";
        message: string;
        details?: Record<string, unknown>;
    };
    diagnostics: LayoutDiagnostic[];
}

export interface PlaceLayoutWithElkSuccess {
    ok: true;
    model: PositionedLayoutModel;
    diagnostics: LayoutDiagnostic[];
}

export type PlaceLayoutWithElkResult = PlaceLayoutWithElkSuccess | PlaceLayoutWithElkFailure;
