import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import type { ScoreWaveFrame, Snapshot } from "../../../app/src/app.ts";
import {
    renderNodeToHtml,
    renderPlannerSnapshotScene,
    renderScoreWaveFrame,
    type PlannerSnapshotRenderMode,
    type PlannerSnapshotRenderResult,
} from "@reasontracker/components";

type PlannerRenderSurfaceProps = {
    result: PlannerSnapshotRenderResult;
    background?: string;
    fitToFrame?: boolean;
    sceneStyle?: CSSProperties;
    style?: CSSProperties;
};

type PlannerScoreWaveFrameSurfaceProps = {
    frame: ScoreWaveFrame;
    durationInFrames: number;
    background?: string;
    style?: CSSProperties;
};

type PlannerSnapshotSurfaceProps = {
    snapshot: Snapshot;
    mode?: PlannerSnapshotRenderMode;
    percent?: number;
    background?: string;
    style?: CSSProperties;
};

export const PlannerRenderSurface = ({
    result,
    background = "#000000",
    fitToFrame = true,
    sceneStyle,
    style,
}: PlannerRenderSurfaceProps) => {
    const { width: videoWidth, height: videoHeight } = useVideoConfig();
    const sceneWidth = readDimensionPx(result.root.styles?.width, videoWidth);
    const sceneHeight = readDimensionPx(result.root.styles?.height, videoHeight);
    const html = renderNodeToHtml(result.root);

    if (!fitToFrame) {
        return (
            <AbsoluteFill
                style={{
                    background,
                    overflow: "hidden",
                    ...style,
                }}
            >
                <div
                    dangerouslySetInnerHTML={{ __html: html }}
                    style={{
                        height: sceneHeight,
                        left: 0,
                        position: "absolute",
                        top: 0,
                        transformOrigin: "top left",
                        width: sceneWidth,
                        ...sceneStyle,
                    }}
                />
            </AbsoluteFill>
        );
    }

    const scale = Math.min(videoWidth / sceneWidth, videoHeight / sceneHeight);

    return (
        <AbsoluteFill
            style={{
                alignItems: "center",
                background,
                justifyContent: "center",
                overflow: "hidden",
                ...style,
            }}
        >
            <div
                dangerouslySetInnerHTML={{ __html: html }}
                style={{
                    height: sceneHeight,
                    transform: `scale(${scale})`,
                    transformOrigin: "center center",
                    width: sceneWidth,
                    ...sceneStyle,
                }}
            />
        </AbsoluteFill>
    );
};

export const PlannerScoreWaveFrameSurface = ({
    frame,
    durationInFrames,
    background,
    style,
}: PlannerScoreWaveFrameSurfaceProps) => {
    const currentFrame = useCurrentFrame();
    const percent = durationInFrames <= 1
        ? 1
        : interpolate(currentFrame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
        });
    const result = renderScoreWaveFrame({
        frame,
        percent,
    });

    return <PlannerRenderSurface result={result} background={background} style={style} />;
};

export const PlannerSnapshotSurface = ({
    snapshot,
    mode = "order",
    percent = 1,
    background,
    style,
}: PlannerSnapshotSurfaceProps) => {
    const result = renderPlannerSnapshotScene({
        snapshot,
        percent,
        mode,
    });

    return <PlannerRenderSurface result={result} background={background} style={style} />;
};

function readDimensionPx(value: string | number | undefined, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
    }

    if (typeof value === "string") {
        const parsedValue = Number.parseFloat(value);

        if (Number.isFinite(parsedValue) && parsedValue > 0) {
            return parsedValue;
        }
    }

    return Math.max(1, fallback);
}