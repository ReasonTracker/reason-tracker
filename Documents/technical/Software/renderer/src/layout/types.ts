import type {
    Affects,
    CalculatedDebate,
    ClaimSide,
    ClaimId,
    ConnectorId,
    DebateId,
    ScoreId,
    TargetRelation,
} from "@reasontracker/contracts";

export type CycleMode = "preserve" | "unroll-dag";

export type SiblingOrderingMode = "preserve-input" | "auto-reorder";

export interface DagOptions {
    maxInstancesMultiplier?: number;
    connectorOrder?: "id-asc" | "source-asc-then-id";
}

export interface BuildLayoutModelRequest {
    calculatedDebate: CalculatedDebate;
    cycleMode?: CycleMode;
    dagOptions?: DagOptions;
    siblingOrderingMode?: SiblingOrderingMode;
}

export interface ClaimShape {
    id: string;
    claimId: ClaimId;
    claim: CalculatedDebate["claims"][ClaimId];
    score: CalculatedDebate["scores"][ClaimId] | undefined;
    depth: number;
    isRoot: boolean;
    isLeaf: boolean;
    parentId?: string;
}

export interface ClaimShapeSize {
    width: number;
    height: number;
}

export interface ConnectorGeometry {
    targetSideY: number;
    sourceSideY: number;
    strokeWidth: number;
    referenceStrokeWidth: number;
    pathD: string;
}

export interface ConnectorShape {
    id: string;
    targetClaimShapeId: string;
    sourceClaimShapeId: string;
    sourceClaimId: ClaimId;
    targetClaimId: ClaimId;
    connectorId: ConnectorId;
    connector: CalculatedDebate["connectors"][ConnectorId];
    affects: Affects;
    targetRelation: TargetRelation;
    // Separation of duties: when present, geometry was computed by layout.
    // Render adapters must consume this directly and avoid recalculating connector routes.
    geometry?: ConnectorGeometry;
    skippedInCycleMode?: boolean;
}

export interface DraftLayoutModel {
    rootClaimShapeId: string;
    claimShapes: Record<string, ClaimShape>;
    connectorShapes: Record<string, ConnectorShape>;
    cycleMode: CycleMode;
    sourceDebateId: DebateId;
}

export interface PlacedClaimShape extends ClaimShape, ClaimShapeSize {
    x: number;
    y: number;
}

export interface LayoutModel {
    rootClaimShapeId: string;
    claimShapes: Record<string, PlacedClaimShape>;
    connectorShapes: Record<string, ConnectorShape>;
    // Draw order is layout-owned; adapters should render in this sequence.
    connectorShapeRenderOrder: string[];
    claimShapeRenderOrder: string[];
    cycleMode: CycleMode;
    sourceDebateId: DebateId;
    layoutEngine: "elkjs";
    layoutBounds: {
        width: number;
        height: number;
    };
}

export interface GraphClaimVisualState {
    claimId: ClaimId;
    scoreId?: ScoreId;
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    side: ClaimSide;
    label: string;
    content: string;
    confidence: number;
    reversibleConfidence: number;
    relevance: number;
}

export interface GraphConnectorVisualState {
    connectorId: ConnectorId;
    sourceClaimId: ClaimId;
    targetClaimId: ClaimId;
    affects: Affects;
    side: ClaimSide;
    pathD: string;
    strokeWidth: number;
    referenceStrokeWidth: number;
    sourceSideY: number;
    targetSideY: number;
}

export interface GraphAnimationSnapshot {
    debateId: DebateId;
    width: number;
    height: number;
    claimVisualByClaimId: Record<ClaimId, GraphClaimVisualState>;
    connectorVisualByConnectorId: Record<ConnectorId, GraphConnectorVisualState>;
    claimRenderOrder: ClaimId[];
    connectorRenderOrder: ConnectorId[];
}

export interface LayoutOptions {
    siblingOrderingMode?: SiblingOrderingMode;
    defaultClaimShapeSize?: ClaimShapeSize;
    claimShapeSizeByClaimShapeId?: Record<string, ClaimShapeSize>;
    peerGap?: number;
    layerGap?: number;
    connectorClaimShapeGap?: number;
    sourceSideStraightSegmentPercent?: number;
    targetSideStraightSegmentPercent?: number;
    spreadTargetAnchorY?: boolean;
    connectorPathShape?: "straight" | "curved" | "sharp-corners" | "elk-bends";
    preserveInputOrder?: boolean;
    favorStraightEdges?: boolean;
    bkFixedAlignment?: "NONE" | "BALANCED" | "LEFTUP" | "RIGHTUP" | "LEFTDOWN" | "RIGHTDOWN";
    debugConnectorOrder?: boolean;
}

export type PlaceLayoutWithElkOptions = LayoutOptions;

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
    model: DraftLayoutModel;
    diagnostics: LayoutDiagnostic[];
}

export type BuildLayoutModelResult = BuildLayoutModelSuccess | BuildLayoutModelFailure;

export interface PlaceLayoutWithElkFailure {
    ok: false;
    error: {
        code: "ELK_LAYOUT_FAILED" | "ELK_CLAIM_SHAPE_NOT_PLACED";
        message: string;
        details?: Record<string, unknown>;
    };
    diagnostics: LayoutDiagnostic[];
}

export interface PlaceLayoutWithElkSuccess {
    ok: true;
    model: LayoutModel;
    diagnostics: LayoutDiagnostic[];
}

export type PlaceLayoutWithElkResult = PlaceLayoutWithElkSuccess | PlaceLayoutWithElkFailure;
