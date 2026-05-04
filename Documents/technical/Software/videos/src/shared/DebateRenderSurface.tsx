import { AbsoluteFill } from "remotion";

import "./debate-render/debateRender.css";

import { renderDebateSnapshot } from "./debate-render/renderDebateSnapshot";
import { renderNodeToHtml } from "./debate-render/renderTree";
import type { DebateSnapshotRenderState, RenderStepProgress } from "./debate-render/renderTypes";

type DebateRenderSurfaceProps = RenderStepProgress & {
    background?: string;
    renderState: DebateSnapshotRenderState;
};

export const DebateRenderSurface = ({
    background = "var(--bg)",
    renderState,
    stepProgress,
}: DebateRenderSurfaceProps) => {
    const result = renderDebateSnapshot({
        renderState,
        stepProgress,
    });
    const html = renderNodeToHtml(result.root);

    return (
        <AbsoluteFill
            style={{
                background,
                color: "var(--text)",
                fontFamily: "var(--sans)",
                overflow: "hidden",
            }}
        >
            <div
                dangerouslySetInnerHTML={{ __html: html }}
                style={{
                    height: result.height,
                    left: 0,
                    position: "absolute",
                    top: 0,
                    width: result.width,
                }}
            />
        </AbsoluteFill>
    );
};