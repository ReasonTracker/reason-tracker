import type { ClaimViz } from "../../../app/src/app.js";
import {
    getPlannerClaimHeight,
    getPlannerClaimWidth,
} from "../../../app/src/planner/plannerVisualGeometry.ts";

import { boundsFromCenteredRect } from "./bounds";
import {
    BASE_NODE_HEIGHT_PX,
    BASE_NODE_WIDTH_PX,
    CLAIM_CONTENT_STYLES,
    CLAIM_SCORE_CAPTION_STYLES,
    CLAIM_SCORE_CONTAINER_STYLES,
    CLAIM_SCORE_VALUE_STYLES,
    formatScoreValue,
    resolveSideFill,
    resolveSideStroke,
} from "./sceneConstants";
import { renderPlannerSnapshotScene } from "./renderPlannerSnapshotScene";
import { resolvePresenceOpacity, resolveTweenNumber, resolveTweenPoint } from "./resolveTween";
import type {
    Bounds,
    PlannerSnapshotRenderResult,
    RenderElementNode,
    SnapshotRenderInput,
} from "./renderTypes";
import { htmlElement, textNode } from "./renderTree";

export type ClaimRenderModel = {
    claimId: string;
    centerX: number;
    centerY: number;
    bounds: Bounds;
    content: string;
    height: number;
    id: string;
    opacity: number;
    scale: number;
    score: number;
    scoreNodeId?: string;
    side: ClaimViz["side"];
    width: number;
    x: number;
    y: number;
};

export function buildClaimRenderModel(visual: ClaimViz, percent: number): ClaimRenderModel | undefined {
    const center = resolveTweenPoint(visual.position, percent);
    const scale = Math.max(0, resolveTweenNumber(visual.scale, percent));
    const width = getPlannerClaimWidth(scale);
    const height = getPlannerClaimHeight(scale);
    const opacity = resolvePresenceOpacity(visual.scale, percent);

    if (width <= 0 || height <= 0 || opacity <= 0) {
        return undefined;
    }

    return {
        claimId: String(visual.claimId),
        centerX: center.x,
        centerY: center.y,
        bounds: boundsFromCenteredRect(center.x, center.y, width, height),
        content: visual.content ?? String(visual.claimId),
        height,
        id: String(visual.id),
        opacity,
        scale,
        score: resolveTweenNumber(visual.score, percent),
        scoreNodeId: visual.scoreNodeId ? String(visual.scoreNodeId) : undefined,
        side: visual.side,
        width,
        x: center.x - width / 2,
        y: center.y - height / 2,
    };
}

export function renderClaim(model: ClaimRenderModel, offset: { x: number; y: number }): RenderElementNode {
    const cardScale = Math.min(
        model.width / BASE_NODE_WIDTH_PX,
        model.height / BASE_NODE_HEIGHT_PX,
    );

    return htmlElement("article", {
        attributes: {
            "data-claim-id": model.claimId,
            "data-claim-side": model.side,
            "data-score-id": model.scoreNodeId,
        },
        styles: {
            boxSizing: "border-box",
            height: model.height,
            left: model.x + offset.x,
            opacity: model.opacity,
            overflow: "visible",
            position: "absolute",
            top: model.y + offset.y,
            width: model.width,
        },
        children: [
            htmlElement("div", {
                styles: {
                    height: BASE_NODE_HEIGHT_PX,
                    left: "50%",
                    position: "absolute",
                    top: "50%",
                    transform: `translate(-50%, -50%) scale(${cardScale})`,
                    transformOrigin: "center center",
                    width: BASE_NODE_WIDTH_PX,
                },
                children: [
                    htmlElement("div", {
                        styles: {
                            background: resolveSideFill(model.side, 0.3),
                            border: `4px solid ${resolveSideStroke(model.side)}`,
                            boxSizing: "border-box",
                            display: "flex",
                            flexDirection: "column",
                            height: "100%",
                            justifyContent: "space-between",
                            overflow: "hidden",
                            padding: "16px 20px 14px",
                            width: "100%",
                        },
                        children: [
                            htmlElement("div", {
                                styles: CLAIM_CONTENT_STYLES,
                                children: [textNode(model.content)],
                            }),
                            htmlElement("div", {
                                styles: CLAIM_SCORE_CONTAINER_STYLES,
                                children: [
                                    htmlElement("span", {
                                        styles: CLAIM_SCORE_VALUE_STYLES,
                                        children: [textNode(formatScoreValue(model.score))],
                                    }),
                                    htmlElement("small", {
                                        styles: CLAIM_SCORE_CAPTION_STYLES,
                                        children: [textNode("confidence")],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}

export function renderClaimAdjustSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "claimAdjust",
    });
}