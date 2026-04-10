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

export interface LayoutNode {
    id: string;
    claimId: ClaimId;
    score: Score | undefined;
    depth: number;
    isRoot: boolean;
    isLeaf: boolean;
    parentId?: string;
}

export interface LayoutEdge {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    sourceClaimId: ClaimId;
    targetClaimId: ClaimId;
    connectorId: string;
    affects: Affects;
    proTarget: boolean;
    skippedInCycleMode?: boolean;
}

export interface LayoutModel {
    rootNodeId: string;
    nodes: Record<string, LayoutNode>;
    edges: Record<string, LayoutEdge>;
    cycleMode: CycleMode;
    sourceDebateId: DebateId;
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
