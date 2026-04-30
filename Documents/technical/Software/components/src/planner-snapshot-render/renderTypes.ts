import type {
    ScoreWaveFrame,
    ScoreWaveSpecialCase,
    ScoreWaveStepType,
    Snapshot,
} from "../../../app/src/app.js";

export type RenderAttributeValue = string | number | boolean;
export type RenderStyleValue = string | number;

export interface RenderElementNode {
    kind: "element";
    namespace: "html" | "svg";
    tagName: string;
    attributes?: Record<string, RenderAttributeValue | undefined>;
    styles?: Record<string, RenderStyleValue | undefined>;
    children?: RenderNode[];
}

export interface RenderTextNode {
    kind: "text";
    text: string;
}

export type RenderNode = RenderElementNode | RenderTextNode;

export type Bounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

export type SnapshotRenderInput = {
    snapshot: Snapshot;
    percent: number;
    viewportBounds?: Bounds;
};

export type ScoreWaveFrameRenderInput = {
    frame: ScoreWaveFrame;
    percent: number;
    viewportBounds?: Bounds;
};

export type PlannerSnapshotRenderMode = ScoreWaveStepType | ScoreWaveSpecialCase;

export type PlannerSnapshotRenderResult = {
    root: RenderElementNode;
};