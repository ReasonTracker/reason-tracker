import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";

type EpisodeFrameProps = {
    background: string;
    children: ReactNode;
    color: string;
    contentStyle?: CSSProperties;
    fontFamily: string;
};

export const EpisodeFrame = ({
    background,
    children,
    color,
    contentStyle,
    fontFamily,
}: EpisodeFrameProps) => {
    return (
        <AbsoluteFill style={{ background, color, fontFamily }}>
            <div style={{ height: "100%", position: "relative", width: "100%", ...contentStyle }}>
                {children}
            </div>
        </AbsoluteFill>
    );
};
