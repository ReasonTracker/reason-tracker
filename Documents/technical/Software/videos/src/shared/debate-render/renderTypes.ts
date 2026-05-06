import type { DebateCore } from "@debate-core/Debate.ts";
import type { PlannerOptions } from "@planner/contracts.ts";
import type {
    Snapshot,
} from "@planner/Snapshot.ts";

export type DebateSnapshotRenderState = {
    debateCore: DebateCore;
    plannerOptions?: Partial<PlannerOptions>;
    snapshot: Snapshot;
};

export type RenderStepProgress = {
    stepProgress: number;
};

export type RenderAttributeValue = boolean | number | string;
export type RenderStyleValue = number | string;

export interface RenderTextNode {
    kind: "text";
    text: string;
}

export interface RenderElementNode {
    kind: "element";
    namespace: "html" | "svg";
    tagName: string;
    attributes?: Record<string, RenderAttributeValue | undefined>;
    styles?: Record<string, RenderStyleValue | undefined>;
    children?: RenderNode[];
}

export type RenderNode = RenderElementNode | RenderTextNode;

export type DebateRenderResult = {
    height: number;
    root: RenderElementNode;
    width: number;
};