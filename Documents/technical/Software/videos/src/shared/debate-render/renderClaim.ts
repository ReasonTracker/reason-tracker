import type { Claim } from "@debate-core/Claim.ts";
import type { PlannerOptions } from "@planner/contracts.ts";
import type { ClaimViz } from "@planner/Snapshot.ts";

import { resolveTweenNumber, resolveTweenPoint } from "./resolveTween";
import { htmlElement, textNode } from "./renderTree";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

export function renderClaim(args: {
    claim: Claim | undefined;
    item: ClaimViz;
    plannerOptions: PlannerOptions;
} & RenderStepProgress): RenderElementNode | undefined {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const scale = resolveTweenNumber(args.item.scale, args.stepProgress);
    const score = resolveTweenNumber(args.item.score, args.stepProgress);
    const width = getPlannerClaimWidth(scale, args.plannerOptions);
    const height = getPlannerClaimHeight(scale, args.plannerOptions);

    if (width <= 0 || height <= 0) {
        return undefined;
    }

    const x = position.x - (width / 2);
    const y = position.y - (height / 2);
    const cardScale = Math.min(
        width / args.plannerOptions.claimWidth,
        height / args.plannerOptions.claimHeight,
    );
    const sideClass = args.item.side === "proMain" ? "pro" : "con";
    const content = args.claim?.content ?? String(args.item.claimId);

    return htmlElement("article", {
        attributes: {
            "class": `rt-debate-render__claim-shell rt-debate-render__claim-shell--${sideClass}`,
            "data-claim-id": String(args.item.claimId),
            "data-claim-side": args.item.side,
        },
        styles: {
            height,
            left: x,
            opacity: 1,
            top: y,
            width,
        },
        children: [
            htmlElement("div", {
                attributes: {
                    "class": "rt-debate-render__claim-frame",
                },
                styles: {
                    "--rt-claim-card-scale": String(cardScale),
                },
                children: [
                    htmlElement("div", {
                        attributes: {
                            "class": `rt-debate-render__claim-card rt-debate-render__claim-card--${sideClass}`,
                        },
                        children: [
                            htmlElement("div", {
                                attributes: {
                                    "class": "rt-debate-render__claim-content",
                                },
                                children: [textNode(content)],
                            }),
                            htmlElement("div", {
                                attributes: {
                                    "class": "rt-debate-render__claim-score",
                                },
                                children: [
                                    htmlElement("span", {
                                        attributes: {
                                            "class": "rt-debate-render__claim-score-value",
                                        },
                                        children: [textNode(`${Math.round(score * 100)}%`)],
                                    }),
                                    htmlElement("small", {
                                        attributes: {
                                            "class": "rt-debate-render__claim-score-caption",
                                        },
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

export function getClaimBounds(args: {
    item: ClaimViz;
    plannerOptions: PlannerOptions;
} & RenderStepProgress): { maxX: number; maxY: number } {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const scale = resolveTweenNumber(args.item.scale, args.stepProgress);

    return {
        maxX: position.x + (getPlannerClaimWidth(scale, args.plannerOptions) / 2),
        maxY: position.y + (getPlannerClaimHeight(scale, args.plannerOptions) / 2),
    };
}

export function getPlannerClaimWidth(scale: number, plannerOptions: PlannerOptions): number {
    return Math.round(plannerOptions.claimWidth * clampVisualScale(scale));
}

export function getPlannerClaimHeight(scale: number, plannerOptions: PlannerOptions): number {
    return Math.round(plannerOptions.claimHeight * clampVisualScale(scale));
}

function clampVisualScale(scale: number): number {
    if (!Number.isFinite(scale)) {
        return 1;
    }

    return Math.min(1, Math.max(0, scale));
}
