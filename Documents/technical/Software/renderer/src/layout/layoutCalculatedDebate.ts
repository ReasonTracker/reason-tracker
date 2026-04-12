import type { CalculatedDebate } from "@reasontracker/contracts";
import { buildLayoutModel } from "./buildLayoutModel.ts";
import { computeContributorNodeSizing } from "./computeContributorNodeSizing.ts";
import { placeLayoutWithElk } from "./placeLayoutWithElk.ts";
import type { ClaimShapeSize, LayoutModel, SiblingOrderingMode } from "./types.ts";

type LayoutDebateConfig = {
    siblingOrderingMode?: SiblingOrderingMode;
    defaultClaimShapeSize: ClaimShapeSize;
    applyConfidenceScale?: boolean;
    applyRelevanceScale?: boolean;
    peerGap: number;
    layerGap: number;
    connectorClaimShapeGap: number;
    favorStraightEdges: boolean;
    bkFixedAlignment?: "NONE" | "BALANCED" | "LEFTUP" | "RIGHTUP" | "LEFTDOWN" | "RIGHTDOWN";
    connectorPathShape: "straight" | "curved" | "sharp-corners" | "elk-bends";
    sourceSideStraightSegmentPercent: number;
    targetSideStraightSegmentPercent: number;
    spreadTargetAnchorY: boolean;
};

export async function layoutDebate(
    calculatedDebate: CalculatedDebate,
    config: LayoutDebateConfig,
): Promise<
    | {
          ok: true;
          layout: LayoutModel;
          render: {
              claimShapeScaleByClaimShapeId: Record<string, number>;
          };
      }
    | {
          ok: false;
          message: string;
      }
> {
    const siblingOrderingMode = config.siblingOrderingMode ?? "auto-reorder";

    const built = buildLayoutModel({
        calculatedDebate,
        cycleMode: "preserve",
        siblingOrderingMode,
    });

    if (!built.ok) {
        return {
            ok: false,
            message: `buildLayoutModel failed: ${built.error.code} ${built.error.message}`,
        };
    }

    const contributorSizing = computeContributorNodeSizing(built.model, {
        applyConfidenceScale: config.applyConfidenceScale,
        applyRelevanceScale: config.applyRelevanceScale,
        defaultClaimShapeSize: config.defaultClaimShapeSize,
    });

    const placed = await placeLayoutWithElk(built.model, {
        siblingOrderingMode,
        defaultClaimShapeSize: config.defaultClaimShapeSize,
        claimShapeSizeByClaimShapeId: contributorSizing.claimShapeSizeByClaimShapeId,
        peerGap: config.peerGap,
        layerGap: config.layerGap,
        connectorClaimShapeGap: config.connectorClaimShapeGap,
        favorStraightEdges: config.favorStraightEdges,
        bkFixedAlignment: config.bkFixedAlignment,
        connectorPathShape: config.connectorPathShape,
        sourceSideStraightSegmentPercent: config.sourceSideStraightSegmentPercent,
        targetSideStraightSegmentPercent: config.targetSideStraightSegmentPercent,
        spreadTargetAnchorY: config.spreadTargetAnchorY,
    });

    if (!placed.ok) {
        return {
            ok: false,
            message: `placeLayoutWithElk failed: ${placed.error.code} ${placed.error.message}`,
        };
    }

    return {
        ok: true,
        layout: placed.model,
        render: {
            claimShapeScaleByClaimShapeId: contributorSizing.claimShapeScaleByClaimShapeId,
        },
    };
}